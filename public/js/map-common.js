import { esc } from './ui.js';

export async function leafletDisponible() {
  return (await window.leafletListo) && !!window.L;
}

export const AVISO_SIN_LEAFLET = `<div class="aviso">No se pudo cargar el mapa. Revise la conexión a internet
  o ejecute <code>scripts/descargar-vendor.sh</code> en el servidor.</div>`;

// Crea un mapa con capas de calles y satélite. El mosaico ya visto queda en caché del navegador.
export function createMap(el, { center, zoom = 15 } = {}) {
  const L = window.L;
  const calles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap',
  });
  const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, attribution: 'Imágenes © Esri',
  });
  const map = L.map(el, { center: [center.lat, center.lng], zoom, layers: [satelite] });
  L.control.layers({ 'Satélite': satelite, 'Calles': calles }, null, { position: 'bottomleft' }).addTo(map);
  setTimeout(() => map.invalidateSize(), 50);
  return map;
}

export function markerIcon(type) {
  return window.L.divIcon({
    className: '',
    html: `<div class="punto-ico" style="background:${esc(type.color)}">${esc(type.icon)}</div>`,
    iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12],
  });
}

export const TIPO_CLIENTE = { key: '_cliente', name: 'Clientes', icon: '🏠', color: '#1565C0' };

export function centroDe(ctx) {
  return ctx.config?.mapa?.centro || { lat: 18.24, lng: -70.27 };
}

// Pide la ubicación GPS del equipo
export function miUbicacion() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este equipo no tiene GPS disponible'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: +p.coords.latitude.toFixed(7), lng: +p.coords.longitude.toFixed(7), precision: p.coords.accuracy }),
      () => reject(new Error('No se pudo obtener la ubicación. Revise el permiso de ubicación.')),
      { enableHighAccuracy: true, timeout: 15000 });
  });
}
