import { api, session } from './api.js';
import { esc, toast } from './ui.js';

// Menú: [hash, texto, ícono, permiso requerido, módulo]
const MENU = [
  ['#/inicio', 'Inicio', '🏠', null, './pages/inicio.js'],
  ['#/averias', 'Averías', '🛠️', 'averias.ver', './pages/averias.js'],
  ['#/clientes', 'Clientes', '👥', 'clientes.ver', './pages/clientes.js'],
  ['#/mapa', 'Mapa', '🗺️', 'mapa.ver', './pages/mapa.js'],
  ['#/planes', 'Planes', '💧', 'planes.ver', './pages/planes.js'],
  ['#/usuarios', 'Usuarios', '🧑‍💼', 'usuarios.ver', './pages/usuarios.js'],
  ['#/rangos', 'Rangos', '🛡️', 'usuarios.ver', './pages/rangos.js'],
  ['#/bitacora', 'Bitácora', '📜', 'bitacora.ver', './pages/bitacora.js'],
  ['#/config', 'Configuración', '⚙️', 'config.editar', './pages/config.js'],
];

// Rutas con parámetros
const ROUTES = [
  [/^#\/averias\/nueva(\?.*)?$/, './pages/averia.js', 'averias.crear', () => ({ id: null })],
  [/^#\/averias\/(\d+)$/, './pages/averia.js', 'averias.ver', m => ({ id: Number(m[1]) })],
  [/^#\/clientes\/nuevo$/, './pages/cliente-form.js', 'clientes.editar', () => ({ id: null })],
  [/^#\/clientes\/(\d+)$/, './pages/cliente-form.js', 'clientes.ver', m => ({ id: Number(m[1]) })],
];

export const ctx = {
  user: null,
  config: null,
  can(perm) { return !!this.user && (perm === null || this.user.perms.includes(perm)); },
  async refreshConfig() { this.config = await api('GET', '/api/config'); pintarMarca(); },
};

const root = document.getElementById('app');

function pintarMarca() {
  document.querySelectorAll('[data-empresa]').forEach(e => { e.textContent = ctx.config?.empresa?.nombre || 'CADARVIS'; });
}

function layout() {
  const items = MENU.filter(m => ctx.can(m[3]));
  const links = items.map(([h, t, i]) => `<a href="${h}" data-nav="${h}"><span class="ico">${i}</span><span>${esc(t)}</span></a>`).join('');
  root.innerHTML = `
  <div class="layout">
    <aside class="sidebar">
      <div class="brand"><img src="/img/logo.png" alt=""><div><b data-empresa>CADARVIS</b><small>Acueducto Villa Sombrero</small></div></div>
      <nav class="nav">${links}</nav>
      <div class="pie">${esc(ctx.user.full_name)}<br><small>${esc(ctx.user.role)}</small>
        <button class="btn sec chico" data-salir>Salir</button></div>
    </aside>
    <div class="main">
      <header class="topbar"><div><h1 id="titulo"></h1><div class="sub" id="subtitulo"></div></div>
        <div id="acciones" class="fila"></div></header>
      <section class="contenido" id="vista"></section>
    </div>
  </div>
  <nav class="bottom-nav">${links}<a href="#/salir" data-salir><span class="ico">🚪</span>Salir</a></nav>`;
  root.querySelectorAll('[data-salir]').forEach(b => b.addEventListener('click', async (e) => {
    e.preventDefault();
    try { await api('POST', '/api/auth/logout', {}); } catch {}
    session.clear();
    ctx.user = null;
    location.hash = '#/login';
  }));
  pintarMarca();
}

export function setTitulo(titulo, sub = '') {
  document.getElementById('titulo').textContent = titulo;
  document.getElementById('subtitulo').textContent = sub;
  document.getElementById('acciones').innerHTML = '';
  document.title = `${titulo} — CADARVIS`;
}

export function setAcciones(html) {
  const a = document.getElementById('acciones');
  a.innerHTML = html;
  return a;
}

let renderId = 0;
let cargandoUsuario = null;
async function route() {
  const hash = location.hash || '#/';
  const id = ++renderId;

  if (hash === '#/login' || !session.token) {
    ctx.user = null;
    const m = await import('./pages/login.js');
    return m.render(root, {}, ctx);
  }
  if (!ctx.user) {
    // Una sola carga del usuario aunque lleguen varias navegaciones seguidas
    cargandoUsuario ||= (async () => {
      ctx.user = (await api('GET', '/api/auth/me')).user;
      await ctx.refreshConfig();
    })().finally(() => { cargandoUsuario = null; });
    try { await cargandoUsuario; } catch { return; }
    if (id !== renderId) return;
  }
  if (!document.getElementById('vista')) layout();

  const query = Object.fromEntries(new URLSearchParams(hash.split('?')[1] || ''));
  let mod, params = { ...query }, perm;
  for (const [re, m, p, fn] of ROUTES) {
    const r = re.exec(hash);
    if (r) { mod = m; perm = p; params = { ...query, ...fn(r) }; break; }
  }
  if (!mod) {
    const item = MENU.find(m => m[0] === hash.split('?')[0]);
    if (item) { mod = item[4]; perm = item[3]; }
  }
  if (!mod || !ctx.can(perm)) {
    const first = MENU.find(m => ctx.can(m[3]));
    if (first && hash !== first[0]) { location.hash = first[0]; return; }
    document.getElementById('vista').innerHTML = '<div class="carta vacio">No tiene acceso a ninguna sección.</div>';
    return;
  }

  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('activo', hash.split('?')[0] === a.dataset.nav || hash.startsWith(a.dataset.nav + '/')));
  const vista = document.getElementById('vista');
  vista.innerHTML = '<div class="vacio">Cargando…</div>';
  try {
    const m = await import(mod);
    if (id !== renderId) return;
    vista.innerHTML = '';
    await m.render(vista, params, ctx);
  } catch (e) {
    console.error(e);
    if (id === renderId) vista.innerHTML = `<div class="carta vacio">${esc(e.message)}</div>`;
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', e => { if (e.reason?.message) toast(e.reason.message, 'error'); });
route();
