const { HttpError } = require('../http/router');
const { verifyPassword } = require('./passwords');
const { createSession, deleteSession } = require('./sessions');
const { requireUser } = require('./guard');
const { permsForRole } = require('../users/perms');
const { audit } = require('../audit');

const { createAttempts } = require('./attempts');

const attempts = createAttempts({ max: 5, lockMs: 5 * 60 * 1000, maxKeys: 10000 });

// IP del cliente. Detrás de Nginx, poner TRUST_PROXY=1 para usar X-Forwarded-For.
function clientIp(req) {
  if (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
}

function publicUser(u, perms) {
  return { id: u.id, username: u.username, full_name: u.full_name, role: u.role_name, perms: [...perms] };
}

function register(router) {
  router.post('/api/auth/login', (req, res, ctx) => {
    const username = String(ctx.body.username || '').trim().toLowerCase();
    const password = String(ctx.body.password || '');
    const key = `${clientIp(req)}|${username}`;
    if (attempts.locked(key)) throw new HttpError(429, 'Demasiados intentos, espere unos minutos');

    const u = ctx.db.prepare(`SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.username = ? AND u.active = 1`).get(username);
    if (!u || !verifyPassword(password, u.password_hash)) {
      attempts.fail(key);
      throw new HttpError(401, 'Usuario o contraseña incorrectos');
    }
    attempts.clear(key);
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
