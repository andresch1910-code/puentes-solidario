// Autenticación, tokens firmados, límites de peticiones y carga segura de imágenes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, UPLOAD_DIR, get } from './db.js';

// ---- Secreto para firmar tokens (se genera una vez y se guarda en data/) ----
const SECRET_FILE = path.join(DATA_DIR, '.secret');
const SECRET = process.env.APP_SECRET || (() => {
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  return s;
})();

// ---- Contraseñas y PIN (scrypt) ----
export function hashSecret(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
export function checkSecret(plain, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(plain), salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

// ---- Tokens firmados (HMAC-SHA256) ----
const b64 = (s) => Buffer.from(s).toString('base64url');
export function signToken(payload, ttlSeconds = 60 * 60 * 24 * 30) {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (data.exp < Date.now() / 1000) return null;
    return data;
  } catch { return null; }
}

// ---- Middlewares ----
export function attachUser(req, _res, next) {
  const h = req.headers.authorization || '';
  const data = verifyToken(h.startsWith('Bearer ') ? h.slice(7) : null);
  req.user = null;
  req.expediente = null;
  if (data?.t === 'user') {
    const u = get('SELECT id, name, email, role, phone, organization, active FROM users WHERE id = ?', data.uid);
    if (u && u.active) req.user = u;
  } else if (data?.t === 'exp') {
    req.expediente = data.code;
  }
  next();
}

export const requireUser = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Inicia sesión para continuar.' });

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
  next();
};
export const requireCoordinator = requireRole('coordinator', 'admin');

export const requireExpediente = (req, res, next) =>
  req.expediente ? next() : res.status(401).json({ error: 'Ingresa tu código y PIN.' });

// ---- Límite de peticiones en memoria ----
const buckets = new Map();
export function rateLimit({ windowMs = 60_000, max = 30, key = 'g' } = {}) {
  return (req, res, next) => {
    const id = `${key}:${req.ip}`;
    const now = Date.now();
    const arr = (buckets.get(id) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' });
    }
    arr.push(now);
    buckets.set(id, arr);
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of buckets) if (!arr.some(t => now - t < 3_600_000)) buckets.delete(k);
}, 600_000).unref();

// Bloqueo por intentos fallidos de PIN (evita adivinar el PIN de un expediente).
const pinFails = new Map();
export function pinLocked(code) {
  const f = pinFails.get(code);
  return f && f.count >= 5 && Date.now() - f.last < 15 * 60_000;
}
export function pinFailed(code) {
  const f = pinFails.get(code) || { count: 0, last: 0 };
  if (Date.now() - f.last > 15 * 60_000) f.count = 0;
  f.count++; f.last = Date.now();
  pinFails.set(code, f);
}
export const pinOk = (code) => pinFails.delete(code);

// ---- Imágenes (llegan como data URL, ya comprimidas por el navegador) ----
const SIGNATURES = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
};
export function saveImage(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw httpError(400, 'Formato de imagen no válido (usa JPG, PNG o WEBP).');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4 * 1024 * 1024) throw httpError(400, 'La imagen supera 4 MB.');
  const ok = SIGNATURES[m[1]].some(sig => sig.every((b, i) => buf[i] === b));
  if (!ok) throw httpError(400, 'El archivo no parece una imagen válida.');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[m[1]];
  const filename = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
  return { filename, mime: m[1] };
}

// ---- Utilidades ----
export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode() {
  let s = 'PA-';
  for (let i = 0; i < 5; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return s;
}
export const newPin = () => String(crypto.randomInt(100000, 1000000));

/** Limpia texto libre: recorta, colapsa espacios y limita longitud. */
export function clean(v, max = 500) {
  if (v == null) return null;
  const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  return s ? s.slice(0, max) : null;
}
export const int = (v, min = 0, max = 1e6, def = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
export const num = (v, min = 0, max = 1e9) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
export const normCedula = (c) => (c ? String(c).toUpperCase().replace(/[^0-9A-Z]/g, '') : null);
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
