const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'crear-superadmin.js');

function run(dbPath, args, pass) {
  try {
    const out = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, ...args], {
      env: { ...process.env, DB_PATH: dbPath, CADARVIS_PASS: pass }, encoding: 'utf8', stdio: 'pipe',
    });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: String(e.stderr) + String(e.stdout) }; }
}

test('crear-superadmin crea uno y se niega a un segundo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadarvis-'));
  const db = path.join(dir, 'x.db');
  assert.strictEqual(run(db, ['eucar', 'Eucar Alvarez'], 'corta').code, 1);
  assert.strictEqual(run(db, ['eucar', 'Eucar Alvarez'], 'clave-segura-1').code, 0);
  const r = run(db, ['otro', 'Otro'], 'clave-segura-1');
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /Ya existe un superadmin/);
});
