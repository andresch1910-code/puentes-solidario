import { api } from '../api.js';
import { esc, meta, fmtDateTime, fmtDate } from '../ui.js';
import { createMap, communityMarker, centerMarker, PRIORITY_COLORS } from '../map.js';

const L = window.L;

export async function mapView(main) {
  const [m, data] = await Promise.all([meta(), api('/map')]);
  main.innerHTML = `
    <div style="padding:14px 16px 10px;max-width:1180px;margin:0 auto">
      <div class="section-head" style="margin-bottom:8px"><div><h1 style="margin:0">Mapa de la emergencia</h1>
      <p class="muted small" style="margin:0">Se pintan comunidades, nunca viviendas. Toca un punto para ver el detalle y cómo ayudar.</p></div></div>
      <div class="map-layers">
        <label class="chip-toggle"><input type="checkbox" data-layer="families" checked><span>👨‍👩‍👧 Familias (${data.communities.length} comunidades)</span></label>
        <label class="chip-toggle"><input type="checkbox" data-layer="centers" checked><span>📦 Centros (${data.centers.length})</span></label>
        <label class="chip-toggle"><input type="checkbox" data-layer="visits"><span>🤝 Visitas de voluntarios</span></label>
        <label class="chip-toggle"><input type="checkbox" data-layer="quakes"><span>🌎 Sismos recientes (USGS)</span></label>
      </div>
    </div>
    <div style="padding:0 16px 16px;max-width:1180px;margin:0 auto">
      <div id="full-map" class="map tall"></div>
      <div class="legend">
        ${Object.entries({ critica: 'Prioridad crítica', alta: 'Alta', media: 'Media', baja: 'Baja' }).map(([k, l]) => `<span><i style="background:${PRIORITY_COLORS[k]}"></i>${l}</span>`).join('')}
        <span>· El número indica familias · ${m.centerTypes.map(t => `${t.icon} ${esc(t.label)}`).join(' · ')}</span>
      </div>
    </div>`;

  const map = createMap(document.getElementById('full-map'), { scroll: true });
  if (!map) return;
  const layers = {
    families: L.markerClusterGroup ? L.markerClusterGroup({ maxClusterRadius: 40, showCoverageOnHover: false }) : L.layerGroup(),
    centers: L.layerGroup(),
    visits: L.layerGroup(),
    quakes: L.layerGroup(),
  };
  data.communities.forEach(c => layers.families.addLayer(communityMarker(c)));
  data.centers.forEach(c => layers.centers.addLayer(centerMarker(c, m.centerTypes)));
  data.visits.forEach(v => layers.visits.addLayer(
    L.circleMarker([v.lat, v.lng], { radius: 9, color: '#0f8a5f', fillColor: '#34d399', fillOpacity: 0.6, weight: 2 })
      .bindPopup(`<h4>🤝 ${esc(v.community)}</h4><div class="small">${v.n} visita(s) aprobadas · última ${fmtDate(v.last)}</div>`)));
  layers.families.addTo(map);
  layers.centers.addTo(map);

  let quakesLoaded = false;
  async function loadQuakes() {
    if (quakesLoaded) return;
    quakesLoaded = true;
    const q = await api('/quakes').catch(() => ({ items: [] }));
    q.items.forEach(e => layers.quakes.addLayer(
      L.circleMarker([e.lat, e.lng], { radius: Math.max(5, e.mag * 3), color: '#7c2d12', fillColor: '#f97316', fillOpacity: 0.45, weight: 1 })
        .bindPopup(`<h4>Sismo M${e.mag?.toFixed(1)}</h4><div class="small">${esc(e.place)}<br>${fmtDateTime(e.time)} · ${Math.round(e.depth)} km de profundidad</div>
          <a class="small" href="${esc(e.url)}" target="_blank" rel="noopener">Ver en USGS ↗</a>`)));
  }

  main.querySelectorAll('[data-layer]').forEach(cb => cb.addEventListener('change', async () => {
    const layer = layers[cb.dataset.layer];
    if (cb.checked) {
      if (cb.dataset.layer === 'quakes') await loadQuakes();
      layer.addTo(map);
    } else map.removeLayer(layer);
  }));

  // Ajusta la vista a los datos.
  const pts = [...data.communities, ...data.centers].map(p => [p.lat, p.lng]);
  if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 10 });
  return () => map.remove();
}
