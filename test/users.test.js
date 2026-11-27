const test = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

test('usuarios y rangos', async (t) => {
  const s = await startTestServer();
  t.after(() => s.close());
  const sa = await s.login('jefe', 'Superadmin');
  const admin = await s.login('admin', 'Administrador');
  const cajero = await s.login('caja1', 'Cajero');
  const roleId = (name) => s.db.prepare('SELECT id FROM roles WHERE name = ?').get(name).id;

  await t.test('cajero no puede listar usuarios', async () => {
    assert.strictEqual((await s.req('GET', '/api/usuarios', undefined, cajero)).status, 403);
  });

  await t.test('admin crea cajero y este puede entrar; queda en bitácora', async () => {
    const r = await s.req('POST', '/api/usuarios',
      { username: 'Maria', full_name: 'María Pérez', password: 'clave-maria', role_id: roleId('Cajero') }, admin);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.username, 'maria');
    assert.strictEqual(r.data.password_hash, undefined);
    const l = await s.req('POST', '/api/auth/login', { username: 'maria', password: 'clave-maria' });
    assert.strictEqual(l.status, 200);
    const a = s.db.prepare("SELECT * FROM audit_log WHERE action='crear' AND entity='usuario'").get();
    assert.ok(a);
  });

  await t.test('contraseña corta da 400', async () => {
    const r = await s.req('POST', '/api/usuarios',
      { username: 'x1', full_name: 'X', password: '123', role_id: roleId('Cajero') }, admin);
    assert.strictEqual(r.status, 400);
  });

  await t.test('no se puede desactivar al único superadmin', async () => {
    const id = s.db.prepare("SELECT id FROM users WHERE username='jefe'").get().id;
    const r = await s.req('PUT', `/api/usuarios/${id}`, { active: false }, sa);
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.data.error, 'Debe quedar al menos un superadmin activo');
    const r2 = await s.req('PUT', `/api/usuarios/${id}`, { role_id: roleId('Cajero') }, sa);
    assert.strictEqual(r2.status, 409);
  });

  await t.test('rango Superadmin no se edita', async () => {
    const r = await s.req('PUT', `/api/rangos/${roleId('Superadmin')}`, { name: 'Jefe', perms: [] }, sa);
    assert.strictEqual(r.status, 409);
  });

  await t.test('admin no puede asignar Superadmin', async () => {
    const r = await s.req('POST', '/api/usuarios',
      { username: 'zeta', full_name: 'Z', password: 'clave12345', role_id: roleId('Superadmin') }, admin);
    assert.strictEqual(r.status, 403);
  });

  await t.test('admin no puede editar rangos', async () => {
    const r = await s.req('POST', '/api/rangos', { name: 'Lector', perms: [] }, admin);
    assert.strictEqual(r.status, 403);
  });

  await t.test('crear rango con permiso desconocido da 400; válido funciona y aplica', async () => {
    assert.strictEqual((await s.req('POST', '/api/rangos', { name: 'Lector', perms: ['volar'] }, sa)).status, 400);
    const r = await s.req('POST', '/api/rangos', { name: 'Lector', perms: ['clientes.ver'] }, sa);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data.perms, ['clientes.ver']);
    const list = await s.req('GET', '/api/rangos', undefined, admin);
    assert.ok(list.data.some(x => x.name === 'Lector'));
  });

  await t.test('borrar rango de sistema da 409', async () => {
    assert.strictEqual((await s.req('DELETE', `/api/rangos/${roleId('Cajero')}`, undefined, sa)).status, 409);
  });

  await t.test('GET /api/permisos lista grupos', async () => {
    const r = await s.req('GET', '/api/permisos', undefined, sa);
    assert.ok(r.data.groups.Clientes.includes('clientes.editar'));
  });

  await t.test('bitácora visible para admin', async () => {
    const r = await s.req('GET', '/api/bitacora?limit=5', undefined, admin);
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.length > 0);
    assert.ok('username' in r.data[0]);
  });
});
