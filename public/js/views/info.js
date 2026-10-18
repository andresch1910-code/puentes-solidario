// Información oficial: avisos verificados con fuente, sismos en tiempo real, guías y cómo funciona.
import { api, session } from '../api.js';
import { esc, meta, provinceOptions, readForm, toast, timeAgo, fmtDateTime, emergencyBlock } from '../ui.js';

const LEVEL = { info: ['primary', 'ℹ️'], precaucion: ['warn', '⚠️'], alerta: ['warn', '🟠'], emergencia: ['crit', '🚨'] };

export async function info(main, { query }) {
  const m = await meta();
  const province = query.get('province') || '';
  const alerts = await api(`/alerts${province ? `?province=${encodeURIComponent(province)}` : ''}`);
  const coord = session.isCoordinator();

  main.innerHTML = `
    <h1>Información oficial y cómo ayudar</h1>
    <p class="muted">Avisos verificados con su fuente oficial, sismos registrados en tiempo real y guías prácticas. Infórmate solo por canales oficiales y no compartas rumores.</p>

    <div class="split">
      <div>
        <div class="section-head"><h2>📢 Avisos</h2>
          <select id="aprov" style="max-width:240px">${provinceOptions(m, province, { any: true })}</select></div>
        ${coord ? `<details class="card mb"><summary class="btn sm">+ Publicar aviso oficial</summary>
          <form id="af" class="mt">
            <div class="field"><label>Título</label><input name="title" required maxlength="160"></div>
            <div class="field"><label>Contenido</label><textarea name="body" required maxlength="3000"></textarea></div>
            <div class="grid g2">
              <div class="field"><label>Fuente oficial<span class="hint">Ej.: SINAPROC, MINSA, IMHPA</span></label><input name="source" required maxlength="80" list="sources"></div>
              <div class="field"><label>Enlace a la fuente (https://)</label><input name="source_url" type="url" maxlength="300" placeholder="https://"></div>
              <div class="field"><label>Nivel</label><select name="level">${m.alertLevels.map(l => `<option value="${l.key}">${esc(l.label)}</option>`).join('')}</select></div>
              <div class="field"><label>Provincia (vacío = todo el país)</label><select name="province">${provinceOptions(m, '', { placeholder: 'Todo el país' })}</select></div>
            </div>
            <label class="check"><input type="checkbox" name="pinned"> Fijar arriba</label>
            <datalist id="sources">${m.sources.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>
            <button class="btn mt">Publicar</button>
          </form></details>` : ''}
        <div class="stack">${alerts.map(a => {
          const [cls, ico] = LEVEL[a.level] || LEVEL.info;
          return `<article class="card alert-card ${esc(a.level)}">
            <div class="row between"><span class="row"><span class="badge ${cls}">${ico} ${esc(m.alertLevels.find(l => l.key === a.level)?.label || a.level)}</span>
              ${a.pinned ? '<span class="badge">📌 Fijado</span>' : ''}${a.province ? `<span class="badge">${esc(a.province)}</span>` : ''}</span>
              <span class="small muted">${timeAgo(a.published_at)}</span></div>
            <h3 style="margin-top:8px">${esc(a.title)}</h3>
            <p style="white-space:pre-line">${esc(a.body)}</p>
            <div class="row between small"><span>Fuente: <b>${esc(a.source)}</b>${a.source_url ? ` · <a href="${esc(a.source_url)}" target="_blank" rel="noopener">ver fuente original ↗</a>` : ''}</span>
            ${coord ? `<button class="btn sm ghost" data-del="${a.id}">Eliminar</button>` : ''}</div>
          </article>`;
        }).join('') || '<p class="muted">No hay avisos publicados.</p>'}</div>

        <section class="section">
          <h2>🌎 Sismos recientes en Panamá y alrededores</h2>
          <p class="small muted">Datos en tiempo real del Servicio Geológico de EE. UU. (USGS), magnitud 3 o mayor, últimos 30 días.</p>
          <div id="quakes" class="card flat"><div class="skeleton" style="height:120px"></div></div>
        </section>
      </div>

      <aside class="stack">
        ${emergencyBlock()}
        <div class="card"><h3>🏛️ Fuentes oficiales</h3>
          <div class="list">${m.sources.map(s => `<div class="list-item"><div><a href="${esc(s.url)}" target="_blank" rel="noopener"><b>${esc(s.name)}</b> ↗</a><div class="small muted">${esc(s.desc)}</div></div></div>`).join('')}</div>
        </div>
      </aside>
    </div>

    <section class="section">
      <h2>Guías prácticas</h2>
      <div class="grid g2">${m.guides.map(g => `<div class="card"><h3>${g.icon} ${esc(g.title)}</h3><ul style="margin:0;padding-left:20px">${g.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}</div>
    </section>

    <section class="section" id="como-funciona">
      <h2>Cómo funciona Puente Solidario</h2>
      <div class="grid g3">
        <div class="card"><h3>💳 Donar directo a una familia</h3><ol class="small"><li>Entra a <a href="#/ayudar">Familias</a> y elige una familia verificada.</li><li>Pulsa DONAR para ver su Yappy o cuenta (requiere cuenta gratuita).</li><li>Envía desde tu app y registra el aporte. La familia confirma que lo recibió.</li></ol></div>
        <div class="card"><h3>🚚 Llevar ayuda en persona</h3><ol class="small"><li>Elige una necesidad y toca “Yo lo llevo” (reserva por 48 h).</li><li>Escribe por WhatsApp a las familias que aceptan contacto o ve a un centro de acopio.</li><li>Marca “Ya lo entregué” y registra tu visita.</li></ol></div>
        <div class="card"><h3>📝 Reportar una familia</h3><ol class="small"><li>Llena el formulario con los datos de la familia.</li><li>Recibirás un código y un PIN para entregárselos.</li><li>Un coordinador verifica antes de publicar.</li></ol></div>
        <div class="card"><h3>✅ Cómo verificamos</h3><p class="small">Toda solicitud empieza en validación. Un coordinador la revisa (puede llamar), detecta cédulas repetidas y la marca como verificada, que necesita más información o no validada. Ningún sistema automático rechaza solicitudes. Todo queda en un registro de auditoría.</p></div>
        <div class="card"><h3>🔒 Privacidad</h3><p class="small">Públicamente solo se muestra el apellido, la comunidad y lo que la familia contó. Cédulas, teléfonos, direcciones, fotos de documentos y datos de pago solo los ven coordinadores autorizados. El mapa muestra comunidades, nunca viviendas.</p></div>
        <div class="card"><h3>🎯 Prioridad justa</h3><p class="small">Cada familia recibe una prioridad calculada según la gravedad del daño, personas vulnerables, niños en el hogar, cuánto ha recibido y cuánto tiempo lleva esperando. Así la ayuda llega primero a quien más la necesita.</p></div>
      </div>
    </section>

    ${m.demo ? `<section class="section" id="cuentas"><div class="card" style="border-color:var(--warn)">
      <h2>🧪 Cuentas de prueba (modo demostración)</h2>
      <p class="small">Los datos de esta instalación son ficticios. Las cuentas de prueba están documentadas en el archivo <code>server/seed.js</code> y en el <code>README.md</code> del proyecto. Las solicitudes de demostración (PA-DEMOA, PA-DEMOB…) usan el PIN indicado en ese archivo.</p>
      <p class="small">Para empezar con una base limpia: <code>node server/seed.js --reset --empty</code></p>
    </div></section>` : ''}`;

  main.querySelector('#aprov').addEventListener('change', (e) => {
    location.hash = `#/informacion${e.target.value ? `?province=${encodeURIComponent(e.target.value)}` : ''}`;
  });
  main.querySelector('#af')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/alerts', { method: 'POST', body: readForm(e.target) }); toast('Aviso publicado'); info(main, { query }); } catch (err) { toast(err.message, 'error'); }
  });
  main.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este aviso?')) return;
    await api(`/alerts/${b.dataset.del}`, { method: 'DELETE' }); toast('Aviso eliminado'); info(main, { query });
  }));
  if (location.hash.includes('#cuentas')) setTimeout(() => main.querySelector('#cuentas')?.scrollIntoView(), 100);

  const q = await api('/quakes').catch(() => ({ available: false, items: [] }));
  const el = main.querySelector('#quakes');
  if (!el) return;
  if (!q.items.length) {
    el.innerHTML = `<p class="muted small">${q.available ? 'No se registraron sismos de magnitud 3 o mayor en los últimos 30 días.' : 'No se pudo consultar el USGS en este momento (¿sin internet?).'} Consulte también al <a href="https://www.igc.up.ac.pa" target="_blank" rel="noopener">Instituto de Geociencias</a>.</p>`;
    return;
  }
  el.innerHTML = `<div class="list">${q.items.slice(0, 12).map(e => {
    const color = e.mag >= 5 ? 'var(--accent)' : e.mag >= 4 ? 'var(--warn)' : 'var(--primary)';
    return `<div class="list-item"><span class="quake-mag" style="background:${color}22;color:${color}">${e.mag?.toFixed(1)}</span>
      <div style="flex:1"><b>${esc(e.place)}</b><div class="small muted">${fmtDateTime(e.time)} · ${Math.round(e.depth)} km de profundidad</div></div>
      <a class="small" href="${esc(e.url)}" target="_blank" rel="noopener">USGS ↗</a></div>`;
  }).join('')}</div><p class="small muted">Actualizado ${timeAgo(q.fetched_at)} · <a href="#/mapa">ver en el mapa</a></p>`;
}
