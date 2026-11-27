const { openDb, migrate } = require('../src/db');
const { createApp } = require('../src/app');

async function startTestServer() {
  const db = openDb(':memory:');
  migrate(db);
  const server = createApp(db);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;

  async function req(method, path, body, token) {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(url + path, {
      method, headers,
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }

  // Crea (si no existe) un usuario con el rango dado e inicia sesión. Devuelve el token.
  async function login(username, roleName = 'Superadmin', password = 'clave12345') {
    const { hashPassword } = require('../src/auth/passwords');
    const role = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName);
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!exists) {
      db.prepare('INSERT INTO users(username, full_name, password_hash, role_id, created_at) VALUES (?,?,?,?,?)')
        .run(username, username, hashPassword(password), role.id, new Date().toISOString());
    }
    const r = await req('POST', '/api/auth/login', { username, password });
    return r.data.token;
  }

  return { url, db, req, login, close: () => new Promise(r => server.close(r)) };
}

module.exports = { startTestServer };
