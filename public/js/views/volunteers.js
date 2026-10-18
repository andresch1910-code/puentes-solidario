// Voluntariado: cobertura por zona, registro de visitas y misiones según habilidades.
import { api, session } from '../api.js';
import {
  esc, meta, fmtNum, fmtDate, fmtDateTime, provinceOptions, districtOptions, linkProvinceDistrict, readForm,
  toast, withBusy, empty, modal, closeModal,
} from '../ui.js';
import { createMap, pickerMap } from '../map.js';

const L = window.L;
const COV = {
  sin_visitas: ['#d21034', 'Familias afectadas, sin visitas'],
  con_necesidades: ['#ea580c', 'Con visitas, aún con necesidades'],
  cubierto: ['#0f8a5f', 'Con visitas'],
};

export async function hub(main) {
  const [m, cov, visits, missions] = await Promise.all([meta(), api('/coverage'), api('/visits'), api('/missions')]);
  const attention = cov.items.filter(i => i.status !== 'cubierto');
  main.innerHTML = `
    <h1>Voluntarios</h1>
    <p class="muted">¿Ya llevaste ayuda a una comunidad? Regístralo para que todos sepan qué lugares ya recibieron visitas y cuáles todavía no.</p>
    <div class="row mb"><a class="btn" href="#/registrar-visita">✅ Registrar voluntariado realizado</a><a class="btn ghost" href="#/misiones">🤝 Ver misiones (${missions.length})</a>
      <a class="btn ghost" href="#/reportar">📝 Reportar una familia</a></div>

    <div class="grid g4">
      <div class="card kpi primary"><b>${fmtNum(cov.totals.served)}</b><span>personas atendidas (aprox.)</span></div>
      <div class="card kpi"><b>${fmtNum(cov.totals.visits)}</b><span>jornadas registradas</span></div>
      <div class="card kpi ok"><b>${cov.totals.with_visits}</b><span>distritos con visitas</span></div>
      <div class="card kpi accent"><b>${cov.totals.without_visits}</b><span>distritos afectados sin visitas</span></div>
    </div>

    <section class="section split">
      <div>
        <h2>Cobertura de voluntariado</h2>
        <p class="small muted">Cada círculo es un distrito. Solo cuentan las visitas aprobadas por un coordinador; una visita no significa que todas las necesidades estén cubiertas.</p>
        <div id="cov-map" class="map"></div>
        <div class="legend">${Object.values(COV).map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>
      </div>
      <div>
        <h2>Requieren atención</h2>
        <p class="small muted">Primero los más urgentes: familias verificadas sin visitas o con necesidades pendientes.</p>
        <div class="card flat" style="max-height:470px;overflow:auto">
          ${attention.length ? attention.map(i => `<div class="list-item">
            <span class="badge" style="background:${COV[i.status][0]}22;color:${COV[i.status][0]}">${i.status === 'sin_visitas' ? 'Sin visitas' : 'Pendiente'}</span>
            <div style="flex:1"><b>${esc(i.district)}</b>, ${esc(i.province)}
              <div class="small muted">${i.families} familia(s) · ${fmtNum(i.people)} personas · ${i.pending} artículo(s) pendientes${i.last_visit ? ` · última visita ${fmtDate(i.last_visit)}` : ''}</div></div>
            <a class="btn sm ghost" href="#/ayudar?tab=entrega&province=${encodeURIComponent(i.province)}&district=${encodeURIComponent(i.district)}">Ayudar</a></div>`).join('') : '<p class="muted">¡Todas las zonas con familias verificadas tienen visitas!</p>'}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Próximas misiones</h2><a href="#/misiones">Ver todas ›</a></div>
      <div class="grid g3">${missions.slice(0, 3).map(x => missionCard(x, m)).join('') || '<p class="muted">No hay misiones abiertas.</p>'}</div>
    </section>

    <section class="section">
      <h2>Visitas recientes</h2>
      <div class="card flat table-wrap"><table><thead><tr><th>Fecha</th><th>Comunidad</th><th>Voluntario/a</th><th>Personas</th><th class="hide-mobile">Ayuda llevada</th></tr></thead><tbody>
        ${visits.slice(0, 15).map(v => `<tr><td>${fmtDate(v.visit_date)}</td><td><b>${esc(v.community)}</b><div class="small muted">${esc(v.district)}, ${esc(v.province)}</div></td>
          <td>${esc(v.volunteer_name)}${v.organization ? `<div class="small muted">${esc(v.organization)}</div>` : ''}</td><td>${fmtNum(v.people_served)}</td>
          <td class="hide-mobile">${v.aid_types.map(a => `<span class="tag">${esc(a)}</span>`).join('')}${v.pending_needs ? `<div class="small muted">Falta: ${esc(v.pending_needs)}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aún no hay visitas aprobadas.</td></tr>'}
      </tbody></table></div>
    </section>`;

  const map = createMap(main.querySelector('#cov-map'));
  if (map) {
    cov.items.forEach(i => L.circleMarker([i.lat, i.lng], {
      radius: Math.min(26, 8 + Math.sqrt(i.people || 1) * 2), color: COV[i.status][0], fillColor: COV[i.status][0], fillOpacity: 0.45, weight: 2,
    }).bindPopup(`<h4>${esc(i.district)}, ${esc(i.province)}</h4><div class="small">${i.families} familia(s) verificadas · ${i.pending} artículo(s) pendientes<br>
      ${i.visits ? `🤝 ${i.visits} visita(s) · última ${fmtDate(i.last_visit)} · ${fmtNum(i.served)} personas atendidas` : '⚠️ Ninguna visita registrada'}</div>`).addTo(map));
  }
  bindMissionButtons(main, () => hub(main));
  return () => map?.remove();
}

export async function visitForm(main) {
  const m = await meta();
  if (!session.user) {
    main.innerHTML = empty('🔐', 'Entra con tu cuenta de voluntario para registrar una visita.',
      `<a class="btn" href="#/entrar?next=${encodeURIComponent('#/registrar-visita')}">Entrar</a> <a class="btn ghost" href="#/registro">Crear cuenta</a>`);
    return;
  }
  const aid = ['Alimentos', 'Agua', 'Colchones', 'Carpas', 'Ropa', 'Higiene', 'Medicamentos', 'Atención médica', 'Apoyo psicológico', 'Materiales de construcción', 'Remoción de escombros', 'Evaluación de daños'];
  main.innerHTML = `
    <a class="back" href="#/voluntarios">← Volver</a>
    <div style="max-width:760px;margin:0 auto">
      <h1>Registrar voluntariado realizado</h1>
      <p class="muted">Un coordinador aprobará el registro y la comunidad aparecerá como visitada en el mapa de cobertura.</p>
      <form id="visit" class="card">
        <div class="grid g2">
          <div class="field"><label>Provincia</label><select name="province" required>${provinceOptions(m, session.user.province)}</select></div>
          <div class="field"><label>Distrito</label><select name="district" required>${districtOptions(m, session.user.province)}</select></div>
          <div class="field"><label>Comunidad visitada</label><input name="community" required maxlength="80"></div>
          <div class="field"><label>Fecha</label><input type="date" name="visit_date" value="${new Date().toISOString().slice(0, 10)}" required></div>
          <div class="field"><label>Personas atendidas (aprox.)</label><input type="number" name="people_served" min="0" value="0"></div>
          <div class="field"><label>Familias atendidas</label><input type="number" name="families_served" min="0" value="0"></div>
          <div class="field"><label>Horas de voluntariado</label><input type="number" name="hours" min="0" max="72" step="0.5" value="4"></div>
          <div class="field"><label>Organización o grupo (opcional)</label><input name="organization" maxlength="100" value="${esc(session.user.organization || '')}"></div>
        </div>
        <label>¿Qué ayuda llevaron?</label>
        <div class="chips mb">${aid.map(a => `<label class="chip-toggle"><input type="checkbox" name="aid_types" value="${esc(a)}"><span>${esc(a)}</span></label>`).join('')}</div>
        <div class="field"><label>¿Qué sigue haciendo falta en la comunidad?<span class="hint">Ayuda a que el siguiente grupo lleve lo correcto.</span></label><textarea name="pending_needs" maxlength="500"></textarea></div>
        <div class="field"><label>Notas para coordinadores (opcional)</label><textarea name="notes" maxlength="500"></textarea></div>
        <label>Punto aproximado (opcional)</label><div id="vmap" class="map" style="height:220px"></div>
        <input type="hidden" name="lat"><input type="hidden" name="lng">
        <button class="btn block mt">Enviar registro</button>
      </form>
    </div>`;
  const f = main.querySelector('#visit');
  linkProvinceDistrict(m, f.province, f.district);
  const picker = pickerMap(main.querySelector('#vmap'), { onPick: (lat, lng) => { f.lat.value = lat; f.lng.value = lng; } });
  f.province.addEventListener('change', () => { const p = m.provinces.find(x => x.name === f.province.value); if (p) picker?.recenter(p.center, 9); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    await withBusy(e.submitter, async () => {
      try {
        await api('/visits', { method: 'POST', body: readForm(f) });
        toast('¡Gracias! Tu visita quedó registrada y será revisada.');
        location.hash = '#/mi-panel';
      } catch (err) { toast(err.message, 'error'); }
    });
  });
  return () => picker?.map.remove();
}

function missionCard(x, m) {
  const cat = m.missionCategories.find(c => c.key === x.category) || { icon: '🤝', label: x.category };
  const left = x.slots - x.taken;
  return `<div class="card family-card">
    <div class="top"><span class="badge primary">${cat.icon} ${esc(cat.label)}</span><span class="small muted">${left > 0 ? `${left} cupo${left > 1 ? 's' : ''}` : 'Completa'}</span></div>
    <h3>${esc(x.title)}</h3>
    <div class="meta">📅 ${fmtDateTime(x.starts_at)}${x.province ? ` · 📍 ${esc(x.district || '')}, ${esc(x.province)}` : ''}</div>
    ${x.meeting_point ? `<div class="small">🚩 Punto de encuentro: ${esc(x.meeting_point)}</div>` : ''}
    ${x.description ? `<p class="small muted" style="margin:0">${esc(x.description)}</p>` : ''}
    ${x.skills.length ? `<div>${x.skills.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>` : ''}
    <div class="progress"><i style="width:${Math.min(100, (x.taken / x.slots) * 100)}%;background:var(--primary)"></i></div>
    ${x.joined ? `<div class="row"><span class="badge ok">✓ Estás inscrito/a</span><button class="btn sm ghost" data-leave="${x.id}">Cancelar</button></div>`
      : `<button class="btn sm" data-join="${x.id}" ${left <= 0 ? 'disabled' : ''}>Quiero participar</button>`}
  </div>`;
}

function bindMissionButtons(root, after) {
  root.querySelectorAll('[data-join]').forEach(b => b.addEventListener('click', async () => {
    if (!session.user) { location.hash = `#/entrar?next=${encodeURIComponent(location.hash)}`; return; }
    try { await api(`/missions/${b.dataset.join}/signup`, { method: 'POST' }); toast('¡Inscripción confirmada! Te contactarán para coordinar.'); after(); } catch (e) { toast(e.message, 'error'); }
  }));
  root.querySelectorAll('[data-leave]').forEach(b => b.addEventListener('click', async () => {
    try { await api(`/missions/${b.dataset.leave}/signup`, { method: 'DELETE' }); toast('Inscripción cancelada'); after(); } catch (e) { toast(e.message, 'error'); }
  }));
}

export async function missions(main, { query }) {
  const m = await meta();
  const province = query.get('province') || '';
  const category = query.get('category') || '';
  const list = await api(`/missions?${new URLSearchParams(Object.entries({ province, category }).filter(([, v]) => v))}`);
  const mySkills = session.user ? (await api('/auth/me').catch(() => ({ skills: [] }))).skills : [];
  list.forEach(x => { x.match = x.skills.filter(s => mySkills.includes(s)).length; });
  if (mySkills.length) list.sort((a, b) => b.match - a.match || a.starts_at.localeCompare(b.starts_at));
  main.innerHTML = `
    <a class="back" href="#/voluntarios">← Voluntarios</a>
    <div class="section-head"><div><h1 style="margin:0">Misiones de voluntariado</h1>
      <p class="muted" style="margin:0">${mySkills.length ? 'Ordenadas según tus habilidades.' : `<a href="${session.user ? '#/perfil' : '#/registro'}">${session.user ? 'Agrega tus habilidades' : 'Crea tu perfil'}</a> para ver primero las misiones que más te necesitan.`}</p></div>
      ${session.isCoordinator() ? '<button class="btn" id="new-mission">+ Nueva misión</button>' : ''}</div>
    <form class="row mb" id="mf">
      <select name="province" style="max-width:260px">${provinceOptions(m, province, { any: true })}</select>
      <select name="category" style="max-width:260px"><option value="">Todas las categorías</option>${m.missionCategories.map(c => `<option value="${c.key}" ${c.key === category ? 'selected' : ''}>${c.icon} ${esc(c.label)}</option>`).join('')}</select>
    </form>
    <div class="grid g3">${list.map(x => missionCard(x, m)).join('') || empty('🗓️', 'No hay misiones abiertas con estos filtros.')}</div>`;
  main.querySelector('#mf').addEventListener('change', (e) => {
    const v = readForm(e.currentTarget);
    location.hash = `#/misiones?${new URLSearchParams(Object.entries(v).filter(([, val]) => val))}`;
  });
  bindMissionButtons(main, () => missions(main, { query }));
  main.querySelector('#new-mission')?.addEventListener('click', () => newMission(m, () => missions(main, { query })));
}

function newMission(m, after) {
  const body = modal(`<h2>Nueva misión</h2><form id="nm">
    <div class="field"><label>Título</label><input name="title" required maxlength="120"></div>
    <div class="grid g2">
      <div class="field"><label>Categoría</label><select name="category" required>${m.missionCategories.map(c => `<option value="${c.key}">${c.icon} ${esc(c.label)}</option>`).join('')}</select></div>
      <div class="field"><label>Cupos</label><input name="slots" type="number" min="1" value="10"></div>
      <div class="field"><label>Provincia</label><select name="province">${provinceOptions(m)}</select></div>
      <div class="field"><label>Distrito</label><select name="district">${districtOptions(m, '')}</select></div>
      <div class="field"><label>Inicio</label><input name="starts_at" type="datetime-local" required></div>
      <div class="field"><label>Punto de encuentro</label><input name="meeting_point" maxlength="200"></div>
    </div>
    <div class="field"><label>Descripción</label><textarea name="description" maxlength="1000"></textarea></div>
    <label>Habilidades requeridas</label><div class="chips mb">${m.skills.map(s => `<label class="chip-toggle"><input type="checkbox" name="skills" value="${esc(s)}"><span>${esc(s)}</span></label>`).join('')}</div>
    <div class="row"><button class="btn">Publicar misión</button><button type="button" class="btn ghost" data-close>Cancelar</button></div></form>`);
  const f = body.querySelector('#nm');
  linkProvinceDistrict(m, f.province, f.district);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/missions', { method: 'POST', body: readForm(f) }); closeModal(); toast('Misión publicada'); after(); } catch (err) { toast(err.message, 'error'); }
  });
}

