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
  const catalogo = await api('GET', '/api/inicio/widgets');
  const esSuper = ctx.user.role === 'Superadmin';

  async function cargar() {
    const rangos = await api('GET', '/api/rangos');
    el.innerHTML = rangos.map(r => `
      <div class="carta">
        <div class="fila entre"><h2 style="margin:0">${esc(r.name)} <span class="ayuda">· ${r.users} usuario(s)</span></h2>
          <div class="fila">
            ${puede && (r.name !== 'Superadmin' || esSuper) ? `<button class="btn sec chico" data-panel="${r.id}">Panel de inicio</button>` : ''}
            ${puede && r.name !== 'Superadmin' ? `<button class="btn sec chico" data-editar="${r.id}">Editar permisos</button>` : ''}
            ${puede && !r.is_system ? `<button class="btn peligro chico" data-borrar="${r.id}">Borrar</button>` : ''}
          </div>
        </div>
        <p class="ayuda" style="margin:.6rem 0 0">${r.name === 'Superadmin' ? 'Acceso total. No se puede modificar.' :
          (r.perms.length ? r.perms.map(p => esc(NOMBRES[p] || p)).join(' · ') : 'Sin permisos')}</p>
        <p class="ayuda" style="margin:.4rem 0 0">🏠 Inicio: ${r.inicio.length ? r.inicio.map(k => esc(catalogo.find(w => w.key === k)?.title || k)).join(' · ') : 'vacío'}</p>
      </div>`).join('');
    el.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => editar(rangos.find(r => r.id == b.dataset.editar)));
    el.querySelectorAll('[data-panel]').forEach(b => b.onclick = () => editarPanel(rangos.find(r => r.id == b.dataset.panel)));
    el.querySelectorAll('[data-borrar]').forEach(b => b.onclick = async () => {
      if (!await confirmar('Borrar rango', 'Se borrará este rango. Solo es posible si no tiene usuarios.')) return;
      try { await api('DELETE', `/api/rangos/${b.dataset.borrar}`); toast('Rango borrado', 'ok'); cargar(); }
      catch (e) { toast(e.message, 'error'); }
    });
  }

  // Panel de inicio: qué widgets ve el rango y en qué orden
  async function editarPanel(r) {
    const orden = [...r.inicio, ...catalogo.map(w => w.key).filter(k => !r.inicio.includes(k))];
    const item = k => {
      const w = catalogo.find(x => x.key === k);
      const ok = r.perms.includes(w.perm);
      return `<li data-k="${k}" class="${ok ? '' : 'no-permitido'}"><label><input type="checkbox" ${r.inicio.includes(k) && ok ? 'checked' : ''} ${ok ? '' : 'disabled'}>
        ${esc(w.title)}${ok ? '' : ' <span class="ayuda">(sin permiso)</span>'}</label>
        <button type="button" class="btn sec chico" data-sube>▲</button><button type="button" class="btn sec chico" data-baja>▼</button></li>`;
    };
    const ok = await modal({
      titulo: `Panel de inicio: ${r.name}`,
      contenido: `<p class="ayuda">Marque lo que verá este rango al entrar y ordénelo con las flechas.</p>
        <ul class="lista orden-widgets">${orden.map(item).join('')}</ul>`,
      onOpen: (f) => f.querySelector('.orden-widgets').addEventListener('click', e => {
        const li = e.target.closest('li');
        if (e.target.dataset.sube !== undefined && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
        if (e.target.dataset.baja !== undefined && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
      }),
      onOk: (f) => {
        const widgets = [...f.querySelectorAll('.orden-widgets li')].filter(li => li.querySelector('input').checked).map(li => li.dataset.k);
        return api('PUT', `/api/rangos/${r.id}/inicio`, { widgets });
      },
    });
    if (ok) { toast('Panel de inicio guardado', 'ok'); cargar(); }
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
