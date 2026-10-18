// Comunidad: cuentas, voluntariado (visitas y misiones), centros, información oficial,
// mapa, cobertura y estadísticas públicas.
import { Router } from 'express';
import { all, get, run, audit, parseJSON } from './db.js';
import {
  PROVINCES, NEEDS_CATALOG, AFFECTATIONS, VULNERABLE, SKILLS, MISSION_CATEGORIES, CENTER_TYPES,
  ALERT_LEVELS, EMERGENCY_NUMBERS, OFFICIAL_SOURCES, SAFETY_GUIDES, findProvince, fallbackCoords, blurCoords,
} from './catalog.js';
import {
  requireUser, requireCoordinator, rateLimit, httpError, hashSecret, checkSecret, signToken,
  clean, int, num, isEmail,
} from './security.js';
import { toPublic } from './requests-service.js';

const r = Router();

// ---------- Catálogos para el frontend ----------
r.get('/meta', (_req, res) => {
  res.json({
    provinces: PROVINCES.map(p => ({ name: p.name, center: p.center, districts: Object.keys(p.districts) })),
    needs: all('SELECT id, key, label, icon, unit, category FROM needs_catalog ORDER BY sort'),
    affectations: AFFECTATIONS.map(({ key, label }) => ({ key, label })),
    vulnerable: VULNERABLE.map(({ key, label }) => ({ key, label })),
    skills: SKILLS, missionCategories: MISSION_CATEGORIES, centerTypes: CENTER_TYPES, alertLevels: ALERT_LEVELS,
    emergency: EMERGENCY_NUMBERS, sources: OFFICIAL_SOURCES, guides: SAFETY_GUIDES,
    catalogSize: NEEDS_CATALOG.length,
    demo: !!get("SELECT 1 FROM users WHERE email = 'coordinador@puentesolidario.test' AND active = 1"),
  });
});

// ---------- Cuentas ----------
function userOut(u) {
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, province: u.province, district: u.district,
    organization: u.organization, skills: parseJSON(u.skills), availability: u.availability, has_vehicle: !!u.has_vehicle,
    created_at: u.created_at,
  };
}

r.post('/auth/register', rateLimit({ key: 'register', max: 5, windowMs: 10 * 60_000 }), (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80);
  const email = clean(b.email, 120)?.toLowerCase();
  if (!name) throw httpError(400, 'Indica tu nombre.');
  if (!isEmail(email)) throw httpError(400, 'Indica un correo válido.');
  if (!b.password || String(b.password).length < 8) throw httpError(400, 'La contraseña debe tener al menos 8 caracteres.');
  if (get('SELECT 1 FROM users WHERE email = ?', email)) throw httpError(409, 'Ya existe una cuenta con ese correo.');
  const skills = (Array.isArray(b.skills) ? b.skills : []).filter(s => SKILLS.includes(s));
  const prov = findProvince(b.province) ? b.province : null;
  const info = run(`INSERT INTO users (name, email, phone, password_hash, province, district, organization, skills, availability, has_vehicle)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, name, email, clean(b.phone, 30), hashSecret(b.password), prov,
    prov ? clean(b.district, 60) : null, clean(b.organization, 100), JSON.stringify(skills), clean(b.availability, 60), b.has_vehicle ? 1 : 0);
  const u = get('SELECT * FROM users WHERE id = ?', info.lastInsertRowid);
  audit(u, 'user.register', 'user', u.id);
  res.status(201).json({ token: signToken({ t: 'user', uid: u.id }), user: userOut(u) });
});

r.post('/auth/login', rateLimit({ key: 'login', max: 10 }), (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const u = get('SELECT * FROM users WHERE email = ?', email);
  if (!u || !u.active || !checkSecret(req.body?.password || '', u.password_hash)) throw httpError(401, 'Correo o contraseña incorrectos.');
  res.json({ token: signToken({ t: 'user', uid: u.id }), user: userOut(u) });
});

r.get('/auth/me', requireUser, (req, res) => res.json(userOut(get('SELECT * FROM users WHERE id = ?', req.user.id))));

r.patch('/auth/me', requireUser, (req, res) => {
  const b = req.body || {};
  const u = get('SELECT * FROM users WHERE id = ?', req.user.id);
  const skills = Array.isArray(b.skills) ? b.skills.filter(s => SKILLS.includes(s)) : parseJSON(u.skills);
  const prov = b.province === undefined ? u.province : (findProvince(b.province) ? b.province : null);
  run(`UPDATE users SET name = ?, phone = ?, province = ?, district = ?, organization = ?, skills = ?, availability = ?, has_vehicle = ? WHERE id = ?`,
    clean(b.name, 80) || u.name, b.phone === undefined ? u.phone : clean(b.phone, 30), prov,
    b.district === undefined ? u.district : clean(b.district, 60),
    b.organization === undefined ? u.organization : clean(b.organization, 100), JSON.stringify(skills),
    b.availability === undefined ? u.availability : clean(b.availability, 60),
    b.has_vehicle === undefined ? u.has_vehicle : (b.has_vehicle ? 1 : 0), u.id);
  res.json(userOut(get('SELECT * FROM users WHERE id = ?', u.id)));
});

// Panel del voluntario: su impacto y recomendaciones según habilidades y zona.
r.get('/my', requireUser, (req, res) => {
  const u = get('SELECT * FROM users WHERE id = ?', req.user.id);
  const visits = all('SELECT * FROM visits WHERE user_id = ? ORDER BY visit_date DESC', u.id);
  const missions = all(`SELECT m.*, s.attended FROM mission_signups s JOIN missions m ON m.id = s.mission_id
    WHERE s.user_id = ? ORDER BY m.starts_at`, u.id);
  const claims = all(`SELECT n.id, n.label, n.icon, n.quantity, n.fulfilled, n.unit, n.claimed_at, r.code, r.community, r.province
    FROM request_needs n JOIN requests r ON r.id = n.request_id WHERE n.claimed_by = ?`, u.id);
  const donations = all(`SELECT d.*, r.code, r.community FROM donations d JOIN requests r ON r.id = d.request_id
    WHERE d.donor_user_id = ? ORDER BY d.id DESC`, u.id);
  const approved = visits.filter(v => v.status === 'approved');
  const skills = parseJSON(u.skills);
  const suggestedMissions = all(`SELECT m.*, (SELECT COUNT(*) FROM mission_signups s WHERE s.mission_id = m.id) AS taken
      FROM missions m WHERE m.status = 'open' AND m.starts_at >= date('now', '-1 day')
      AND m.id NOT IN (SELECT mission_id FROM mission_signups WHERE user_id = ?)`, u.id)
    .map(m => {
      const need = parseJSON(m.skills);
      const match = need.filter(s => skills.includes(s)).length;
      return { ...m, skills: need, score: match * 10 + (u.province && m.province === u.province ? 15 : 0) + (m.slots - m.taken > 0 ? 5 : -50) };
    })
    .filter(m => m.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
  const nearbyFamilies = u.province
    ? all("SELECT * FROM requests WHERE status = 'verified' AND province = ?", u.province)
      .map(x => toPublic(x)).sort((a, b) => b.priority - a.priority).slice(0, 4)
    : [];
  res.json({
    user: userOut(u),
    impact: {
      visits: approved.length,
      people_served: approved.reduce((t, v) => t + v.people_served, 0),
      hours: approved.reduce((t, v) => t + v.hours, 0),
      donations_total: donations.filter(d => d.kind === 'money').reduce((t, d) => t + d.amount, 0),
      deliveries: donations.filter(d => d.kind !== 'money').length,
      missions: missions.length,
    },
    visits, missions, claims, donations, suggestedMissions, nearbyFamilies,
  });
});

// ---------- Visitas de voluntarios (jornadas) ----------
r.post('/visits', requireUser, rateLimit({ key: 'visit', max: 10 }), (req, res) => {
  const b = req.body || {};
  const prov = findProvince(b.province);
  if (!prov || !prov.districts[b.district]) throw httpError(400, 'Selecciona provincia y distrito.');
  const community = clean(b.community, 80);
  if (!community) throw httpError(400, 'Indica la comunidad visitada.');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.visit_date || '') ? b.visit_date : new Date().toISOString().slice(0, 10);
  const info = run(`INSERT INTO visits (user_id, volunteer_name, organization, province, district, community, lat, lng, visit_date,
      people_served, families_served, hours, aid_types, pending_needs, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, req.user.id, req.user.name, clean(b.organization, 100) || req.user.organization,
    prov.name, b.district, community, num(b.lat, 5, 10.5), num(b.lng, -83.5, -77), date,
    int(b.people_served, 0, 100000), int(b.families_served, 0, 10000), num(b.hours, 0, 72) ?? 0,
    JSON.stringify((Array.isArray(b.aid_types) ? b.aid_types : []).slice(0, 20).map(s => clean(s, 40)).filter(Boolean)),
    clean(b.pending_needs, 500), clean(b.notes, 500));
  audit(req.user, 'visit.create', 'visit', Number(info.lastInsertRowid));
  res.status(201).json({ id: Number(info.lastInsertRowid), status: 'pending' });
});

r.get('/visits', (req, res) => {
  const params = [];
  let where = "status = 'approved'";
  if (req.query.province) { where += ' AND province = ?'; params.push(String(req.query.province)); }
  if (req.query.district) { where += ' AND district = ?'; params.push(String(req.query.district)); }
  const items = all(`SELECT id, volunteer_name, organization, province, district, community, visit_date, people_served,
      families_served, aid_types, pending_needs FROM visits WHERE ${where} ORDER BY visit_date DESC LIMIT 200`, ...params)
    .map(v => ({ ...v, volunteer_name: v.volunteer_name.split(' ')[0], aid_types: parseJSON(v.aid_types) }));
  res.json(items);
});

// Cobertura por distrito: dónde hay familias verificadas y nadie ha ido todavía.
r.get('/coverage', (_req, res) => {
  const fam = all(`SELECT province, district, COUNT(*) AS families, SUM(adults + minors) AS people
    FROM requests WHERE status = 'verified' GROUP BY province, district`);
  const pend = all(`SELECT r.province, r.district, SUM(MAX(n.quantity - n.fulfilled, 0)) AS pending
    FROM request_needs n JOIN requests r ON r.id = n.request_id
    WHERE r.status = 'verified' AND n.approved = 1 GROUP BY r.province, r.district`);
  const vis = all(`SELECT province, district, COUNT(*) AS visits, MAX(visit_date) AS last_visit, SUM(people_served) AS served
    FROM visits WHERE status = 'approved' GROUP BY province, district`);
  const key = (x) => `${x.province}|${x.district}`;
  const map = new Map();
  for (const f of fam) map.set(key(f), { province: f.province, district: f.district, families: f.families, people: f.people, pending: 0, visits: 0, served: 0, last_visit: null });
  for (const p of pend) { const m = map.get(key(p)); if (m) m.pending = p.pending; }
  for (const v of vis) {
    const m = map.get(key(v)) || { province: v.province, district: v.district, families: 0, people: 0, pending: 0 };
    Object.assign(m, { visits: v.visits, served: v.served, last_visit: v.last_visit });
    map.set(key(v), m);
  }
  const items = [...map.values()].map(m => {
    const p = findProvince(m.province);
    const c = p?.districts[m.district] || p?.center || [8.5, -80.5];
    let status = 'cubierto';
    if (m.families > 0 && !m.visits) status = 'sin_visitas';
    else if (m.pending > 0) status = 'con_necesidades';
    const days = m.last_visit ? Math.floor((Date.now() - new Date(m.last_visit).getTime()) / 86_400_000) : null;
    return { ...m, lat: c[0], lng: c[1], status, days_since_visit: days,
      urgency: (status === 'sin_visitas' ? 1000 : 0) + m.pending + (days ?? 0) * 5 + m.people };
  }).sort((a, b) => b.urgency - a.urgency);
  res.json({
    items,
    totals: {
      districts: items.length,
      with_visits: items.filter(i => i.visits > 0).length,
      without_visits: items.filter(i => i.status === 'sin_visitas').length,
      served: items.reduce((t, i) => t + (i.served || 0), 0),
      visits: items.reduce((t, i) => t + (i.visits || 0), 0),
    },
  });
});

// ---------- Misiones de voluntariado ----------
const missionOut = (m, userId) => ({
  ...m, skills: parseJSON(m.skills),
  taken: get('SELECT COUNT(*) AS n FROM mission_signups WHERE mission_id = ?', m.id).n,
  joined: userId ? !!get('SELECT 1 FROM mission_signups WHERE mission_id = ? AND user_id = ?', m.id, userId) : false,
});

r.get('/missions', (req, res) => {
  const params = [];
  let where = "status = 'open' AND COALESCE(ends_at, starts_at) >= date('now', '-1 day')";
  if (req.query.province) { where += ' AND province = ?'; params.push(String(req.query.province)); }
  if (req.query.category) { where += ' AND category = ?'; params.push(String(req.query.category)); }
  res.json(all(`SELECT * FROM missions WHERE ${where} ORDER BY starts_at LIMIT 100`, ...params).map(m => missionOut(m, req.user?.id)));
});

r.post('/missions', requireCoordinator, (req, res) => {
  const b = req.body || {};
  const title = clean(b.title, 120);
  if (!title) throw httpError(400, 'Indica un título.');
  if (!MISSION_CATEGORIES.some(c => c.key === b.category)) throw httpError(400, 'Elige una categoría.');
  if (!b.starts_at) throw httpError(400, 'Indica la fecha de inicio.');
  const prov = findProvince(b.province);
  const [lat, lng] = prov ? fallbackCoords(prov.name, b.district, b.community || '') : [null, null];
  const info = run(`INSERT INTO missions (title, description, category, province, district, community, lat, lng, meeting_point, starts_at, ends_at, slots, skills, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, title, clean(b.description, 1000), b.category, prov?.name ?? null,
    clean(b.district, 60), clean(b.community, 80), lat, lng, clean(b.meeting_point, 200), clean(b.starts_at, 20), clean(b.ends_at, 20),
    int(b.slots, 1, 1000, 10), JSON.stringify((Array.isArray(b.skills) ? b.skills : []).filter(s => SKILLS.includes(s))), req.user.id);
  audit(req.user, 'mission.create', 'mission', Number(info.lastInsertRowid));
  res.status(201).json(missionOut(get('SELECT * FROM missions WHERE id = ?', info.lastInsertRowid), req.user.id));
});

r.patch('/missions/:id', requireCoordinator, (req, res) => {
  const m = get('SELECT * FROM missions WHERE id = ?', int(req.params.id));
  if (!m) throw httpError(404, 'Misión no encontrada.');
  const status = ['open', 'closed', 'done'].includes(req.body?.status) ? req.body.status : m.status;
  run('UPDATE missions SET status = ? WHERE id = ?', status, m.id);
  audit(req.user, 'mission.status', 'mission', m.id, status);
  res.json(missionOut(get('SELECT * FROM missions WHERE id = ?', m.id), req.user.id));
});

r.get('/missions/:id/volunteers', requireCoordinator, (req, res) => {
  res.json(all(`SELECT u.id, u.name, u.phone, u.email, u.skills, u.has_vehicle, s.attended, s.created_at
    FROM mission_signups s JOIN users u ON u.id = s.user_id WHERE s.mission_id = ?`, int(req.params.id))
    .map(u => ({ ...u, skills: parseJSON(u.skills) })));
});

r.post('/missions/:id/signup', requireUser, (req, res) => {
  const m = get("SELECT * FROM missions WHERE id = ? AND status = 'open'", int(req.params.id));
  if (!m) throw httpError(404, 'Esta misión ya no está abierta.');
  const taken = get('SELECT COUNT(*) AS n FROM mission_signups WHERE mission_id = ?', m.id).n;
  if (taken >= m.slots) throw httpError(409, 'Ya no quedan cupos.');
  run('INSERT OR IGNORE INTO mission_signups (mission_id, user_id) VALUES (?, ?)', m.id, req.user.id);
  res.json(missionOut(m, req.user.id));
});

r.delete('/missions/:id/signup', requireUser, (req, res) => {
  run('DELETE FROM mission_signups WHERE mission_id = ? AND user_id = ?', int(req.params.id), req.user.id);
  const m = get('SELECT * FROM missions WHERE id = ?', int(req.params.id));
  res.json(m ? missionOut(m, req.user.id) : { ok: true });
});

// ---------- Centros: acopio, albergues, puntos de entrega, salud, agua, carga ----------
const centerOut = (c) => ({ ...c, needs: parseJSON(c.needs), surplus: parseJSON(c.surplus), verified: !!c.verified, accepting: !!c.accepting });

r.get('/centers', (req, res) => {
  const params = [];
  let where = req.query.all === '1' && ['coordinator', 'admin'].includes(req.user?.role) ? '1=1' : 'verified = 1';
  if (req.query.type) { where += ' AND type = ?'; params.push(String(req.query.type)); }
  if (req.query.province) { where += ' AND province = ?'; params.push(String(req.query.province)); }
  res.json(all(`SELECT * FROM centers WHERE ${where} ORDER BY province, name`, ...params).map(centerOut));
});

function centerFields(b, existing = {}) {
  const prov = findProvince(b.province ?? existing.province);
  if (!prov) throw httpError(400, 'Selecciona una provincia.');
  if (!CENTER_TYPES.some(t => t.key === (b.type ?? existing.type))) throw httpError(400, 'Tipo de centro no válido.');
  const name = clean(b.name ?? existing.name, 120);
  if (!name) throw httpError(400, 'Indica el nombre.');
  const district = clean(b.district ?? existing.district, 60);
  let lat = num(b.lat, 5, 10.5), lng = num(b.lng, -83.5, -77);
  if (lat == null || lng == null) [lat, lng] = existing.lat != null ? [existing.lat, existing.lng] : fallbackCoords(prov.name, district, name);
  const list = (v, old) => JSON.stringify(Array.isArray(v) ? v.slice(0, 30).map(s => clean(s, 60)).filter(Boolean) : parseJSON(old));
  return [b.type ?? existing.type, name, prov.name, district, clean(b.address ?? existing.address, 200), lat, lng,
    clean(b.hours ?? existing.hours, 100), clean(b.contact ?? existing.contact, 100), clean(b.managed_by ?? existing.managed_by, 100),
    b.capacity === undefined ? existing.capacity ?? null : int(b.capacity, 0, 100000),
    b.occupancy === undefined ? existing.occupancy ?? null : int(b.occupancy, 0, 100000),
    list(b.needs, existing.needs), list(b.surplus, existing.surplus),
    b.accepting === undefined ? existing.accepting ?? 1 : (b.accepting ? 1 : 0), clean(b.notes ?? existing.notes, 500)];
}

// Cualquier persona registrada puede sugerir un centro; se publica al verificarlo un coordinador.
r.post('/centers', requireUser, rateLimit({ key: 'center', max: 10 }), (req, res) => {
  const verified = ['coordinator', 'admin'].includes(req.user.role) ? 1 : 0;
  const info = run(`INSERT INTO centers (type, name, province, district, address, lat, lng, hours, contact, managed_by, capacity, occupancy, needs, surplus, accepting, notes, verified, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ...centerFields(req.body || {}), verified, req.user.id);
  audit(req.user, 'center.create', 'center', Number(info.lastInsertRowid));
  res.status(201).json(centerOut(get('SELECT * FROM centers WHERE id = ?', info.lastInsertRowid)));
});

r.patch('/centers/:id', requireCoordinator, (req, res) => {
  const c = get('SELECT * FROM centers WHERE id = ?', int(req.params.id));
  if (!c) throw httpError(404, 'Centro no encontrado.');
  const verified = req.body?.verified === undefined ? c.verified : (req.body.verified ? 1 : 0);
  run(`UPDATE centers SET type = ?, name = ?, province = ?, district = ?, address = ?, lat = ?, lng = ?, hours = ?, contact = ?, managed_by = ?,
    capacity = ?, occupancy = ?, needs = ?, surplus = ?, accepting = ?, notes = ?, verified = ?, updated_at = datetime('now') WHERE id = ?`,
  ...centerFields(req.body || {}, c), verified, c.id);
  audit(req.user, 'center.update', 'center', c.id);
  res.json(centerOut(get('SELECT * FROM centers WHERE id = ?', c.id)));
});

r.delete('/centers/:id', requireCoordinator, (req, res) => {
  run('DELETE FROM centers WHERE id = ?', int(req.params.id));
  audit(req.user, 'center.delete', 'center', int(req.params.id));
  res.json({ ok: true });
});

// ---------- Información oficial ----------
r.get('/alerts', (req, res) => {
  const params = [];
  let where = '1=1';
  if (req.query.province) { where += ' AND (province IS NULL OR province = ?)'; params.push(String(req.query.province)); }
  res.json(all(`SELECT a.*, u.name AS publisher FROM alerts a LEFT JOIN users u ON u.id = a.published_by
    WHERE ${where} ORDER BY pinned DESC, published_at DESC LIMIT 50`, ...params));
});

r.post('/alerts', requireCoordinator, (req, res) => {
  const b = req.body || {};
  const title = clean(b.title, 160), body = clean(b.body, 3000), source = clean(b.source, 80);
  if (!title || !body || !source) throw httpError(400, 'Título, contenido y fuente oficial son obligatorios.');
  const url = clean(b.source_url, 300);
  if (url && !/^https:\/\//i.test(url)) throw httpError(400, 'El enlace de la fuente debe empezar con https://');
  const level = ALERT_LEVELS.some(l => l.key === b.level) ? b.level : 'info';
  const info = run('INSERT INTO alerts (title, body, source, source_url, level, province, pinned, published_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    title, body, source, url, level, findProvince(b.province) ? b.province : null, b.pinned ? 1 : 0, req.user.id);
  audit(req.user, 'alert.create', 'alert', Number(info.lastInsertRowid));
  res.status(201).json(get('SELECT * FROM alerts WHERE id = ?', info.lastInsertRowid));
});

r.delete('/alerts/:id', requireCoordinator, (req, res) => {
  run('DELETE FROM alerts WHERE id = ?', int(req.params.id));
  audit(req.user, 'alert.delete', 'alert', int(req.params.id));
  res.json({ ok: true });
});

// Sismos recientes en Panamá y alrededores (USGS, datos públicos en tiempo real).
let quakeCache = { at: 0, data: null };
r.get('/quakes', async (_req, res) => {
  if (quakeCache.data && Date.now() - quakeCache.at < 10 * 60_000) return res.json(quakeCache.data);
  const start = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${start}&minlatitude=5&maxlatitude=10.5&minlongitude=-84&maxlongitude=-76.5&minmagnitude=3&orderby=time&limit=25`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`USGS ${resp.status}`);
    const j = await resp.json();
    const data = {
      source: 'USGS', fetched_at: new Date().toISOString(), available: true,
      items: j.features.map(f => ({
        id: f.id, mag: f.properties.mag, place: f.properties.place, time: f.properties.time,
        url: f.properties.url, depth: f.geometry.coordinates[2], lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
      })),
    };
    quakeCache = { at: Date.now(), data };
    res.json(data);
  } catch {
    res.json(quakeCache.data || { source: 'USGS', available: false, items: [] });
  }
});

// ---------- Mapa ----------
r.get('/map', (_req, res) => {
  const reqs = all("SELECT * FROM requests WHERE status = 'verified'").map(x => toPublic(x));
  const groups = new Map();
  for (const x of reqs) {
    const k = `${x.province}|${x.district}|${x.community.toLowerCase()}`;
    const g = groups.get(k) || { province: x.province, district: x.district, community: x.community, lat: 0, lng: 0, families: 0, people: 0, minors: 0, priority: 0, needs: {}, codes: [] };
    g.lat += x.lat; g.lng += x.lng; g.families++; g.people += x.adults + x.minors; g.minors += x.minors;
    g.priority = Math.max(g.priority, x.priority);
    g.codes.push(x.code);
    for (const n of x.needs) if (n.missing > 0) g.needs[n.label] = (g.needs[n.label] || 0) + 1;
    groups.set(k, g);
  }
  const visits = all(`SELECT province, district, lower(community) AS c, COUNT(*) AS n, MAX(visit_date) AS last
    FROM visits WHERE status = 'approved' GROUP BY province, district, lower(community)`);
  const vmap = new Map(visits.map(v => [`${v.province}|${v.district}|${v.c}`, v]));
  const communities = [...groups.entries()].map(([k, g]) => ({
    ...g, lat: +(g.lat / g.families).toFixed(3), lng: +(g.lng / g.families).toFixed(3),
    top_needs: Object.entries(g.needs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label, n]) => ({ label, families: n })),
    visits: vmap.get(k)?.n || 0, last_visit: vmap.get(k)?.last || null, needs: undefined,
  }));
  const centers = all('SELECT * FROM centers WHERE verified = 1').map(centerOut);
  const visitPoints = all(`SELECT province, district, community, lat, lng, COUNT(*) AS n, MAX(visit_date) AS last FROM visits
    WHERE status = 'approved' GROUP BY province, district, lower(community)`)
    .map(v => {
      const [lat, lng] = v.lat != null ? blurCoords(v.lat, v.lng) : fallbackCoords(v.province, v.district, v.community);
      return { ...v, lat, lng };
    });
  res.json({ communities, centers, visits: visitPoints });
});

// ---------- Estadísticas públicas ----------
r.get('/stats', (_req, res) => {
  const fam = get(`SELECT COUNT(*) AS families, COALESCE(SUM(adults + minors), 0) AS people, COALESCE(SUM(minors), 0) AS minors,
    COUNT(DISTINCT province || '|' || district || '|' || lower(community)) AS communities FROM requests WHERE status = 'verified'`);
  const byStatus = Object.fromEntries(all('SELECT status, COUNT(*) AS n FROM requests GROUP BY status').map(x => [x.status, x.n]));
  const needsPending = get(`SELECT COALESCE(SUM(CASE WHEN n.quantity > n.fulfilled THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(n.quantity), 0) AS qty, COALESCE(SUM(MIN(n.fulfilled, n.quantity)), 0) AS done
    FROM request_needs n JOIN requests r ON r.id = n.request_id WHERE r.status = 'verified' AND n.approved = 1`);
  const donations = get(`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total, COALESCE(SUM(confirmed), 0) AS confirmed,
      COUNT(DISTINCT request_id) AS families FROM donations d JOIN requests r ON r.id = d.request_id WHERE r.status IN ('verified', 'resolved')`);
  const needRanking = all(`SELECT n.label, n.icon, COUNT(DISTINCT n.request_id) AS families, SUM(n.quantity - MIN(n.fulfilled, n.quantity)) AS missing
    FROM request_needs n JOIN requests r ON r.id = n.request_id
    WHERE r.status = 'verified' AND n.approved = 1 AND n.quantity > n.fulfilled GROUP BY n.label ORDER BY families DESC LIMIT 15`);
  const byProvince = all(`SELECT province, COUNT(*) AS families, SUM(adults + minors) AS people FROM requests
    WHERE status = 'verified' GROUP BY province ORDER BY people DESC`);
  const affRows = all("SELECT affectations FROM requests WHERE status = 'verified'");
  const affectations = AFFECTATIONS.map(a => ({ key: a.key, label: a.label, families: affRows.filter(x => parseJSON(x.affectations).includes(a.key)).length }))
    .filter(a => a.families).sort((a, b) => b.families - a.families);
  const perDay = all(`SELECT date(created_at) AS day, COUNT(*) AS n FROM requests WHERE status = 'verified'
    AND created_at >= date('now', '-20 days') GROUP BY date(created_at) ORDER BY day`);
  const days = [];
  for (let i = 20; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    days.push({ day: d, n: perDay.find(p => p.day === d)?.n || 0 });
  }
  const vol = get(`SELECT COUNT(*) AS visits, COALESCE(SUM(people_served), 0) AS served, COALESCE(SUM(hours), 0) AS hours,
    COUNT(DISTINCT user_id) AS volunteers FROM visits WHERE status = 'approved'`);
  res.json({
    updated_at: new Date().toISOString(),
    families: fam.families, people: fam.people, minors: fam.minors, communities: fam.communities,
    pending_validation: byStatus.pending || 0, needs_info: byStatus.needs_info || 0, resolved: byStatus.resolved || 0,
    needs_pending: needsPending.pending, fulfillment: needsPending.qty ? Math.round(needsPending.done / needsPending.qty * 100) : 0,
    donations: { ...donations, total: Math.round(donations.total * 100) / 100 },
    families_without_donations: Math.max(0, fam.families - donations.families),
    need_ranking: needRanking, by_province: byProvince, affectations, per_day: days,
    volunteers: { ...vol, registered: get("SELECT COUNT(*) AS n FROM users WHERE role = 'volunteer'").n },
    missions_open: get("SELECT COUNT(*) AS n FROM missions WHERE status = 'open' AND starts_at >= date('now', '-1 day')").n,
    centers: get('SELECT COUNT(*) AS n FROM centers WHERE verified = 1').n,
  });
});

export default r;
