import { api, session } from '../api.js';

export function render(root) {
  root.innerHTML = `
  <div class="login-pantalla">
    <div class="login-caja">
      <img src="/img/logo.png" alt="CADARVIS">
      <div class="ayuda">Sistema del Acueducto Rural de Villa Sombrero</div>
      <form>
        <label class="campo">Usuario<input name="username" autocomplete="username" autocapitalize="none" required></label>
        <label class="campo">Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
        <div class="error-txt"></div>
        <button class="btn" type="submit">Entrar</button>
      </form>
    </div>
  </div>`;
  const form = root.querySelector('form');
  form.username.focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api('POST', '/api/auth/login', { username: form.username.value, password: form.password.value });
      session.set(r.token);
      root.innerHTML = '';
      if (location.hash === '#/') window.dispatchEvent(new HashChangeEvent('hashchange'));
      else location.hash = '#/';
    } catch (err) {
      form.querySelector('.error-txt').textContent = err.message;
      btn.disabled = false;
    }
  };
}
