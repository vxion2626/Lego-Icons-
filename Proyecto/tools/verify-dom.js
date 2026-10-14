/* Comprueba sobre el DOM ya ejecutado por el navegador que el JS ha corrido
   y que no ha roto nada. Uso: node tools/verify-dom.js <dump.html> */
'use strict';
const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('Falta el volcado del DOM'); process.exit(2); }
const dom = fs.readFileSync(file, 'utf8');

let errors = 0;
const err = (m) => { errors++; console.log('  FALLO   ' + m); };
const ok = (m) => console.log('  ok      ' + m);
const has = (re) => re.test(dom);

/* 1 · El JS se ha ejecutado */
console.log('\n[1] Ejecución de main.js');
const header = dom.match(/<header[^>]*id="site-header"[^>]*>/);
if (!header) err('no se encuentra el header');
else {
  const stuck = /data-stuck="(true|false)"/.exec(header[0]);
  stuck ? ok('initHeader ejecutado · data-stuck=' + stuck[1]) : err('initHeader no/langóó: falta data-stuck');
}

const progress = /<[^>]*id="scroll-progress"[^>]*style="([^"]*)"/.exec(dom);
progress && /--p/.test(progress[1])
  ? ok('barra de progreso pintada · ' + progress[1].slice(0, 40))
  : err('la barra de progreso no ha recibido --p');

/* 2 · Visor 3D */
console.log('\n[2] Visor 3D');
const model = /<div class="viewer__model[^"]*"[^>]*id="viewer-model"[^>]*style="([^"]*)"/.exec(dom)
           || /<[^>]*id="viewer-model"[^>]*style="([^"]*)"/.exec(dom);
if (!model) err('no se encuentra #viewer-model con style inline');
else {
  const s = model[1];
  ['--rx', '--ry', '--gap'].forEach((v) => (s.includes(v) ? ok(v + ' aplicado') : err(v + ' no aplicado')));
}
const range = /<input[^>]*id="explode-range"[^>]*>/.exec(dom);
if (!range) err('no se encuentra #explode-range');
else {
  /value="34"/.test(range[0]) ? ok('el slider conserva el valor 34') : err('el slider perdió su valor');
  /--fill/.test(range[0]) ? ok('el slider tiene --fill para el relleno') : err('falta --fill en el slider');
  /aria-valuetext/.test(range[0]) ? ok('aria-valuetext descriptive') : err('falta aria-valuetext en el slider');
}
const readout = /id="explode-value"[^>]*>([^<]*)</.exec(dom);
readout ? ok('lectura del visor: "' + readout[1] + '"') : err('no se encuentra #explode-value');

/* 3 · Contadores */
console.log('\n[3] Contadores');
const counters = [...dom.matchAll(/data-count="([\d.]+)"[^>]*>([^<]*)</g)];
if (!counters.length) err('no hay nodos con data-count');
counters.forEach(([, target, shown]) => {
  const t = Number(target);
  const norm = (s) => s.replace(/ /g, ' ').trim();
  const expected = norm(t % 1 !== 0 ? t.toFixed(1).replace('.', ',') : String(Math.round(t)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  norm(shown) === expected
    ? ok(`data-count="${target}" → "${shown}"`)
    : err(`data-count="${target}" muestra "${shown}", se esperaba "${expected}"`);
});

/* 4 · Pestañas */
console.log('\n[4] Pestañas de modelo');
const tabs = [...dom.matchAll(/<button[^>]*role="tab"[^>]*>/g)];
if (tabs.length < 3) err('se esperaban 3 pestañas, hay ' + tabs.length);
else {
  const selected = tabs.filter((t) => /aria-selected="true"/.test(t[0])).length;
  const focusable = tabs.filter((t) => !/tabindex="-1"/.test(t[0])).length;
  selected === 1 ? ok('exactamente una pestaña aria-selected="true"') : err(tabs.length + ' pestañas, ' + selected + ' seleccionadas');
  focusable === 1 ? ok('roving tabindex: solo una enfocable') : err(focusable + ' pestañas enfocables a la vez');
}
const hiddenPanels = [...dom.matchAll(/id="panel-[a-z]+"[^>]*hidden/g)];
hiddenPanels.length === tabs.length - 1
  ? ok(tabs.length - 1 + ' paneles ocultos, 1 visible')
  : err('paneles ocultos: ' + hiddenPanels.length + ', se esperaban ' + (tabs.length - 1));

/* 5 · Acordeón */
console.log('\n[5] Acordeón FAQ');
const faqBtns = [...dom.matchAll(/<button[^>]*class="faq__q"[^>]*aria-expanded="(\w+)"/g)];
if (faqBtns.length !== 6) err('se esperaban 6 preguntas, hay ' + faqBtns.length);
else ok('6 preguntas con aria-expanded');
const openPanels = [...dom.matchAll(/class="faq__a"[^>]*data-open="true"/g)];
openPanels.length === 0 ? ok('ningún panel abierto al cargar') : err(openPanels.length + ' paneles abiertos al cargar');

/* 6 · Formularios */
console.log('\n[6] Formularios');
has(/id="checkout-summary"[^>]*hidden/) ? ok('el resumen de errores arranca oculto') : err('el resumen de errores no está oculto');
has(/id="checkout-ok"[^>]*hidden/) ? ok('el mensaje de éxito arranca oculto') : err('el mensaje de éxito no está oculto');
const invalid = [...dom.matchAll(/data-invalid="true"/g)];
invalid.length === 0 ? ok('ningún campo marcado como inválido al cargar') : err(invalid.length + ' campos marcados inválidos al cargar');

/* 7 · Menú móvil */
console.log('\n[7] Menú móvil');
const toggle = /<button[^>]*id="nav-toggle"[^>]*aria-expanded="(\w+)"/.exec(dom);
toggle ? ok('nav-toggle aria-expanded=' + toggle[1]) : err('nav-toggle sin aria-expanded');
has(/id="nav-drawer"[^>]*hidden/) ? ok('el drawer arranca oculto') : err('el drawer no está oculto');

/* 8 · CTA fija */
console.log('\n[8] Barra de conversión');
const sticky = /id="sticky-cta"[^>]*data-visible="(\w+)"/.exec(dom) || /data-visible="(\w+)"[^>]*id="sticky-cta"/.exec(dom);
sticky ? ok('sticky-cta data-visible=' + sticky[1]) : err('sticky-cta sin data-visible');

/* 9 · Enlaces de navegación activos */
console.log('\n[9] Navegación activa');
const current = [...dom.matchAll(/aria-current="true"/g)];
ok(current.length + ' enlace(s) marcados como actuales');

/* 10 · Errores de recursos */
console.log('\n[10] Recursos');
const imgs = [...dom.matchAll(/<img[^>]*src="([^"]+)"/g)];
ok(imgs.length + ' imágenes referenciadas en el DOM');

console.log('\n' + '='.repeat(58));
console.log(errors ? `  ${errors} fallo(s)` : '  DOM verificado sin fallos');
console.log('='.repeat(58));
process.exit(errors ? 1 : 0);
