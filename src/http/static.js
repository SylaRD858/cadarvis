const fs = require('node:fs');
const path = require('node:path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};

function serveStatic(req, res, rootDir) {
  const root = path.resolve(rootDir);
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { pathname = '/'; }
  let file = path.resolve(root, '.' + path.posix.normalize('/' + pathname));
  if (!file.startsWith(root + path.sep) && file !== root) return notFound(res);

  const hasExt = path.extname(pathname) !== '';
  if (!hasExt || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (hasExt) return notFound(res);
    file = path.join(root, 'index.html'); // SPA
    if (!fs.existsSync(file)) return notFound(res);
  }
  // Imágenes y librerías externas se guardan un día; el código de la app se revalida siempre
  // (responde 304 si no cambió), así cada actualización se ve de inmediato.
  const larga = /[\\/](vendor|img)[\\/]/.test(file);
  const mtime = fs.statSync(file).mtime;
  mtime.setMilliseconds(0);
  const headers = {
    'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
    'cache-control': larga ? 'public, max-age=86400' : 'no-cache',
    'last-modified': mtime.toUTCString(),
  };
  const ims = Date.parse(req.headers['if-modified-since'] || '');
  if (!Number.isNaN(ims) && ims >= mtime.getTime()) {
    res.writeHead(304, headers);
    return res.end();
  }
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('No encontrado');
}

module.exports = { serveStatic };
