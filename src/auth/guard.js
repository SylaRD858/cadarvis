const { HttpError } = require('../http/router');
const { getSessionUser } = require('./sessions');

function tokenOf(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function requireUser(req, res, ctx) {
  const user = getSessionUser(ctx.db, tokenOf(req));
  if (!user) throw new HttpError(401, 'Sesión inválida');
  ctx.user = user;
  ctx.token = tokenOf(req);
}

function requirePerm(perm) {
  return (req, res, ctx) => {
    if (!ctx.user) requireUser(req, res, ctx);
    if (!ctx.user.perms.has(perm)) throw new HttpError(403, 'Sin permiso');
  };
}

module.exports = { requireUser, requirePerm, tokenOf };
