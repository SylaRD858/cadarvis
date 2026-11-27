class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const MAX_BODY = 1024 * 1024;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Cuerpo demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        const v = JSON.parse(raw);
        if (v === null || typeof v !== 'object') return reject(new HttpError(400, 'JSON inválido'));
        resolve(v);
      } catch { reject(new HttpError(400, 'JSON inválido')); }
    });
    req.on('error', reject);
  });
}

function compile(path) {
  const keys = [];
  const re = path.replace(/\/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; });
  return { re: new RegExp('^' + re + '/?$'), keys };
}

class Router {
  constructor(ctxBase = {}) {
    this.routes = [];
    this.ctxBase = ctxBase;
  }
  add(method, path, handlers) { this.routes.push({ method, ...compile(path), handlers }); return this; }
  get(p, ...h) { return this.add('GET', p, h); }
  post(p, ...h) { return this.add('POST', p, h); }
  put(p, ...h) { return this.add('PUT', p, h); }
  delete(p, ...h) { return this.add('DELETE', p, h); }

  // Devuelve true si la ruta fue atendida.
  async handle(req, res) {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { sendJson(res, 400, { error: 'Dirección inválida' }); return true; }
    for (const r of this.routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      const ctx = { ...this.ctxBase };
      try {
        req.params = {};
        r.keys.forEach((k, i) => {
          try { req.params[k] = decodeURIComponent(m[i + 1]); }
          catch { throw new HttpError(400, 'Dirección inválida'); }
        });
        req.query = Object.fromEntries(url.searchParams);
        ctx.body = (req.method === 'POST' || req.method === 'PUT') ? await readJson(req) : {};
        for (const h of r.handlers) {
          const out = await h(req, res, ctx);
          if (res.writableEnded) return true;
          if (out !== undefined) { sendJson(res, 200, out); return true; }
        }
        if (!res.writableEnded) sendJson(res, 204, {});
      } catch (e) {
        if (e instanceof HttpError) sendJson(res, e.status, { error: e.message });
        else if (e && /UNIQUE constraint failed/.test(e.message)) sendJson(res, 409, { error: 'Registro duplicado' });
        else { console.error(e); sendJson(res, 500, { error: 'Error interno' }); }
      }
      return true;
    }
    return false;
  }
}

module.exports = { Router, HttpError, sendJson, readJson };
