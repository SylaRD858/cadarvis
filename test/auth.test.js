const test = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');
const { hashPassword, verifyPassword } = require('../src/auth/passwords');

test('hash y verificación de contraseña', () => {
  const h = hashPassword('secreta123');
  assert.match(h, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]+$/);
  assert.strictEqual(verifyPassword('secreta123', h), true);
  assert.strictEqual(verifyPassword('otra', h), false);
});

test('login y sesiones', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());

  await t.test('login correcto y /me', async () => {
    const token = await s.login('admin');
    assert.ok(token);
    const r = await s.req('GET', '/api/auth/me', undefined, token);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.user.username, 'admin');
    assert.ok(r.data.user.perms.includes('config.editar'));
  });

  await t.test('contraseña incorrecta da 401', async () => {
    const r = await s.req('POST', '/api/auth/login', { username: 'admin', password: 'mala' });
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.data.error, 'Usuario o contraseña incorrectos');
  });

  await t.test('sin token da 401', async () => {
    const r = await s.req('GET', '/api/auth/me');
    assert.strictEqual(r.status, 401);
  });

  await t.test('sesión vencida da 401', async () => {
    const token = await s.login('vence');
    s.db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run('2000-01-01T00:00:00.000Z', token);
    const r = await s.req('GET', '/api/auth/me', undefined, token);
    assert.strictEqual(r.status, 401);
  });

  await t.test('usuario desactivado con token vigente da 401', async () => {
    const token = await s.login('inactivo');
    s.db.prepare("UPDATE users SET active = 0 WHERE username = 'inactivo'").run();
    const r = await s.req('GET', '/api/auth/me', undefined, token);
    assert.strictEqual(r.status, 401);
  });

  await t.test('logout invalida el token', async () => {
    const token = await s.login('sale');
    await s.req('POST', '/api/auth/logout', {}, token);
    const r = await s.req('GET', '/api/auth/me', undefined, token);
    assert.strictEqual(r.status, 401);
  });

  await t.test('6 intentos fallidos bloquean con 429', async () => {
    await s.login('bloq');
    let r;
    for (let i = 0; i < 6; i++) r = await s.req('POST', '/api/auth/login', { username: 'bloq', password: 'x' });
    assert.strictEqual(r.status, 429);
    assert.strictEqual(r.data.error, 'Demasiados intentos, espere unos minutos');
    r = await s.req('POST', '/api/auth/login', { username: 'bloq', password: 'clave12345' });
    assert.strictEqual(r.status, 429);
  });
});
