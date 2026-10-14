/* tools/scaffold-pages.js
   ------------------------------------------------------------------
   Crea las páginas públicas del sitio a partir de index.html.

   Por qué existe: las cinco páginas comparten el sprite de iconos, la
   cabecera, el pie y el diálogo del visor 3D. Copiar ese bloque a mano en
   cada fichero es la forma más corta de que las copias se separen: el día
   que se añada un icono o se cambie un enlace del pie, cuatro de las cinco
   páginas seguirán con la versión antigua sin que nada lo indique.

   Este script NO genera el contenido. Extrae el chrome de index.html y lo
   vuelve a escribir, byte a byte, alrededor de los marcadores site:* que
   luego rellena sync-config.js. El contenido de cada página (los bloques
   THEMES, LEVELS, GUIDE…) sigue siendo responsabilidad del generador.

   Cuándo hay que volver a ejecutarlo: solo cuando se añaden o renombran
   páginas, o cuando se cambia el chrome de index.html. No hace falta
   ejecutarlo tras editar contenido, porque el contenido no vive aquí.

       node tools/scaffold-pages.js          crea lo que falte
       node tools/scaffold-pages.js --force  reescribe las cuatro
   ------------------------------------------------------------------ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FORCE = process.argv.includes('--force');
const CFG = require(path.join(ROOT, 'assets/js/site-data.js'));

const CRLF = '\r\n';

/* ---------- 1 · Trocear index.html ---------- */

const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
/* El fichero es CRLF. Si se parte solo por '\n' cada línea arrastra un '\r'
   final y cualquier ancla terminada en `$` deja de encontrar nada. */
const lines = src.split(/\r?\n/);

function find(re, from) {
  for (let i = from || 0; i < lines.length; i++) if (re.test(lines[i])) return i;
  return -1;
}

function need(idx, what) {
  if (idx < 0) throw new Error(`no se ha localizado ${what} en index.html`);
  return idx;
}

function slice(from, to, what) {
  need(from, what);
  need(to, `el final de ${what}`);
  if (to < from) throw new Error(`${what} sale hacia atrás (L${from + 1}..L${to + 1})`);
  return lines.slice(from, to + 1).join(CRLF);
}

const iHeadStart = need(find(/site:HEAD:start/), 'site:HEAD:start');
const iHeadEnd = need(find(/site:HEAD:end/), 'site:HEAD:end');
const iLdStart = need(find(/site:JSONLD:start/), 'site:JSONLD:start');
const iLdEnd = need(find(/site:JSONLD:end/), 'site:JSONLD:end');

/* Del principio del fichero hasta justo antes de site:HEAD:start: eso es
   el doctype, el <html>, el <head> y su contenido fijo. */
const headTop = slice(0, iHeadStart - 1, 'el preámbulo de <head>');
/* Lo que va entre el bloque HEAD y el JSON-LD: robots, favicon, fuentes y
   la hoja de estilos. */
const headBottom = slice(iHeadEnd + 1, iLdStart - 1, 'el cierre de <head>');
/* El JSON-LD vacío, que sync-config rellena. */
const jsonLd = slice(iLdStart, iLdEnd, 'el bloque JSON-LD');

const sprite = slice(
  need(find(/<svg class="u-sprite"/), 'el sprite de iconos'),
  need(find(/<\/svg>/, find(/<svg class="u-sprite"/)), 'el cierre del sprite'),
  'el sprite de iconos'
);

/* La cabecera lleva dentro los dos menús, que son contenido compartido y
   por eso van a marcadores. */
const headerRaw = slice(
  need(find(/<header class="header"/), 'la cabecera'),
  need(find(/<\/header>/), 'el cierre de la cabecera'),
  'la cabecera'
);

/* El pie entero, marcadores incluidos. */
const footer = slice(
  need(find(/<footer class="footer">/), 'el pie'),
  need(find(/<\/footer>/), 'el cierre del pie'),
  'el pie'
);

/* El diálogo del visor va fuera de <main>. Se coge desde el comentario que
   lo anuncia hasta justo antes de los <script>, que se emiten aparte. */
const iViewer = need(find(/id="viewer-3d"/), 'el diálogo del visor');
const iViewerComment = (() => {
  for (let i = iViewer; i > 0; i--) if (/^ {0,4}<!-- ={10,}/.test(lines[i])) return i;
  throw new Error('no se ha encontrado el comentario que anuncia al visor 3D');
})();
const iScripts = need(find(/<script src="assets\/js\/site-data\.js">/), 'el script de datos');
const viewer = slice(iViewerComment, iScripts - 1, 'el diálogo del visor');

/* ---------- 2 · Marcadores ---------- */

/* Un bloque vacío que el generador rellena después. Se emiten los dos
   comentarios porque `applyTokens` busca `:start`/`:end`: si falta uno, o
   falla la ejecución o deja el bloque entero sin sustituir. */
const mark = (name, indent) => {
  const p = ' '.repeat(indent || 0);
  return `${p}<!-- site:${name}:start -->${CRLF}${p}<!-- site:${name}:end -->`;
};

const sectionOpen = (n, titulo) => [
  `  <!-- ==================================================================`,
  `       ${n} · ${titulo.toUpperCase()}`,
  `       ================================================================== -->`,
].join(CRLF);

/* El acordeón vive en content/faq.html y se inyecta tal cual. No se genera
   desde JavaScript porque son seis respuestas en prosa: editarlas dentro de
   un array de cadenas es un sitio mucho peor para trabajar que un HTML, y
   el JSON-LD se construye leyéndolo de la página, así que no hay forma de
   que se desincronicen. Se lee antes de `PLANTILLAS` porque esa constante se
   evalúa al aparecer en el fichero, y ahí se usa su contenido. */
const FAQ_FILE = path.join(ROOT, 'content/faq.html');
const faqHtml = (() => {
  if (!fs.existsSync(FAQ_FILE)) {
    throw new Error('falta content/faq.html, que es donde vive el acordeón de preguntas');
  }
  /* Se quita el comentario de cabecera del fragmento: en la página no
     aporta nada y ocupa veinte líneas de HTML servido. */
  return fs.readFileSync(FAQ_FILE, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/^<!--[\s\S]*?-->\n/, '')
    .replace(/\s+$/, '')
    .split('\n')
    .map((x) => '        ' + x)
    .join(CRLF);
})();

/* ---------- 3 · Contenido propio de cada página ---------- */

const PLANTILLAS = {
  /* La portada es el caso raro: su hero no es el de las páginas interiores
     (lleva cifras generadas, un marco de imagen y una etiqueta), y encima
     tiene dos secciones que las demás no. Va como plantilla completa y no
     como caso especial de buildPage(), porque un `if (key === 'home')` en
     cinco sitios distintos acaba siendo peor de leer que repetir el
     esqueleto una vez. */
  home: {
    hero: null, /* se usa heroHome() */
    body: [
      sectionOpen(2, 'Destacados'),
      `  <section class="section section--alt" id="destacados" aria-labelledby="destacados-title">`,
      `    <div class="wrap">`,
      `      <div class="section-head">`,
      `        <p class="eyebrow">Destacados</p>`,
      `        <h2 id="destacados-title">Un set por estilo</h2>`,
      `        <p class="section-head__text">El más grande de cada categoría. Si no sabes por dónde empezar, empieza por el que más te guste de la foto.</p>`,
      `      </div>`,
      ``,
      `      <div class="set-grid set-grid--featured">`,
      mark('FEATURED', 8),
      `      </div>`,
      `    </div>`,
      `  </section>`,
      ``,
      sectionOpen(3, 'Adelanto del catálogo'),
      `  <section class="section" id="catalogo" aria-labelledby="catalogo-title">`,
      `    <div class="wrap">`,
      `      <div class="section-head">`,
      `        <p class="eyebrow">Catálogo</p>`,
      `        <h2 id="catalogo-title">Un adelanto, sin las dieciocho fichas.</h2>`,
      `      </div>`,
      ``,
      `      <p class="section-head__text">Los {{setsTotal}} sets están repartidos en cinco estilos. Estos son los cuatro más grandes; el resto, con filtros y ordenación, en su página.</p>`,
      ``,
      mark('CATALOG_PREVIEW', 6),
      `      <p class="section-foot">`,
      `        <a class="btn btn--ghost" href="catalogo.html">Ver los {{setsTotal}} sets${CRLF}          <svg class="btn__ico" aria-hidden="true"><use href="#ic-arrow"></use></svg>${CRLF}        </a>`,
      `      </p>`,
      `    </div>`,
      `  </section>`,
    ],
  },

  catalogo: {
    hero: {
      eyebrow: 'Catálogo de colección para adultos',
      title: 'Los <mark>18</mark> sets, con sus datos y su ficha.',
      sub: 'Filtra por categoría, ordena por lo que te interese y ábrele el visor 3D a cualquiera de ellos. Los datos de cada set salen de la ficha oficial del fabricante.',
    },
    body: [
      sectionOpen(1, 'Catálogo'),
      `  <section class="section" id="catalogo" aria-labelledby="catalogo-title">`,
      `    <div class="wrap">`,
      `      <div class="section-head">`,
      `        <p class="eyebrow">Catálogo</p>`,
      `        <h2 id="catalogo-title">Los ${mark('CATALOG_TITLE', 0)} del catálogo.</h2>`,
      `      </div>`,
      ``,
      mark('FILTERS', 6),
      ``,
      /* `countBlock()` devuelve el <p> entero, así que el marcador va solo:
         anidarlo dentro de otro <p> daría un <p> dentro de un <p>, que es
         HTML inválido y el navegador lo parte de forma imprevisible. */
      mark('CATALOG_COUNT', 6),
      ``,
      /* Aquí no va el aviso de afiliación. Se decidió que la explicación
         larga vive solo en transparencia.html, y que el resumen va en el pie
         de todas las páginas por igual: ponerlo además arriba en el catálogo
         hacía que la única página con el aviso en dos sitios fuera justo la
         que lo tiene delante de los 18 botones de compra. El aviso de marca
         suelta en el pie legal tampoco se repite. */
      `      <div class="catalog__grid" data-filters>`,
      mark('CATALOG', 8),
      `      </div>`,
      `    </div>`,
      `  </section>`,
    ],
  },

  temas: {
    hero: {
      eyebrow: 'Temas y estilos de construcción',
      title: 'Cinco maneras distintas de <mark>construir</mark>.',
      sub: 'Cada estilo tiene su motivo: hay quien quiere el reto de las miles de piezas y quien prefiere un ramo de tulipanes para una tarde. Aquí está cada uno, con lo que cuesta montarlo.',
    },
    body: [
      sectionOpen(1, 'Temas por categoría'),
      `  <section class="section" id="temas" aria-labelledby="temas-title">`,
      `    <div class="wrap">`,
      `      <div class="section-head">`,
      `        <p class="eyebrow">Temas</p>`,
      `        <h2 id="temas-title">Estilos de construcción</h2>`,
      `        <p class="section-head__text">Un set más grande no siempre es el más interesante. Estos son los cinco estilos y qué hay dentro de cada uno.</p>`,
      `      </div>`,
      ``,
      `      <div class="theme-grid">`,
      mark('THEMES', 8),
      `      </div>`,
      `    </div>`,
      `  </section>`,
      ``,
      sectionOpen(2, 'Niveles de complejidad'),
      `  <section class="section section--alt" id="niveles" aria-labelledby="niveles-title">`,
      `    <div class="wrap">`,
      `      <div class="section-head">`,
      `        <p class="eyebrow">Complejidad</p>`,
      `        <h2 id="niveles-title">Cuánto trabajo es cada uno</h2>`,
        `        <p class="section-head__text">Los cortes se han calculado a partir de los {{setsTotal}} del catálogo, por número de piezas.</p>`,
      `      </div>`,
      ``,
      `      <div class="level-grid">`,
      mark('LEVELS', 8),
      `      </div>`,
      `    </div>`,
      `  </section>`,
    ],
  },

  faq: {
    hero: {
      eyebrow: 'Guía de montaje',
      title: 'Antes de comprar, <mark>sabiendo</mark> lo que viene.',
      sub: 'Cuánto tarda cada set en montarse con calma, qué material necesitas y las dudas que más se repiten.',
    },
    body: [
      sectionOpen(1, 'Guía de montaje'),
      `  <section class="section" id="guia" aria-labelledby="guia-title">`,
      `    <div class="wrap wrap--narrow">`,
      `      <div class="section-head">`,
      `        <p class="eyebrow">Guía de montaje</p>`,
      `        <h2 id="guia-title">Cuánto tiempo lleva cada cosa</h2>`,
      `      </div>`,
      ``,
      mark('GUIDE', 6),
      `    </div>`,
      `  </section>`,
      ``,
      sectionOpen(2, 'Material necesario'),
      `  <section class="section section--alt" id="material" aria-labelledby="material-title">`,
      `    <div class="wrap wrap--narrow">`,
      `      <div class="section-head">`,
      `        <p class="eyebrow">Material</p>`,
      `        <h2 id="material-title">Lo que hay que tener encima de la mesa</h2>`,
      `      </div>`,
      ``,
      `      <ul class="tool-grid">`,
      mark('GUIDE_TOOLS', 8),
      `      </ul>`,
      `    </div>`,
      `  </section>`,
      ``,
      sectionOpen(3, 'Preguntas frecuentes'),
      `  <section class="section" id="faq" aria-labelledby="faq-title">`,
      `    <div class="wrap wrap--narrow">`,
      `      <div class="section-head">`,
      `        <p class="eyebrow">Preguntas</p>`,
      `        <h2 id="faq-title">Dudas razonables sobre este catálogo.</h2>`,
      `      </div>`,
      ``,
      `      <div class="faq__list" id="faq-list">`,
      `        <!-- El acordeón se inyecta desde content/faq.html al escribir`,
      `             este fichero, y sync-config.js lo lee de aquí para montar`,
      `             el FAQPage del JSON-LD. Así el JSON-LD no puede contradecir`,
      `             al texto que ve la gente. -->`,
      faqHtml,
      `      </div>`,
      `    </div>`,
      `  </section>`,
    ],
  },

  transparencia: {
    hero: {
      eyebrow: 'Transparencia',
      title: 'Lo que este sitio <mark>hace</mark> y lo que no.',
      sub: 'Sin letra pequeña. Si algo de lo que ves aquí no cuadra con lo que te dice esta página, preferimos que nos lo señales.',
    },
    body: [
      sectionOpen(1, 'Transparencia'),
      `  <section class="section" id="transparencia" aria-labelledby="transparencia-title">`,
      `    <div class="wrap">`,
      `      <div class="section-head">`,
      `        <p class="eyebrow">Transparencia</p>`,
      `        <h2 id="transparencia-title">Dos columnas, sin adornos</h2>`,
      `        <p class="section-head__text">Un sitio de enlaces tiene una obligación con quien lee: decir qué hace y qué no. Aquí está, separado.</p>`,
      `      </div>`,
      ``,
      `      <div class="tsides">`,
      mark('TRANSPARENCY', 8),
      `      </div>`,
      `    </div>`,
      `  </section>`,
      ``,
      sectionOpen(2, 'Enlaces de afiliado'),
      `  <section class="section section--alt" id="afiliacion" aria-labelledby="afiliacion-title">`,
      `    <div class="wrap wrap--narrow">`,
      `      <div class="section-head">`,
      `        <p class="eyebrow">Afiliación</p>`,
      `        <h2 id="afiliacion-title">Qué pasa cuando pulsas un botón</h2>`,
      `      </div>`,
      ``,
      `      <div class="prose" id="afiliacion-prose">`,
      mark('AFFILIATE_LONG', 8),
      `      </div>`,
      `    </div>`,
      `  </section>`,
    ],
  },
};

/* ---------- 4 · Composición ---------- */

const HERO_IMAGE = [
  `        <div class="imgbox hero__img" data-img data-img-label="Pirámide de colección">`,
  `          <span class="imgbox__skeleton" aria-hidden="true"></span>`,
  /* El recorte cuadrado va en su propio archivo y no en un `object-fit` de CSS:
     el marco del hero es cuadrado y la panorámica, al caber entera dentro de
     un cuadrado, se quedaba con la pirámide diminuta en el centro. */
  `          <img class="imgbox__el" src="assets/img/hero-pyramid-cuadrada.jpg" width="575" height="575"`,
  `               loading="eager" decoding="async"`,
  `               alt="Ilustración de la pirámide de LEGO Icons" data-img-has-source="true">`,
  `          <noscript><span class="imgbox__fallback-note">Ilustración de la pirámide. <a href="assets/img/hero-pyramid-cuadrada.jpg">Abrir la imagen</a>.</span></noscript>`,
  `        </div>`,
].join(CRLF);

function buildHeader() {
  const nav = mark('NAV', 8);
  const drawer = [
    mark('NAV_DRAWER', 4),
    `    <a class="btn btn--brand btn--block nav-drawer__cta" href="catalogo.html">Ver el catálogo</a>`,
  ].join(CRLF);
  return headerRaw
    .replace(/<ul class="nav__list">[\s\S]*?<\/ul>/, `<ul class="nav__list">${CRLF}${nav}${CRLF}    </ul>`)
    .replace(/(<nav class="nav-drawer"[^>]*>)[\s\S]*?(<\/nav>)/,
      (all, open, close) => [open, drawer, close].join(CRLF))
    /* El botón de la cabecera llevaba `href="#catalogo"` escrito a mano, y en
       las páginas que no son el catálogo ese ancla no existe: el enlace se
       quedaba en la propia página sin hacer nada. Va a marcador y lo
       genera sync-config, que sí sabe en qué página está. */
    .replace(/<a class="btn btn--brand header__cta"[^>]*>[\s\S]*?<\/a>/,
      mark('HEADER_CTA', 4));
}

function buildFooter() {
  /* Las categorías del pie apuntan al catálogo con un filtro puesto, así que
     también son contenido: van a marcador. */
  const cats = mark('FOOTER_CATS', 10);
  const nav = mark('FOOTER_NAV', 10);
  return footer
    .replace(/(<nav aria-label="Categorías del catálogo">[\s\S]*?<ul class="footer__list">)[\s\S]*?(<\/ul>)/,
      (all, open, close) => [open, cats, close].join(CRLF))
    .replace(/(<nav aria-label="Información">[\s\S]*?<ul class="footer__list">)[\s\S]*?(<\/ul>)/,
      (all, open, close) => [open, nav, close].join(CRLF));
}

function buildHero(p) {
  return [
    `  <!-- ==================================================================`,
    `       HERO`,
    `       ================================================================== -->`,
    `  <section class="hero hero--page" aria-labelledby="hero-title">`,
    `    <div class="wrap hero__grid">`,
    `      <div class="hero__copy stack stack-5">`,
    `        <p class="eyebrow">${p.hero.eyebrow}</p>`,
    `        <h1 class="hero__title" id="hero-title">${p.hero.title}</h1>`,
    `        <p class="hero__sub" id="hero-sub">${p.hero.sub}</p>`,
    `        <div class="hero__actions">`,
    `          <a class="btn btn--brand" href="catalogo.html">Ver el catálogo`,
    `            <svg class="btn__ico" aria-hidden="true"><use href="#ic-arrow"></use></svg>`,
    `          </a>`,
    `          <a class="btn btn--ghost" href="temas.html">Ver los temas</a>`,
    `        </div>`,
    `      </div>`,
    `      <div class="hero__media">`,
    HERO_IMAGE,
    `      </div>`,
    `    </div>`,
    `  </section>`,
  ].join(CRLF);
}

/* El hero de la portada es distinto del de las páginas interiores: lleva las
   cifras generadas, un marco con etiquetas y no un simple <div class="imgbox">.
   Se emite aquí en vez de recortarse de index.html porque index.html es
   precisamente lo que este script escribe: leerlo para construirlo sería
   circular, y en cuanto alguien lo reescriba a mano el hero se quedaría con
   el contenido viejo. */
function heroHome() {
  return [
    `  <!-- ==================================================================`,
    `       1 · HERO`,
    `       ================================================================== -->`,
    `  <section class="hero hero--catalog" aria-labelledby="hero-title">`,
    `    <div class="wrap hero__grid">`,
    `      <div class="hero__copy stack stack-5">`,
    `        <p class="eyebrow">Catálogo de colección para adultos</p>`,
    ``,
    `        <h1 class="hero__title" id="hero-title">`,
    mark('HERO_TITLE', 10),
    `        </h1>`,
    ``,
    `        <p class="lead hero__sub">`,
    mark('HERO_SUB', 10),
    `        </p>`,
    ``,
    `        <div class="hero__actions">`,
    `          <a class="btn btn--brand" href="catalogo.html">`,
    `            Ver el catálogo`,
    `            <svg class="btn__ico" aria-hidden="true"><use href="#ic-arrow"></use></svg>`,
    `          </a>`,
    `          <a class="btn btn--ghost" href="transparencia.html">Qué es este sitio</a>`,
    `        </div>`,
    ``,
    mark('HERO_FACTS', 8),
    `      </div>`,
    ``,
    `      <div class="hero__frame imgbox" data-img data-img-label="Catálogo LEGO Icons">`,
    `        <span class="imgbox__skeleton" aria-hidden="true"></span>`,
    /* El `width`/`height` son los reales del archivo, no los de la caja: el
       marco tiene `aspect-ratio: 4 / 3` y el CSS pone `object-fit: contain`,
       así que son las dimensiones intrínsecas las que reservan el hueco y
       evitan el salto de maquetación mientras carga. */
    `        <img class="imgbox__el" src="assets/img/hero-pyramid.jpg" width="1024" height="575" fetchpriority="high" decoding="async"`,
    `             alt="Ilustración de la pirámide de LEGO Icons construida con piezas de colección.">`,
    `        <noscript>`,
    `          <span class="imgbox__fallback-note">Ilustración de la pirámide. <a href="assets/img/hero-pyramid.jpg">Abrir la imagen</a>.</span>`,
    `        </noscript>`,
    `        <p class="hero__tag hero__tag--tl">`,
    `          <span class="pill__dot" style="color:var(--red)" aria-hidden="true"></span>`,
    `          Catálogo <b>2026</b>`,
    `        </p>`,
    `      </div>`,
    `    </div>`,
    `  </section>`,
  ].join(CRLF);
}

function buildPage(key) {
  const p = PLANTILLAS[key];

  return [
    headTop,
    mark('HEAD'),
    headBottom,
    jsonLd,
    `</head>`,
    ``,
    `<body>`,
    `  <a class="skip-link" href="#main">Saltar al contenido</a>`,
    ``,
    sprite,
    ``,
    buildHeader(),
    ``,
    `<main id="main">`,
    `  <span id="top" tabindex="-1"></span>`,
    ``,
    key === 'home' ? heroHome() : buildHero(p),
    ``,
    p.body.join(CRLF),
    `</main>`,
    ``,
    buildFooter(),
    ``,
    viewer,
    ``,
    `<script src="assets/js/site-data.js"></script>`,
    `<script src="assets/js/main.js" defer></script>`,
    `</body>`,
    `</html>`,
    ``,
  ].join(CRLF);
}

/* ---------- 5 · Escritura ---------- */

let written = 0;
for (const key of Object.keys(PLANTILLAS)) {
  const file = path.join(ROOT, CFG.PAGES[key].file);
  if (fs.existsSync(file) && !FORCE) {
    console.log(`  ya existe, se deja como está: ${CFG.PAGES[key].file}  (--force para reescribirla)`);
    continue;
  }
  fs.writeFileSync(file, buildPage(key), 'utf8');
  console.log(`  creada ${CFG.PAGES[key].file}`);
  written++;
}
console.log(written ? `${written} página(s) creada(s)` : 'no había nada que crear');