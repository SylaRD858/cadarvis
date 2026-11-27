const test = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

test('http básico', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());

  await t.test('GET /api/salud responde ok', async () => {
    const r = await s.req('GET', '/api/salud');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data, { ok: true });
  });

  await t.test('ruta api desconocida da 404', async () => {
    const r = await s.req('GET', '/api/no-existe');
    assert.strictEqual(r.status, 404);
    assert.deepStrictEqual(r.data, { error: 'No encontrado' });
  });

  await t.test('JSON inválido da 400', async () => {
    const r = await s.req('POST', '/api/eco', '{mal');
    assert.strictEqual(r.status, 400);
    assert.deepStrictEqual(r.data, { error: 'JSON inválido' });
  });

  await t.test('POST /api/eco devuelve el cuerpo', async () => {
    const r = await s.req('POST', '/api/eco', { a: 1 });
    assert.deepStrictEqual(r.data, { a: 1 });
  });

  await t.test('path traversal bloqueado', async () => {
    const res = await fetch(s.url + '/%2e%2e/%2e%2e/etc/passwd');
    const txt = await res.text();
    assert.ok(!txt.includes('root:'));
  });
});
