const path = require('node:path');
const { openDb, migrate } = require('./db');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT || 3200);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'cadarvis.db');

const db = openDb(DB_PATH);
migrate(db);
const server = createApp(db);
server.listen(PORT, () => console.log(`CADARVIS escuchando en http://localhost:${PORT}`));

// Limpieza periódica de sesiones vencidas
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
}, 60 * 60 * 1000).unref();
