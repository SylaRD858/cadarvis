// Lista cerrada de permisos. Agrupados por módulo para la interfaz.
const PERM_GROUPS = {
  'Usuarios': ['usuarios.ver', 'usuarios.editar', 'rangos.editar'],
  'Configuración': ['config.editar', 'bitacora.ver'],
  'Planes': ['planes.ver', 'planes.editar'],
  'Clientes': ['clientes.ver', 'clientes.editar'],
  'Mapa': ['mapa.ver', 'mapa.editar'],
};
const ALL_PERMS = Object.values(PERM_GROUPS).flat();
const SUPERADMIN_ROLE = 'Superadmin';

function permsForRole(db, roleId, roleName) {
  if (roleName === SUPERADMIN_ROLE) return new Set(ALL_PERMS);
  return new Set(db.prepare('SELECT perm FROM role_permissions WHERE role_id = ?').all(roleId).map(r => r.perm));
}

module.exports = { ALL_PERMS, PERM_GROUPS, SUPERADMIN_ROLE, permsForRole };
