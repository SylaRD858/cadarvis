import { api } from '../api.js';
import { esc, money, fmtFecha } from '../ui.js';
import { setTitulo, setAcciones } from '../app.js';

const ACCIONES = { crear: 'creó', editar: 'editó', borrar: 'borró' };
const ENTIDADES = { usuario: 'usuario', rango: 'rango', config: 'la configuración', plan: 'plan', cliente: 'cliente', punto: 'punto del mapa', tipo_punto: 'tipo de punto', inicio_rango: 'panel de inicio' };

function saludo() {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Santo_Domingo', hour: 'numeric', hour12: false }));
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

const kpi = (valor, etiqueta, color = 'var(--azul)') =>
  `<div class="kpi"><b style="color:${color}">${valor}</b><span>${esc(etiqueta)}</span></div>`;

const barra = (etiqueta, n, max, color = 'var(--celeste)', texto = String(n)) =>
  `<div class="barra"><span>${esc(etiqueta)}</span><div><i style="width:${max ? Math.max(4, (n / max) * 100) : 0}%;background:${color}"></i></div><b>${esc(texto)}</b></div>`;

const RENDER = {
  clientes_resumen: d => `
    <div class="kpis">${kpi(d.total, 'Total')}${kpi(d.por_estado.activo, 'Activos', 'var(--verde)')}
    ${kpi(d.por_estado.suspendido, 'Suspendidos', '#A66B00')}${kpi(d.por_estado.cortado, 'Cortados', 'var(--rojo)')}</div>
    <p class="ayuda">${d.nuevos_mes} cliente(s) nuevo(s) este mes · ${d.por_estado.retirado} retirado(s)</p>
    <a class="btn sec chico" href="#/clientes">Ver clientes</a>`,

  ingreso_esperado: d => {
    const max = Math.max(...d.por_plan.map(p => p.total_cents), 0);
    return `<div class="kpis">${kpi(money(d.mensual_cents), 'Por mes (clientes activos)', 'var(--azul-osc)')}</div>
      ${d.por_plan.map(p => barra(`${p.name} · ${p.clientes}`, p.total_cents, max, 'var(--celeste)', money(p.total_cents))).join('')}
      ${d.sin_plan ? `<p class="aviso" style="margin-top:8px">${d.sin_plan} cliente(s) activo(s) sin plan asignado.</p>` : ''}
      ${!d.por_plan.length ? '<p class="ayuda">Todavía no hay planes.</p>' : ''}`;
  },

  red_resumen: d => `
    <div class="chips-red">${d.tipos.map(t => `<span><i class="punto-ico" style="background:${esc(t.color)}">${esc(t.icon)}</i>${esc(t.name)} <b>${t.total}</b></span>`).join('')}</div>
    <p class="ayuda">${d.clientes_ubicados} cliente(s) ubicados en el mapa.</p>
    <a class="btn sec chico" href="#/mapa">Abrir mapa</a>`,

  clientes_por_sector: d => {
    const max = Math.max(...d.map(x => x.total), 0);
    return d.length ? d.map(x => barra(x.sector, x.total, max, 'var(--ocre)')).join('') : '<p class="ayuda">Sin clientes todavía.</p>';
  },

  clientes_sin_ubicacion: d => d.total ? `
    <div class="kpis">${kpi(d.total, 'Sin marcar en el mapa', 'var(--ocre)')}</div>
    <ul class="lista">${d.lista.map(c => `<li><a href="#/clientes/${c.id}"><b>${esc(c.code)}</b> ${esc(c.full_name)}</a> <span class="ayuda">${esc(c.sector || '')}</span></li>`).join('')}</ul>`
    : '<p class="ayuda">✅ Todos los clientes están ubicados en el mapa.</p>',

  usuarios_resumen: d => d.length
    ? `<div class="kpis">${d.map(r => kpi(r.total, r.rango)).join('')}</div><a class="btn sec chico" href="#/usuarios">Ver usuarios</a>`
    : '<p class="ayuda">Sin usuarios activos.</p>',

  actividad_reciente: d => d.length ? `<ul class="lista">${d.map(a => `<li>
      <b>${esc(a.user || 'Sistema')}</b> ${esc(ACCIONES[a.action] || a.action)} ${esc(ENTIDADES[a.entity] || a.entity)} <b>${esc(a.ref)}</b>
      <br><span class="ayuda">${fmtFecha(a.at)}</span></li>`).join('')}</ul>` : '<p class="ayuda">Sin actividad todavía.</p>',
};

export async function render(el, params, ctx) {
  setTitulo(`${saludo()}, ${ctx.user.full_name.split(' ')[0]}`, `${ctx.config?.empresa?.nombre || 'CADARVIS'} · ${new Date().toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', weekday: 'long', day: 'numeric', month: 'long' })}`);
  if (ctx.can('rangos.editar')) setAcciones('<a class="btn sec chico" href="#/rangos">Personalizar paneles</a>');
  const { widgets } = await api('GET', '/api/inicio');
  el.innerHTML = widgets.length
    ? `<div class="tablero">${widgets.map(w => `<section class="carta widget w-${esc(w.key)}"><h2>${esc(w.title)}</h2>${(RENDER[w.key] || (() => ''))(w.data)}</section>`).join('')}</div>`
    : '<div class="carta vacio">Tu panel de inicio está vacío. Un administrador puede configurarlo en Rangos.</div>';
}
