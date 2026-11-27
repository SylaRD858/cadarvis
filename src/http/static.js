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
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
    'cache-control': file.endsWith('index.html') || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600',
  });
  fs.createReadStream(file).pipe(res);
}

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('No encontrado');
}

module.exports = { serveStatic };
