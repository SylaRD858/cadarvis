import { api } from '../api.js';
import { esc, debounce, fmtFecha } from '../ui.js';
import { setTitulo, setAcciones } from '../app.js';
import { TIPOS, PRIORIDADES, ESTADOS, chipPrioridad, chipEstadoAveria } from '../averias-common.js';

const POR_PAGINA = 25;
const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');

export async function render(el, params, ctx) {
  setTitulo('Averías', 'Reportes de averías de la red');
  if (ctx.can('averias.crear')) setAcciones('<a class="btn" href="#/averias/nueva">+ Reportar avería</a>');
  const tecnicos = await api('GET', '/api/averias/tecnicos').catch(() => []);
  const vista = params.estado ? '' : (params.vista || 'abiertas');

  el.innerHTML = `
  <div class="carta"><div class="fila">
    <input class="crece" id="q" placeholder="Buscar por código, descripción, cliente o dirección…" style="min-width:200px">
    <select id="vista" style="width:auto">
      <option value="abiertas" ${vista === 'abiertas' ? 'selected' : ''}>Abiertas</option>
      <option value="" ${vista === '' ? 'selected' : ''}>Todas</option>
    </select>
    <select id="estado" style="width:auto"><option value="">Cualquier estado</option>${opts(ESTADOS, params.estado)}</select>
    <select id="prioridad" style="width:auto"><option value="">Cualquier prioridad</option>${params.prioridad === 'urgente,alta' ? '<option value="urgente,alta" selected>Urgente o alta</option>' : ''}${opts(PRIORIDADES, params.prioridad)}</select>
    <select id="tipo" style="width:auto"><option value="">Cualquier tipo</option>${opts(TIPOS, params.tipo)}</select>
    <select id="asignado" style="width:auto"><option value="">Cualquier técnico</option>
      <option value="yo" ${params.asignado === 'yo' ? 'selected' : ''}>Asignadas a mí</option>
      ${tecnicos.map(t => `<option value="${t.id}" ${String(t.id) === params.asignado ? 'selected' : ''}>${esc(t.full_name)}</option>`).join('')}</select>
  </div></div>
  <div class="carta">
    <div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Código</th><th>Tipo</th><th>Prioridad</th><th>Estado</th><th>Cliente / lugar</th><th>Técnico</th><th>Reportada</th></tr></thead>
      <tbody id="filas"></tbody></table></div>
    <div class="fila entre" style="margin-top:12px"><span class="ayuda" id="total"></span>
      <div class="fila"><button class="btn sec chico" id="ant">‹ Anterior</button><button class="btn sec chico" id="sig">Siguiente ›</button></div></div>
  </div>`;

  const $ = s => el.querySelector(s);
  let offset = 0;
  async function cargar() {
    const qs = new URLSearchParams({ q: $('#q').value, estado: $('#estado').value, prioridad: $('#prioridad').value,
      tipo: $('#tipo').value, asignado: $('#asignado').value, limit: POR_PAGINA, offset });
    if ($('#vista').value === 'abiertas' && !$('#estado').value) qs.set('abiertas', '1');
    for (const [k, v] of [...qs]) if (v === '') qs.delete(k);
    const { items, total } = await api('GET', `/api/averias?${qs}`);
    $('#filas').innerHTML = items.length ? items.map(a => `
      <tr class="clic" data-id="${a.id}"><td><b>${esc(a.code)}</b></td><td>${esc(TIPOS[a.type])}</td>
      <td>${chipPrioridad(a.priority)}</td><td>${chipEstadoAveria(a.status)}</td>
      <td>${a.client_name ? `${esc(a.client_name)} <span class="ayuda">${esc(a.client_code)}</span>` : esc(a.address || '—')}</td>
      <td>${esc(a.assigned_name || '—')}</td><td class="ayuda">${fmtFecha(a.created_at)}</td></tr>`).join('')
      : '<tr><td colspan="7" class="vacio">No hay averías con esos filtros. 👍</td></tr>';
    $('#total').textContent = total ? `${offset + 1}–${Math.min(offset + POR_PAGINA, total)} de ${total}` : '';
    $('#ant').disabled = offset === 0;
    $('#sig').disabled = offset + POR_PAGINA >= total;
  }
  $('#filas').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = `#/averias/${tr.dataset.id}`; });
  $('#q').addEventListener('input', debounce(() => { offset = 0; cargar(); }));
  ['#vista', '#estado', '#prioridad', '#tipo', '#asignado'].forEach(s => $(s).onchange = () => { offset = 0; cargar(); });
  $('#ant').onclick = () => { offset = Math.max(0, offset - POR_PAGINA); cargar(); };
  $('#sig').onclick = () => { offset += POR_PAGINA; cargar(); };
  await cargar();
}
