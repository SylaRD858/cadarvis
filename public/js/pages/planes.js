import { api } from '../api.js';
import { esc, money, toCents, modal, toast, datosForm } from '../ui.js';
import { setTitulo, setAcciones } from '../app.js';

export async function render(el, params, ctx) {
  setTitulo('Planes', 'Tarifas fijas mensuales');
  const puede = ctx.can('planes.editar');
  if (puede) setAcciones('<button class="btn" id="nuevo">+ Nuevo plan</button>').querySelector('#nuevo').onclick = () => editar();

  async function cargar() {
    const planes = await api('GET', '/api/planes');
    el.innerHTML = `<div class="carta"><table class="tabla">
      <thead><tr><th>Plan</th><th>Precio mensual</th><th>Clientes</th><th>Estado</th></tr></thead>
      <tbody>${planes.length ? planes.map(p => `
        <tr class="${puede ? 'clic' : ''}" data-id="${p.id}"><td><b>${esc(p.name)}</b></td><td>${money(p.price_cents)}</td>
        <td>${p.clients}</td><td><span class="chip ${p.active ? 'activo' : 'inactivo'}">${p.active ? 'activo' : 'inactivo'}</span></td></tr>`).join('')
        : '<tr><td colspan="4" class="vacio">Todavía no hay planes. Cree el primero (por ejemplo: Residencial).</td></tr>'}</tbody>
    </table></div>`;
    if (puede) el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => editar(planes.find(p => p.id == tr.dataset.id)));
  }

  async function editar(p) {
    const ok = await modal({
      titulo: p ? `Editar plan ${p.name}` : 'Nuevo plan',
      contenido: `<div class="grid2">
        <label class="campo">Nombre<input name="name" value="${esc(p?.name)}" required></label>
        <label class="campo">Precio mensual (RD$)<input name="precio" value="${p ? (p.price_cents / 100).toFixed(2) : ''}" inputmode="decimal" required></label>
        ${p ? `<label class="fila"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Plan activo</label>` : ''}
      </div>`,
      onOk: async (f) => {
        const d = datosForm(f);
        const price_cents = toCents(d.precio);
        if (price_cents === null) throw new Error('Precio inválido');
        const body = { name: d.name, price_cents, ...(p ? { active: d.active } : {}) };
        return p ? api('PUT', `/api/planes/${p.id}`, body) : api('POST', '/api/planes', body);
      },
    });
    if (ok) { toast('Plan guardado', 'ok'); cargar(); }
  }

  await cargar();
}
