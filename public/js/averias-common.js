import { esc } from './ui.js';

export const TIPOS = {
  fuga: 'Fuga de agua', sin_servicio: 'Sin servicio', baja_presion: 'Baja presión',
  tubo_roto: 'Tubo roto', calidad_agua: 'Calidad del agua', otro: 'Otro',
};
export const PRIORIDADES = { urgente: 'Urgente', alta: 'Alta', media: 'Media', baja: 'Baja' };
export const ESTADOS = { nueva: 'Nueva', asignada: 'Asignada', en_proceso: 'En proceso', resuelta: 'Resuelta', cerrada: 'Cerrada' };

export const chipPrioridad = p => `<span class="chip prio-${esc(p)}">${esc(PRIORIDADES[p] || p)}</span>`;
export const chipEstadoAveria = s => `<span class="chip av-${esc(s)}">${esc(ESTADOS[s] || s)}</span>`;

export const ICONO_AVERIA = { key: '_averia', name: 'Averías abiertas', icon: '!', color: '#E53935' };
