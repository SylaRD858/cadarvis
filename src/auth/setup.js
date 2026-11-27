// Primer inicio: permite crear el superadmin desde la web SOLO mientras no exista ningún usuario.
const { HttpError } = require('../http/router');
const { hashPassword } = require('./passwords');
const { createSession } = require('./sessions');
const { ALL_PERMS } = require('../users/perms');
const { audit } = require('../audit');
const { tx } = require('../db');

const noUsers = db => db.prepare('SELECT COUNT(*) n FROM users').get().n === 0;

function register(router) {
  router.get('/api/setup', (req, res, { db }) => ({ needed: noUsers(db) }));

  router.post('/api/setup', (req, res, { db, body }) => tx(db, () => {
    if (!noUsers(db)) throw new HttpError(409, 'El sistema ya fue configurado');
    const username = String(body.username || '').trim().toLowerCase();
    const full_name = String(body.full_name || '').trim();
    const password = String(body.password || '');
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new HttpError(400, 'Usuario inválido (3-30 letras, números, . _ -)');
    if (!full_name) throw new HttpError(400, 'Falta el nombre completo');
    if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');
    const id = db.prepare('INSERT INTO users(username, full_name, password_hash, role_id, created_at) VALUES (?,?,?,1,?)')
      .run(username, full_name, hashPassword(password), new Date().toISOString()).lastInsertRowid;
    audit(db, { userId: id, action: 'crear', entity: 'usuario', entityId: id, after: { username, full_name, role: 'Superadmin', via: 'primer inicio' } });
    const { token, expiresAt } = createSession(db, id);
    return { token, expiresAt, user: { id, username, full_name, role: 'Superadmin', perms: ALL_PERMS } };
  }));
}

module.exports = { register };
