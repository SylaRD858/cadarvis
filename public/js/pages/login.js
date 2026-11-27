import { api, session } from '../api.js';

function entrar(root, token) {
  session.set(token);
  root.innerHTML = '';
  if (location.hash === '#/') window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = '#/';
}

export async function render(root) {
  let setup = false;
  try { setup = (await api('GET', '/api/setup')).needed; } catch {}

  root.innerHTML = `
  <div class="login-pantalla">
    <div class="login-caja">
      <img src="/img/logo.png" alt="CADARVIS">
      <div class="ayuda">${setup ? '<b>Primer inicio:</b> cree el usuario superadministrador del sistema.' : 'Sistema del Acueducto Rural de Villa Sombrero'}</div>
      <form>
        ${setup ? '<label class="campo">Nombre completo<input name="full_name" required></label>' : ''}
        <label class="campo">Usuario<input name="username" autocomplete="username" autocapitalize="none" required></label>
        <label class="campo">Contraseña<input name="password" type="password" autocomplete="${setup ? 'new-password' : 'current-password'}" required ${setup ? 'minlength="8"' : ''}></label>
        ${setup ? '<label class="campo">Repita la contraseña<input name="password2" type="password" autocomplete="new-password" required></label>' : ''}
        <div class="error-txt"></div>
        <button class="btn" type="submit">${setup ? 'Crear superadmin y entrar' : 'Entrar'}</button>
      </form>
    </div>
  </div>`;
  const form = root.querySelector('form');
  form.querySelector('input').focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    const err = form.querySelector('.error-txt');
    if (setup && form.password.value !== form.password2.value) { err.textContent = 'Las contraseñas no coinciden'; return; }
    btn.disabled = true;
    try {
      const r = setup
        ? await api('POST', '/api/setup', { full_name: form.full_name.value, username: form.username.value, password: form.password.value })
        : await api('POST', '/api/auth/login', { username: form.username.value, password: form.password.value });
      entrar(root, r.token);
    } catch (e2) {
      err.textContent = e2.message;
      btn.disabled = false;
    }
  };
}
