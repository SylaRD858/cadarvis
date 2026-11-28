import { api } from '../api.js';
import { esc, fmtFecha } from '../ui.js';
import { setTitulo } from '../app.js';

const ENTIDADES = { usuario: 'Usuario', rango: 'Rango', config: 'Configuración', plan: 'Plan', cliente: 'Cliente', punto: 'Punto del mapa', tipo_punto: 'Tipo de punto', sesion: 'Sesión', inicio_rango: 'Panel de inicio' };

export async function render(el) {
  setTitulo('Bitácora', 'Últimas acciones realizadas en el sistema');
  const rows = await api('GET', '/api/bitacora?limit=200');
  el.innerHTML = `<div class="carta tabla-scroll"><table class="tabla">
    <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Sobre</th><th>Detalle</th></tr></thead>
    <tbody>${rows.map(r => {
      let det = '';
      try { const a = JSON.parse(r.after || r.before || 'null'); det = a ? (a.code || a.name || a.full_name || a.username || '') : ''; } catch {}
      return `<tr><td class="ayuda">${fmtFecha(r.at)}</td><td>${esc(r.username || '—')}</td><td>${esc(r.action)}</td>
        <td>${esc(ENTIDADES[r.entity] || r.entity)} ${r.entity_id ? `#${esc(r.entity_id)}` : ''}</td><td>${esc(det)}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="vacio">Sin registros</td></tr>'}</tbody></table></div>`;
}
