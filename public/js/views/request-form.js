// Formulario "Necesito ayuda" y "Reportar una familia" (por un tercero).
import { api, session, queueRequest, saveMyCode } from '../api.js';
import { esc, meta, provinceOptions, districtOptions, linkProvinceDistrict, readForm, compressImage, toast, stepper, emergencyBlock } from '../ui.js';
import { pickerMap } from '../map.js';

export const needHelp = (main) => form(main, { thirdParty: false });
export const report = (main) => form(main, { thirdParty: true });

async function form(main, { thirdParty }) {
  const m = await meta();
  const cats = [...new Set(m.needs.map(n => n.category))];
  const me = session.user;
  main.innerHTML = `
    <a class="back" href="#/">← Volver</a>
    <h1>${thirdParty ? 'Reportar una familia afectada' : 'Necesito ayuda'}</h1>
    <div class="notice danger"><span>🚨</span><div><b>¿Hay peligro inmediato para la vida?</b> No espere esta solicitud: llame ahora al <a href="tel:911">911</a>, <a href="tel:103">103</a> (bomberos) o <a href="tel:104">104</a> (policía).</div></div>
    <div class="card flat mb">
      <h3>¿Cómo funciona?</h3>
      <ol class="small" style="margin:0;padding-left:20px">
        <li>${thirdParty ? 'Llena el formulario con los datos de la familia (con su permiso).' : 'Llena este formulario con los datos de su familia.'}</li>
        <li>Un coordinador revisa la solicitud y puede llamar o escribir por WhatsApp para confirmar. Mientras tanto no se publica.</li>
        <li>Si se verifica, se publica y las personas que quieren ayudar pueden enviar su aporte directo a la familia o llevar lo que necesitan.</li>
      </ol>
      <p class="small muted" style="margin:8px 0 0">🔒 La cédula, el teléfono, la dirección y los datos de pago solo los ve el equipo que verifica. Públicamente solo se muestra el apellido y la comunidad.</p>
    </div>

    <form id="req-form" novalidate>
      ${thirdParty ? `<fieldset><legend>0. Quién reporta</legend>
        <div class="grid g2"><div class="field"><label>Su nombre</label><input type="text" name="reporter_name" value="${esc(me?.name || '')}" required maxlength="100"></div>
        <div class="field"><label>Su teléfono</label><input type="tel" name="reporter_phone" value="${esc(me?.phone || '')}" maxlength="30"></div></div>
        <p class="small muted">Al terminar recibirá un <b>código y un PIN</b> para entregárselos a la familia; con ellos podrá consultar su solicitud.</p></fieldset>` : ''}

      <fieldset><legend>1. ¿Dónde está la familia?</legend>
        <div class="grid g2">
          <div class="field"><label for="f-prov">Provincia o comarca</label><select id="f-prov" name="province" required>${provinceOptions(m)}</select></div>
          <div class="field"><label for="f-dist">Distrito</label><select id="f-dist" name="district" required>${districtOptions(m, '')}</select></div>
        </div>
        <div class="field"><label>Comunidad, barrio o caserío<span class="hint">Solo el nombre del lugar (ej.: “Llano de Piedras”). Este nombre se muestra en el mapa.</span></label>
          <input type="text" name="community" required maxlength="80"></div>
        <div class="field"><label>Dirección o cómo llegar (privado)<span class="hint">Ej.: “detrás de la iglesia, casa verde”. Solo la ven los coordinadores.</span></label>
          <input type="text" name="address_private" maxlength="300"></div>
        <label>Ubicación aproximada en el mapa (opcional)<span class="hint">Toque el mapa o use su ubicación. Se redondea a ~1 km para no mostrar la vivienda.</span></label>
        <div id="pick-map" class="map" style="height:240px"></div>
        <div class="row" style="margin-top:8px"><button type="button" class="btn sm ghost" id="geo">📍 Usar mi ubicación</button><span id="geo-out" class="small muted"></span></div>
        <input type="hidden" name="lat"><input type="hidden" name="lng">
      </fieldset>

      <fieldset><legend>2. ¿Cómo les afectó la emergencia?</legend>
        <p class="small muted">Puede elegir varias opciones.</p>
        <div class="chips">${m.affectations.map(a => `<label class="chip-toggle"><input type="checkbox" name="affectations" value="${a.key}"><span>${esc(a.label)}</span></label>`).join('')}</div>
        <div class="field mt"><label>Cuente brevemente qué ocurrió<span class="hint">Cuando se verifique, este texto se mostrará a los donantes. No escriba dirección, cédula ni teléfonos.</span></label>
          <textarea name="story" maxlength="1000" placeholder="Ej.: La casa se agrietó con el terremoto y dormimos afuera con los niños."></textarea></div>
      </fieldset>

      <fieldset><legend>3. El hogar</legend>
        <div class="grid g2">
          <div class="field"><label>Nombre de la persona responsable</label><input type="text" name="responsible_name" required maxlength="100" autocomplete="off"></div>
          <div class="field"><label>Nombre de referencia público<span class="hint">Ej.: “Familia Pérez”. Solo se muestra el apellido.</span></label><input type="text" name="family_name" maxlength="80"></div>
          <div class="field"><label>Cédula de la persona responsable 🔒<span class="hint">Ej.: 8-123-4567. Solo para verificar y evitar registros repetidos.</span></label><input type="text" name="cedula" required maxlength="20" autocomplete="off"></div>
          <div class="field"><label>Foto de la cédula 🔒 (recomendada)</label>
            <label class="photo-drop">🪪 Agregar foto de la cédula<input type="file" accept="image/*" capture="environment" id="id-photo"></label><div class="thumbs" id="id-thumb"></div></div>
        </div>
        <div class="grid g2">
          <div class="field"><label>Adultos en el hogar</label>${stepper('adults', 1, 0, 30)}</div>
          <div class="field"><label>Menores de edad</label>${stepper('minors', 0, 0, 30)}</div>
        </div>
        <label>¿Hay personas en situación de vulnerabilidad?<span class="hint">Ayuda a priorizar. Se muestra solo como etiqueta general.</span></label>
        <div class="chips">${m.vulnerable.map(v => `<label class="chip-toggle"><input type="checkbox" name="vulnerable" value="${v.key}"><span>${esc(v.label)}</span></label>`).join('')}</div>
        <label class="check mt"><input type="checkbox" name="consent"> Autorizo que Puente Solidario use esta información solo para verificar la solicitud y evitar registros repetidos.</label>
      </fieldset>

      <fieldset><legend>4. ¿Qué necesitan?</legend>
        <p class="small muted">Toque cada necesidad e indique la cantidad.</p>
        ${cats.map(c => `<h3 class="small muted" style="margin:14px 0 6px;text-transform:uppercase;letter-spacing:.4px">${esc(c)}</h3>
          <div class="need-picker">${m.needs.filter(n => n.category === c).map(n => `
            <div class="need-opt" data-need="${n.id}">
              <input type="checkbox" id="need-${n.id}" value="${n.id}" data-multi>
              <label class="lbl" for="need-${n.id}">${n.icon} ${esc(n.label)}</label>
              <span class="qty"><input type="number" min="1" max="999" value="1" aria-label="Cantidad de ${esc(n.label)} (${esc(n.unit)})" title="${esc(n.unit)}"></span>
            </div>`).join('')}</div>`).join('')}
        <h3 class="small muted" style="margin:16px 0 6px">¿NECESITAN ALGO QUE NO ESTÁ EN LA LISTA?</h3>
        <div id="custom-needs"></div>
        <button type="button" class="btn sm ghost" id="add-custom">+ Agregar otra necesidad</button>
        <p class="hint">Un coordinador la revisará antes de publicarla.</p>
      </fieldset>

      <fieldset><legend>5. Contacto para seguimiento</legend>
        <div class="field"><label>Teléfono de contacto de la familia 🔒<span class="hint">Un coordinador puede llamar para confirmar. Solo lo ven coordinadores autorizados.</span></label>
          <input type="tel" name="contact_phone" required maxlength="30" placeholder="6000-0000"></div>
        <div class="field"><label>Notas para coordinadores (opcional, privado)<span class="hint">Ej.: cómo llegar, persona con discapacidad, embarazada.</span></label><textarea name="notes_private" maxlength="500"></textarea></div>
        <label class="check"><input type="checkbox" name="allow_contact"> Acepto que voluntarios me contacten por WhatsApp para llevarme ayuda en persona. <span class="hint">La dirección nunca se publica. Puede quitarlo cuando quiera en “Mi solicitud”.</span></label>
      </fieldset>

      <fieldset><legend>💰 6. ¿Cómo recibirán los aportes?</legend>
        <div class="notice small"><span>💡</span><div>Puente Solidario <b>NO recibe, guarda ni transfiere dinero</b>: las personas que quieren ayudar depositan directo al Yappy o cuenta de la familia. Estos datos solo se muestran a donantes identificados cuando un coordinador los aprueba.</div></div>
        <div class="chips">
          <label class="chip-toggle"><input type="radio" name="payment_method" value="yappy" checked><span>📱 Yappy</span></label>
          <label class="chip-toggle"><input type="radio" name="payment_method" value="ach"><span>🏦 Transferencia (ACH)</span></label>
          <label class="chip-toggle"><input type="radio" name="payment_method" value="none"><span>No tengo / solo ayuda en especie</span></label>
        </div>
        <div id="pay-fields" class="grid g2 mt">
          <div class="field"><label id="pay-num-lbl">Número de Yappy</label><input type="text" name="payment_number" maxlength="40" inputmode="numeric"></div>
          <div class="field"><label>Nombre del titular (como aparece en Yappy o el banco)</label><input type="text" name="payment_holder" maxlength="100"></div>
          <div class="field ach-only" hidden><label>Banco</label><input type="text" name="payment_bank" maxlength="60" placeholder="Ej.: Banco General"></div>
          <div class="field ach-only" hidden><label>Tipo de cuenta</label><select name="payment_account_type"><option value="">Seleccione…</option><option>Ahorros</option><option>Corriente</option></select></div>
        </div>
      </fieldset>

      <fieldset><legend>📷 7. Fotos de la situación (opcional, hasta 3)</legend>
        <p class="small muted">Por ejemplo, la casa dañada. Ayudan a verificar y, si un coordinador las aprueba, los donantes podrán verlas. No muestre caras de niños, la dirección ni documentos.</p>
        <label class="photo-drop">📷 Agregar fotos<input type="file" accept="image/*" multiple id="photos"></label>
        <div class="thumbs" id="photo-thumbs"></div>
      </fieldset>

      <div id="form-error"></div>
      <button class="btn block" style="font-size:1.05rem;min-height:52px">Enviar solicitud para revisión</button>
      <p class="small muted center mt">Si no hay señal, la solicitud se guarda en este teléfono y se envía sola cuando vuelva internet.</p>
    </form>`;

  const f = main.querySelector('#req-form');
  linkProvinceDistrict(m, f.province, f.district);

  // Mapa para elegir punto aproximado.
  const picker = pickerMap(main.querySelector('#pick-map'), {
    onPick: (lat, lng) => { f.lat.value = lat; f.lng.value = lng; main.querySelector('#geo-out').textContent = `Punto aproximado: ${lat}, ${lng}`; },
  });
  f.province.addEventListener('change', () => {
    const p = m.provinces.find(x => x.name === f.province.value);
    if (p && picker) picker.recenter(p.center, 9);
  });
  main.querySelector('#geo').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Su dispositivo no permite ubicación.', 'error');
    navigator.geolocation.getCurrentPosition(
      (pos) => { picker?.set(pos.coords.latitude, pos.coords.longitude); picker?.recenter([pos.coords.latitude, pos.coords.longitude], 12); },
      () => toast('No se pudo obtener la ubicación.', 'error'), { enableHighAccuracy: false, timeout: 10000 });
  });

  // Selector de necesidades.
  main.querySelectorAll('.need-opt input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => cb.closest('.need-opt').classList.toggle('on', cb.checked)));
  const custom = main.querySelector('#custom-needs');
  main.querySelector('#add-custom').addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginBottom = '8px';
    row.innerHTML = `<input type="text" placeholder="¿Qué necesitan?" maxlength="80" data-custom-label style="flex:2;min-width:180px">
      <input type="number" min="1" value="1" data-custom-qty style="width:80px" aria-label="Cantidad">
      <button type="button" class="btn sm ghost" aria-label="Quitar">✕</button>`;
    row.querySelector('button').onclick = () => row.remove();
    custom.appendChild(row);
    row.querySelector('input').focus();
  });

  // Datos de pago según método.
  const syncPay = () => {
    const method = readForm(f).payment_method;
    main.querySelector('#pay-fields').hidden = method === 'none';
    main.querySelectorAll('.ach-only').forEach(el => { el.hidden = method !== 'ach'; });
    main.querySelector('#pay-num-lbl').textContent = method === 'ach' ? 'Número de cuenta' : 'Número de Yappy';
  };
  f.querySelectorAll('[name=payment_method]').forEach(r => r.addEventListener('change', syncPay));

  // Fotos (se comprimen en el navegador).
  let idPhoto = null;
  let photos = [];
  main.querySelector('#id-photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { idPhoto = await compressImage(file, 1400, 0.8); main.querySelector('#id-thumb').innerHTML = `<img src="${idPhoto}" alt="Cédula">`; } catch (err) { toast(err.message, 'error'); }
  });
  main.querySelector('#photos').addEventListener('change', async (e) => {
    for (const file of [...e.target.files].slice(0, 3 - photos.length)) {
      try { photos.push(await compressImage(file)); } catch (err) { toast(err.message, 'error'); }
    }
    main.querySelector('#photo-thumbs').innerHTML = photos.map((p, i) => `<img src="${p}" alt="Foto ${i + 1}">`).join('');
    e.target.value = '';
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = readForm(f);
    const needs = [...main.querySelectorAll('.need-opt.on')].map(el => ({ catalog_id: +el.dataset.need, quantity: +el.querySelector('.qty input').value || 1 }));
    custom.querySelectorAll('.row').forEach(r => {
      const label = r.querySelector('[data-custom-label]').value.trim();
      if (label) needs.push({ label, quantity: +r.querySelector('[data-custom-qty]').value || 1 });
    });
    const errors = [];
    if (!v.province || !v.district) errors.push('Elija provincia y distrito.');
    if (!v.community?.trim()) errors.push('Escriba la comunidad.');
    if (!v.affectations.length) errors.push('Elija al menos una afectación.');
    if (!v.responsible_name?.trim()) errors.push('Escriba el nombre de la persona responsable.');
    if (!v.cedula?.trim()) errors.push('Escriba la cédula.');
    if (!needs.length) errors.push('Indique al menos una necesidad.');
    if (!v.contact_phone?.trim()) errors.push('Escriba un teléfono de contacto.');
    if (v.payment_method !== 'none' && (!v.payment_number?.trim() || !v.payment_holder?.trim())) errors.push('Complete el número y el titular para recibir aportes, o elija “No tengo”.');
    if (!v.consent) errors.push('Marque la autorización de uso de datos.');
    const errBox = main.querySelector('#form-error');
    if (errors.length) {
      errBox.innerHTML = `<div class="error-msg"><b>Revise lo siguiente:</b><ul style="margin:6px 0 0">${errors.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
      errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    errBox.innerHTML = '';
    const body = { ...v, needs, id_photo: idPhoto, photos, source: thirdParty ? 'third_party' : 'self' };
    const btn = e.submitter || f.querySelector('button:not([type=button])');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      if (!navigator.onLine) throw Object.assign(new Error('offline'), { network: true });
      const r = await api('/requests', { method: 'POST', body });
      saveMyCode(r.code, r.pin, v.community);
      success(main, r, thirdParty);
    } catch (err) {
      if (err.network) {
        queueRequest(body);
        main.innerHTML = `<div class="card center" style="max-width:620px;margin:0 auto"><div style="font-size:3rem">📶</div>
          <h1>Solicitud guardada en este teléfono</h1><p>No hay conexión ahora. La enviaremos automáticamente cuando vuelva internet y verá su código en <a href="#/mi-solicitud">Mi solicitud</a>.</p>
          <p class="small muted">No borre los datos del navegador hasta que se envíe.</p></div>`;
      } else {
        errBox.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
        btn.disabled = false; btn.textContent = 'Enviar solicitud para revisión';
      }
    }
  });
}

function success(main, r, thirdParty) {
  main.innerHTML = `
    <div class="card" style="max-width:640px;margin:0 auto;text-align:center">
      <div style="font-size:3rem">✅</div>
      <h1>Solicitud enviada</h1>
      <p>Un coordinador la revisará pronto. Puede que le llamen o escriban por WhatsApp para confirmar los datos.</p>
      <div class="grid g2 mt">
        <div><div class="small muted">Código</div><div class="code-box">${esc(r.code)}</div></div>
        <div><div class="small muted">PIN</div><div class="code-box">${esc(r.pin)}</div></div>
      </div>
      <div class="notice warn small" style="text-align:left"><span>⚠️</span><div><b>Anote o tome captura del código y el PIN.</b> ${thirdParty ? 'Entrégueselos a la familia: con ellos podrá' : 'Con ellos podrá'} consultar el estado, responder mensajes del coordinador y confirmar lo que reciba. No los comparta con desconocidos.</div></div>
      <div class="row" style="justify-content:center">
        <a class="btn" href="#/mi-solicitud?code=${encodeURIComponent(r.code)}">Ir a mi solicitud</a>
        <a class="btn ghost" href="#/">Volver al inicio</a>
      </div>
    </div>
    <div class="mt">${emergencyBlock()}</div>`;
  window.scrollTo(0, 0);
}
