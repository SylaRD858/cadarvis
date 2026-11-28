const { HttpError } = require('../http/router');
const { requirePerm } = require('../auth/guard');
const { audit } = require('../audit');
const { tx, nowIso } = require('../db');
const { validateLatLng, fold, nextCode } = require('../validate');
const { normalizeCedula } = require('./cedula');

const STATUSES = ['activo', 'suspendido', 'cortado', 'retirado'];
const TEXT_FIELDS = ['full_name', 'phone', 'phone2', 'sector', 'address', 'notes'];

const SELECT = `SELECT c.id, c.code, c.full_name, c.cedula, c.phone, c.phone2, c.sector, c.address, c.plan_id,
  p.name AS plan_name, p.price_cents AS plan_price_cents, c.status, c.lat, c.lng, c.notes, c.created_at, c.updated_at
  FROM clients c LEFT JOIN plans p ON p.id = c.plan_id`;

function getClient(db, id) {
  const c = db.prepare(`${SELECT} WHERE c.id = ?`).get(id);
  if (!c) throw new HttpError(404, 'Cliente no encontrado');
  return c;
}

function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// Mezcla los datos actuales con el cuerpo y valida todo.
function buildRecord(db, current, body) {
  const r = { ...current };
  for (const f of TEXT_FIELDS) if (body[f] !== undefined) r[f] = clean(body[f]);
  if (!r.full_name) throw new HttpError(400, 'Falta el nombre');
  if (body.cedula !== undefined) r.cedula = normalizeCedula(body.cedula);
  if (body.plan_id !== undefined) {
    r.plan_id = body.plan_id === null || body.plan_id === '' ? null : Number(body.plan_id);
    if (r.plan_id !== null && !db.prepare('SELECT 1 FROM plans WHERE id = ?').get(r.plan_id)) throw new HttpError(400, 'Plan no existe');
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Estado inválido');
    r.status = body.status;
  }
  if (body.lat !== undefined || body.lng !== undefined) {
    const ll = validateLatLng(body.lat !== undefined ? body.lat : r.lat, body.lng !== undefined ? body.lng : r.lng);
    r.lat = ll.lat; r.lng = ll.lng;
  }
  if (r.cedula) {
    const dup = db.prepare('SELECT id FROM clients WHERE cedula = ? AND id != ?').get(r.cedula, r.id || 0);
    if (dup) throw new HttpError(409, 'Ya existe un cliente con esa cédula');
  }
  r.search = fold([r.code, r.full_name, r.cedula, r.phone, r.phone2, r.sector, r.address].filter(Boolean).join(' '));
  return r;
}

function register(router) {
  router.get('/api/clientes', requirePerm('clientes.ver'), (req, res, { db }) => {
    const where = [];
    const args = [];
    const q = fold(req.query.q || '').trim();
    if (q) {
      const digits = q.replace(/\D/g, '');
      const parts = [`c.search LIKE ?`];
      args.push(`%${q}%`);
      if (digits.length >= 3 && /^[\d\s-]+$/.test(q)) { parts.push('c.cedula LIKE ?', "replace(c.phone,'-','') LIKE ?"); args.push(`%${digits}%`, `%${digits}%`); }
      where.push(`(${parts.join(' OR ')})`);
    }
    if (req.query.estado) { where.push('c.status = ?'); args.push(req.query.estado); }
    if (req.query.plan_id) { where.push('c.plan_id = ?'); args.push(Number(req.query.plan_id)); }
    if (req.query.sin_plan === '1') where.push('c.plan_id IS NULL');
    if (req.query.sin_ubicacion === '1') where.push('c.lat IS NULL');
    if (req.query.desde) { where.push('c.created_at >= ?'); args.push(req.query.desde); }
    if (req.query.sector !== undefined && req.query.sector !== '') {
      if (req.query.sector === 'Sin sector') where.push("(c.sector IS NULL OR TRIM(c.sector) = '')");
      else { where.push('c.sector = ?'); args.push(req.query.sector); }
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const total = db.prepare(`SELECT COUNT(*) n FROM clients c ${w}`).get(...args).n;
    const items = db.prepare(`${SELECT} ${w} ORDER BY c.full_name LIMIT ? OFFSET ?`).all(...args, limit, offset);
    return { items, total };
  });

  // Debe ir antes de /:id
  router.get('/api/clientes/geo', requirePerm('mapa.ver'), (req, res, { db }) =>
    db.prepare(`SELECT id, code, full_name, status, lat, lng FROM clients WHERE lat IS NOT NULL AND lng IS NOT NULL`).all());

  router.get('/api/clientes/:id', requirePerm('clientes.ver'), (req, res, { db }) => getClient(db, Number(req.params.id)));

  router.post('/api/clientes', requirePerm('clientes.editar'), (req, res, { db, body, user }) => tx(db, () => {
    const base = { id: null, full_name: null, cedula: null, phone: null, phone2: null, sector: null, address: null,
      plan_id: null, status: 'activo', lat: null, lng: null, notes: null };
    const r = buildRecord(db, base, body);
    r.code = nextCode(db, 'cliente', 'C-', 5);
    r.search = fold(`${r.code} ${r.search}`);
    const now = nowIso();
    const id = db.prepare(`INSERT INTO clients(code, full_name, cedula, phone, phone2, sector, address, plan_id, status, lat, lng, notes, search, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(r.code, r.full_name, r.cedula, r.phone, r.phone2, r.sector, r.address,
      r.plan_id, r.status, r.lat, r.lng, r.notes, r.search, now, now).lastInsertRowid;
    const c = getClient(db, id);
    audit(db, { userId: user.id, action: 'crear', entity: 'cliente', entityId: id, after: c });
    return c;
  }));

  router.put('/api/clientes/:id', requirePerm('clientes.editar'), (req, res, { db, body, user }) => tx(db, () => {
    const before = getClient(db, Number(req.params.id));
    const r = buildRecord(db, before, body);
    db.prepare(`UPDATE clients SET full_name=?, cedula=?, phone=?, phone2=?, sector=?, address=?, plan_id=?, status=?, lat=?, lng=?, notes=?, search=?, updated_at=?
      WHERE id = ?`).run(r.full_name, r.cedula, r.phone, r.phone2, r.sector, r.address, r.plan_id, r.status, r.lat, r.lng,
      r.notes, r.search, nowIso(), before.id);
    const after = getClient(db, before.id);
    audit(db, { userId: user.id, action: 'editar', entity: 'cliente', entityId: before.id, before, after });
    return after;
  }));
}

module.exports = { register };
