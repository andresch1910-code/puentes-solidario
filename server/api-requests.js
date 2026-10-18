// Solicitudes de ayuda: registro, listado público, donaciones, compromisos de entrega
// y "Mi solicitud" (acceso de la familia con código + PIN).
import { Router } from 'express';
import { all, get, run, tx, audit } from './db.js';
import { AFFECTATIONS, VULNERABLE, findProvince } from './catalog.js';
import {
  requireUser, requireExpediente, rateLimit, saveImage, httpError, newCode, newPin,
  hashSecret, checkSecret, signToken, pinLocked, pinFailed, pinOk, clean, int, num, normCedula,
} from './security.js';
import { toPublic, needsFor, donationSummary, publicNeed, STATUS_LABELS } from './requests-service.js';

const r = Router();
const AFF_KEYS = AFFECTATIONS.map(a => a.key);
const VUL_KEYS = VULNERABLE.map(v => v.key);
const CLAIM_HOURS = 48;

// Libera compromisos de entrega vencidos (evita que una necesidad quede "tomada" para siempre).
function releaseStaleClaims() {
  run(`UPDATE request_needs SET claimed_by = NULL, claimed_name = NULL, claimed_at = NULL
       WHERE claimed_at IS NOT NULL AND claimed_at < datetime('now', '-${CLAIM_HOURS} hours')`);
}

function parseNeeds(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const n of list.slice(0, 40)) {
    const qty = int(n.quantity, 1, 9999, 1);
    if (n.catalog_id) {
      const c = get('SELECT * FROM needs_catalog WHERE id = ?', int(n.catalog_id));
      if (c) out.push({ catalog_id: c.id, label: c.label, icon: c.icon, unit: c.unit, quantity: qty, detail: clean(n.detail, 200), custom: 0, approved: 1 });
    } else if (clean(n.label, 80)) {
      // Necesidad escrita por la familia: queda pendiente de que un coordinador
      // la apruebe o la asocie al catálogo (evita que el catálogo se ensucie).
      out.push({ catalog_id: null, label: clean(n.label, 80), icon: '📦', unit: clean(n.unit, 20) || 'unidades', quantity: qty, detail: clean(n.detail, 200), custom: 1, approved: 0 });
    }
  }
  return out;
}

function insertNeeds(requestId, needs) {
  const ins = 'INSERT INTO request_needs (request_id, catalog_id, label, icon, unit, quantity, detail, custom, approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
  for (const n of needs) run(ins, requestId, n.catalog_id, n.label, n.icon, n.unit, n.quantity, n.detail, n.custom, n.approved);
}

// ---------- Registro de una familia (por ella misma o por un tercero) ----------
r.post('/requests', rateLimit({ key: 'newreq', max: 6, windowMs: 10 * 60_000 }), (req, res) => {
  const b = req.body || {};
  const prov = findProvince(b.province);
  if (!prov) throw httpError(400, 'Selecciona una provincia o comarca válida.');
  if (!prov.districts[b.district]) throw httpError(400, 'Selecciona un distrito válido.');
  const community = clean(b.community, 80);
  if (!community) throw httpError(400, 'Indica la comunidad, barrio o caserío.');
  const responsible = clean(b.responsible_name, 100);
  if (!responsible) throw httpError(400, 'Indica el nombre de la persona responsable.');
  const cedula = clean(b.cedula, 20);
  if (!cedula || !/^[0-9A-Za-z]{1,3}-?[0-9A-Za-z]{0,4}-[0-9]{1,6}$|^[A-Za-z]{1,2}[0-9]{5,10}$/.test(cedula.replace(/\s/g, ''))) {
    throw httpError(400, 'Indica una cédula válida (ej.: 8-123-4567) o pasaporte.');
  }
  const phone = clean(b.contact_phone, 30);
  if (!phone || phone.replace(/\D/g, '').length < 7) throw httpError(400, 'Indica un teléfono de contacto.');
  const affectations = (Array.isArray(b.affectations) ? b.affectations : []).filter(a => AFF_KEYS.includes(a));
  if (!affectations.length) throw httpError(400, 'Elige al menos un tipo de afectación.');
  const needs = parseNeeds(b.needs);
  if (!needs.length) throw httpError(400, 'Indica al menos una necesidad.');
  if (!b.consent) throw httpError(400, 'Debes autorizar el uso de los datos para verificar la solicitud.');

  const method = ['yappy', 'ach', 'none'].includes(b.payment_method) ? b.payment_method : 'none';
  if (method !== 'none' && (!clean(b.payment_number) || !clean(b.payment_holder))) {
    throw httpError(400, 'Completa el número y el titular para recibir aportes.');
  }
  const idPhoto = b.id_photo ? saveImage(b.id_photo) : null;
  const photos = (Array.isArray(b.photos) ? b.photos.slice(0, 3) : []).map(saveImage);

  const lat = num(b.lat, 5, 10.5), lng = num(b.lng, -83.5, -77);
  const code = (() => { for (;;) { const c = newCode(); if (!get('SELECT 1 FROM requests WHERE code = ?', c)) return c; } })();
  const pin = newPin();
  const thirdParty = b.source === 'third_party';

  const id = tx(() => {
    const info = run(`INSERT INTO requests (code, pin_hash, source, reporter_user_id, reporter_name, reporter_phone,
        province, district, community, lat, lng, address_private, affectations, vulnerable, story,
        family_name, responsible_name, cedula, cedula_norm, adults, minors, contact_phone, notes_private, allow_contact,
        payment_method, payment_number, payment_bank, payment_account_type, payment_holder)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code, hashSecret(pin), thirdParty ? 'third_party' : 'self', req.user?.id ?? null,
      thirdParty ? clean(b.reporter_name, 100) || req.user?.name || null : null,
      thirdParty ? clean(b.reporter_phone, 30) : null,
      prov.name, b.district, community, lat, lng, clean(b.address_private, 300),
      JSON.stringify(affectations), JSON.stringify((Array.isArray(b.vulnerable) ? b.vulnerable : []).filter(v => VUL_KEYS.includes(v))),
      clean(b.story, 1000), clean(b.family_name, 80) || responsible, responsible, cedula, normCedula(cedula),
      int(b.adults, 0, 30, 1), int(b.minors, 0, 30, 0), phone, clean(b.notes_private, 500), b.allow_contact ? 1 : 0,
      method, clean(b.payment_number, 40), clean(b.payment_bank, 60), clean(b.payment_account_type, 20), clean(b.payment_holder, 100));
    const rid = Number(info.lastInsertRowid);
    insertNeeds(rid, needs);
    if (idPhoto) run("INSERT INTO photos (request_id, kind, filename, mime) VALUES (?, 'id', ?, ?)", rid, idPhoto.filename, idPhoto.mime);
    for (const p of photos) run("INSERT INTO photos (request_id, kind, filename, mime) VALUES (?, 'situation', ?, ?)", rid, p.filename, p.mime);
    return rid;
  });
  audit(req.user, 'request.create', 'request', id, { code, source: thirdParty ? 'third_party' : 'self' });
  res.status(201).json({ code, pin, status: 'pending' });
});

// ---------- Listado público (solo verificadas) ----------
r.get('/requests', (req, res) => {
  releaseStaleClaims();
  const where = ["status = 'verified'"];
  const params = [];
  if (req.query.province) { where.push('province = ?'); params.push(String(req.query.province)); }
  if (req.query.district) { where.push('district = ?'); params.push(String(req.query.district)); }
  if (req.query.community) { where.push('lower(community) = lower(?)'); params.push(String(req.query.community)); }
  if (req.query.q) {
    where.push('(community LIKE ? OR story LIKE ? OR code LIKE ?)');
    const q = `%${String(req.query.q).slice(0, 50)}%`;
    params.push(q, q, q);
  }
  let list = all(`SELECT * FROM requests WHERE ${where.join(' AND ')}`, ...params).map(x => toPublic(x));
  if (req.query.need) {
    const nid = int(req.query.need);
    list = list.filter(x => x.needs.some(n => n.category_id === nid && n.missing > 0));
  }
  if (req.query.contact === '1') list = list.filter(x => x.allow_contact);
  if (req.query.store === '1') list = list.filter(x => x.needs.some(n => n.store && !n.purchased));
  const sort = req.query.sort || 'priority';
  if (sort === 'recent') list.sort((a, b) => (b.verified_at || '').localeCompare(a.verified_at || ''));
  else if (sort === 'least_helped') list.sort((a, b) => a.donations.total - b.donations.total || b.priority - a.priority);
  else list.sort((a, b) => b.priority - a.priority);
  const limit = int(req.query.limit, 1, 500, 200);
  res.json({ total: list.length, items: list.slice(0, limit) });
});

function verifiedByCode(code) {
  const row = get("SELECT * FROM requests WHERE code = ? AND status IN ('verified', 'resolved')", String(code).toUpperCase());
  if (!row) throw httpError(404, 'No encontramos una familia verificada con ese código.');
  return row;
}

r.get('/requests/:code', (req, res) => {
  releaseStaleClaims();
  res.json(toPublic(verifiedByCode(req.params.code), { withDetail: true, userId: req.user?.id }));
});

// Datos de pago y contacto: solo para donantes/voluntarios identificados, queda auditado.
r.get('/requests/:code/donor-info', requireUser, rateLimit({ key: 'donorinfo', max: 40 }), (req, res) => {
  const row = verifiedByCode(req.params.code);
  audit(req.user, 'request.view_payment', 'request', row.id);
  const digits = (row.contact_phone || '').replace(/\D/g, '');
  res.json({
    payment: row.payment_approved && row.payment_method !== 'none' ? {
      method: row.payment_method, number: row.payment_number, bank: row.payment_bank,
      account_type: row.payment_account_type, holder: row.payment_holder,
    } : null,
    whatsapp: row.allow_contact && digits ? (digits.length === 8 ? '507' + digits : digits) : null,
  });
});

// Registrar una donación (dinero, especie o compra en tienda).
r.post('/requests/:code/donations', requireUser, rateLimit({ key: 'donate', max: 20 }), (req, res) => {
  const row = verifiedByCode(req.params.code);
  const b = req.body || {};
  const kind = ['money', 'goods', 'purchase'].includes(b.kind) ? b.kind : 'money';
  const amount = num(b.amount, 0, 100000) ?? 0;
  if (kind === 'money' && amount <= 0) throw httpError(400, 'Indica el monto enviado.');
  const info = run(`INSERT INTO donations (request_id, donor_user_id, donor_name, kind, amount, method, reference, message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, row.id, req.user.id, b.anonymous ? null : req.user.name, kind, amount,
    clean(b.method, 20), clean(b.reference, 60), clean(b.message, 300));
  audit(req.user, 'donation.create', 'request', row.id, { amount, kind });
  res.status(201).json({ id: Number(info.lastInsertRowid), summary: donationSummary(row.id) });
});

// Comprometerse a llevar una necesidad (evita que varios voluntarios lleven lo mismo).
r.post('/needs/:id/claim', requireUser, (req, res) => {
  releaseStaleClaims();
  const n = get(`SELECT n.*, r.status FROM request_needs n JOIN requests r ON r.id = n.request_id WHERE n.id = ?`, int(req.params.id));
  if (!n || n.status !== 'verified') throw httpError(404, 'Necesidad no encontrada.');
  if (n.claimed_by && n.claimed_by !== req.user.id) throw httpError(409, `Ya ${n.claimed_name?.split(' ')[0] || 'alguien'} se comprometió a llevarlo.`);
  run("UPDATE request_needs SET claimed_by = ?, claimed_name = ?, claimed_at = datetime('now') WHERE id = ?", req.user.id, req.user.name, n.id);
  audit(req.user, 'need.claim', 'need', n.id);
  res.json(publicNeed(get('SELECT * FROM request_needs WHERE id = ?', n.id), req.user.id));
});

r.post('/needs/:id/unclaim', requireUser, (req, res) => {
  const n = get('SELECT * FROM request_needs WHERE id = ?', int(req.params.id));
  if (!n) throw httpError(404, 'Necesidad no encontrada.');
  if (n.claimed_by !== req.user.id && !['coordinator', 'admin'].includes(req.user.role)) throw httpError(403, 'Solo quien se comprometió puede liberarla.');
  run('UPDATE request_needs SET claimed_by = NULL, claimed_name = NULL, claimed_at = NULL WHERE id = ?', n.id);
  res.json(publicNeed(get('SELECT * FROM request_needs WHERE id = ?', n.id), req.user.id));
});

// El voluntario reporta que entregó (la familia lo confirma luego en "Mi solicitud").
r.post('/needs/:id/delivered', requireUser, (req, res) => {
  const n = get('SELECT * FROM request_needs WHERE id = ?', int(req.params.id));
  if (!n) throw httpError(404, 'Necesidad no encontrada.');
  const qty = int(req.body?.quantity, 1, n.quantity, n.quantity - n.fulfilled);
  run(`UPDATE request_needs SET fulfilled = MIN(quantity, fulfilled + ?), claimed_by = NULL, claimed_name = NULL, claimed_at = NULL WHERE id = ?`, qty, n.id);
  run(`INSERT INTO donations (request_id, donor_user_id, donor_name, kind, amount, method, reference, message)
       VALUES (?, ?, ?, 'goods', 0, 'entrega', ?, ?)`, n.request_id, req.user.id, req.user.name, `${qty} ${n.unit}`, `Entregó: ${n.label}`);
  audit(req.user, 'need.delivered', 'need', n.id, { qty });
  res.json(publicNeed(get('SELECT * FROM request_needs WHERE id = ?', n.id), req.user.id));
});

// Compra en tienda: el donante paga en la tienda y registra la factura.
r.post('/needs/:id/purchase', requireUser, (req, res) => {
  const n = get('SELECT * FROM request_needs WHERE id = ?', int(req.params.id));
  if (!n || !n.store) throw httpError(404, 'Este artículo no está habilitado para compra en tienda.');
  if (n.purchased_at) throw httpError(409, 'Este artículo ya fue comprado.');
  const ref = clean(req.body?.reference, 60);
  if (!ref) throw httpError(400, 'Indica el número de factura u orden.');
  run("UPDATE request_needs SET purchased_by = ?, purchase_ref = ?, purchased_at = datetime('now'), fulfilled = quantity WHERE id = ?", req.user.name, ref, n.id);
  run(`INSERT INTO donations (request_id, donor_user_id, donor_name, kind, amount, method, reference, message)
       VALUES (?, ?, ?, 'purchase', ?, 'tienda', ?, ?)`, n.request_id, req.user.id, req.user.name, num(req.body?.amount, 0, 100000) ?? 0, ref, `Compra: ${n.label} en ${n.store}`);
  audit(req.user, 'need.purchase', 'need', n.id, { ref });
  res.json(publicNeed(get('SELECT * FROM request_needs WHERE id = ?', n.id), req.user.id));
});

// ---------- Mi solicitud (familia) ----------
r.post('/expediente/login', rateLimit({ key: 'pin', max: 15 }), (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const pin = String(req.body?.pin || '').trim();
  if (pinLocked(code)) throw httpError(429, 'Demasiados intentos. Espera 15 minutos.');
  const row = get('SELECT code, pin_hash FROM requests WHERE code = ?', code);
  if (!row || !checkSecret(pin, row.pin_hash)) {
    pinFailed(code);
    throw httpError(401, 'Código o PIN incorrecto.');
  }
  pinOk(code);
  res.json({ token: signToken({ t: 'exp', code }, 60 * 60 * 12) });
});

// Consulta de estado solo con código (sin datos privados).
r.get('/expediente/status/:code', rateLimit({ key: 'status', max: 30 }), (req, res) => {
  const row = get('SELECT code, status, created_at, verified_at FROM requests WHERE code = ?', String(req.params.code).toUpperCase());
  if (!row) throw httpError(404, 'No existe una solicitud con ese código.');
  res.json({ ...row, status_label: STATUS_LABELS[row.status] });
});

const myRequest = (req) => get('SELECT * FROM requests WHERE code = ?', req.expediente);

r.get('/expediente', requireExpediente, (req, res) => {
  const row = myRequest(req);
  if (!row) throw httpError(404, 'Solicitud no encontrada.');
  res.json({
    code: row.code, status: row.status, status_label: STATUS_LABELS[row.status], status_note: row.status_note,
    province: row.province, district: row.district, community: row.community,
    family_name: row.family_name, adults: row.adults, minors: row.minors, story: row.story,
    allow_contact: !!row.allow_contact, payment_method: row.payment_method, payment_approved: !!row.payment_approved,
    created_at: row.created_at, verified_at: row.verified_at,
    needs: needsFor(row.id, { onlyApproved: false }).map(n => ({ ...publicNeed(n), approved: !!n.approved })),
    messages: all('SELECT sender, author_name, body, created_at FROM messages WHERE request_id = ? ORDER BY id', row.id),
    donations: all('SELECT id, donor_name, kind, amount, method, reference, message, confirmed, created_at FROM donations WHERE request_id = ? ORDER BY id DESC', row.id),
  });
});

r.post('/expediente/messages', requireExpediente, rateLimit({ key: 'expmsg', max: 20 }), (req, res) => {
  const row = myRequest(req);
  const body = clean(req.body?.body, 1000);
  if (!body) throw httpError(400, 'Escribe un mensaje.');
  run("INSERT INTO messages (request_id, sender, author_name, body) VALUES (?, 'family', ?, ?)", row.id, row.family_name, body);
  // Si el coordinador pidió más información, la respuesta la devuelve a la cola de revisión.
  if (row.status === 'needs_info') run("UPDATE requests SET status = 'pending', updated_at = datetime('now') WHERE id = ?", row.id);
  res.status(201).json({ ok: true });
});

r.patch('/expediente', requireExpediente, (req, res) => {
  const row = myRequest(req);
  const b = req.body || {};
  if ('allow_contact' in b) run('UPDATE requests SET allow_contact = ? WHERE id = ?', b.allow_contact ? 1 : 0, row.id);
  if (b.story_update) {
    const extra = clean(b.story_update, 500);
    run("INSERT INTO messages (request_id, sender, author_name, body) VALUES (?, 'family', ?, ?)", row.id, row.family_name, `Actualización: ${extra}`);
  }
  run("UPDATE requests SET updated_at = datetime('now') WHERE id = ?", row.id);
  res.json({ ok: true });
});

r.post('/expediente/needs', requireExpediente, (req, res) => {
  const row = myRequest(req);
  const needs = parseNeeds(req.body?.needs);
  if (!needs.length) throw httpError(400, 'Indica al menos una necesidad.');
  // Toda necesidad agregada después de registrar pasa por revisión del coordinador.
  insertNeeds(row.id, needs.map(n => ({ ...n, approved: 0 })));
  audit(null, 'expediente.add_needs', 'request', row.id, { count: needs.length });
  res.status(201).json({ ok: true, note: 'Las nuevas necesidades se publican cuando un coordinador las revisa.' });
});

// La familia confirma lo que recibió: transparencia real para los donantes.
r.post('/expediente/donations/:id/confirm', requireExpediente, (req, res) => {
  const row = myRequest(req);
  const d = get('SELECT * FROM donations WHERE id = ? AND request_id = ?', int(req.params.id), row.id);
  if (!d) throw httpError(404, 'Donación no encontrada.');
  const confirmed = req.body?.confirmed === false ? 0 : 1;
  run("UPDATE donations SET confirmed = ?, confirmed_at = CASE WHEN ? = 1 THEN datetime('now') END WHERE id = ?", confirmed, confirmed, d.id);
  res.json({ ok: true });
});

r.post('/expediente/needs/:id/received', requireExpediente, (req, res) => {
  const row = myRequest(req);
  const n = get('SELECT * FROM request_needs WHERE id = ? AND request_id = ?', int(req.params.id), row.id);
  if (!n) throw httpError(404, 'Necesidad no encontrada.');
  const qty = int(req.body?.fulfilled, 0, n.quantity, n.quantity);
  run('UPDATE request_needs SET fulfilled = ? WHERE id = ?', qty, n.id);
  res.json({ ok: true });
});

export default r;
