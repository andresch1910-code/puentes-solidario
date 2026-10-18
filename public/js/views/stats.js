// Transparencia: cifras públicas de familias verificadas, donaciones y voluntariado.
import { api } from '../api.js';
import { esc, fmtNum, fmtMoney, fmtDateTime, bars, fmtDate } from '../ui.js';

export async function stats(main) {
  const s = await api('/stats');
  const maxDay = Math.max(1, ...s.per_day.map(d => d.n));
  const withDon = s.donations.families;
  const pct = s.families ? Math.round(withDon / s.families * 100) : 0;
  const confPct = s.donations.count ? Math.round(s.donations.confirmed / s.donations.count * 100) : 0;

  main.innerHTML = `
    <h1>Transparencia</h1>
    <p class="muted">Cifras públicas de familias verificadas por coordinadores. Actualizado: ${fmtDateTime(s.updated_at)}.</p>

    <div class="grid g4">
      <div class="card kpi ok"><b>${fmtMoney(s.donations.total)}</b><span>Donaciones registradas, enviadas directo a las familias</span></div>
      <div class="card kpi accent"><b>${fmtNum(s.people)}</b><span>Personas afectadas</span></div>
      <div class="card kpi"><b>${fmtNum(s.families)}</b><span>Familias verificadas</span></div>
      <div class="card kpi"><b>${fmtNum(s.minors)}</b><span>Menores de edad</span></div>
    </div>
    <p class="small muted mt">Además: ${s.pending_validation} solicitud(es) en validación y ${s.needs_info} esperando más información. No se incluyen en los gráficos hasta ser verificadas.</p>

    <div class="grid g2 section">
      <div class="card"><h3>Familias verificadas por día</h3><p class="small muted">Últimos 21 días, según la fecha de registro.</p>
        <div class="columns">${s.per_day.map(d => `<div style="height:${(d.n / maxDay) * 100}%" data-tip="${fmtDate(d.day, { day: 'numeric', month: 'short' })}: ${d.n}"></div>`).join('')}</div>
        <div class="row between small muted"><span>${fmtDate(s.per_day[0].day, { day: 'numeric', month: 'short' })}</span><span>Hoy</span></div></div>

      <div class="card"><h3>¿Cuántas familias ya recibieron donaciones?</h3>
        <div class="row" style="gap:24px">
          <div class="donut" style="background:conic-gradient(var(--ok) 0 ${pct}%, var(--surface-2) ${pct}% 100%)"><div>${pct}%</div></div>
          <div class="small"><p><span class="badge ok">Con donaciones</span> <b>${withDon}</b></p><p><span class="badge">Aún sin donaciones</span> <b>${s.families_without_donations}</b></p>
          <p class="muted">${confPct}% de los aportes ya fueron <b>confirmados por las familias</b>.</p></div>
        </div></div>

      <div class="card"><h3>Necesidades pendientes</h3><p class="small muted">Cuántas familias necesitan cada cosa.</p>${bars(s.need_ranking, { value: 'families', icon: 'icon' })}</div>

      <div class="card"><h3>Cómo les afectó la emergencia</h3><p class="small muted">Una familia puede tener varias afectaciones.</p>${bars(s.affectations, { value: 'families', color: 'var(--accent)' })}
        <h3 class="mt">Personas afectadas por provincia</h3>${bars(s.by_province, { label: 'province', value: 'people' })}</div>

      <div class="card"><h3>🤝 Voluntariado</h3>
        <div class="grid g2">
          <div class="kpi" style="padding:0"><b>${fmtNum(s.volunteers.served)}</b><span>personas atendidas</span></div>
          <div class="kpi" style="padding:0"><b>${fmtNum(s.volunteers.visits)}</b><span>jornadas aprobadas</span></div>
          <div class="kpi" style="padding:0"><b>${fmtNum(Math.round(s.volunteers.hours))}</b><span>horas donadas</span></div>
          <div class="kpi" style="padding:0"><b>${fmtNum(s.volunteers.registered)}</b><span>voluntarios registrados</span></div>
        </div></div>

      <div class="card"><h3>Avance general</h3>
        <p><b>${s.fulfillment}%</b> de los artículos solicitados por familias verificadas ya fueron cubiertos.</p>
        <div class="progress" style="height:14px"><i style="width:${s.fulfillment}%"></i></div>
        <p class="small muted mt">${s.needs_pending} necesidades pendientes · ${s.resolved} familia(s) atendidas por completo · ${s.missions_open} misiones abiertas · ${s.centers} centros activos</p>
        <a class="btn" href="#/ayudar?sort=least_helped">Ayudar a quien menos ha recibido</a></div>
    </div>

    <div class="notice section"><span>💡</span><div><b>Puente Solidario NO recibe, guarda ni transfiere dinero.</b> Las cifras de donaciones son las que los donantes registran en la plataforma; cada familia confirma lo que realmente recibió.</div></div>
    <p class="small muted">Datos ${esc('abiertos')}: los coordinadores pueden exportar las solicitudes verificadas (sin datos privados) para coordinar con autoridades.</p>`;
}
