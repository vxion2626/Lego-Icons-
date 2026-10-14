/* Prueba de interacciones reales conduciendo Edge/Chrome por CDP.
   No necesita dependencias: usa el WebSocket incluido en Node 22+.
   Uso: node tools/e2e.js [url] */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/* La suite se conduce sobre el catálogo y no sobre la portada. Antes de que
   el sitio se partiera en cinco páginas, la portada contenía los 18 sets, la
   rejilla, los chips y el FAQ, así que una sola URL cubría todo. Ahora cada
   cosa vive en su página: los filtros están en catalogo.html y el acordeón en
   preguntas-frecuentes.html. Con la suite apuntando a la portada, la primera
   aserción del catálogo fallaba al pedir `#set-grid`, y el fallo se leía
   como un bug del HTML en vez de como una suite que se quedó en la página
   antigua. Las páginas que no se conducen —portada, temas, transparencia— se
   comprueban en la sección 13, con fetch y DOMParser. */
const url = process.argv[2] || 'http://localhost:8137/catalogo.html';

/* La suite salta a la página de preguntas para el acordeón y el cajón, y
   vuelve al catálogo para el resto. Se deriva del argumento para que seguir
   funcionando con otro host no obligue a editar el fichero. */
const faqUrl = url.replace(/[^/]*(\?.*)?$/, 'preguntas-frecuentes.html$1');
const homeUrl = url.replace(/[^/]*(\?.*)?$/, 'index.html$1');
const { requireBrowser, killBrowser } = require('./browser');
const bin = requireBrowser();

/* Expectativas derivadas de la configuración, no escritas a mano.
   Antes de esto los números de la suite («12 tarjetas», «11 con precio»,
   «12 afiliados pendientes») estaban repetidos en treinta y pico
   aserciones. Con los datos en un solo sitio, añadir o quitar un set ya no
   obliga a recordar cuántas veces aparece el 12, y una aserción que falla
   dice qué se ha roto en los datos y no que el número esperado está viejo.
   Se leen de `site-data.js` en Node, nunca de `window.SITE_DATA`: al
   navegador no le llega `process.env`, y leerlo de la página haría que la
   prueba pasara en local y fallara en producción. */
const D = require('../assets/js/site-data.js');
const SETS = D.sets();
const TOTAL = SETS.length;
const CATEGORIES = D.categories().length;
const WITH_AFFILIATE = SETS.filter((s) => s.hasAffiliate).length;
const NO_AFFILIATE = TOTAL - WITH_AFFILIATE;
const PRICED = SETS.filter((s) => s.price != null).length;
const NO_PRICE_IDS = SETS.filter((s) => s.price == null).map((s) => s.id);
const PIECES = SETS.reduce((a, s) => a + (s.pieces || 0), 0);
const nf = new Intl.NumberFormat(D.PRICING_DATA.locale);

/* Espejo del comparador de `main.js` para poder comprobar la ordenación
   entera contra lo esperado, en vez de fijar un par de posiciones sueltas
   (`ids[0]`, `ids[11]`). Ese esquema fallaba al crecer el catálogo: `ids[11]`
   era «la última tarjeta» cuando eran 12 y pasó a ser la duodécima al
   añadir seis, así que la prueba.Pointería señalaba un fallo de ordenación
   donde no lo había. Se replica aquí la misma lógica, incluido el desempate
   por posición original, que es lo que mantiene estable la lista en los
   empates: hay sets que comparten precio y otros que comparten piezas. */
const orderedIds = (kind) => {
  const rows = SETS.map((s, i) => ({ s, order: i }));
  const has = (r, key) => (key === 'pieces' ? r.s.pieces != null : r.s.price != null);
  const cmp = (key, desc) => (a, b) => {
    const aHas = has(a, key), bHas = has(b, key);
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (!aHas) return a.order - b.order;
    if (a.s[key] === b.s[key]) return a.order - b.order;
    return (a.s[key] < b.s[key] ? -1 : 1) * (desc ? -1 : 1);
  };
  const sorters = {
    'pieces-desc': cmp('pieces', true),
    'price-asc': cmp('price', false),
    'price-desc': cmp('price', true),
    'name-asc': (a, b) => a.s.name.localeCompare(b.s.name, 'es') || a.order - b.order,
  };
  const out = kind === 'featured' ? rows : rows.slice().sort(sorters[kind]);
  return out.map((r) => r.s.id);
};
const SEQ = {
  'pieces-desc': orderedIds('pieces-desc'),
  'price-asc': orderedIds('price-asc'),
  'price-desc': orderedIds('price-desc'),
  'name-asc': orderedIds('name-asc'),
  'featured': orderedIds('featured'),
};
const lastId = (kind) => SEQ[kind][SEQ[kind].length - 1];

let passed = 0;
let failed = 0;
const ok = (m) => { passed++; console.log('  ok      ' + m); };
const err = (m) => { failed++; console.log('  FALLO   ' + m); };
const eq = (a, b, m) => (String(a) === String(b) ? ok(m + ' → ' + a) : err(m + ' → ' + a + ' (se esperaba ' + b + ')'));

const PORT = 9333 + (process.pid % 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
const chrome = spawn(bin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

/* El cierre del navegador lo hace el modulo compartido, que sabe que en
   Windows hay que matar el arbol entero y no solo el padre. */
const stop = () => killBrowser(chrome);

let ws, id = 0;
const pending = new Map();
const sessions = new Set();
const consoleErrors = [];
const failedRequests = [];

/* 15 s se agotaban en un runner ocupado: con la maquina cargada, la pagina
   sin JavaScript tardaba mas y el comando se cancelaba a mitad, dejando
   después cuatro comprobaciones de SEO que comparaban contra SITE_DATA
   todavia vacio y fallaban sin tener nada que ver. Se deja margen y se
   puede subir con CDP_TIMEOUT si hace falta. */
const COMMAND_TIMEOUT = Number(process.env.CDP_TIMEOUT) || 60000;

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    const timer = setTimeout(() => {
      pending.delete(msg.id);
      reject(new Error('Tiempo agotado en ' + method + ' (' + COMMAND_TIMEOUT + ' ms)'));
    }, COMMAND_TIMEOUT);
    pending.set(msg.id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    ws.send(JSON.stringify(msg));
  });
}

async function evaluate(expression, sessionId) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'error en la expresión');
  return r.result.value;
}

/* El sitio usa scroll suave; en headless una animación larga sigue corriendo
   aunque se pida un salto instantáneo y lo sobrescribe. Se espera a que el
   scroll se estabilice antes de medir o lanzar el siguiente salto.
   Se exigen STABLE muestras consecutivas porque una animación suave puede
   hacer una pausa antes de arrancar de verdad. */
const STABLE = 5;
/* Esperar a una condicion real en la pagina. Despues de un Page.reload, un
   sleep fijo es una carrera: si la maquina va cargada, el script de
   configuracion todavia no se ha ejecutado, SITE_DATA sigue vacio y todo lo
   que se compare contra el da null. Eso hacia fallar de golpe cuatro
   comprobaciones de SEO que no tenian nada que ver entre si, y el aviso
   senalaba al sitio cuando el problema era la espera. Aqui se sondea la
   condicion de verdad, y ademas avisa si nunca llega. */
async function waitFor(sessionId, expression, tries = 100, gap = 100) {
  for (let i = 0; i < tries; i++) {
    try { if (await evaluate(expression, sessionId)) return true; } catch { /* evaluatingaun */ }
    await sleep(gap);
  }
  console.log('  aviso    no se cumplió "' + expression + '" tras ' + (tries * gap) + ' ms');
  return false;
}

/* Salto entre páginas dentro de la misma sesión. Se espera a que el documento
   termine de cargar en vez de dormir un tiempo fijo: con la máquina cargada un
   `sleep` se queda corto y las comprobaciones siguientes leen el documento
   anterior, que es como los fallos aparecen en la sección equivocada. */
async function goto(sessionId, target) {
  await send('Page.navigate', { url: target }, sessionId);
  await waitFor(sessionId, 'document.readyState === \'complete\'');
  await sleep(400);
}

async function settleScroll(sessionId, tries = 60) {
  let last = null;
  let stable = 0;
  for (let i = 0; i < tries; i++) {
    const y = await evaluate('Math.round(window.scrollY)', sessionId);
    if (y === last) { if (++stable >= STABLE) return y; } else { stable = 0; last = y; }
    await sleep(80);
  }
  return last;
}

async function main() {
  /* Espera a que el puerto de depuración responda. */
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      const list = await fetch('http://127.0.0.1:' + PORT + '/json/list').then((r) => r.json());
      target = list.find((t) => t.type === 'page');
    } catch { /* aún no está listo */ }
  }
  if (!target) throw new Error('El navegador no abrió el puerto de depuración');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.method + ': ' + JSON.stringify(m.error))) : resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
    if (m.method === 'Network.loadingFailed') failedRequests.push(m.params.errorText);
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      failedRequests.push(m.params.response.status + ' ' + m.params.response.url);
    }
  };

  const { sessionId } = await send('Target.attachToTarget', { targetId: target.id, flatten: true });
  sessions.add(sessionId);

  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Network.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

  /* La intro de entrada se salta en casi toda la suite. Se marca la visita
     como hecha ANTES de que se ejecute ningún script del documento, porque la
     decisión de jugar la toma un script de la <head> en el primer fotograma:
     si se pusiera la bandera después, la intro ya habría arrancado, tapado el
     <body> con `visibility: hidden` y una espera fija no bastaría para
    Specifierla. Además la escena pide Three.js a un CDN, así que sin esto la
     suite dependería de la red.

     La inyección mira `e2e-intro`: con esa clave puesta no marca nada y deja
     que la intro se juegue de verdad. Así se puede probar el intro de verdad
     en la sección [9b] sin que el resto de la suite espere 4 s en cada salto
     de página. */
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: "try { if (!sessionStorage.getItem('e2e-intro')) sessionStorage.setItem('lego-intro-seen', '1'); } catch (e) {}",
  }, sessionId);

  await send('Page.navigate', { url }, sessionId);
  await sleep(2500);

  /* ---- 0 · Consola limpia ---- */
  console.log('\n[0] Consola del navegador');
  consoleErrors.length === 0 ? ok('sin errores ni excepciones') : err(consoleErrors.slice(0, 5).join(' | '));
  const bad = failedRequests.filter((r) => !/favicon/.test(r) && !/assets\/img\/sets\/\d+\./.test(r));
  const pendingPhotos = failedRequests.filter((r) => /assets\/img\/sets\/\d+\./.test(r)).length;
  bad.length === 0
    ? ok('sin peticiones fallidas fuera de las fotos pendientes' + (pendingPhotos ? ' (' + pendingPhotos + ' de sets, con sustituto)' : ''))
    : err('peticiones fallidas: ' + bad.join(', '));

  /* ---- 1 · Estructura del catálogo ---- */
  console.log('\n[1] Catálogo de sets');
  const cat = await evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.setcard'));
    const grid = document.querySelector('#set-grid');
    return {
      total: cards.length,
      inGrid: cards.filter(c => c.parentElement === grid).length,
      gridCols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
      gridTotal: grid ? grid.getAttribute('data-total') : null,
      chips: Array.from(document.querySelectorAll('.chip[data-filter]')).map(c => ({
        key: c.dataset.filter,
        pressed: c.getAttribute('aria-pressed'),
        count: c.querySelector('.chip__count').textContent,
        label: c.textContent.trim(),
      })),
      complete: cards.filter(c =>
        c.dataset.setId && c.dataset.category && c.dataset.name &&
        c.querySelector('.setcard__title') &&
        c.querySelector('.setcard__cat') &&
        c.querySelector('.setcard__summary') &&
        c.querySelector('.setcard__price') &&
        c.querySelectorAll('.setcard__meta li').length >= 2).length,
      /* Un retardo escalonado mal calculado se delata en el estilo: si el
         generador pierde el índice, todas las tarjetas salen con NaNms y el
         navegador lo descarta, dejándolas sin entrada escalonada. */
      badDelay: cards.filter(c => /NaN|undefined/.test(c.getAttribute('style') || '')).map(c => c.dataset.setId),
      delays: cards.map(c => c.style.getPropertyValue('--delay')),
      pendingPrice: cards.filter(c => c.dataset.price === '').map(c => c.dataset.setId),
      priced: cards.filter(c => c.querySelector('.setcard__amount')).length,
      pendingPriceCells: cards.filter(c => c.querySelector('.setcard__price--pending')).length,
      refTags: cards.filter(c => /referencia|sin confirmar/.test((c.querySelector('.setcard__pricetag') || {}).textContent || '')).length,
      /* Con los afiliados en null no debe haber ni un enlace externo: si
         apareciera, sería un destino inventado. */
      externalLinks: cards.filter(c => c.querySelector('a[href^="http"]')).length,
      pendingCta: cards.filter(c => /pendiente/i.test((c.querySelector('.setcard__pending') || {}).textContent || '')).length,
      describedBy: (document.getElementById('catalog-search') || {}).getAttribute('aria-describedby'),
    };
  })()`, sessionId);

  eq(cat.total, TOTAL, `hay ${TOTAL} tarjetas de set`);
  eq(cat.inGrid, TOTAL, `las ${TOTAL} tarjetas cuelgan de la rejilla #set-grid`);
  eq(cat.gridTotal, String(TOTAL), `la rejilla declara data-total="${TOTAL}"`);
  cat.gridCols >= 2 ? ok('la rejilla se reparte en varias columnas (' + cat.gridCols + ')') : err('la rejilla no tiene varias columnas: ' + cat.gridCols);
  eq(cat.complete, TOTAL, `las ${TOTAL} tarjetas llevan categoría, título, resumen, precio y metadatos`);
  eq(cat.badDelay.join(','), '', 'ninguna tarjeta arrastra un --delay inválido');
  eq([...new Set(cat.delays)].sort().join(','), '0ms,120ms,180ms,60ms', 'los retardos escalonados son válidos y variety cycling');
  eq(cat.chips.length, CATEGORIES + 1, `hay ${CATEGORIES + 1} chips: "todos" más las ${CATEGORIES} categorías`);
  eq(cat.chips.filter(c => c.pressed === 'true').length, 1, 'solo un chip está pulsado al cargar');
  eq(cat.chips[0].key, 'all', 'el primer chip es el de todos');
  eq(cat.chips[0].count, String(TOTAL), `y cuenta los ${TOTAL} sets`);
  eq(cat.pendingPrice.join(','), NO_PRICE_IDS.join(','), `los sets sin precio son ${NO_PRICE_IDS.join(', ')}`);
  eq(cat.priced, PRICED, `los otros ${PRICED} sets muestran importe`);
  eq(cat.pendingPriceCells, NO_PRICE_IDS.length, 'solo los sets sin precio lo marcan como pendiente');
  eq(cat.refTags, TOTAL, `las ${TOTAL} fichas dicen de dónde sale el precio`);
  /* Los afiliados ya no están pendientes: hay 18 URLs reales en los datos,
     así que aquí lo que se comprueba es que cada ficha con `affiliateUrl`
     tenga su enlace externo y que no haya ninguna de más. */
  eq(cat.externalLinks, WITH_AFFILIATE, `${WITH_AFFILIATE} fichas enlizan a la tienda oficial, ni una más`);
  eq(cat.pendingCta, NO_AFFILIATE, `${NO_AFFILIATE} fichas declaran el enlace de afiliado pendiente`);
  eq(cat.describedBy, 'catalog-count', 'el buscador se describe con el contador');

  /* ---- 2 · Filtros por categoría ---- */
  console.log('\n[2] Filtro por categoría');
  const filterRes = await evaluate(`(async () => {
    const out = [];
    for (const c of Array.from(document.querySelectorAll('.chip[data-filter]'))) {
      c.click();
      await new Promise(r => setTimeout(r, 90));
      const visible = Array.from(document.querySelectorAll('.setcard')).filter(x => !x.hidden);
      out.push({
        key: c.dataset.filter,
        pressed: c.getAttribute('aria-pressed'),
        active: document.querySelectorAll('.chip.is-active').length,
        visible: visible.length,
        visibleCats: [...new Set(visible.map(v => v.dataset.category))],
        counter: document.querySelector('[data-count-sets]').textContent,
        pieces: document.querySelector('[data-count-pieces]').textContent,
        ownCat: visible.every(v => c.dataset.filter === 'all' || v.dataset.category === c.dataset.filter),
        allPressed: document.querySelector('.chip[data-filter=all]').getAttribute('aria-pressed'),
      });
    }
    return out;
  })()`, sessionId);

  filterRes.forEach(f => {
    eq(f.pressed, 'true', 'el filtro ' + f.key + ' queda marcado como pulsado');
    eq(f.active, 1, 'al filtrar por ' + f.key + ' solo queda un chip activo');
    eq(f.allPressed, f.key === 'all' ? 'true' : 'false', 'el chip "todos" se desmarca al filtrar por ' + f.key);
    eq(f.counter, String(f.visible), 'el contador de ' + f.key + ' coincide con las tarjetas visibles');
    f.ownCat ? ok('el filtro ' + f.key + ' no deja pasar sets de otras categorías') : err('el filtro ' + f.key + ' mezcló categorías: ' + f.visibleCats.join(','));
  });
  eq(filterRes.find(f => f.key === 'all').visible, TOTAL, '"Todos" deja ver los ' + TOTAL + ' sets');
  /* Las categorías y sus recuentos se leen de los datos: la lista estaba
     escrita a mano y con «3 sets» por categoría, que era cierto con el
     surtido anterior y dejó de serlo al añadir seis fichas y una quinta
     categoría. `CATS` es { clave: { n, piezas } }. */
  D.categories().forEach((c) => {
    const f = filterRes.find((x) => x.key === c.key);
    if (!f) { err('el chip de la categoría ' + c.key + ' no aparece en la página'); return; }
    eq(f.visible, c.count, c.key + ': ' + c.count + ' sets');
    eq(f.visibleCats.join(','), c.key, c.key + ': todos los visibles son de esa categoría');
  });
  /* El contador de piezas también se recalcula al filtrar, así que se
     comprueba contra la suma real de la categoría, formateada igual que la
     página. */
  const archPieces = nf.format(SETS.filter((s) => s.category === 'arquitectura').reduce((a, s) => a + (s.pieces || 0), 0));
  const allPieces = nf.format(PIECES);
  eq(filterRes.find(f => f.key === 'arquitectura').pieces, archPieces, 'el contador de piezas también se recalcula al filtrar (arquitectura: ' + archPieces + ')');
  eq(filterRes.find(f => f.key === 'all').pieces, allPieces, 'al volver a "todos" las piezas son ' + allPieces);

  /* ---- 3 · Búsqueda ---- */
  console.log('\n[3] Búsqueda en el catálogo');
  const search = await evaluate(`(async () => {
    /* La búsqueda se combina con el filtro activo, así que antes de medir hay
       que volver a "todos": quien empieza a buscar lo hace sobre el catálogo
       completo, no sobre lo que dejó pulsado el filtro anterior. */
    document.querySelector('.chip[data-filter=all]').click();
    const input = document.getElementById('catalog-search');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 60));
    const set = async (v) => {
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 90));
      const vis = Array.from(document.querySelectorAll('.setcard')).filter(x => !x.hidden);
      return {
        q: v, n: vis.length, ids: vis.map(x => x.dataset.setId),
        value: input.value,
        hay: Array.from(document.querySelectorAll('.setcard')).map(x => x.dataset.name),
        counter: document.querySelector('[data-count-sets]').textContent,
        hiddenChips: Array.from(document.querySelectorAll('.chip[data-filter]')).filter(c => c.hidden).map(c => c.dataset.filter),
      };
    };
    const out = [];
    out.push(await set('21065'));
    out.push(await set('jaguar'));
    out.push(await set('JAGUAR'));
    out.push(await set('sagrada familia'));
    out.push(await set('FAMILIA'));
    out.push(await set('  YORK  '));
    out.push(await set('xyz-no-existe'));
    const emptyAttr = document.getElementById('set-grid').getAttribute('data-empty');
    input.value = 'jaguar';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 60));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 90));
    out.push({
      q: '(Escape)', n: Array.from(document.querySelectorAll('.setcard')).filter(x => !x.hidden).length,
      ids: [], value: input.value, counter: document.querySelector('[data-count-sets]').textContent,
    });
    return { out, emptyAttr };
  })()`, sessionId);

  const s = search.out;
  eq(s[0].n, 1, 'buscar el número 21065 encuentra un set');
  eq(s[0].ids[0], '21065', 'y es el correcto');
  eq(s[1].n, 1, 'buscar "jaguar" encuentra un set');
  eq(s[1].ids[0], '11381', 'y es el Jaguar E-Type');
  eq(s[2].n, 1, 'la búsqueda no distingue mayúsculas');
  eq(s[3].n, 1, 'buscar "sagrada familia" encuentra la Sagrada Família');
  eq(s[4].n, 1, 'los acentos no bloquean: "FAMILIA" encuentra "Sagrada Família"');
  eq(s[5].n, 1, 'los espacios sobrantes no estorban (' + JSON.stringify(s[5].value) + ')');
  if (s[5].n !== 1) err('  valor real del campo: ' + JSON.stringify(s[5].value) + ' | nombres: ' + s[5].hay.join(', '));
  eq(s[6].n, 0, 'una búsqueda sin resultados deja la rejilla vacía');
  eq(s[6].counter, '0', 'el contador marca 0 sets sin resultados');
  eq(search.emptyAttr, 'true', 'la rejilla se marca como vacía para el mensaje de CSS');
  eq(s[6].hiddenChips.length, CATEGORIES, 'los ' + CATEGORIES + ' chips de categoría se ocultan cuando no hay nada que mostrar');
  eq(s[7].n, TOTAL, 'Escape vacía la búsqueda y restituye los ' + TOTAL + ' sets');
  eq(s[7].value, '', 'Escape deja el campo limpio');
  eq(s[7].counter, String(TOTAL), 'y el contador vuelve a ' + TOTAL);

  /* ---- 4 · Ordenación ---- */
  console.log('\n[4] Ordenación');
  const sort = await evaluate(`(async () => {
    /* La ordenación se mide sobre el catálogo entero, con el filtro en "todos"
       y sin búsqueda activa, igual que el estado en el que se abre la página. */
    document.querySelector('.chip[data-filter=all]').click();
    const input = document.getElementById('catalog-search');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 60));
    const sel = document.getElementById('catalog-sort');
    const set = async (v) => {
      sel.value = v;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 90));
      const vis = Array.from(document.querySelectorAll('.setcard')).filter(x => !x.hidden);
      return {
        v,
        ids: vis.map(x => x.dataset.setId),
        pieces: vis.map(x => x.dataset.pieces),
        prices: vis.map(x => x.dataset.price),
        titles: vis.map(x => x.querySelector('.setcard__title').textContent.trim()),
      };
    };
    const out = [];
    for (const v of ['pieces-desc', 'price-asc', 'price-desc', 'name-asc', 'featured']) out.push(await set(v));
    return out;
  })()`, sessionId);

  /* Cada orden se compara con la secuencia completa esperada, calculada en
     Node a partir de los datos con el mismo criterio que `main.js`. Se
     sustituye a las comprobaciones por posición suelta: con 12 sets, `ids[11]`
     era «la última tarjeta» y al pasar a 18 pasaba a ser la duodécima, así que
     la suite señalaba un fallo de ordenación inexistente. Ahora una
     diferencia señala un ids o un número concreto en cada lado. */
  const checkOrder = (kind, label) => {
    const got = sort.find((x) => x.v === kind);
    const want = SEQ[kind];
    if (got.ids.join(',') === want.join(',')) ok(label + ' ordena los ' + TOTAL + ' sets como espera (' + want[0] + ' … ' + want[want.length - 1] + ')');
    else err(label + ' no coincide · esperado ' + want.join(',') + ' · obtenido ' + got.ids.join(','));
    return got;
  };
  const byPieces = checkOrder('pieces-desc', '"Más piezas"');
  const byName = checkOrder('name-asc', '"Nombre (A-Z)"');

  /* Los dos casos que la ordenación tiene que tratar aparte: un set sin
     piezas y otro sin precio no pueden compararse por un campo que no
     tienen, y su comportamiento correcto es quedarse al final en los dos
     sentidos, no treated como 0. */
  const noPieces = SETS.find((s) => s.pieces == null);
  const noPrice = SETS.find((s) => s.price == null);
  eq(byPieces.ids[TOTAL - 1], noPieces.id, `el ${noPieces.id}, sin piezas confirmadas, queda el último y no se cuela como 0`);
  eq(checkOrder('price-asc', '"Precio: menor a mayor"').ids[TOTAL - 1], noPrice.id, `el ${noPrice.id}, sin precio, queda el último también en ascendente`);
  eq(checkOrder('price-desc', '"Precio: mayor a menor"').ids[TOTAL - 1], noPrice.id, `y el ${noPrice.id}, sin precio, no sube por el hueco: sigue al final`);
  checkOrder('featured', '"Destacados"');

  /* La comprobación gruesa de monotonicidad se conserva: aunque la
     secuencia completa ya la cubre, avisa de forma legible si algún día
     cambia el criterio y dos elementos se cruzan. */
  const num = (v) => (v === '' ? -1 : parseInt(v, 10));
  const mono = (vals, desc) => vals.every((v, i) => i === 0 || (desc ? vals[i - 1] >= v : vals[i - 1] <= v));
  mono(byPieces.pieces.map(num), true) ? ok('"Más piezas" es monótono decreciente') : err('el orden por piezas no es descendente: ' + byPieces.pieces.join(','));
  eq(byName.titles[0], SETS.map((s) => s.name).sort((a, b) => a.localeCompare(b, 'es'))[0], '"Nombre (A-Z)" empieza por el título más alfabético');

  /* ---- 5 · Enlaces de categoría ---- */
  console.log('\n[5] Enlaces de categoría');
  const jump = await evaluate(`(async () => {
    const link = document.querySelector('[data-jump-category="botanica"]');
    if (!link) return { missing: true };
    /* Se vuelve a un estado conocido antes de medir. La sección anterior
       deja la página desplazada y con el orden de clasificación cambiado, y
       un ancla que no cambia de hash no vuelve a desplazar: si el hash ya
       era #catalogo, el clic no navega y la comprobación mide la posición
       en la que estaba, que no dice nada del enlace. El fallo se veía como
       «no se ha desplazado: top=1202», que es exactamente la posición sin
       desplazar, y daba la impresión de que el enlace estaba roto cuando
       lo que faltaba era partir de cero. */
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise(r => setTimeout(r, 120));
    link.click();
    /* Se espera a que el scroll se quede quieto en vez de a un tiempo fijo.
       Con scroll-behavior smooth la duracion depende de la distancia y de
       lo ocupada que este la pagina, asi que 1200 ms llegaban a ser
       suficientes en una ejecucion y no en la siguiente: medido a mitad de
       animacion daba top=665 con el destino en 84, que parece un fallo del
       enlace y solo era que el bloque aun no habia llegado. */
    let prevY = -1, quieto = 0;
    for (let i = 0; i < 120 && quieto < 6; i++) {
      await new Promise(r => requestAnimationFrame(r));
      const y = Math.round(scrollY);
      if (y === prevY) quieto++; else { quieto = 0; prevY = y; }
    }
    const vis = Array.from(document.querySelectorAll('.setcard')).filter(x => !x.hidden);
    return {
      key: (document.querySelector('.chip.is-active') || {}).dataset ? document.querySelector('.chip.is-active').dataset.filter : null,
      n: vis.length,
      cats: [...new Set(vis.map(v => v.dataset.category))],
      top: Math.round(document.getElementById('catalogo').getBoundingClientRect().top),
      y: Math.round(scrollY),
    };
  })()`, sessionId);
  jump.missing ? err('no hay ningún enlace data-jump-category en la página') : null;
  if (!jump.missing) {
    eq(jump.key, 'botanica', 'el enlace de categoría activa su chip');
    const bot = D.categories().find(c => c.key === 'botanica');
    eq(jump.n, bot.count, 'y deja ' + bot.count + ' tarjetas visibles');
    eq(jump.cats.join(','), 'botanica', 'todas de esa categoría');
    /* El salto tiene que acabar cerca del borde superior de la sección: el
       `scroll-padding-top` del html deja la cabecera encima, así que se
       admite ese margen. `y` en el mensaje ayuda a distinguir «no se
       desplazó» de «se desplazó de más». */
    Math.abs(jump.top) < 160 ? ok('y desplaza la vista hasta el ancla del catálogo (' + jump.top + 'px, scrollY=' + jump.y + ')') : err('no se ha desplazado al catálogo: top=' + jump.top + ', scrollY=' + jump.y);
  }

  /* ---- 6 · Acordeón de preguntas ---- */
  console.log('\n[6] Acordeón de preguntas');
  /* Desde que el sitio se partió en cinco páginas el acordeón no está en el
     catálogo, así que la suite se traslada a la página de preguntas y vuelve
     al catálogo antes de la sección 9, que sí necesita las 18 tarjetas. */
  await goto(sessionId, faqUrl);
  const faq = await evaluate(`(async () => {
    const btns = Array.from(document.querySelectorAll('.faq__q'));
    if (!btns.length) return { total: 0 };
    /* Esperar un tiempo fijo no vale para medir una transicion: con la
       maquina ocupada el panel puede seguir a 0px justo cuando ya ha
       terminado el tiempo, y la comprobacion falla sin que el acordeon
       este roto. Se mide por fotogramas hasta que la altura se queda
       quieta varias veces seguidas, que es cuando la transicion ha
       terminado de verdad. Igual que settleScroll, pero en la pagina. */
    const settleHeight = async (el) => {
      let last = null, stable = 0;
      for (let i = 0; i < 90; i++) {
        const h = Math.round(el.getBoundingClientRect().height);
        if (h === last) { if (++stable >= 5) return h; } else { stable = 0; last = h; }
        await new Promise(r => requestAnimationFrame(r));
      }
      return last;
    };
    /* #faq tiene content-visibility: auto, así que fuera de la ventana el
       navegador no calcula su layout y la altura mediría 0. Hay que tener
       la sección a la vista antes de medir el desplegable. */
    document.getElementById('faq').scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 400));
    const first = btns[0];
    const panel = document.getElementById(first.getAttribute('aria-controls'));
    const closed = { expanded: first.getAttribute('aria-expanded'), h: Math.round(panel.getBoundingClientRect().height) };
    first.click();
    const openH = await settleHeight(panel);
    const opened = { expanded: first.getAttribute('aria-expanded'), h: openH, open: panel.getAttribute('data-open') };
    btns[1].click();
    /* Cada pregunta tiene su propio panel, así que hay que medir el de la
       segunda: el de la primera cerrandose a 0 es justo lo que se espera. */
    const secondH = await settleHeight(document.getElementById(btns[1].getAttribute('aria-controls')));
    return {
      total: btns.length,
      controlled: btns.filter(b => document.getElementById(b.getAttribute('aria-controls'))).length,
      closed, opened,
      secondPanelH: secondH,
      after: { first: btns[0].getAttribute('aria-expanded'), second: btns[1].getAttribute('aria-expanded') },
    };
  })()`, sessionId);
  eq(faq.total, 6, 'hay 6 preguntas en el acordeón');
  eq(faq.controlled, 6, 'las 6 preguntas apuntan a un panel existente');
  eq(faq.closed.expanded, 'false', 'las preguntas arrancan cerradas');
  eq(faq.opened.expanded, 'true', 'al pulsar, aria-expanded pasa a true');
  faq.opened.h > faq.closed.h ? ok('la respuesta se despliega (' + faq.closed.h + 'px -> ' + faq.opened.h + 'px)') : err('la respuesta no se despliega: ' + faq.closed.h + ' -> ' + faq.opened.h);
  faq.secondPanelH > 0 ? ok('al abrir la segunda, su respuesta también tiene alto (' + faq.secondPanelH + 'px)') : err('la segunda respuesta queda contraída: ' + faq.secondPanelH + 'px');
  eq(faq.after.first, 'false', 'al abrir otra, la anterior se cierra');
  eq(faq.after.second, 'true', 'y la nueva queda abierta');

  /* ---- 7 · Navegación por anclas ---- */
  console.log('\n[7] Navegación por anclas');
  /* El menú ya no lleva anclas: son enlaces entre páginas. El salto dentro de
     la misma página se sigue produciendo por el enlace de salto al
     contenido, que es el único `href="#"` que hay en todas las cabeceras y el
     que de verdad tiene que cumplir el `scroll-padding-top`. */
  const anchors = await evaluate(`(async () => {
    const link = document.querySelector('.skip-link');
    if (!link) return { missing: true };
    window.scrollTo(0, 2000);
    await new Promise(r => setTimeout(r, 200));
    link.click();
    await new Promise(r => setTimeout(r, 1600));
    const main = document.getElementById('main');
    return {
      hash: location.hash,
      y: Math.round(window.scrollY),
      top: main ? Math.round(main.getBoundingClientRect().top) : null,
      focus: document.activeElement === main || document.activeElement === document.body,
      current: (document.querySelector('.nav__link[aria-current]') || {}).textContent || '',
    };
  })()`, sessionId);
  anchors.missing ? err('no se encuentra el enlace de salto al contenido') : null;
  if (!anchors.missing) {
    eq(anchors.hash, '#main', 'el enlace de salto actualiza el hash');
    eq(anchors.y, 0, 'y devuelve la vista al principio');
    anchors.top != null && anchors.top >= -2 && anchors.top < 160
      ? ok('el contenido queda bajo el borde superior, con la cabecera encima (' + anchors.top + 'px)')
      : err('el contenido no queda bajo el borde superior: top=' + anchors.top);
    eq(anchors.focus, true, 'y el foco pasa al contenido, que es para lo que sirve el enlace');
    anchors.current.trim() ? ok('la navegación marca la página activa (' + anchors.current.trim() + ')') : err('ningún enlace de la navegación queda marcado como activo');
  }

  /* ---- 8 · Menú móvil ---- */
  console.log('\n[8] Menú móvil');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
  await sleep(700);
  const menu = await evaluate(`(async () => {
    const toggle = document.getElementById('nav-toggle');
    const drawer = document.getElementById('nav-drawer');
    if (!toggle || !drawer) return { missing: true };
    const state = () => ({ expanded: toggle.getAttribute('aria-expanded'), hidden: drawer.hasAttribute('hidden') });
    const before = state();
    /* El menú se cierra solo si la página se desplaza o si se pasa a
       escritorio, así que se registra el estado tres veces: al instante de
       pulsar, a los 50 ms y a los 450 ms. Si aparece abierto y luego
       cerrado, el culprit es un cierre asíncrono y no la Absence de handler. */
    toggle.click();
    const now = state();
    await new Promise(r => setTimeout(r, 50));
    const at50 = state();
    await new Promise(r => setTimeout(r, 400));
    const at450 = state();
    const link = drawer.querySelector('a[href]');
    const links = drawer.querySelectorAll('a[href]').length;
    /* Elegir un enlace del cajón ya no es un salto dentro de la página sino un
       cambio de documento, y el estado del cajón dejaría de poder medirse
       después. Lo que sí es nuestro es que el botón lo cierre otra vez, así
       que la segunda pulsación es la que se comprueba. */
    if (state().expanded === 'true') { toggle.click(); await new Promise(r => setTimeout(r, 500)); }
    return { before, now, at50, at450, scrollY: Math.round(window.scrollY), links, target: link ? link.getAttribute('href') : null, after: state() };
  })()`, sessionId);
  menu.missing ? err('no se encuentra el botón ni el cajón de navegación móvil') : null;
  if (!menu.missing) {
    eq(menu.before.expanded, 'false', 'el menú móvil arranca cerrado');
    eq(menu.links >= 5, true, 'el cajón contiene los enlaces de navegación (' + menu.links + ')');
    menu.target ? ok('y apunta a páginas reales (' + menu.target + ')') : err('el cajón no tiene ningún enlace navegable');
    menu.now.expanded === 'true' ? ok('pulsar el botón abre el cajón al instante') : err('el clic no abre el cajón en el acto: ' + JSON.stringify(menu.now));
    menu.now.expanded === 'true' && menu.at450.expanded === 'false'
      ? err('el cajón se cierra solo después de abrirlo (estado a 450 ms: ' + menu.at450.expanded + ', scrollY=' + menu.scrollY + '): hay un listener que lo cierra al desplazarse')
      : ok('el cajón permanece abierto a los 450 ms');
    eq(menu.after.expanded, 'false', 'pulsando otra vez se cierra');
    eq(menu.after.hidden, true, 'y vuelve a ocultarse');
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await sleep(600);

  /* ---- 9 · Movimiento reducido ---- */
  console.log('\n[9] Movimiento reducido');
  /* De vuelta al catálogo: las tarjetas y el hero que se comprueban aquí solo
     existen en esa página. */
  await goto(sessionId, url);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await send('Page.reload', {}, sessionId);
  await waitFor(sessionId, 'document.readyState === \'complete\' && !!window.SITE_DATA');
  const reduced = await evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.setcard'));
    const reveals = Array.from(document.querySelectorAll('.reveal'));
    return {
      cards: cards.length,
      invisible: cards.filter(c => parseFloat(getComputedStyle(c).opacity) < 0.99).length,
      revealsInvisible: reveals.filter(r => parseFloat(getComputedStyle(r).opacity) < 0.99).length,
      reveals: reveals.length,
    };
  })()`, sessionId);
  eq(reduced.cards, TOTAL, 'las ' + TOTAL + ' tarjetas se pintan');
  eq(reduced.invisible, 0, 'con movimiento reducido ninguna tarjeta espera al scroll');
  eq(reduced.revealsInvisible, 0, 'ninguno de los ' + reduced.reveals + ' bloques .reveal se queda invisible');

/* ---- 9b · Preloader de ladrillos ---- */
  console.log('\n[9b] Preloader de ladrillos');
  /* Todo lo que se comprueba aquí es el contrato de seguridad del preloader:
     que existe, que sin JavaScript no tapa nada y que, pase lo que pase —el
     módulo no llegue, se quede atascado o las fuentes no respondan—, la web
     acaba viéndose. La animación en sí no se juzga: es un muro de ladrillos
     que entra y sale, y juzgarla exigiría comparar fotogramas, que es trabajo
     de un test visual y no de esta suite.

     Lo que sí se comprueba de la animación es una cosa y es la importante: que
     los ladrillos existen y están detrás del texto. El muro es la mitad de lo
     que el preloader dice —«esto es un catálogo de piezas»— y un preloader
     vacío que solo enseña el nombre se sigue pasando todos los tests. */
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, sessionId);
  await goto(sessionId, homeUrl);
  const introBase = await evaluate(`(() => {
    const ov = document.getElementById('preloader');
    const wall = ov ? ov.querySelector('.preloader__wall') : null;
    const wd = document.getElementById('preloader-word');
    const bricks = ov ? ov.querySelectorAll('.preloader-brick') : [];
    return {
      overlay: !!ov,
      wall: !!wall,
      bricks: bricks.length,
/* Las piezas se animan por CSS, no por un motor: si la animación no se
         despacha, un ladrillo con "animation ... both" se quedaría en el
         primer fotograma — opacidad 0 — para siempre y el muro saldría a
         medias. Se comprueba el nombre de la regla, no el valor de opacidad de
         este instante, que depende de en qué fotograma se cayó la lectura.
         Ojo con las comillas invertidas en este bloque: cerrarían el literal
         de plantilla de más abajo. */
      brickRule: bricks.length ? getComputedStyle(bricks[0]).animationName : '',
      word: !!wd,
      hidden: ov ? ov.getAttribute('aria-hidden') : null,
      bodyVisible: getComputedStyle(document.body).visibility === 'visible',
      /* Sin el atributo el overlay no se pinta. Este es el estado en el que
         está la página en las otras ocho, sin JavaScript y antes de que el
         script de la <head> decida nada. */
      overlayHidden: ov ? getComputedStyle(ov).display === 'none' : false,
      module: !!Array.from(document.scripts).find(s => /preloader\.js$/.test(s.getAttribute('src') || '')),
      gate: Array.from(document.scripts).some(s => !s.src && /lego-intro-seen/.test(s.textContent || '')),
      title: wd ? wd.textContent.trim() : '',
      /* La intro 3D se retiró del todo, no solo de la portada: si se hubiera
         dejado el <canvas> o el preload, la comprobación de recursos de más
         arriba pasaría —el archivo existe— y volvería a haber 675 KB de CDN. */
      noThree: !/three(\.module)?\.min\.js|three@/.test(document.documentElement.innerHTML),
      noIntroEl: !document.getElementById('intro') && !document.getElementById('intro-canvas'),
    };
  })()`, sessionId);
  introBase.overlay ? ok('el overlay del preloader está en el HTML') : err('falta #preloader');
  introBase.wall ? ok('con su muro de ladrillos') : err('falta .preloader__wall');
  eq(introBase.bricks, 8, 'el muro tiene las ocho piezas del 2x4: ' + introBase.bricks);
  eq(introBase.brickRule, 'brick-rise', 'y las piezas se animan por CSS, sin un motor 3D detrás');
  introBase.word ? ok('con el nombre "LEGO Icons": "' + introBase.title + '"') : err('falta #preloader-word');
  eq(introBase.hidden, 'true', 'el overlay es aria-hidden, no repite el título para el lector de pantalla');
  eq(introBase.module, true, 'preloader.js se carga como módulo');
  eq(introBase.gate, true, 'la <head> lleva el script que decide si se juega');
  eq(introBase.overlayHidden, true, 'sin data-intro el overlay no se pinta: sin JS no hay nada que esconder');
  eq(introBase.bodyVisible, true, 'sin data-intro el cuerpo se ve');
  eq(introBase.noThree, true, 'no queda ninguna referencia a Three.js en la portada');
  eq(introBase.noIntroEl, true, 'ni los elementos de la intro 3D que se sustituyeron');

  /* El gating funciona en los dos sentidos: puesto el atributo el contenido de
     detrás queda inutilizable y el overlay se pinta, y al quitarlo todo vuelve
     a su sitio. Si cualquiera de las dos mitades fallara, el preloader o bien
     no taparía nada —y la transición final no significaría nada— o bien dejaría
     la web inerte para siempre.

     Lo que NO se comprueba es que el <body> esté invisible, y a propósito: se
     tapó con visibility:hidden en una versión anterior y hundía el LCP de la
     portada de 472 ms a 8160 ms. El overlay tapa la web sin necesidad de
     dejar de pintarla. */
  const gate = await evaluate(`(async () => {
    const root = document.documentElement;
    root.setAttribute('data-intro', 'pending');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const ov = getComputedStyle(document.getElementById('preloader')).display !== 'none';
    const locked = getComputedStyle(document.body).overflow === 'hidden';
    /* El atributo inert es lo que impide tabular hasta la cabecera mientras
       esta tapada. Ojo: dentro de este literal de plantilla no puede haber
       comillas invertidas, porque cerrarian el literal. */
    const inert = document.querySelector('header').hasAttribute('inert');
    const painted = getComputedStyle(document.body).visibility === 'visible';
    root.removeAttribute('data-intro');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      overlayShown: ov, locked, inert, painted,
      released: !document.querySelector('header').hasAttribute('inert'),
      scrollBack: getComputedStyle(document.body).overflow !== 'hidden',
    };
  })()`, sessionId);
  eq(gate.overlayShown, true, 'con data-intro="pending" el overlay se pinta encima de todo');
  eq(gate.locked, true, 'y el scroll queda bloqueado');
  eq(gate.inert, true, 'el contenido de detrás queda inert, sin foco ni puntero');
  eq(gate.painted, true, 'pero el <body> se sigue pintando: el preloader no puede hundir el LCP');
  eq(gate.released, true, 'al retirar el atributo el contenido vuelve a ser utilizable');
  eq(gate.scrollBack, true, 'y el scroll se desbloquea');

/* Ahora sí, el preloader de verdad: se borra la marca de "ya vista" y se pone la
     llave que desactiva la inyección del principio, de modo que el script de la
     <head> lo juegue en condiciones reales. */
  const playIntro = async (reduced) => {
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }],
    }, sessionId);
    await evaluate("try { sessionStorage.setItem('e2e-intro', '1'); sessionStorage.removeItem('lego-intro-seen'); } catch (e) {}", sessionId);
    await send('Page.navigate', { url: homeUrl }, sessionId);
    await waitFor(sessionId, 'document.readyState === \'complete\'');
    const started = await evaluate("document.documentElement.getAttribute('data-intro')", sessionId);
    /* Se sondea en vez de usar `waitFor` porque hay que guardar si
       `data-intro-live` apareció en algún momento, y esa marca solo existe
       mientras el preloader se levanta: cuando haya terminado ya no estará y la
       comprobación daría un falso negativo. La espera es más larga que todo el
       preloader con margen: el reloj de la <head> salta a los 5,2 s y la red
       de seguridad del módulo a los 9. */
    let live = false;
    let gone = false;
    for (let i = 0; i < 130; i++) {
      const state = await evaluate(`JSON.stringify({
        live: document.documentElement.hasAttribute('data-intro-live'),
        attr: document.documentElement.hasAttribute('data-intro'),
      })`, sessionId);
      const st = JSON.parse(state);
      if (st.live) live = true;
      if (!st.attr) { gone = true; break; }
      await sleep(100);
    }
    return {
      started, live, gone,
      visible: await evaluate("getComputedStyle(document.body).visibility === 'visible'", sessionId),
    };
  };

  const played = await playIntro(false);
  played.started ? ok('sin marca de visita previa, el preloader se pone') : err('el preloader no arrancó: data-intro = ' + played.started);
  eq(played.gone, true, 'el atributo se retira siempre: la web no se puede quedar tapada');
  eq(played.visible, true, 'y al terminar el cuerpo está visible');
  /* El reloj de la <head> no puede cortar el preloader por la mitad. Se comprueba
     la marca que pone el módulo al arrancar: sin ella, el reloj de seguridad de
     5,2 s destaparía la web mientras el muro todavía se está levantando. Es el
     mismo fallo que tenía la intro 3D cuando la descarga del CDN tardaba más
     que el reloj, y por eso la marca se conserva aunque ya no haya descarga
     externa que esperar. */
  eq(played.live, true, 'el módulo se hace cargo del reloj al arrancar');
  eq(await evaluate("document.documentElement.hasAttribute('data-intro-live')", sessionId), false, 'y suelta la marca al terminar, sin dejar estado');

  const skipped = await playIntro(true);
  eq(skipped.started, null, 'con movimiento reducido no se pone y la web se ve directamente');

  /* Se deshace la llave para que el resto de la suite vaya con la intro
     saltada, como estaba al principio. */
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, sessionId);
  await evaluate("try { sessionStorage.removeItem('e2e-intro'); sessionStorage.setItem('lego-intro-seen', '1'); } catch (e) {}", sessionId);
  await goto(sessionId, url);

  /* ---- 9c · Las tres secciones nuevas de la portada ---- */
  console.log('\n[9c] Marquesina, polaroids y tiendas');
  /* Estas tres no tienen motor propio: el CSS hace el bucle, el revelado y las
     sombras de los marcos. Lo que se comprueba aquí no es que se muevan —eso
     sería un test visual— sino las tres cosas que, si fallan, rompen el bloque
     sin que se note en una captura: que la pista de la marquesina no encaje
     consigo misma, que la rejilla de fotos se cave al fallar los archivos, y
     que las tiendas affirmen datos que el sitio no tiene. */
  await goto(sessionId, homeUrl);

  const marquee = await evaluate(`(() => {
    const wrap = document.querySelector('.marquee');
    const track = wrap ? wrap.querySelector('.marquee__track') : null;
    const sets = wrap ? Array.from(wrap.querySelectorAll('.marquee__set')) : [];
    const items = sets[0] ? Array.from(sets[0].children).map(n => n.textContent.trim()) : [];
    const ts = getComputedStyle(track);
    return {
      present: !!wrap,
      sets: sets.length,
      items: items.length,
      /* El bucle solo es invisible si las dos copias son idénticas carácter a
         carácter: el salto de -50% cae en el punto en el que la serie se repite
         sobre sí misma y, si una copia es un pelo más corta, se ve el costón. */
      identical: sets.length === 2
        && Array.from(sets[1].children).map(n => n.textContent.trim()).join('|') === items.join('|'),
      firstRead: sets.length ? sets[0].getAttribute('aria-hidden') : 'MISSING',
      secondHidden: sets.length > 1 ? sets[1].getAttribute('aria-hidden') : 'MISSING',
      wrapHidden: wrap ? wrap.getAttribute('aria-hidden') : 'MISSING',
      /* Sin comillas invertidas en este bloque: cerrarían el literal de
         plantilla. El ancho max-content es lo que hace que la mitad de la
         pista sea la mitad de la serie. Con un 100% el -50% se pararía a
         mitad de una palabra y el bucle daría un tirón. */
      width: ts.width,
      maxContent: ts.width !== 'auto' && !/%$/.test(ts.width),
      rule: ts.animationName,
      duration: ts.animationDuration,
    };
  })()`, sessionId);
  marquee.present ? ok('la marquesina está en la portada') : err('falta .marquee');
  eq(marquee.sets, 2, 'la pista lleva dos copias');
  eq(marquee.identical, true, 'y son idénticas: sin costón en el bucle');
  eq(marquee.items, 6, 'con seis motivos cada copia');
  eq(marquee.wrapHidden, null, 'el contenedor NO es aria-hidden, o los motivos no se leerían');
  eq(marquee.firstRead, null, 'la primera copia se lee entera');
  eq(marquee.secondHidden, 'true', 'y solo la segunda se esconde: si no, se dirían dos veces');
  eq(marquee.rule, 'marquee-slide', 'el desplazamiento lo hace el CSS');
  eq(marquee.duration, '26s', 'a una velocidad constante');
  marquee.maxContent ? ok('la pista mide su contenido, con lo que -50% es la mitad exacta') : err('la pista no mide su contenido: el salto de -50% no encaja');

  /* Con movimiento reducido la marquesina tiene que quedarse quieta pero
     seguir leyéndose entera: si el `animation: none` coupe también la
     overflowing, solo se vería el primer motivo. */
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await send('Page.reload', {}, sessionId);
  await waitFor(sessionId, 'document.readyState === \'complete\'');
  const marqueeStill = await evaluate(`(() => {
    const wrap = document.querySelector('.marquee');
    const ts = wrap ? getComputedStyle(wrap.querySelector('.marquee__track')) : null;
    const first = wrap ? wrap.querySelector('.marquee__item') : null;
    return {
      rule: ts ? ts.animationName : 'MISSING',
      /* La serie no se recorta a un motivo: es lo que delata el 'overflow:
         hidden' añadido de más al aplicar el movimiento reducido. */
      visible: first ? first.getBoundingClientRect().width > 0 : false,
      count: wrap ? wrap.querySelectorAll('.marquee__set').length : 0,
    };
  })()`, sessionId);
  eq(marqueeStill.rule, 'none', 'con movimiento reducido la marquesina no se mueve');
  eq(marqueeStill.visible, true, 'pero los motivos siguen en pantalla');
  eq(marqueeStill.count, 2, 'y no se recorta a una sola copia');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, sessionId);

  /* Los polaroids: las fotos no existen y por eso van con `[data-img]`. Lo que
     importa no solo es que el sustituto aparezca, sino que el marco conserve su
     proporción mientras aparece: el `aspect-ratio` va en el marco y no en la
     imagen, y si estuviera en la imagen el hueco del esqueleto sería de cero y
     la rejilla se bajaría al fallar los cuatro archivos. */
  const pol = await evaluate(`(async () => {
    const figs = Array.from(document.querySelectorAll('.polaroid'));
    const trace = [];
    for (const f of figs) {
      /* Traer cada marco a la vista antes de esperarlo. Las cuatro fotos van
         con loading="lazy": sin el scrollIntoView el navegador no las pide
         nunca, no hay error que dispensar y el marco se queda en "loading"
         para siempre. Es el mismo fallo que arrastraba la sección 11 hasta que
         dejó de barrer la página con un paso fijo. */
      f.scrollIntoView({ block: 'center' });
      const box = f.querySelector('[data-img]');
      for (let i = 0; i < 100; i++) {
        const s = box ? box.getAttribute('data-state') : null;
        if (s === 'error' || s === 'loaded') break;
        await new Promise(r => setTimeout(r, 100));
      }
      const img = f.querySelector('img');
      trace.push({
        cap: (f.querySelector('.polaroid__cap') || {}).textContent || '',
        state: box ? box.getAttribute('data-state') : 'NOBOX',
        fallback: !!(box && box.querySelector('.imgbox__fallback')),
        imgHidden: img ? img.getAttribute('aria-hidden') === 'true' : null,
        alt: img ? img.getAttribute('alt') : null,
        noscript: !!f.querySelector('noscript imgbox__fallback-note, noscript'),
        /* El marco, no la imagen: es lo que mide si el hueco se mantiene. */
        ratio: getComputedStyle(f.querySelector('.polaroid__frame')).aspectRatio,
        w: Math.round(f.querySelector('.polaroid__frame').getBoundingClientRect().width),
        h: Math.round(f.querySelector('.polaroid__frame').getBoundingClientRect().height),
        tilt: getComputedStyle(f).getPropertyValue('--tilt').trim(),
      });
    }
    const giant = document.querySelector('.reveal-giant');
    return {
      count: figs.length,
      trace,
      /* Sin comillas invertidas en este bloque. La inclinación sale de una
         variable --tilt por foto en el marcado. Dos fotos con la misma serían
         la «regla» que el efecto debe evitar. */
      tilts: trace.map(t => t.tilt),
      giant: giant ? {
        isReveal: giant.classList.contains('reveal'),
        visibleByDefault: getComputedStyle(giant).opacity !== '0',
      } : null,
    };
  })()`, sessionId);
  /* Se vuelve arriba antes de medir nada más: las comprobaciones siguientes
     leen estilos calculados y las scrolls dejan la página a media altura. */
  await evaluate('window.scrollTo(0, 0)', sessionId);
  eq(pol.count, 4, 'hay cuatro polaroids');
  eq(pol.trace.filter(t => t.state === 'error').length, 4, 'las cuatro fotos ausentes llegan al estado de error');
  eq(pol.trace.filter(t => t.fallback).length, 4, 'y las cuatro reciben el sustituto de main.js');
  eq(pol.trace.filter(t => t.imgHidden).length, 4, 'las imágenes rotas se ocultan y no se anuncian');
  eq(pol.trace.filter(t => t.alt && t.alt.length > 20).length, 4, 'las cuatro tienen alt descriptivo, no vacío ni "foto"');
  eq(pol.trace.filter(t => t.noscript).length, 4, 'las cuatro traen su <noscript> con el enlace al original');
  eq([...new Set(pol.tilts)].length, 4, 'cada foto va inclinada de forma distinta');
  eq(pol.trace.filter(t => t.ratio === '1 / 1').length, 4, 'los cuatro marcos conservan su proporción con la foto ya rota');
  eq(pol.trace.filter(t => t.w > 0 && Math.abs(t.w - t.h) <= 1).length, 4, 'y los cuatro son cuadrados de verdad, sin colapsarse');
  pol.giant ? null : err('falta el titular gigante .reveal-giant');
  if (pol.giant) {
    eq(pol.giant.isReveal, true, 'el titular gigante usa el revelado por scroll que ya existía');
    eq(pol.giant.visibleByDefault, true, 'y es visible sin depender del JavaScript: la animación no puede esconder contenido');
  }

  /* Las tiendas: esto es un control sobre el contenido, no sobre el estilo. La
     primera versión del bloque tenía direcciones y horarios reales de tiendas
     que existen y no tienen nada que ver con este catálogo, y el texto decía
     que los precios se comprobaban aquí, cuando `site-data.js` afirma que son
     de referencia y pueden no coincidir. Dos frases concretas y creíbles
     introducen más daño que ocho fotos ausentes. */
  const shops = await evaluate(`(() => {
    const sec = document.querySelector('#tiendas');
    const list = sec ? Array.from(sec.querySelectorAll('.shop')) : [];
    return {
      present: !!sec,
      count: list.length,
      labelled: sec ? sec.getAttribute('aria-labelledby') === 'tiendas-title' && !!sec.querySelector('#tiendas-title') : false,
      tags: list.filter(s => s.querySelector('.shop__tag')).length,
      /* Sin comillas invertidas en este bloque. La dirección tiene que
         seguir siendo un dato en la tipografía de máquina, se lea donde se
         lea: es lo que se copia a un mapa. */
      mono: list.filter(s => getComputedStyle(s.querySelector('.shop__addr')).fontFamily.indexOf('mono') !== -1).length,
      /* Calles que existen de verdad. Se comprueban una a una porque el patrón
         de «Ejemplo» no basta: lo que no puede aparecer es una calle real. */
      realStreets: list.map(s => s.querySelector('.shop__addr').textContent)
        .filter(t => /Alcal|Diagonal|Russafa|Gran Via|Passeig|Carrer de [A-Z]|Calle de [A-Z]/.test(t)),
      claims: (sec ? sec.textContent : '').replace(/\\s+/g, ' '),
      mapHidden: sec ? (sec.querySelector('.shops__map') || { getAttribute: () => 'MISSING' }).getAttribute('aria-hidden') : 'MISSING',
      pins: sec ? sec.querySelectorAll('.shops__pin').length : 0,
    };
  })()`, sessionId);
  shops.present ? ok('la sección de tiendas está en la portada') : err('falta #tiendas');
  eq(shops.count, 3, 'con tres tiendas');
  eq(shops.labelled, true, 'la sección se anuncia por su propio título');
  eq(shops.tags, 3, 'las tres marcan que el dato es de ejemplo');
  eq(shops.mono, 3, 'las tres direcciones van en tipografía de máquina');
  eq(shops.realStreets.length, 0, 'ninguna dirección es una calle real: ' + (shops.realStreets.join(', ') || 'ninguna'));
  eq(shops.claims.indexOf('los comprobamos nosotros'), -1, 'el texto no afirma que los precios se comprueben aquí, porque site-data.js dice lo contrario');
  eq(shops.claims.indexOf('de referencia') > -1, true, '…y sí dice la parte buena: que el precio es de referencia y puede no coincidir');
  eq(shops.mapHidden, 'true', 'el plano es aria-hidden: es un dibujo, y la información está en la lista');
  eq(shops.pins, 3, 'y lleva un chinchón por tienda, sin información que solo exista en el plano');

  /* Se deja la sesión donde estaba: la sección 11 recorre las tarjetas del
     catálogo y cuenta 18. Con la portada abierta contaría las cuatro que hay
     en ella y las siete comprobaciones siguientes fallarían sin que hubiera
     nada roto — es lo que pasó la primera vez que se añadió esta sección. */
  await goto(sessionId, url);

  /* ---- 10 · Errores finales ---- */
  console.log('\n[10] Consola tras toda la interacción');
  consoleErrors.length === 0 ? ok('sin excepciones en toda la sesión') : err(consoleErrors.slice(0, 5).join(' | '));

  /* ---- 11 · Imágenes y sustitutos ---- */
  console.log('\n[11] Imágenes y sustitutos');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }, sessionId);
  await send('Page.reload', {}, sessionId);
  await waitFor(sessionId, 'document.readyState === \'complete\' && !!window.SITE_DATA');

  const imgs = await evaluate(`(async () => {
    /* Recorrer las 12 tarjetas una a una: traer cada una a la vista y
       esperar a que su propia caja llegue a un estado terminal. Antes se
       barria la pagina con un paso fijo de 110 ms y despues se media, y con
       la maquina cargada las tres ultimas tarjetas no llegaban a pedir su
       foto —van con loading="lazy"— asi que seguian en "loading" y se
       reportaba que solo nueve de las doce habian recibido el sustituto.
       Atarse al estado real de cada imagen quita la carrera. */
    const cards = Array.from(document.querySelectorAll('.setcard'));
    const trace = [];
    for (const c of cards) {
      c.scrollIntoView({ block: 'center' });
      const box = c.querySelector('[data-img]');
      for (let i = 0; i < 100; i++) {
        const s = box ? box.getAttribute('data-state') : null;
        if (s === 'error' || s === 'loaded') break;
        await new Promise(r => setTimeout(r, 100));
      }
      trace.push((c.dataset.setId || '?') + ':' + (box ? box.getAttribute('data-state') : 'NOBOX'));
    }
    window.scrollTo(0, 0);
    /* El hero aparece con una transicion de opacidad. Leerla en cuanto se
       vuelve arriba devolvia 0.999 con el esqueleto en 0.0008, es decir a
       mitad de transicion, y esas dos comprobaciones fallaban sin que
       hubiera nada roto. Se espera a que los dos valores se queden quietos. */
    /* El marco ilustrado del hero solo está en la portada. En el catálogo no
       hay nada que leer y preguntar por él devolvía null, que reventaba el
       getComputedStyle de más abajo y escondía el resto de la sección. */
    const heroEl = document.querySelector('.hero__frame .imgbox__el');
    const heroSk = document.querySelector('.hero__frame .imgbox__skeleton');
    let prevPair = null, stablePair = 0;
    if (heroEl && heroSk) {
      for (let i = 0; i < 100; i++) {
        const pair = getComputedStyle(heroEl).opacity + '|' + getComputedStyle(heroSk).opacity;
        if (pair === prevPair) { if (++stablePair >= 5) break; } else { stablePair = 0; prevPair = pair; }
        await new Promise(r => setTimeout(r, 100));
      }
    }
    return {
      trace,
      cards: cards.map(c => {
        const box = c.querySelector('[data-img]');
        const fb = box ? box.querySelector('.imgbox__fallback') : null;
        const img = box ? box.querySelector('img') : null;
        return {
          id: c.dataset.setId,
          state: box ? box.getAttribute('data-state') : null,
          hasFallback: !!fb,
          title: fb ? (fb.querySelector('.imgbox__fallback-title') || {}).textContent : '',
          meta: fb ? (fb.querySelector('.imgbox__fallback-path') || {}).textContent : '',
          icon: fb ? !!fb.querySelector('svg use') : false,
          glass: fb ? getComputedStyle(fb).backdropFilter : 'none',
          imgHidden: img ? img.getAttribute('aria-hidden') === 'true' : null,
          titleMatches: fb ? (fb.querySelector('.imgbox__fallback-title').textContent.indexOf(c.querySelector('.setcard__title').textContent) !== -1) : false,
        };
      }),
      liveRegions: document.querySelectorAll('[data-img-announcer][role=status]').length,
      hero: (document.querySelector('.hero__frame[data-img]') || {}).getAttribute ? document.querySelector('.hero__frame[data-img]').getAttribute('data-state') : null,
      heroOpacity: heroEl ? getComputedStyle(heroEl).opacity : null,
      skeletonOpacity: heroSk ? getComputedStyle(heroSk).opacity : null,
    };
  })()`, sessionId);

  const errCards = imgs.cards.filter(c => c.state === 'error');
  const stuck = imgs.trace.filter((t) => !/:(error|loaded)$/.test(t));
  stuck.length ? console.log('  aviso    imágenes que no terminaron: ' + stuck.join(', ')) : null;
  const good = imgs.cards.filter(c => c.state === 'loaded');
  eq(good.length, 0, 'ninguna tarjeta da por buena una imagen que no existe');
  eq(errCards.length, TOTAL, 'las ' + TOTAL + ' fotos ausentes pasan por el estado de error y reciben un sustituto');
  eq(errCards.filter(c => c.hasFallback).length, TOTAL, 'los ' + TOTAL + ' sustitutos se inyectan en el DOM');
  eq(errCards.filter(c => c.titleMatches).length, TOTAL, 'cada sustituto nombra el set que representa, no solo el número');
  eq(errCards.filter(c => c.icon).length, TOTAL, 'los ' + TOTAL + ' sustitutos llevan el icono de su categoría');
  eq(errCards.filter(c => /blur/.test(c.glass)).length, TOTAL, 'los ' + TOTAL + ' sustitutos usan glassmorphism');
  eq(errCards.filter(c => c.imgHidden).length, TOTAL, 'las ' + TOTAL + ' imágenes rotas se ocultan y dejan de anunciarse');
  eq(errCards.filter(c => c.meta && c.meta.length > 2).length, TOTAL, 'los ' + TOTAL + ' sustitutos indican la categoría');
  eq(imgs.liveRegions, 1, 'hay un único nodo aria-live para los avisos de imagen');

  /* El hero vive solo en la portada, así que se va allí a comprobarlo. Antes
     se preguntaba por él en el catálogo, donde nunca existió: devolvía null y
     `getComputedStyle(null)` tumbaba la sección entera. */
  await goto(sessionId, homeUrl);
  const hero = await evaluate(`(async () => {
    const frame = document.querySelector('.hero__frame[data-img]');
    if (!frame) return { missing: true };
    const el = frame.querySelector('.imgbox__el');
    const sk = frame.querySelector('.imgbox__skeleton');
    let prev = null, stable = 0;
    for (let i = 0; i < 100; i++) {
      const pair = getComputedStyle(el).opacity + '|' + getComputedStyle(sk).opacity;
      if (pair === prev) { if (++stable >= 5) break; } else { stable = 0; prev = pair; }
      await new Promise(r => setTimeout(r, 100));
    }
    return {
      state: frame.getAttribute('data-state'),
      elOpacity: getComputedStyle(el).opacity,
      skOpacity: getComputedStyle(sk).opacity,
      complete: el.complete && el.naturalWidth > 0,
    };
  })()`, sessionId);
  hero.missing ? err('la portada no tiene el marco del hero') : null;
  if (!hero.missing) {
    eq(hero.complete, true, 'el SVG del hero carga de verdad');
    eq(hero.state, 'loaded', 'y la caja llega al estado loaded');
    eq(hero.elOpacity, '1', 'la ilustración del hero queda visible');
    eq(hero.skOpacity, '0', 'y el skeleton se retira al cargar');
  }
  await goto(sessionId, url);

  /* Sin JavaScript el catálogo tiene que seguir siendo legible: es un sitio
     estático y no puede depender del script para enseñar los datos. */
  await send('Emulation.setScriptExecutionDisabled', { value: true }, sessionId);
  await send('Page.reload', {}, sessionId);
  /* Con los scripts desactivados SITE_DATA no puede existir, asi que aqui
     solo se espera a que el documento termine de cargar. */
  await waitFor(sessionId, 'document.readyState === \'complete\'');
  let noJs = null;
  try {
    noJs = await evaluate(`(() => {
      const cards = Array.from(document.querySelectorAll('.setcard'));
      const cs = (el) => el ? getComputedStyle(el) : null;
      return {
        htmlClass: document.documentElement.className,
        cards: cards.length,
        invisible: cards.filter(c => parseFloat(cs(c).opacity) < 0.99).length,
        titles: cards.filter(c => c.querySelector('.setcard__title').textContent.trim()).length,
        prices: cards.filter(c => c.querySelector('.setcard__price').textContent.trim()).length,
        counter: (document.querySelector('[data-count-sets]') || {}).textContent || '',
        heroOpacity: cs(document.querySelector('.hero__frame .imgbox__el')) ? cs(document.querySelector('.hero__frame .imgbox__el')).opacity : null,
      };
    })()`, sessionId);
  } catch (e) {
    noJs = { error: e.message };
  }
  await send('Emulation.setScriptExecutionDisabled', { value: false }, sessionId);

  noJs.error ? err('no se ha podido evaluar la página sin JavaScript: ' + noJs.error) : null;
  if (noJs && !noJs.error) {
    noJs.htmlClass.indexOf('no-js') !== -1 ? ok('sin JS la página conserva la marca no-js') : err('la marca no-js no se aplica: ' + noJs.htmlClass);
    eq(noJs.cards, TOTAL, 'sin JS las ' + TOTAL + ' tarjetas siguen en el HTML');
    eq(noJs.titles, TOTAL, 'sin JS los ' + TOTAL + ' títulos son legibles');
    /* Cuenta filas `.setcard__price`, no importes: la ficha sin precio también
     imprime la suya, con «Precio pendiente» y «sin confirmar», y esa fila es
     justamente lo que no puede desaparecer sin JavaScript. Por eso aquí va
     el total de sets y no el número de los que tienen cifra. */
  eq(noJs.prices, TOTAL, 'sin JS los ' + TOTAL + ' precios están impresos en la página');
    eq(noJs.invisible, 0, 'sin JS ninguna tarjeta queda en opacidad 0 esperando al script');
    eq(noJs.counter, String(TOTAL), 'sin JS el contador estático dice ' + TOTAL);
    /* El marco del hero solo existe en la portada. En el catálogo esta lectura
       daba null y la comprobación fallaba siempre. */
    noJs.heroOpacity === null
      ? ok('el hero no se comprueba aquí: el catálogo no tiene marco de hero')
      : eq(noJs.heroOpacity, '1', 'sin JS la imagen del hero se ve directamente');
  }

  /* ---- 12 · SEO, datos estructurados y páginas legales ---- */
  console.log('\n[12] SEO, datos estructurados y legal');
  await send('Page.reload', {}, sessionId);
  await waitFor(sessionId, 'document.readyState === \'complete\' && !!window.SITE_DATA');

  /* El canonical esperado se resuelve AQUÍ, en Node, y no leyendo
     window.SITE_DATA desde la página. El motivo es que site-data.js calcula
     SITE_URL a partir de process.env, y el navegador no tiene process.env:
     si se leyera del navegador, en CI daría siempre vacío y el test
     compararía el canonical real contra null, fallando en producción y
     dando verde en local. Resolverlo en Node mantiene la comparación con
     sentido en los dos entornos. */
  const canonicalEsperado = require('../assets/js/site-data.js').pageUrl('catalogo') || '';

  const seo = await evaluate(`(() => {
    const cfg = window.SITE_DATA || {};
    const canonical = document.querySelector('link[rel=canonical]');
    const og = (p) => { const n = document.querySelector('meta[property="' + p + '"]'); return n ? n.content : null; };
    const tw = (n) => { const e = document.querySelector('meta[name="' + n + '"]'); return e ? e.content : null; };
    const ld = (() => {
      try {
        const d = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
        const g = d['@graph'];
        const list = g.find(n => n['@type'] === 'ItemList');
        const products = g.filter(n => n['@type'] === 'Product');
        return {
          error: null,
          nodes: g.length,
          itemList: !!list,
          itemCount: list ? list.itemListElement.length : 0,
          itemRefs: list ? list.itemListElement.map(i => i.url) : [],
          products: products.length,
          skus: products.map(p => p.sku),
          /* El set sin precio no puede llevar oferta: sería inventarla. */
          noOffer: products.filter(p => !p.offers).map(p => p.sku),
          offerPrices: products.filter(p => p.offers).map(p => String(p.offers.price || p.offers.lowPrice || '')),
          withRating: products.filter(p => p.aggregateRating).length,
          sellerNodes: g.filter(n => /AggregateOffer|shippingDetails|hasMerchantReturnPolicy|returnShippingFee/.test(JSON.stringify(n))).length,
          withImage: products.filter(p => p.image).length,
          withSpec: products.filter(p => p.offers && p.offers.priceSpecification).length,
          specTypes: products.filter(p => p.offers).map(p => p.offers.priceSpecification.map(s => s['@type']).join('+')).filter((v, i, a) => a.indexOf(v) === i),
          offerUrls: products.filter(p => p.offers).map(p => p.offers.url),
          /* El SKU viaja con la URL para poder comprobar cada oferta contra
             el set que dice representar. Antes solo se miraba la forma de la
             URL, lo que daba el mismo veredicto a 12 enlaces correctos y a
             uno que apuntara a un producto equivocado. */
          offerSkus: products.filter(p => p.offers).map(p => p.sku),
          brand: (products[0] || {}).brand || null,
        };
      } catch (e) { return { error: e.message }; }
    })();
    return {
      canonical: canonical ? canonical.href : null,
      cfgCanonical: null,
      ogUrl: og('og:url'),
      ogImage: og('og:image'),
      ogImageW: og('og:image:width'),
      ogLocale: og('og:locale'),
      twCard: tw('twitter:card'),
      title: document.title,
      desc: (document.querySelector('meta[name=description]') || {}).content || '',
      lang: document.documentElement.lang,
      legalLinks: Array.from(document.querySelectorAll('.footer__legal a')).map(a => a.getAttribute('href')),
      cfgLegalPaths: cfg.legalLinks ? cfg.legalLinks().map(l => cfg.path(l.href, 0)).join(',') : null,
      copyright: (document.querySelector('[data-copyright]') || {}).textContent || '',
      company: ((document.querySelector('.footer__legal-name') || {}).textContent || '').trim(),
      cfgCompany: ((cfg.COMPANY_LEGAL || {}).name || '').trim(),
      legalNotice: (cfg.META_BRAND || {}).legalNotice || '',
      footerDisclosure: ((document.querySelector('.footer__disclosure') || {}).textContent || '').replace(/\\s+/g, ' ').trim(),
      footerAbout: ((document.querySelector('.footer__about .muted') || {}).textContent || '').replace(/\\s+/g, ' ').trim(),
      ld,
    };
  })()`, sessionId);
  /* El desarrollo del aviso vive en la página de transparencia, así que se
     descarga y se lee aparte: preguntar por él en el catálogo devolvía vacío. */
  seo.affStatus = 0;
  seo.affProse = '';
  try {
    const aff = await evaluate(`(async () => {
      const r = await fetch('/transparencia.html');
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return { status: r.status, text: ((doc.getElementById('afiliacion-prose') || {}).textContent || '').replace(/\\s+/g, ' ').trim() };
    })()`, sessionId);
    seo.affStatus = aff.status;
    seo.affProse = aff.text;
  } catch (e) {
    err('no se ha podido leer el aviso de afiliación: ' + e.message);
  }
  seo.cfgCanonical = canonicalEsperado || null;

  eq(seo.lang, 'es', 'el documento declara lang="es"');
  /* Cada página lleva su propio canonical desde que el sitio se partió en
     cinco. Compararlo con CANONICAL_URL, que es la raíz, daba un fallo en
     cuanto se cargaba cualquier página que no fuera la portada. */
  eq(seo.canonical, seo.cfgCanonical, 'el canonical coincide con SITE_DATA.pageUrl de la página');
  eq(seo.ogUrl, seo.cfgCanonical, 'og:url coincide con el canonical');
    /* Las etiquetas que necesitan una URL absoluta solo se comprueban si
       SITE_URL se ha resuelto. En local no lo está, y entonces el HTML las
       omite a propósito: es preferible no declarar canonical a declarar uno
       inventado. Que en producción no falten lo garantiza tools/check-env.js. */
    if (seo.cfgCanonical) {
      seo.ogImage && seo.ogImage.startsWith('https://') ? ok('og:image es absoluta (' + seo.ogImage + ')') : err('og:image no es absoluta: ' + seo.ogImage);
      eq(seo.ogImageW, '1200', 'og:image:width declarado');
    } else {
      !seo.ogImage ? ok('sin og:image: SITE_URL no está resuelto, y no se inventa una URL') : err('og:image presente sin SITE_URL resuelto: ' + seo.ogImage);
    }
  eq(seo.ogLocale, 'es_ES', 'og:locale declarado');
  eq(seo.twCard, 'summary_large_image', 'twitter:card es summary_large_image');
  seo.title.length > 10 && seo.title.length <= 70 ? ok('el title cabe en el límite de Google (' + seo.title.length + ' caracteres)') : err('title fuera de rango: ' + seo.title.length);
  seo.desc.length > 50 && seo.desc.length <= 160 ? ok('la meta description cabe en el snippet (' + seo.desc.length + ' caracteres)') : err('description fuera de rango: ' + seo.desc.length);

  seo.ld.error ? err('el JSON-LD no parsea: ' + seo.ld.error) : ok('el JSON-LD es válido (' + seo.ld.nodes + ' nodos)');
  seo.ld.itemList ? ok('el JSON-LD incluye ItemList') : err('falta ItemList');
  eq(seo.ld.itemCount, TOTAL, 'ItemList enumera los ' + TOTAL + ' sets');
  eq(seo.ld.products, TOTAL, 'hay ' + TOTAL + ' nodos Product');
  eq(seo.ld.noOffer.join(','), '21066', 'el único Product sin oferta es el 21066, el que no tiene precio');
  eq(seo.ld.withRating, 0, 'ningún Product lleva aggregateRating inventado');
  eq(seo.ld.sellerNodes, 0, 'no hay nodos de vendedor, envío ni devoluciones');
  eq(seo.ld.withImage, 0, 'no se declara ninguna imagen inexistente en el JSON-LD');
  eq(seo.ld.withSpec, PRICED, `las ${PRICED} ofertas con precio declaran su priceSpecification`);
  eq(seo.ld.specTypes.join(','), 'UnitPriceSpecification', 'y solo usan UnitPriceSpecification, sin ListPrice inventado');
  eq(seo.ld.offerSkus.length, PRICED, `y hay una oferta por cada uno de los ${PRICED} sets con precio`);
    /* La url de cada oferta tiene que ser la que los datos declaran para ese
       set: el enlace de afiliado cuando existe, y la ficha del catálogo
       cuando no. La comparación es contra `site-data.js` y no contra un
       dominio escrito a mano, para que la prueba no pase en local y falle
       en producción en cuanto SITE_URL se resuelva. Antes solo se miraba la
       forma de la url (#set-1234) porque todas apuntaban a la ficha; con los
       afiliados ya rellenos eso daba 0 de 17 y el mensaje era ilegible. */
    if (seo.cfgCanonical) {
      const base = seo.cfgCanonical.replace(/\/+$/, '');
      const byId = new Map(SETS.map((s) => [String(s.id), s]));
      const esperado = (s) => s.affiliateUrl || (base + '/#set-' + s.id);
      const Wrong = [];
      seo.ld.offerSkus.forEach((sku, i) => {
        const s = byId.get(String(sku));
        const got = seo.ld.offerUrls[i];
        if (!s) Wrong.push(sku + ': set desconocido en la configuración');
        else if (got !== esperado(s)) Wrong.push(sku + ': ' + got + ' ≠ ' + esperado(s));
      });
      Wrong.length === 0
        ? ok('las ' + seo.ld.offerSkus.length + ' urls de oferta apuntan al destino que declara cada set (' + WITH_AFFILIATE + ' afiliados y ' + NO_AFFILIATE + ' fichas)')
        : err(Wrong.length + ' de ' + seo.ld.offerSkus.length + ' urls de oferta no apuntan al destino declarado: ' + Wrong.join(' | '));
    } else {
      ok('sin urls de oferta absolutas: SITE_URL no está resuelto');
    }
  seo.ld.brand && seo.ld.brand.name === 'LEGO Group' ? ok('los Product declaran la marca LEGO Group') : err('marca inesperada: ' + JSON.stringify(seo.ld.brand));

  eq(seo.legalLinks.join(','), seo.cfgLegalPaths, 'los enlaces legales del pie salen de la configuración y en relativo');
  seo.legalLinks.every(h => !h.startsWith('/')) ? ok('ningún enlace del pie es absoluto, así funciona en una subruta') : err('hay enlaces absolutos en el pie: ' + seo.legalLinks.filter(h => h.startsWith('/')).join(','));
  eq(seo.company, seo.cfgCompany, 'el pie nombra la razón social de SITE_DATA.COMPANY_LEGAL');
  seo.copyright.includes(String(new Date().getFullYear())) ? ok('el copyright incluye el año en curso') : err('el copyright no tiene el año: ' + seo.copyright);
  seo.copyright.includes(seo.legalNotice) ? ok('el copyright repite el aviso de marca de la configuración') : err('el copyright no incluye META_BRAND.legalNotice');
  !/undefined|\[object|NaN/.test(seo.copyright + seo.company) ? ok('no se ha filtrado undefined, NaN ni [object a la página') : err('hay un valor sin resolver en el pie');
  /* El aviso de afiliación se reparte ahora en dos sitios: una línea corta en el
     pie de todas las páginas y el desarrollo largo en transparencia.html. Antes
     se leía un `.disclosure__inner` que ya no existe en ninguna, así que el
     texto salía vacío y dos de las tres comprobaciones fallaban por un selector
     muerto mientras la tercera pasaba sin comprobar nada. */
  /no somos una tienda/i.test(seo.footerDisclosure + seo.footerAbout)
    ? ok('el pie aclara que el sitio no es una tienda')
    : err('el pie no aclara el modelo de negocio: ' + seo.footerDisclosure);
  /no cobra comisi/i.test(seo.footerDisclosure)
    ? ok('y el aviso corto dice que no cobra comisión')
    : err('el aviso corto del pie no menciona la comisión: ' + seo.footerDisclosure);
  eq(seo.affStatus, 200, 'la página de transparencia responde 200');
  eq(seo.affProse.length > 0, true, 'y trae el desarrollo del aviso de afiliación');
  /No vendemos/i.test(seo.affProse) ? ok('el aviso largo niega que se venda algo') : err('el aviso largo no niega la venta: ' + seo.affProse);
  /no tenemos carrito/i.test(seo.affProse) ? ok('y que no hay carrito') : err('el aviso largo no dice que no hay carrito: ' + seo.affProse);
  /tienda de un tercero/i.test(seo.affProse) ? ok('y que el enlace lleva a una tienda externa') : err('el aviso largo no explica a dónde lleva el enlace: ' + seo.affProse);
  /reserva|stock|checkout|devoluci/i.test(seo.affProse) ? err('el aviso de afiliación promete algo que el sitio no hace: ' + seo.affProse) : ok('el aviso no promete reservas, stock, checkout ni devoluciones');

  const legal = await evaluate(`(async () => {
    const r = await fetch('/politica-privacidad');
    const html = await r.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      status: r.status,
      h1: (doc.querySelector('h1') || {}).textContent || '',
      sections: doc.querySelectorAll('.legal__body h2').length,
      canonical: (doc.querySelector('link[rel=canonical]') || {}).href || '',
      cfgCanonical: (window.SITE_DATA || {}).CANONICAL_URL || '',
      robots: (doc.querySelector('meta[name=robots]') || {}).content || '',
      leftoverTokens: (html.match(/\{\{\w+\}\}/g) || []).length,
      hasDisclaimer: /plantilla/i.test(html),
      internalHrefs: Array.from(doc.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && !/^(https?:|mailto:|tel:|data:|#)/i.test(h)),
    };
  })()`, sessionId);
  /* El canonical legal se deriva de la raíz del sitio, no del canonical de la
     página que se está conduciendo: el primero es un directorio y el segundo
     un fichero, y encadenarlos producía una ruta que no existe. */
  legal.cfgCanonical = require('../assets/js/site-data.js').CANONICAL_URL || '';
  eq(legal.status, 200, '/politica-privacidad responde 200');
  eq(legal.h1, 'Política de privacidad', 'la página legal conserva su h1');
  legal.sections >= 6 ? ok('la página legal tiene ' + legal.sections + ' apartados') : err('solo ' + legal.sections + ' apartados');
  /* El canonical legal tiene que ser el de esa página, no el de la home.
     Solo se comprueba cuando SITE_URL está resuelto; si no, el HTML lo omite
     a propósito. Que no falte en producción lo comprueba tools/check-env.js. */
  if (legal.cfgCanonical) {
    const esperado = legal.cfgCanonical.replace(/\/+$/, '') + '/politica-privacidad/';
    legal.canonical === esperado
      ? ok('la página legal tiene canonical propio: ' + legal.canonical)
      : err('canonical legal inesperado: ' + legal.canonical + ' (se esperaba ' + esperado + ')');
  } else {
    !legal.canonical ? ok('sin canonical legal: SITE_URL no está resuelto') : err('canonical legal presente sin SITE_URL resuelto: ' + legal.canonical);
  }
  eq(legal.robots, 'noindex, follow', 'las páginas legales están en noindex, follow');
  eq(legal.leftoverTokens, 0, 'no quedan tokens {{...}} sin sustituir');
  eq(legal.hasDisclaimer, true, 'las páginas legales declaran ser plantilla sin valor jurídico');
  const badHrefs = legal.internalHrefs.filter((h) => !h.startsWith('../'));
  badHrefs.length === 0
    ? ok('los ' + legal.internalHrefs.length + ' enlaces internos de la página legal suben un nivel ("../")')
    : err(badHrefs.length + ' enlace(s) interno(s) no suben de nivel: ' + badHrefs.join(', '));
}

main()
  .then(() => {
    console.log('\n' + '='.repeat(58));
    console.log(failed ? `  ${passed} correctas · ${failed} FALLOS` : `  ${passed} comprobaciones correctas · 0 fallos`);
    console.log('='.repeat(58));
  })
  .catch((e) => {
    console.error('\nError: ' + e.message);
    failed++;
  })
  .finally(async () => {
    stop();
    /* En Windows el perfil temporal no se puede borrar en cuanto muere el
       proceso: el sistema tarda en soltar los descriptores, y con la maquina
       cargada el unico rmSync fallaba y el directorio se quedaba en %TEMP%
       para siempre. Se reintenta con margen y, si aun asi no se puede, se
       avisa en vez de callar el fallo. */
    let removed = false;
    for (let i = 0; i < 25 && !removed; i++) {
      try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); removed = true; }
      catch { await sleep(200); }
    }
    if (!removed) console.log('  aviso    no se pudo borrar el perfil temporal ' + profile);
    process.exit(failed ? 1 : 0);
  });
