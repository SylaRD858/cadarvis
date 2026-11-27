import { api } from '../api.js';
import { esc, modal, toast, confirmar } from '../ui.js';
import { setTitulo, setAcciones } from '../app.js';

const NOMBRES = {
  'usuarios.ver': 'Ver usuarios y rangos', 'usuarios.editar': 'Crear y editar usuarios', 'rangos.editar': 'Crear y editar rangos',
  'config.editar': 'Cambiar la configuración', 'bitacora.ver': 'Ver la bitácora',
  'planes.ver': 'Ver planes', 'planes.editar': 'Crear y editar planes',
  'clientes.ver': 'Ver clientes', 'clientes.editar': 'Registrar y editar clientes',
  'mapa.ver': 'Ver el mapa', 'mapa.editar': 'Agregar y editar puntos del mapa',
};

export async function render(el, params, ctx) {
  setTitulo('Rangos', 'Qué puede hacer cada tipo de usuario');
  const puede = ctx.can('rangos.editar');
  if (puede) setAcciones('<button class="btn" id="nuevo">+ Nuevo rango</button>').querySelector('#nuevo').onclick = () => editar();
  const { groups } = await api('GET', '/api/permisos');

  async function cargar() {
    const rangos = await api('GET', '/api/rangos');
    el.innerHTML = rangos.map(r => `
      <div class="carta">
        <div class="fila entre"><h2 style="margin:0">${esc(r.name)} <span class="ayuda">· ${r.users} usuario(s)</span></h2>
          ${puede && r.name !== 'Superadmin' ? `<div class="fila"><button class="btn sec chico" data-editar="${r.id}">Editar permisos</button>
          ${!r.is_system ? `<button class="btn peligro chico" data-borrar="${r.id}">Borrar</button>` : ''}</div>` : ''}
        </div>
        <p class="ayuda" style="margin:.6rem 0 0">${r.name === 'Superadmin' ? 'Acceso total. No se puede modificar.' :
          (r.perms.length ? r.perms.map(p => esc(NOMBRES[p] || p)).join(' · ') : 'Sin permisos')}</p>
      </div>`).join('');
    el.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => editar(rangos.find(r => r.id == b.dataset.editar)));
    el.querySelectorAll('[data-borrar]').forEach(b => b.onclick = async () => {
      if (!await confirmar('Borrar rango', 'Se borrará este rango. Solo es posible si no tiene usuarios.')) return;
      try { await api('DELETE', `/api/rangos/${b.dataset.borrar}`); toast('Rango borrado', 'ok'); cargar(); }
      catch (e) { toast(e.message, 'error'); }
    });
  }

  async function editar(r) {
    const checks = Object.entries(groups).map(([g, perms]) => `<fieldset><legend>${esc(g)}</legend>
      ${perms.map(p => `<label><input type="checkbox" value="${p}" ${r?.perms.includes(p) ? 'checked' : ''}> ${esc(NOMBRES[p] || p)}</label>`).join('')}
    </fieldset>`).join('');
    const ok = await modal({
      titulo: r ? `Rango ${r.name}` : 'Nuevo rango',
      contenido: `<label class="campo" style="margin-bottom:12px">Nombre<input name="name" value="${esc(r?.name)}" ${r?.is_system ? 'disabled' : ''} required></label>
        <div class="permisos">${checks}</div>`,
      onOk: async (f) => {
        const perms = [...f.querySelectorAll('.permisos input:checked')].map(i => i.value);
        const body = { perms, ...(r?.is_system ? {} : { name: f.name.value }) };
        return r ? api('PUT', `/api/rangos/${r.id}`, body) : api('POST', '/api/rangos', body);
      },
    });
    if (ok) { toast('Rango guardado', 'ok'); cargar(); }
  }

  await cargar();
}
