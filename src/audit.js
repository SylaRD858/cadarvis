function audit(db, { userId = null, action, entity, entityId = null, before = null, after = null }) {
  db.prepare('INSERT INTO audit_log(at, user_id, action, entity, entity_id, before, after) VALUES (?,?,?,?,?,?,?)')
    .run(new Date().toISOString(), userId, action, entity,
      entityId == null ? null : String(entityId),
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after));
}

module.exports = { audit };
