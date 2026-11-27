// Contador de intentos fallidos con bloqueo temporal y tope de memoria.
function createAttempts({ max = 5, lockMs = 5 * 60 * 1000, maxKeys = 10000 } = {}) {
  const map = new Map(); // key -> {count, until}

  function prune(now) {
    for (const [k, v] of map) if (v.until && v.until <= now) map.delete(k);
    while (map.size >= maxKeys) map.delete(map.keys().next().value); // descarta los más viejos
  }

  return {
    locked(key) {
      const v = map.get(key);
      return !!(v && v.until && v.until > Date.now());
    },
    fail(key) {
      const now = Date.now();
      let v = map.get(key);
      if (v && v.until && v.until <= now) v = null;
      if (!v) { if (map.size >= maxKeys) prune(now); v = { count: 0, until: 0 }; }
      v.count++;
      if (v.count >= max) v.until = now + lockMs;
      map.delete(key); map.set(key, v); // lo mueve al final (más reciente)
    },
    clear(key) { map.delete(key); },
    size() { return map.size; },
  };
}

module.exports = { createAttempts };
