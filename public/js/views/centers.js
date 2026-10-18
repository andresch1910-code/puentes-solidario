// Centros de acopio, albergues, puntos de entrega, salud, agua y carga.
import { api, session } from '../api.js';
import { esc, meta, provinceOptions, districtOptions, linkProvinceDistrict, readForm, toast, modal, closeModal, timeAgo, empty } from '../ui.js';
import { createMap, centerMarker } from '../map.js';

export async function centers(main, { query }) {
  const m = await meta();
  const type = query.get('type') || '';
  const province = query.get('province') || '';
  const coord = session.isCoordinator();
  const list = await api(`/centers?${new URLSearchParams(Object.entries({ type, province, all: coord ? '1' : '' }).filter(([, v]) => v))}`);
  const typeOf = (k) => m.centerTypes.find(t => t.key === k) || { icon: '📍', label: k, color: '#333' };

  main.innerHTML = `
    <div class="section-head"><div><h1 style="margin:0">Centros y albergues</h1>
      <p class="muted" style="margin:0">Dónde llevar donaciones en especie, dónde refugiarse y dónde conseguir agua, atención o carga para el celular.</p></div>
      <button class="btn ghost" id="suggest">+ Sugerir un centro</button></div>
    <div class="tabs">
      <a href="#/centros${province ? `?province=${encodeURIComponent(province)}` : ''}" class="${!type ? 'on' : ''}">Todos</a>
      ${m.centerTypes.map(t => `<a href="#/centros?type=${t.key}${province ? `&province=${encodeURIComponent(province)}` : ''}" class="${type === t.key ? 'on' : ''}">${t.icon} ${esc(t.label)}</a>`).join('')}
    </div>
    <div class="split">
      <div>
        <select id="cprov" class="mb" style="max-width:280px">${provinceOptions(m, province, { any: true })}</select>
        <div class="stack">${list.length ? list.map(c => {
          const t = typeOf(c.type);
          const pct = c.capacity ? Math.round((c.occupancy || 0) / c.capacity * 100) : null;
          return `<div class="card">
            <div class="row between"><span class="badge" style="background:${t.color}1f;color:${t.color}">${t.icon} ${esc(t.label)}</span>
              <span class="row">${c.verified ? '<span class="badge ok">✓ Verificado</span>' : '<span class="badge warn">Sin verificar</span>'}${c.accepting ? '' : '<span class="badge crit">No recibe</span>'}</span></div>
            <h3 style="margin-top:8px">${esc(c.name)}</h3>
            <div class="small muted">📍 ${esc(c.address || '')} · ${esc(c.district || '')}, ${esc(c.province)}</div>
            ${c.hours ? `<div class="small">🕒 ${esc(c.hours)}</div>` : ''}
            ${c.contact ? `<div class="small">📞 ${esc(c.contact)}</div>` : ''}
            ${c.managed_by ? `<div class="small">🏛️ ${esc(c.managed_by)}</div>` : ''}
            ${pct != null ? `<div class="small mt">Ocupación ${c.occupancy || 0} / ${c.capacity} (${pct}%)</div><div class="progress"><i style="width:${pct}%;background:${pct > 90 ? 'var(--accent)' : pct > 70 ? 'var(--warn)' : 'var(--ok)'}"></i></div>` : ''}
            ${c.needs.length ? `<div class="mt small"><b>Necesitan:</b> ${c.needs.map(n => `<span class="tag">${esc(n)}</span>`).join('')}</div>` : ''}
            ${c.surplus.length ? `<div class="small"><b>Tienen de sobra (no llevar):</b> ${c.surplus.map(n => `<span class="tag">${esc(n)}</span>`).join('')}</div>` : ''}
            <div class="row mt"><a class="btn sm ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}">🧭 Cómo llegar</a>
            ${coord ? `<button class="btn sm ghost" data-edit="${c.id}">Editar</button>` : ''}<span class="small muted">Actualizado ${timeAgo(c.updated_at)}</span></div>
          </div>`;
        }).join('') : empty('📦', 'No hay centros registrados con estos filtros.')}</div>
      </div>
      <div><div style="position:sticky;top:80px"><div id="cmap" class="map" style="height:520px"></div></div></div>
    </div>`;

  main.querySelector('#cprov').addEventListener('change', (e) => {
    location.hash = `#/centros?${new URLSearchParams(Object.entries({ type, province: e.target.value }).filter(([, v]) => v))}`;
  });
  const map = createMap(main.querySelector('#cmap'));
  if (map && list.length) {
    list.forEach(c => centerMarker(c, m.centerTypes).addTo(map));
    map.fitBounds(list.map(c => [c.lat, c.lng]), { padding: [30, 30], maxZoom: 11 });
  }
  const reload = () => centers(main, { query });
  main.querySelector('#suggest').addEventListener('click', () => {
    if (!session.user) { location.hash = `#/entrar?next=${encodeURIComponent('#/centros')}`; return; }
    centerForm(m, null, reload);
  });
  main.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => centerForm(m, list.find(c => c.id === +b.dataset.edit), reload)));
  return () => map?.remove();
}

function centerForm(m, c, after) {
  const coord = session.isCoordinator();
  const body = modal(`<h2>${c ? 'Editar centro' : 'Sugerir un centro'}</h2>
    ${!coord ? '<p class="small muted">Un coordinador lo verificará antes de publicarlo.</p>' : ''}
    <form id="cf">
      <div class="grid g2">
        <div class="field"><label>Tipo</label><select name="type">${m.centerTypes.map(t => `<option value="${t.key}" ${c?.type === t.key ? 'selected' : ''}>${t.icon} ${esc(t.label)}</option>`).join('')}</select></div>
        <div class="field"><label>Nombre</label><input name="name" required maxlength="120" value="${esc(c?.name || '')}"></div>
        <div class="field"><label>Provincia</label><select name="province" required>${provinceOptions(m, c?.province)}</select></div>
        <div class="field"><label>Distrito</label><select name="district">${districtOptions(m, c?.province, c?.district)}</select></div>
      </div>
      <div class="field"><label>Dirección pública</label><input name="address" maxlength="200" value="${esc(c?.address || '')}"></div>
      <div class="grid g2">
        <div class="field"><label>Horario</label><input name="hours" maxlength="100" value="${esc(c?.hours || '')}"></div>
        <div class="field"><label>Contacto público</label><input name="contact" maxlength="100" value="${esc(c?.contact || '')}"></div>
        <div class="field"><label>Responsable / institución</label><input name="managed_by" maxlength="100" value="${esc(c?.managed_by || '')}"></div>
        <div class="field"><label>Capacidad (albergues)</label><input name="capacity" type="number" min="0" value="${c?.capacity ?? ''}"></div>
        <div class="field"><label>Ocupación actual</label><input name="occupancy" type="number" min="0" value="${c?.occupancy ?? ''}"></div>
      </div>
      <div class="field"><label>Qué necesitan (separado por comas)</label><input name="needs" value="${esc((c?.needs || []).join(', '))}"></div>
      <div class="field"><label>Qué tienen de sobra (separado por comas)</label><input name="surplus" value="${esc((c?.surplus || []).join(', '))}"></div>
      <label class="check"><input type="checkbox" name="accepting" ${c ? (c.accepting ? 'checked' : '') : 'checked'}> Está recibiendo donaciones / personas</label>
      ${coord && c ? `<label class="check"><input type="checkbox" name="verified" ${c.verified ? 'checked' : ''}> Verificado (visible al público)</label>` : ''}
      <div class="row mt"><button class="btn">Guardar</button><button type="button" class="btn ghost" data-close>Cancelar</button>
      ${coord && c ? '<button type="button" class="btn ghost" id="del" style="margin-left:auto;color:var(--accent)">Eliminar</button>' : ''}</div>
    </form>`);
  const f = body.querySelector('#cf');
  linkProvinceDistrict(m, f.province, f.district);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = readForm(f);
    const split = (s) => s.split(',').map(x => x.trim()).filter(Boolean);
    const payload = { ...v, needs: split(v.needs), surplus: split(v.surplus) };
    if (v.capacity === '') delete payload.capacity;
    if (v.occupancy === '') delete payload.occupancy;
    try {
      await api(c ? `/centers/${c.id}` : '/centers', { method: c ? 'PATCH' : 'POST', body: payload });
      closeModal(); toast(c ? 'Centro actualizado' : coord ? 'Centro publicado' : '¡Gracias! Lo revisaremos pronto.'); after();
    } catch (err) { toast(err.message, 'error'); }
  });
  body.querySelector('#del')?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este centro?')) return;
    await api(`/centers/${c.id}`, { method: 'DELETE' }); closeModal(); toast('Centro eliminado'); after();
  });
}
