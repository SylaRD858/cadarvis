const test = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

test('averías', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const admin = await s.login('admin', 'Administrador');
  const caja = await s.login('caja', 'Cajero');
  const tec = await s.login('tec', 'Técnico');
  const tec2 = await s.login('tec2', 'Técnico');
  const alm = await s.login('alm', 'Almacén');
  const uid = u => s.db.prepare('SELECT id FROM users WHERE username = ?').get(u).id;
  const cli = (await s.req('POST', '/api/clientes', { full_name: 'Juan', lat: 18.2575, lng: -70.3617 }, admin)).data;

  let a1;
  await t.test('cajero registra avería; toma la ubicación del cliente; código A-00001', async () => {
    const r = await s.req('POST', '/api/averias', { type: 'fuga', description: 'Sale agua frente a la casa', priority: 'alta', client_id: cli.id, reporter_phone: '809-555-0000' }, caja);
    assert.strictEqual(r.status, 200);
    a1 = r.data;
    assert.strictEqual(a1.code, 'A-00001');
    assert.strictEqual(a1.status, 'nueva');
    assert.strictEqual(a1.lat, 18.2575);
    assert.strictEqual(a1.client_name, 'Juan');
    assert.strictEqual(a1.events[0].kind, 'creada');
  });

  await t.test('validaciones', async () => {
    assert.strictEqual((await s.req('POST', '/api/averias', { type: 'rara', description: 'x' }, caja)).status, 400);
    assert.strictEqual((await s.req('POST', '/api/averias', { type: 'fuga', description: '' }, caja)).status, 400);
    assert.strictEqual((await s.req('POST', '/api/averias', { type: 'fuga', description: 'x', priority: 'mega' }, caja)).status, 400);
    assert.strictEqual((await s.req('POST', '/api/averias', { type: 'fuga', description: 'x', lat: 18 }, caja)).status, 400);
    assert.strictEqual((await s.req('POST', '/api/averias', { type: 'fuga', description: 'x' }, alm)).status, 403);
  });

  await t.test('solo quien gestiona asigna; al asignar pasa a "asignada"', async () => {
    assert.strictEqual((await s.req('PUT', `/api/averias/${a1.id}`, { assigned_to: uid('tec') }, caja)).status, 403);
    const r = await s.req('PUT', `/api/averias/${a1.id}`, { assigned_to: uid('tec') }, admin);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.status, 'asignada');
    assert.strictEqual(r.data.assigned_name, 'tec');
    assert.strictEqual((await s.req('PUT', `/api/averias/${a1.id}`, { assigned_to: uid('alm') }, admin)).status, 400); // Almacén no atiende averías
  });

  await t.test('el técnico asignado cambia el estado; otro técnico no', async () => {
    assert.strictEqual((await s.req('PUT', `/api/averias/${a1.id}`, { status: 'en_proceso' }, tec2)).status, 403);
    let r = await s.req('PUT', `/api/averias/${a1.id}`, { status: 'en_proceso', note: 'Llegué al lugar' }, tec);
    assert.strictEqual(r.data.status, 'en_proceso');
    r = await s.req('PUT', `/api/averias/${a1.id}`, { status: 'resuelta', note: 'Cambié el tubo' }, tec);
    assert.strictEqual(r.data.status, 'resuelta');
    assert.ok(r.data.resolved_at);
    assert.strictEqual((await s.req('PUT', `/api/averias/${a1.id}`, { status: 'cerrada' }, tec)).status, 403); // cerrar es de quien gestiona
    r = await s.req('PUT', `/api/averias/${a1.id}`, { status: 'cerrada' }, admin);
    assert.strictEqual(r.data.status, 'cerrada');
    const kinds = r.data.events.map(e => e.kind);
    assert.deepStrictEqual(kinds, ['creada', 'asignada', 'estado', 'estado', 'estado']);
    assert.strictEqual(r.data.events[2].text, 'Llegué al lugar');
  });

  await t.test('estado inválido da 400; notas sueltas', async () => {
    assert.strictEqual((await s.req('PUT', `/api/averias/${a1.id}`, { status: 'volando' }, admin)).status, 400);
    const r = await s.req('POST', `/api/averias/${a1.id}/notas`, { text: 'Cliente conforme' }, caja);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.events.at(-1).text, 'Cliente conforme');
  });

  await t.test('listado con filtros y técnicos disponibles', async () => {
    await s.req('POST', '/api/averias', { type: 'sin_servicio', description: 'No llega agua', priority: 'urgente', lat: 18.26, lng: -70.36 }, caja);
    let r = await s.req('GET', '/api/averias?abiertas=1', undefined, caja);
    assert.strictEqual(r.data.total, 1);
    assert.strictEqual(r.data.items[0].code, 'A-00002');
    r = await s.req('GET', '/api/averias?estado=cerrada', undefined, caja);
    assert.strictEqual(r.data.items[0].code, 'A-00001');
    r = await s.req('GET', `/api/averias?asignado=${uid('tec')}`, undefined, caja);
    assert.strictEqual(r.data.total, 1);
    r = await s.req('GET', '/api/averias?q=llega', undefined, caja);
    assert.strictEqual(r.data.total, 1);
    const tecs = (await s.req('GET', '/api/averias/tecnicos', undefined, admin)).data.map(u => u.username);
    assert.ok(tecs.includes('tec') && !tecs.includes('alm'));
    assert.strictEqual((await s.req('GET', '/api/averias', undefined, alm)).status, 403);
  });

  await t.test('widget de averías en el panel', async () => {
    const r = await s.req('GET', '/api/inicio', undefined, admin);
    const w = r.data.widgets.find(x => x.key === 'averias_resumen');
    assert.ok(w, 'el administrador ve el widget de averías');
    assert.strictEqual(w.data.abiertas, 1);
    assert.strictEqual(w.data.por_estado.nueva, 1);
    assert.strictEqual(w.data.urgentes, 1);
    assert.strictEqual(w.data.resueltas_30d, 1);
    assert.strictEqual(w.data.recientes[0].code, 'A-00002');
  });
});

test('filtros de clientes para el panel y detalle de bitácora', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const admin = await s.login('admin', 'Administrador');
  const plan = (await s.req('POST', '/api/planes', { name: 'R', price_cents: 100 }, admin)).data;
  await s.req('POST', '/api/clientes', { full_name: 'A', sector: 'Centro', plan_id: plan.id, lat: 18.25, lng: -70.36 }, admin);
  await s.req('POST', '/api/clientes', { full_name: 'B', sector: 'Centro' }, admin);
  await s.req('POST', '/api/clientes', { full_name: 'C' }, admin);

  let r = await s.req('GET', '/api/clientes?sector=Centro', undefined, admin);
  assert.strictEqual(r.data.total, 2);
  r = await s.req('GET', '/api/clientes?sector=Sin%20sector', undefined, admin);
  assert.strictEqual(r.data.total, 1);
  r = await s.req('GET', '/api/clientes?sin_ubicacion=1', undefined, admin);
  assert.strictEqual(r.data.total, 2);
  r = await s.req('GET', '/api/clientes?sin_plan=1', undefined, admin);
  assert.strictEqual(r.data.total, 2);
  r = await s.req('GET', `/api/clientes?desde=${encodeURIComponent('2000-01-01T00:00:00.000Z')}`, undefined, admin);
  assert.strictEqual(r.data.total, 3);

  const act = (await s.req('GET', '/api/inicio', undefined, admin)).data.widgets.find(w => w.key === 'actividad_reciente');
  const d = await s.req('GET', `/api/bitacora/${act.data[0].id}`, undefined, admin);
  assert.strictEqual(d.status, 200);
  assert.strictEqual(d.data.entity, 'cliente');
  assert.strictEqual(d.data.after.full_name, 'C');
});
