const http = require('node:http');
const path = require('node:path');
const { Router, sendJson } = require('./http/router');
const { serveStatic } = require('./http/static');

// Módulos de rutas: cada uno exporta register(router)
const MODULES = [
  './auth/routes',
  './users/routes',
  './config/routes',
  './plans/routes',
  './clients/routes',
  './map/routes',
];

function createApp(db, { publicDir = path.join(__dirname, '..', 'public') } = {}) {
  const router = new Router({ db });

  router.get('/api/salud', () => ({ ok: true }));
  router.post('/api/eco', (req, res, ctx) => ctx.body);

  for (const m of MODULES) require(m).register(router);

  return http.createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    if (await router.handle(req, res)) return;
    if (req.url.startsWith('/api/')) return sendJson(res, 404, { error: 'No encontrado' });
    serveStatic(req, res, publicDir);
  });
}

module.exports = { createApp, MODULES };
