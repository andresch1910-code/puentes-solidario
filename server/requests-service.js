// Lógica compartida de solicitudes: prioridad, serialización pública y privada.
import { all, get, parseJSON } from './db.js';
import { AFFECTATIONS, VULNERABLE, blurCoords, fallbackCoords } from './catalog.js';

export const STATUS_LABELS = {
  pending: 'En validación',
  needs_info: 'Necesita más información',
  verified: 'Verificada',
  rejected: 'No validada',
  resolved: 'Atendida',
};

export function publicFamilyName(name) {
  const s = String(name || '').trim();
  if (!s) return 'Familia';
  if (/^familia\s+/i.test(s)) return 'Familia ' + s.replace(/^familia\s+/i, '').split(/\s+/)[0];
  const parts = s.split(/\s+/);
  // "María Pérez González" -> "Familia Pérez"
  return 'Familia ' + (parts.length >= 3 ? parts[parts.length - 2] : parts[parts.length - 1]);
}

export function needsFor(requestId, { onlyApproved = true } = {}) {
  return all(`SELECT * FROM request_needs WHERE request_id = ? ${onlyApproved ? 'AND approved = 1' : ''} ORDER BY id`, requestId);
}

export function donationSummary(requestId) {
  return get(`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total,
      COALESCE(SUM(confirmed), 0) AS confirmed
    FROM donations WHERE request_id = ?`, requestId);
}

/**
 * Puntaje de prioridad (0–100): combina gravedad, vulnerabilidad, tamaño del hogar,
 * cuánto se ha cubierto y cuánto tiempo lleva sin recibir ayuda.
 * Así los donantes y voluntarios ven primero a quien más lo necesita.
 */
export function computePriority(r, needs, donations) {
  const aff = parseJSON(r.affectations);
  const vul = parseJSON(r.vulnerable);
  let s = 0;
  for (const a of AFFECTATIONS) if (aff.includes(a.key)) s += a.weight;
  for (const v of VULNERABLE) if (vul.includes(v.key)) s += v.weight;
  s += Math.min(20, (r.minors || 0) * 4);
  s += Math.min(10, (r.adults || 0) + (r.minors || 0));
  const total = needs.reduce((t, n) => t + n.quantity, 0);
  const done = needs.reduce((t, n) => t + Math.min(n.fulfilled, n.quantity), 0);
  const pct = total ? done / total : 0;
  s *= 1 - 0.7 * pct;
  if (!donations?.count) s += 10;
  if (r.verified_at) {
    const days = (Date.now() - new Date(r.verified_at + 'Z').getTime()) / 86_400_000;
    if (pct < 0.5) s += Math.min(15, Math.max(0, days));
  }
  return Math.min(100, Math.round(s));
}

export function priorityLabel(score) {
  if (score >= 80) return { key: 'critica', label: 'Crítica' };
  if (score >= 55) return { key: 'alta', label: 'Alta' };
  if (score >= 30) return { key: 'media', label: 'Media' };
  return { key: 'baja', label: 'Baja' };
}

function coordsOf(r) {
  const [lat, lng] = r.lat != null && r.lng != null ? [r.lat, r.lng] : fallbackCoords(r.province, r.district, r.community);
  return blurCoords(lat, lng);
}

export function publicNeed(n, userId = null) {
  return {
    id: n.id, label: n.label, icon: n.icon, unit: n.unit, quantity: n.quantity,
    fulfilled: Math.min(n.fulfilled, n.quantity), missing: Math.max(0, n.quantity - n.fulfilled),
    detail: n.detail, category_id: n.catalog_id,
    claimed: !!n.claimed_by, claimed_by_me: !!userId && n.claimed_by === userId, claimed_name: n.claimed_name ? n.claimed_name.split(' ')[0] : null, claimed_at: n.claimed_at,
    store: n.store, store_branch: n.store_branch, purchased: !!n.purchased_at,
  };
}

/** Versión pública: nunca incluye nombre completo, cédula, teléfono, dirección ni datos de pago. */
export function toPublic(r, { withDetail = false, userId = null } = {}) {
  const needs = needsFor(r.id);
  const donations = donationSummary(r.id);
  const score = computePriority(r, needs, donations);
  const [lat, lng] = coordsOf(r);
  const out = {
    code: r.code, status: r.status, status_label: STATUS_LABELS[r.status],
    province: r.province, district: r.district, community: r.community, lat, lng,
    family_name: publicFamilyName(r.family_name),
    adults: r.adults, minors: r.minors,
    affectations: parseJSON(r.affectations), vulnerable: parseJSON(r.vulnerable),
    story: r.story, created_at: r.created_at, verified_at: r.verified_at,
    source: r.source, allow_contact: !!r.allow_contact,
    has_payment: !!(r.payment_approved && r.payment_method && r.payment_method !== 'none'),
    priority: score, priority_level: priorityLabel(score),
    needs: needs.map(n => publicNeed(n, userId)),
    donations: { count: donations.count, total: Math.round(donations.total * 100) / 100, confirmed: donations.confirmed },
  };
  const totalQ = needs.reduce((t, n) => t + n.quantity, 0);
  out.progress = totalQ ? Math.round(needs.reduce((t, n) => t + Math.min(n.fulfilled, n.quantity), 0) / totalQ * 100) : 0;
  if (withDetail) {
    out.photos = all("SELECT id FROM photos WHERE request_id = ? AND kind = 'situation' AND approved = 1", r.id).map(p => p.id);
    out.visits = get(`SELECT COUNT(*) AS n, MAX(visit_date) AS last FROM visits
      WHERE status = 'approved' AND province = ? AND district = ? AND lower(community) = lower(?)`, r.province, r.district, r.community);
    out.recent_donations = all(`SELECT donor_name, amount, kind, confirmed, created_at FROM donations
      WHERE request_id = ? ORDER BY id DESC LIMIT 10`, r.id)
      .map(d => ({ ...d, donor_name: d.donor_name ? d.donor_name.split(' ')[0] : 'Anónimo' }));
  }
  return out;
}

/** Versión para coordinadores: todo, incluidos datos privados y posibles duplicados. */
export function toPrivate(r) {
  const base = toPublic(r, { withDetail: true });
  const duplicates = r.cedula_norm
    ? all('SELECT code, status, community, created_at FROM requests WHERE cedula_norm = ? AND id <> ?', r.cedula_norm, r.id)
    : [];
  const coordinator = r.coordinator_id ? get('SELECT name FROM users WHERE id = ?', r.coordinator_id) : null;
  return {
    ...base,
    id: r.id, status_note: r.status_note,
    responsible_name: r.responsible_name, family_name_raw: r.family_name, cedula: r.cedula,
    contact_phone: r.contact_phone, address_private: r.address_private, notes_private: r.notes_private,
    reporter_name: r.reporter_name, reporter_phone: r.reporter_phone,
    payment_method: r.payment_method, payment_number: r.payment_number, payment_bank: r.payment_bank,
    payment_account_type: r.payment_account_type, payment_holder: r.payment_holder,
    payment_approved: !!r.payment_approved,
    lat_exact: r.lat, lng_exact: r.lng,
    coordinator: coordinator?.name || null, updated_at: r.updated_at,
    all_needs: needsFor(r.id, { onlyApproved: false }),
    photos_all: all('SELECT id, kind, approved, created_at FROM photos WHERE request_id = ?', r.id),
    messages: all('SELECT * FROM messages WHERE request_id = ? ORDER BY id', r.id),
    donations_all: all('SELECT * FROM donations WHERE request_id = ? ORDER BY id DESC', r.id),
    duplicates,
  };
}
