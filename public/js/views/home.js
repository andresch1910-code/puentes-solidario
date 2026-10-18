import { api } from '../api.js';
import { esc, meta, fmtNum, familyCard, emergencyBlock, timeAgo, bars } from '../ui.js';
import { createMap, communityMarker, centerMarker } from '../map.js';

const ACTIONS = [
  ['#/necesito-ayuda', '🆘', 'Necesito ayuda', 'Registra a tu familia y lo que necesitan. Lo verificamos y lo publicamos.', 'urgent'],
  ['#/ayudar', '💚', 'Donar directo a una familia', 'Elige una familia verificada y envía tu aporte a su Yappy o cuenta. Sin comisiones.'],
  ['#/ayudar?tab=entrega', '🚚', 'Llevar ayuda en persona', 'Comprométete a llevar algo concreto para que nadie lleve lo mismo dos veces.'],
  ['#/reportar', '📝', 'Reportar una familia', 'Para voluntarios o vecinos: registra a una familia sin internet.'],
  ['#/misiones', '🤝', 'Ser voluntario', 'Súmate a misiones según tus habilidades: entregas, acopio, salud, reconstrucción.'],
  ['#/centros', '📦', 'Centros de acopio y albergues', 'Dónde llevar donaciones en especie, albergues, agua y puntos de carga.'],
];

export async function home(main) {
  const [m, stats, fam, map, alerts] = await Promise.all([
    meta(), api('/stats'), api('/requests?limit=6&sort=priority'), api('/map'), api('/alerts').catch(() => []),
  ]);
  const top = alerts[0];
  main.innerHTML = `
    <section class="hero">
      <span class="eyebrow">Respuesta a emergencias · Panamá</span>
      <h1>Ayuda que llega directo a quien la necesita</h1>
      <p>Conectamos a familias afectadas con donantes, voluntarios, centros de acopio e información oficial. Cada solicitud la verifica un coordinador antes de publicarse.</p>
      <div class="row">
        <a class="btn light" href="#/necesito-ayuda">Necesito ayuda</a>
        <a class="btn outline-light" href="#/ayudar">Quiero ayudar</a>
        <a class="btn outline-light" href="#/mapa">Ver mapa</a>
      </div>
    </section>

    ${top ? `<a href="#/informacion" class="card alert-card ${esc(top.level)}" style="display:block;text-decoration:none;color:inherit;margin-bottom:18px">
      <div class="row between"><span class="badge ${top.level === 'info' ? 'primary' : 'warn'}">📢 Aviso · ${esc(top.source)}</span><span class="small muted">${timeAgo(top.published_at)}</span></div>
      <h3 style="margin-top:8px">${esc(top.title)}</h3><span class="small">Ver toda la información oficial →</span></a>` : ''}

    <div class="actions">
      ${ACTIONS.map(([href, ico, t, d, cls]) => `<a class="card action ${cls || ''}" href="${href}"><span class="ico">${ico}</span><div><strong>${t}</strong><span>${d}</span></div></a>`).join('')}
    </div>

    <section class="section">
      <div class="grid g4">
        <div class="card kpi accent"><b>${fmtNum(stats.people)}</b><span>Personas afectadas</span></div>
        <div class="card kpi"><b>${fmtNum(stats.families)}</b><span>Familias verificadas</span></div>
        <div class="card kpi"><b>${fmtNum(stats.communities)}</b><span>Comunidades</span></div>
        <div class="card kpi ok"><b>${stats.fulfillment}%</b><span>Necesidades cubiertas</span></div>
      </div>
      <p class="small muted mt">Cifras de solicitudes verificadas. Además, ${stats.pending_validation} solicitud(es) están en validación. <a href="#/estadisticas">Ver transparencia</a></p>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>Mapa de la emergencia</h2><p class="muted" style="margin:0">Comunidades con familias verificadas y centros de ayuda. Se muestran comunidades, nunca viviendas.</p></div>
      <a class="btn ghost" href="#/mapa">Mapa completo</a></div>
      <div id="home-map" class="map"></div>
    </section>

    <section class="section split">
      <div>
        <div class="section-head"><h2>Familias que más lo necesitan</h2><a href="#/ayudar">Ver todas ›</a></div>
        <div class="grid g2">${fam.items.map(f => familyCard(f, m)).join('') || '<p class="muted">Aún no hay familias verificadas.</p>'}</div>
      </div>
      <aside class="stack">
        <div class="card"><h3>Lo que más piden las familias</h3>${bars(stats.need_ranking.slice(0, 8), { value: 'families', icon: 'icon' })}</div>
        <div class="card"><h3>🤝 Voluntariado</h3>
          <p><b>${fmtNum(stats.volunteers.served)}</b> personas atendidas en <b>${fmtNum(stats.volunteers.visits)}</b> jornadas registradas.</p>
          <p class="small muted">${stats.missions_open} misiones abiertas · ${stats.centers} centros activos</p>
          <a class="btn block" href="#/voluntarios">Ver cobertura y misiones</a></div>
        <div class="card"><h3>💡 Importante</h3><p class="small">Puente Solidario <b>no recibe dinero</b>. Los aportes van directo al Yappy o cuenta de cada familia verificada, a nombre del titular que aparece en su ficha.</p></div>
      </aside>
    </section>

    <section class="section">${emergencyBlock()}</section>`;

  const lmap = createMap(document.getElementById('home-map'));
  if (lmap) {
    map.communities.forEach(c => communityMarker(c).addTo(lmap));
    map.centers.forEach(c => centerMarker(c, m.centerTypes).addTo(lmap));
    const pts = [...map.communities, ...map.centers].map(p => [p.lat, p.lng]);
    if (pts.length) lmap.fitBounds(pts, { padding: [30, 30], maxZoom: 10 });
  }
  return () => lmap?.remove();
}

export async function sos(main) {
  const m = await meta();
  main.innerHTML = `
    ${emergencyBlock()}
    <div class="grid g2 mt">
      ${m.guides.slice(0, 2).map(g => `<div class="card"><h3>${g.icon} ${esc(g.title)}</h3><ul>${g.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}
    </div>
    <div class="row mt"><a class="btn" href="#/necesito-ayuda">Registrar a mi familia</a><a class="btn ghost" href="#/centros?type=albergue">Ver albergues</a></div>`;
}

export async function more(main) {
  const links = [
    ['#/necesito-ayuda', '🆘', 'Necesito ayuda'], ['#/mi-solicitud', '📄', 'Mi solicitud'], ['#/reportar', '📝', 'Reportar una familia'],
    ['#/misiones', '🤝', 'Misiones de voluntariado'], ['#/registrar-visita', '✅', 'Registrar visita'], ['#/centros', '📦', 'Centros y albergues'],
    ['#/informacion', '📢', 'Información oficial'], ['#/estadisticas', '📊', 'Transparencia'], ['#/mi-panel', '👤', 'Mi panel'],
    ['#/coordinacion', '🛡️', 'Coordinación'], ['#/sos', '🚨', 'Emergencias'],
  ];
  main.innerHTML = `<h1>Más opciones</h1><div class="actions">${links.map(([h, i, t]) => `<a class="card action" href="${h}"><span class="ico">${i}</span><div><strong>${t}</strong></div></a>`).join('')}</div>`;
}
