import { api } from '../api.js';
import { esc, modal, toast, datosForm, fmtFecha } from '../ui.js';
import { setTitulo, setAcciones } from '../app.js';

export async function render(el, params, ctx) {
  setTitulo('Usuarios', 'Personal con acceso al sistema');
  const puede = ctx.can('usuarios.editar');
  if (puede) setAcciones('<button class="btn" id="nuevo">+ Nuevo usuario</button>').querySelector('#nuevo').onclick = () => editar();
  const rangos = await api('GET', '/api/rangos');
  const esSuper = ctx.user.role === 'Superadmin';

  async function cargar() {
    const users = await api('GET', '/api/usuarios');
    el.innerHTML = `<div class="carta tabla-scroll"><table class="tabla">
      <thead><tr><th>Usuario</th><th>Nombre</th><th>Rango</th><th>Estado</th><th>Creado</th></tr></thead>
      <tbody>${users.map(u => `<tr class="${puede ? 'clic' : ''}" data-id="${u.id}">
        <td><b>${esc(u.username)}</b></td><td>${esc(u.full_name)}</td><td>${esc(u.role_name)}</td>
        <td><span class="chip ${u.active ? 'activo' : 'inactivo'}">${u.active ? 'activo' : 'inactivo'}</span></td>
        <td class="ayuda">${fmtFecha(u.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
    if (puede) el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => editar(users.find(u => u.id == tr.dataset.id)));
  }

  async function editar(u) {
    const opciones = rangos.filter(r => esSuper || r.name !== 'Superadmin' || u?.role_id === r.id)
      .map(r => `<option value="${r.id}" ${u?.role_id === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
    const ok = await modal({
      titulo: u ? `Editar ${u.username}` : 'Nuevo usuario',
      contenido: `<div class="grid2">
        ${u ? '' : '<label class="campo">Usuario<input name="username" autocapitalize="none" required></label>'}
        <label class="campo">Nombre completo<input name="full_name" value="${esc(u?.full_name)}" required></label>
        <label class="campo">Rango<select name="role_id">${opciones}</select></label>
        <label class="campo">${u ? 'Nueva contraseña (opcional)' : 'Contraseña'}<input name="password" type="password" autocomplete="new-password" ${u ? '' : 'required'} minlength="8"></label>
        ${u ? `<label class="fila"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Usuario activo</label>` : ''}
      </div><p class="ayuda">La contraseña debe tener al menos 8 caracteres.</p>`,
      onOk: async (f) => {
        const d = datosForm(f);
        const body = { ...d, role_id: Number(d.role_id) };
        if (u && !body.password) delete body.password;
        return u ? api('PUT', `/api/usuarios/${u.id}`, body) : api('POST', '/api/usuarios', body);
      },
    });
    if (ok) { toast('Usuario guardado', 'ok'); cargar(); }
  }

  await cargar();
}
