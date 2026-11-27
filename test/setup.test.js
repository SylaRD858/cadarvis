const test = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

test('primer inicio: crear superadmin desde la web una sola vez', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());

  let r = await s.req('GET', '/api/setup');
  assert.deepStrictEqual(r.data, { needed: true });

  r = await s.req('POST', '/api/setup', { username: 'eucar', full_name: 'Eucar Alvarez', password: 'corta' });
  assert.strictEqual(r.status, 400);

  r = await s.req('POST', '/api/setup', { username: 'Eucar', full_name: 'Eucar Alvarez', password: 'clave-segura-1' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.token);
  assert.strictEqual(r.data.user.role, 'Superadmin');

  r = await s.req('GET', '/api/setup');
  assert.deepStrictEqual(r.data, { needed: false });

  r = await s.req('POST', '/api/setup', { username: 'intruso', full_name: 'X', password: 'clave-segura-2' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(s.db.prepare('SELECT COUNT(*) n FROM users').get().n, 1);
});
