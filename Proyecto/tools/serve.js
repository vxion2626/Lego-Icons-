/* Servidor estático mínimo para desarrollo.
   Uso: node tools/serve.js [puerto] */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2]) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

/* Resuelve una ruta a fichero, igual que haría un hosting estático:
   "/politica-privacidad" debe encontrar /politica-privacidad/index.html,
   y una ruta con barra final también. Sin esto las páginas legales
   responderían 404 en desarrollo pero funcionarían en producción. */
function resolve(rel) {
  const base = path.join(root, rel);
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    const index = path.join(base, 'index.html');
    if (fs.existsSync(index)) return index;
  }
  if (fs.existsSync(base + '.html')) return base + '.html';
  return null;
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '').replace(/\/+$/, '');
    const file = resolve(rel);

    if (!file || !file.startsWith(root)) {
      res.writeHead(file ? 403 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(file ? '403' : '404 · ' + rel);
      return;
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 · ' + rel);
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  })
  .listen(port, () => console.log(`Servidor en http://localhost:${port}`));
