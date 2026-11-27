const test = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

test('mapa', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const sa = await s.login('jefe', 'Superadmin');
  const tec = await s.login('tec', 'Técnico');
  const cajero = await s.login('caja', 'Cajero');

  let tipos;
  await t.test('7 tipos semilla', async () => {
    tipos = (await s.req('GET', '/api/mapa/tipos', undefined, cajero)).data;
    assert.strictEqual(tipos.length, 7);
  });
  const tid = key => tipos.find(x => x.key === key).id;

  let valvula;
  await t.test('técnico crea válvula; filtros por tipo y bbox', async () => {
    const r = await s.req('POST', '/api/mapa/puntos',
      { type_id: tid('valvula'), name: 'V-01', lat: 19.4517, lng: -70.6970, data: { diametro: '2"' } }, tec);
    assert.strictEqual(r.status, 200);
    valvula = r.data;
    assert.strictEqual(valvula.type_key, 'valvula');
    assert.deepStrictEqual(valvula.data, { diametro: '2"' });
    await s.req('POST', '/api/mapa/puntos', { type_id: tid('hidrante'), name: 'H-01', lat: 18.24, lng: -70.27 }, tec);
    let all = (await s.req('GET', '/api/mapa/puntos', undefined, cajero)).data;
    assert.strictEqual(all.length, 2);
    let f = (await s.req('GET', '/api/mapa/puntos?tipo=valvula', undefined, cajero)).data;
    assert.strictEqual(f.length, 1);
    f = (await s.req('GET', '/api/mapa/puntos?bbox=-70.3,18.2,-70.2,18.3', undefined, cajero)).data;
    assert.deepStrictEqual(f.map(p => p.name), ['H-01']);
  });

  await t.test('punto sin lng da 400; cajero no crea', async () => {
    assert.strictEqual((await s.req('POST', '/api/mapa/puntos', { type_id: tid('pozo'), name: 'P', lat: 18 }, tec)).status, 400);
    assert.strictEqual((await s.req('POST', '/api/mapa/puntos', { type_id: tid('pozo'), name: 'P', lat: 18, lng: -70 }, cajero)).status, 403);
    assert.strictEqual((await s.req('POST', '/api/mapa/puntos', { type_id: 999, name: 'P', lat: 18, lng: -70 }, tec)).status, 400);
  });

  await t.test('editar y borrar punto', async () => {
    const u = await s.req('PUT', `/api/mapa/puntos/${valvula.id}`, { name: 'V-01 principal', data: { estado: 'abierta' } }, tec);
    assert.strictEqual(u.data.name, 'V-01 principal');
    assert.strictEqual(u.data.lat, 19.4517);
    assert.strictEqual((await s.req('DELETE', `/api/mapa/puntos/${valvula.id}`, undefined, tec)).status, 200);
    assert.strictEqual((await s.req('GET', `/api/mapa/puntos/${valvula.id}`, undefined, tec)).status, 404);
    assert.ok(s.db.prepare("SELECT 1 FROM audit_log WHERE entity='punto' AND action='borrar'").get());
  });

  await t.test('tipos: crear con color inválido 400; válido ok; técnico no crea tipos', async () => {
    assert.strictEqual((await s.req('POST', '/api/mapa/tipos', { key: 'medidor', name: 'Medidor', icon: 'M', color: 'azul' }, sa)).status, 400);
    assert.strictEqual((await s.req('POST', '/api/mapa/tipos', { key: 'Mal Key', name: 'X', icon: 'X', color: '#123456' }, sa)).status, 400);
    const r = await s.req('POST', '/api/mapa/tipos', { key: 'medidor', name: 'Medidor', icon: 'M', color: '#123456' }, sa);
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await s.req('POST', '/api/mapa/tipos', { key: 'otro', name: 'O', icon: 'O', color: '#123456' }, tec)).status, 403);
    const sys = await s.req('PUT', `/api/mapa/tipos/${tid('valvula')}`, { key: 'llave', color: '#000000' }, sa);
    assert.strictEqual(sys.data.key, 'valvula');
    assert.strictEqual(sys.data.color, '#000000');
  });
});
