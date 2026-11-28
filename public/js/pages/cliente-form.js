import { api } from '../api.js';
import { esc, fmtCedula, toast, datosForm, fmtFecha, money } from '../ui.js';
import { setTitulo, setAcciones } from '../app.js';
import { leafletDisponible, createMap, centroDe, miUbicacion, AVISO_SIN_LEAFLET } from '../map-common.js';

export async function render(el, { id }, ctx) {
  const nuevo = !id;
  const puedeEditar = ctx.can('clientes.editar');
  const [c, planes] = await Promise.all([
    nuevo ? Promise.resolve({ status: 'activo' }) : api('GET', `/api/clientes/${id}`),
    api('GET', '/api/planes').catch(() => []),
  ]);
  setTitulo(nuevo ? 'Nuevo cliente' : c.full_name, nuevo ? 'Registro de abonado' : `${c.code} · registrado ${fmtFecha(c.created_at)}`);
  const accFicha = () => setAcciones(`${!nuevo && ctx.can('averias.crear') ? `<a class="btn ocre" href="#/averias/nueva?cliente=${id}">🛠️ Reportar avería</a>` : ''}<a class="btn sec" href="#/clientes">‹ Volver</a>`);
  accFicha();

  const dis = puedeEditar ? '' : 'disabled';
  const planOpts = planes.filter(p => p.active || p.id === c.plan_id)
    .map(p => `<option value="${p.id}" ${p.id === c.plan_id ? 'selected' : ''}>${esc(p.name)} — ${money(p.price_cents)}</option>`).join('');

  el.innerHTML = `
  <form class="grid2" style="align-items:start">
    <div class="carta">
      <h2>Datos del cliente</h2>
      <div class="grid2">
        <label class="campo" style="grid-column:1/-1">Nombre completo *<input name="full_name" value="${esc(c.full_name)}" required ${dis}></label>
        <label class="campo">Cédula<input name="cedula" value="${esc(fmtCedula(c.cedula))}" placeholder="000-0000000-0" inputmode="numeric" ${dis}></label>
        <label class="campo">Plan<select name="plan_id" ${dis}><option value="">— Sin plan —</option>${planOpts}</select></label>
        <label class="campo">Teléfono<input name="phone" value="${esc(c.phone)}" inputmode="tel" ${dis}></label>
        <label class="campo">Teléfono 2<input name="phone2" value="${esc(c.phone2)}" inputmode="tel" ${dis}></label>
        <label class="campo">Sector<input name="sector" value="${esc(c.sector)}" ${dis}></label>
        <label class="campo">Estado<select name="status" ${dis}>
          ${['activo', 'suspendido', 'cortado', 'retirado'].map(s => `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select></label>
        <label class="campo" style="grid-column:1/-1">Dirección<input name="address" value="${esc(c.address)}" ${dis}></label>
        <label class="campo" style="grid-column:1/-1">Notas<textarea name="notes" ${dis}>${esc(c.notes)}</textarea></label>
      </div>
      ${puedeEditar ? `<div class="fila" style="margin-top:14px"><button class="btn" type="submit">${nuevo ? 'Registrar cliente' : 'Guardar cambios'}</button>
        <span class="error-txt" id="err"></span></div>` : ''}
    </div>
    <div class="carta">
      <h2>Ubicación de la casa</h2>
      <p class="ayuda">${puedeEditar ? 'Toque el mapa para marcar la casa, arrastre el marcador para ajustarlo, o use el GPS si está en el lugar.' : ''}</p>
      <div id="mini" class="mini-mapa"></div>
      <div class="fila" style="margin-top:10px">
        ${puedeEditar ? '<button type="button" class="btn sec chico" id="gps">📍 Usar mi ubicación</button><button type="button" class="btn sec chico" id="quitar">Quitar ubicación</button>' : ''}
        <span class="ayuda" id="coords"></span>
      </div>
    </div>
  </form>
  <div id="averiasCliente"></div>`;

  const form = el.querySelector('form');
  let pos = c.lat != null ? { lat: c.lat, lng: c.lng } : null;
  let map, marker;
  const coordsTxt = () => { el.querySelector('#coords').textContent = pos ? `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}` : 'Sin ubicación'; };

  function ponerMarcador(p, centrar) {
    pos = { lat: +p.lat.toFixed(7), lng: +p.lng.toFixed(7) };
    if (map) {
      if (!marker) {
        marker = window.L.marker([pos.lat, pos.lng], { draggable: puedeEditar }).addTo(map);
        marker.on('dragend', () => { const ll = marker.getLatLng(); pos = { lat: +ll.lat.toFixed(7), lng: +ll.lng.toFixed(7) }; coordsTxt(); });
      } else marker.setLatLng([pos.lat, pos.lng]);
      if (centrar) map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 17));
    }
    coordsTxt();
  }

  if (await leafletDisponible()) {
    map = createMap(el.querySelector('#mini'), { center: pos || centroDe(ctx), zoom: pos ? 18 : (ctx.config?.mapa?.zoom || 15) });
    if (pos) ponerMarcador(pos);
    if (puedeEditar) map.on('click', e => ponerMarcador(e.latlng));
  } else {
    el.querySelector('#mini').outerHTML = AVISO_SIN_LEAFLET;
  }
  coordsTxt();

  el.querySelector('#gps')?.addEventListener('click', async () => {
    try { const p = await miUbicacion(); ponerMarcador(p, true); toast(`Ubicación tomada (±${Math.round(p.precision)} m)`); }
    catch (e) { toast(e.message, 'error'); }
  });
  el.querySelector('#quitar')?.addEventListener('click', () => {
    pos = null;
    if (marker) { marker.remove(); marker = null; }
    coordsTxt();
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = datosForm(form);
    const body = { ...d, plan_id: d.plan_id ? Number(d.plan_id) : null, lat: pos ? pos.lat : null, lng: pos ? pos.lng : null };
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = nuevo ? await api('POST', '/api/clientes', body) : await api('PUT', `/api/clientes/${id}`, body);
      toast(nuevo ? `Cliente ${r.code} registrado` : 'Cambios guardados', 'ok');
      if (nuevo) location.hash = `#/clientes/${r.id}`;
      else setTitulo(r.full_name, `${r.code} · registrado ${fmtFecha(r.created_at)}`), accFicha();
    } catch (err) {
      el.querySelector('#err').textContent = err.message;
    } finally { btn.disabled = false; }
  };

  // Averías de este cliente
  if (!nuevo && ctx.can('averias.ver')) {
    const { items } = await api('GET', `/api/averias?cliente=${id}&limit=10`);
    const { TIPOS, chipEstadoAveria, chipPrioridad } = await import('../averias-common.js');
    el.querySelector('#averiasCliente').innerHTML = `<div class="carta"><h2>Averías de este cliente</h2>
      ${items.length ? `<table class="tabla"><tbody>${items.map(a => `<tr class="clic" data-av="${a.id}"><td><b>${esc(a.code)}</b></td><td>${esc(TIPOS[a.type])}</td>
        <td>${chipPrioridad(a.priority)}</td><td>${chipEstadoAveria(a.status)}</td><td class="ayuda">${fmtFecha(a.created_at)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="ayuda">Sin averías reportadas.</p>'}</div>`;
    el.querySelector('#averiasCliente').addEventListener('click', e => { const tr = e.target.closest('tr[data-av]'); if (tr) location.hash = `#/averias/${tr.dataset.av}`; });
  }
}
