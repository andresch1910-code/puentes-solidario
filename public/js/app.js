// Enrutador y estructura general de la aplicación (SPA con rutas #/...).
import { session, onSession, flushQueue, api, store } from './api.js';
import { $, $$, esc, toast, meta, closeModal } from './ui.js';

const routes = [
  [/^\/$/, 'home', 'home', 'inicio'],
  [/^\/sos$/, 'home', 'sos'],
  [/^\/mas$/, 'home', 'more', 'mas'],
  [/^\/mapa$/, 'map', 'mapView', 'mapa', true],
  [/^\/ayudar$/, 'families', 'list', 'ayudar'],
  [/^\/familia\/([\w-]+)$/, 'families', 'detail', 'ayudar'],
  [/^\/necesito-ayuda$/, 'request-form', 'needHelp'],
  [/^\/reportar$/, 'request-form', 'report'],
  [/^\/mi-solicitud$/, 'expediente', 'expediente'],
  [/^\/voluntarios$/, 'volunteers', 'hub', 'voluntarios'],
  [/^\/registrar-visita$/, 'volunteers', 'visitForm', 'voluntarios'],
  [/^\/misiones$/, 'volunteers', 'missions', 'voluntarios'],
  [/^\/centros$/, 'centers', 'centers', 'centros'],
  [/^\/informacion$/, 'info', 'info', 'informacion'],
  [/^\/estadisticas$/, 'stats', 'stats', 'estadisticas'],
  [/^\/entrar$/, 'account', 'login'],
  [/^\/registro$/, 'account', 'register'],
  [/^\/mi-panel$/, 'account', 'panel'],
  [/^\/perfil$/, 'account', 'profile'],
  [/^\/coordinacion$/, 'admin', 'admin'],
];

let cleanup = null;
let renderId = 0;

async function render() {
  const raw = location.hash.slice(1) || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.split('#')[0] || '/';
  const query = new URLSearchParams(queryPart);
  const main = $('#main');
  const id = ++renderId;

  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignorar */ } }
  cleanup = null;
  closeModal();

  const match = routes.find(([re]) => re.test(path));
  $$('[data-nav]').forEach(a => a.classList.toggle('active', !!match && a.dataset.nav === match[3]));
  if (!match) {
    main.className = '';
    main.innerHTML = '<div class="empty"><div class="big">🧭</div><h2>Página no encontrada</h2><a class="btn" href="#/">Ir al inicio</a></div>';
    return;
  }
  const [re, file, fn, , wide] = match;
  const params = path.match(re).slice(1);
  main.className = wide ? 'wide' : '';
  main.innerHTML = '<div class="skeleton" style="height:240px"></div>';
  try {
    const mod = await import(`./views/${file}.js`);
    if (id !== renderId) return;
    main.innerHTML = '';
    cleanup = await mod[fn](main, { params, query, rerender: render });
  } catch (e) {
    if (id !== renderId) return;
    console.error(e);
    main.innerHTML = `<div class="empty"><div class="big">⚠️</div><h2>No se pudo cargar</h2><p>${esc(e.message)}</p>
      <button class="btn" id="retry">Reintentar</button></div>`;
    $('#retry').onclick = () => location.reload();
  }
  // Mueve el foco al contenido para lectores de pantalla y vuelve arriba.
  if (!location.hash.includes('#', 1)) window.scrollTo(0, 0);
}

function renderAccount(user) {
  const el = $('#account');
  if (!user) {
    el.innerHTML = '<a class="btn sm" href="#/entrar">Entrar</a>';
    return;
  }
  const initials = user.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  el.innerHTML = `
    <details class="account-menu" style="position:relative">
      <summary class="icon-btn" style="list-style:none;display:grid;place-items:center" aria-label="Mi cuenta">${esc(initials)}</summary>
      <div class="card" style="position:absolute;right:0;top:44px;min-width:220px;padding:8px;z-index:60">
        <div style="padding:8px"><b>${esc(user.name)}</b><div class="small muted">${{ admin: 'Administración', coordinator: 'Coordinación', volunteer: 'Voluntariado' }[user.role]}</div></div>
        <a class="btn ghost block sm" href="#/mi-panel">Mi panel</a>
        ${session.isCoordinator() ? '<a class="btn ghost block sm" href="#/coordinacion" style="margin-top:6px">Coordinación</a>' : ''}
        <a class="btn ghost block sm" href="#/perfil" style="margin-top:6px">Mi perfil</a>
        <button class="btn ghost block sm" id="logout" style="margin-top:6px">Cerrar sesión</button>
      </div>
    </details>`;
  $('#logout').onclick = () => { session.clear(); toast('Sesión cerrada'); location.hash = '#/'; };
  el.querySelectorAll('a').forEach(a => a.addEventListener('click', () => el.querySelector('details').open = false));
}

function setupChrome() {
  renderAccount(session.user);
  onSession(renderAccount);

  // Texto grande (accesibilidad).
  if (store.get('ps_big')) document.documentElement.classList.add('big-text');
  $('#font-toggle').onclick = () => {
    const on = document.documentElement.classList.toggle('big-text');
    store.set('ps_big', on);
  };

  // Estado de conexión y envío de solicitudes guardadas sin señal.
  const net = () => { $('#net-status').hidden = navigator.onLine; };
  window.addEventListener('online', () => { net(); sendQueued(); });
  window.addEventListener('offline', net);
  net();
  sendQueued();

  meta().then(m => { $('#demo-banner').hidden = !m.demo; }).catch(() => {});

  // Refresca los datos del usuario (rol, nombre) si hay sesión.
  if (session.token) api('/auth/me').then(u => session.setUser(u)).catch(() => {});

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

function sendQueued() {
  flushQueue((r) => toast(`Solicitud guardada sin conexión enviada. Código ${r.code}. Revísala en "Mi solicitud".`));
}

window.addEventListener('hashchange', render);
setupChrome();
render();
