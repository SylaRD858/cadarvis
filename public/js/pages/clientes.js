import { api } from '../api.js';
import { esc, fmtCedula, debounce, chipEstado, money } from '../ui.js';
import { setTitulo, setAcciones } from '../app.js';

const POR_PAGINA = 25;

export async function render(el, params, ctx) {
  setTitulo('Clientes', 'Abonados del acueducto');
  if (ctx.can('clientes.editar')) setAcciones('<a class="btn" href="#/clientes/nuevo">+ Nuevo cliente</a>');

  const planes = await api('GET', '/api/planes').catch(() => []);
  el.innerHTML = `
  <div class="carta">
    <div class="fila">
      <input class="crece" id="q" placeholder="Buscar por nombre, código, cédula o teléfono…" style="min-width:220px">
      <select id="estado" style="width:auto">
        <option value="">Todos los estados</option>
        <option>activo</option><option>suspendido</option><option>cortado</option><option>retirado</option>
      </select>
      <select id="plan" style="width:auto">
        <option value="">Todos los planes</option>
        ${planes.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
      </select>
    </div>
  </div>
  <div class="carta">
    <div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>Código</th><th>Nombre</th><th>Cédula</th><th>Teléfono</th><th>Sector</th><th>Plan</th><th>Estado</th><th>Mapa</th></tr></thead>
      <tbody id="filas"></tbody>
    </table></div>
    <div class="fila entre" style="margin-top:12px">
      <span class="ayuda" id="total"></span>
      <div class="fila"><button class="btn sec chico" id="ant">‹ Anterior</button><button class="btn sec chico" id="sig">Siguiente ›</button></div>
    </div>
  </div>`;

  const $ = s => el.querySelector(s);
  let offset = 0;

  async function cargar() {
    const qs = new URLSearchParams({ q: $('#q').value, estado: $('#estado').value, plan_id: $('#plan').value, limit: POR_PAGINA, offset });
    const { items, total } = await api('GET', `/api/clientes?${qs}`);
    $('#filas').innerHTML = items.length ? items.map(c => `
      <tr class="clic" data-id="${c.id}">
        <td><b>${esc(c.code)}</b></td><td>${esc(c.full_name)}</td><td>${esc(fmtCedula(c.cedula))}</td>
        <td>${esc(c.phone || '')}</td><td>${esc(c.sector || '')}</td>
        <td>${c.plan_name ? `${esc(c.plan_name)} <span class="ayuda">${money(c.plan_price_cents)}</span>` : '<span class="ayuda">—</span>'}</td>
        <td>${chipEstado(c.status)}</td><td>${c.lat != null ? '📍' : '<span class="ayuda">—</span>'}</td>
      </tr>`).join('') : `<tr><td colspan="8" class="vacio">No hay clientes${$('#q').value ? ' que coincidan' : ' registrados todavía'}.</td></tr>`;
    $('#total').textContent = total ? `${offset + 1}–${Math.min(offset + POR_PAGINA, total)} de ${total}` : '';
    $('#ant').disabled = offset === 0;
    $('#sig').disabled = offset + POR_PAGINA >= total;
  }

  $('#filas').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) location.hash = `#/clientes/${tr.dataset.id}`;
  });
  $('#q').addEventListener('input', debounce(() => { offset = 0; cargar(); }, 300));
  $('#estado').onchange = $('#plan').onchange = () => { offset = 0; cargar(); };
  $('#ant').onclick = () => { offset = Math.max(0, offset - POR_PAGINA); cargar(); };
  $('#sig').onclick = () => { offset += POR_PAGINA; cargar(); };
  $('#q').focus();
  await cargar();
}
