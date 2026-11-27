CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  perm TEXT NOT NULL,
  PRIMARY KEY (role_id, perm)
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);

CREATE TABLE plans (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL COLLATE NOCASE,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE clients (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  cedula TEXT UNIQUE,
  phone TEXT, phone2 TEXT, sector TEXT, address TEXT,
  plan_id INTEGER REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','suspendido','cortado','retirado')),
  lat REAL, lng REAL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_clients_name ON clients(full_name);

CREATE TABLE point_types (
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE map_points (
  id INTEGER PRIMARY KEY,
  type_id INTEGER NOT NULL REFERENCES point_types(id),
  name TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  client_id INTEGER REFERENCES clients(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_points_geo ON map_points(lat, lng);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  before TEXT,
  after TEXT
);

INSERT INTO roles(id, name, is_system) VALUES
  (1, 'Superadmin', 1), (2, 'Administrador', 1), (3, 'Cajero', 1), (4, 'Técnico', 1), (5, 'Almacén', 1);

INSERT INTO role_permissions(role_id, perm) VALUES
  (2,'usuarios.ver'),(2,'usuarios.editar'),(2,'planes.ver'),(2,'planes.editar'),(2,'clientes.ver'),(2,'clientes.editar'),(2,'mapa.ver'),(2,'mapa.editar'),(2,'bitacora.ver'),
  (3,'clientes.ver'),(3,'planes.ver'),(3,'mapa.ver'),
  (4,'clientes.ver'),(4,'mapa.ver'),(4,'mapa.editar'),
  (5,'mapa.ver');

INSERT INTO point_types(key, name, icon, color, is_system) VALUES
  ('acometida','Acometida','A','#1E88E5',1),
  ('valvula','Válvula','V','#43A047',1),
  ('hidrante','Hidrante','H','#E53935',1),
  ('tanque','Tanque','T','#5E35B1',1),
  ('pozo','Pozo','P','#00897B',1),
  ('bomba','Bomba','B','#F4511E',1),
  ('averia','Avería','!','#D9A441',1);
