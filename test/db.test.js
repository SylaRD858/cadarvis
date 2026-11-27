const test = require('node:test');
const assert = require('node:assert');
const { openDb, migrate, tx } = require('../src/db');

test('migrate es idempotente y siembra rangos y tipos', () => {
  const db = openDb(':memory:');
  migrate(db);
  migrate(db);
  assert.strictEqual(db.prepare('select count(*) n from roles').get().n, 5);
  assert.strictEqual(db.prepare('select count(*) n from point_types').get().n, 7);
  assert.strictEqual(db.prepare('select count(*) n from users').get().n, 0);
});

test('tx revierte si falla', () => {
  const db = openDb(':memory:');
  migrate(db);
  assert.throws(() => tx(db, () => {
    db.prepare("insert into plans(name, price_cents) values('X', 100)").run();
    throw new Error('falla');
  }));
  assert.strictEqual(db.prepare('select count(*) n from plans').get().n, 0);
});
