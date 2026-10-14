/* Validador de integridad: IDs duplicados, refs rotas, clases CSS huérfanas,
   imágenes inaccesibles y labels sin control. */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('assets/css/styles.css');
const js = read('assets/js/main.js');
const siteData = read('assets/js/site-data.js');

/* El sitio son nueve páginas: las cinco públicas más las cuatro legales. Antes
   de la⑧ el validador solo miraba index.html, y con el catálogo movido a
   catalogo.html eso dejó de ser suficiente: los IDs que se usan en una página
   y no en la portada no se veían, y una clase sin estilo en temas.html se
   reportaba como "muerta" solo porque index.html no la usaba. Ahora cada
   página se valida con su propio HTML y los resultados se agregan.

   Un error se atribuye a la página que lo tiene, que es donde hay que ir a
   arreglarlo; si no, el aviso aparece bajo el nombre de la portada y se acaba
   mirando en el fichero equivocado. */
const PAGES = [
  'index.html',
  'catalogo.html',
  'temas.html',
  'preguntas-frecuentes.html',
  'transparencia.html',
  'politica-privacidad/index.html',
  'terminos-y-condiciones/index.html',
  'cookies/index.html',
  'aviso-legal/index.html',
].filter((p) => fs.existsSync(path.join(root, p)));

const docs = PAGES.map((p) => ({ file: p, html: read(p) }));
/* El HTML de todo el sitio junto, para las comprobaciones que novan con
   página: el CSS, los assets y el sprite son comunes a todas. */
const allHtml = docs.map((d) => d.html).join('\n');

let errors = 0;
let warnings = 0;
const err = (m) => { errors++; console.log('  ERROR   ' + m); };
const warn = (m) => { warnings++; console.log('  AVISO   ' + m); };
const ok = (m) => console.log('  ok      ' + m);

/* ---------- 0. Comentarios HTML bien cerrados ---------- */
console.log('\n[0] Comentarios HTML');
/* Esto se añadió después de encontrar un `<!--` sin su `-->`, y merece la pena
   explicar por qué hacía falta: un comentario sin cerrar se traga todo lo que
   viene detrás hasta el siguiente `-->`, incluido el <title>, el canonical, las
   etiquetas Open Graph y el JSON-LD. El navegador se queda con la página sin
   cabecera y el sitio sigue*viendo* bien, así que ni una captura de pantalla
   ni el lint de CSS lo detectan.

   Peor: todas las comprobaciones de este fichero leen el texto del fichero con
   expresiones regulares, y el texto estaba bien. Solo el DOM que construye el
   navegador se daba cuenta, así que el fallo pasaba entero y solo lo cazaba la
   suite de e2e. Un aserto de dos líneas sobre el propio archivo avisa antes de
   que nada llegue a publicarse.

   Se mira también que no se solapen: los comentarios HTML no se anidan, así que
   un `<!--` dentro de otro es en realidad un cierre mal escrito. */
let commentErrors = 0;
for (const d of docs) {
  const opens = (d.html.match(/<!--/g) || []).length;
  const closes = (d.html.match(/-->/g) || []).length;
  let overlapped = false;
  if (opens !== closes) {
    err(d.file + ': ' + opens + ' comentarios abiertos y ' + closes + ' cerrados; a partir del que sobra, el navegador ignora el resto del documento');
  } else {
    let depth = 0;
    for (const m of d.html.matchAll(/<!--|-->/g)) {
      depth += m[0] === '<!--' ? 1 : -1;
      if (depth > 1 || depth < 0) overlapped = true;
    }
    if (overlapped) err(d.file + ': hay comentarios HTML anidados o un --> de más; un <!-- dentro de otro comentario es en realidad un cierre mal escrito');
  }
  if (opens !== closes || overlapped) commentErrors++;
}
/* El resumen solo se imprime si no hubo errores: decir "9 páginas con
   comentarios cerrados" justo después de señalar uno miente sobre lo que el
   resto del informe viene a decir. */
if (!commentErrors) ok(docs.length + ' páginas con comentarios cerrados y sin anidar');

/* ---------- 0b. Código visible en la página ---------- */
console.log('\n[0b] Código que se ha colado en el texto');
/* Nace del mismo agujero que el comentario sin cerrar: si una etiqueta de
   apertura se pierde, el navegador se encuentra código suelto donde esperaba
   marcado. Pasó con un `<script>` al que se le olvidó el `<` de apertura, y el
   JavaScript entero se pintó en el pie de la portada como texto. Ni `check.js`
   ni `css-lint` lo vieron —ambos leen el fichero, y ahí el código estaba
   escrito perfectamente—; solo se notó al mirar el texto de la página.

   Se comprueba el texto que queda tras quitar comentarios, scripts, estilos y
   etiquetas. Si aparece algo que solo puede ser código, es que algo se ha
   descolocado. La lista de marcadores es deliberadamente estrecha: "var " a
   secas daría falsos positivos con textos que empiezan así, así que se exige
   que el marcador venga precedido de punto y coma, punto, o al principio de una
   línea, que es como aparece el código real en un descuido. */
const CODE_MARKERS = /(?:\.\s|;\s|^|\s)(?:var |let |const |function\s+\w|window\.|document\.|\}\s*\)\s*;?)/;
let leakErrors = 0;
for (const d of docs) {
  const visible = d.html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, '\n');
  /* Solo interested en las lineas con contenido de verdad: el marcado genera
     lineas vacias a monton y no interesan. */
  const hit = visible.split('\n').map((l) => l.trim()).filter(Boolean).find((l) => CODE_MARKERS.test(l));
  if (hit) {
    err(d.file + ': hay código visible en el texto de la página: "' + hit.slice(0, 70) + '". Suele ser una etiqueta de apertura perdida, y el navegador pinta el código en la web.');
    leakErrors++;
  }
}
if (!leakErrors) ok(docs.length + ' páginas sin código en el texto visible');

/* ---------- 1. IDs duplicados ---------- */
console.log('\n[1] IDs duplicados');
/* Los IDs solo tienen que ser únicos DENTRO de una página. El mismo id puede
   aparecer en cinco documentos sin colisionar, porque el fragmento se resuelve
   contra el documento abierto. Comprobarlos globalmente daba falsos positivos
   en cuanto dos páginas compartían estructura, que es justo lo que pasó con
   el diálogo del visor y con la cabecera. */
for (const d of docs) {
  const ids = [...d.html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length) err(d.file + ': IDs repetidos: ' + dupes.join(', '));
}
ok(docs.length + ' páginas sin IDs repetidos');

/* ---------- 2. Referencias a IDs inexistentes ---------- */
console.log('\n[2] Referencias a IDs inexistentes');
/* Igual que arriba: una referencia a un id se resuelve contra su propio
   documento, así que se comprueba en la página que la contiene. `catalog-search`
   y `catalog-sort` vivían en el catálogo y no en la portada, y por eso
   salían como inexistentes cuando en realidad lo que no existía era la
   página que los contenía. */
for (const d of docs) {
  const ids = new Set([...d.html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const missing = new Set();
  const add = (ref) => {
    const id = ref.replace(/^#/, '');
    if (id && !ids.has(id)) missing.add(id);
  };
  [...d.html.matchAll(/(?:href|aria-controls|aria-labelledby|aria-describedby)="(#[^"]+)"/g)]
    .forEach((m) => m[1].split(/\s+/).forEach(add));
  missing.size ? err(d.file + ': IDs inexistentes: ' + [...missing].join(', ')) : null;
}
/* Los selectores de main.js no se pueden atribuir a una página: se comprueban
   contra todas, y basta con que exista en alguna para que el script no falle
   al arrancar. */
const allIds = new Set(docs.flatMap((d) => [...d.html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
const jsMissing = new Set();
[...js.matchAll(/getElementById\('([^']+)'\)/g)].forEach((m) => { if (!allIds.has(m[1])) jsMissing.add(m[1]); });
[...js.matchAll(/\$\('#([a-zA-Z0-9_-]+)'\)/g)].forEach((m) => { if (!allIds.has(m[1])) jsMissing.add(m[1]); });
jsMissing.size ? err('main.js busca IDs que no están en ninguna página: ' + [...jsMissing].join(', ')) : ok('todos los selectores de main.js resuelven');

/* ---------- 3. Anclas de navegación ---------- */
console.log('\n[3] Anclas de navegación');
let anchorTotal = 0;
for (const d of docs) {
  const ids = new Set([...d.html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const hashLinks = [...new Set([...d.html.matchAll(/href="#([^"]*)"/g)].map((m) => m[1]).filter(Boolean))];
  anchorTotal += hashLinks.length;
  const broken = hashLinks.filter((id) => !ids.has(id));
  if (broken.length) err(d.file + ': anclas rotas: ' + broken.join(', '));
}
ok(anchorTotal + ' anclas internas válidas en ' + docs.length + ' páginas');

/* ---------- 4. Imágenes y assets existentes ---------- */
console.log('\n[4] Recursos locales referenciados');
const assets = new Set();
/* Se corta el ancla antes de mirar el disco. `href="catalogo.html#catalogo"`
   apuntaba a un fichero llamado "catalogo.html#catalogo", que no existe, y
   salía como fichero ausente: los cinco enlaces del pie al catálogo fallaban
   en cada ejecución y el aviso era un falso positivo sobre un enlace que sí
   funciona. Un ancla no es parte de la ruta, así que se descarta aquí y el
   ancla se comprueba aparte, en el apartado 3. */
const sinAncla = (ruta) => ruta.split('#')[0].split('?')[0];
/* Cada página aporta sus rutas, y se resuelven contra SU directorio: las
   públicas están en la raíz y las legales un nivel por debajo, así que sus
   "../assets/..." se normalizan igual que antes. Recorrer el conjunto es lo
   que hace que una foto usada solo en catalogo.html cuente como existente. */
for (const d of docs) {
  const profundidad = d.file.includes('/') ? 1 : 0;
  [...d.html.matchAll(/(?:src|href)="((?!https?:|#|mailto:|data:)[^"]+)"/g)].forEach((m) => {
    const r = sinAncla(m[1]);
    if (!r) return;
    assets.add(profundidad ? r.replace(new RegExp('^(?:\\.\\./)+', 'g'), '') : r);
  });
}
[...css.replace(/url\([^)]*\)/g, '').matchAll(/url\(['"]?(?!data:|#|https?:)([^'")]+)['"]?\)/g)].forEach((m) => assets.add('assets/css/' + sinAncla(m[1]).replace(/^\.\.\//, '')));
  /* Una ruta que tras quitarle el ancla se queda vacía era un ancla puro
     ("#faq"), y no es un fichero: se descarta para no contarla como rota. */
  const missingFiles = [...assets].filter((a) => a && !fs.existsSync(path.join(root, a)));

/* Las fotografías todavía no entregadas se declaran en el propio HTML con
     `data-img-has-source="false"`, y `main.js` dibuja un sustituto con el icono
     y la ruta. Eso es el contrato, así que se reconoce por la marca y no por la
     carpeta: con el patrón de antes —`assets/img/sets/` y un número— cualquier
     carpeta nueva de fotos pendientes era un ERROR del checker hasta que se
     tocaran dos regex más, y un error que hay que ampliar a mano cada vez que
     se añade un bloque acaba tending a ignorarse.

     Se listan aparte para que se vea exactamente cuáles faltan y no se
     pierdan. */
  const pendingSrcs = new Set();
  for (const tag of allHtml.match(/<img\b[^>]*>/g) || []) {
    if (!/data-img-has-source="false"/.test(tag)) continue;
    const src = (tag.match(/\ssrc="([^"]+)"/) || [])[1];
    if (src) pendingSrcs.add(src);
  }
  const pendingPhotos = missingFiles.filter((f) => pendingSrcs.has(f));
  const realMissing = missingFiles.filter((f) => !pendingPhotos.includes(f));
  if (realMissing.length) err('Ficheros ausentes: ' + realMissing.join(', '));
  else ok(assets.size - pendingPhotos.length + ' recursos presentes');
  if (pendingPhotos.length) {
    warn(pendingPhotos.length + ' fotos pendientes (con fallback en su sitio): '
      + pendingPhotos.map((f) => path.basename(f, path.extname(f))).join(', '));
  }

  /* Los enlaces internos a páginas del proyecto deben existir de verdad. */
  const routes = [...new Set([...allHtml.matchAll(/href="(\/(?!#|mailto:)[^"#?]*)"/g)].map((m) => m[1]))];
  const badRoutes = routes.filter((r) => !fs.existsSync(path.join(root, r, 'index.html')) && !fs.existsSync(path.join(root, r)));
  badRoutes.length ? err('Rutas internas rotas: ' + badRoutes.join(', ')) : ok(routes.length + ' rutas internas resuelven: ' + routes.join(', '));

  /* Assets presentes en disco que ni el HTML, el CSS ni el JS usan. */
  const assetFiles = [];
  (function walk(dir, rel) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const relPath = (rel ? rel + '/' : '') + name;
      if (fs.statSync(full).isDirectory()) walk(full, relPath);
      else if (/\.(svg|png|jpe?g|webp|avif|ico|woff2?)$/i.test(name)) assetFiles.push(relPath);
    }
  })(path.join(root, 'assets'), 'assets');
  const source = allHtml + css + js + siteData;
  const orphans = assetFiles.filter((f) => {
    const base = path.basename(f);
    if (source.includes(base)) return false;
    /* Un SVG sigue siendo legítimo si es la fuente de un PNG ya generado. */
    return !/\.svg$/i.test(base) || !assetFiles.includes(f.replace(/\.svg$/i, '.png'));
  });
  orphans.length ? warn('Assets no referenciados: ' + orphans.join(', ')) : ok('todos los assets están en uso');

/* ---------- 5. Símbolos SVG del sprite ---------- */
console.log('\n[5] Sprite de iconos');
/* El sprite es idéntico en las cinco páginas públicas —lo inyecta
   scaffold-pages.js byte a byte—, pero los <use> sí son distintos: la portada
   usa ocho iconos y el catálogo todos. Comprobar solo index.html daba dos
   resultados falsos: iconos que sí se usan en otra página marcados como no
   usados, y atributos <use> apuntando a símbolos que allí no estaban
   definidos. Se mira el sprite de la portada y los usos de todo el sitio. */
const symbols = new Set([...docs[0].html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
for (const d of docs) {
  const propios = new Set([...d.html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
  [...propios].forEach((s) => {
    if (!symbols.has(s)) err(d.file + ': el sprite no coincide con el de la portada (falta ' + s + ')');
  });
}
const uses = new Set([...allHtml.matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1]));
const dangling = [...uses].filter((u) => !symbols.has(u));
/* Los iconos de categoría no se escriben uno a uno en el HTML: salen de
   site-data.js y los pinta el generador. `ic-cube` es el respaldo para
   cuando un set declara una categoría que no está en el mapa, así que no
   aparece en ninguna etiqueta hasta que hace falta. Contarlo como usado
   evita que el aviso pida borrar justo el icono que está sujetando el
   camino de error. */
const fromData = new Set([...siteData.matchAll(/'ic-[a-z0-9-]+'/g)].map((m) => m[0].slice(1, -1)));
const unused = [...symbols].filter((s) => !uses.has(s) && !fromData.has(s));
dangling.length ? err('Iconos sin definir: ' + dangling.join(', ')) : ok(uses.size + ' iconos usados, ' + symbols.size + ' definidos');
if (unused.length) warn('Iconos definidos y no usados: ' + unused.join(', '));

/* ---------- 6. Clases del HTML sin regla CSS ---------- */
console.log('\n[6] Clases del HTML sin estilo');
/* Las clases del CSS se buscan después de tirar los comentarios y las
   `url()`. Sin quitar los comentarios, el aviso de CSS muerto era
   inservible: cualquier línea que hablara de `transparencia.html` contaba
   como si existiera una clase `html` que no existe, y el aviso acababa
   leyéndose como un fallo más.

   `url()` se quita contando paréntesis y no con `/url\([^)]*\)/`, porque
   dentro del data-URI del ruido de fondo hay paréntesis de verdad y el
   recorte ingenuo los deja sueltos; a partir de ahí el resto del archivo se
   lee como si fueran comillas abiertas y ninguna clase se cuenta bien.

   La expresión final sigue siendo permisiva a propósito, porque en un
   selector compuesto como `.chip.is-active` el segundo punto sí abre una
   clase. */
function sinUrl(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const u = css.indexOf('url(', i);
    if (u === -1) { out += css.slice(i); break; }
    out += css.slice(i, u);
    let prof = 1;
    let j = u + 4;
    while (j < css.length && prof > 0) {
      if (css[j] === '(') prof++;
      else if (css[j] === ')') prof--;
      j++;
    }
    i = j;
  }
  return out;
}
const cssClasses = new Set(
  [...sinUrl(css.replace(/\/\*[\s\S]*?\*\//g, '')).matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]),
);
/* 404.html lleva su propio <style> a propósito, para que la página de error
   siga siendo legible aunque el tema haya dejado de cargar. Sus clases no
   tienen que aparecer en styles.css, y exigírselo produciría tres avisos
   falsos en cada ejecución. */
const selfStyled = new Set(
  [...read('404.html').matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].trim().split(/\s+/)).filter(Boolean)
);
const htmlClasses = new Set();
[...allHtml.matchAll(/class="([^"]+)"/g)].forEach((m) => m[1].trim().split(/\s+/).forEach((c) => c && htmlClasses.add(c)));
[...js.matchAll(/classList\.(?:add|remove|toggle|contains)\('([^']+)'/g)].forEach((m) => htmlClasses.add(m[1]));
[...js.matchAll(/\$\$?\('\.([\w-]+)/g)].forEach((m) => htmlClasses.add(m[1]));
/* Clases que el JS crea en runtime con className = '...' o dentro de un
   innerHTML. Sin esto, el contenedor de fallback de initImages se
   reportaría como CSS muerto. */
[...js.matchAll(/className\s*=\s*'([^']+)'/g)].forEach((m) => m[1].trim().split(/\s+/).forEach((c) => c && htmlClasses.add(c)));
[...js.matchAll(/class="([^"]+)"/g)].forEach((m) => m[1].trim().split(/\s+/).forEach((c) => c && htmlClasses.add(c)));
/* Clases que existen para el HTML, los lectores de pantalla o la estructura,
   no para la pintura. Pedirles una regla Avisaría de algo que no está roto:
   `no-js` la cambia el script de la <head> y es la marca de "sin JS";
   `chip__label` y los dos modificadores `field--*` solo sirven para agrupar:
   son estructurales y el layout lo resuelve el padre. */
const structural = new Set(['no-js', 'js', 'chip__label', 'field--search', 'field--sort']);
const orphan = [...htmlClasses].filter((c) => !cssClasses.has(c) && !structural.has(c) && !selfStyled.has(c));
orphan.length ? warn('Clases sin regla CSS: ' + orphan.join(', ')) : ok(htmlClasses.size + ' clases, todas definidas o justificadas');

/* ---------- 7. Clases CSS sin usar en el HTML ---------- */
console.log('\n[7] Clases CSS sin usar');
/* Los selectores que se combinan con otro (`.js .reveal`, `.chip.is-active`)
   o que solo existen en runtime no aparecen nunca como class="..." en el
   HTML. `js` la pone el script de la <head>; `imgbox__fallback-icon` la
   inyecta initImages al fallar una imagen, así que no puede salir de un
   class= estático. */
const stateful = new Set([
  'is-in', 'is-touched', 'is-active', 'is-current', 'has-module', 'is-settled',
  'is-valid', 'is-invalid', 'was-validated', 'has-error', 'is-open', 'is-visible',
  'js', 'imgbox__fallback-icon',
  /* La ficha sin enlace de tienda. Los 18 sets tienen `affiliateUrl`, así
     que el generador no pinta nunca este bloque y su estilo no aparece en
     el HTML, pero el camino existe y se usa en cuanto un set lo pierda: si
     se cuela a producción, el texto plano tiene que verse bien. Se cuenta
     como estado, no como CSS muerto. */
  'setcard__pending', 'setcard__pending-ico',
]);
/* `.pill` solo se usa como base de `.pill__dot`; el elemento que la lleva es
   un .hero__tag, y el punto es el único hijo que necesita estilo. */
const bases = new Set(['pill']);
const unusedCss = [...cssClasses].filter((c) => !htmlClasses.has(c) && !stateful.has(c) && !bases.has(c));
unusedCss.length ? warn('Posible CSS muerto: ' + unusedCss.join(', ')) : ok('sin CSS muerto');

/* ---------- 8. Etiquetas ARIA ---------- */
console.log('\n[8] Roles y ARIA');
/* Solo se comprueban los roles que esta página usa de verdad. Los que se
   listaban aquí (tablist, alert, img) pertenecían a la landing anterior: el
   visor, el formulario de captura y los SVG con etiqueta. Mantenerlos hacía
   que apareciera un aviso en cada ejecución y tapaba los avisos reales. */
const ariaChecks = [
  [/aria-controls="/, 'aria-controls en uso'],
  [/aria-expanded="/, 'aria-expanded en uso'],
  [/aria-pressed="/, 'aria-pressed en los filtros'],
  [/aria-live="/, 'aria-live en uso'],
  [/aria-current/, 'aria-current en la navegación'],
  [/tabindex="-1"/, 'tabindex="-1" en objetivos de foco'],
  [/role="group"/, 'role="group" en el grupo de filtros'],
  [/role="list"/, 'role="list" en las listas de la tarjeta'],
];
ariaChecks.forEach(([re, label]) => (re.test(allHtml) || re.test(js) ? ok(label) : warn(label + ' (no encontrada)')));

const noAlt = [...allHtml.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/g)];
noAlt.length ? err('<img> sin alt: ' + noAlt.length) : ok('todos los <img> tienen alt');

/* ---------- 9. Formularios ---------- */
console.log('\n[9] Formularios');
/* Los controles de filtrado están en catalogo.html, no en la portada, así
   que se recorren todas las páginas. El <label for> se busca en el mismo
   documento del control: no puede estar en otra página. */
const inputs = [];
for (const d of docs) {
  [...d.html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)].forEach((m) => inputs.push({ file: d.file, doc: d.html, m }));
}
const unlabelled = inputs.filter(({ doc, m }) => {
  const [, , attrs] = m;
  if (/type="(hidden|submit|button)"/.test(attrs)) return false;
  const id = (attrs.match(/\sid="([^"]+)"/) || [])[1];
  return !id || !new RegExp(`for="${id}"`).test(doc);
});
unlabelled.length
  ? err('Campos sin <label for>: ' + unlabelled
      .map(({ file, m }) => file + ' → ' + ((m[2].match(/\sid="([^"]+)"/) || [, '(sin id)'])[1]))
      .join(', '))
  : ok(inputs.length + ' campos, todos etiquetados');
/* ---------- 10. Encabezados ---------- */
console.log('\n[10] Jerarquía de encabezados');
let headingIssues = 0;
for (const d of docs) {
  const levels = [...d.html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  const jumps = levels.filter((l, i) => i > 0 && l - levels[i - 1] > 1);
  const h1 = levels.filter((l) => l === 1).length;
  if (h1 !== 1) { err(d.file + ': ' + h1 + ' elementos h1 (debe haber exactamente 1)'); headingIssues++; }
  if (jumps.length) { err(d.file + ': saltos en la jerarquía h1-h6'); headingIssues++; }
}
if (!headingIssues) ok(docs.length + ' páginas con un solo h1 y sin saltos de nivel');

/* ---------- 11. JSON-LD ---------- */
console.log('\n[11] Datos estructurados');
const ldBlocks = [...allHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
let ldOk = 0;
ldBlocks.forEach(([, json]) => {
  try {
    const data = JSON.parse(json);
    ldOk++;
    if (Array.isArray(data['@graph'])) console.log('  ok      @graph: ' + data['@graph'].map((n) => n['@type']).join(', '));
    else console.log('  ok      ' + data['@type']);
  } catch (e) {
    err('JSON-LD inválido: ' + e.message);
  }
});
if (!ldBlocks.length) err('No hay JSON-LD');
else ok(ldBlocks.length + ' bloques, ' + ldOk + ' parsean');

/* ---------- 12. Sincronización de la configuración ---------- */
console.log('\n[12] Configuración centralizada');
const legales = PAGES.filter((p) => p.includes("/"));
if (!legales.length) {
  warn('No se encontró el grupo de páginas legales');
} else {
  const cfg = require('../assets/js/site-data.js');
  const required = ['SITE_URL', 'CANONICAL_URL', 'COMPANY_LEGAL', 'PRICING_DATA', 'LEGAL_LINKS', 'META_BRAND'];
  const missingKeys = required.filter((k) => !(k in cfg));
  missingKeys.length
    ? err('site-data.js no exporta: ' + missingKeys.join(', '))
    : ok('site-data.js exporta las ' + required.length + ' secciones requeridas');

  /* El canonical del HTML debe ser exactamente el de la config.
     Hay dos estados legítimos:
       - CANONICAL_URL resuelto: el HTML lo lleva y ambos coinciden.
       - CANONICAL_URL vacío (no hay SITE_URL): el HTML no debe llevar
         canonical, porque cualquier valor sería inventado. Es el estado
         seguro en local; de que no se publique así se encarga
         tools/check-env.js, que sí falla. */
  /* El canonical ya no es uno por sitio: hay nueve páginas y cada una
     declara el suyo. Comprobarlo solo contra index.html daba un "correcto"
     que no significaba nada, porque las otras ocho podrían llevar el canonical
     de la portada y pasarían inadvertidas. Ahora se comparan todos contra la
     configuración, que es lo que tiene que ser verdad. */
  const canonicos = [];
  for (const d of docs) {
    const c = (d.html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    const o = (d.html.match(/<meta property="og:url" content="([^"]+)"/) || [])[1];
    if (c) canonicos.push({ file: d.file, c, o });
  }

  if (cfg.CANONICAL_URL) {
    const base = cfg.CANONICAL_URL.replace(/\/$/, "");
    let bad = 0;
    for (const { file, c, o } of canonicos) {
      /* El canonical esperado sale de la RUTA del fichero, no de una regla
         aparte: las cinco públicas son `base/archivo.html` y las cuatro
         legales son `base/directorio/` con barra final, porque cada una vive
         en su carpeta. La portada es el caso aparte: su ruta es la raíz, así
         que el esperado es el propio `base` sin nada detrás. Se comparan tras
         quitar la barra final a los dos lados, ya que `pagina/` y `pagina` son
         la misma URL y fallar por eso sería tirar el resultado. */
      const ruta = file.replace(/index\.html$/, '').replace(/\/$/, '');
      const esperado = ruta ? base + '/' + ruta : base;
      if (c.replace(/\/$/, '') !== esperado.replace(/\/$/, '')) {
        err(file + ': canonical desincronizado. HTML: ' + c + ' | esperado: ' + esperado);
        bad++;
      }
      if (o !== c) { err(file + ': og:url (' + o + ') no coincide con su canonical (' + c + ')'); bad++; }
    }
    if (!bad) ok(canonicos.length + ' canonicales sincronizados con la config');
  } else {
    canonicos.length
      ? err('hay canonical en ' + canonicos.length + ' páginas sin SITE_URL resuelto: serían URLs inventadas')
      : ok('sin canonical: SITE_URL no está resuelto, y es preferible a inventar uno');
  }

  /* Ningún placeholder puede quedarse sin rellenar. */
  const leftovers = [...allHtml.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  [...new Set(leftovers)].length
    ? err('Tokens sin sustituir: ' + [...new Set(leftovers)].join(', '))
    : ok('sin tokens pendientes');

  /* example.com no debe sobrevivir a la publicación. */
  {
    const example = [...allHtml.matchAll(/https:\/\/(www\.)?example\.com/g)].length;
    example ? warn(example + ' referencias a example.com (cambiar en site-data.js)') : ok('sin referencias a example.com');
  }

  /* La config y el HTML no pueden desincronizarse. */
  const { execFileSync } = require('child_process');
  try {
    const out = execFileSync(
      process.execPath,
      [path.join(root, 'tools', 'sync-config.js'), '--check'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    ok(out.trim().split('\n')[0]);
  } catch (e) {
    err('site-data.js no está sincronizado con el HTML: ejecuta node tools/sync-config.js');
  }
}

/* ---------- 13. Catálogo ---------- */
console.log('\n[13] Catálogo de sets');

/* El catálogo tiene su propia página. Antes se leía index.html, que ya no
   lleva las tarjetas, así que el recuento salía a cero y las comprobaciones
   de este apartado no tenían nada que mirar. Se lee catalogo.html. */
const catHtml = docs.find((d) => d.file === 'catalogo.html');
if (!catHtml) {
  err('falta catalogo.html, que es donde vive el catálogo');
} else {
  const html = catHtml.html;

  const cards = [...html.matchAll(/<article class="[^"]*\bsetcard\b[^"]*"[^>]*data-set-id="(\d+)"[^>]*>/g)];
  const setIds = [...new Set(cards.map((m) => m[1]))];

  /* Cada set declarado en site-data.js tiene que tener su tarjeta, y al revés.
     Es el fallo que más fácil se cuela: se añade un set a los datos y el HTML
     regenerado no lo recoge, o al revés. */
  const dataIds = [...siteData.matchAll(/^\s*\{\s*id:\s*'(\d+)'/gm)].map((m) => m[1]);

  /* El número de fichas se compara contra los datos, no contra un número fijo
     escrito aquí. Con «12» hardcodeado, añadir un set obligaba a acordarse de
     cambiar la constante, y la suite empezó a fallar —el primer día hubo
     treinta y pico aserciones dando a 12— por el motivo equivocado. Ahora el
     único fallo que queda aquí es el que de verdad importa: que el HTML y la
     configuración no coincidan. */
  const expectedSets = dataIds.length;
  setIds.length === expectedSets
    ? ok(`${expectedSets} tarjetas de set: ` + setIds.join(', '))
    : err(`Se esperaban ${expectedSets} tarjetas de set, hay ${setIds.length}`);

  const missingCard = dataIds.filter((id) => !setIds.includes(id));
  const orphanCard = setIds.filter((id) => !dataIds.includes(id));
  missingCard.length ? err('Sets en site-data.js sin tarjeta: ' + missingCard.join(', '))
    : ok('cada set de site-data.js tiene tarjeta');
  orphanCard.length ? err('Tarjetas sin set en site-data.js: ' + orphanCard.join(', '))
    : ok('ninguna tarjeta huérfana');

  /* Los chips de categoría tienen que cubrir todas las que usan las tarjetas. */
  const chipKeys = [...html.matchAll(/data-filter="([a-z-]+)"/g)].map((m) => m[1]);
  const cardCats = [...new Set([...html.matchAll(/class="[^"]*\bsetcard\b[^"]*"[^>]*data-category="([a-z-]+)"/g)].map((m) => m[1]))];
  const catless = cardCats.filter((c) => !chipKeys.includes(c));
  catless.length ? err('Categorías sin chip de filtro: ' + catless.join(', '))
    : ok(cardCats.length + ' categorías con filtro: ' + cardCats.join(', '));

  html.includes('id="set-grid"') ? ok('rejilla #set-grid presente') : err('falta la rejilla #set-grid');

  /* El precio y el contador se muestran siempre desde los datos, nunca escritos
     a mano en el HTML: es lo que evita que se desincronicen. Se cuenta por set y
     no por celda, porque el precio aparece en dos sitios (la tarjeta y su
     artículo) y contarlos dos veces daría un total que no existe. */
  const priceBySet = cards.map((m) => (m[0].match(/data-price="([^"]*)"/) || [])[1]);
  const pendingSets = priceBySet.filter((p) => p === '' || p === undefined).length;
  const pricedSets = priceBySet.length - pendingSets;
  ok(priceBySet.length + ' sets con precio generado: ' + pricedSets + ' con importe, ' + pendingSets + ' pendientes');
  pendingSets === 1 ? ok('un único set sin precio, como está declarado en los datos') : warn(pendingSets + ' sets sin precio');

  /* El resumen de piezas del encabezado tiene que cuadrar con las tarjetas. */
  const sumPieces = cards.reduce((n, m) => {
    const block = html.slice(m.index, m.index + 2000);
    const p = block.match(/data-pieces="(\d*)"/);
    return n + (p && p[1] ? parseInt(p[1], 10) : 0);
  }, 0);
  const declaredPieces = (html.match(/data-count-pieces>(\d[\d.]*)</) || [])[1];
  const norm = (s) => parseInt(String(s).replace(/\./g, ''), 10);
  norm(declaredPieces) === sumPieces
    ? ok('total de piezas coherente: ' + declaredPieces)
    : err('total de piezas descuadrado: encabezado ' + declaredPieces + ' vs tarjetas ' + sumPieces);

  /* Los recuentos escritos a mano en el texto. El hero, el meta y el título
     se generan hoy desde los datos, pero el archivo es HTML estático con
     partes escritas a mano y basta con editar el generador o añadir un set
     para que vuelvan a desincronizarse. Esta comprobación no espera que nadie
     se acuerde: busca cualquier mención a un total de sets o de categorías
     que no sea el de la configuración, y la señala como error, no como aviso.
     Se ignoran las apariciones legítimas: el 12 de "12.060 piezas" (la
     Sagrada Família), las coordenadas de los SVG y los ids de los sets. */
  const totalSets = cards.length;
  const totalCats = new Set(cards.map((m) => {
    const block = html.slice(m.index, m.index + 2000);
    return (block.match(/data-category="([^"]*)"/) || [])[1];
  })).size;

  const prosa = allHtml
    /* Se quita todo lo generado a partir de los datos (data-* y JSON-LD) para
       no marcar los atributos que llevan el número correcto. */
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ' ')
    .replace(/data-[a-z-]+="[^"]*"/g, ' ')
    .replace(/viewBox="[^"]*"|d="[^"]*"|points="[^"]*"|x="[^"]*"|y="[^"]*"/g, ' ')
    /* Y las cifras de referencia que no son un total: los ids de set
       (21065) y los números de piezas con punto de millar (12.060). */
    .replace(/(?<![\d.,])\d{1,2}\.\d{3}(?![\d])/g, ' ')
    .replace(/(?:set |#set-|nº |numero )\d{4,6}\b/gi, ' ');

  /* Solo se comprueban las menciones que hablan del TOTAL del catálogo:
     "18 sets de LEGO", "Los 18 sets del catálogo", "dieciocho sets".
     Una cifra suelta seguida de "sets" NO se comprueba, porque en temas.html
     cada tarjeta dice cuántos sets tiene SU categoría ("4 sets", "5 sets") y
     en la portada "los 4 más grandes" habla de la vista previa, no del
     catálogo. Con el patrón `\d+ sets` sin más, cada tarjeta salía como
     error y el apartado llevaba quince errores que no eran errores: la
     comprobación había dejado de distinguir "el total" de "una parte". */
  const patrones = [
    [/\b(\d{1,3})\s+sets\s+de\s+LEGO/gi, 'total de sets', (n) => parseInt(n, 10) === totalSets],
    [/\bLos\s+(\d{1,3})\s+sets\s+del\s+catálogo\b/gi, 'total de sets', (n) => parseInt(n, 10) === totalSets],
    [/\bLos\s+(\d{1,3})\s+sets\b(?!\s+(?:m[aá]s|de\s|por\b|del?\s+nuevo))/gi, 'total de sets', (n) => parseInt(n, 10) === totalSets],
    [/\b(\d{1,3})\s+categor(?:ías|ias)\b/gi, 'total de categorías', (n) => parseInt(n, 10) === totalCats],
  ];
  const EN_LETRAS = ['Cero', 'Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez',
    'Once', 'Doce', 'Trece', 'Catorce', 'Quince', 'Dieciséis', 'Diecisiete', 'Dieciocho', 'Diecinueve', 'Veinte'];
  patrones.push([
    new RegExp('\\b(' + EN_LETRAS.join('|') + ')\\s+sets\\b', 'gi'),
    'total de sets',
    (palabra) => EN_LETRAS.indexOf(palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase()) === totalSets,
  ]);
  patrones.push([
    new RegExp('\\b(' + EN_LETRAS.join('|') + ')\\s+temas\\b', 'gi'),
    'total de categorías',
    (palabra) => EN_LETRAS.indexOf(palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase()) === totalCats,
  ]);

  let copias = 0;
  for (const [re, que, correcto] of patrones) {
    for (const m of prosa.matchAll(re)) {
      if (correcto(m[1])) continue;
      copias++;
      err('el texto dice "' + m[0].trim() + '" pero hay ' + totalSets + ' sets y ' + totalCats + ' categorías (' + que + ')');
    }
  }
  copias === 0
    ? ok('ningún texto suelto repite un total distinto al de los datos (' + totalSets + ' sets, ' + totalCats + ' categorías)')
    : null;

}
/* ---------- Resumen ---------- */
console.log('\n' + '='.repeat(58));
console.log(errors ? `  ${errors} ERROR / ${warnings} aviso` : `  Sin errores · ${warnings} avisos`);
console.log('='.repeat(58));
process.exit(errors ? 1 : 0);
