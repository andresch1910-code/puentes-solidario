// Panel de coordinación: verificar solicitudes, moderar, aprobar visitas, usuarios y auditoría.
import { api, session } from '../api.js';
import { esc, meta, provinceOptions, toast, readForm, fmtDateTime, timeAgo, empty, withBusy, fmtMoney } from '../ui.js';

const STATUS = {
  pending: ['En validación', 'warn'], needs_info: ['Necesita info', 'warn'], verified: ['Verificada', 'ok'],
  rejected: ['No validada', 'crit'], resolved: ['Atendida', 'ok'],
};
const TABS = [['requests', '📋 Solicitudes'], ['visits', '🤝 Visitas'], ['needs', '🧩 Necesidades nuevas'], ['users', '👥 Usuarios'], ['audit', '🧾 Auditoría']];

export async function admin(main, { query }) {
  if (!session.isCoordinator()) {
    main.innerHTML = empty('🛡️', 'Esta sección es solo para coordinadores autorizados.', session.user ? '' : '<a class="btn" href="#/entrar?next=%23%2Fcoordinacion">Entrar</a>');
    return;
  }
  const tab = query.get('tab') || 'requests';
  const sum = await api('/admin/summary');
  const counts = { requests: (sum.by_status.pending || 0), visits: sum.pending_visits, needs: sum.custom_needs };
  main.innerHTML = `
    <div class="section-head"><div><h1 style="margin:0">Coordinación</h1><p class="muted" style="margin:0">Todo lo que haces aquí queda registrado en la auditoría.</p></div>
      <div class="row"><a class="btn ghost sm" href="#/centros">📦 Centros</a><a class="btn ghost sm" href="#/informacion">📢 Avisos</a><a class="btn ghost sm" href="#/misiones">🤝 Misiones</a>
      <button class="btn sm" id="export">⬇️ Exportar CSV</button></div></div>
    <div class="grid g4 mb">
      <div class="card kpi accent"><b>${sum.by_status.pending || 0}</b><span>por validar</span></div>
      <div class="card kpi"><b>${sum.unanswered}</b><span>familias esperando respuesta</span></div>
      <div class="card kpi"><b>${sum.pending_visits}</b><span>visitas por aprobar</span></div>
      <div class="card kpi"><b>${sum.custom_needs + sum.pending_photos + sum.pending_centers}</b><span>moderación (necesidades, fotos, centros)</span></div>
    </div>
    <div class="tabs">${TABS.map(([k, l]) => `<a href="#/coordinacion?tab=${k}" class="${tab === k ? 'on' : ''}">${l}${counts[k] ? ` (${counts[k]})` : ''}</a>`).join('')}</div>
    <div id="tab"></div>`;
  main.querySelector('#export').addEventListener('click', exportCsv);
  const el = main.querySelector('#tab');
  const views = { requests, visits, needs: customNeeds, users, audit };
  await views[tab](el, query);
}

async function exportCsv() {
  try {
    const res = await api('/admin/export.csv', { raw: true });
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: 'solicitudes-verificadas.csv' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) { toast(e.message, 'error'); }
}

// ---------- Solicitudes ----------
async function requests(el, query) {
  const m = await meta();
  const status = query.get('status') || 'pending';
  el.innerHTML = `
    <div class="admin-layout">
      <div>
        <form class="row mb" id="rf">
          <select name="status" style="flex:1">${[['pending', 'En validación'], ['needs_info', 'Necesita info'], ['verified', 'Verificadas'], ['resolved', 'Atendidas'], ['rejected', 'No validadas'], ['all', 'Todas']]
            .map(([k, l]) => `<option value="${k}" ${k === status ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <select name="province" style="flex:1">${provinceOptions(m, '', { any: true })}</select>
          <input type="search" name="q" placeholder="Código, nombre, cédula, teléfono…" style="flex:2;min-width:180px">
        </form>
        <div class="admin-list" id="rlist"></div>
      </div>
      <div id="rdetail"><div class="card empty">Selecciona una solicitud para revisarla.</div></div>
    </div>`;
  const f = el.querySelector('#rf');
  let current = null;
  const loadList = async () => {
    const v = readForm(f);
    const items = await api(`/admin/requests?${new URLSearchParams(v)}`);
    el.querySelector('#rlist').innerHTML = items.length ? items.map(x => `
      <div class="admin-item ${x.id === current ? 'on' : ''}" data-id="${x.id}">
        <div class="row between"><b>${esc(x.code)}</b><span class="badge ${STATUS[x.status][1]}">${STATUS[x.status][0]}</span></div>
        <div class="small">${esc(x.responsible_name)} · ${esc(x.community)}, ${esc(x.district)}</div>
        <div class="row small muted" style="gap:6px">${timeAgo(x.created_at)} · prioridad ${x.priority_level.label}
          ${x.duplicates ? '<span class="badge crit">⚠️ Cédula repetida</span>' : ''}${x.awaiting_reply ? '<span class="badge primary">💬 Respondió</span>' : ''}${x.source === 'third_party' ? '<span class="badge">Por tercero</span>' : ''}</div>
      </div>`).join('') : '<p class="muted center">No hay solicitudes en esta lista. 🎉</p>';
    el.querySelectorAll('.admin-item').forEach(it => it.addEventListener('click', () => { current = +it.dataset.id; el.querySelectorAll('.admin-item').forEach(x => x.classList.toggle('on', x === it)); loadDetail(current); }));
  };
  const loadDetail = async (id) => {
    const box = el.querySelector('#rdetail');
    box.innerHTML = '<div class="skeleton" style="height:300px"></div>';
    const r = await api(`/admin/requests/${id}`);
    renderDetail(box, r, m, async () => { await loadList(); await loadDetail(id); });
    if (window.innerWidth < 1000) box.scrollIntoView({ behavior: 'smooth' });
  };
  let t;
  f.addEventListener('input', () => { clearTimeout(t); t = setTimeout(loadList, 300); });
  f.addEventListener('change', loadList);
  f.addEventListener('submit', (e) => e.preventDefault());
  await loadList();
}

function renderDetail(box, r, m, refresh) {
  const aff = r.affectations.map(k => m.affectations.find(a => a.key === k)?.label).filter(Boolean);
  const vul = r.vulnerable.map(k => m.vulnerable.find(a => a.key === k)?.label).filter(Boolean);
  box.innerHTML = `
    <div class="card">
      <div class="row between"><h2 style="margin:0">${esc(r.code)} · ${esc(r.family_name)}</h2><span class="badge ${STATUS[r.status][1]}">${STATUS[r.status][0]}</span></div>
      <p class="small muted">Registrada ${fmtDateTime(r.created_at)} · ${r.source === 'third_party' ? `Reportada por ${esc(r.reporter_name || 'tercero')} ${esc(r.reporter_phone || '')}` : 'Registrada por la familia'}${r.coordinator ? ` · Coordinador: ${esc(r.coordinator)}` : ''}</p>
      ${r.duplicates.length ? `<div class="notice danger small"><span>⚠️</span><div><b>Esta cédula aparece en otras solicitudes:</b> ${r.duplicates.map(d => `${esc(d.code)} (${esc(STATUS[d.status][0])}, ${esc(d.community)})`).join(', ')}</div></div>` : ''}

      <div class="grid g2">
        <dl class="private"><dt>Responsable</dt><dd>${esc(r.responsible_name)}</dd><dt>Cédula</dt><dd>${esc(r.cedula)}</dd>
          <dt>Teléfono</dt><dd><a href="tel:${esc(r.contact_phone)}">${esc(r.contact_phone)}</a> · <a target="_blank" rel="noopener" href="https://wa.me/${esc(waNumber(r.contact_phone))}">WhatsApp</a></dd>
          <dt>Dirección</dt><dd>${esc(r.address_private || '—')}</dd>${r.notes_private ? `<dt>Notas privadas</dt><dd>${esc(r.notes_private)}</dd>` : ''}</dl>
        <dl class="private"><dt>Recibe aportes por</dt><dd>${r.payment_method === 'none' ? 'No tiene' : r.payment_method === 'yappy' ? 'Yappy' : 'ACH'}</dd>
          ${r.payment_method !== 'none' ? `<dt>Número</dt><dd>${esc(r.payment_number)}</dd><dt>Titular</dt><dd>${esc(r.payment_holder)}</dd>
          ${r.payment_bank ? `<dt>Banco</dt><dd>${esc(r.payment_bank)} ${esc(r.payment_account_type || '')}</dd>` : ''}
          <dd><label class="check"><input type="checkbox" id="pay-ok" ${r.payment_approved ? 'checked' : ''}> Datos de pago aprobados (titular coincide)</label></dd>` : ''}</dl>
      </div>

      <p class="mt"><b>📍</b> ${esc(r.community)}, ${esc(r.district)}, ${esc(r.province)} · ${r.adults} adultos, ${r.minors} menores</p>
      <div>${aff.map(a => `<span class="tag">${esc(a)}</span>`).join('')}${vul.map(a => `<span class="tag">⚠️ ${esc(a)}</span>`).join('')}</div>
      <div class="field mt"><label>Historia pública (puede editarla para quitar datos privados)</label><textarea id="story">${esc(r.story || '')}</textarea>
        <button class="btn sm ghost" id="save-story" style="margin-top:6px">Guardar historia</button></div>

      <h3>Fotos</h3>
      <div class="gallery" id="photos">${r.photos_all.map(p => `<figure style="margin:0"><img class="img-private" data-photo="${p.id}" alt="${p.kind === 'id' ? 'Cédula' : 'Situación'}">
        <figcaption class="small">${p.kind === 'id' ? '🪪 Cédula (privada)' : `<label class="check"><input type="checkbox" data-approve-photo="${p.id}" ${p.approved ? 'checked' : ''}> Mostrar al público</label>`}</figcaption></figure>`).join('') || '<p class="small muted">Sin fotos.</p>'}</div>

      <h3 class="mt">Necesidades</h3>
      <div class="table-wrap"><table><thead><tr><th>Necesidad</th><th>Cant.</th><th>Recibido</th><th>Compra en tienda</th><th></th></tr></thead><tbody>
        ${r.all_needs.map(n => `<tr data-need="${n.id}">
          <td>${esc(n.icon)} ${esc(n.label)} ${n.approved ? '' : '<span class="badge warn">por aprobar</span>'}${n.detail ? `<div class="small muted">${esc(n.detail)}</div>` : ''}
            ${n.custom ? `<select data-map style="margin-top:4px;min-height:34px;font-size:.85rem"><option value="">Asociar al catálogo…</option>${m.needs.map(c => `<option value="${c.id}">${c.icon} ${esc(c.label)}</option>`).join('')}</select>` : ''}</td>
          <td><input type="number" min="1" value="${n.quantity}" data-qty style="width:70px;min-height:34px"></td>
          <td><input type="number" min="0" value="${n.fulfilled}" data-ful style="width:70px;min-height:34px"></td>
          <td><input placeholder="Tienda" value="${esc(n.store || '')}" data-store style="min-height:34px;width:110px"><input placeholder="Sucursal" value="${esc(n.store_branch || '')}" data-branch style="min-height:34px;width:120px;margin-top:4px">${n.purchased_at ? `<div class="small">✓ Factura ${esc(n.purchase_ref)}</div>` : ''}</td>
          <td><div class="row" style="gap:4px">${n.approved ? '' : '<button class="btn sm ok" data-approve>Aprobar</button>'}<button class="btn sm ghost" data-save>Guardar</button><button class="btn sm ghost" data-del aria-label="Eliminar">✕</button></div></td></tr>`).join('')}
      </tbody></table></div>

      <h3 class="mt">Mensajes con la familia</h3>
      <div class="timeline">${r.messages.map(x => `<div class="msg ${x.sender}"><div class="small muted">${x.sender === 'family' ? 'Familia' : esc(x.author_name)} · ${fmtDateTime(x.created_at)}</div>${esc(x.body)}</div>`).join('') || '<p class="small muted">Sin mensajes.</p>'}</div>
      <form id="msg" class="row"><input name="body" placeholder="Escribir a la familia (lo verá en Mi solicitud)…" required style="flex:1"><button class="btn sm">Enviar</button></form>

      ${r.donations_all.length ? `<h3 class="mt">Aportes registrados</h3>${r.donations_all.map(d => `<div class="small">${d.kind === 'money' ? fmtMoney(d.amount) : esc(d.message || d.kind)} · ${esc(d.donor_name || 'Anónimo')} · ${fmtDateTime(d.created_at)} ${d.confirmed ? '✅' : '⏳'}</div>`).join('')}` : ''}

      <h3 class="mt">Decisión</h3>
      <div class="field"><label>Nota para la familia <span class="hint">Obligatoria si pides más información o no validas.</span></label><textarea id="note" maxlength="1000"></textarea></div>
      <label class="check"><input type="checkbox" id="approve-photos" checked> Al verificar, mostrar también las fotos de la situación</label>
      <div class="row">
        <button class="btn ok" data-status="verified">✓ Verificar y publicar</button>
        <button class="btn ghost" data-status="needs_info">Pedir más información</button>
        <button class="btn ghost" data-status="resolved">Marcar atendida</button>
        <button class="btn danger" data-status="rejected">No validar</button>
      </div>

      <details class="mt"><summary class="small muted">Historial de auditoría (${r.audit.length})</summary>
        ${r.audit.map(a => `<div class="small">${fmtDateTime(a.created_at)} · ${esc(a.user_name || 'Sistema/Familia')} · ${esc(a.action)}</div>`).join('')}</details>
    </div>`;

  // Fotos privadas: se piden con el token y se muestran como blob.
  box.querySelectorAll('[data-photo]').forEach(async (img) => {
    try { const res = await api(`/admin/photos/${img.dataset.photo}`, { raw: true }); img.src = URL.createObjectURL(await res.blob()); } catch { img.alt = 'No disponible'; }
  });
  box.querySelectorAll('[data-approve-photo]').forEach(cb => cb.addEventListener('change', async () => {
    await api(`/admin/photos/${cb.dataset.approvePhoto}`, { method: 'POST', body: { approved: cb.checked } }); toast('Foto actualizada');
  }));
  box.querySelector('#pay-ok')?.addEventListener('change', async (e) => {
    await api(`/admin/requests/${r.id}`, { method: 'PATCH', body: { payment_approved: e.target.checked } }); toast('Datos de pago actualizados');
  });
  box.querySelector('#save-story').addEventListener('click', async () => {
    await api(`/admin/requests/${r.id}`, { method: 'PATCH', body: { story: box.querySelector('#story').value } }); toast('Historia guardada');
  });
  box.querySelectorAll('tr[data-need]').forEach(tr => {
    const id = tr.dataset.need;
    tr.querySelector('[data-save]').addEventListener('click', async () => {
      const body = { quantity: tr.querySelector('[data-qty]').value, fulfilled: tr.querySelector('[data-ful]').value, store: tr.querySelector('[data-store]').value, store_branch: tr.querySelector('[data-branch]').value };
      const map = tr.querySelector('[data-map]')?.value;
      if (map) body.catalog_id = map;
      await api(`/admin/needs/${id}`, { method: 'PATCH', body }); toast('Necesidad guardada'); refresh();
    });
    tr.querySelector('[data-approve]')?.addEventListener('click', async () => {
      const map = tr.querySelector('[data-map]')?.value;
      await api(`/admin/needs/${id}`, { method: 'PATCH', body: map ? { catalog_id: map } : { approved: true } }); toast('Necesidad aprobada'); refresh();
    });
    tr.querySelector('[data-del]').addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta necesidad?')) return;
      await api(`/admin/needs/${id}`, { method: 'DELETE' }); refresh();
    });
  });
  box.querySelector('#msg').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api(`/admin/requests/${r.id}/messages`, { method: 'POST', body: readForm(e.target) }); toast('Mensaje enviado'); refresh();
  });
  box.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', async () => {
    await withBusy(b, async () => {
      try {
        await api(`/admin/requests/${r.id}/status`, { method: 'POST', body: { status: b.dataset.status, note: box.querySelector('#note').value, approve_photos: box.querySelector('#approve-photos').checked } });
        toast(`Solicitud: ${STATUS[b.dataset.status][0]}`); refresh();
      } catch (e) { toast(e.message, 'error'); }
    });
  }));
}

const waNumber = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 8 ? '507' + d : d; };

// ---------- Visitas ----------
async function visits(el, query) {
  const status = query.get('vstatus') || 'pending';
  const list = await api(`/admin/visits?status=${status}`);
  el.innerHTML = `
    <div class="tabs">${[['pending', 'Por aprobar'], ['approved', 'Aprobadas'], ['rejected', 'Rechazadas']].map(([k, l]) => `<a href="#/coordinacion?tab=visits&vstatus=${k}" class="${k === status ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div class="card flat table-wrap"><table><thead><tr><th>Fecha</th><th>Voluntario/a</th><th>Comunidad</th><th>Atendidos</th><th>Detalle</th><th></th></tr></thead><tbody>
    ${list.map(v => `<tr><td>${esc(v.visit_date)}</td><td>${esc(v.volunteer_name)}<div class="small muted">${esc(v.organization || '')}</div></td>
      <td><b>${esc(v.community)}</b><div class="small muted">${esc(v.district)}, ${esc(v.province)}</div></td>
      <td>${v.people_served} pers. · ${v.families_served} fam. · ${v.hours} h</td>
      <td class="small">${v.aid_types.map(a => `<span class="tag">${esc(a)}</span>`).join('')}${v.pending_needs ? `<div>Falta: ${esc(v.pending_needs)}</div>` : ''}${v.notes ? `<div class="muted">${esc(v.notes)}</div>` : ''}</td>
      <td>${status === 'pending' ? `<div class="row" style="gap:4px"><button class="btn sm ok" data-v="${v.id}" data-s="approved">Aprobar</button><button class="btn sm ghost" data-v="${v.id}" data-s="rejected">Rechazar</button></div>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted center">Nada pendiente. 🎉</td></tr>'}
    </tbody></table></div>`;
  el.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', async () => {
    await api(`/admin/visits/${b.dataset.v}`, { method: 'POST', body: { status: b.dataset.s } }); toast('Visita actualizada'); visits(el, query);
  }));
}

// ---------- Necesidades escritas por familias ----------
async function customNeeds(el) {
  const [m, list] = await Promise.all([meta(), api('/admin/custom-needs')]);
  el.innerHTML = `<p class="muted small">Las familias pueden escribir necesidades que no están en el catálogo. Asócialas a una categoría existente para mantener el catálogo ordenado, o apruébalas tal cual.</p>
    <div class="card flat table-wrap"><table><thead><tr><th>Necesidad escrita</th><th>Solicitud</th><th>Cant.</th><th>Acción</th></tr></thead><tbody>
    ${list.map(n => `<tr data-id="${n.id}"><td><b>${esc(n.label)}</b></td><td>${esc(n.code)} · ${esc(n.community)}</td><td>${n.quantity}</td>
      <td><div class="row" style="gap:6px"><select data-map style="min-height:34px;max-width:220px"><option value="">Asociar a…</option>${m.needs.map(c => `<option value="${c.id}">${c.icon} ${esc(c.label)}</option>`).join('')}</select>
      <button class="btn sm ok" data-ok>Aprobar</button><button class="btn sm ghost" data-del>Descartar</button></div></td></tr>`).join('') || '<tr><td colspan="4" class="muted center">No hay necesidades por revisar.</td></tr>'}
    </tbody></table></div>`;
  el.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.querySelector('[data-ok]').addEventListener('click', async () => {
      const map = tr.querySelector('[data-map]').value;
      await api(`/admin/needs/${tr.dataset.id}`, { method: 'PATCH', body: map ? { catalog_id: map } : { approved: true } }); toast('Aprobada'); customNeeds(el);
    });
    tr.querySelector('[data-del]').addEventListener('click', async () => { await api(`/admin/needs/${tr.dataset.id}`, { method: 'DELETE' }); customNeeds(el); });
  });
}

// ---------- Usuarios ----------
async function users(el) {
  const list = await api('/admin/users');
  const isAdmin = session.user.role === 'admin';
  el.innerHTML = `${isAdmin ? '' : '<p class="small muted">Solo los administradores pueden cambiar roles.</p>'}
    <div class="card flat table-wrap"><table><thead><tr><th>Nombre</th><th>Contacto</th><th>Provincia</th><th>Habilidades</th><th>Rol</th><th>Activa</th></tr></thead><tbody>
    ${list.map(u => `<tr><td><b>${esc(u.name)}</b><div class="small muted">${esc(u.organization || '')} · desde ${timeAgo(u.created_at)}</div></td>
      <td class="small">${esc(u.email)}<br>${esc(u.phone || '')}</td><td>${esc(u.province || '—')}</td>
      <td class="small">${u.skills.map(s => `<span class="tag">${esc(s)}</span>`).join('')}${u.has_vehicle ? '<span class="tag">🚙 Vehículo</span>' : ''}</td>
      <td>${isAdmin && u.id !== session.user.id ? `<select data-role="${u.id}" style="min-height:34px">${['volunteer', 'coordinator', 'admin'].map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${{ volunteer: 'Voluntario/a', coordinator: 'Coordinador/a', admin: 'Admin' }[r]}</option>`).join('')}</select>`
        : esc({ volunteer: 'Voluntario/a', coordinator: 'Coordinador/a', admin: 'Admin' }[u.role])}</td>
      <td>${isAdmin && u.id !== session.user.id ? `<input type="checkbox" data-active="${u.id}" ${u.active ? 'checked' : ''} aria-label="Cuenta activa">` : (u.active ? 'Sí' : 'No')}</td></tr>`).join('')}
    </tbody></table></div>`;
  el.querySelectorAll('[data-role]').forEach(s => s.addEventListener('change', async () => {
    try { await api(`/admin/users/${s.dataset.role}`, { method: 'PATCH', body: { role: s.value } }); toast('Rol actualizado'); } catch (e) { toast(e.message, 'error'); }
  }));
  el.querySelectorAll('[data-active]').forEach(cb => cb.addEventListener('change', async () => {
    try { await api(`/admin/users/${cb.dataset.active}`, { method: 'PATCH', body: { active: cb.checked } }); toast(cb.checked ? 'Cuenta activada' : 'Cuenta desactivada'); } catch (e) { toast(e.message, 'error'); }
  }));
}

// ---------- Auditoría ----------
async function audit(el) {
  const list = await api('/admin/audit');
  el.innerHTML = `<div class="card flat table-wrap"><table><thead><tr><th>Fecha</th><th>Persona</th><th>Acción</th><th>Objeto</th></tr></thead><tbody>
    ${list.map(a => `<tr><td class="small">${fmtDateTime(a.created_at)}</td><td>${esc(a.user_name || 'Familia / sistema')}</td><td><code>${esc(a.action)}</code></td><td class="small">${esc(a.entity || '')} ${a.entity_id ?? ''}</td></tr>`).join('')}
    </tbody></table></div>`;
}
