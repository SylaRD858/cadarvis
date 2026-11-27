const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  return db;
}

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').all().map(r => r.name));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    tx(db, () => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)').run(f, new Date().toISOString());
    });
  }
}

let depth = 0;
function tx(db, fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN');
  depth++;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

function nowIso() { return new Date().toISOString(); }

module.exports = { openDb, migrate, tx, nowIso };
