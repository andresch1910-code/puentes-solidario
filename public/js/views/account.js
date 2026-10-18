// Cuentas: entrar, crear cuenta, panel del voluntario/donante y perfil.
import { api, session } from '../api.js';
import { esc, meta, provinceOptions, districtOptions, linkProvinceDistrict, readForm, toast, withBusy, fmtNum, fmtMoney, fmtDate, fmtDateTime, familyCard, timeAgo } from '../ui.js';

const nextHash = (query) => {
  const n = query.get('next');
  return n && n.startsWith('#/') ? n : '#/mi-panel';
};

export async function login(main, { query }) {
  if (session.user) { location.hash = nextHash(query); return; }
  main.innerHTML = `
    <div style="max-width:440px;margin:0 auto">
      <h1>Entrar</h1>
      <p class="muted">Para donar, comprometerte a llevar ayuda o registrar voluntariado.</p>
      <form class="card" id="lf">
        <div class="field"><label for="le">Correo</label><input id="le" type="email" name="email" required autocomplete="email"></div>
        <div class="field"><label for="lp">Contraseña</label><input id="lp" type="password" name="password" required autocomplete="current-password"></div>
        <button class="btn block">Entrar</button>
        <p class="small center mt">¿No tienes cuenta? <a href="#/registro${query.get('next') ? `?next=${encodeURIComponent(query.get('next'))}` : ''}">Créala gratis</a></p>
      </form>
      <p class="small muted center mt">¿Registraste a tu familia? No necesitas cuenta: entra a <a href="#/mi-solicitud">Mi solicitud</a> con tu código y PIN.</p>
    </div>`;
  main.querySelector('#lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    await withBusy(e.submitter, async () => {
      try {
        const r = await api('/auth/login', { method: 'POST', body: readForm(e.target) });
        session.set(r.token, r.user);
        toast(`¡Hola, ${r.user.name.split(' ')[0]}!`);
        location.hash = nextHash(query);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

function skillsChips(m, selected = []) {
  return `<div class="chips">${m.skills.map(s => `<label class="chip-toggle"><input type="checkbox" name="skills" value="${esc(s)}" ${selected.includes(s) ? 'checked' : ''}><span>${esc(s)}</span></label>`).join('')}</div>`;
}

export async function register(main, { query }) {
  if (session.user) { location.hash = nextHash(query); return; }
  const m = await meta();
  main.innerHTML = `
    <div style="max-width:680px;margin:0 auto">
      <h1>Crear cuenta</h1>
      <p class="muted">Gratis. Te permite donar con seguridad, registrar tus visitas y recibir misiones según tus habilidades.</p>
      <form class="card" id="rf">
        <div class="grid g2">
          <div class="field"><label>Nombre completo</label><input name="name" required maxlength="80" autocomplete="name"></div>
          <div class="field"><label>Teléfono / WhatsApp (opcional)</label><input type="tel" name="phone" maxlength="30" autocomplete="tel"></div>
          <div class="field"><label>Correo</label><input type="email" name="email" required autocomplete="email"></div>
          <div class="field"><label>Contraseña (mín. 8 caracteres)</label><input type="password" name="password" required minlength="8" autocomplete="new-password"></div>
          <div class="field"><label>Provincia donde puedes ayudar</label><select name="province">${provinceOptions(m)}</select></div>
          <div class="field"><label>Distrito</label><select name="district">${districtOptions(m, '')}</select></div>
          <div class="field"><label>Organización o grupo (opcional)</label><input name="organization" maxlength="100"></div>
          <div class="field"><label>Disponibilidad</label><select name="availability"><option value="">Seleccione…</option><option>Fines de semana</option><option>Entre semana</option><option>Tiempo completo</option><option>Solo a distancia</option></select></div>
        </div>
        <label>¿Qué sabes hacer? (opcional)</label>
        ${skillsChips(m)}
        <label class="check mt"><input type="checkbox" name="has_vehicle"> Tengo vehículo para transportar ayuda</label>
        <button class="btn block mt">Crear cuenta</button>
      </form>
    </div>`;
  const f = main.querySelector('#rf');
  linkProvinceDistrict(m, f.province, f.district);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    await withBusy(e.submitter, async () => {
      try {
        const r = await api('/auth/register', { method: 'POST', body: readForm(f) });
        session.set(r.token, r.user);
        toast('¡Bienvenido/a a Puente Solidario! 💚');
        location.hash = nextHash(query);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

export async function panel(main) {
  if (!session.user) { location.hash = '#/entrar?next=%23%2Fmi-panel'; return; }
  const [m, d] = await Promise.all([meta(), api('/my')]);
  const statusBadge = (s) => ({ pending: '<span class="badge warn">En revisión</span>', approved: '<span class="badge ok">Aprobada</span>', rejected: '<span class="badge crit">Rechazada</span>' }[s]);
  main.innerHTML = `
    <div class="section-head"><div><h1 style="margin:0">Hola, ${esc(d.user.name.split(' ')[0])} 👋</h1>
      <p class="muted" style="margin:0">Tu impacto en Puente Solidario</p></div>
      <div class="row"><a class="btn" href="#/registrar-visita">✅ Registrar visita</a>${session.isCoordinator() ? '<a class="btn ghost" href="#/coordinacion">🛡️ Coordinación</a>' : ''}</div></div>
    <div class="grid g4">
      <div class="card kpi primary"><b>${fmtNum(d.impact.people_served)}</b><span>personas atendidas</span></div>
      <div class="card kpi"><b>${fmtNum(d.impact.visits)}</b><span>visitas aprobadas</span></div>
      <div class="card kpi"><b>${fmtNum(d.impact.hours)}</b><span>horas de voluntariado</span></div>
      <div class="card kpi ok"><b>${fmtMoney(d.impact.donations_total)}</b><span>donado · ${d.impact.deliveries} entrega(s)</span></div>
    </div>

    ${d.claims.length ? `<section class="section"><h2>🚚 Te comprometiste a llevar</h2><div class="card flat">
      ${d.claims.map(c => `<div class="need-row"><span class="ico">${esc(c.icon)}</span><div class="body"><b>${esc(c.label)}</b>
        <span class="small muted">${c.quantity - c.fulfilled} ${esc(c.unit)} · ${esc(c.community)}, ${esc(c.province)} · comprometido ${timeAgo(c.claimed_at)} (vence a las 48 h)</span></div>
        <div class="acts"><a class="btn sm" href="#/familia/${esc(c.code)}">Abrir</a></div></div>`).join('')}</div></section>` : ''}

    <section class="section split">
      <div>
        <h2>🎯 Misiones recomendadas para ti</h2>
        ${d.suggestedMissions.length ? `<div class="stack">${d.suggestedMissions.map(x => `<a class="card" href="#/misiones"><b>${esc(x.title)}</b>
          <div class="small muted">📅 ${fmtDateTime(x.starts_at)} · ${esc(x.district || '')}, ${esc(x.province || '')} · ${x.slots - x.taken} cupos</div>
          ${x.skills.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</a>`).join('')}</div>`
          : `<p class="muted">Agrega tus habilidades y provincia en <a href="#/perfil">tu perfil</a> para recibir recomendaciones.</p>`}
        <h2 class="mt">💚 Familias cerca de ti</h2>
        ${d.nearbyFamilies.length ? `<div class="grid g2">${d.nearbyFamilies.map(f => familyCard(f, m)).join('')}</div>` : '<p class="muted">Indica tu provincia en tu perfil para ver familias cercanas.</p>'}
      </div>
      <aside class="stack">
        <div class="card"><h3>Mis misiones</h3>${d.missions.length ? d.missions.map(x => `<div class="list-item small"><span>📅</span><div><b>${esc(x.title)}</b><div class="muted">${fmtDateTime(x.starts_at)} · ${esc(x.meeting_point || '')}</div></div></div>`).join('') : '<p class="small muted">Aún no te inscribes. <a href="#/misiones">Ver misiones</a></p>'}</div>
        <div class="card"><h3>Mis visitas</h3>${d.visits.length ? d.visits.map(v => `<div class="list-item small"><div style="flex:1"><b>${esc(v.community)}</b> · ${fmtDate(v.visit_date)}<div class="muted">${v.people_served} personas · ${v.hours} h</div></div>${statusBadge(v.status)}</div>`).join('') : '<p class="small muted">Sin visitas registradas.</p>'}</div>
        <div class="card"><h3>Mis aportes</h3>${d.donations.length ? d.donations.map(x => `<div class="list-item small"><div style="flex:1"><a href="#/familia/${esc(x.code)}">${esc(x.code)}</a> · ${esc(x.community)}<div class="muted">${x.kind === 'money' ? fmtMoney(x.amount) : esc(x.message || x.kind)} · ${fmtDate(x.created_at)}</div></div>${x.confirmed ? '<span class="badge ok">✓ Recibido</span>' : '<span class="badge">Por confirmar</span>'}</div>`).join('') : '<p class="small muted">Sin aportes todavía.</p>'}</div>
      </aside>
    </section>`;
}

export async function profile(main) {
  if (!session.user) { location.hash = '#/entrar?next=%23%2Fperfil'; return; }
  const [m, u] = await Promise.all([meta(), api('/auth/me')]);
  main.innerHTML = `
    <div style="max-width:680px;margin:0 auto">
      <h1>Mi perfil</h1>
      <form class="card" id="pf">
        <div class="grid g2">
          <div class="field"><label>Nombre</label><input name="name" required maxlength="80" value="${esc(u.name)}"></div>
          <div class="field"><label>Teléfono / WhatsApp</label><input name="phone" maxlength="30" value="${esc(u.phone || '')}"></div>
          <div class="field"><label>Provincia</label><select name="province">${provinceOptions(m, u.province)}</select></div>
          <div class="field"><label>Distrito</label><select name="district">${districtOptions(m, u.province, u.district)}</select></div>
          <div class="field"><label>Organización</label><input name="organization" maxlength="100" value="${esc(u.organization || '')}"></div>
          <div class="field"><label>Disponibilidad</label><input name="availability" maxlength="60" value="${esc(u.availability || '')}"></div>
        </div>
        <label>Habilidades</label>${skillsChips(m, u.skills)}
        <label class="check mt"><input type="checkbox" name="has_vehicle" ${u.has_vehicle ? 'checked' : ''}> Tengo vehículo para transportar ayuda</label>
        <p class="small muted">Correo: ${esc(u.email)}</p>
        <button class="btn">Guardar cambios</button>
      </form>
    </div>`;
  const f = main.querySelector('#pf');
  linkProvinceDistrict(m, f.province, f.district);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const r = await api('/auth/me', { method: 'PATCH', body: readForm(f) }); session.setUser({ ...session.user, ...r }); toast('Perfil actualizado'); } catch (err) { toast(err.message, 'error'); }
  });
}

