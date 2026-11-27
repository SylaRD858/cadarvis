const crypto = require('node:crypto');
const { permsForRole } = require('../users/perms');

const SESSION_HOURS = 12;

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessions(token, user_id, expires_at) VALUES (?,?,?)').run(token, userId, expiresAt);
  return { token, expiresAt };
}

function getSessionUser(db, token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role_id, r.name AS role_name, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id
    WHERE s.token = ? AND u.active = 1`).get(token);
  if (!row || row.expires_at < new Date().toISOString()) return null;
  const { expires_at, ...user } = row;
  user.perms = permsForRole(db, user.role_id, user.role_name);
  return user;
}

function deleteSession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

module.exports = { createSession, getSessionUser, deleteSession, SESSION_HOURS };
