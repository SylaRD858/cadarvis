#!/usr/bin/env node
// Uso: node scripts/crear-superadmin.js <usuario> "<nombre completo>"
// La contraseña se pide por teclado (o en la variable CADARVIS_PASS).
const path = require('node:path');
const readline = require('node:readline');
const { openDb, migrate } = require('../src/db');
const { hashPassword } = require('../src/auth/passwords');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'cadarvis.db');

function fail(msg) { console.error(msg); process.exit(1); }

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.startsWith(question)) process.stdout.write(s); };
    rl.question(question, a => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

(async () => {
  const [username, ...nameParts] = process.argv.slice(2);
  const fullName = nameParts.join(' ').trim();
  if (!username || !fullName) fail('Uso: node scripts/crear-superadmin.js <usuario> "<nombre completo>"');

  const db = openDb(DB_PATH);
  migrate(db);
  const exists = db.prepare(`SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id
    WHERE r.name = 'Superadmin' AND u.active = 1`).get();
  if (exists) fail('Ya existe un superadmin activo. Use el sistema para crear más usuarios.');

  let pass = process.env.CADARVIS_PASS;
  if (pass === undefined) {
    pass = await ask('Contraseña: ');
    const again = await ask('Repita la contraseña: ');
    if (pass !== again) fail('Las contraseñas no coinciden.');
  }
  if (String(pass).length < 8) fail('La contraseña debe tener al menos 8 caracteres.');

  db.prepare('INSERT INTO users(username, full_name, password_hash, role_id, created_at) VALUES (?,?,?,1,?)')
    .run(username.toLowerCase(), fullName, hashPassword(pass), new Date().toISOString());
  console.log(`Superadmin "${username}" creado.`);
})();
