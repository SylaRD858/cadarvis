const { HttpError } = require('../http/router');
const { requirePerm } = require('../auth/guard');
const { audit } = require('../audit');

function shape(p) { return { ...p, active: !!p.active }; }

function getPlan(db, id) {
  const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
  if (!p) throw new HttpError(404, 'Plan no encontrado');
  return p;
}

function checkPrice(v) {
  if (!Number.isInteger(v) || v < 0) throw new HttpError(400, 'Precio inválido');
}

function register(router) {
  router.get('/api/planes', requirePerm('planes.ver'), (req, res, { db }) =>
    db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM clients c WHERE c.plan_id = p.id) AS clients
      FROM plans p ORDER BY p.active DESC, p.name`).all().map(shape));

  router.post('/api/planes', requirePerm('planes.editar'), (req, res, { db, body, user }) => {
    const name = String(body.name || '').trim();
    if (!name) throw new HttpError(400, 'Falta el nombre');
    checkPrice(body.price_cents);
    if (db.prepare('SELECT 1 FROM plans WHERE name = ?').get(name)) throw new HttpError(409, 'Ya existe un plan con ese nombre');
    const id = db.prepare('INSERT INTO plans(name, price_cents) VALUES (?,?)').run(name, body.price_cents).lastInsertRowid;
    const p = getPlan(db, id);
    audit(db, { userId: user.id, action: 'crear', entity: 'plan', entityId: id, after: p });
    return shape(p);
  });

  router.put('/api/planes/:id', requirePerm('planes.editar'), (req, res, { db, body, user }) => {
    const before = getPlan(db, Number(req.params.id));
    const name = body.name !== undefined ? String(body.name).trim() : before.name;
    const price = body.price_cents !== undefined ? body.price_cents : before.price_cents;
    const active = body.active !== undefined ? (body.active ? 1 : 0) : before.active;
    if (!name) throw new HttpError(400, 'Falta el nombre');
    checkPrice(price);
    if (name.toLowerCase() !== before.name.toLowerCase() && db.prepare('SELECT 1 FROM plans WHERE name = ?').get(name))
      throw new HttpError(409, 'Ya existe un plan con ese nombre');
    db.prepare('UPDATE plans SET name = ?, price_cents = ?, active = ? WHERE id = ?').run(name, price, active, before.id);
    const after = getPlan(db, before.id);
    audit(db, { userId: user.id, action: 'editar', entity: 'plan', entityId: before.id, before, after });
    return shape(after);
  });
}

module.exports = { register };
