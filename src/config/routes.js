const { HttpError } = require('../http/router');
const { requireUser, requirePerm } = require('../auth/guard');
const { audit } = require('../audit');

const DEFAULTS = {
  empresa: { nombre: 'CADARVIS', rnc: '', direccion: 'Villa Sombrero, Baní', telefono: '' },
  facturacion: { dia_generacion: 1, mora: { activa: false, tipo: 'fijo', valor_cents: 0, porcentaje: 0, dias: 30 } },
  recibo: { ancho_mm: 80, pie: '' },
  ncf: { activo: false },
  // Centro aproximado de Villa Sombrero; ajustable desde Configuración.
  mapa: { centro: { lat: 18.2400, lng: -70.2700 }, zoom: 15 },
};

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

function getConfig(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'config'").get();
  return deepMerge(DEFAULTS, row ? JSON.parse(row.value) : {});
}

function validate(c) {
  const d = c.facturacion.dia_generacion;
  if (!Number.isInteger(d) || d < 1 || d > 28) throw new HttpError(400, 'El día de facturación debe estar entre 1 y 28');
  if (![58, 80].includes(c.recibo.ancho_mm)) throw new HttpError(400, 'El ancho del recibo debe ser 58 u 80 mm');
  const m = c.facturacion.mora;
  if (!['fijo', 'porcentaje'].includes(m.tipo)) throw new HttpError(400, 'Tipo de mora inválido');
  if (!Number.isInteger(m.valor_cents) || m.valor_cents < 0) throw new HttpError(400, 'Monto de mora inválido');
  if (typeof m.porcentaje !== 'number' || m.porcentaje < 0 || m.porcentaje > 100) throw new HttpError(400, 'Porcentaje de mora inválido');
  if (!Number.isInteger(m.dias) || m.dias < 0) throw new HttpError(400, 'Días de mora inválidos');
  const { lat, lng } = c.mapa.centro;
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new HttpError(400, 'Centro del mapa inválido');
  if (!String(c.empresa.nombre || '').trim()) throw new HttpError(400, 'Falta el nombre de la empresa');
}

function register(router) {
  router.get('/api/config', requireUser, (req, res, { db }) => getConfig(db));

  router.put('/api/config', requirePerm('config.editar'), (req, res, { db, body, user }) => {
    const before = getConfig(db);
    const next = deepMerge(before, body);
    validate(next);
    db.prepare("INSERT INTO settings(key, value) VALUES ('config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify(next));
    audit(db, { userId: user.id, action: 'editar', entity: 'config', before, after: next });
    return next;
  });
}

module.exports = { register, getConfig, DEFAULTS };
