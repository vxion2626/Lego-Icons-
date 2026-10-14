/* Comprueba que el sitio funciona publicado bajo una SUBCARPETA, que es como
   lo sirve GitHub Pages cuando el repositorio no es <usuario>.github.io:
   https://usuario.github.io/mi-repo/.

   Es la prueba que detecta los href="/..." escritos a mano. En local, con el
   sitio en la raíz, todo parece bien; en cuanto se sube a /mi-repo esos
   enlaces apuntan a la raíz del dominio y saltan fuera del sitio. Copia el
   proyecto a <tmp>/repo, lo sirve desde <tmp> y recorre la navegación real.

   Uso: node tools/subpath-check.js
*/
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'subpath-'));
const REPO = path.join(TMP, 'repo');
const PORT = 8800 + (process.pid % 300);
const BASE = 'http://127.0.0.1:' + PORT + '/repo';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

let passed = 0;
let failed = 0;
const ok = (m) => { passed++; console.log('  ok      ' + m); };
const err = (m) => { failed++; console.log('  FALLO   ' + m); };
const warn = (m) => { console.log('  aviso   ' + m); };
const pending = [];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(TMP, rel);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    /* GitHub Pages sirve el 404.html del repo con estado 404. El emulador tiene
       que hacerlo igual, o la comprobación del 404 no significaría nada. */
    const notFound = path.join(REPO, '404.html');
    if (fs.existsSync(notFound)) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return fs.createReadStream(notFound).pipe(res);
    }
    res.writeHead(404, { 'content-type': 'text/html' });
    return res.end('404');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

/* Recorre los enlaces internos de una página, como haría un visitante. Cada
   URL que se resuelve comprobando que SIGUE dentro del prefijo /repo: si un
   enlace se sale, es una ruta absoluta colada en el HTML. */
/* Hay fotografías que todavía no están en el repositorio —las de los sets y
   las de los polaroids de la portada—. Un 404 aquí es un estado conocido y
   sustitución en la página, no un enlace roto, pero solo se acepta si la
   página que lo referencia lo declara como pendiente con la marca
   `data-img-has-source="false"`.

   Lo pendiente se reconoce por la marca y no por la ruta. Antes era el patrón
   `assets/img/sets/` seguido de un número, y añadir una carpeta de fotos
   pendientes obligaba a ampliar este regex o el 404 pasaba a ser un fallo. */
function isPendingPhoto(href) { return /(^|\/)assets\/img\//.test(href.split('?')[0]); }

/* Las rutas que la página declara pendientes de verdad: se leen de los <img>
   que llevan la marca, no de un recuento de apariciones. Un `src` en concreto
   puede aparecer dos veces —en el `src` y en el enlace del `<noscript>`—, y
   contar marcas no dice si esa foto concreta está cubierta. */
function declaredPending(html) {
  const set = new Set();
  for (const tag of html.match(/<img\b[^>]*>/g) || []) {
    if (!/data-img-has-source="false"/.test(tag)) continue;
    const src = (tag.match(/\ssrc="([^"]+)"/) || [])[1];
    if (src) set.add(src.split('?')[0]);
  }
  return set;
}

/* Rutas que el rastreo ha visto responder 404, en forma relativa al repo y sin
   barra inicial —la misma forma que tienen los `src` del HTML—, para que la
   comparación con lo declarado sea una igualdad de cadenas y no un cálculo de
   URLs. */
const missingRefs = new Set();

async function crawl(url, seen) {
  if (seen.has(url)) return;
  seen.add(url);
  const res = await fetch(url);
  const from = url.replace(BASE, '');
  if (res.status !== 200) {
    missingRefs.add(from.replace(/^\//, ''));
    if (isPendingPhoto(from)) { pending.push(from); warn(from + ' -> HTTP 404 (foto pendiente, aceptada)'); }
    else { err(from + ' -> HTTP ' + res.status); }
    return;
  }
  const type = res.headers.get('content-type') || '';
  if (!/text\/html/.test(type)) { ok(from + ' -> 200'); return; }
  const html = await res.text();
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  const internal = refs.filter((h) => !/^(https?:|mailto:|tel:|data:|#)/i.test(h));
  for (const href of internal) {
    const abs = new URL(href, url).toString();
    if (abs !== BASE && !abs.startsWith(BASE + '/')) {
      err('se sale del subpath: "' + href + '" en ' + from + ' -> ' + abs);
      continue;
    }
    if (href.includes('#')) continue;
    await crawl(abs, seen);
  }
  /* Cada foto que esta página referencia y que de verdad falta tiene que venir
     con su propio aviso: un `<noscript>` con enlace al original y
     `data-img-has-source="false"`, que es lo que hace que `main.js` la
     sustituya.

     Se cruzan las dos mitades: `missingRefs` dice qué respondió 404 y
     `declared` qué declara la página. Antes se comparaban dos recuentos
     globales de la página —cuántas marcas y cuántos `<noscript>`—, y con eso
     una página con seis fotos declaradas y seis sustitutos que no casaban
     entre sí pasaba el control. Y tampoco vale con mirar solo `declared`: una
     imagen de `assets/img/` que sí existe y por tanto se entrega marcada con
     `data-img-has-source="true"` —la pirámide de la cabecera— no es una foto
     pendiente y no debe contarse como una sin declarar. */
  const declared = declaredPending(html);
  const missing = [...new Set(internal.map((h) => h.split('?')[0].replace(/^\//, '')))]
    .filter((h) => isPendingPhoto(h) && missingRefs.has(h));
  if (missing.length) {
    const uncovered = missing.filter((h) => !declared.has(h));
    if (uncovered.length) {
      err(from + ' referencia ' + uncovered.length + ' imágenes de assets/img que faltan y no declara sustitución (data-img-has-source="false"): ' + uncovered.join(', '));
    } else {
      ok(from + ' declara sustitución para sus ' + missing.length + ' fotos pendientes');
    }
  }
  ok(from + ' -> 200 (' + internal.length + ' referencias internas)');
}

(async () => {
  copyDir(ROOT, REPO);
  await new Promise((r) => server.listen(PORT, r));
  console.log('Sirviendo el proyecto como /repo en ' + BASE + '\n');

  console.log('=== Navegación bajo la subcarpeta ===');
  const seen = new Set();
  await crawl(BASE + '/', seen);
  ok(seen.size + ' recursos alcanzables siguiendo enlaces desde la portada');

  console.log('\n=== 404 de GitHub Pages ===');
  const miss = await fetch(BASE + '/ruta-que-no-existe');
  miss.status === 404 ? ok('una ruta inexistente devuelve 404') : err('esperaba 404, vino ' + miss.status);
  const body404 = await miss.text();
  body404.includes('index.html') && !body404.includes('href="/"')
    ? ok('el 404 enlaza al catálogo con rutas relativas')
    : err('el 404 no enlaza al catálogo en relativo');
  body404.includes('noindex') ? ok('el 404 está en noindex') : err('el 404 no declara noindex');

  if (pending.length) {
    console.log('\n=== Fotos de set pendientes ===');
    warn(pending.length + ' fotos referenciadas y todavía ausentes, todas con sustitución declarada:');
    [...new Set(pending)].sort().forEach((p) => console.log('           ' + p));
  }

  console.log('\n' + '='.repeat(58));
  console.log(failed ? '  ' + passed + ' correctas · ' + failed + ' FALLOS' : '  ' + passed + ' correctas · 0 fallos' + (pending.length ? ' · ' + new Set(pending).size + ' fotos pendientes' : ''));
  console.log('='.repeat(58));
})()
  .catch((e) => {
    console.error('\nError: ' + e.message);
    failed++;
  })
  .finally(() => {
    server.close();
    try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* noop */ }
    process.exit(failed ? 1 : 0);
  });
