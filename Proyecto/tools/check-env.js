/* ======================================================================
   check-env.js  ·  PUERTA DE DESPLIEGUE
   ======================================================================
   Comprueba, antes de publicar, que la URL del sitio se puede determinar
   y que el HTML generado no lleva ninguna URL inventada.

   Por qué existe
   --------------
   El sitio se desarrolla sin build: el HTML se escribe a mano en unos
   bloques delimitados por comentarios y `node tools/sync-config.js` los
   rellena desde site-data.js. Eso significa que es perfectamente posible
   subir a producción un HTML con un canonical, un og:url o un JSON-LD
   apuntando a un dominio de ejemplo, y que nada en la suite lo detecte:
   las pruebas solo comparan el canonical con lo que dice la configuración,
   así que si las dos cosas mienten a la vez, todo cuadra.

   Ese fallo tiene un coste real y difícil de arreglar: Google indexa
   https://www.tudominio.com/... y el dominio equivocado se hereda a
   todo el sitio. Por eso aquí un canonical sin resolver es un ERROR y no
   un aviso, mientras que en tools/check.js sigue siendo un aviso para no
   bloquear el desarrollo en local.

   Uso
   ---
     node tools/check-env.js            # puerta de despliegue, falla
     node tools/check-env.js --aviso    # el mismo informe sin exit 1
   ====================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const D = require(path.join(ROOT, 'assets', 'js', 'site-data.js'));
const soloAviso = process.argv.includes('--aviso');

let errores = 0;
const ok = (m) => console.log('  ok      ' + m);
const err = (m) => { errores++; console.log('  FALLO   ' + m); };
const info = (m) => console.log('  aviso   ' + m);

console.log('\n[env] Configuración de producción\n');

/* ---- 1. ¿Se puede determinar la URL? -------------------------------- */
const enCI = process.env.GITHUB_ACTIONS === 'true';

if (D.CANONICAL_URL) {
  ok('URL resuelta: ' + D.CANONICAL_URL);
  ok('  origen de SITE_URL: ' + D.SITE_URL_SOURCE + ' · de SITE_BASE: ' + D.SITE_BASE_SOURCE);
} else {
  err('no se ha podido determinar SITE_URL, así que el HTML se ha generado sin canonical, '
    + 'sin og:url y sin las URL del JSON-LD. No publiques así.');
  console.log('    Cómo resolverlo, por orden de preferencia:');
  console.log('      1. Nada, si despliegas con GitHub Actions: GITHUB_REPOSITORY se inyecta solo');
  console.log('         y la URL se deriva de ahí. El fallo indica que falta esa variable.');
  console.log('      2. SITE_URL=https://tu-dominio.es        (dominio final con su subruta)');
  console.log('      3. SITE_URL=https://tu-dominio.es  SITE_BASE=/   (dominio final en la raíz)');
}

/* ---- 1b. El valor por defecto no puede contradecir al repositorio ----- */
/* El HTML commiteado lleva el canonical por defecto, que es el correcto. Si
   el repositorio se renombra, la CI resuelve la URL nueva y el HTML se queda
   con la antigua: eso lo detecta el `sync-config --check` de la build, pero
   desde aquí se avisa antes y en un mensaje que explica qué ha pasado. */
if (D.SITE_URL_SOURCE === 'default' && (process.env.GITHUB_REPOSITORY || '').trim()) {
  err('la URL se ha resuelto con el valor por defecto (' + D.CANONICAL_URL + ') mientras el '
    + 'entorno declara GITHUB_REPOSITORY=' + process.env.GITHUB_REPOSITORY.trim() + '. Se ha '
    + 'renombrado el repositorio: actualiza DEFAULT_SITE_URL en assets/js/site-data.js o declara '
    + 'SITE_URL, o el sitio quedará con el canonical del dominio anterior.');
}

/* ---- 2. Coherencia entre SITE_BASE y el repositorio ------------------ */
const repo = (process.env.GITHUB_REPOSITORY || '').trim();
if (repo && repo.includes('/')) {
  const [, name] = repo.split('/');
  const owner = (process.env.GITHUB_REPOSITORY_OWNER || '').trim();
  const esperada = name === owner + '.github.io' ? '' : '/' + name;
  if (D.SITE_BASE === esperada) {
    ok('SITE_BASE (' + (D.SITE_BASE || 'raíz') + ') coincide con el repositorio ' + repo);
  } else if (D.SITE_BASE_SOURCE === 'SITE_BASE') {
    info('SITE_BASE está fijado a "' + (D.SITE_BASE || 'raíz') + '" a mano, mientras el repositorio '
      + 'implicaría "' + (esperada || 'raíz') + '". Si el dominio final está en otro sitio, bien; '
      + 'si no, Pages publicará con una subruta que no existe y los enlaces en relativo romperán.');
  } else {
    err('SITE_BASE (' + (D.SITE_BASE || 'raíz') + ') no coincide con el repositorio ' + repo
      + ', que implicaría "' + (esperada || 'raíz') + '".');
  }
} else {
  info('GITHUB_REPOSITORY no está definido, así que SITE_BASE no se puede contrastar con el '
    + 'nombre del repositorio. Ahora mismo es "' + (D.SITE_BASE || 'raíz') + '" ['
    + D.SITE_BASE_SOURCE + '].');
}

/* ---- 3. El HTML no lleva ninguna URL inventada ------------------------ */
const PAGINAS = [
  'index.html',
  'aviso-legal/index.html',
  'cookies/index.html',
  'politica-privacidad/index.html',
  'terminos-y-condiciones/index.html',
];

/* Dominios de ejemplo que nunca deben publicarse en un campo URL. Los
   correos y los handles de Twitter sí son placeholders legítimos: son
   datos de empresa pendientes de confirmar, no URLs de SEO. */
const FANTASMA = /https?:\/\/(?:www\.)?(?:tudominio\.com|example\.com|example\.org|localhost)/i;
let fantasma = 0;
const emails = new Set();

for (const rel of PAGINAS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { err('falta ' + rel); continue; }
  const html = fs.readFileSync(file, 'utf8');

  const hits = html.match(new RegExp(FANTASMA.source, 'gi'));
  if (hits) {
    fantasma += hits.length;
    err(rel + ' contiene ' + hits.length + ' URL(s) de dominio de ejemplo: '
      + [...new Set(hits)].slice(0, 3).join(', '));
  }
  for (const m of html.matchAll(/[\w.+-]+@tudominio\.com/g)) emails.add(m[0]);

  /* El canonical tiene que ser absoluto y con origen, o no estar. */
  const canon = html.match(/<link rel="canonical" href="([^"]*)"/);
  if (canon) {
    if (!/^https?:\/\/[^/]+\//.test(canon[1])) {
      err(rel + ' tiene un canonical que no es una URL absoluta: ' + canon[1]);
    } else if (D.CANONICAL_URL && canon[1] !== D.CANONICAL_URL && !canon[1].includes('/')) {
      err(rel + ' declara un canonical que no es ni el suyo ni el de la home: ' + canon[1]);
    }
  }
}

/* ---- 4. El JSON-LD sigue siendo JSON válido -------------------------- */
for (const rel of PAGINAS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) { info(rel + ' no tiene JSON-LD (correcto solo si SITE_URL no se pudo resolver).'); continue; }
  try {
    const data = JSON.parse(m[1]);
    const graph = data['@graph'] || [];
    const idsVacios = graph.filter((n) => n['@id'] === '' || n.url === '').length;
    if (idsVacios) err(rel + ' tiene ' + idsVacios + ' nodo(s) con @id o url vacío en el JSON-LD.');
  } catch (e) {
    err(rel + ' tiene JSON-LD que no se puede parsear: ' + e.message);
  }
}

/* ---- 5. Avisos de la configuración pendiente ------------------------- */
if (emails.size) {
  info('quedan ' + emails.size + ' correo(s) de ejemplo por sustituir antes de publicar: '
    + [...emails].join(', '));
}

if (enCI && !D.CANONICAL_URL) {
  err('estás en GitHub Actions y GITHUB_REPOSITORY no ha llegado a la configuración. '
    + 'Sin él no hay forma de saber la URL y el despliegue no debería continuar.');
}

/* ---- 6. Recordatorio de la consola de GitHub ------------------------- */
console.log('\n  ────────────────────────────────────────────────────────────');
console.log('  Antes del primer despliegue, en el repositorio:');
console.log('    Settings → Pages → Source = GitHub Actions');
console.log('    (sin esto, el workflow termina sin publicar nada)');
console.log('  ────────────────────────────────────────────────────────────\n');

if (errores) {
  console.log('  ' + errores + ' error(es). No publiques.\n');
  process.exit(soloAviso ? 0 : 1);
}
console.log('  Configuración lista para publicar.\n');
