const test = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');
const { createAttempts } = require('../src/auth/attempts');

test('URL mal codificada no tumba el servidor', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const r = await s.req('GET', '/api/clientes/%E0');
  assert.strictEqual(r.status, 400);
  assert.strictEqual((await s.req('GET', '/api/salud')).status, 200);
});

test('no se puede asignar un rango con más permisos que los propios', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const sa = await s.login('jefe', 'Superadmin');
  const admin = await s.login('admin', 'Administrador');
  const gerente = (await s.req('POST', '/api/rangos', { name: 'Gerente', perms: ['rangos.editar', 'config.editar', 'clientes.ver'] }, sa)).data;
  const lector = (await s.req('POST', '/api/rangos', { name: 'Lector', perms: ['clientes.ver'] }, sa)).data;
  const adminId = s.db.prepare("SELECT id FROM users WHERE username='admin'").get().id;

  const r = await s.req('PUT', `/api/usuarios/${adminId}`, { role_id: gerente.id }, admin);
  assert.strictEqual(r.status, 403);
  const c = await s.req('POST', '/api/usuarios', { username: 'pepe', full_name: 'Pepe', password: 'clave12345', role_id: gerente.id }, admin);
  assert.strictEqual(c.status, 403);
  const ok = await s.req('POST', '/api/usuarios', { username: 'pepe', full_name: 'Pepe', password: 'clave12345', role_id: lector.id }, admin);
  assert.strictEqual(ok.status, 200);
});

test('quien edita rangos no puede dar permisos que no tiene', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const sa = await s.login('jefe', 'Superadmin');
  const rr = (await s.req('POST', '/api/rangos', { name: 'Editor', perms: ['rangos.editar', 'usuarios.ver'] }, sa)).data;
  const editor = await s.login('editor', 'Editor');
  assert.strictEqual(rr.name, 'Editor');
  const r = await s.req('POST', '/api/rangos', { name: 'Total', perms: ['config.editar'] }, editor);
  assert.strictEqual(r.status, 403);
  const own = await s.req('PUT', `/api/rangos/${rr.id}`, { perms: ['rangos.editar', 'usuarios.ver', 'config.editar'] }, editor);
  assert.strictEqual(own.status, 403);
});

test('bloqueo de intentos por IP y usuario, con límite de memoria', () => {
  const a = createAttempts({ max: 5, lockMs: 60000, maxKeys: 3 });
  for (let i = 0; i < 5; i++) a.fail('1.1.1.1|root');
  assert.strictEqual(a.locked('1.1.1.1|root'), true);
  assert.strictEqual(a.locked('2.2.2.2|root'), false);
  a.fail('x'); a.fail('y'); a.fail('z'); a.fail('w');
  assert.ok(a.size() <= 3);
  a.clear('1.1.1.1|root');
  assert.strictEqual(a.locked('1.1.1.1|root'), false);
});
