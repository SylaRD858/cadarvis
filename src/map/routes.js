const { HttpError } = require('../http/router');
const { requirePerm } = require('../auth/guard');
const { audit } = require('../audit');
const { nowIso } = require('../db');
const { validateLatLng } = require('../validate');

const KEY_RE = /^[a-z0-9_]{2,30}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const POINT_SELECT = `SELECT p.id, p.type_id, t.key AS type_key, t.name AS type_name, t.icon, t.color, p.name, p.lat, p.lng,
  p.data, p.notes, p.client_id, c.code AS client_code, c.full_name AS client_name, p.created_at, p.updated_at
  FROM map_points p JOIN point_types t ON t.id = p.type_id LEFT JOIN clients c ON c.id = p.client_id`;

function shapePoint(p) { return { ...p, data: JSON.parse(p.data || '{}') }; }

function getPoint(db, id) {
  const p = db.prepare(`${POINT_SELECT} WHERE p.id = ?`).get(id);
  if (!p) throw new HttpError(404, 'Punto no encontrado');
  return shapePoint(p);
}

function getType(db, id) {
  const t = db.prepare('SELECT * FROM point_types WHERE id = ?').get(id);
  if (!t) throw new HttpError(404, 'Tipo no encontrado');
  return t;
}

function checkType(t) {
  if (!KEY_RE.test(t.key)) throw new HttpError(400, 'Clave inválida (minúsculas, números y _)');
  if (!String(t.name || '').trim()) throw new HttpError(400, 'Falta el nombre');
  if (!String(t.icon || '').trim() || String(t.icon).length > 4) throw new HttpError(400, 'Ícono inválido (1-4 caracteres)');
  if (!COLOR_RE.test(t.color)) throw new HttpError(400, 'Color inválido (#RRGGBB)');
}

function buildPoint(db, current, body) {
  const r = { ...current };
  if (body.type_id !== undefined) {
    r.type_id = Number(body.type_id);
    if (!db.prepare('SELECT 1 FROM point_types WHERE id = ?').get(r.type_id)) throw new HttpError(400, 'Tipo no existe');
  }
  if (body.name !== undefined) r.name = String(body.name).trim();
  if (!r.name) throw new HttpError(400, 'Falta el nombre');
  const ll = validateLatLng(body.lat !== undefined ? body.lat : r.lat, body.lng !== undefined ? body.lng : r.lng, { required: true });
  r.lat = ll.lat; r.lng = ll.lng;
  if (body.data !== undefined) {
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw new HttpError(400, 'Datos inválidos');
    r.data = body.data;
  }
  if (body.notes !== undefined) r.notes = body.notes ? String(body.notes) : null;
  if (body.client_id !== undefined) {
    r.client_id = body.client_id ? Number(body.client_id) : null;
    if (r.client_id && !db.prepare('SELECT 1 FROM clients WHERE id = ?').get(r.client_id)) throw new HttpError(400, 'Cliente no existe');
  }
  return r;
}

function register(router) {
  // ---- Tipos ----
  router.get('/api/mapa/tipos', requirePerm('mapa.ver'), (req, res, { db }) =>
    db.prepare('SELECT * FROM point_types ORDER BY is_system DESC, name').all().map(t => ({ ...t, is_system: !!t.is_system })));

  router.post('/api/mapa/tipos', requirePerm('config.editar'), (req, res, { db, body, user }) => {
    const t = { key: String(body.key || ''), name: String(body.name || '').trim(), icon: String(body.icon || '').trim(), color: String(body.color || '') };
    checkType(t);
    if (db.prepare('SELECT 1 FROM point_types WHERE key = ?').get(t.key)) throw new HttpError(409, 'Esa clave ya existe');
    const id = db.prepare('INSERT INTO point_types(key, name, icon, color) VALUES (?,?,?,?)').run(t.key, t.name, t.icon, t.color).lastInsertRowid;
    const out = getType(db, id);
    audit(db, { userId: user.id, action: 'crear', entity: 'tipo_punto', entityId: id, after: out });
    return { ...out, is_system: false };
  });

  router.put('/api/mapa/tipos/:id', requirePerm('config.editar'), (req, res, { db, body, user }) => {
    const before = getType(db, Number(req.params.id));
    const t = {
      key: before.is_system || body.key === undefined ? before.key : String(body.key),
      name: body.name !== undefined ? String(body.name).trim() : before.name,
      icon: body.icon !== undefined ? String(body.icon).trim() : before.icon,
      color: body.color !== undefined ? String(body.color) : before.color,
    };
    checkType(t);
    if (t.key !== before.key && db.prepare('SELECT 1 FROM point_types WHERE key = ?').get(t.key)) throw new HttpError(409, 'Esa clave ya existe');
    db.prepare('UPDATE point_types SET key=?, name=?, icon=?, color=? WHERE id=?').run(t.key, t.name, t.icon, t.color, before.id);
    const after = getType(db, before.id);
    audit(db, { userId: user.id, action: 'editar', entity: 'tipo_punto', entityId: before.id, before, after });
    return { ...after, is_system: !!after.is_system };
  });

  // ---- Puntos ----
  router.get('/api/mapa/puntos', requirePerm('mapa.ver'), (req, res, { db }) => {
    const where = [];
    const args = [];
    if (req.query.tipo) { where.push('t.key = ?'); args.push(req.query.tipo); }
    if (req.query.bbox) {
      const b = req.query.bbox.split(',').map(Number);
      if (b.length !== 4 || b.some(n => !Number.isFinite(n))) throw new HttpError(400, 'bbox inválido');
      where.push('p.lng BETWEEN ? AND ? AND p.lat BETWEEN ? AND ?');
      args.push(b[0], b[2], b[1], b[3]);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return db.prepare(`${POINT_SELECT} ${w} ORDER BY p.id LIMIT 5000`).all(...args).map(shapePoint);
  });

  router.get('/api/mapa/puntos/:id', requirePerm('mapa.ver'), (req, res, { db }) => getPoint(db, Number(req.params.id)));

  router.post('/api/mapa/puntos', requirePerm('mapa.editar'), (req, res, { db, body, user }) => {
    const r = buildPoint(db, { type_id: undefined, name: '', lat: undefined, lng: undefined, data: {}, notes: null, client_id: null }, body);
    if (!r.type_id) throw new HttpError(400, 'Falta el tipo');
    const now = nowIso();
    const id = db.prepare(`INSERT INTO map_points(type_id, name, lat, lng, data, notes, client_id, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(r.type_id, r.name, r.lat, r.lng, JSON.stringify(r.data), r.notes, r.client_id, now, now).lastInsertRowid;
    const p = getPoint(db, id);
    audit(db, { userId: user.id, action: 'crear', entity: 'punto', entityId: id, after: p });
    return p;
  });

  router.put('/api/mapa/puntos/:id', requirePerm('mapa.editar'), (req, res, { db, body, user }) => {
    const before = getPoint(db, Number(req.params.id));
    const r = buildPoint(db, before, body);
    db.prepare('UPDATE map_points SET type_id=?, name=?, lat=?, lng=?, data=?, notes=?, client_id=?, updated_at=? WHERE id=?')
      .run(r.type_id, r.name, r.lat, r.lng, JSON.stringify(r.data), r.notes, r.client_id, nowIso(), before.id);
    const after = getPoint(db, before.id);
    audit(db, { userId: user.id, action: 'editar', entity: 'punto', entityId: before.id, before, after });
    return after;
  });

  router.delete('/api/mapa/puntos/:id', requirePerm('mapa.editar'), (req, res, { db, user }) => {
    const before = getPoint(db, Number(req.params.id));
    db.prepare('DELETE FROM map_points WHERE id = ?').run(before.id);
    audit(db, { userId: user.id, action: 'borrar', entity: 'punto', entityId: before.id, before });
    return { ok: true };
  });
}

module.exports = { register };
