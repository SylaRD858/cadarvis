const test = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

test('centro del mapa por defecto: Villa Sombrero, Baní', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const tok = await s.login('jefe', 'Superadmin');
  const c = (await s.req('GET', '/api/config', undefined, tok)).data;
  assert.strictEqual(c.mapa.centro.lat, 18.257425);
  assert.strictEqual(c.mapa.centro.lng, -70.361671);
});

test('migración corrige el centro viejo guardado', () => {
  const { openDb, migrate } = require('../src/db');
  const fs = require('node:fs'); const path = require('node:path');
  const db = openDb(':memory:');
  // aplicar solo hasta 002 y guardar el centro viejo
  db.exec('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const dir = path.join(__dirname, '..', 'src', 'migrations');
  for (const f of ['001_base.sql', '002_client_search.sql']) {
    db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(f, 'x');
  }
  db.prepare("INSERT INTO settings VALUES ('config', ?)").run(JSON.stringify({ mapa: { centro: { lat: 18.24, lng: -70.27 }, zoom: 15 }, empresa: { nombre: 'X' } }));
  migrate(db);
  const v = JSON.parse(db.prepare("SELECT value FROM settings WHERE key='config'").get().value);
  assert.strictEqual(v.mapa.centro.lat, 18.257425);
  assert.strictEqual(v.empresa.nombre, 'X');
});

test('panel de inicio por rango', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const sa = await s.login('jefe', 'Superadmin');
  const admin = await s.login('admin', 'Administrador');
  const caja = await s.login('caja', 'Cajero');
  const alm = await s.login('alm', 'Almacén');
  const roleId = n => s.db.prepare('SELECT id FROM roles WHERE name = ?').get(n).id;

  const plan = (await s.req('POST', '/api/planes', { name: 'Residencial', price_cents: 30000 }, admin)).data;
  await s.req('POST', '/api/clientes', { full_name: 'A', plan_id: plan.id, sector: 'Centro', lat: 18.25, lng: -70.36 }, admin);
  await s.req('POST', '/api/clientes', { full_name: 'B', plan_id: plan.id, sector: 'Centro' }, admin);
  await s.req('POST', '/api/clientes', { full_name: 'C', plan_id: plan.id, status: 'suspendido' }, admin);

  await t.test('lista de widgets disponibles', async () => {
    const r = await s.req('GET', '/api/inicio/widgets', undefined, caja);
    assert.ok(r.data.some(w => w.key === 'clientes_resumen' && w.perm === 'clientes.ver'));
  });

  await t.test('superadmin ve todos con datos correctos', async () => {
    const r = await s.req('GET', '/api/inicio', undefined, sa);
    const w = Object.fromEntries(r.data.widgets.map(x => [x.key, x.data]));
    assert.strictEqual(w.clientes_resumen.total, 3);
    assert.strictEqual(w.clientes_resumen.por_estado.activo, 2);
    assert.strictEqual(w.clientes_resumen.nuevos_mes, 3);
    assert.strictEqual(w.ingreso_esperado.mensual_cents, 60000); // solo activos
    assert.strictEqual(w.clientes_sin_ubicacion.total, 2);
    assert.deepStrictEqual(w.clientes_por_sector[0], { sector: 'Centro', total: 2 });
    assert.ok(Array.isArray(w.actividad_reciente));
  });

  await t.test('almacén solo ve lo que su rango permite', async () => {
    const r = await s.req('GET', '/api/inicio', undefined, alm);
    const keys = r.data.widgets.map(x => x.key);
    assert.ok(keys.includes('red_resumen'));
    assert.ok(!keys.includes('clientes_resumen'));
    assert.ok(!keys.includes('actividad_reciente'));
  });

  await t.test('personalizar el panel de un rango', async () => {
    const id = roleId('Cajero');
    const bad = await s.req('PUT', `/api/rangos/${id}/inicio`, { widgets: ['actividad_reciente'] }, sa);
    assert.strictEqual(bad.status, 400); // Cajero no tiene bitacora.ver
    assert.strictEqual((await s.req('PUT', `/api/rangos/${id}/inicio`, { widgets: ['nada'] }, sa)).status, 400);
    assert.strictEqual((await s.req('PUT', `/api/rangos/${id}/inicio`, { widgets: ['clientes_resumen'] }, admin)).status, 403);
    const ok = await s.req('PUT', `/api/rangos/${id}/inicio`, { widgets: ['ingreso_esperado', 'clientes_resumen'] }, sa);
    assert.strictEqual(ok.status, 200);
    const r = await s.req('GET', '/api/inicio', undefined, caja);
    assert.deepStrictEqual(r.data.widgets.map(x => x.key), ['ingreso_esperado', 'clientes_resumen']);
    const roles = (await s.req('GET', '/api/rangos', undefined, sa)).data;
    assert.deepStrictEqual(roles.find(x => x.id === id).inicio, ['ingreso_esperado', 'clientes_resumen']);
  });

  await t.test('si al rango le quitan un permiso, el widget deja de mostrarse', async () => {
    const id = roleId('Cajero');
    await s.req('PUT', `/api/rangos/${id}`, { perms: ['clientes.ver', 'mapa.ver'] }, sa);
    const r = await s.req('GET', '/api/inicio', undefined, caja);
    assert.deepStrictEqual(r.data.widgets.map(x => x.key), ['clientes_resumen']);
  });
});

test('un rango nuevo recibe un panel según sus permisos', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const sa = await s.login('jefe', 'Superadmin');
  const r = await s.req('POST', '/api/rangos', { name: 'Lector', perms: ['clientes.ver', 'mapa.ver'] }, sa);
  assert.deepStrictEqual(r.data.inicio, ['clientes_resumen', 'red_resumen', 'clientes_por_sector', 'clientes_sin_ubicacion']);
});
