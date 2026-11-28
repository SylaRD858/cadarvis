CREATE TABLE averias (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fuga','sin_servicio','baja_presion','tubo_roto','calidad_agua','otro')),
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baja','media','alta','urgente')),
  status TEXT NOT NULL DEFAULT 'nueva' CHECK (status IN ('nueva','asignada','en_proceso','resuelta','cerrada')),
  client_id INTEGER REFERENCES clients(id),
  lat REAL, lng REAL,
  address TEXT,
  reporter_name TEXT, reporter_phone TEXT,
  source TEXT NOT NULL DEFAULT 'personal',
  created_by INTEGER REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  closed_at TEXT
);
CREATE INDEX idx_averias_status ON averias(status);
CREATE INDEX idx_averias_assigned ON averias(assigned_to);

CREATE TABLE averia_eventos (
  id INTEGER PRIMARY KEY,
  averia_id INTEGER NOT NULL REFERENCES averias(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  kind TEXT NOT NULL,          -- creada | asignada | estado | nota
  from_status TEXT, to_status TEXT,
  text TEXT
);
CREATE INDEX idx_eventos_averia ON averia_eventos(averia_id);

-- Permisos de averías para los rangos del sistema
INSERT OR IGNORE INTO role_permissions(role_id, perm) VALUES
  (2,'averias.ver'),(2,'averias.crear'),(2,'averias.gestionar'),
  (3,'averias.ver'),(3,'averias.crear'),
  (4,'averias.ver'),(4,'averias.crear');

-- Widget de averías como primer cuadro del panel de los rangos que las ven
UPDATE role_dashboard SET widgets = CASE WHEN widgets = '[]' THEN '["averias_resumen"]' ELSE '["averias_resumen",' || substr(widgets, 2) END
WHERE role_id IN (1,2,3,4) AND widgets NOT LIKE '%averias_resumen%';

-- El tipo de punto "Avería" queda reemplazado por el módulo de averías (solo se quita si no tiene puntos)
DELETE FROM point_types WHERE key = 'averia'
  AND NOT EXISTS (SELECT 1 FROM map_points p WHERE p.type_id = point_types.id);
