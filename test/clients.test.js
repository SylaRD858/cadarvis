const test = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');
const { normalizeCedula } = require('../src/clients/cedula');

test('normalizeCedula', () => {
  assert.strictEqual(normalizeCedula('001-1234567-8'), '00112345678');
  assert.strictEqual(normalizeCedula(' 00112345678 '), '00112345678');
  assert.strictEqual(normalizeCedula(''), null);
  assert.strictEqual(normalizeCedula(null), null);
  assert.throws(() => normalizeCedula('123'), /Cédula inválida/);
});

test('clientes', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const admin = await s.login('admin', 'Administrador');
  const cajero = await s.login('caja', 'Cajero');
  const plan = (await s.req('POST', '/api/planes', { name: 'Residencial', price_cents: 30000 }, admin)).data;

  let first;
  await t.test('códigos seguidos C-00001 y C-00002', async () => {
    const a = await s.req('POST', '/api/clientes',
      { full_name: 'Juan Pérez', cedula: '001-1234567-8', phone: '809-555-1111', plan_id: plan.id, lat: 18.24, lng: -70.27 }, admin);
    assert.strictEqual(a.status, 200);
    assert.strictEqual(a.data.code, 'C-00001');
    assert.strictEqual(a.data.cedula, '00112345678');
    assert.strictEqual(a.data.plan_name, 'Residencial');
    first = a.data;
    const b = await s.req('POST', '/api/clientes', { full_name: 'Ana Gómez' }, admin);
    assert.strictEqual(b.data.code, 'C-00002');
  });

  await t.test('cédula repetida (con o sin guiones) da 409', async () => {
    const r = await s.req('POST', '/api/clientes', { full_name: 'Otro', cedula: '00112345678' }, admin);
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.data.error, 'Ya existe un cliente con esa cédula');
  });

  await t.test('cédula corta da 400', async () => {
    assert.strictEqual((await s.req('POST', '/api/clientes', { full_name: 'X', cedula: '123' }, admin)).status, 400);
  });

  await t.test('coordenadas inválidas dan 400', async () => {
    assert.strictEqual((await s.req('POST', '/api/clientes', { full_name: 'X', lat: 18.2 }, admin)).status, 400);
    assert.strictEqual((await s.req('POST', '/api/clientes', { full_name: 'X', lat: 95, lng: -70 }, admin)).status, 400);
  });

  await t.test('plan inexistente da 400 y nombre vacío da 400', async () => {
    assert.strictEqual((await s.req('POST', '/api/clientes', { full_name: 'X', plan_id: 999 }, admin)).status, 400);
    assert.strictEqual((await s.req('POST', '/api/clientes', { full_name: '  ' }, admin)).status, 400);
  });

  await t.test('búsqueda por cédula parcial, nombre y código', async () => {
    let r = await s.req('GET', '/api/clientes?q=1234567', undefined, cajero);
    assert.strictEqual(r.data.total, 1);
    assert.strictEqual(r.data.items[0].code, 'C-00001');
    r = await s.req('GET', '/api/clientes?q=001-1234567', undefined, cajero);
    assert.strictEqual(r.data.total, 1);
    r = await s.req('GET', '/api/clientes?q=gómez', undefined, cajero);
    assert.strictEqual(r.data.total, 1);
    r = await s.req('GET', '/api/clientes?q=C-00002', undefined, cajero);
    assert.strictEqual(r.data.items[0].full_name, 'Ana Gómez');
  });

  await t.test('cajero ve pero no crea', async () => {
    assert.strictEqual((await s.req('GET', `/api/clientes/${first.id}`, undefined, cajero)).status, 200);
    assert.strictEqual((await s.req('POST', '/api/clientes', { full_name: 'Y' }, cajero)).status, 403);
  });

  await t.test('editar cambia estado y queda en bitácora con antes y después', async () => {
    const r = await s.req('PUT', `/api/clientes/${first.id}`, { status: 'suspendido', lat: null, lng: null }, admin);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.status, 'suspendido');
    assert.strictEqual(r.data.lat, null);
    assert.strictEqual(r.data.cedula, '00112345678');
    const a = s.db.prepare("SELECT * FROM audit_log WHERE entity='cliente' AND action='editar'").get();
    assert.match(a.before, /activo/);
    assert.match(a.after, /suspendido/);
    assert.strictEqual((await s.req('PUT', `/api/clientes/${first.id}`, { status: 'raro' }, admin)).status, 400);
  });

  await t.test('/geo excluye clientes sin ubicación', async () => {
    await s.req('PUT', `/api/clientes/${first.id}`, { lat: 18.25, lng: -70.26 }, admin);
    const r = await s.req('GET', '/api/clientes/geo', undefined, cajero);
    assert.strictEqual(r.data.length, 1);
    assert.strictEqual(r.data[0].code, 'C-00001');
  });
});
