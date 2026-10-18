// "Mi solicitud": la familia consulta su estado con código y PIN, responde mensajes
// y confirma lo que recibió (transparencia para donantes).
import { api, session, myCodes, forgetCode, queueSize } from '../api.js';
import { esc, meta, toast, fmtDateTime, fmtMoney, readForm, withBusy, timeAgo } from '../ui.js';

const STATUS_INFO = {
  pending: ['⏳', 'warn', 'Su solicitud está en revisión. Un coordinador la verificará pronto y podría llamarle.'],
  needs_info: ['✍️', 'warn', 'El coordinador necesita más información. Lea el mensaje y responda abajo.'],
  verified: ['✅', 'ok', 'Su solicitud está verificada y publicada. Las personas que quieren ayudar ya pueden verla.'],
  rejected: ['❌', 'crit', 'La solicitud no fue validada. Lea el mensaje del coordinador.'],
  resolved: ['💚', 'ok', 'Su solicitud fue marcada como atendida. ¡Gracias por confirmar lo recibido!'],
};

export async function expediente(main, { query }) {
  if (session.expToken) {
    try { return await dashboard(main); } catch { session.clearExp(); }
  }
  const saved = myCodes();
  const queued = queueSize();
  main.innerHTML = `
    <a class="back" href="#/">← Volver</a>
    <div style="max-width:560px;margin:0 auto">
      <h1>Mi solicitud</h1>
      <p class="muted">Con su <b>código</b> (ej. PA-7GX2K) puede ver el estado. Con su <b>PIN</b> puede responder al coordinador, agregar necesidades y confirmar lo que recibió.</p>
      ${queued ? `<div class="notice warn"><span>📶</span><div>Hay ${queued} solicitud(es) guardadas sin conexión en este teléfono. Se enviarán al volver internet.</div></div>` : ''}
      <form class="card" id="exp-form">
        <div class="field"><label for="e-code">Código de solicitud</label><input id="e-code" name="code" required placeholder="PA-XXXXX" value="${esc(query.get('code') || '')}" style="text-transform:uppercase" autocomplete="off"></div>
        <div class="field"><label for="e-pin">PIN (6 dígitos)</label><input id="e-pin" name="pin" type="password" inputmode="numeric" maxlength="6" placeholder="Opcional para ver solo el estado" autocomplete="off"></div>
        <div class="row"><button class="btn">Entrar</button><button type="button" class="btn ghost" id="only-status">Solo ver estado</button></div>
        <div id="status-out" class="mt"></div>
      </form>
      ${saved.length ? `<div class="card mt"><h3>Solicitudes enviadas desde este dispositivo</h3>
        ${saved.map(c => `<div class="list-item"><div style="flex:1"><b>${esc(c.code)}</b> · PIN ${esc(c.pin)}<div class="small muted">${esc(c.community || '')} · ${timeAgo(c.at)}</div></div>
          <button class="btn sm" data-use="${esc(c.code)}" data-pin="${esc(c.pin)}">Abrir</button><button class="btn sm ghost" data-forget="${esc(c.code)}" aria-label="Olvidar">✕</button></div>`).join('')}
        <p class="small muted">Si este teléfono es compartido, toque ✕ para borrar el código y el PIN de aquí.</p></div>` : ''}
    </div>`;

  const f = main.querySelector('#exp-form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = readForm(f);
    if (!v.pin) return showStatus(main, v.code);
    await withBusy(e.submitter, async () => {
      try {
        const r = await api('/expediente/login', { method: 'POST', body: { code: v.code, pin: v.pin } });
        session.setExp(r.token);
        await dashboard(main);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
  main.querySelector('#only-status').addEventListener('click', () => showStatus(main, f.code.value));
  main.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => {
    f.code.value = b.dataset.use; f.pin.value = b.dataset.pin; f.requestSubmit();
  }));
  main.querySelectorAll('[data-forget]').forEach(b => b.addEventListener('click', () => {
    forgetCode(b.dataset.forget); expediente(main, { query });
  }));
}

async function showStatus(main, code) {
  const out = main.querySelector('#status-out');
  try {
    const s = await api(`/expediente/status/${encodeURIComponent(code.trim())}`);
    const [ico, cls] = STATUS_INFO[s.status];
    out.innerHTML = `<div class="notice ${cls === 'ok' ? 'ok' : 'warn'}"><span>${ico}</span><div><b>${esc(s.code)}: ${esc(s.status_label)}</b><div class="small">Registrada ${fmtDateTime(s.created_at)}</div></div></div>`;
  } catch (e) { out.innerHTML = `<div class="error-msg">${esc(e.message)}</div>`; }
}

async function dashboard(main) {
  const [m, x] = await Promise.all([meta(), api('/expediente', { exp: true })]);
  const [ico, cls, text] = STATUS_INFO[x.status];
  const pendingDon = x.donations.filter(d => !d.confirmed);
  main.innerHTML = `
    <div class="row between"><h1 style="margin:0">Mi solicitud ${esc(x.code)}</h1><button class="btn ghost sm" id="exit">Salir</button></div>
    <p class="muted">${esc(x.family_name)} · ${esc(x.community)}, ${esc(x.district)}, ${esc(x.province)}</p>
    <div class="notice ${cls === 'ok' ? 'ok' : cls === 'crit' ? 'danger' : 'warn'}"><span>${ico}</span><div><b>${esc(x.status_label)}</b><div class="small">${text}</div>
      ${x.status_note ? `<div class="small mt"><b>Mensaje del coordinador:</b> ${esc(x.status_note)}</div>` : ''}</div></div>
    ${x.status === 'verified' ? `<p><a class="btn ghost sm" href="#/familia/${esc(x.code)}">Ver mi ficha pública</a></p>` : ''}

    <div class="split">
      <div class="stack">
        ${pendingDon.length ? `<div class="card" style="border-color:var(--ok)"><h2>💚 Confirme lo que recibió</h2>
          <p class="small muted">Confirmar ayuda a que los donantes confíen y a que la ayuda llegue a más familias.</p>
          ${pendingDon.map(d => `<div class="list-item"><span>${d.kind === 'money' ? '💵' : d.kind === 'purchase' ? '🛒' : '📦'}</span>
            <div style="flex:1"><b>${d.kind === 'money' ? fmtMoney(d.amount) : esc(d.message || 'Entrega')}</b> de ${esc(d.donor_name || 'Anónimo')}
            <div class="small muted">${d.method ? esc(d.method) + ' · ' : ''}${d.reference ? 'Ref. ' + esc(d.reference) + ' · ' : ''}${fmtDateTime(d.created_at)}</div></div>
            <button class="btn sm ok" data-confirm="${d.id}">Sí, lo recibí</button></div>`).join('')}</div>` : ''}

        <div class="card"><h2>Sus necesidades</h2>
          ${x.needs.map(n => `<div class="need-row"><span class="ico">${esc(n.icon)}</span>
            <div class="body"><b>${esc(n.label)}</b><span class="small muted">${n.fulfilled} de ${n.quantity} ${esc(n.unit)} recibidas${n.approved ? '' : ' · en revisión'}${n.claimed ? ` · 🚚 ${esc(n.claimed_name)} se comprometió a llevarlo` : ''}</span></div>
            <div class="acts">${n.missing > 0 ? `<button class="btn sm ghost" data-received="${n.id}" data-qty="${n.quantity}">Ya lo recibí</button>` : '<span class="badge ok">✓</span>'}</div></div>`).join('')}
          <details class="mt"><summary class="btn ghost sm">+ Agregar una necesidad</summary>
            <form id="add-need" class="row mt">
              <select name="catalog_id" style="flex:2;min-width:200px">${m.needs.map(n => `<option value="${n.id}">${n.icon} ${esc(n.label)}</option>`).join('')}</select>
              <input name="quantity" type="number" min="1" value="1" style="width:90px" aria-label="Cantidad">
              <button class="btn sm">Agregar</button></form></details>
        </div>

        <div class="card"><h2>Ayudas recibidas</h2>
          ${x.donations.length ? x.donations.map(d => `<div class="list-item small"><span>${d.confirmed ? '✅' : '⏳'}</span><div style="flex:1">
            ${d.kind === 'money' ? fmtMoney(d.amount) : esc(d.message || 'Entrega')} · ${esc(d.donor_name || 'Anónimo')}<div class="muted">${fmtDateTime(d.created_at)}</div></div></div>`).join('') : '<p class="muted small">Aún no hay ayudas registradas.</p>'}
        </div>
      </div>

      <aside class="stack">
        <div class="card"><h2>Mensajes con el coordinador</h2>
          <div class="timeline">${x.messages.map(msg => `<div class="msg ${msg.sender}"><div class="small muted">${msg.sender === 'family' ? 'Ustedes' : esc(msg.author_name || 'Coordinación')} · ${fmtDateTime(msg.created_at)}</div><div>${esc(msg.body)}</div></div>`).join('') || '<p class="small muted">Sin mensajes todavía.</p>'}</div>
          <form id="msg-form"><div class="field"><label for="msg">Escribir al coordinador</label><textarea id="msg" name="body" required maxlength="1000"></textarea></div><button class="btn">Enviar</button></form>
        </div>
        <div class="card"><h3>Contacto de voluntarios</h3>
          <label class="check"><input type="checkbox" id="allow" ${x.allow_contact ? 'checked' : ''}> Acepto que voluntarios me escriban por WhatsApp para llevar ayuda en persona.</label></div>
      </aside>
    </div>`;

  const reload = () => dashboard(main);
  main.querySelector('#exit').onclick = () => { session.clearExp(); location.hash = '#/mi-solicitud'; expediente(main, { query: new URLSearchParams() }); };
  main.querySelectorAll('[data-confirm]').forEach(b => b.addEventListener('click', async () => {
    await api(`/expediente/donations/${b.dataset.confirm}/confirm`, { method: 'POST', body: { confirmed: true }, exp: true });
    toast('¡Gracias por confirmar!'); reload();
  }));
  main.querySelectorAll('[data-received]').forEach(b => b.addEventListener('click', async () => {
    await api(`/expediente/needs/${b.dataset.received}/received`, { method: 'POST', body: { fulfilled: +b.dataset.qty }, exp: true });
    toast('Marcado como recibido'); reload();
  }));
  main.querySelector('#add-need').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/expediente/needs', { method: 'POST', body: { needs: [readForm(e.target)] }, exp: true });
      toast(r.note); reload();
    } catch (err) { toast(err.message, 'error'); }
  });
  main.querySelector('#msg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await withBusy(e.submitter, async () => {
      try { await api('/expediente/messages', { method: 'POST', body: readForm(e.target), exp: true }); toast('Mensaje enviado'); reload(); } catch (err) { toast(err.message, 'error'); }
    });
  });
  main.querySelector('#allow').addEventListener('change', async (e) => {
    await api('/expediente', { method: 'PATCH', body: { allow_contact: e.target.checked }, exp: true });
    toast(e.target.checked ? 'Los voluntarios podrán escribirle.' : 'Ya no se mostrará su WhatsApp.');
  });
}
