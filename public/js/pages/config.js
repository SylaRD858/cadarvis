import { api } from '../api.js';
import { esc, toast, toCents, modal, datosForm } from '../ui.js';
import { setTitulo } from '../app.js';
import { leafletDisponible, createMap, AVISO_SIN_LEAFLET } from '../map-common.js';

export async function render(el, params, ctx) {
  setTitulo('Configuración', 'Datos de la empresa y ajustes del sistema');
  const c = await api('GET', '/api/config');
  const m = c.facturacion.mora;

  el.innerHTML = `
  <form id="f" class="grid2" style="align-items:start">
    <div class="carta">
      <h2>Empresa</h2>
      <div class="grid2">
        <label class="campo">Nombre<input name="nombre" value="${esc(c.empresa.nombre)}" required></label>
        <label class="campo">RNC<input name="rnc" value="${esc(c.empresa.rnc)}"></label>
        <label class="campo">Teléfono<input name="telefono" value="${esc(c.empresa.telefono)}"></label>
        <label class="campo">Dirección<input name="direccion" value="${esc(c.empresa.direccion)}"></label>
      </div>
    </div>
    <div class="carta">
      <h2>Facturación</h2>
      <div class="grid2">
        <label class="campo">Día del mes en que se generan las facturas<input name="dia" type="number" min="1" max="28" value="${c.facturacion.dia_generacion}"></label>
        <label class="fila" style="align-self:end"><input type="checkbox" name="mora_activa" ${m.activa ? 'checked' : ''}> Cobrar mora por atraso</label>
        <label class="campo">Tipo de mora<select name="mora_tipo">
          <option value="fijo" ${m.tipo === 'fijo' ? 'selected' : ''}>Monto fijo</option>
          <option value="porcentaje" ${m.tipo === 'porcentaje' ? 'selected' : ''}>Porcentaje de la factura</option></select></label>
        <label class="campo">Monto fijo (RD$)<input name="mora_valor" inputmode="decimal" value="${(m.valor_cents / 100).toFixed(2)}"></label>
        <label class="campo">Porcentaje (%)<input name="mora_pct" type="number" step="0.1" min="0" max="100" value="${m.porcentaje}"></label>
        <label class="campo">Días de atraso antes de la mora<input name="mora_dias" type="number" min="0" value="${m.dias}"></label>
      </div>
      <p class="ayuda">La facturación automática y la mora se activan en la próxima fase (caja y facturación).</p>
    </div>
    <div class="carta">
      <h2>Recibos</h2>
      <div class="grid2">
        <label class="campo">Ancho de la impresora térmica<select name="ancho">
          <option value="80" ${c.recibo.ancho_mm === 80 ? 'selected' : ''}>80 mm</option>
          <option value="58" ${c.recibo.ancho_mm === 58 ? 'selected' : ''}>58 mm</option></select></label>
        <label class="campo">Texto al pie del recibo<input name="pie" value="${esc(c.recibo.pie)}" placeholder="¡Gracias por su pago!"></label>
        <label class="fila"><input type="checkbox" disabled ${c.ncf.activo ? 'checked' : ''}> Comprobantes fiscales (NCF) — pendiente de datos DGII</label>
      </div>
    </div>
    <div class="carta">
      <h2>Centro del mapa</h2>
      <p class="ayuda">Mueva el mapa hasta que quede centrado en la comunidad y presione Guardar. Así abrirá siempre el mapa.</p>
      <div id="mm" class="mini-mapa" style="height:240px"></div>
    </div>
    <div style="grid-column:1/-1"><button class="btn" type="submit">Guardar configuración</button> <span class="error-txt" id="err"></span></div>
  </form>
  <div class="carta" style="margin-top:16px">
    <div class="fila entre"><h2 style="margin:0">Tipos de puntos del mapa</h2><button class="btn sec chico" id="nuevoTipo">+ Nuevo tipo</button></div>
    <div id="tipos" style="margin-top:10px"></div>
  </div>`;

  let map;
  if (await leafletDisponible()) map = createMap(el.querySelector('#mm'), { center: c.mapa.centro, zoom: c.mapa.zoom });
  else el.querySelector('#mm').outerHTML = AVISO_SIN_LEAFLET;

  el.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const d = datosForm(e.target);
    const valor = toCents(d.mora_valor);
    const body = {
      empresa: { nombre: d.nombre, rnc: d.rnc, telefono: d.telefono, direccion: d.direccion },
      facturacion: { dia_generacion: Number(d.dia), mora: { activa: d.mora_activa, tipo: d.mora_tipo, valor_cents: valor ?? 0, porcentaje: Number(d.mora_pct), dias: Number(d.mora_dias) } },
      recibo: { ancho_mm: Number(d.ancho), pie: d.pie },
    };
    if (map) { const ce = map.getCenter(); body.mapa = { centro: { lat: +ce.lat.toFixed(6), lng: +ce.lng.toFixed(6) }, zoom: map.getZoom() }; }
    try {
      await api('PUT', '/api/config', body);
      await ctx.refreshConfig();
      el.querySelector('#err').textContent = '';
      toast('Configuración guardada', 'ok');
    } catch (err) { el.querySelector('#err').textContent = err.message; }
  };

  async function cargarTipos() {
    const tipos = await api('GET', '/api/mapa/tipos');
    el.querySelector('#tipos').innerHTML = `<table class="tabla"><thead><tr><th>Ícono</th><th>Nombre</th><th>Clave</th><th></th></tr></thead><tbody>
      ${tipos.map(t => `<tr><td><div class="punto-ico" style="background:${esc(t.color)}">${esc(t.icon)}</div></td>
      <td>${esc(t.name)}</td><td class="ayuda">${esc(t.key)}</td><td><button class="btn sec chico" data-t="${t.id}">Editar</button></td></tr>`).join('')}
      </tbody></table>`;
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => editarTipo(tipos.find(t => t.id == b.dataset.t)));
  }

  async function editarTipo(t) {
    const ok = await modal({
      titulo: t ? `Tipo: ${t.name}` : 'Nuevo tipo de punto',
      contenido: `<div class="grid2">
        <label class="campo">Nombre<input name="name" value="${esc(t?.name)}" required></label>
        <label class="campo">Clave (sin espacios)<input name="key" value="${esc(t?.key)}" ${t?.is_system ? 'disabled' : ''} pattern="[a-z0-9_]{2,30}" placeholder="medidor"></label>
        <label class="campo">Ícono (letra o emoji)<input name="icon" value="${esc(t?.icon)}" maxlength="4" required></label>
        <label class="campo">Color<input name="color" type="color" value="${esc(t?.color || '#1E88E5')}"></label></div>`,
      onOk: (f) => {
        const d = datosForm(f);
        if (t?.is_system) delete d.key;
        return t ? api('PUT', `/api/mapa/tipos/${t.id}`, d) : api('POST', '/api/mapa/tipos', d);
      },
    });
    if (ok) { toast('Tipo guardado', 'ok'); cargarTipos(); }
  }
  el.querySelector('#nuevoTipo').onclick = () => editarTipo();
  await cargarTipos();
}
