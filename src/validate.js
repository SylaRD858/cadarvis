const { HttpError } = require('./http/router');

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

// Ambos null/undefined es válido (sin ubicación). Uno solo o fuera de rango es inválido.
function validateLatLng(lat, lng, { required = false } = {}) {
  const none = (lat === null || lat === undefined) && (lng === null || lng === undefined);
  if (none) {
    if (required) throw new HttpError(400, 'Ubicación inválida');
    return { lat: null, lng: null };
  }
  if (!isNum(lat) || !isNum(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new HttpError(400, 'Ubicación inválida');
  }
  return { lat, lng };
}

// Minúsculas y sin acentos, para búsquedas.
function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function nextCode(db, counter, prefix, width) {
  db.prepare('INSERT INTO counters(name, value) VALUES (?, 0) ON CONFLICT(name) DO NOTHING').run(counter);
  db.prepare('UPDATE counters SET value = value + 1 WHERE name = ?').run(counter);
  const n = db.prepare('SELECT value FROM counters WHERE name = ?').get(counter).value;
  return prefix + String(n).padStart(width, '0');
}

module.exports = { validateLatLng, fold, nextCode };
