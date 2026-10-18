// Puente Solidario — servidor principal.
// Funciona en Windows, macOS y Linux con Node.js 22.13 o superior.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROOT, UPLOAD_DIR, get } from './db.js';
import { attachUser, httpError } from './security.js';
import requestsApi from './api-requests.js';
import communityApi from './api-community.js';
import adminApi from './api-admin.js';
import { seedIfEmpty, ensureAdmin, lockDemoAccounts } from './seed.js';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Se necesita Node.js 22.13 o superior (tienes ${process.versions.node}). Descárgalo en https://nodejs.org`);
  process.exit(1);
}

const PRODUCTION = process.env.NODE_ENV === 'production';
// En producción no se cargan datos de demostración (salvo que se pida con SEED_DEMO=1).
if (process.env.SEED_DEMO === '1' || (!PRODUCTION && process.env.SEED_DEMO !== '0')) seedIfEmpty();
// Crea la cuenta de administración desde variables de entorno (ADMIN_EMAIL / ADMIN_PASSWORD).
ensureAdmin();
// Las cuentas de prueba tienen contraseñas públicas: en producción se desactivan siempre.
if (PRODUCTION) lockDemoAccounts();

const app = express();
app.disable('x-powered-by');
// Detrás de un proxy (Render, Railway, Nginx…) usa TRUST_PROXY=1 para ver la IP real del visitante.
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : 'loopback');
if (PRODUCTION) {
  app.use((req, res, next) => {
    res.set('Strict-Transport-Security', 'max-age=31536000');
    if (req.headers['x-forwarded-proto'] === 'http') return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    next();
  });
}

// Cabeceras de seguridad.
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
      "connect-src 'self'",
      "font-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  });
  next();
});

app.use(express.json({ limit: '20mb' }));
app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api', requestsApi);
app.use('/api', communityApi);
app.use('/api', adminApi);

// Fotos públicas: solo las de situación, aprobadas y de familias verificadas.
app.get('/api/photos/:id', (req, res) => {
  const p = get(`SELECT p.* FROM photos p JOIN requests r ON r.id = p.request_id
    WHERE p.id = ? AND p.kind = 'situation' AND p.approved = 1 AND r.status IN ('verified', 'resolved')`, Number(req.params.id) || 0);
  if (!p) throw httpError(404, 'Foto no disponible.');
  res.type(p.mime).set('Cache-Control', 'public, max-age=3600').send(fs.readFileSync(path.join(UPLOAD_DIR, path.basename(p.filename))));
});

app.use('/api', (_req, _res) => { throw httpError(404, 'Ruta no encontrada.'); });

// Librerías del mapa servidas localmente (no dependen de un CDN).
app.use('/vendor/leaflet', express.static(path.join(ROOT, 'node_modules', 'leaflet', 'dist'), { maxAge: '7d' }));
app.use('/vendor/markercluster', express.static(path.join(ROOT, 'node_modules', 'leaflet.markercluster', 'dist'), { maxAge: '7d' }));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));

// Errores: mensajes claros en español, sin filtrar detalles internos.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Los archivos son demasiado grandes.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Datos con formato no válido.' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Ocurrió un error inesperado. Intenta de nuevo.' : err.message });
});

const PORT = Number(process.env.PORT) || 3737;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address;
  console.log('\n  🤝 Puente Solidario está funcionando\n');
  console.log(`  En esta computadora:  http://puentesolidario.localhost:${PORT}`);
  console.log(`  (si tu navegador no la abre: http://127.0.0.1:${PORT})`);
  if (lan && HOST === '0.0.0.0') console.log(`  En tu red (celular):  http://${lan}:${PORT}`);
  console.log('\n  Para detenerlo presiona Ctrl + C\n');
});
