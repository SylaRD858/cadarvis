const { HttpError } = require('../http/router');
const { verifyPassword } = require('./passwords');
const { createSession, deleteSession } = require('./sessions');
const { requireUser } = require('./guard');
const { permsForRole } = require('../users/perms');
const { audit } = require('../audit');

const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;
const fails = new Map(); // username -> {count, until}

function publicUser(u, perms) {
  return { id: u.id, username: u.username, full_name: u.full_name, role: u.role_name, perms: [...perms] };
}

function register(router) {
  router.post('/api/auth/login', (req, res, ctx) => {
    const username = String(ctx.body.username || '').trim().toLowerCase();
    const password = String(ctx.body.password || '');
    const f = fails.get(username);
    if (f && f.until > Date.now()) throw new HttpError(429, 'Demasiados intentos, espere unos minutos');

    const u = ctx.db.prepare(`SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.username = ? AND u.active = 1`).get(username);
    if (!u || !verifyPassword(password, u.password_hash)) {
      const expired = f && f.until && f.until <= Date.now();
      const n = (f && !expired ? f.count : 0) + 1;
      fails.set(username, { count: n, until: n >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
      throw new HttpError(401, 'Usuario o contraseña incorrectos');
    }
    fails.delete(username);
    const { token, expiresAt } = createSession(ctx.db, u.id);
    audit(ctx.db, { userId: u.id, action: 'login', entity: 'sesion' });
    return { token, expiresAt, user: publicUser(u, permsForRole(ctx.db, u.role_id, u.role_name)) };
  });

  router.post('/api/auth/logout', requireUser, (req, res, ctx) => {
    deleteSession(ctx.db, ctx.token);
    return { ok: true };
  });

  router.get('/api/auth/me', requireUser, (req, res, ctx) => ({ user: publicUser(ctx.user, ctx.user.perms) }));
}

module.exports = { register };
