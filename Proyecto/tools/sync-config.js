/* ======================================================================
   sync-config.js · Inyecta site-data.js en el HTML estático
   ======================================================================
   Lee assets/js/site-data.js y reescribe, en cada página que declare un
   bloque delimitado, el contenido entre:

       <!-- site:HEAD:start -->  ...  <!-- site:HEAD:end -->
       <!-- site:JSONLD:start --> ...  <!-- site:JSONLD:end -->
       <!-- site:FOOTER:start --> ...  <!-- site:FOOTER:end -->
       <!-- site:LEGAL:start --> ...  <!-- site:LEGAL:end -->

   Uso:
     node tools/sync-config.js          # reescribe los bloques
     node tools/sync-config.js --check  # solo verifica (sale 1 si hay diff)

   Modo --check: es lo que ejecuta tools/check.js, de forma que la
   configuración nunca puede quedar desincronizada del HTML.
   ====================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const cfg = require('../assets/js/site-data.js');

const ROOT = path.join(__dirname, '..');
const CHECK_ONLY = process.argv.includes('--check');

const D = cfg;
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const attr = (s) => esc(s);
/* Para contenido de <script type="application/ld+json"> hay que cortar
   cualquier secuencia que pueda cerrar la etiqueta antes de tiempo. */
const jsonLd = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');

/* ------------------------------------------------------------------ */
/* Catálogo: barra de filtros y tarjetas de los sets                   */
/* ------------------------------------------------------------------ */

/* Los botones de filtro y el <select> de orden se generan desde la
   configuración para que no haya que tocar el HTML al añadir un set. Los
   `data-*` de cada tarjeta son los que lee main.js para filtrar y ordenar:
   no se guarda estado en un array de JavaScript, se leen del DOM. */
function filtersBlock() {
  const cats = D.categories();
  const sum = D.catalogSummary();

  const chips = [
    `<button class="chip is-active" type="button" data-filter="all" aria-pressed="true">`,
    `  <span class="chip__label">Todos</span>`,
    `  <span class="chip__count">${sum.total}</span>`,
    `</button>`,
    ...cats.flatMap((c) => [
      `<button class="chip" type="button" data-filter="${attr(c.key)}" aria-pressed="false">`,
      `  <svg class="chip__ico" aria-hidden="true"><use href="#${attr(c.icon)}"></use></svg>`,
      `  <span class="chip__label">${esc(c.label)}</span>`,
      `  <span class="chip__count">${c.count}</span>`,
      `</button>`,
    ]),
  ].join('\n');

  return [
    `<!-- Filtros por categoría. El estado vive en aria-pressed: es lo que`,
    `     lee el AT, no solo el color del botón. -->`,
    `<div class="filters">`,
    `  <div class="filters__chips" role="group" aria-label="Filtrar por categoría">`,
    chips.split('\n').map((l) => '  ' + l).join('\n'),
    `  </div>`,
    `  <div class="filters__tools">`,
    `    <div class="field field--search">`,
    `      <label class="field__label" for="catalog-search">Buscar en el catálogo</label>`,
    `      <svg class="field__ico" aria-hidden="true"><use href="#ic-search"></use></svg>`,
    `      <input class="field__input" id="catalog-search" type="search" placeholder="Set 21065, Jaguar, botánica…"`,
    `             autocomplete="off" spellcheck="false" aria-describedby="catalog-count">`,
    `    </div>`,
    `    <div class="field field--sort">`,
    `      <label class="field__label" for="catalog-sort">Ordenar por</label>`,
    `      <select class="field__select" id="catalog-sort">`,
    `        <option value="featured">Destacados</option>`,
    `        <option value="pieces-desc">Más piezas</option>`,
    `        <option value="price-asc">Precio: de menor a mayor</option>`,
    `        <option value="price-desc">Precio: de mayor a menor</option>`,
    `        <option value="name-asc">Nombre (A-Z)</option>`,
    `      </select>`,
    `    </div>`,
    `  </div>`,
    `</div>`,
  ].join('\n');
}

/* Estado visible del contador. `aria-live="polite"` para que el cambio de
   "12 sets" a "3 sets" lo anuncie el lector de pantalla al filtrar. */
function countBlock() {
  const sum = D.catalogSummary();
  return [
    `<p class="catalog__count" id="catalog-count" role="status" aria-live="polite">`,
    `  <span data-count-sets>${sum.total}</span> sets`,
    `  <span class="catalog__count-sep" aria-hidden="true">·</span>`,
    `  <span data-count-pieces>${new Intl.NumberFormat(D.PRICING_DATA.locale).format(sum.pieces)}</span> piezas`,
    `</p>`,
  ].join('\n');
}

/* Hero. Los números del encabezado (cuántos sets, cuántas categorías,
   cuántas piezas) estaban escritos a mano en index.html y se quedaron
   atrás dos veces: ponían 12 sets, 4 categorías y 27.274 piezas cuando el
   catálogo ya tenía 18, 5 y 44.838. Nada avisaba de ello porque el
   contador del catálogo sí se generaba, así que la página llegaba
   diciendo dos cosas distintas a la vez. Se generan desde los datos. */
function heroBlock() {
  const sum = D.catalogSummary();
  const cats = D.categories();

  /* El titular ya no lleva el total en letras, así que la cuenta con
     `EN_LETRAS` desaparece con él. La cifra ya no aparece en el <h1>: el
     titular habla de algo emocional —"reconectar", "recuerdos"— y el dato
     queda justo debajo, en `HERO_FACTS`, que sí lo genera desde los datos.

     Es la misma razón por la que antes iba en letras y ahora no aparece:
     un número suelto en el titular se lee como una cifra más del catálogo y
     compite con las que hay dos líneas más abajo. La diferencia es que antes
     hacía falta decirlo y ahora basta con callarse: el dato sigue estando, dos
     párrafos más abajo, en `HERO_FACTS`, que lo genera desde los datos.

     El bloque se conserva aunque el titular ya no dependa de los datos porque
     un titular escrito a mano se queda viejo en cuanto el catálogo cambia, y
     eso ya pasó dos veces aquí (§heroBlock, comentario de arriba). */
  return [
    `<span class="line">${esc(sum.total)} sets para reconectar con lo que te apasiona.</span>`,
    `<span class="line grad-mark">Tus recuerdos, pieza a pieza.</span>`,
  ].join('\n');
}

function heroSubBlock() {
  const cats = D.categories();

  /* El subtítulo ya no enumera las cinco categorías. La versión anterior lo
     hacía con una lista generada —"Arquitectura, vehículos, cultura pop,
     botánica, arte"— y tenía dos problemas: pesa en un sitio donde se supone
     que se está contando una historia, y encima se desincronizaba en cuanto
     se añadía una sexta categoría o se renombraba una.

     Ahora el texto nombra cuatro temas como ejemplo y no pretende ser el
     inventario, que es lo que hace `HERO_FACTS` con las "5 categorías". Las
     dos cosas juntas no se contradicen porque una dice "cinco" y la otra no
     dice "estos son todos". */
  return [
    `Dieciocho historias para construir con calma. Desde arquitectura y vehículos`,
    `míticos hasta botánica y cultura pop. Te detallamos el número de piezas, edad,`,
    `tiempo estimado de montaje y precio oficial de referencia de cada set, con`,
    `absoluta transparencia y sin sorpresas.`,
  ].join('\n');
}

/* El encabezado del catálogo. Estaba escrito a mano ("Los 12 sets") y es el
   único sitio donde quedaba uno por corregir: el resto de la página ya la
   genera el bloque del hero y el contador. El marcador va *dentro* del texto
   para que solo se sustituya la cifra y el resto de la frase siga siendo
   editable a mano. */
function catalogTitleBlock() {
  return String(D.catalogSummary().total);
}

function heroFactsBlock() {
  const sum = D.catalogSummary();
  const cats = D.categories();
  const nf = new Intl.NumberFormat(D.PRICING_DATA.locale);
  const hechos = [
    [String(sum.total), 'sets en catálogo'],
    [String(cats.length), 'categorías'],
    [nf.format(sum.pieces), 'piezas en total'],
    ['0', 'encargos por aquí'],
  ];
  return [
    `<ul class="hero__facts" role="list">`,
    ...hechos.flatMap(([n, l]) => [
      `  <li>`,
      `    <span class="hero__fact-n">${esc(n)}</span>`,
      `    <span class="hero__fact-l">${esc(l)}</span>`,
      `  </li>`,
    ]),
    `</ul>`,
  ].join('\n');
}

/* Aviso de afiliación. Va UNA vez, junto al catálogo, y no en cada tarjeta:
   repetirlo doce veces es ruido que el lector aprende a ignorar. Es
   obligación declarar la relación comercial con el fabricante, y además el
   `rel="sponsored"` de los CTA solo significa algo si el aviso es visible. */
/* ------------------------------------------------------------------ */
/* Bloques de las páginas nuevas                                        */
/* ------------------------------------------------------------------ */

/* Temas: una tarjeta por categoría, con su icono, sus números y el set más
   grande de cada estilo. El "más grande" se elige por piezas, que es el dato
   que el visitante ya ve en el catálogo y por el que se puede ordenar, así
   que no introduce un criterio invisible.

   El párrafo de cada tarjeta es el `description` que ya declara la categoría,
   no un texto nuevo: las cinco categorías describiéndose a sí mismas en dos
   sitios distintos es la forma más rápida de que un día digan dos cosas
   distintas. */
function themesBlock() {
  const cats = D.categories();
  const sets = D.sets();

  return cats.map((cat) => {
    const inCat = sets.filter((s) => s.category === cat.key);
    /* El set con más piezas es el que mejor resume la categoría: el que más
       trabajo da y el que la gente busca cuando filtró por ese estilo. */
    const top = inCat.slice().sort((a, b) => (b.pieces || 0) - (a.pieces || 0))[0];
    const hours = inCat
      .map((s) => s.buildHoursEstimated)
      .filter((h) => h != null);
    const media = hours.length
      ? Math.round(hours.reduce((a, b) => a + b, 0) / hours.length)
      : null;

    const stats = [
      `<div class="themecard__stat"><span class="themecard__stat-n">${inCat.length}</span><span class="themecard__stat-l">${inCat.length === 1 ? 'set' : 'sets'}</span></div>`,
      `<div class="themecard__stat"><span class="themecard__stat-n">${new Intl.NumberFormat(D.PRICING_DATA.locale).format(inCat.reduce((a, s) => a + (s.pieces || 0), 0))}</span><span class="themecard__stat-l">piezas</span></div>`,
    ];
    if (media != null) {
      stats.push(`<div class="themecard__stat"><span class="themecard__stat-n">${media} h</span><span class="themecard__stat-l">de media</span></div>`);
    }

    return [
      `<article class="themecard reveal" id="tema-${attr(cat.key)}" style="--delay:${(cats.indexOf(cat) * 70)}ms">`,
      `  <div class="themecard__top">`,
      `    <span class="icon-badge themecard__icon"><svg aria-hidden="true"><use href="#${attr(cat.icon)}"></use></svg></span>`,
      `    <div>`,
      `      <h3 class="themecard__title">${esc(cat.label)}</h3>`,
      `      <p class="themecard__count">${inCat.length} ${inCat.length === 1 ? 'set' : 'sets'} en el catálogo</p>`,
      `    </div>`,
      `  </div>`,
      `  <p class="themecard__text">${esc(cat.description || '')}</p>`,
      `  <div class="themecard__stats">`,
      stats.map((s) => `    ${s}`).join('\n'),
      `  </div>`,
      top ? [
        `  <div class="themecard__top-set">`,
        `    <span class="themecard__top-label">El más grande del estilo</span>`,
        `    <a class="themecard__top-link" href="catalogo.html#set-${attr(top.id)}">`,
        `      <span class="themecard__top-name">${esc(top.name)}</span>`,
        `      <span class="themecard__top-meta">${esc(top.buildHoursLabel || '')}</span>`,
        `      <svg aria-hidden="true"><use href="#ic-arrow"></use></svg>`,
        `    </a>`,
        `  </div>`,
      ].join('\n') : '',
      `  <a class="themecard__link" href="catalogo.html?categoria=${attr(cat.key)}">`,
      `    Ver los ${inCat.length} ${inCat.length === 1 ? 'set' : 'sets'} de ${esc(cat.label.toLowerCase())}`,
      `    <svg aria-hidden="true"><use href="#ic-arrow"></use></svg>`,
      `  </a>`,
      `</article>`,
    ].filter(Boolean).join('\n');
  }).join('\n');
}

/* Los tres niveles de dificultad que pide la página de temas. Se agrupan por
   número de piezas, que es el criterio que el catálogo ya muestra y el que la
   gente usa para decidir, y no por el campo `difficulty` de cada ficha: ese
   campo está declarado en seis sets de los dieciocho y usarlo dejaría fuera
   a la mitad del catálogo.

   El límite se calcula de los datos, no de un número escrito a mano. Si mañana
   entra un set de 15.000 piezas, tiene que subir solo a la categoría de
   arriba sin que nadie se acuerde de tocar este bloque. */
function difficultyLevels() {
  const sets = D.sets();
  const conPiezas = sets.filter((s) => s.pieces != null);

  /* Los cortes se leen de la distribución real en vez de inventarse: el
     proyecto largo es el tercio de más piezas, el intermedio lo que queda en
     el centro y el rápido el tercio de menos. Con 18 sets eso deja cortes
     redondos; si el catálogo crece, los terciles se recalculan solos. */
  const sorted = conPiezas.slice().sort((a, b) => a.pieces - b.pieces);
  const n = sorted.length;
  const pct = (p) => (n ? sorted[Math.min(n - 1, Math.floor(n * p))].pieces : 0);

  const nivelRapido = pct(0.33);
  const nivelLegendario = pct(0.75);

  const niveles = [
    {
      id: 'rapido',
      titulo: 'Construcciones rápidas',
      sub: 'Botánica y piezas sueltas',
      desc: 'Sets que se montan en una tarde, sin instrucciones largas. El mejor punto de entrada si hace años que no tocas un ladrillo.',
      icono: 'ic-leaf',
      max: nivelRapido,
      min: null,
    },
    {
      id: 'fin-de-semana',
      titulo: 'Desafíos de fin de semana',
      sub: 'Complejidad intermedia',
      desc: 'Varios cientos de piezas y un par de tardes. Son los que la gente termina siempre, porque el avance se nota.',
      icono: 'ic-clock',
      max: nivelLegendario,
      min: nivelRapido,
    },
    {
      id: 'legendario',
      titulo: 'Proyectos legendarios',
      sub: 'Meses de montaje',
      desc: 'De miles de piezas. No es un montaje, es un proyecto: se avanza durante meses y merece tener un sitio donde dejarlo a medias.',
      icono: 'ic-brick',
      max: null,
      min: nivelLegendario,
    },
  ];

  return niveles.map((lv, i) => {
    const miembros = conPiezas.filter((s) => {
      if (lv.min != null && s.pieces < lv.min) return false;
      if (lv.max != null && s.pieces > lv.max) return false;
      return true;
    });

    const rango = lv.min != null && lv.max != null
      ? `${new Intl.NumberFormat(D.PRICING_DATA.locale).format(lv.min)}–${new Intl.NumberFormat(D.PRICING_DATA.locale).format(lv.max)} piezas`
      : lv.min != null
        ? `desde ${new Intl.NumberFormat(D.PRICING_DATA.locale).format(lv.min)} piezas`
        : `hasta ${new Intl.NumberFormat(D.PRICING_DATA.locale).format(lv.max)} piezas`;

    return {
      ...lv,
      rango,
      miembros,
      total: miembros.length,
      delay: i * 70,
    };
  });
}

function difficultyBlock() {
  const niveles = difficultyLevels();
  const nf = new Intl.NumberFormat(D.PRICING_DATA.locale);

  return niveles.map((lv) => {
    /* Las horas son una estimación declarada en la ficha de cada set. Se
       suman en vez de promediarse porque el tiempo total de montar "el
       proyecto del año" es lo que el visitante quiere saber, no el promedio
       de tres set distintos. */
    const horas = lv.miembros.reduce((a, s) => a + (s.buildHoursEstimated || 0), 0);

    const ejemplos = lv.miembros
      .slice()
      .sort((a, b) => (b.pieces || 0) - (a.pieces || 0))
      .slice(0, 3)
      .map((s) => [
        `      <li class="levelcard__set">`,
        `        <a href="catalogo.html#set-${attr(s.id)}">`,
        `          <span class="levelcard__set-name">${esc(s.name)}</span>`,
        `          <span class="levelcard__set-meta">${nf.format(s.pieces || 0)} piezas · ${esc(s.buildHoursLabel || '')}</span>`,
        `        </a>`,
        `      </li>`,
      ].join('\n')).join('\n');

    return [
      `<article class="levelcard reveal" id="nivel-${attr(lv.id)}" style="--delay:${lv.delay}ms">`,
      `  <div class="levelcard__head">`,
      `    <span class="levelcard__badge levelcard__badge--${attr(lv.id)}">`,
      `      <svg aria-hidden="true"><use href="#${attr(lv.icono)}"></use></svg>`,
      `    </span>`,
      `    <div>`,
      `      <h3 class="levelcard__title">${esc(lv.titulo)}</h3>`,
      `      <p class="levelcard__sub">${esc(lv.sub)}</p>`,
      `    </div>`,
      `  </div>`,
      `  <p class="levelcard__text">${esc(lv.desc)}</p>`,
      `  <dl class="levelcard__specs">`,
      `    <div><dt>Rango</dt><dd>${esc(lv.rango)}</dd></div>`,
      `    <div><dt>En el catálogo</dt><dd>${lv.total} ${lv.total === 1 ? 'set' : 'sets'}</dd></div>`,
      horas > 0 ? `    <div><dt>Horas estimadas</dt><dd>${nf.format(horas)} h</dd></div>` : '',
      `  </dl>`,
      ejemplos ? [
        `  <ul class="levelcard__sets">`,
        `    <li class="levelcard__sets-label">Ejemplos</li>`,
        ejemplos,
        `  </ul>`,
      ].filter(Boolean).join('\n') : '',
      `</article>`,
    ].filter(Boolean).join('\n');
  }).join('\n');
}

/* ------------------------------------------------------------------ */
/* Transparencia                                                         */
/* ------------------------------------------------------------------ */

/* Las dos columnas de transparencia.html.

   Cada punto dice lo que es cierto y verificable, y en algunos casos lo que
   este sitio NO puede hacer. Se quitó el lenguaje de promesa automática
   ("verificamos ofertas en Amazon", "mantenemos el catálogo actualizado")
   porque nada en el código comprueba precios ni stock de forma continua:
   afirmar eso en una web pública es una declaración que no se puede sostener
   y, si alguna vez fuera falsa, el problema ya no sería de redacción.

   Lo que sí se afirma, y es verdad, es que los datos vienen de la ficha
   oficial del set, que los precios están marcados como referencia mientras no
   estén confirmados en España, y que los enlaces son de afiliado. */
function transparencyBlock() {
  const no = [
    ['No vendemos directamente', 'No hay carrito, ni caja, ni forma de pagar aquí. Cada botón te lleva a la tienda.'],
    ['No gestionamos envíos ni devoluciones', 'Si algo llega roto o te arrepientes, la reclamación va al minorista, no a nosotros. La garantía de LEGO la respeta quien te lo vendió.'],
    ['No inflamos los precios', 'Publicamos el precio oficial de referencia. Cuando un minorista lo baja, ese precio es el del minorista, no el nuestro.'],
    ['No vigilamos el stock en tiempo real', 'La disponibilidad que ves es la que consta en la ficha oficial del set. Puede haber cambiado en la tienda cuando pulses el enlace.'],
  ];

  const si = [
    ['Reunimos los datos de cada set oficial', 'Número de piezas, edad recomendada, año y constructor: salen de la ficha del fabricante, no de una descripción de tienda.'],
    ['Marcamos el precio como referencia cuando no está confirmado', 'El precio oficial cambia según el país. Mientras no lo hayamos confirmado en España, la etiqueta lo dice en vez de dejarlo parecer un dato verificado.'],
    ['Te llevamos al enlace, sin inventarnos nada', 'Los botones van a la ficha del producto. Si un set no tiene enlace, lo decimos en la tarjeta en lugar de poner un botón que no lleva a ninguna parte.'],
    ['El catálogo es gratis y sin registro', 'Puedes leerlo entero, filtrarlo y usarlo sin crear una cuenta ni dejar tus datos.'],
  ];

  const col = (titulo, intro, items, clase) => [
    `<section class="tside ${clase}" aria-labelledby="${clase}-title">`,
    `  <header class="tside__head">`,
    `    <span class="tside__icon"><svg aria-hidden="true"><use href="#${clase === 'tside--no' ? 'ic-alert' : 'ic-check-circle'}"></use></svg></span>`,
    `    <div>`,
    `      <h2 class="tside__title" id="${clase}-title">${esc(titulo)}</h2>`,
    `      <p class="tside__intro">${esc(intro)}</p>`,
    `    </div>`,
    `  </header>`,
    `  <ul class="tside__list">`,
    ...items.map(([t, d]) => [
      `    <li class="titem">`,
      `      <h3 class="titem__title">${esc(t)}</h3>`,
      `      <p class="titem__text">${esc(d)}</p>`,
      `    </li>`,
    ].join('\n')),
    `  </ul>`,
    `</section>`,
  ].join('\n');

  return [
    col('Lo que no hacemos', 'Lo que conviene saber antes de dar por hecho nada de lo que ves aquí.', no, 'tside--no'),
    col('Lo que sí hacemos', 'Lo que sí puedes esperar de este catálogo, y dónde mirar si algo no cuadra.', si, 'tside--yes'),
  ].join('\n\n');
}

/* La versión larga del aviso. Va en transparencia.html porque es la página
   que el visitante elige abrir cuando quiere saber de qué va esto, y porque
   ahí tiene sitio para explicarlo bien en vez de en una línea que se pasa por
   alto. En el pie queda un resumen que enlaza a esta sección. */
function affiliateLongBlock() {
  const a = D.AFFILIATE;
  const parrafos = [
    `Este sitio es un catálogo editorial. No vendemos Sets, no cobamos por verlos y no tenemos carrito. Cuando pulsas un botón de este catálogo, sales de aquí y aterrizas en la ficha del producto en la tienda de un tercero.`,
  ];

  /* La condición mira `active`, no la red. `network` está declarado aunque no
     haya ningún ID registrado, así que comprobar solo la red hacía que esta
     página anunciara una comisión que el sitio no cobra. Saying "cobramos
     comisión" cuando no se cobra es exactamente el tipo de letra pequeña
     que esta página existe para evitar. */
  if (a.active && a.network && a.network !== 'none') {
    parrafos.push(`<strong>Los enlaces de este catálogo son de afiliado.</strong> Si compras a través de ellos, el minorista puede pagarnos una comisión. Esa comisión no te la cobran a ti: no cambia el precio que pagas ni lo que te llega. El enlace es la única diferencia entre comprar aquí y comprar en la tienda.`);
  } else {
    parrafos.push(`<strong>Ahora mismo los enlaces no llevan identificación de afiliado.</strong> No cobramos comisión por ellos y no podemos atribuir ninguna venta a este sitio.`);
  }

  parrafos.push(`Lo que sí publicamos son datos públicos del producto: piezas, edad recomendada, año y precio oficial de referencia. El precio se etiqueta como referencia mientras no esté confirmado en el mercado español, porque un precio confirmado en otro país no es el precio que te van a cobrar aquí.`);

  return parrafos.map((p) => `  <p>${p}</p>`).join('\n');
}

/* ------------------------------------------------------------------ */
/* Guía de montaje                                                        */
/* ------------------------------------------------------------------ */

/* La guía no es un texto suelto: sale de los mismos datos que las fichas. Los
   totales de horas son la suma de las estimaciones declaradas en cada set, de
   modo que si alguien añade un set al catálogo, la guía se actualiza sola. */
function guideBlock() {
  const sets = D.sets();
  const conHoras = sets.filter((s) => s.buildHoursEstimated != null);
  const totalHoras = conHoras.reduce((a, s) => a + s.buildHoursEstimated, 0);
  const nf = new Intl.NumberFormat(D.PRICING_DATA.locale);
  const niveles = difficultyLevels();

  const tabla = niveles.map((lv) => {
    const horas = lv.miembros.reduce((a, s) => a + (s.buildHoursEstimated || 0), 0);
    return [
      `    <tr>`,
      `      <th scope="row">${esc(lv.titulo)}</th>`,
      `      <td>${esc(lv.rango)}</td>`,
      `      <td>${lv.total}</td>`,
      `      <td>${horas > 0 ? nf.format(horas) + ' h' : '—'}</td>`,
      `    </tr>`,
    ].join('\n');
  });

  return [
    `  <p>Antes de comprar nada conviene saber en qué te estás metiendo. El tiempo de montaje de un set de colección no se mide solo en piezas: un modelo de ${nf.format(20000)} piezas con pocas piezas repetidas se monta más rápido que uno de ${nf.format(3000)} con piezas únicas y pasos difíciles. Los datos de abajo son estimaciones, y están calculadas sumando lo que declara cada ficha.</p>`,
    `  <table class="gtable">`,
    `    <caption class="gtable__caption">Tiempo estimado por nivel de complejidad</caption>`,
    `    <thead>`,
    `      <tr><th scope="col">Nivel</th><th scope="col">Rango de piezas</th><th scope="col">Sets</th><th scope="col">Horas</th></tr>`,
    `    </thead>`,
    `    <tbody>`,
    tabla.join('\n'),
    `    </tbody>`,
    `    <tfoot>`,
    `      <tr><th scope="row">Todo el catálogo</th><td>—</td><td>${conHoras.length}</td><td>${nf.format(totalHoras)} h</td></tr>`,
    `    </tfoot>`,
    `  </table>`,
    `  <p class="guide__note">Las horas son una estimación de montaje tranquilo, no un mínimo. Montar de un tirón varias horas seguidas rara vez sale bien.</p>`,
  ].join('\n');
}

/* Lo mínimo que hay que tener encima de la mesa para empezar. Se declara en
   los datos, no aquí, porque es contenido y porque someday tendrá que
   aparecer también en la ficha de un set concreto. */
function guideToolsBlock() {
  return D.GUIDE.tools.map(([t, d]) => [
    `    <li class="toolcard">`,
    `      <h3 class="toolcard__title">${esc(t)}</h3>`,
    `      <p class="toolcard__text">${esc(d)}</p>`,
    `    </li>`,
  ].join('\n')).join('\n');
}

/* Ya no hay un bloque de aviso en el catálogo. El resumen corto lo emite
   `footerBlock()` en todas las páginas y el largo está en transparencia.html;
   una tercera copia del mismo texto era una cuarta cosa que actualizar al
   cambiar el aviso, y se acababa olvidando una. */

/* `cardClass` permite pintar la misma ficha con otra clase raíz sin duplicar
   el marcado. Existe porque la portada usa dos variantes: la tarjeta normal
   del catálogo y una más corta para los destacados, que no necesitan repetir
   el precio si justo se enseña el botón. Copiar el bloque entero para cambiar
   una clase es como las dos versiones se desincronizan al primer retoque. */
function setCard(set, i, cardClass) {
  const rootClass = cardClass || 'setcard';
  const alt = set.image
    ? `${set.name} (set ${set.id}), ${set.categoryLabel}. Fotografía del set.`
    : `${set.name} (set ${set.id}), ${set.categoryLabel}.`;

  /* Precio: el compareAt tachado solo aparece si los datos lo traen, y el
     "de referencia" se dice siempre que el precio no está confirmado en
     España. Un precio sin matiz es un precio que engaña. */
  let priceBlock;
  if (set.priceFormatted) {
    const strike = set.hasDiscount
      ? `<s class="setcard__was" data-price-was="${set.compareAtPrice}">${esc(set.compareAtFormatted)}</s>`
      : '';
    const tag = set.priceStatus === 'verificado'
      ? ''
      : `<span class="setcard__pricetag setcard__pricetag--unconfirmed" title="${attr(set.priceSource)}">precio de referencia</span>`;
    /* Descuento: el `compareAt` tachado solo se pinta si algún set declara
       un precio anterior real. Hoy ninguno lo hace, así que no hay badge de
       oferta: el rojo se usa para el precio sin confirmar, que sí existe.
       Se cablea solo el tachado, que es el dato que ya trae la ficha. */
    priceBlock = [
      `<p class="setcard__price">`,
      `  <span class="setcard__amount" data-price="${set.price}">${esc(set.priceFormatted)}</span>`,
      `  ${strike}${tag}`,
      `</p>`,
    ].filter(Boolean).join('\n');
  } else {
    priceBlock = [
      `<p class="setcard__price setcard__price--pending">`,
      `  <span data-price="">Precio pendiente</span>`,
      `  <span class="setcard__pricetag setcard__pricetag--unconfirmed">sin confirmar</span>`,
      `</p>`,
    ].join('\n');
  }

  /* CTA. Con `affiliateUrl` es un enlace externo; sin ella, texto plano que
     explica el estado. Un botón deshabilitado no es enfocable, así que un
     lector de pantalla ni lo mencionaría: se dice con texto.

     `rel="noopener sponsored"` en todos los CTA: `noopener` para que la
     pestaña nueva no reciba un handle de window.opener y `sponsored` porque
     son enlaces de pago. Un enlace de afiliado sin `sponsored` es un enlace
     de afiliado que no declara, que es exactamente lo que penaliza Google. */
  const cta = set.hasAffiliate
    ? [
      `<a class="btn btn--primary setcard__cta" href="${attr(set.affiliateUrl)}"`,
      `   target="_blank" rel="noopener sponsored"`,
      `   aria-label="Ver ${esc(set.name)} en la tienda oficial de LEGO (se abre en una pestaña nueva)">`,
      `  Ver en Tienda Oficial LEGO®`,
      `  <svg class="btn__ico" aria-hidden="true"><use href="#ic-external"></use></svg>`,
      `</a>`,
    ].join('\n')
    : [
      `<p class="setcard__pending">`,
      `  <svg class="setcard__pending-ico" aria-hidden="true"><use href="#ic-link"></use></svg>`,
      `  Enlace de tienda pendiente`,
      `</p>`,
    ].join('\n');

  const pieces = set.pieces != null
    ? `${new Intl.NumberFormat(D.PRICING_DATA.locale).format(set.pieces)} piezas`
    : 'Piezas por confirmar';

  /* Horas de montaje. `buildHoursLabel` ya trae el "aprox." y el
     "(estimadas)" cuando la cifra sale de `estimateBuildHours()`, así que
     aquí no se decide si es dato o estimación: solo se pinta. El atributo
     `title` con el origen evita además que el badge se lea como un dato de
     fábrica, que es justo lo que no es. */
  const buildHoursTitle = set.buildHoursEstimated
    ? 'Tiempo estimado a partir del número de piezas; no es un dato de LEGO'
    : 'Tiempo de montaje indicado para este set';
  const buildHours = [
    `<li class="setcard__hours" title="${attr(buildHoursTitle)}">`,
    `  <svg class="setcard__hours-ico" aria-hidden="true"><use href="#ic-clock"></use></svg>`,
    `  <span>${esc(set.buildHoursLabel)}</span>`,
    `</li>`,
  ].join('\n');

  /* El código de set va el primero porque es el identificador con el que la
     gente busca un set de LEGO: el nombre comercial está traducido a varios
     idiomas y el número no. Con un set sin piezas se dice "por confirmar" en
     lugar de inventar un número. */
  const meta = [
    `Set ${set.id} | ${pieces}`,
    set.ageMin != null ? `Desde ${set.ageMin} años` : null,
    set.releaseLabel,
  ].filter(Boolean);

  /* Botón del visor 3D. Es un `button` y no un enlace porque abre un
     diálogo y no navega. Va después del CTA y lleva el nombre del set en
     `aria-label`: hay 18 botones iguales en pantalla y sin el nombre un
     lector de pantalla anunciaría dieciocho "Explorar bloque" idénticos. */
  const viewer3d = [
    `<button type="button" class="btn btn--ghost setcard__3d" data-viewer-3d`,
    `        data-set-id="${attr(set.id)}" data-set-name="${attr(set.name)}"`,
    `        data-set-category="${attr(set.categoryLabel)}"`,
    `        data-set-pieces="${set.pieces != null ? set.pieces : ''}"`,
    `        aria-haspopup="dialog"`,
    `        aria-label="Explorar ${esc(set.name)} en 3D (abre un visor emergeente)">`,
    `  <svg class="btn__ico" aria-hidden="true"><use href="#ic-box3d"></use></svg>`,
    `  Vista 3D`,
    `</button>`,
  ].join('\n');

  /* El `id` solo lo llevan las tarjetas que son fichas del catálogo.
     En la portada el mismo set aparece dos veces: como destacado y dentro de
     la vista previa, y con id en las dos la página tenía `set-21065`
     repetido. Un id repetido es HTML inválido, rompe el ancla
     `catalogo.html#set-21065` (el navegador salta al primero) y además el
     `aria-labelledby` de un <article> puede acabar apuntando al título de
     otro. Los destacados no necesitan ancla propia: se llega a la ficha por
     el catálogo. Se usa un prefijo distinto para que, si algún día se
     necesita un ancla al destacado, exista sin colisionar. */
  const conId = rootClass === 'setcard';
  const idAttr = conId ? ` id="set-${attr(set.id)}"` : ` id="destacado-${attr(set.id)}"`;
  const tituloId = `${conId ? 'set' : 'destacado'}-${attr(set.id)}-title`;

  return [
    `<article class="glass ${rootClass} reveal"${idAttr} style="--delay:${(i % 4) * 60}ms"`,
    `         data-set-id="${attr(set.id)}" data-category="${attr(set.category)}"`,
    `         data-name="${attr(set.name.toLowerCase())}"`,
    `         data-pieces="${set.pieces != null ? set.pieces : ''}"`,
    `         data-price="${set.price != null ? set.price : ''}"`,
    `         data-build-hours="${attr(set.buildHoursLabel)}"`,
    `         data-year="${set.year}" data-availability="${attr(set.availability)}"`,
    `         aria-labelledby="${tituloId}">`,
    `  <div class="setcard__media imgbox" data-img data-img-label="Set ${attr(set.id)}">`,
    `    <span class="imgbox__skeleton" aria-hidden="true"></span>`,
    `    <img class="imgbox__el" src="${attr(set.image)}" width="640" height="480" loading="lazy" decoding="async"`,
    `         alt="${attr(alt)}" data-img-has-source="false">`,
    `    <noscript><span class="imgbox__fallback-note">` +
      `<a href="${attr(set.image)}">Abrir la imagen de ${esc(set.name)}</a>.</span></noscript>`,
    `    <p class="setcard__badge setcard__badge--${set.availability === 'PreOrder' ? 'soon' : 'now'}">`,
    `      ${esc(set.availabilityLabel)}`,
    `    </p>`,
    `  </div>`,
    `  <div class="setcard__body">`,
    `    <p class="setcard__cat">`,
    `      <svg aria-hidden="true"><use href="#${attr(set.categoryIcon)}"></use></svg>`,
    `      ${esc(set.categoryLabel)}`,
    `      <span class="setcard__ref">${esc(set.id)}</span>`,
    `    </p>`,
    `    <h3 class="setcard__title" id="${tituloId}">${esc(set.name)}</h3>`,
    `    <p class="setcard__summary">${esc(set.summary)}</p>`,
    `    <ul class="setcard__meta" role="list">`,
    meta.map((m) => `      <li>${esc(m)}</li>`).join('\n'),
    `      ${buildHours}`,
    `    </ul>`,
    priceBlock,
    `    ${cta}`,
    `    ${viewer3d}`,
    `  </div>`,
    `</article>`,
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Portada: destacados y adelanto del catálogo                          */
/* ------------------------------------------------------------------ */

/* Los destacados de la portada. No son los primeros del array ni los que
   tienen el precio más alto: se eligen por una regla que el visitante puede
   razonar, que es "uno de los más grandes de cada categoría". Poner en la
   portada los mismos cuatro sets que salen primero en el catálogo no aporta
   nada; poner uno por estilo sí, porque alguien que entra sin saber lo que
   busca no sabe por dónde empezar.

   Si una categoría se queda sin sets, la portada muestra menos tarjetas sin
   dejar un hueco vacío: el mapa es por categorías reales, no por las cinco
   que había al escribir esto. */
const FEATURED_PER_CATEGORY = 1;

function featuredSets() {
  const cats = D.categories();
  const sets = D.sets();
  const picked = [];
  for (const cat of cats) {
    const inCat = sets.filter((s) => s.category === cat.key);
    if (!inCat.length) continue;
    const top = inCat.slice().sort((a, b) => (b.pieces || 0) - (a.pieces || 0))[0];
    if (top) picked.push(top);
  }
  return picked.slice(0, FEATURED_PER_CATEGORY * cats.length);
}

function featuredBlock() {
  const sets = featuredSets();
  if (!sets.length) return '';
  return sets.map((s) => setCard(s, 0, 'featurecard').split('\n').map((l) => '    ' + l).join('\n'))
    .join('\n\n');
}

/* El adelanto del catálogo en la portada: cuatro tarjetas y un enlace al
   catálogo completo. Cuatro y no seis porque la portada no es un catálogo con
   más pasos: si aquí hay espacio para todo, no hay motivo para ir a la otra
   página, y entonces la segunda página no existe. */
const PREVIEW_COUNT = 4;

function catalogPreviewBlock() {
  const sets = D.sets().slice(0, PREVIEW_COUNT);
  if (!sets.length) return '';
  return [
    `    <div class="set-grid set-grid--preview">`,
    ...sets.map((s, i) => setCard(s, i, 'setcard').split('\n').map((l) => '      ' + l).join('\n')),
    `    </div>`,
    `    <p class="catalog__more">`,
    `      <a class="btn btn--brand btn--block" href="catalogo.html">`,
    `        Ver los ${D.catalogSummary().total} sets del catálogo`,
    `        <svg class="btn__ico" aria-hidden="true"><use href="#ic-arrow"></use></svg>`,
    `      </a>`,
    `    </p>`,
  ].join('\n');
}

function catalogBlock() {
  return [
    `<div class="set-grid" id="set-grid" data-total="${D.sets().length}">`,
    /* El índice se pasa a setCard porque el retardo escalonado de la entrada
       se calcula con él: sin el argumento, i era undefined y todas las
       tarjetas salían con --delay:NaNms, que el navegador descarta. */
    D.sets().map((s, i) => setCard(s, i).split('\n').map((l) => '  ' + l).join('\n')).join('\n\n'),
    `</div>`,
  ].join('\n');
}
/* ------------------------------------------------------------------ */
/* Bloques que generan contenido                                       */
/* ------------------------------------------------------------------ */

/* El canonical de cada página es el suyo. Antes las cuatro páginas legales
   declaraban el de la home, con lo que se les decía a los buscadores que
   eran duplicados de la portada y se consolidaban contra ella.

   Las cinco páginas públicas son ficheros planos, así que su URL acaba en
   `.html` y no en `/`. Las legales siguen siendo directorios con `index.html`
   y conservan la barra final, que es lo que hace que `/aviso-legal` y
   `/aviso-legal/` sean la misma página en un hosting estático. */
function canonicalFor(page) {
  if (!D.SITE_URL) return '';
  if (page.key === 'home') return D.CANONICAL_URL;
  if (page.dir) return D.url(page.slug + '/');
  return D.url(page.file);
}

function headBlock(page) {
  const og = D.META_BRAND.og;
  const tw = D.META_BRAND.twitter;
  const ogImage = D.url(og.image);
  const twImage = D.url(tw.image);
  const canonical = canonicalFor(page);

  /* Cada página lleva su propio título y su propia descripción, tomados de
     `PAGES`. Antes todas las páginas declaraban el `defaultTitle` de la
     portada, que es un problema serio en un sitio de cinco páginas: cuatro
     de ellas competían en Google con el mismo título y llegaban a la misma
     portada, que es justo lo contrario de lo que sirve para que cada una se
     posicione por lo suyo.

     Una página que no declare los suyos (por ejemplo, las legales, que no
     pasan por PAGES) cae en el título por defecto, que es el de la portada y
     por tanto no le queda bien: es mejor eso que un título inventado. */
  const meta = page.meta || {};
  const title = meta.title || D.META_BRAND.defaultTitle;
  const description = meta.description || D.META_BRAND.defaultDescription;
  const ogTitle = meta.ogTitle || title;
  const twTitle = meta.twTitle || title;

  /* canonical, og:url y las imágenes sociales solo se emiten si la URL se
     ha podido resolver. Publicar https://www.tudominio.com/lego-icons en un
     canonical es peor que no publicar canonical: Google lo indexa y el
     dominio se queda enganchado al sitio entero. Las metas de tamaño y alt
     acompañaban a la imagen, así que también se van con ella. */
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${attr(description)}">`,
  ];

  if (canonical) lines.push(`<link rel="canonical" href="${attr(canonical)}">`);

  lines.push(
    `<meta property="og:type" content="${attr(og.type)}">`,
    `<meta property="og:site_name" content="${attr(og.siteName)}">`,
    `<meta property="og:locale" content="${attr(og.locale)}">`
  );

  if (canonical) lines.push(`<meta property="og:url" content="${attr(canonical)}">`);

  lines.push(
    `<meta property="og:title" content="${attr(ogTitle)}">`,
    `<meta property="og:description" content="${attr(description)}">`
  );

  if (ogImage) {
    lines.push(
      `<meta property="og:image" content="${attr(ogImage)}">`,
      `<meta property="og:image:width" content="${attr(og.imageWidth)}">`,
      `<meta property="og:image:height" content="${attr(og.imageHeight)}">`,
      `<meta property="og:image:alt" content="${attr(og.imageAlt)}">`
    );
  }

  lines.push(
    `<meta name="twitter:card" content="${attr(tw.card)}">`,
    `<meta name="twitter:site" content="${attr(tw.site)}">`,
    `<meta name="twitter:creator" content="${attr(tw.creator)}">`,
    `<meta name="twitter:title" content="${attr(twTitle)}">`,
    `<meta name="twitter:description" content="${attr(description)}">`
  );

  if (twImage) {
    lines.push(
      `<meta name="twitter:image" content="${attr(twImage)}">`,
      `<meta name="twitter:image:alt" content="${attr(tw.imageAlt)}">`
    );
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* JSON-LD: Organization + WebSite + BreadcrumbList + ItemList/Product + FAQPage */
/* ------------------------------------------------------------------ */

/* Una imagen solo se emite si el fichero existe de verdad. Apuntar a
   assets/img/sets/21065.jpg mientras ese fichero no está es peor que no
   emitir `image`: da un 404 a Google y al crawler de cada tarjeta. */
function imageIfExists(relPath) {
  if (!relPath) return null;
  if (!fs.existsSync(path.join(ROOT, relPath))) return null;
  return D.url(relPath);
}

function buildProductNode(set) {
  const node = {
    '@type': 'Product',
    '@id': D.setId(set.id),
    name: 'LEGO ' + set.id + ' ' + set.name,
    sku: set.id,
    mpn: set.id,
    description: set.summary,
    category: D.PRODUCT_DATA.category,
    /* El fabricante es LEGO Group; `brand` es la marca del producto. */
    brand: { '@type': 'Brand', name: D.PRODUCT_DATA.manufacturer },
    manufacturer: { '@type': 'Organization', name: D.PRODUCT_DATA.manufacturer },
    material: D.PRODUCT_DATA.material,
    audience: {
      '@type': 'PeopleAudience',
      suggestedMinAge: set.ageMin != null ? set.ageMin : 18,
      suggestedMaxAge: D.PRODUCT_DATA.maxAge,
    },
    releaseDate: set.releaseDate,
  };

  /* schema.org no tiene una propiedad estándar para el número de piezas, así
     que se declara como `additionalProperty`, que es la forma válida de
     publicar un dato técnico propio del producto. Se emite solo si hay
     número conocido. */
  if (set.pieces != null) {
    node.additionalProperty = [{
      '@type': 'PropertyValue',
      name: 'Número de piezas',
      value: String(set.pieces),
    }];
  }

  const img = imageIfExists(set.image);
  if (img) node.image = [img];

  /* aggregateRating solo si algún día hay reseñas reales. Publicar un
     rating inventado es motivo de acción manual de Google. */
  if (D.PRODUCT_DATA.rating) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(D.PRODUCT_DATA.rating.value),
      reviewCount: String(D.PRODUCT_DATA.rating.reviewCount),
    };
  }

  /* Sin precio fiable NO se emite `offers`: un Offer sin `price` es inválido
     para Google y un precio estimado sería una mentira. El set aparece en el
     catálogo, pero sin oferta hasta que haya precio confirmado. */
    if (set.price != null) {
      /* `priceSpecification` documenta el precio por unidad (aquí, la caja
         completa) y es donde corresponde el precio anterior cuando exista:
         schema.org no define `compareAtPrice` en Offer, la forma válida es
         una entrada con `priceType` ListPrice. */
      const spec = [{
        '@type': 'UnitPriceSpecification',
        price: set.price.toFixed(2),
        priceCurrency: D.PRICING_DATA.currency,
      }];
      if (set.compareAtPrice != null && set.compareAtPrice > set.price) {
        spec.push({
          '@type': 'UnitPriceSpecification',
          priceType: 'https://schema.org/ListPrice',
          price: set.compareAtPrice.toFixed(2),
          priceCurrency: D.PRICING_DATA.currency,
        });
      }
      node.offers = {
        '@type': 'Offer',
        priceCurrency: D.PRICING_DATA.currency,
        price: set.price.toFixed(2),
        priceSpecification: spec,
        availability: 'https://schema.org/' + set.availability,
        itemCondition: 'https://schema.org/NewCondition',
        /* Apunta al destino real de la compra, que es lo que Google quiere
           para los listados de productos, y a la ficha propia cuando el set
           todavía no tiene enlace.

           Se usa la URL LIMPIA (`affiliateBase`) y no la etiquetada: meter un
           parámetro de seguimiento en los datos estructurados no aporta nada
           y es algo que Google desaconseja expresamente. El parámetro va en el
           enlace que pincha la gente, no en el JSON-LD. */
        url: set.affiliateBase || (D.url('/') + '#set-' + set.id),
      };
    }

  return node;
}

function buildGraph(page) {
  const B = D.META_BRAND;
  const ids = D.ids();
  const canonical = canonicalFor(page);
  const C = D.COMPANY_LEGAL;
  const list = D.sets();

  const graph = [
    {
      '@type': 'Organization',
      '@id': ids.organization,
      name: C.name,
      url: D.url('/'),
      email: C.email,
      address: D.postalAddress(),
      description: 'Catálogo de sets de construcción de colección para adultos: arquitectura, vehículos, cultura pop y botánica.',
    },
    {
      '@type': 'WebSite',
      '@id': ids.website,
      url: D.url('/'),
      name: B.siteName,
      inLanguage: 'es-ES',
      publisher: { '@id': ids.organization },
    },
  ];

  /* El pan de migas se emite en todas las páginas de contenido y refleja la
     posición real de cada una. Antes solo lo tenía la portada, y eso no era
     correcto ni por partes: el pan de migas sirve justamente en las páginas
     profundas, que son las que tiene la gente abierta en una pestaña nueva y
     sin contexto. Las legales no lo llevan porque su jerarquía es otra (son
     documentos legales, no contenido) y ahí el bloque es distinto. */
  if (page.isHome || page.meta) {
    const migas = [{ name: D.PAGES.home.nav, item: D.pageUrl('home') }];
    D.NAV_PAGES.forEach((key) => {
      if (key === 'home') return;
      migas.push({
        name: D.PAGES[key].nav,
        item: key === page.key ? canonical : D.pageUrl(key),
      });
    });

    graph.push({
      '@type': 'BreadcrumbList',
      '@id': ids.breadcrumb,
      itemListElement: migas.map((m, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: m.name,
        item: m.item,
      })),
    });
  }

  /* ItemList + un Product por set: solo en la página del catálogo, que es
     donde están las fichas. Se emitía antes en la portada, y con el
     catálogo movido a su propia página habría dejado de ser cierto: la
     portada no muestra los dieciocho sets, muestra cuatro. Declarar un
     ItemList de 18 elementos en una página que contiene 4 es un error que
     Google detecta, y además describe mal la página. */
  if (page.key === 'catalogo') {
    graph.push({
      '@type': 'ItemList',
      '@id': ids.itemList,
      name: 'Catálogo de sets LEGO® para adultos',
      numberOfItems: String(list.length),
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: list.map((set, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: set.name,
        url: D.setId(set.id),
        item: { '@id': D.setId(set.id) },
      })),
    });
    list.forEach((set) => graph.push(buildProductNode(set)));
  }

  /* Temas: la lista de categorías con su descripción, que es lo que la
     página declara y lo que hace que Google pueda entenderla como un índice
     de estilos y no como texto suelto. */
  if (page.key === 'temas') {
    graph.push({
      '@type': 'CollectionPage',
      '@id': D.url('/temas.html'),
      name: D.PAGES.temas.title,
      description: D.PAGES.temas.description,
      isPartOf: { '@id': ids.website },
      url: D.url('/temas.html'),
      hasPart: D.categories().map((c) => ({
        '@type': 'ItemPage',
        name: c.label,
        description: c.description,
        url: D.url('/temas.html#tema-' + c.key),
      })),
    });
  }

  /* FAQPage: las respuestas se leen del DOM para que el JSON-LD no pueda
     contradecir lo que el usuario ve. Solo en la página que las contiene. */
  const faq = readFaqFromDom();
  if (faq.length && page.key === 'faq') {
    graph.push({
      '@type': 'FAQPage',
      '@id': ids.faq,
      mainEntity: faq.map((qa) => ({
        '@type': 'Question',
        name: qa.q,
        acceptedAnswer: { '@type': 'Answer', text: qa.a },
      })),
    });
  }

  /* La portada deja de ser un catálogo, pero sigue siendo la página de
     entrada del sitio: se declara como WebPage para que el buscador la
     relacione con la portada y no con una ficha suelta. */
  if (page.isHome) {
    graph.push({
      '@type': 'WebPage',
      '@id': D.url('/#webpage'),
      url: canonical || D.url('/'),
      name: D.META_BRAND.defaultTitle,
      description: D.META_BRAND.defaultDescription,
      isPartOf: { '@id': ids.website },
      inLanguage: 'es-ES',
    });
  }

  return { '@context': 'https://schema.org', '@graph': finaliseGraph(graph) };
}

/* Sin URL resuelta, '@id' y 'url' son el esqueleto del grafo y no se pueden
   emitir: un '@id' vacío hace que las referencias internas del propio grafo
   apunten a la nada, y un 'url' con una ruta pero sin origen es una URL
   absoluta mal formada. Se quita el esqueleto entero —incluidas las
   referencias '@id' y los 'item' de cadena— y se deja todo lo demás, que
   sigue siendo útil: los tipos, los precios, la disponibilidad y el FAQ.

   En cuanto SITE_URL está resuelta, que es lo que pasa siempre que se
   despliega, esto no se ejecuta y el grafo sale entero. */
function finaliseGraph(graph) {
  if (D.CANONICAL_URL) return graph;

  const strip = (node) => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === '@id' || key === 'url') continue;
      if (key === 'item' && typeof value === 'string') continue;
      /* Una referencia interna es un objeto con '@id' y nada más. */
      if (value && typeof value === 'object' && !Array.isArray(value)
          && Object.keys(value).length === 1 && '@id' in value) continue;
      out[key] = strip(value);
    }
    return out;
  };

  return strip(graph);
}

/* El FAQ es un acordeón button/.faq__a (no <details>), así que se extrae
   del markup real. Leerlo del DOM garantiza que el JSON-LD nunca contradiga
   lo que el visitante ve.

   Se lee de la página que lo contiene, no de la portada: cuando el FAQ se
   movió a `preguntas-frecuentes.html`, seguir leyéndolo de `index.html`
   devolvía una lista vacía y el JSON-LD publicaba `mainEntity` sin nada
   dentro, que es un error silencioso: el HTML se veía bien y los datos
   estructurados se quedaban a medias. */
function readFaqFromDom() {
  const file = path.join(ROOT, D.PAGES.faq.file);
  if (!fs.existsSync(file)) return [];
  const html = fs.readFileSync(file, 'utf8');
  const out = [];
  const itemRe = /<div class="faq__item">([\s\S]*?)<div class="faq__a"[\s\S]*?<\/div>\s*<\/div>/g;
  let m;
  while ((m = itemRe.exec(html))) {
    const block = m[1];
    const q = (block.match(/<button class="faq__q"[\s\S]*?<span>([\s\S]*?)<\/span>/) || [])[1];
    /* El cuerpo de la respuesta empieza tras el div de apertura de .faq__a */
    const rest = m[0].slice(m[0].indexOf('class="faq__a"'));
    const a = (rest.match(/<div><p>([\s\S]*?)<\/p><\/div>/) || [])[1];
    if (!q || !a) continue;
    out.push({ q: text(q), a: text(a) });
  }
  return out;
}

const text = (frag) => frag
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/* ------------------------------------------------------------------ */
/* Navegación multipágina                                               */
/* ------------------------------------------------------------------ */

/* La barra de navegación se genera desde `PAGES` y se pinta idéntica en las
   cinco páginas. Escribirla a mano en cada HTML es exactamente el error que
   provoca que una de ellas se quede sin un enlace: el visitante llega a
   "Transparencia" desde el catálogo y no encuentra cómo volver.

   `current` marca la página en la que estamos, con `aria-current="page"`, que
   es lo que leen los lectores de pantalla para saber dónde están. La clase
   `is-current` la usa el CSS para pintar el enlace activo, y `is-current`
   es uno de los estados que check.js ya conoce.

   Se emiten dos bloques y no uno porque son dos elementos distintos con
   distinta semántica: la lista principal es un <ul> con nombre accesible, y
   el cajón móvil es un nav con enlaces sueltos porque en vertical no tiene
   sentido una lista con viñetas. Meter las dos cosas en un único marcador
   obligaría a dejar un `<!-- -->` en medio del HTML para poder sustituirlas
   por separado, y ese comentario es justo el tipo de cosa que se rompe en
   cuanto alguien reordena el marcado a mano. */
function navBlock(current) {
  return D.NAV_PAGES.map((key) => {
    const p = D.PAGES[key];
    const isCurrent = key === current;
    return `    <li><a class="nav__link${isCurrent ? ' is-current' : ''}" href="${attr(D.pageHref(key))}"${isCurrent ? ' aria-current="page"' : ''}>${esc(p.nav)}</a></li>`;
  }).join('\n');
}

function navDrawerBlock(current) {
  return D.NAV_PAGES.map((key) => {
    const p = D.PAGES[key];
    const isCurrent = key === current;
    return `  <a href="${attr(D.pageHref(key))}"${isCurrent ? ' aria-current="page"' : ''}>${esc(p.nav)}</a>`;
  }).join('\n');
}

/* El pie recibe los enlaces de las páginas públicas, para que desde cualquier
   página se pueda saltar a cualquier otra sin volver a la portada. El aviso de
   afiliación vive aquí y en transparencia.html, no en el catálogo: es
   obligatorio que sea visible, y un aviso que empuja a la ficha fuera de
   pantalla no cumple, pero uno repetido en cada tarjeta ahoga el contenido. */
function footerNavBlock() {
  return D.NAV_PAGES.map((key) => {
    const p = D.PAGES[key];
    return `  <li><a href="${attr(D.pageHref(key))}">${esc(p.nav)}</a></li>`;
  }).join('\n');
}

/* Las categorías del pie son atajos al catálogo con el filtro ya puesto. Se
   emiten en todas menos en la última categoría: son cinco estilos y el pie
   tiene cuatro huecos, porque una columna con cinco enlaces sí cabe pero
   empuja a la de Información a una altura que ya no se lee como una fila. */
function footerCatsBlock() {
  return D.categories().slice(0, 4).map((c) => {
    const href = D.path(D.pageHref('catalogo') + '#catalogo', 0);
    return `  <li><a href="${attr(href)}" data-jump-category="${attr(c.key)}">${esc(c.label)}</a></li>`;
  }).join('\n');
}

/* El botón de la cabecera. Apunta a la página del catálogo con su ruta real,
   no a un ancla: el ancla `#catalogo` solo existe dentro de catalogo.html, así
   que en las otras cuatro páginas el botón se quedaba quieto sin hacer nada
   y el validador lo señalaba como enlace roto. En el propio catálogo el
   destino es la misma página, que también es lo correcto. */
function headerCtaBlock() {
  return [
    `<a class="btn btn--brand header__cta" href="${attr(D.pageHref('catalogo'))}">Ver el catálogo</a>`,
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Pie: datos de la empresa + enlaces legales + copyright                */
/* ------------------------------------------------------------------ */

function footerBlock(page) {
  const C = D.COMPANY_LEGAL;
  const year = new Date().getFullYear();
  /* Los enlaces del pie se emiten RELATIVOS al documento que los contiene
     (`../` en las páginas legales, nada en las de la raíz). El valor no sale
     de "es la portada o no": las cinco páginas públicas están en la raíz y
     las cuatro legales en un subdirectorio, así que lo que decide es si la
     página tiene `dir`. Con la prueba anterior, catalogo.html —que está en
     la raíz— recibía `../` y sus enlaces legales apuntaban a un nivel de más
     que no existe. */
  const depth = page.dir ? 1 : 0;
  const links = D.legalLinks()
    .map((l) => `  <a href="${attr(D.path(l.href, depth))}">${esc(l.label)}</a>`)
    .join('\n');

  /* `dpo` es un objeto aunque no tenga Delegado designado, así que no basta
     con comprobar que existe: hay que exigir name y email. Si no hay DPO se
     muestra el canal de contacto legal, que es lo que exige la LSSI. */
  const hasDpo = !!(C.dpo && C.dpo.name && C.dpo.email);
  const contact = hasDpo
    ? `  <span class="footer__legal-meta">Delegado de Protección de Datos: <a href="mailto:${attr(C.dpo.email)}">${esc(C.dpo.name)}</a></span>`
    : `  <span class="footer__legal-meta">Contacto legal y de privacidad: <a href="mailto:${attr(C.email)}">${esc(C.email)}</a></span>`;

  /* El aviso corto va aquí y no en un bloque aparte. Es una decisión, no una
     comodidad: un bloque independiente depende de que cada página se acuerde
     de declararlo, y basta que una se olvide para que esa página tenga
     enlaces de afiliado sin el aviso que los acompaña. Emitiéndolo desde
     `footerBlock` es imposible que se quede fuera, porque toda página con
     pie lo lleva. En las páginas legales el texto no cambia: el aviso
     depende de quién publica los enlaces, no de dónde se publique la nota. */
  const disclosure = `<p class="footer__disclosure">${esc(D.AFFILIATE.disclosureShort || D.AFFILIATE.disclosure)} <a href="${attr(D.path(D.pageHref('transparencia'), depth))}">Ver la transparencia</a></p>`;

  return [
    `<address class="footer__company">`,
    `  <span class="footer__legal-name">${esc(C.name)}</span>`,
    `  <span class="footer__legal-meta">${esc(C.address.street)} · ${esc(C.address.postalCode)} ${esc(C.address.locality)} · ${esc(C.address.countryName)}</span>`,
    `  <span class="footer__legal-meta">NIF ${esc(C.taxId)}</span>`,
    contact,
    `</address>`,
    `<nav class="footer__legal" aria-label="Información legal">`,
    links,
    `</nav>`,
    page.dir ? '' : disclosure,
    `<p class="footer__legal-note" data-copyright>${esc(D.copyright(year))}</p>`,
  ].filter(Boolean).join('\n');
}

/* Rótulo y descripción propios de cada página legal. */
function legalBlock(page) {
  return [
    `<p class="legal__updated">Última actualización: <time datetime="${page.date}">${page.dateLabel}</time></p>`,
    `<p class="legal__notice"><strong>Documento de plantilla.</strong> Este texto es una plantilla sin valor jurídico: antes de publicar debe revisarlo un profesional del derecho y adaptarse al producto, la razón social y la actividad real de ${esc(D.COMPANY_LEGAL.name)}.</p>`,
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Tokens {{...}} en la prosa de las páginas legales                    */
/* ------------------------------------------------------------------ */

/* Valores insertables dentro del texto de las páginas legales. Así los datos
   de la empresa no se duplican en el HTML: si cambia la razón social en
   site-data.js, basta con volver a ejecutar este script. */
function tokens() {
  const C = D.COMPANY_LEGAL;
  const P = D.PRICING_DATA;
  const address = [
    C.address.street,
    C.address.postalCode + ' ' + C.address.locality,
    C.address.region,
    C.address.countryName,
  ].join(', ');
  const dpoEmail = C.dpo && C.dpo.email ? C.dpo.email : C.email;
  return {
    company: C.name,
    taxId: C.taxId,
    address: address,
    email: C.email,
    dpoEmail: dpoEmail,
    legalNotice: D.META_BRAND.legalNotice,
    currency: P.currency,
    taxRate: P.taxRatePercent,
    shippingLabel: P.shipping.freeOver > 0
      ? 'Envío gratuito a partir de ' + D.money(P.shipping.freeOver)
      : P.shipping.freeLabel,
    shippingDays: P.shipping.daysMin + ' a ' + P.shipping.daysMax,
    carrier: P.shipping.carrier,
    returnsDays: P.returns.windowDays,
    returnsLabel: P.returns.freeReturn
      ? 'El coste del envío de devolución es gratuito.'
      : 'El coste del envío de devolución corre de su cuenta.',
    stockUnits: String(P.stock.totalUnits),
    year: String(new Date().getFullYear()),
    /* Cifras del catálogo para la prosa. Existen como token y no solo como
       bloque porque `applyTokens` sustituye todas las apariciones mientras
       que un bloque `site:X` solo se rellena una vez: un texto que necesitara
       decir "18" dos veces en el mismo párrafo se quedaría con un 18 y un
       `{{setsTotal}}` sin sustituir a la vista. */
    setsTotal: String(D.catalogSummary().total),
    categoriesTotal: String(D.categories().length),
    piecesTotal: new Intl.NumberFormat(P.locale).format(D.catalogSummary().pieces),
  };
}

function applyTokens(html) {
  const t = tokens();
  return html.replace(/\{\{(\w+)\}\}/g, (whole, key) => {
    if (!(key in t)) {
      console.error('  token desconocido en el HTML: {{' + key + '}}');
      return whole;
    }
    return esc(t[key]);
  });
}

/* ------------------------------------------------------------------ */
/* Motor de sincronización                                            */
/* ------------------------------------------------------------------ */

/* Lista de páginas y los bloques que cada una debe tener. */
/* Las páginas que procesa el generador, con los bloques que lleva cada una.
   Se declara aquí y no en `PAGES` a propósito: `PAGES` es lo que ve el
   sitio en caliente y solo contiene lo que una página necesita para
   describirse (fichero, título, menú). Los bloques a pintar son una
   decisión de compilación, no de contenido, y no tiene por qué viajar
   hasta el navegador. */
function targets() {
  const list = [];

  /* Bloque a bloque, página a página. Compartir `COMMON` entre todas no
     compensa: cada página lleva HEAD, JSONLD y FOOTER, sí, pero el resto es
     distinto en todas y tener la lista entera a la vista hace evidente qué
     se ha olvidado de declarar en alguna. Si mañana aparece una sexta
     página, la forma de añadirla es copiar una de estas entradas. */
  list.push({
    file: D.PAGES.home.file,
    key: 'home',
    isHome: true,
    meta: D.PAGES.home,
    blocks: ['HEAD', 'JSONLD', 'NAV', 'NAV_DRAWER', 'HEADER_CTA', 'HERO_TITLE', 'HERO_SUB', 'HERO_FACTS',
      'FEATURED', 'CATALOG_PREVIEW', 'FOOTER', 'FOOTER_NAV', 'FOOTER_CATS'],
  });

  list.push({
    file: D.PAGES.catalogo.file,
    key: 'catalogo',
    meta: D.PAGES.catalogo,
    blocks: ['HEAD', 'JSONLD', 'NAV', 'NAV_DRAWER', 'HEADER_CTA', 'FILTERS', 'CATALOG_COUNT',
      'CATALOG_TITLE', 'CATALOG', 'FOOTER', 'FOOTER_NAV', 'FOOTER_CATS'],
  });

  list.push({
    file: D.PAGES.temas.file,
    key: 'temas',
    meta: D.PAGES.temas,
    blocks: ['HEAD', 'JSONLD', 'NAV', 'NAV_DRAWER', 'HEADER_CTA', 'THEMES', 'LEVELS',
      'FOOTER', 'FOOTER_NAV', 'FOOTER_CATS'],
  });

  list.push({
    file: D.PAGES.faq.file,
    key: 'faq',
    meta: D.PAGES.faq,
    /* El acordeón de preguntas NO es un bloque generado: se escribe a mano en
       el HTML y `readFaqFromDom()` lo lee de ahí para montar el JSON-LD.
       El motivo es que las respuestas son prosa larga y editar un texto de
       ese tamaño dentro de un `join('\n')` de JavaScript es mucho peor
       lugar para trabajar que dentro del HTML, y además el JSON-LD se
       construye leyéndolo, así que las dos cosas no pueden desincronizarse. */
    blocks: ['HEAD', 'JSONLD', 'NAV', 'NAV_DRAWER', 'HEADER_CTA', 'GUIDE', 'GUIDE_TOOLS', 'FOOTER', 'FOOTER_NAV', 'FOOTER_CATS'],
  });

  list.push({
    file: D.PAGES.transparencia.file,
    key: 'transparencia',
    meta: D.PAGES.transparencia,
    blocks: ['HEAD', 'JSONLD', 'NAV', 'NAV_DRAWER', 'HEADER_CTA', 'TRANSPARENCY', 'AFFILIATE_LONG', 'FOOTER', 'FOOTER_NAV', 'FOOTER_CATS'],
  });

  const legalPages = [
    { dir: 'politica-privacidad', title: 'Política de privacidad', date: '2026-01-15', dateLabel: '15 de enero de 2026' },
    { dir: 'terminos-y-condiciones', title: 'Términos y condiciones', date: '2026-01-15', dateLabel: '15 de enero de 2026' },
    { dir: 'cookies', title: 'Política de cookies', date: '2026-01-15', dateLabel: '15 de enero de 2026' },
    { dir: 'aviso-legal', title: 'Aviso legal', date: '2026-01-15', dateLabel: '15 de enero de 2026' },
  ];
  for (const p of legalPages) {
    list.push({
      file: path.join(p.dir, 'index.html'),
      key: p.dir,
      isHome: false,
      dir: p.dir,
      slug: p.dir,
      title: p.title,
      blocks: ['HEAD', 'JSONLD', 'FOOTER', 'LEGAL'],
    });
  }
  return list;
}

const BLOCK_RE = (name) => new RegExp(
  `(<!--\\s*site:${name}:start\\s*-->)([\\s\\S]*?)(<!--\\s*site:${name}:end\\s*-->)`
);

function render(page, name) {
  switch (name) {
    case 'HEAD': return headBlock(page);
    case 'JSONLD': return '<script type="application/ld+json">\n' + jsonLd(buildGraph(page)) + '\n</script>';
    case 'NAV': return navBlock(page.key);
    case 'NAV_DRAWER': return navDrawerBlock(page.key);
    case 'HEADER_CTA': return headerCtaBlock();
    case 'FILTERS': return filtersBlock();
    case 'CATALOG_COUNT': return countBlock();
    case 'HERO_TITLE': return heroBlock();
    case 'HERO_SUB': return heroSubBlock();
    case 'HERO_FACTS': return heroFactsBlock();
    case 'CATALOG_TITLE': return catalogTitleBlock();
    case 'CATALOG': return catalogBlock();
    case 'CATALOG_PREVIEW': return catalogPreviewBlock();
    case 'FEATURED': return featuredBlock();
    case 'THEMES': return themesBlock();
    case 'LEVELS': return difficultyBlock();
    case 'GUIDE': return guideBlock();
    case 'GUIDE_TOOLS': return guideToolsBlock();
    case 'TRANSPARENCY': return transparencyBlock();
    case 'AFFILIATE_LONG': return affiliateLongBlock();
    case 'FOOTER': return footerBlock(page);
    case 'FOOTER_NAV': return footerNavBlock();
    case 'FOOTER_CATS': return footerCatsBlock();
    case 'LEGAL': return legalBlock(page);
    default: throw new Error('Bloque desconocido: ' + name);
  }
}

let changed = 0;
let missing = 0;
const diffs = [];

for (const page of targets()) {
  const abs = path.join(ROOT, page.file);
  if (!fs.existsSync(abs)) { missing++; continue; }
  /* Se compara siempre contra el fichero tal y como está en disco, no contra
     la versión ya sustituida: si no, un cambio solo en los tokens passaría
     inadvertido en modo --check. */
  const original = fs.readFileSync(abs, 'utf8');
  let html = applyTokens(original);

  for (const name of page.blocks) {
    const re = BLOCK_RE(name);
    if (!re.test(html)) {
      console.error(`  faltaba el bloque site:${name} en ${page.file} — ejecuta con --insert`);
      missing++;
      continue;
    }
    const body = '\n' + render(page, name) + '\n';
    html = html.replace(re, (all, start, _old, end) => start + body + end);
  }

  if (html !== original) {
    diffs.push(page.file);
    if (!CHECK_ONLY) fs.writeFileSync(abs, html, 'utf8');
    else changed++;
  }
}

if (CHECK_ONLY) {
  if (diffs.length) {
    console.error('site-data.js no está sincronizado con: ' + diffs.join(', '));
    process.exit(1);
  }
  if (missing) { console.error(missing + ' aviso(s) de bloque o página.'); process.exit(1); }
  console.log('configuración sincronizada');
} else {
  console.log(missing ? 'sincronizado con ' + missing + ' aviso(s)' : 'configuración sincronizada');
  diffs.forEach((f) => console.log('  actualizado ' + f));
}
