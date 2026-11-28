import { api } from '../api.js';
import { esc, toast, fmtFecha, datosForm, debounce, fmtCedula } from '../ui.js';
import { setTitulo, setAcciones } from '../app.js';
import { leafletDisponible, createMap, centroDe, miUbicacion, markerIcon, AVISO_SIN_LEAFLET } from '../map-common.js';
import { TIPOS, PRIORIDADES, ESTADOS, chipPrioridad, chipEstadoAveria, ICONO_AVERIA } from '../averias-common.js';

const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');

export async function render(el, params, ctx) {
  return params.id ? ficha(el, params.id, ctx) : nueva(el, params, ctx);
}

// ---------- Reportar avería ----------
async function nueva(el, params, ctx) {
  setTitulo('Reportar avería', 'Registro de una avería nueva');
  setAcciones('<a class="btn sec" href="#/averias">‹ Volver</a>');
  let cliente = params.cliente ? await api('GET', `/api/clientes/${params.cliente}`).catch(() => null) : null;

  el.innerHTML = `
  <form class="grid2" style="align-items:start">
    <div class="carta">
      <h2>Datos de la avería</h2>
      <div class="grid2">
        <label class="campo">Tipo *<select name="type" required>${opts(TIPOS, 'fuga')}</select></label>
        <label class="campo">Prioridad<select name="priority">${opts(PRIORIDADES, 'media')}</select></label>
        <label class="campo" style="grid-column:1/-1">Descripción *<textarea name="description" required placeholder="¿Qué pasa y dónde exactamente?"></textarea></label>
        <label class="campo" style="grid-column:1/-1">Cliente afectado (opcional)
          <input id="buscaCliente" placeholder="Buscar por nombre, código o cédula…" autocomplete="off">
          <div id="sugerencias" class="sugerencias"></div>
          <div id="clienteSel" class="ayuda"></div></label>
        <label class="campo">Quién reporta<input name="reporter_name" placeholder="Nombre"></label>
        <label class="campo">Teléfono de contacto<input name="reporter_phone" inputmode="tel"></label>
        <label class="campo" style="grid-column:1/-1">Dirección o referencia<input name="address"></label>
      </div>
      <div class="fila" style="margin-top:14px"><button class="btn" type="submit">Registrar avería</button><span class="error-txt" id="err"></span></div>
    </div>
    <div class="carta">
      <h2>Ubicación</h2>
      <p class="ayuda">Toque el mapa donde está la avería o use el GPS. Si elige un cliente con ubicación, se usa la de su casa.</p>
      <div id="mini" class="mini-mapa"></div>
      <div class="fila" style="margin-top:10px"><button type="button" class="btn sec chico" id="gps">📍 Usar mi ubicación</button>
        <span class="ayuda" id="coords">Sin ubicación</span></div>
    </div>
  </form>`;

  const form = el.querySelector('form');
  let pos = null, map, marker;
  const ponerPos = (p, centrar) => {
    pos = { lat: +p.lat.toFixed(7), lng: +p.lng.toFixed(7) };
    el.querySelector('#coords').textContent = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
    if (!map) return;
    if (!marker) {
      marker = window.L.marker([pos.lat, pos.lng], { draggable: true, icon: markerIcon(ICONO_AVERIA) }).addTo(map);
      marker.on('dragend', () => { const ll = marker.getLatLng(); ponerPos(ll); });
    } else marker.setLatLng([pos.lat, pos.lng]);
    if (centrar) map.setView([pos.lat, pos.lng], 18);
  };
  if (await leafletDisponible()) {
    map = createMap(el.querySelector('#mini'), { center: centroDe(ctx), zoom: ctx.config?.mapa?.zoom || 15 });
    map.on('click', e => ponerPos(e.latlng));
  } else el.querySelector('#mini').outerHTML = AVISO_SIN_LEAFLET;

  const elegirCliente = c => {
    cliente = c;
    el.querySelector('#clienteSel').innerHTML = c ? `Seleccionado: <b>${esc(c.code)} ${esc(c.full_name)}</b> <a href="#" id="quitarCli">quitar</a>` : '';
    el.querySelector('#quitarCli')?.addEventListener('click', ev => { ev.preventDefault(); elegirCliente(null); });
    el.querySelector('#sugerencias').innerHTML = '';
    el.querySelector('#buscaCliente').value = '';
    if (c) {
      if (!form.reporter_name.value) form.reporter_name.value = c.full_name;
      if (!form.reporter_phone.value && c.phone) form.reporter_phone.value = c.phone;
      if (!form.address.value && c.address) form.address.value = c.address;
      if (c.lat != null) ponerPos({ lat: c.lat, lng: c.lng }, true);
    }
  };
  if (cliente) elegirCliente(cliente);

  el.querySelector('#buscaCliente').addEventListener('input', debounce(async (e) => {
    const q = e.target.value.trim();
    const box = el.querySelector('#sugerencias');
    if (q.length < 2) { box.innerHTML = ''; return; }
    const { items } = await api('GET', `/api/clientes?q=${encodeURIComponent(q)}&limit=6`);
    box.innerHTML = items.map(c => `<button type="button" data-id="${c.id}">${esc(c.code)} · ${esc(c.full_name)} <span class="ayuda">${esc(fmtCedula(c.cedula) || c.sector || '')}</span></button>`).join('')
      || '<span class="ayuda">Sin resultados</span>';
    box.querySelectorAll('button').forEach(b => b.onclick = () => elegirCliente(items.find(c => c.id == b.dataset.id)));
  }));

  el.querySelector('#gps').onclick = async () => {
    try { const p = await miUbicacion(); ponerPos(p, true); } catch (e) { toast(e.message, 'error'); }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = datosForm(form);
    const body = { ...d, client_id: cliente ? cliente.id : null, lat: pos ? pos.lat : null, lng: pos ? pos.lng : null };
    try {
      const a = await api('POST', '/api/averias', body);
      toast(`Avería ${a.code} registrada`, 'ok');
      location.hash = `#/averias/${a.id}`;
    } catch (err) { el.querySelector('#err').textContent = err.message; }
  };
}

// ---------- Ficha de avería ----------
const ETIQUETA_EVENTO = { creada: '🆕 Reportada', asignada: '👷 Asignación', estado: '🔄 Cambio de estado', nota: '📝 Nota' };

async function ficha(el, id, ctx) {
  const a = await api('GET', `/api/averias/${id}`);
  const gestiona = ctx.can('averias.gestionar');
  const esAsignado = a.assigned_to === ctx.user.id;
  setTitulo(`${a.code} · ${TIPOS[a.type]}`, `Reportada ${fmtFecha(a.created_at)} por ${a.created_name || '—'}`);
  setAcciones('<a class="btn sec" href="#/averias">‹ Volver</a>');
  const tecnicos = gestiona ? await api('GET', '/api/averias/tecnicos') : [];

  const siguientes = {
    nueva: ['en_proceso', 'resuelta'], asignada: ['en_proceso', 'resuelta'], en_proceso: ['resuelta'],
    resuelta: gestiona ? ['cerrada', 'en_proceso'] : ['en_proceso'], cerrada: gestiona ? ['en_proceso'] : [],
  }[a.status].filter(s => gestiona || esAsignado ? (s !== 'cerrada' || gestiona) : false);
  const TXT = { en_proceso: a.status === 'resuelta' || a.status === 'cerrada' ? '↩️ Reabrir' : '🚧 Empezar trabajo', resuelta: '✅ Marcar resuelta', cerrada: '🔒 Cerrar' };

  el.innerHTML = `
  <div class="grid2" style="align-items:start">
    <div>
      <div class="carta">
        <div class="fila" style="margin-bottom:10px">${chipEstadoAveria(a.status)} ${chipPrioridad(a.priority)}</div>
        <p style="white-space:pre-wrap;margin:0 0 12px">${esc(a.description)}</p>
        <table class="tabla ficha"><tbody>
          <tr><th>Cliente</th><td>${a.client_id ? `<a href="#/clientes/${a.client_id}">${esc(a.client_code)} ${esc(a.client_name)}</a>` : '—'}</td></tr>
          <tr><th>Reportó</th><td>${esc(a.reporter_name || '—')} ${a.reporter_phone ? `· <a href="tel:${esc(a.reporter_phone)}">${esc(a.reporter_phone)}</a>` : ''}</td></tr>
          <tr><th>Dirección</th><td>${esc(a.address || '—')}</td></tr>
          <tr><th>Técnico</th><td>${esc(a.assigned_name || 'Sin asignar')}</td></tr>
          ${a.resolved_at ? `<tr><th>Resuelta</th><td>${fmtFecha(a.resolved_at)}</td></tr>` : ''}
          ${a.closed_at ? `<tr><th>Cerrada</th><td>${fmtFecha(a.closed_at)}</td></tr>` : ''}
        </tbody></table>
      </div>
      <div class="carta">
        <h2>Acciones</h2>
        ${gestiona ? `<div class="grid2">
          <label class="campo">Técnico asignado<select id="tecnico"><option value="">— Sin asignar —</option>
            ${tecnicos.map(t => `<option value="${t.id}" ${t.id === a.assigned_to ? 'selected' : ''}>${esc(t.full_name)} (${esc(t.role)})</option>`).join('')}</select></label>
          <label class="campo">Prioridad<select id="prioridad">${opts(PRIORIDADES, a.priority)}</select></label>
        </div>` : ''}
        <label class="campo" style="margin-top:10px">Nota (opcional)<textarea id="nota" placeholder="Qué se hizo, materiales, observaciones…"></textarea></label>
        <div class="fila" style="margin-top:10px">
          ${siguientes.map(s => `<button class="btn ${s === 'resuelta' ? '' : 'sec'}" data-estado="${s}">${TXT[s]}</button>`).join('')}
          <button class="btn sec" id="soloNota">Guardar nota</button>
        </div>
        ${!gestiona && !esAsignado ? '<p class="ayuda">Solo el técnico asignado o un administrador pueden cambiar el estado.</p>' : ''}
      </div>
    </div>
    <div>
      <div class="carta"><h2>Ubicación</h2><div id="mini" class="mini-mapa"></div>
        ${a.lat != null ? `<p class="ayuda" style="margin-top:8px"><a href="https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}" target="_blank" rel="noopener">🧭 Cómo llegar (Google Maps)</a></p>` : '<p class="ayuda">Sin ubicación registrada.</p>'}</div>
      <div class="carta"><h2>Historial</h2><ul class="lista linea">
        ${a.events.slice().reverse().map(e => `<li><b>${ETIQUETA_EVENTO[e.kind] || e.kind}</b>
          ${e.kind === 'estado' ? `: ${esc(ESTADOS[e.from_status] || e.from_status)} → ${esc(ESTADOS[e.to_status] || e.to_status)}` : ''}
          ${e.text && !(e.kind === 'creada') ? `<div>${esc(e.text)}</div>` : ''}
          <div class="ayuda">${esc(e.user_name || '')} · ${fmtFecha(e.at)}</div></li>`).join('')}
      </ul></div>
    </div>
  </div>`;

  if (a.lat != null && await leafletDisponible()) {
    const m = createMap(el.querySelector('#mini'), { center: { lat: a.lat, lng: a.lng }, zoom: 18 });
    window.L.marker([a.lat, a.lng], { icon: markerIcon(ICONO_AVERIA) }).addTo(m);
  } else if (a.lat != null) el.querySelector('#mini').outerHTML = AVISO_SIN_LEAFLET;
  else el.querySelector('#mini').remove();

  const guardar = async (body) => {
    try { await api('PUT', `/api/averias/${a.id}`, body); toast('Avería actualizada', 'ok'); ficha(el, id, ctx); }
    catch (e) { toast(e.message, 'error'); }
  };
  el.querySelectorAll('[data-estado]').forEach(b => b.onclick = () => guardar({ status: b.dataset.estado, note: el.querySelector('#nota').value }));
  el.querySelector('#tecnico')?.addEventListener('change', e => guardar({ assigned_to: e.target.value ? Number(e.target.value) : null }));
  el.querySelector('#prioridad')?.addEventListener('change', e => guardar({ priority: e.target.value }));
  el.querySelector('#soloNota').onclick = async () => {
    const text = el.querySelector('#nota').value.trim();
    if (!text) return toast('Escriba la nota primero', 'error');
    try { await api('POST', `/api/averias/${a.id}/notas`, { text }); toast('Nota guardada', 'ok'); ficha(el, id, ctx); }
    catch (e) { toast(e.message, 'error'); }
  };
}
