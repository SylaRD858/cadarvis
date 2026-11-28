const { HttpError } = require('../http/router');
const { requirePerm, requireUser } = require('../auth/guard');
const { hashPassword } = require('../auth/passwords');
const { ALL_PERMS, PERM_GROUPS, SUPERADMIN_ROLE } = require('./perms');
const { audit } = require('../audit');
const { tx } = require('../db');

const USER_COLS = 'u.id, u.username, u.full_name, u.role_id, r.name AS role_name, u.active, u.created_at';

function getUser(db, id) {
  const u = db.prepare(`SELECT ${USER_COLS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`).get(id);
  if (!u) throw new HttpError(404, 'Usuario no encontrado');
  return u;
}

function getRole(db, id) {
  const r = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  if (!r) throw new HttpError(400, 'Rango no existe');
  return r;
}

function activeSuperadmins(db) {
  return db.prepare(`SELECT COUNT(*) n FROM users u JOIN roles r ON r.id = u.role_id
    WHERE r.name = ? AND u.active = 1`).get(SUPERADMIN_ROLE).n;
}

function rolePerms(db, role) {
  return role.name === SUPERADMIN_ROLE ? ALL_PERMS
    : db.prepare('SELECT perm FROM role_permissions WHERE role_id = ?').all(role.id).map(x => x.perm);
}

// Nadie (salvo superadmin) puede dar o manejar más permisos de los que tiene.
function assertWithin(user, perms, msg = 'No puede asignar permisos que usted no tiene') {
  if (user.role_name === SUPERADMIN_ROLE) return;
  if (perms.some(p => !user.perms.has(p))) throw new HttpError(403, msg);
}

function checkPassword(p) {
  if (typeof p !== 'string' || p.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');
}

function checkPerms(perms) {
  if (!Array.isArray(perms)) throw new HttpError(400, 'Permisos inválidos');
  const bad = perms.filter(p => !ALL_PERMS.includes(p));
  if (bad.length) throw new HttpError(400, `Permiso desconocido: ${bad.join(', ')}`);
  return [...new Set(perms)];
}

function roleWithPerms(db, role) {
  const perms = role.name === SUPERADMIN_ROLE ? ALL_PERMS
    : db.prepare('SELECT perm FROM role_permissions WHERE role_id = ? ORDER BY perm').all(role.id).map(x => x.perm);
  const users = db.prepare('SELECT COUNT(*) n FROM users WHERE role_id = ?').get(role.id).n;
  const row = db.prepare('SELECT widgets FROM role_dashboard WHERE role_id = ?').get(role.id);
  const inicio = row ? JSON.parse(row.widgets) : [];
  return { id: role.id, name: role.name, is_system: !!role.is_system, perms, users, inicio };
}

function register(router) {
  // ---- Usuarios ----
  router.get('/api/usuarios', requirePerm('usuarios.ver'), (req, res, { db }) =>
    db.prepare(`SELECT ${USER_COLS} FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.full_name`).all()
      .map(u => ({ ...u, active: !!u.active })));

  router.post('/api/usuarios', requirePerm('usuarios.editar'), (req, res, { db, body, user }) => {
    const username = String(body.username || '').trim().toLowerCase();
    const full_name = String(body.full_name || '').trim();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new HttpError(400, 'Usuario inválido (3-30 letras, números, . _ -)');
    if (!full_name) throw new HttpError(400, 'Falta el nombre completo');
    checkPassword(body.password);
    const role = getRole(db, body.role_id);
    if (role.name === SUPERADMIN_ROLE && user.role_name !== SUPERADMIN_ROLE) throw new HttpError(403, 'Solo un superadmin puede asignar ese rango');
    assertWithin(user, rolePerms(db, role), 'No puede asignar un rango con más permisos que el suyo');
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'Ese usuario ya existe');
    const r = db.prepare('INSERT INTO users(username, full_name, password_hash, role_id, created_at) VALUES (?,?,?,?,?)')
      .run(username, full_name, hashPassword(body.password), role.id, new Date().toISOString());
    const created = getUser(db, r.lastInsertRowid);
    audit(db, { userId: user.id, action: 'crear', entity: 'usuario', entityId: created.id, after: created });
    return { ...created, active: !!created.active };
  });

  router.put('/api/usuarios/:id', requirePerm('usuarios.editar'), (req, res, { db, body, user }) => tx(db, () => {
    const before = getUser(db, Number(req.params.id));
    const next = {
      full_name: body.full_name !== undefined ? String(body.full_name).trim() : before.full_name,
      role_id: body.role_id !== undefined ? Number(body.role_id) : before.role_id,
      active: body.active !== undefined ? (body.active ? 1 : 0) : before.active,
    };
    if (!next.full_name) throw new HttpError(400, 'Falta el nombre completo');
    const newRole = getRole(db, next.role_id);
    const touchesSuper = before.role_name === SUPERADMIN_ROLE || newRole.name === SUPERADMIN_ROLE;
    if (touchesSuper && user.role_name !== SUPERADMIN_ROLE) throw new HttpError(403, 'Solo un superadmin puede modificar superadmins');
    assertWithin(user, rolePerms(db, getRole(db, before.role_id)), 'No puede modificar a un usuario con más permisos que usted');
    assertWithin(user, rolePerms(db, newRole), 'No puede asignar un rango con más permisos que el suyo');
    const losesSuper = before.role_name === SUPERADMIN_ROLE && before.active &&
      (newRole.name !== SUPERADMIN_ROLE || !next.active);
    if (losesSuper && activeSuperadmins(db) <= 1) throw new HttpError(409, 'Debe quedar al menos un superadmin activo');

    db.prepare('UPDATE users SET full_name = ?, role_id = ?, active = ? WHERE id = ?')
      .run(next.full_name, next.role_id, next.active, before.id);
    if (body.password) {
      checkPassword(body.password);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.password), before.id);
    }
    if (!next.active || body.password) db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(before.id, req.headers.authorization?.slice(7) || '');
    const after = getUser(db, before.id);
    audit(db, { userId: user.id, action: 'editar', entity: 'usuario', entityId: before.id, before, after: { ...after, password_changed: !!body.password } });
    return { ...after, active: !!after.active };
  }));

  // ---- Rangos ----
  router.get('/api/permisos', requireUser, () => ({ all: ALL_PERMS, groups: PERM_GROUPS }));

  router.get('/api/rangos', requirePerm('usuarios.ver'), (req, res, { db }) =>
    db.prepare('SELECT * FROM roles ORDER BY id').all().map(r => roleWithPerms(db, r)));

  router.post('/api/rangos', requirePerm('rangos.editar'), (req, res, { db, body, user }) => tx(db, () => {
    const name = String(body.name || '').trim();
    if (!name) throw new HttpError(400, 'Falta el nombre');
    const perms = checkPerms(body.perms || []);
    assertWithin(user, perms);
    if (db.prepare('SELECT 1 FROM roles WHERE name = ?').get(name)) throw new HttpError(409, 'Ese rango ya existe');
    const id = db.prepare('INSERT INTO roles(name) VALUES (?)').run(name).lastInsertRowid;
    const ins = db.prepare('INSERT INTO role_permissions(role_id, perm) VALUES (?,?)');
    perms.forEach(p => ins.run(id, p));
    const { WIDGETS } = require('../dashboard/widgets');
    db.prepare('INSERT INTO role_dashboard(role_id, widgets) VALUES (?, ?)')
      .run(id, JSON.stringify(WIDGETS.filter(w => perms.includes(w.perm)).map(w => w.key)));
    const out = roleWithPerms(db, getRole(db, id));
    audit(db, { userId: user.id, action: 'crear', entity: 'rango', entityId: id, after: out });
    return out;
  }));

  router.put('/api/rangos/:id', requirePerm('rangos.editar'), (req, res, { db, body, user }) => tx(db, () => {
    const role = getRole(db, Number(req.params.id));
    if (role.name === SUPERADMIN_ROLE) throw new HttpError(409, 'El rango Superadmin no se puede modificar');
    const before = roleWithPerms(db, role);
    const name = body.name !== undefined ? String(body.name).trim() : role.name;
    if (!name) throw new HttpError(400, 'Falta el nombre');
    if (role.is_system && name !== role.name) throw new HttpError(409, 'Los rangos del sistema no se renombran');
    if (name !== role.name && db.prepare('SELECT 1 FROM roles WHERE name = ?').get(name)) throw new HttpError(409, 'Ese rango ya existe');
    db.prepare('UPDATE roles SET name = ? WHERE id = ?').run(name, role.id);
    if (body.perms !== undefined) {
      const perms = checkPerms(body.perms);
      assertWithin(user, perms);
      assertWithin(user, before.perms, 'No puede modificar un rango con más permisos que el suyo');
      db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(role.id);
      const ins = db.prepare('INSERT INTO role_permissions(role_id, perm) VALUES (?,?)');
      perms.forEach(p => ins.run(role.id, p));
    }
    const after = roleWithPerms(db, getRole(db, role.id));
    audit(db, { userId: user.id, action: 'editar', entity: 'rango', entityId: role.id, before, after });
    return after;
  }));

  router.delete('/api/rangos/:id', requirePerm('rangos.editar'), (req, res, { db, user }) => {
    const role = getRole(db, Number(req.params.id));
    if (role.is_system) throw new HttpError(409, 'Los rangos del sistema no se borran');
    if (db.prepare('SELECT 1 FROM users WHERE role_id = ?').get(role.id)) throw new HttpError(409, 'El rango tiene usuarios asignados');
    db.prepare('DELETE FROM roles WHERE id = ?').run(role.id);
    audit(db, { userId: user.id, action: 'borrar', entity: 'rango', entityId: role.id, before: role });
    return { ok: true };
  });

  // ---- Bitácora ----
  router.get('/api/bitacora', requirePerm('bitacora.ver'), (req, res, { db }) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    return db.prepare(`SELECT a.*, u.username FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.id DESC LIMIT ? OFFSET ?`).all(limit, offset);
  });
}

module.exports = { register };
