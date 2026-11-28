import { api } from '../api.js';
import { esc, money, fmtFecha, modal } from '../ui.js';
import { setTitulo, setAcciones } from '../app.js';
import { TIPOS, chipPrioridad, chipEstadoAveria } from '../averias-common.js';

const ACCIONES = { crear: 'creó', editar: 'editó', borrar: 'borró' };
const ENTIDADES = { usuario: 'usuario', rango: 'rango', config: 'la configuración', plan: 'plan', cliente: 'cliente', punto: 'punto del mapa',
  tipo_punto: 'tipo de punto', inicio_rango: 'panel de inicio', averia: 'avería' };
// A qué pantalla lleva cada registro de la bitácora
const ENLACE = { cliente: id => `#/clientes/${id}`, averia: id => `#/averias/${id}`, plan: () => '#/planes', usuario: () => '#/usuarios',
  rango: () => '#/rangos', inicio_rango: () => '#/rangos', punto: () => '#/mapa', tipo_punto: () => '#/config', config: () => '#/config' };

function saludo() {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Santo_Domingo', hour: 'numeric', hour12: false }));
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

const q = obj => '?' + new URLSearchParams(obj).toString();
const kpi = (valor, etiqueta, href, color = 'var(--azul)') =>
  `<a class="kpi" href="${href}" title="Ver detalle"><b style="color:${color}">${valor}</b><span>${esc(etiqueta)} ›</span></a>`;
const barra = (etiqueta, n, max, href, color = 'var(--celeste)', texto = String(n)) =>
  `<a class="barra" href="${href}" title="Ver detalle"><span>${esc(etiqueta)}</span><div><i style="width:${max ? Math.max(4, (n / max) * 100) : 0}%;background:${color}"></i></div><b>${esc(texto)}</b></a>`;

const RENDER = {
  averias_resumen: d => `
    <div class="kpis">
      ${kpi(d.abiertas, 'Abiertas', '#/averias', 'var(--rojo)')}
      ${kpi(d.urgentes, 'Urgentes / alta', '#/averias' + q({ prioridad: 'urgente,alta' }), '#B71C1C')}
      ${kpi(d.por_estado.nueva, 'Sin atender', '#/averias' + q({ estado: 'nueva' }), '#C62828')}
      ${kpi(d.por_estado.en_proceso, 'En proceso', '#/averias' + q({ estado: 'en_proceso' }), 'var(--azul-osc)')}
    </div>
    <p class="ayuda">${d.resueltas_30d} resuelta(s) en 30 días${d.horas_promedio !== null ? ` · tiempo promedio ${d.horas_promedio < 48 ? `${d.horas_promedio} h` : `${Math.round(d.horas_promedio / 24)} días`}` : ''}
      · <a href="#/averias${q({ estado: 'resuelta' })}">ver resueltas</a></p>
    ${d.recientes.length ? `<ul class="lista">${d.recientes.map(a => `<li class="clic" data-href="#/averias/${a.id}">
      <b>${esc(a.code)}</b> ${esc(TIPOS[a.type])} ${chipPrioridad(a.priority)} ${chipEstadoAveria(a.status)}
      <div class="ayuda">${esc(a.client_name || '')}${a.assigned_name ? ` · 👷 ${esc(a.assigned_name)}` : ' · sin asignar'} · ${fmtFecha(a.created_at)}</div></li>`).join('')}</ul>`
      : '<p class="ayuda">✅ No hay averías abiertas.</p>'}`,

  clientes_resumen: d => `
    <div class="kpis">${kpi(d.total, 'Total', '#/clientes')}${kpi(d.por_estado.activo, 'Activos', '#/clientes' + q({ estado: 'activo' }), 'var(--verde)')}
    ${kpi(d.por_estado.suspendido, 'Suspendidos', '#/clientes' + q({ estado: 'suspendido' }), '#A66B00')}${kpi(d.por_estado.cortado, 'Cortados', '#/clientes' + q({ estado: 'cortado' }), 'var(--rojo)')}</div>
    <p class="ayuda"><a href="#/clientes${q({ desde: d.desde_mes })}">${d.nuevos_mes} cliente(s) nuevo(s) este mes</a> ·
      <a href="#/clientes${q({ estado: 'retirado' })}">${d.por_estado.retirado} retirado(s)</a></p>`,

  ingreso_esperado: d => {
    const max = Math.max(...d.por_plan.map(p => p.total_cents), 0);
    return `<div class="kpis">${kpi(money(d.mensual_cents), 'Por mes (clientes activos)', '#/planes', 'var(--azul-osc)')}</div>
      ${d.por_plan.map(p => barra(`${p.name} · ${p.clientes}`, p.total_cents, max, '#/clientes' + q({ plan_id: p.id, estado: 'activo' }), 'var(--celeste)', money(p.total_cents))).join('')}
      ${d.sin_plan ? `<a class="aviso" style="display:block;margin-top:8px" href="#/clientes${q({ sin_plan: 1, estado: 'activo' })}">⚠️ ${d.sin_plan} cliente(s) activo(s) sin plan asignado ›</a>` : ''}
      ${!d.por_plan.length ? '<p class="ayuda">Todavía no hay planes. <a href="#/planes">Crear uno</a></p>' : ''}`;
  },

  red_resumen: d => `
    <div class="chips-red">${d.tipos.map(t => `<a href="#/mapa${q({ tipo: t.key })}"><span><i class="punto-ico" style="background:${esc(t.color)}">${esc(t.icon)}</i>${esc(t.name)} <b>${t.total}</b></span></a>`).join('')}</div>
    <p class="ayuda"><a href="#/mapa${q({ tipo: '_cliente' })}">${d.clientes_ubicados} cliente(s) ubicados en el mapa ›</a></p>`,

  clientes_por_sector: d => {
    const max = Math.max(...d.map(x => x.total), 0);
    return d.length ? d.map(x => barra(x.sector, x.total, max, '#/clientes' + q({ sector: x.sector }), 'var(--ocre)')).join('') : '<p class="ayuda">Sin clientes todavía.</p>';
  },

  clientes_sin_ubicacion: d => d.total ? `
    <div class="kpis">${kpi(d.total, 'Sin marcar en el mapa', '#/clientes' + q({ sin_ubicacion: 1 }), 'var(--ocre)')}</div>
    <ul class="lista">${d.lista.map(c => `<li class="clic" data-href="#/clientes/${c.id}"><b>${esc(c.code)}</b> ${esc(c.full_name)} <span class="ayuda">${esc(c.sector || '')} · marcar ›</span></li>`).join('')}</ul>`
    : '<p class="ayuda">✅ Todos los clientes están ubicados en el mapa.</p>',

  usuarios_resumen: d => d.length
    ? `<div class="kpis">${d.map(r => kpi(r.total, r.rango, '#/usuarios')).join('')}</div>`
    : '<p class="ayuda">Sin usuarios activos.</p>',

  actividad_reciente: d => d.length ? `<ul class="lista">${d.map(a => `<li class="clic" data-bitacora="${a.id}">
      <b>${esc(a.user || 'Sistema')}</b> ${esc(ACCIONES[a.action] || a.action)} ${esc(ENTIDADES[a.entity] || a.entity)} <b>${esc(a.ref)}</b>
      <br><span class="ayuda">${fmtFecha(a.at)} · ver detalle ›</span></li>`).join('')}</ul>
      <p class="ayuda"><a href="#/bitacora">Ver toda la bitácora ›</a></p>` : '<p class="ayuda">Sin actividad todavía.</p>',
};

// Destino del título de cada cuadro
const TITULO = { averias_resumen: '#/averias', clientes_resumen: '#/clientes', ingreso_esperado: '#/planes', red_resumen: '#/mapa',
  clientes_por_sector: '#/clientes', clientes_sin_ubicacion: '#/clientes?sin_ubicacion=1', usuarios_resumen: '#/usuarios', actividad_reciente: '#/bitacora' };

const valor = v => (v !== null && typeof v === 'object') ? JSON.stringify(v) : (v ?? '—');

// Muestra qué cambió en un registro de la bitácora
export async function detalleBitacora(id) {
  const r = await api('GET', `/api/bitacora/${id}`);
  const b = r.before && typeof r.before === 'object' ? r.before : {};
  const a = r.after && typeof r.after === 'object' ? r.after : {};
  const OCULTAR = ['search', 'password_hash', 'updated_at', 'created_at', 'events', 'id'];
  const filas = [];
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (OCULTAR.includes(k)) continue;
    if (r.action === 'editar' && JSON.stringify(b[k] ?? null) === JSON.stringify(a[k] ?? null)) continue;
    filas.push(`<tr><th>${esc(k)}</th>${r.action !== 'crear' ? `<td>${esc(valor(b[k]))}</td>` : ''}${r.action !== 'borrar' ? `<td><b>${esc(valor(a[k]))}</b></td>` : ''}</tr>`);
  }
  const enlace = ENLACE[r.entity] && r.action !== 'borrar' ? ENLACE[r.entity](r.entity_id) : null;
  await modal({
    titulo: `${r.full_name || 'Sistema'} ${ACCIONES[r.action] || r.action} ${ENTIDADES[r.entity] || r.entity}`,
    contenido: `<p class="ayuda">${fmtFecha(r.at)}</p>
      ${filas.length ? `<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Campo</th>${r.action !== 'crear' ? '<th>Antes</th>' : ''}${r.action !== 'borrar' ? '<th>Después</th>' : ''}</tr></thead><tbody>${filas.join('')}</tbody></table></div>` : '<p class="ayuda">Sin detalles.</p>'}
      ${enlace ? `<p><a class="btn sec chico" href="${enlace}" data-cerrar>Abrir ${esc(ENTIDADES[r.entity] || '')} ›</a></p>` : ''}`,
    onOpen: f => f.querySelector('[data-cerrar]')?.addEventListener('click', () => f.querySelector('[data-cancelar]').click()),
  });
}

export async function render(el, params, ctx) {
  setTitulo(`${saludo()}, ${ctx.user.full_name.split(' ')[0]}`, `${ctx.config?.empresa?.nombre || 'CADARVIS'} · ${new Date().toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', weekday: 'long', day: 'numeric', month: 'long' })}`);
  const acc = [];
  if (ctx.can('averias.crear')) acc.push('<a class="btn" href="#/averias/nueva">+ Reportar avería</a>');
  if (ctx.can('rangos.editar')) acc.push('<a class="btn sec chico" href="#/rangos">Personalizar paneles</a>');
  setAcciones(acc.join(''));
  const { widgets } = await api('GET', '/api/inicio');
  el.innerHTML = widgets.length
    ? `<div class="tablero">${widgets.map(w => `<section class="carta widget w-${esc(w.key)}">
        <h2><a href="${TITULO[w.key] || '#/inicio'}">${esc(w.title)} ›</a></h2>${(RENDER[w.key] || (() => ''))(w.data)}</section>`).join('')}</div>`
    : '<div class="carta vacio">Tu panel de inicio está vacío. Un administrador puede configurarlo en Rangos.</div>';

  el.addEventListener('click', e => {
    if (e.target.closest('a')) return;
    const li = e.target.closest('[data-href]');
    if (li) { location.hash = li.dataset.href; return; }
    const bit = e.target.closest('[data-bitacora]');
    if (bit) detalleBitacora(bit.dataset.bitacora);
  });
}
