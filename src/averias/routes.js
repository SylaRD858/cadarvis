const { HttpError } = require('../http/router');
const { requirePerm } = require('../auth/guard');
const { audit } = require('../audit');
const { tx, nowIso } = require('../db');
const { validateLatLng, fold, nextCode } = require('../validate');
const { permsForRole, SUPERADMIN_ROLE } = require('../users/perms');

const TYPES = ['fuga', 'sin_servicio', 'baja_presion', 'tubo_roto', 'calidad_agua', 'otro'];
const PRIORITIES = ['baja', 'media', 'alta', 'urgente'];
const STATUSES = ['nueva', 'asignada', 'en_proceso', 'resuelta', 'cerrada'];
const OPEN = ['nueva', 'asignada', 'en_proceso'];

const SELECT = `SELECT a.*, c.code AS client_code, c.full_name AS client_name, c.phone AS client_phone,
  ua.full_name AS assigned_name, uc.full_name AS created_name
  FROM averias a LEFT JOIN clients c ON c.id = a.client_id
  LEFT JOIN users ua ON ua.id = a.assigned_to LEFT JOIN users uc ON uc.id = a.created_by`;

function getAveria(db, id) {
  const a = db.prepare(`${SELECT} WHERE a.id = ?`).get(id);
  if (!a) throw new HttpError(404, 'Avería no encontrada');
  a.events = db.prepare(`SELECT e.*, u.full_name AS user_name FROM averia_eventos e
    LEFT JOIN users u ON u.id = e.user_id WHERE e.averia_id = ? ORDER BY e.id`).all(a.id);
  return a;
}

function addEvent(db, averiaId, userId, kind, { from = null, to = null, text = null } = {}) {
  db.prepare('INSERT INTO averia_eventos(averia_id, at, user_id, kind, from_status, to_status, text) VALUES (?,?,?,?,?,?,?)')
    .run(averiaId, nowIso(), userId, kind, from, to, text ? String(text).trim() || null : null);
}

const clean = v => (v === null || v === undefined || String(v).trim() === '') ? null : String(v).trim();

// Usuarios activos que pueden atender averías (su rango tiene averias.ver y averias.crear)
function tecnicos(db) {
  return db.prepare(`SELECT u.id, u.username, u.full_name, u.role_id, r.name AS role_name
    FROM users u JOIN roles r ON r.id = u.role_id WHERE u.active = 1 ORDER BY u.full_name`).all()
    .filter(u => { const p = permsForRole(db, u.role_id, u.role_name); return p.has('averias.ver') && p.has('averias.crear'); })
    .map(({ id, username, full_name, role_name }) => ({ id, username, full_name, role: role_name }));
}

function register(router) {
  router.get('/api/averias/tecnicos', requirePerm('averias.ver'), (req, res, { db }) => tecnicos(db));

  router.get('/api/averias', requirePerm('averias.ver'), (req, res, { db, user }) => {
    const where = [], args = [];
    const q = req.query;
    if (q.abiertas === '1') where.push(`a.status IN (${OPEN.map(() => '?').join(',')})`), args.push(...OPEN);
    if (q.estado) where.push('a.status = ?'), args.push(q.estado);
    if (q.prioridad) {
      const ps = String(q.prioridad).split(',').filter(p => PRIORITIES.includes(p));
      if (ps.length) where.push(`a.priority IN (${ps.map(() => '?').join(',')})`), args.push(...ps);
    }
    if (q.tipo) where.push('a.type = ?'), args.push(q.tipo);
    if (q.asignado) where.push('a.assigned_to = ?'), args.push(q.asignado === 'yo' ? user.id : Number(q.asignado));
    if (q.cliente) where.push('a.client_id = ?'), args.push(Number(q.cliente));
    if (q.desde) where.push('a.created_at >= ?'), args.push(q.desde);
    if (q.q) {
      where.push(`(lower(a.code || ' ' || a.description || ' ' || COALESCE(a.address,'') || ' ' || COALESCE(c.full_name,'')) LIKE ?)`);
      args.push(`%${fold(q.q)}%`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 500);
    const offset = Math.max(Number(q.offset) || 0, 0);
    const total = db.prepare(`SELECT COUNT(*) n FROM averias a LEFT JOIN clients c ON c.id = a.client_id ${w}`).get(...args).n;
    const order = `CASE a.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END`;
    const items = db.prepare(`${SELECT} ${w} ORDER BY CASE WHEN a.status IN ('resuelta','cerrada') THEN 1 ELSE 0 END, ${order}, a.id DESC LIMIT ? OFFSET ?`)
      .all(...args, limit, offset);
    return { items, total };
  });

  router.get('/api/averias/:id', requirePerm('averias.ver'), (req, res, { db }) => getAveria(db, Number(req.params.id)));

  router.post('/api/averias', requirePerm('averias.crear'), (req, res, { db, body, user }) => tx(db, () => {
    if (!TYPES.includes(body.type)) throw new HttpError(400, 'Tipo de avería inválido');
    const description = clean(body.description);
    if (!description) throw new HttpError(400, 'Falta la descripción');
    const priority = body.priority === undefined ? 'media' : body.priority;
    if (!PRIORITIES.includes(priority)) throw new HttpError(400, 'Prioridad inválida');
    let client = null;
    if (body.client_id) {
      client = db.prepare('SELECT * FROM clients WHERE id = ?').get(Number(body.client_id));
      if (!client) throw new HttpError(400, 'Cliente no existe');
    }
    let { lat, lng } = validateLatLng(body.lat, body.lng);
    if (lat === null && client && client.lat !== null) { lat = client.lat; lng = client.lng; }
    const now = nowIso();
    const code = nextCode(db, 'averia', 'A-', 5);
    const id = db.prepare(`INSERT INTO averias(code, type, description, priority, client_id, lat, lng, address, reporter_name, reporter_phone,
      source, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(code, body.type, description, priority, client ? client.id : null, lat, lng,
        clean(body.address) || (client ? client.address : null), clean(body.reporter_name), clean(body.reporter_phone),
        'personal', user.id, now, now).lastInsertRowid;
    addEvent(db, id, user.id, 'creada', { to: 'nueva', text: description });
    const a = getAveria(db, id);
    audit(db, { userId: user.id, action: 'crear', entity: 'averia', entityId: id, after: { code, type: a.type, priority, description } });
    return a;
  }));

  router.put('/api/averias/:id', requirePerm('averias.ver'), (req, res, { db, body, user }) => tx(db, () => {
    const a = getAveria(db, Number(req.params.id));
    const gestiona = user.perms.has('averias.gestionar');
    const esAsignado = a.assigned_to === user.id;
    const now = nowIso();
    let status = a.status;

    if (body.assigned_to !== undefined || body.priority !== undefined) {
      if (!gestiona) throw new HttpError(403, 'Solo quien gestiona averías puede asignar o cambiar la prioridad');
    }
    if (body.priority !== undefined) {
      if (!PRIORITIES.includes(body.priority)) throw new HttpError(400, 'Prioridad inválida');
      db.prepare('UPDATE averias SET priority = ? WHERE id = ?').run(body.priority, a.id);
      if (body.priority !== a.priority) addEvent(db, a.id, user.id, 'nota', { text: `Prioridad: ${a.priority} → ${body.priority}` });
    }
    if (body.assigned_to !== undefined) {
      const to = body.assigned_to ? Number(body.assigned_to) : null;
      if (to !== null && !tecnicos(db).some(u => u.id === to)) throw new HttpError(400, 'Ese usuario no puede atender averías');
      db.prepare('UPDATE averias SET assigned_to = ? WHERE id = ?').run(to, a.id);
      const nombre = to ? db.prepare('SELECT full_name FROM users WHERE id = ?').get(to).full_name : null;
      addEvent(db, a.id, user.id, 'asignada', { text: nombre ? `Asignada a ${nombre}` : 'Sin asignar' });
      if (to && status === 'nueva') { status = 'asignada'; db.prepare("UPDATE averias SET status = 'asignada' WHERE id = ?").run(a.id); }
    }
    if (body.status !== undefined && body.status !== status) {
      if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Estado inválido');
      if (!gestiona && !esAsignado) throw new HttpError(403, 'Solo el técnico asignado o quien gestiona puede cambiar el estado');
      if (!gestiona && (body.status === 'cerrada' || status === 'cerrada')) throw new HttpError(403, 'Solo quien gestiona puede cerrar o reabrir');
      db.prepare(`UPDATE averias SET status = ?, resolved_at = CASE WHEN ? = 'resuelta' THEN ? WHEN ? IN ('nueva','asignada','en_proceso') THEN NULL ELSE resolved_at END,
        closed_at = CASE WHEN ? = 'cerrada' THEN ? ELSE NULL END WHERE id = ?`)
        .run(body.status, body.status, now, body.status, body.status, now, a.id);
      addEvent(db, a.id, user.id, 'estado', { from: status, to: body.status, text: body.note });
      status = body.status;
    } else if (body.note) {
      addEvent(db, a.id, user.id, 'nota', { text: body.note });
    }
    db.prepare('UPDATE averias SET updated_at = ? WHERE id = ?').run(now, a.id);
    const after = getAveria(db, a.id);
    audit(db, { userId: user.id, action: 'editar', entity: 'averia', entityId: a.id,
      before: { code: a.code, status: a.status, assigned_to: a.assigned_to, priority: a.priority },
      after: { code: a.code, status: after.status, assigned_to: after.assigned_to, priority: after.priority } });
    return after;
  }));

  router.post('/api/averias/:id/notas', requirePerm('averias.ver'), (req, res, { db, body, user }) => {
    const a = getAveria(db, Number(req.params.id));
    const text = clean(body.text);
    if (!text) throw new HttpError(400, 'La nota está vacía');
    addEvent(db, a.id, user.id, 'nota', { text });
    db.prepare('UPDATE averias SET updated_at = ? WHERE id = ?').run(nowIso(), a.id);
    return getAveria(db, a.id);
  });
}

module.exports = { register, TYPES, PRIORITIES, STATUSES, OPEN };
