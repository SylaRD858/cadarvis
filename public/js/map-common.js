import { esc } from './ui.js';

export async function leafletDisponible() {
  return (await window.leafletListo) && !!window.L;
}

export const AVISO_SIN_LEAFLET = `<div class="aviso">No se pudo cargar el mapa. Revise la conexión a internet
  o ejecute <code>scripts/descargar-vendor.sh</code> en el servidor.</div>`;

// Zoom máximo del mapa. Más allá de lo que tiene cada proveedor, se amplía la última imagen
// disponible (maxNativeZoom) en vez de mostrar el cuadro de "sin datos".
const ZOOM_MAX = 21;
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

// Crea un mapa con tres vistas: satélite con nombres de calles (por defecto), satélite solo y calles.
// El mosaico ya visto queda en caché del navegador.
export function createMap(el, { center, zoom = 15 } = {}) {
  const L = window.L;
  const opt = (nativo, attribution) => ({ maxZoom: ZOOM_MAX, maxNativeZoom: nativo, attribution });
  const imagen = () => L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, opt(18, 'Imágenes © Esri, Maxar'));
  // Calles y nombres encima de la foto satelital (como la vista "Híbrido" de Google)
  const nombresCalles = L.tileLayer(`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, opt(18, 'Calles © Esri'));
  const nombresLugares = L.tileLayer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, opt(18, ''));
  const hibrido = L.layerGroup([imagen(), nombresCalles, nombresLugares]);
  const satelite = imagen();
  const calles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', opt(19, '© OpenStreetMap'));

  const map = L.map(el, { center: [center.lat, center.lng], zoom, maxZoom: ZOOM_MAX, layers: [hibrido] });
  L.control.layers({ 'Satélite con calles': hibrido, 'Satélite': satelite, 'Calles': calles }, null, { position: 'bottomleft' }).addTo(map);
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
  return ctx.config?.mapa?.centro || { lat: 18.257425, lng: -70.361671 };
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
