import { api, session } from '../api.js';
import {
  esc, meta, familyCard, provinceOptions, districtOptions, linkProvinceDistrict, toast, modal, closeModal,
  fmtMoney, timeAgo, empty, loading, readForm, withBusy, fmtDate,
} from '../ui.js';

const TABS = [
  ['donar', '💳 Donar a una familia'],
  ['entrega', '🚚 Llevar ayuda en persona'],
  ['comprar', '🛒 Comprar artículos'],
];

export async function list(main, { query }) {
  const m = await meta();
  const tab = query.get('tab') || (query.get('store') === '1' ? 'comprar' : 'donar');
  const f = {
    q: query.get('q') || '', province: query.get('province') || '', district: query.get('district') || '',
    community: query.get('community') || '', need: query.get('need') || '', sort: query.get('sort') || 'priority',
  };
  main.innerHTML = `
    <h1>Quiero ayudar</h1>
    <p class="muted">Todas las familias fueron verificadas por un coordinador. Primero aparecen las de mayor prioridad (gravedad, vulnerabilidad y cuánta ayuda han recibido).</p>
    <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<a role="tab" href="#/ayudar?tab=${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div class="notice ${tab === 'donar' ? '' : 'ok'}"><span>${tab === 'donar' ? '💡' : tab === 'entrega' ? '🚚' : '🛒'}</span><div class="small">${{
      donar: '<b>La plataforma NO recibe dinero.</b> Envías tu aporte directo al Yappy o cuenta de la familia. Verifica siempre que el titular coincida y nunca envíes dinero a otra cuenta que te pidan por mensaje.',
      entrega: 'Toca <b>“Yo lo llevo”</b> en una necesidad para comprometerte durante 48 horas. Así otros voluntarios saben que ya está cubierta y la ayuda se reparte mejor. Solo verás el WhatsApp de familias que aceptaron contacto.',
      comprar: 'Compras directamente en la tienda con tu tarjeta, registras la factura y la familia retira el artículo en la sucursal indicada. La plataforma no vende ni cobra nada.',
    }[tab]}</div></div>
    <form class="filters" id="filters">
      <input type="search" name="q" placeholder="Buscar comunidad, código o historia…" value="${esc(f.q)}" class="full" aria-label="Buscar">
      <select name="province" aria-label="Provincia">${provinceOptions(m, f.province, { any: true })}</select>
      <select name="district" aria-label="Distrito">${districtOptions(m, f.province, f.district, { any: true })}</select>
      <select name="need" aria-label="Necesidad"><option value="">Todas las necesidades</option>
        ${m.needs.map(n => `<option value="${n.id}" ${String(n.id) === f.need ? 'selected' : ''}>${n.icon} ${esc(n.label)}</option>`).join('')}</select>
      <select name="sort" aria-label="Ordenar">
        <option value="priority" ${f.sort === 'priority' ? 'selected' : ''}>Mayor prioridad</option>
        <option value="least_helped" ${f.sort === 'least_helped' ? 'selected' : ''}>Menos ayuda recibida</option>
        <option value="recent" ${f.sort === 'recent' ? 'selected' : ''}>Más recientes</option>
      </select>
    </form>
    ${f.community ? `<p>Mostrando comunidad <b>${esc(f.community)}</b> · <a href="#/ayudar?tab=${tab}">quitar filtro</a></p>` : ''}
    <div id="results">${loading(6)}</div>`;

  const form = main.querySelector('#filters');
  linkProvinceDistrict(m, form.province, form.district, { any: true });
  let t;
  const load = async () => {
    const v = readForm(form);
    const p = new URLSearchParams({ ...v, limit: 200 });
    if (f.community) p.set('community', f.community);
    if (tab === 'entrega') p.set('contact', '1');
    if (tab === 'comprar') p.set('store', '1');
    for (const [k, val] of [...p]) if (!val) p.delete(k);
    const res = await api(`/requests?${p}`);
    const el = main.querySelector('#results');
    if (!res.items.length) { el.innerHTML = empty('🔍', 'No hay familias con estos filtros.'); return; }
    if (tab === 'comprar') { el.innerHTML = res.items.map(x => storeCard(x)).join(''); bindPurchase(el, load); return; }
    el.innerHTML = `<p class="small muted">${res.total} familia${res.total === 1 ? '' : 's'}</p><div class="grid g3">${res.items.map(x => familyCard(x, m)).join('')}</div>`;
  };
  form.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 300); });
  form.addEventListener('change', load);
  form.addEventListener('submit', e => { e.preventDefault(); load(); });
  await load();
}

function storeCard(f) {
  const items = f.needs.filter(n => n.store);
  return `<div class="card" style="margin-bottom:12px">
    <div class="row between"><div><h3 style="margin:0"><a href="#/familia/${esc(f.code)}">${esc(f.family_name)}</a></h3>
    <div class="small muted">📍 ${esc(f.community)}, ${esc(f.province)} · ${f.adults} adultos, ${f.minors} menores</div></div>
    <span class="badge ok">✓ Verificada</span></div>
    ${f.story ? `<p class="small" style="margin-top:8px">“${esc(f.story)}”</p>` : ''}
    <div class="small muted">${items.filter(i => i.purchased).length} de ${items.length} comprados</div>
    ${items.map(n => `<div class="need-row"><span class="ico">${esc(n.icon)}</span>
      <div class="body"><b>${esc(n.label)}</b><span class="small muted">${esc(n.store)} · retiro en ${esc(n.store_branch || 'sucursal')}</span></div>
      <div class="acts">${n.purchased ? '<span class="badge ok">Comprado ✓</span>' : `<button class="btn sm" data-buy="${n.id}" data-label="${esc(n.label)}" data-store="${esc(n.store)}">Lo compro</button>`}</div></div>`).join('')}
  </div>`;
}

function requireLogin(msg = 'Para ver los datos de pago o comprometerte a ayudar, entra con tu cuenta. Así protegemos a las familias de estafas.') {
  if (session.user) return true;
  modal(`<h2>Entra para continuar</h2><p>${msg}</p>
    <div class="row"><a class="btn" href="#/entrar?next=${encodeURIComponent(location.hash)}" data-close>Entrar</a>
    <a class="btn ghost" href="#/registro?next=${encodeURIComponent(location.hash)}" data-close>Crear cuenta gratis</a></div>`);
  return false;
}

function bindPurchase(root, after) {
  root.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
    if (!requireLogin()) return;
    const body = modal(`<h2>🛒 Comprar ${esc(b.dataset.label)}</h2>
      <ol class="small"><li>Compra el artículo en <b>${esc(b.dataset.store)}</b> (en línea o en tienda) indicando retiro en la sucursal.</li>
      <li>Registra aquí el número de factura u orden.</li><li>El coordinador avisa a la familia para que lo retire.</li></ol>
      <form id="buy-form"><div class="field"><label>Número de factura u orden</label><input name="reference" required maxlength="60"></div>
      <div class="field"><label>Monto (opcional)</label><input name="amount" type="number" min="0" step="0.01"></div>
      <div class="row"><button class="btn">Registrar compra</button><button type="button" class="btn ghost" data-close>Cancelar</button></div></form>`);
    body.querySelector('#buy-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await withBusy(e.submitter, async () => {
        try {
          await api(`/needs/${b.dataset.buy}/purchase`, { method: 'POST', body: readForm(e.target) });
          closeModal(); toast('¡Gracias! Compra registrada.'); after();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  }));
}

export async function detail(main, { params }) {
  const m = await meta();
  const code = params[0];
  let f;
  try { f = await api(`/requests/${encodeURIComponent(code)}`); } catch (e) {
    main.innerHTML = empty('🔎', esc(e.message), '<a class="btn" href="#/ayudar">Ver familias</a>');
    return;
  }
  const aff = f.affectations.map(k => m.affectations.find(a => a.key === k)?.label).filter(Boolean);
  const vul = f.vulnerable.map(k => m.vulnerable.find(a => a.key === k)?.label).filter(Boolean);
  const me = session.user;

  main.innerHTML = `
    <a class="back" href="#/ayudar">← Volver</a>
    <div class="split">
      <div>
        <div class="card">
          <div class="row between"><h1 style="margin:0">${esc(f.family_name)}</h1>
          <div class="row"><span class="badge ok">✓ ${esc(f.status_label)}</span><span class="badge ${f.priority_level.key}">Prioridad ${f.priority_level.label}</span></div></div>
          <p class="muted" style="margin-top:6px">${esc(f.code)} · 📍 ${esc(f.community)}, ${esc(f.district)}, ${esc(f.province)} · ${f.adults} adulto${f.adults === 1 ? '' : 's'}, ${f.minors} menor${f.minors === 1 ? '' : 'es'}</p>
          <div>${aff.map(a => `<span class="tag">${esc(a)}</span>`).join('')}${vul.map(a => `<span class="tag">⚠️ ${esc(a)}</span>`).join('')}</div>
          ${f.story ? `<blockquote style="margin:14px 0;padding:12px 16px;background:var(--surface-2);border-radius:12px">“${esc(f.story)}”</blockquote>` : ''}
          ${f.photos.length ? `<div class="gallery">${f.photos.map(id => `<img src="/api/photos/${id}" alt="Foto de la situación" loading="lazy">`).join('')}</div>` : ''}
          <p class="small muted" style="margin-top:10px">Verificada ${timeAgo(f.verified_at)} · ${f.source === 'third_party' ? 'Reportada por un voluntario o vecino' : 'Registrada por la familia'}
          · ${f.visits?.n ? `🤝 ${f.visits.n} visita(s) de voluntarios a la comunidad, última ${fmtDate(f.visits.last)}` : '⚠️ Ningún voluntario ha reportado visitas a esta comunidad'}</p>
        </div>

        <div class="card mt">
          <div class="row between"><h2 style="margin:0">Lo que necesitan</h2><span class="small muted">${f.progress}% cubierto</span></div>
          <div class="progress" style="margin:10px 0 4px"><i style="width:${f.progress}%"></i></div>
          <div id="needs">${f.needs.map(n => needRow(n, me)).join('')}</div>
        </div>
      </div>

      <aside class="stack">
        <div class="card">
          <h2>💚 Apoyar a esta familia</h2>
          <p class="small">Puedes enviar un aporte en dinero directo para que compre lo que necesita.</p>
          ${f.has_payment ? '<button class="btn block danger" id="donate" style="font-size:1.1rem">DONAR</button>' : '<p class="notice warn small">Esta familia aún no tiene datos de pago aprobados. Puedes ayudar llevando artículos.</p>'}
          ${f.allow_contact ? '<button class="btn ghost block" id="whatsapp" style="margin-top:8px">💬 Escribir por WhatsApp para llevar ayuda</button>' : ''}
          <button class="btn ghost block" id="share" style="margin-top:8px">🔗 Compartir</button>
          <div class="notice small" style="margin-bottom:0"><span>💡</span><div><b>No recibimos dinero.</b> El aporte va directo al Yappy o cuenta a nombre del titular que aparece en su ficha.</div></div>
        </div>
        <div class="card">
          <h3>Transparencia</h3>
          <p><b>${fmtMoney(f.donations.total)}</b> en ${f.donations.count} aporte(s) registrados · <b>${f.donations.confirmed}</b> confirmado(s) por la familia</p>
          <div class="list">${f.recent_donations.map(d => `<div class="list-item small"><span>${d.kind === 'money' ? '💵' : d.kind === 'purchase' ? '🛒' : '📦'}</span>
            <div style="flex:1">${esc(d.donor_name)} ${d.kind === 'money' ? `aportó ${fmtMoney(d.amount)}` : d.kind === 'purchase' ? 'compró un artículo' : 'entregó ayuda'}
            <div class="muted">${timeAgo(d.created_at)}</div></div>${d.confirmed ? '<span class="badge ok" title="La familia confirmó que lo recibió">✓ Recibido</span>' : '<span class="badge">Por confirmar</span>'}</div>`).join('') || '<p class="small muted">Aún no hay aportes. ¡Sé la primera persona en ayudar!</p>'}</div>
        </div>
      </aside>
    </div>`;

  const reload = () => detail(main, { params });
  main.querySelector('#donate')?.addEventListener('click', () => donate(f, reload));
  main.querySelector('#whatsapp')?.addEventListener('click', async () => {
    if (!requireLogin()) return;
    try {
      const info = await api(`/requests/${f.code}/donor-info`);
      if (!info.whatsapp) return toast('Esta familia no tiene WhatsApp disponible.', 'error');
      const text = `Hola, le escribo de Puente Solidario por la solicitud ${f.code}. Quisiera llevarles ayuda.`;
      window.open(`https://wa.me/${info.whatsapp}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    } catch (e) { toast(e.message, 'error'); }
  });
  main.querySelector('#share').addEventListener('click', async () => {
    const url = location.href;
    const text = `${f.family_name} en ${f.community} necesita ayuda. Familia verificada en Puente Solidario.`;
    if (navigator.share) { try { await navigator.share({ title: 'Puente Solidario', text, url }); } catch { /* cancelado */ } } else {
      await navigator.clipboard?.writeText(url); toast('Enlace copiado');
    }
  });
  main.querySelector('#needs').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (!requireLogin('Entra con tu cuenta para comprometerte a llevar esta ayuda.')) return;
    const id = b.dataset.id;
    try {
      if (b.dataset.act === 'claim') { await api(`/needs/${id}/claim`, { method: 'POST' }); toast('¡Gracias! Tienes 48 horas para llevarlo.'); }
      if (b.dataset.act === 'unclaim') { await api(`/needs/${id}/unclaim`, { method: 'POST' }); toast('Liberaste el compromiso.'); }
      if (b.dataset.act === 'delivered') { await api(`/needs/${id}/delivered`, { method: 'POST', body: {} }); toast('Entrega registrada. La familia la confirmará.'); }
      reload();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function needRow(n, me) {
  const mine = n.claimed_by_me;
  let acts = '';
  if (n.missing === 0) acts = '<span class="badge ok">Cubierto ✓</span>';
  else if (n.claimed && !mine) acts = `<span class="badge warn" title="Compromiso vigente por 48 h">🚚 ${esc(n.claimed_name)} lo lleva</span>`;
  else if (mine) acts = `<button class="btn sm ok" data-act="delivered" data-id="${n.id}">Ya lo entregué</button><button class="btn sm ghost" data-act="unclaim" data-id="${n.id}">Liberar</button>`;
  else acts = `<button class="btn sm ghost" data-act="claim" data-id="${n.id}">🚚 Yo lo llevo</button>`;
  return `<div class="need-row"><span class="ico">${esc(n.icon)}</span>
    <div class="body"><b>${esc(n.label)}</b><span class="small muted">${n.missing ? `Faltan ${n.missing} ${esc(n.unit)}` : 'Completado'}${n.fulfilled ? ` · recibidas ${n.fulfilled}` : ''}${n.detail ? ` · ${esc(n.detail)}` : ''}</span>
    ${n.store && !n.purchased ? `<span class="small">🛒 Disponible para comprar en ${esc(n.store)} · <a href="#/ayudar?tab=comprar">comprar</a></span>` : ''}</div>
    <div class="acts">${acts}</div></div>`;
}

async function donate(f, after) {
  if (!requireLogin()) return;
  let info;
  try { info = await api(`/requests/${f.code}/donor-info`); } catch (e) { return toast(e.message, 'error'); }
  const p = info.payment;
  if (!p) return toast('Los datos de pago aún no están aprobados.', 'error');
  const body = modal(`
    <h2>Donar a ${esc(f.family_name)}</h2>
    <div class="notice warn small"><span>🛡️</span><div>Verifica que el <b>titular</b> coincida. Nunca envíes dinero a otra cuenta que te pidan por mensaje.</div></div>
    <dl class="pay-box">
      <dt>Método</dt><dd>${p.method === 'yappy' ? '📱 Yappy' : '🏦 Transferencia ACH'}</dd>
      <dt>${p.method === 'yappy' ? 'Número de Yappy' : 'Número de cuenta'}</dt><dd><span id="pay-number">${esc(p.number)}</span> <button class="btn sm ghost" id="copy">Copiar</button></dd>
      ${p.bank ? `<dt>Banco</dt><dd>${esc(p.bank)}${p.account_type ? ` · ${esc(p.account_type)}` : ''}</dd>` : ''}
      <dt>Titular</dt><dd>${esc(p.holder)}</dd>
    </dl>
    <h3 class="mt">Después de enviar, registra tu aporte</h3>
    <p class="small muted">Así la familia puede confirmarlo y todos ven cuánta ayuda ha llegado.</p>
    <form id="don-form">
      <div class="grid g2"><div class="field"><label>Monto enviado (USD)</label><input name="amount" type="number" min="1" step="0.01" required></div>
      <div class="field"><label>Referencia (opcional)</label><input name="reference" maxlength="60" placeholder="N.º de confirmación"></div></div>
      <div class="field"><label>Mensaje para la familia (opcional)</label><input name="message" maxlength="300" placeholder="¡Fuerza, estamos con ustedes!"></div>
      <label class="check"><input type="checkbox" name="anonymous"> Mostrar mi aporte como anónimo</label>
      <input type="hidden" name="method" value="${esc(p.method)}">
      <div class="row mt"><button class="btn">Registrar aporte</button><button type="button" class="btn ghost" data-close>Cerrar</button></div>
    </form>`);
  body.querySelector('#copy').addEventListener('click', async (e) => {
    e.preventDefault();
    await navigator.clipboard?.writeText(p.number);
    toast('Número copiado');
  });
  body.querySelector('#don-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await withBusy(e.submitter, async () => {
      try {
        await api(`/requests/${f.code}/donations`, { method: 'POST', body: { ...readForm(e.target), kind: 'money' } });
        closeModal(); toast('¡Gracias por tu aporte! 💚'); after();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}
