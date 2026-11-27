import { api } from '../api.js';
import { esc, modal, toast, confirmar, datosForm } from '../ui.js';
import { setTitulo, setAcciones } from '../app.js';
import { leafletDisponible, createMap, markerIcon, centroDe, miUbicacion, TIPO_CLIENTE, AVISO_SIN_LEAFLET } from '../map-common.js';

// Campos extra sugeridos por tipo (se guardan en "data")
const CAMPOS = {
  valvula: [['diametro', 'Diámetro'], ['estado', 'Estado (abierta/cerrada)']],
  hidrante: [['estado', 'Estado']],
  acometida: [['diametro', 'Diámetro']],
  tanque: [['capacidad', 'Capacidad (galones)']],
  pozo: [['profundidad', 'Profundidad (pies)']],
  bomba: [['potencia', 'Potencia (HP)']],
};

export async function render(el, params, ctx) {
  setTitulo('Mapa de la red', 'Clientes, acometidas, válvulas, hidrantes y más');
  const puede = ctx.can('mapa.editar');

  if (!await leafletDisponible()) { el.innerHTML = AVISO_SIN_LEAFLET; return; }

  const tipos = await api('GET', '/api/mapa/tipos');
  const todos = [TIPO_CLIENTE, ...tipos];
  const ocultos = new Set();

  el.innerHTML = `<div class="mapa-wrap">
    <div id="mapa" class="mapa-grande"></div>
    <div class="panel-capas" id="capas">
      <b>Mostrar</b>
      ${todos.map(t => `<label><input type="checkbox" checked data-k="${esc(t.key)}"><span class="bolita" style="background:${esc(t.color)}"></span>${esc(t.name)}</label>`).join('')}
    </div>
    <div class="modo-agregar" id="modo" hidden></div>
  </div>`;

  const L = window.L;
  const map = createMap(el.querySelector('#mapa'), { center: centroDe(ctx), zoom: ctx.config?.mapa?.zoom || 15 });
  const capas = Object.fromEntries(todos.map(t => [t.key, L.layerGroup().addTo(map)]));

  async function cargar() {
    Object.values(capas).forEach(g => g.clearLayers());
    const [puntos, clientes] = await Promise.all([api('GET', '/api/mapa/puntos'), api('GET', '/api/clientes/geo')]);
    for (const c of clientes) {
      L.marker([c.lat, c.lng], { icon: markerIcon(TIPO_CLIENTE) })
        .bindPopup(`<b>${esc(c.full_name)}</b><br>${esc(c.code)} · ${esc(c.status)}<br><a href="#/clientes/${c.id}">Ver ficha</a>`)
        .addTo(capas[TIPO_CLIENTE.key]);
    }
    for (const p of puntos) {
      const t = tipos.find(x => x.id === p.type_id);
      const extra = Object.entries(p.data || {}).filter(([, v]) => v).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>');
      const div = document.createElement('div');
      div.innerHTML = `<b>${esc(p.name)}</b><br><span style="color:#5F7183">${esc(p.type_name)}</span>
        ${extra ? `<br>${extra}` : ''}${p.notes ? `<br><i>${esc(p.notes)}</i>` : ''}
        ${p.client_code ? `<br>Cliente: <a href="#/clientes/${p.client_id}">${esc(p.client_code)}</a>` : ''}
        ${puede ? '<div style="margin-top:6px;display:flex;gap:6px"><button class="btn sec chico" data-e>Editar</button><button class="btn peligro chico" data-b>Borrar</button></div>' : ''}`;
      div.querySelector('[data-e]')?.addEventListener('click', () => editar(p));
      div.querySelector('[data-b]')?.addEventListener('click', async () => {
        if (!await confirmar('Borrar punto', `¿Borrar "${p.name}" del mapa?`)) return;
        await api('DELETE', `/api/mapa/puntos/${p.id}`); toast('Punto borrado', 'ok'); cargar();
      });
      L.marker([p.lat, p.lng], { icon: markerIcon(t || { color: '#999', icon: '?' }) }).bindPopup(div).addTo(capas[t?.key] || capas[TIPO_CLIENTE.key]);
    }
  }

  el.querySelector('#capas').addEventListener('change', e => {
    const k = e.target.dataset.k;
    if (!k) return;
    e.target.checked ? capas[k].addTo(map) : capas[k].remove();
  });

  // ---- Agregar / editar ----
  let modoAgregar = null;
  const modoEl = el.querySelector('#modo');
  function salirModo() { modoAgregar = null; modoEl.hidden = true; map.getContainer().style.cursor = ''; }

  map.on('click', e => {
    if (!modoAgregar) return;
    const tipo = modoAgregar;
    salirModo();
    editar(null, { type_id: tipo.id, lat: e.latlng.lat, lng: e.latlng.lng });
  });

  async function editar(p, nuevo) {
    const base = p || nuevo;
    const tipo = tipos.find(t => t.id === base.type_id);
    const campos = CAMPOS[tipo?.key] || [];
    const res = await modal({
      titulo: p ? `Editar ${p.name}` : `Nuevo punto: ${tipo.name}`,
      contenido: `<div class="grid2">
        <label class="campo">Tipo<select name="type_id">${tipos.map(t => `<option value="${t.id}" ${t.id === base.type_id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label class="campo">Nombre o código<input name="name" value="${esc(p?.name || '')}" placeholder="Ej: V-01" required></label>
        ${campos.map(([k, label]) => `<label class="campo">${esc(label)}<input data-d="${k}" value="${esc(p?.data?.[k] || '')}"></label>`).join('')}
        <label class="campo">Latitud<input name="lat" value="${(+base.lat).toFixed(7)}" required></label>
        <label class="campo">Longitud<input name="lng" value="${(+base.lng).toFixed(7)}" required></label>
        <label class="campo" style="grid-column:1/-1">Notas<textarea name="notes">${esc(p?.notes || '')}</textarea></label>
      </div><button type="button" class="btn sec chico" data-gps>📍 Usar mi ubicación</button>`,
      onOpen: (f) => f.querySelector('[data-gps]').onclick = async () => {
        try { const g = await miUbicacion(); f.lat.value = g.lat; f.lng.value = g.lng; } catch (e) { toast(e.message, 'error'); }
      },
      onOk: (f) => {
        const d = datosForm(f);
        const data = { ...(p?.data || {}) };
        f.querySelectorAll('[data-d]').forEach(i => { data[i.dataset.d] = i.value; });
        const body = { type_id: Number(d.type_id), name: d.name, lat: Number(d.lat), lng: Number(d.lng), notes: d.notes, data };
        return p ? api('PUT', `/api/mapa/puntos/${p.id}`, body) : api('POST', '/api/mapa/puntos', body);
      },
    });
    if (res) { toast('Punto guardado', 'ok'); map.closePopup(); cargar(); }
  }

  if (puede) {
    const acc = setAcciones(`<select id="tipoNuevo" style="width:auto">${tipos.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
      <button class="btn" id="agregar">+ Tocar en el mapa</button><button class="btn sec" id="agregarGps">📍 Aquí (GPS)</button>`);
    const tipoSel = () => tipos.find(t => t.id === Number(acc.querySelector('#tipoNuevo').value));
    acc.querySelector('#agregar').onclick = () => {
      modoAgregar = tipoSel();
      modoEl.textContent = `Toque el mapa para ubicar: ${modoAgregar.name} (Esc para cancelar)`;
      modoEl.hidden = false;
      map.getContainer().style.cursor = 'crosshair';
    };
    acc.querySelector('#agregarGps').onclick = async () => {
      try { const g = await miUbicacion(); map.setView([g.lat, g.lng], 18); editar(null, { type_id: tipoSel().id, lat: g.lat, lng: g.lng }); }
      catch (e) { toast(e.message, 'error'); }
    };
    const onEsc = (e) => { if (e.key === 'Escape') salirModo(); };
    document.addEventListener('keydown', onEsc);
    window.addEventListener('hashchange', () => document.removeEventListener('keydown', onEsc), { once: true });
  }

  await cargar();
}
