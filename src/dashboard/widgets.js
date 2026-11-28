// Widgets del panel de inicio. Cada uno exige un permiso y calcula sus datos.
// Las fases siguientes (caja, averías, inventario) agregan más widgets aquí.

function inicioMesIso() {
  // Primer día del mes en hora de República Dominicana (UTC-4, sin horario de verano)
  const ahora = new Date(Date.now() - 4 * 3600 * 1000);
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1, 4)).toISOString();
}

const WIDGETS = [
  {
    key: 'clientes_resumen', title: 'Clientes', perm: 'clientes.ver',
    data(db) {
      const por_estado = { activo: 0, suspendido: 0, cortado: 0, retirado: 0 };
      for (const r of db.prepare('SELECT status, COUNT(*) n FROM clients GROUP BY status').all()) por_estado[r.status] = r.n;
      const total = Object.values(por_estado).reduce((a, b) => a + b, 0);
      const nuevos_mes = db.prepare('SELECT COUNT(*) n FROM clients WHERE created_at >= ?').get(inicioMesIso()).n;
      return { total, por_estado, nuevos_mes };
    },
  },
  {
    key: 'ingreso_esperado', title: 'Facturación mensual esperada', perm: 'planes.ver',
    data(db) {
      const por_plan = db.prepare(`SELECT p.name, p.price_cents, COUNT(c.id) AS clientes, COUNT(c.id) * p.price_cents AS total_cents
        FROM plans p LEFT JOIN clients c ON c.plan_id = p.id AND c.status = 'activo'
        GROUP BY p.id ORDER BY total_cents DESC`).all();
      const mensual_cents = por_plan.reduce((a, p) => a + p.total_cents, 0);
      const sin_plan = db.prepare("SELECT COUNT(*) n FROM clients WHERE plan_id IS NULL AND status = 'activo'").get().n;
      return { mensual_cents, por_plan, sin_plan };
    },
  },
  {
    key: 'red_resumen', title: 'Red en el mapa', perm: 'mapa.ver',
    data(db) {
      const tipos = db.prepare(`SELECT t.key, t.name, t.icon, t.color, COUNT(p.id) AS total
        FROM point_types t LEFT JOIN map_points p ON p.type_id = t.id GROUP BY t.id ORDER BY total DESC, t.name`).all();
      const clientes_ubicados = db.prepare('SELECT COUNT(*) n FROM clients WHERE lat IS NOT NULL').get().n;
      return { tipos, clientes_ubicados };
    },
  },
  {
    key: 'clientes_por_sector', title: 'Clientes por sector', perm: 'clientes.ver',
    data(db) {
      return db.prepare(`SELECT COALESCE(NULLIF(TRIM(sector), ''), 'Sin sector') AS sector, COUNT(*) AS total
        FROM clients WHERE status != 'retirado' GROUP BY 1 ORDER BY total DESC, sector LIMIT 8`).all();
    },
  },
  {
    key: 'clientes_sin_ubicacion', title: 'Clientes sin ubicación en el mapa', perm: 'clientes.ver',
    data(db) {
      const total = db.prepare("SELECT COUNT(*) n FROM clients WHERE lat IS NULL AND status != 'retirado'").get().n;
      const lista = db.prepare(`SELECT id, code, full_name, sector FROM clients
        WHERE lat IS NULL AND status != 'retirado' ORDER BY created_at DESC LIMIT 6`).all();
      return { total, lista };
    },
  },
  {
    key: 'usuarios_resumen', title: 'Personal', perm: 'usuarios.ver',
    data(db) {
      return db.prepare(`SELECT r.name AS rango, COUNT(u.id) AS total FROM roles r
        LEFT JOIN users u ON u.role_id = r.id AND u.active = 1 GROUP BY r.id HAVING total > 0 ORDER BY r.id`).all();
    },
  },
  {
    key: 'actividad_reciente', title: 'Actividad reciente', perm: 'bitacora.ver',
    data(db) {
      return db.prepare(`SELECT a.at, a.action, a.entity, a.entity_id, a.after, a.before, u.full_name
        FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.action != 'login'
        ORDER BY a.id DESC LIMIT 8`).all().map(r => {
          let ref = '';
          try { const o = JSON.parse(r.after || r.before || 'null'); ref = o ? (o.code || o.name || o.full_name || o.username || '') : ''; } catch {}
          return { at: r.at, action: r.action, entity: r.entity, ref, user: r.full_name };
        });
    },
  },
];

const BY_KEY = Object.fromEntries(WIDGETS.map(w => [w.key, w]));

module.exports = { WIDGETS, BY_KEY };
