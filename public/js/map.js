// Ayudas para mapas con Leaflet (servido localmente desde /vendor).
import { esc, fmtNum, fmtDate } from './ui.js';

const L = window.L;
export const PANAMA = { center: [8.45, -80.2], zoom: 7 };
export const PRIORITY_COLORS = { critica: '#d21034', alta: '#ea580c', media: '#1557c0', baja: '#64748b' };

export function createMap(el, { center = PANAMA.center, zoom = PANAMA.zoom, scroll = false } = {}) {
  if (!L) { el.innerHTML = '<p class="empty">No se pudo cargar el mapa.</p>'; return null; }
  const map = L.map(el, { scrollWheelZoom: scroll, zoomControl: true }).setView(center, zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  // Leaflet necesita recalcular tamaño cuando el contenedor aparece después del render.
  setTimeout(() => map.invalidateSize(), 50);
  return map;
}

const levelOf = (p) => (p >= 80 ? 'critica' : p >= 55 ? 'alta' : p >= 30 ? 'media' : 'baja');

export function communityMarker(c) {
  const size = Math.min(48, 24 + Math.sqrt(c.people) * 3);
  const color = PRIORITY_COLORS[levelOf(c.priority)];
  const icon = L.divIcon({
    className: '', iconSize: [size, size],
    html: `<div class="pin" style="width:${size}px;height:${size}px;background:${color}">${c.families}</div>`,
  });
  const m = L.marker([c.lat, c.lng], { icon, title: c.community });
  m.bindPopup(`
    <h4>${esc(c.community)}</h4>
    <div class="muted small">${esc(c.district)}, ${esc(c.province)}</div>
    <p style="margin:6px 0">👨‍👩‍👧 <b>${c.families}</b> familia${c.families > 1 ? 's' : ''} · <b>${fmtNum(c.people)}</b> personas${c.minors ? ` · ${c.minors} menores` : ''}</p>
    ${c.top_needs?.length ? `<div class="small"><b>Lo que más falta:</b> ${c.top_needs.map(n => esc(n.label)).join(', ')}</div>` : ''}
    <div class="small" style="margin-top:4px">${c.visits ? `🤝 ${c.visits} visita${c.visits > 1 ? 's' : ''} · última ${fmtDate(c.last_visit)}` : '⚠️ Sin visitas de voluntarios'}</div>
    <a class="btn sm" style="margin-top:8px;color:#fff" href="#/ayudar?community=${encodeURIComponent(c.community)}&district=${encodeURIComponent(c.district)}">Ver familias</a>`);
  return m;
}

export function centerMarker(c, types) {
  const t = types.find(x => x.key === c.type) || { icon: '📍', color: '#333', label: c.type };
  const icon = L.divIcon({ className: '', iconSize: [30, 30], html: `<div class="pin-center" style="border-color:${t.color}">${t.icon}</div>` });
  const m = L.marker([c.lat, c.lng], { icon, title: c.name });
  m.bindPopup(`
    <h4>${t.icon} ${esc(c.name)}</h4>
    <div class="muted small">${esc(t.label)} · ${esc(c.district || '')}, ${esc(c.province)}</div>
    ${c.hours ? `<div class="small">🕒 ${esc(c.hours)}</div>` : ''}
    ${c.capacity ? `<div class="small">🛏️ Ocupación: ${c.occupancy ?? '?'} / ${c.capacity}</div>` : ''}
    ${c.needs?.length ? `<div class="small"><b>Necesitan:</b> ${c.needs.map(esc).join(', ')}</div>` : ''}
    <a class="small" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}">Cómo llegar ↗</a>`);
  return m;
}

/** Mapa para elegir un punto aproximado (se redondea ~1 km para proteger la vivienda). */
export function pickerMap(el, { center, onPick }) {
  const map = createMap(el, { center: center || PANAMA.center, zoom: center ? 11 : 7, scroll: false });
  if (!map) return null;
  let marker = null;
  const set = (lat, lng) => {
    lat = Math.round(lat * 100) / 100; lng = Math.round(lng * 100) / 100;
    if (marker) marker.setLatLng([lat, lng]); else marker = L.marker([lat, lng]).addTo(map);
    onPick(lat, lng);
  };
  map.on('click', (e) => set(e.latlng.lat, e.latlng.lng));
  return { map, set, recenter: (c, z = 11) => map.setView(c, z) };
}
