// Panel de coordinación: verificación de solicitudes, moderación, visitas, usuarios y auditoría.
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, audit, UPLOAD_DIR, parseJSON } from './db.js';
import { requireCoordinator, requireRole, httpError, clean, int } from './security.js';
import { toPrivate, toPublic, STATUS_LABELS, publicFamilyName } from './requests-service.js';

const r = Router();
r.use('/admin', requireCoordinator);

r.get('/admin/summary', (_req, res) => {
  res.json({
    by_status: Object.fromEntries(all('SELECT status, COUNT(*) AS n FROM requests GROUP BY status').map(x => [x.status, x.n])),
    pending_visits: get("SELECT COUNT(*) AS n FROM visits WHERE status = 'pending'").n,
    custom_needs: get("SELECT COUNT(*) AS n FROM request_needs n JOIN requests r ON r.id = n.request_id WHERE n.approved = 0 AND r.status <> 'rejected'").n,
    pending_photos: get("SELECT COUNT(*) AS n FROM photos p JOIN requests r ON r.id = p.request_id WHERE p.kind = 'situation' AND p.approved = 0 AND r.status = 'verified'").n,
    pending_centers: get('SELECT COUNT(*) AS n FROM centers WHERE verified = 0').n,
    unanswered: get(`SELECT COUNT(*) AS n FROM requests r WHERE (SELECT sender FROM messages m WHERE m.request_id = r.id ORDER BY id DESC LIMIT 1) = 'family'`).n,
  });
});

// Cola de solicitudes: incluye datos privados y señales de duplicado.
r.get('/admin/requests', (req, res) => {
  const status = String(req.query.status || 'pending');
  const params = [];
  let where = '1=1';
  if (status !== 'all') { where += ' AND status = ?'; params.push(status); }
  if (req.query.province) { where += ' AND province = ?'; params.push(String(req.query.province)); }
  if (req.query.q) {
    const q = `%${String(req.query.q).slice(0, 50)}%`;
    where += ' AND (code LIKE ? OR community LIKE ? OR responsible_name LIKE ? OR cedula LIKE ? OR contact_phone LIKE ?)';
    params.push(q, q, q, q, q);
  }
  const rows = all(`SELECT * FROM requests WHERE ${where} ORDER BY created_at ASC LIMIT 300`, ...params);
  res.json(rows.map(x => {
    const pub = toPublic(x);
    const dup = x.cedula_norm ? get('SELECT COUNT(*) AS n FROM requests WHERE cedula_norm = ? AND id <> ?', x.cedula_norm, x.id).n : 0;
    const last = get('SELECT sender FROM messages WHERE request_id = ? ORDER BY id DESC LIMIT 1', x.id);
    return { ...pub, id: x.id, responsible_name: x.responsible_name, contact_phone: x.contact_phone, source: x.source,
      duplicates: dup, awaiting_reply: last?.sender === 'family', updated_at: x.updated_at };
  }));
});

r.get('/admin/requests/:id', (req, res) => {
  const row = get('SELECT * FROM requests WHERE id = ?', int(req.params.id));
  if (!row) throw httpError(404, 'Solicitud no encontrada.');
  audit(req.user, 'request.view_private', 'request', row.id);
  res.json({ ...toPrivate(row), audit: all("SELECT * FROM audit WHERE entity = 'request' AND entity_id = ? ORDER BY id DESC LIMIT 30", row.id) });
});

r.post('/admin/requests/:id/status', (req, res) => {
  const row = get('SELECT * FROM requests WHERE id = ?', int(req.params.id));
  if (!row) throw httpError(404, 'Solicitud no encontrada.');
  const status = req.body?.status;
  if (!STATUS_LABELS[status]) throw httpError(400, 'Estado no válido.');
  const note = clean(req.body?.note, 1000);
  if (['needs_info', 'rejected'].includes(status) && !note) throw httpError(400, 'Explica el motivo a la familia.');
  run(`UPDATE requests SET status = ?, status_note = ?, coordinator_id = ?, updated_at = datetime('now'),
       verified_at = CASE WHEN ? = 'verified' AND verified_at IS NULL THEN datetime('now') ELSE verified_at END WHERE id = ?`,
  status, note, req.user.id, status, row.id);
  if (status === 'verified' && req.body?.approve_payment !== false) run('UPDATE requests SET payment_approved = 1 WHERE id = ?', row.id);
  if (status === 'verified' && req.body?.approve_photos) run("UPDATE photos SET approved = 1 WHERE request_id = ? AND kind = 'situation'", row.id);
  if (note) run("INSERT INTO messages (request_id, sender, author_name, body) VALUES (?, 'coordinator', ?, ?)", row.id, req.user.name, note);
  audit(req.user, `request.${status}`, 'request', row.id, note);
  res.json(toPrivate(get('SELECT * FROM requests WHERE id = ?', row.id)));
});

r.patch('/admin/requests/:id', (req, res) => {
  const row = get('SELECT * FROM requests WHERE id = ?', int(req.params.id));
  if (!row) throw httpError(404, 'Solicitud no encontrada.');
  const b = req.body || {};
  const fields = {
    story: (v) => clean(v, 1000), community: (v) => clean(v, 80), family_name: (v) => clean(v, 80),
    adults: (v) => int(v, 0, 30, row.adults), minors: (v) => int(v, 0, 30, row.minors),
    payment_approved: (v) => (v ? 1 : 0), allow_contact: (v) => (v ? 1 : 0),
    payment_number: (v) => clean(v, 40), payment_holder: (v) => clean(v, 100), notes_private: (v) => clean(v, 500),
  };
  const changed = [];
  for (const [k, fn] of Object.entries(fields)) {
    if (k in b) { run(`UPDATE requests SET ${k} = ? WHERE id = ?`, fn(b[k]), row.id); changed.push(k); }
  }
  run("UPDATE requests SET updated_at = datetime('now') WHERE id = ?", row.id);
  audit(req.user, 'request.edit', 'request', row.id, changed);
  res.json(toPrivate(get('SELECT * FROM requests WHERE id = ?', row.id)));
});

r.post('/admin/requests/:id/messages', (req, res) => {
  const row = get('SELECT id FROM requests WHERE id = ?', int(req.params.id));
  if (!row) throw httpError(404, 'Solicitud no encontrada.');
  const body = clean(req.body?.body, 1000);
  if (!body) throw httpError(400, 'Escribe un mensaje.');
  run("INSERT INTO messages (request_id, sender, author_name, body) VALUES (?, 'coordinator', ?, ?)", row.id, req.user.name, body);
  res.status(201).json({ ok: true });
});

// Necesidades: aprobar, asociar al catálogo, editar cantidades o habilitar compra en tienda.
r.patch('/admin/needs/:id', (req, res) => {
  const n = get('SELECT * FROM request_needs WHERE id = ?', int(req.params.id));
  if (!n) throw httpError(404, 'Necesidad no encontrada.');
  const b = req.body || {};
  if (b.catalog_id) {
    const c = get('SELECT * FROM needs_catalog WHERE id = ?', int(b.catalog_id));
    if (!c) throw httpError(400, 'Categoría no válida.');
    run('UPDATE request_needs SET catalog_id = ?, label = ?, icon = ?, unit = ?, detail = COALESCE(detail, ?), custom = 0, approved = 1 WHERE id = ?',
      c.id, c.label, c.icon, c.unit, n.custom ? n.label : null, n.id);
  }
  if ('approved' in b) run('UPDATE request_needs SET approved = ? WHERE id = ?', b.approved ? 1 : 0, n.id);
  if ('quantity' in b) run('UPDATE request_needs SET quantity = ? WHERE id = ?', int(b.quantity, 1, 9999, n.quantity), n.id);
  if ('fulfilled' in b) run('UPDATE request_needs SET fulfilled = ? WHERE id = ?', int(b.fulfilled, 0, 9999, n.fulfilled), n.id);
  if ('store' in b) run('UPDATE request_needs SET store = ?, store_branch = ? WHERE id = ?', clean(b.store, 60), clean(b.store_branch, 100), n.id);
  audit(req.user, 'need.edit', 'need', n.id, Object.keys(b));
  res.json(get('SELECT * FROM request_needs WHERE id = ?', n.id));
});

r.delete('/admin/needs/:id', (req, res) => {
  run('DELETE FROM request_needs WHERE id = ?', int(req.params.id));
  audit(req.user, 'need.delete', 'need', int(req.params.id));
  res.json({ ok: true });
});

r.get('/admin/custom-needs', (_req, res) => {
  res.json(all(`SELECT n.*, r.code, r.community, r.status AS request_status FROM request_needs n JOIN requests r ON r.id = n.request_id
    WHERE n.approved = 0 AND r.status <> 'rejected' ORDER BY n.id DESC LIMIT 200`));
});

// Fotos privadas (cédula y fotos sin aprobar): solo coordinadores.
r.get('/admin/photos/:id', (req, res) => {
  const p = get('SELECT * FROM photos WHERE id = ?', int(req.params.id));
  if (!p) throw httpError(404, 'Foto no encontrada.');
  if (p.kind === 'id') audit(req.user, 'photo.view_id', 'request', p.request_id);
  res.type(p.mime).set('Cache-Control', 'private, no-store').send(fs.readFileSync(path.join(UPLOAD_DIR, path.basename(p.filename))));
});

r.post('/admin/photos/:id', (req, res) => {
  const p = get("SELECT * FROM photos WHERE id = ? AND kind = 'situation'", int(req.params.id));
  if (!p) throw httpError(404, 'Foto no encontrada.');
  run('UPDATE photos SET approved = ? WHERE id = ?', req.body?.approved ? 1 : 0, p.id);
  audit(req.user, 'photo.moderate', 'request', p.request_id, { photo: p.id, approved: !!req.body?.approved });
  res.json({ ok: true });
});

// Visitas de voluntarios pendientes de aprobación.
r.get('/admin/visits', (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  res.json(all('SELECT * FROM visits WHERE status = ? ORDER BY id DESC LIMIT 200', status).map(v => ({ ...v, aid_types: parseJSON(v.aid_types) })));
});

r.post('/admin/visits/:id', (req, res) => {
  const status = ['approved', 'rejected'].includes(req.body?.status) ? req.body.status : null;
  if (!status) throw httpError(400, 'Estado no válido.');
  run('UPDATE visits SET status = ? WHERE id = ?', status, int(req.params.id));
  audit(req.user, `visit.${status}`, 'visit', int(req.params.id));
  res.json({ ok: true });
});

// Usuarios y roles (solo administradores cambian roles).
r.get('/admin/users', (req, res) => {
  const q = req.query.q ? `%${String(req.query.q).slice(0, 50)}%` : '%';
  res.json(all(`SELECT id, name, email, phone, role, province, organization, skills, has_vehicle, active, created_at FROM users
    WHERE name LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT 200`, q, q).map(u => ({ ...u, skills: parseJSON(u.skills) })));
});

r.patch('/admin/users/:id', requireRole('admin'), (req, res) => {
  const u = get('SELECT * FROM users WHERE id = ?', int(req.params.id));
  if (!u) throw httpError(404, 'Usuario no encontrado.');
  if (u.id === req.user.id) throw httpError(400, 'No puedes cambiar tu propio rol.');
  const role = ['volunteer', 'coordinator', 'admin'].includes(req.body?.role) ? req.body.role : u.role;
  const active = 'active' in (req.body || {}) ? (req.body.active ? 1 : 0) : u.active;
  run('UPDATE users SET role = ?, active = ? WHERE id = ?', role, active, u.id);
  audit(req.user, 'user.update', 'user', u.id, { role, active });
  res.json({ ok: true });
});

r.get('/admin/audit', (_req, res) => {
  res.json(all('SELECT * FROM audit ORDER BY id DESC LIMIT 200'));
});

// Exportar solicitudes verificadas en CSV (para coordinar con autoridades).
r.get('/admin/export.csv', (req, res) => {
  const rows = all("SELECT * FROM requests WHERE status IN ('verified', 'resolved') ORDER BY province, district, community");
  const esc = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // evita inyección de fórmulas en Excel
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ['codigo', 'estado', 'provincia', 'distrito', 'comunidad', 'familia', 'adultos', 'menores', 'afectaciones', 'necesidades_pendientes', 'prioridad', 'verificada'];
  const lines = rows.map(x => {
    const p = toPublic(x);
    return [p.code, p.status_label, p.province, p.district, p.community, publicFamilyName(x.family_name), p.adults, p.minors,
      p.affectations.join('; '), p.needs.filter(n => n.missing).map(n => `${n.label} (${n.missing} ${n.unit})`).join('; '),
      p.priority_level.label, p.verified_at].map(esc).join(',');
  });
  audit(req.user, 'export.csv', null, null, { rows: rows.length });
  res.type('text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="solicitudes-verificadas.csv"')
    .send('﻿' + [header.join(','), ...lines].join('\r\n'));
});

export default r;
