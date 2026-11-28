-- Centro del mapa: Villa Sombrero, Baní (corrige el valor aproximado anterior si quedó guardado)
UPDATE settings
SET value = json_set(value, '$.mapa.centro.lat', 18.257425, '$.mapa.centro.lng', -70.361671)
WHERE key = 'config'
  AND json_extract(value, '$.mapa.centro.lat') = 18.24
  AND json_extract(value, '$.mapa.centro.lng') = -70.27;

-- Panel de inicio configurable por rango (lista ordenada de widgets, JSON)
CREATE TABLE role_dashboard (
  role_id INTEGER PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE,
  widgets TEXT NOT NULL
);

INSERT INTO role_dashboard(role_id, widgets) VALUES
  (1, '["clientes_resumen","ingreso_esperado","red_resumen","clientes_por_sector","clientes_sin_ubicacion","usuarios_resumen","actividad_reciente"]'),
  (2, '["clientes_resumen","ingreso_esperado","red_resumen","clientes_por_sector","clientes_sin_ubicacion","usuarios_resumen","actividad_reciente"]'),
  (3, '["clientes_resumen","ingreso_esperado","clientes_por_sector"]'),
  (4, '["red_resumen","clientes_sin_ubicacion","clientes_resumen"]'),
  (5, '["red_resumen"]');
