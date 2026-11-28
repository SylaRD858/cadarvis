const { HttpError } = require('../http/router');
const { requireUser, requirePerm } = require('../auth/guard');
const { permsForRole, SUPERADMIN_ROLE } = require('../users/perms');
const { audit } = require('../audit');
const { WIDGETS, BY_KEY } = require('./widgets');

function roleWidgets(db, roleId) {
  const r = db.prepare('SELECT widgets FROM role_dashboard WHERE role_id = ?').get(roleId);
  try { return r ? JSON.parse(r.widgets) : []; } catch { return []; }
}

function register(router) {
  router.get('/api/inicio/widgets', requireUser, () =>
    WIDGETS.map(({ key, title, perm }) => ({ key, title, perm })));

  router.get('/api/inicio', requireUser, (req, res, { db, user }) => {
    const widgets = roleWidgets(db, user.role_id)
      .map(k => BY_KEY[k])
      .filter(w => w && user.perms.has(w.perm))
      .map(w => ({ key: w.key, title: w.title, data: w.data(db) }));
    return { widgets };
  });

  router.put('/api/rangos/:id/inicio', requirePerm('rangos.editar'), (req, res, { db, body, user }) => {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(Number(req.params.id));
    if (!role) throw new HttpError(404, 'Rango no encontrado');
    if (role.name === SUPERADMIN_ROLE && user.role_name !== SUPERADMIN_ROLE) throw new HttpError(403, 'Solo un superadmin puede cambiar este panel');
    if (!Array.isArray(body.widgets)) throw new HttpError(400, 'Lista de widgets inválida');
    const keys = [...new Set(body.widgets)];
    const perms = permsForRole(db, role.id, role.name);
    for (const k of keys) {
      if (!BY_KEY[k]) throw new HttpError(400, `Widget desconocido: ${k}`);
      if (!perms.has(BY_KEY[k].perm)) throw new HttpError(400, `El rango no tiene permiso para "${BY_KEY[k].title}"`);
    }
    const before = roleWidgets(db, role.id);
    db.prepare('INSERT INTO role_dashboard(role_id, widgets) VALUES (?, ?) ON CONFLICT(role_id) DO UPDATE SET widgets = excluded.widgets')
      .run(role.id, JSON.stringify(keys));
    audit(db, { userId: user.id, action: 'editar', entity: 'inicio_rango', entityId: role.id, before: { name: role.name, widgets: before }, after: { name: role.name, widgets: keys } });
    return { widgets: keys };
  });
}

module.exports = { register, roleWidgets };
