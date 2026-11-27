export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function money(cents) {
  return 'RD$ ' + (Number(cents || 0) / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "300.50" -> 30050 ; null si no es un número válido
export function toCents(v) {
  const n = Number(String(v).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function fmtCedula(c) {
  return c && c.length === 11 ? `${c.slice(0, 3)}-${c.slice(3, 10)}-${c.slice(10)}` : (c || '');
}

export function fmtFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', dateStyle: 'medium', timeStyle: 'short' });
}

export function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 5000 : 3000);
}

export function debounce(fn, ms = 300) {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

// Abre un modal. contenido: HTML. onOk(modalEl) puede lanzar Error para mostrarlo y dejar el modal abierto.
export function modal({ titulo, contenido, okTexto = 'Guardar', onOk, onOpen, peligro = false }) {
  return new Promise(resolve => {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `<form class="modal">
      <h2>${esc(titulo)}</h2>
      <div class="cuerpo">${contenido}</div>
      <div class="error-txt"></div>
      <div class="acciones">
        <button type="button" class="btn sec" data-cancelar>Cancelar</button>
        ${onOk ? `<button type="submit" class="btn ${peligro ? 'peligro' : ''}">${esc(okTexto)}</button>` : ''}
      </div></form>`;
    const form = fondo.querySelector('form');
    const cerrar = (v) => { fondo.remove(); resolve(v); };
    fondo.querySelector('[data-cancelar]').onclick = () => cerrar(null);
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(null); });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try { cerrar(await onOk(form)); }
      catch (err) { form.querySelector('.error-txt').textContent = err.message; btn.disabled = false; }
    };
    document.body.appendChild(fondo);
    onOpen?.(form);
    form.querySelector('input,select,textarea')?.focus();
  });
}

export function confirmar(titulo, texto, okTexto = 'Sí, continuar') {
  return modal({ titulo, contenido: `<p>${esc(texto)}</p>`, okTexto, peligro: true, onOk: () => true });
}

export function chipEstado(estado) {
  return `<span class="chip ${esc(estado)}">${esc(estado)}</span>`;
}

// Lee los campos name="" de un formulario como objeto
export function datosForm(form) {
  const o = {};
  for (const el of form.querySelectorAll('[name]')) {
    o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return o;
}
