// Utilidades de interfaz compartidas por todas las vistas.
import { api } from './api.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => (v == null ? '' : String(v).replace(/[&<>"']/g, c => ESC[c]));

let metaCache = null;
export async function meta() {
  if (!metaCache) metaCache = await api('/meta');
  return metaCache;
}

export const fmtNum = (n) => new Intl.NumberFormat('es-PA').format(n || 0);
export const fmtMoney = (n) => new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(n || 0);

/** Convierte fechas de SQLite (UTC), fechas sin hora o ISO en Date. */
export function toDate(s) {
  if (!s) return null;
  if (typeof s === 'number') return new Date(s);
  if (/^\d{4}-\d\d-\d\d \d/.test(s)) return new Date(s.replace(' ', 'T') + 'Z'); // SQLite: hora UTC
  if (/^\d{4}-\d\d-\d\d$/.test(s)) return new Date(`${s}T12:00`); // solo fecha: mediodía local
  return new Date(s); // ISO con zona, o fecha y hora local (formularios)
}
export function fmtDate(s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = toDate(s);
  return d ? d.toLocaleDateString('es-PA', opts) : '';
}
export function fmtDateTime(s) {
  const d = toDate(s);
  return d ? d.toLocaleString('es-PA', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
}
export function timeAgo(s) {
  const d = toDate(s);
  if (!d) return '';
  const sec = (Date.now() - d.getTime()) / 1000;
  if (sec < 60) return 'hace un momento';
  if (sec < 3600) return `hace ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`;
  if (sec < 86400 * 30) { const n = Math.floor(sec / 86400); return `hace ${n} día${n > 1 ? 's' : ''}`; }
  return fmtDate(s);
}

let toastTimer;
export function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, type === 'error' ? 5000 : 3200);
}

export function modal(html) {
  const dlg = $('#modal');
  $('#modal-body').innerHTML = html;
  if (!dlg.open) dlg.showModal();
  return $('#modal-body');
}
export function closeModal() {
  const dlg = $('#modal');
  if (dlg.open) dlg.close();
}
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) closeModal();
  if (e.target.id === 'modal') closeModal(); // clic fuera del contenido
});

export function provinceOptions(m, selected, { any = false, placeholder = 'Seleccione…' } = {}) {
  return `<option value="">${any ? 'Todas las provincias' : placeholder}</option>` +
    m.provinces.map(p => `<option ${p.name === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}
export function districtOptions(m, province, selected, { any = false } = {}) {
  const p = m.provinces.find(x => x.name === province);
  if (!p) return `<option value="">${any ? 'Todos los distritos' : 'Primero elija la provincia'}</option>`;
  return `<option value="">${any ? 'Todos los distritos' : 'Seleccione…'}</option>` +
    p.districts.map(d => `<option ${d === selected ? 'selected' : ''}>${esc(d)}</option>`).join('');
}
/** Enlaza un select de provincia con uno de distrito. */
export function linkProvinceDistrict(m, provSel, distSel, opts) {
  provSel.addEventListener('change', () => { distSel.innerHTML = districtOptions(m, provSel.value, '', opts); distSel.dispatchEvent(new Event('change')); });
}

/** Lee un formulario: campos repetidos (checkbox) se devuelven como arreglos. */
export function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      const multi = form.querySelectorAll(`[name="${el.name}"]`).length > 1 || el.dataset.multi != null;
      if (multi) { out[el.name] ??= []; if (el.checked) out[el.name].push(el.value); } else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else if (el.type !== 'file' && el.type !== 'submit' && el.type !== 'button') {
      out[el.name] = el.value;
    }
  }
  return out;
}

/** Reduce y comprime una foto en el navegador (ahorra datos en zonas con mala señal). */
export function compressImage(file, max = 1280, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('El archivo no es una imagen.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

export async function withBusy(btn, fn) {
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = 'Enviando…'; }
  try { return await fn(); } finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
}

export function stepper(name, value = 0, min = 0, max = 30) {
  return `<div class="stepper" data-stepper>
    <button type="button" data-step="-1" aria-label="Menos">−</button>
    <input type="number" name="${name}" value="${value}" min="${min}" max="${max}" inputmode="numeric">
    <button type="button" data-step="1" aria-label="Más">+</button></div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-step]');
  if (!b) return;
  const input = b.parentElement.querySelector('input');
  const v = Math.min(+input.max || 999, Math.max(+input.min || 0, (+input.value || 0) + +b.dataset.step));
  input.value = v;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});

// Asocia cada <label> con el campo que la sigue (lectores de pantalla y clic en la etiqueta).
let labelSeq = 0;
function linkLabels(root) {
  root.querySelectorAll('label:not([for])').forEach(l => {
    if (l.querySelector('input, select, textarea')) return;
    const next = l.nextElementSibling;
    const ctl = next?.matches('input, select, textarea') ? next
      : next?.querySelector(':scope > input:not([type=hidden]), :scope > select, :scope > textarea');
    if (!ctl || ctl.type === 'hidden') return;
    if (!ctl.id) ctl.id = `fld-${++labelSeq}`;
    l.htmlFor = ctl.id;
  });
}
let linkQueued = false;
new MutationObserver(() => {
  if (linkQueued) return;
  linkQueued = true;
  requestAnimationFrame(() => { linkQueued = false; linkLabels(document.body); });
}).observe(document.body, { childList: true, subtree: true });

export const loading = (n = 3) => `<div class="grid g3">${'<div class="skeleton"></div>'.repeat(n)}</div>`;
export const empty = (icon, text, extra = '') => `<div class="empty"><div class="big">${icon}</div><p>${text}</p>${extra}</div>`;

export function bars(items, { label = 'label', value = 'value', icon = null, color } = {}) {
  const max = Math.max(1, ...items.map(i => i[value]));
  return `<div class="bars">${items.map(i => `
    <div class="bar"><span>${icon && i[icon] ? esc(i[icon]) + ' ' : ''}${esc(i[label])}</span>
    <div class="track"><i style="width:${(i[value] / max) * 100}%;${color ? `background:${color}` : ''}"></i></div><b>${fmtNum(i[value])}</b></div>`).join('')}</div>`;
}

export function familyCard(f, m) {
  const aff = f.affectations.map(k => m.affectations.find(a => a.key === k)?.label).filter(Boolean);
  return `<a class="card family-card" href="#/familia/${esc(f.code)}">
    <div class="top">
      <h3>${esc(f.family_name)}</h3>
      <span class="badge ${f.priority_level.key}" title="Prioridad calculada">${f.priority_level.label}</span>
    </div>
    ${f.story ? `<p class="story">“${esc(f.story)}”</p>` : ''}
    <div class="meta">📍 ${esc(f.community)}, ${esc(f.district)} · 👥 ${f.adults + f.minors} persona${f.adults + f.minors === 1 ? '' : 's'}${f.minors ? ` · ${f.minors} menor${f.minors > 1 ? 'es' : ''}` : ''}</div>
    <div>${aff.slice(0, 2).map(a => `<span class="tag">${esc(a)}</span>`).join('')}<span class="badge ok">✓ Verificada</span></div>
    <div><div class="row between small muted"><span>Necesidades cubiertas</span><span>${f.progress}%</span></div>
    <div class="progress"><i style="width:${f.progress}%"></i></div></div>
    <div class="row between small muted"><span>${f.donations.count ? `💚 ${f.donations.count} aporte${f.donations.count > 1 ? 's' : ''}` : 'Aún sin aportes'}</span><span>${esc(f.code)}</span></div>
    ${needsStatus(f.needs)}
  </a>`;
}

/** Estado de cada necesidad: pendiente, parcial, en camino (alguien la lleva) o cubierta. */
export function needStatus(n) {
  if (n.missing === 0) return { key: 'ok', label: 'Cubierta ✓' };
  if (n.claimed) return { key: 'warn', label: `🚚 En camino${n.claimed_name ? ` · ${n.claimed_name}` : ''}` };
  if (n.fulfilled > 0) return { key: 'primary', label: `Parcial · ${n.fulfilled} de ${n.quantity}` };
  return { key: 'crit', label: `${n.missing === 1 ? 'Falta' : 'Faltan'} ${n.missing} ${unitFor(n.missing, n.unit)}` };
}

const SINGULAR = {
  unidades: 'unidad', galones: 'galón', kits: 'kit', latas: 'lata', bolsas: 'bolsa', paquetes: 'paquete', láminas: 'lámina',
  sesiones: 'sesión', jornadas: 'jornada', visitas: 'visita', viajes: 'viaje', meses: 'mes',
};
export const unitFor = (qty, unit) => (qty === 1 && SINGULAR[unit]) || unit;

function needsStatus(needs, limit = 5) {
  if (!needs.length) return '';
  // Primero lo que falta, al final lo ya cubierto.
  const order = { crit: 0, primary: 1, warn: 2, ok: 3 };
  const rows = needs.map(n => ({ n, s: needStatus(n) })).sort((a, b) => order[a.s.key] - order[b.s.key]);
  return `<div class="needs-status">
    <div class="needs-status-title">Sus necesidades</div>
    ${rows.slice(0, limit).map(({ n, s }) => `<div class="needs-status-row">
      <span class="needs-status-name">${esc(n.icon)} ${esc(n.label)}</span><span class="badge ${s.key}">${esc(s.label)}</span></div>`).join('')}
    ${rows.length > limit ? `<div class="small muted">+${rows.length - limit} más · ver detalle</div>` : ''}
  </div>`;
}

export const emergencyBlock = () => `
  <div class="sos-box">
    <h2>🚨 Si hay peligro inmediato para la vida</h2>
    <p>No esperes la validación de la plataforma. Llama ahora a los servicios de emergencia. Aléjate de estructuras dañadas, laderas inestables y cables eléctricos caídos.</p>
    <div class="sos-numbers">
      <a href="tel:911"><b>911</b>Emergencias</a>
      <a href="tel:103"><b>103</b>Bomberos</a>
      <a href="tel:104"><b>104</b>Policía</a>
    </div>
  </div>`;
