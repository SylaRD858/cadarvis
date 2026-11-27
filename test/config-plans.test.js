const test = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

test('configuración y planes', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const sa = await s.login('jefe', 'Superadmin');
  const admin = await s.login('admin', 'Administrador');
  const cajero = await s.login('caja', 'Cajero');

  await t.test('config por defecto', async () => {
    const r = await s.req('GET', '/api/config', undefined, cajero);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.empresa.nombre, 'CADARVIS');
    assert.strictEqual(r.data.facturacion.dia_generacion, 1);
    assert.strictEqual(r.data.recibo.ancho_mm, 80);
    assert.strictEqual(r.data.ncf.activo, false);
  });

  await t.test('PUT parcial conserva el resto', async () => {
    const r = await s.req('PUT', '/api/config', { empresa: { telefono: '809-555-0000' } }, sa);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.empresa.telefono, '809-555-0000');
    assert.strictEqual(r.data.empresa.nombre, 'CADARVIS');
    const g = await s.req('GET', '/api/config', undefined, cajero);
    assert.strictEqual(g.data.empresa.telefono, '809-555-0000');
  });

  await t.test('validaciones de config', async () => {
    assert.strictEqual((await s.req('PUT', '/api/config', { facturacion: { dia_generacion: 31 } }, sa)).status, 400);
    assert.strictEqual((await s.req('PUT', '/api/config', { recibo: { ancho_mm: 70 } }, sa)).status, 400);
  });

  await t.test('admin no edita config', async () => {
    assert.strictEqual((await s.req('PUT', '/api/config', { empresa: { nombre: 'X' } }, admin)).status, 403);
  });

  await t.test('planes: crear, duplicado, negativo, editar', async () => {
    const r = await s.req('POST', '/api/planes', { name: 'Residencial', price_cents: 30000 }, admin);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.price_cents, 30000);
    const list = await s.req('GET', '/api/planes', undefined, cajero);
    assert.ok(list.data.some(p => p.name === 'Residencial' && p.active === true));
    assert.strictEqual((await s.req('POST', '/api/planes', { name: 'residencial', price_cents: 1 }, admin)).status, 409);
    assert.strictEqual((await s.req('POST', '/api/planes', { name: 'Malo', price_cents: -1 }, admin)).status, 400);
    assert.strictEqual((await s.req('POST', '/api/planes', { name: 'Malo', price_cents: 10.5 }, admin)).status, 400);
    const u = await s.req('PUT', `/api/planes/${r.data.id}`, { price_cents: 35000, active: false }, admin);
    assert.strictEqual(u.data.price_cents, 35000);
    assert.strictEqual(u.data.active, false);
    assert.strictEqual((await s.req('POST', '/api/planes', { name: 'Otro', price_cents: 1 }, cajero)).status, 403);
  });
});
