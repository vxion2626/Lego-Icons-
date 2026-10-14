/* Comprobación de sintaxis CSS sin dependencias.
   - balance de llaves
   - declaraciones mal terminadas (parseo por bloques, respetando paréntesis)
   - bloques vacíos
   - variables custom sin definir o sin usar
   No sustituye a un autoprefijador ni a las comprobaciones de un navegador. */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'assets/css/styles.css');
const css = fs.readFileSync(file, 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');

let errors = 0;
let warnings = 0;
const err = (line, msg) => { errors++; console.log(`  L${String(line).padStart(4)}  ERROR  ${msg}`); };
const warn = (line, msg) => { warnings++; console.log(`  L${String(line).padStart(4)}  AVISO  ${msg}`); };

/* Normaliza las reglas de una línea ("sel { decls }") a varias líneas para que
   el análisis línea a línea pueda distinguir selectores de declaraciones.
   Se hace antes de indexar las líneas para que los números coincidan. */
const masked = css
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/([^{}\n]+)\{([^{}]*)\}/g, (m, sel, body) =>
    sel.replace(/\s*\n\s*/g, ' ').trim() + ' {\n' + body.replace(/\s*\n\s*/g, '\n').trim() + '\n}'
  );

const lineStarts = [0];
for (let i = 0; i < masked.length; i++) if (masked[i] === '\n') lineStarts.push(i + 1);
const lineOf = (i) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= i) lo = mid; else hi = mid - 1; } return lo + 1; };

/* ---- 1 · Balance de llaves ------------------------------------------- */
console.log('\n[1] Balance de llaves');
const stack = [];
for (let i = 0; i < masked.length; i++) {
  if (masked[i] === '{') stack.push(i);
  else if (masked[i] === '}') { if (!stack.length) err(lineOf(i), 'cierre sin apertura'); else stack.pop(); }
}
stack.forEach((i) => err(lineOf(i), 'apertura sin cierre'));
if (!errors) console.log('  ok      llaves balanceadas');

/* ---- 2 · Declaraciones mal terminadas -------------------------------- */
console.log('\n[2] Declaraciones');
const srcLines = masked.split(/\r?\n/);
const isAtRule = (s) => /^\s*@/.test(s);
/* Un selector con pseudo-elemento (body::after) o con llave no es una
   declaración, aunque empiece por "nombre:". */
const isProperty = (s) => {
  const t = s.trim();
  if (t.includes('::') || t.includes('{')) return false;
  return /^[-a-zA-Z][\w-]*\s*:/.test(t);
};
/* Selectores: clases, etiquetas, pseudo, atributos, combinadores, porcentajes
   de @keyframes y listas de selectores partidas en varias líneas. */
const isSelector = (s) => {
  const t = s.trim();
  if (!t) return false;
  if (t.endsWith(',')) return isSelector(t.slice(0, -1));
  if (/^(from|to|\d*\.?\d+%)$/.test(t)) return true;
  return /^[.#:[a-zA-Z*&>~+[\]="'\-_]/.test(t);
};
const countOf = (s, ch) => (s.split(ch).length - 1);

/* Recorre las líneas de un bloque (first..last, 1-based) validando que cada
   declaración se cierre con ";". Los valores pueden ocupar varias líneas
   siempre que los paréntesis queden abiertos. */
function checkBlockLines(first, last) {
  let parens = 0;
  let declOpen = false;

  for (let ln = first; ln <= last; ln++) {
    let t = srcLines[ln - 1].trim();
    if (!t) continue;

    t = t.replace(/^@[\w-]+[^{]*\{?/, (m) => (m.endsWith('{') ? '@{' : '@')).trim();
    const structural = t.startsWith('@{') || t === '{' || t === '}' || t.startsWith('} ') || t.endsWith('{');

    if (parens === 0) {
      if (isProperty(t)) {
        if (declOpen) err(ln, 'falta ";" antes de esta declaración');
        declOpen = true;
      } else if (!structural && !declOpen && !isSelector(t)) {
        err(ln, 'declaración sin propiedad: ' + t.slice(0, 50));
      }
    }

    parens += countOf(t, '(') - countOf(t, ')');
    if (parens < 0) { err(ln, 'paréntesis sin abrir'); parens = 0; }

    const body = t.replace(/\}$/, '').trim();
    if (parens === 0 && body.endsWith(';')) declOpen = false;
  }

  if (parens > 0) err(last, 'paréntesis sin cerrar en el bloque');
  if (declOpen) err(last, 'la última declaración no lleva ";"');
}

/* Detecta bloques vacíos y delega la validación línea a línea. */
function closingBrace(openIdx) {
  let d = 0;
  for (let i = openIdx; i < masked.length; i++) {
    if (masked[i] === '{') d++;
    else if (masked[i] === '}') { d--; if (d === 0) return i; }
  }
  return -1;
}

for (let i = 0; i < masked.length; i++) {
  if (masked[i] !== '{') continue;
  const close = closingBrace(i);
  if (close < 0) { err(lineOf(i), 'llave sin cerrar'); break; }

  const before = masked.slice(0, i);
  const head = before.slice(before.lastIndexOf('\n') + 1).trim() ||
               (before.split('\n').filter((l) => l.trim()).pop() || '').trim();
  if (!head || (!isAtRule(head) && !isSelector(head))) err(lineOf(i), 'selector no válido: ' + head.slice(0, 50));

  const body = masked.slice(i + 1, close);
  if (!body.trim()) warn(lineOf(i), 'bloque vacío: ' + head.slice(0, 40));
  else checkBlockLines(lineOf(i) + 1, lineOf(close));

  i = close;
}
if (!errors) console.log('  ok      todas las declaraciones terminadas');

/* ---- 3 · Variables custom --------------------------------------------- */
console.log('\n[3] Variables custom');
const defined = new Set([...css.matchAll(/(^|[\s,{;])(--[\w-]+)\s*:/gm)].map((m) => m[2]));
const used = new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));
/* Variables que fija el JS o un style="" en línea, no viven en la hoja */
const external = new Set([
  ...[...js.matchAll(/setProperty\('(--[\w-]+)'/g)].map((m) => m[1]),
  ...[...html.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]),
]);
const undef = [...used].filter((v) => !defined.has(v) && !external.has(v));
const unused = [...defined].filter((v) => !used.has(v) && !external.has(v));
undef.length ? undef.forEach((v) => err(0, 'variable no definida: ' + v)) : console.log(`  ok      ${used.size} variables usadas, todas definidas`);
unused.length ? warn(0, 'variables definidas y no usadas: ' + unused.join(', ')) : console.log('  ok      sin variables huerfanas');

/* ---- 4 · Comprobaciones de WCAG en los tokens ------------------------- */
console.log('\n[4] Contraste de tokens');
function srgb(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.2126 * srgb((n >> 16) & 255) + 0.7152 * srgb((n >> 8) & 255) + 0.0722 * srgb(n & 255);
}
function ratio(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
const token = (name) => { const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`)); return m ? m[1] : null; };
const bg = token('--bg') || '#ffffff';
const surface = token('--surface') || bg;

/* Pares de contraste, cada uno con lo que representa. La lista es explícita
   en vez de generarse a partir de los tokens que existen porque cada token
   puede ser un relleno o un color de texto, y eso decide contra qué hay que
   medirlo: `--brand` es un relleno (va con `--on-brand` encima) y nunca un
   color de primer plano, así que medirlo contra `--bg` no significa nada.
   Lo que sí es color de primer plano es `--brand-ink`, el mismo tono dos
   pasos más oscuro, y ese es el que aparece en iconos y en el degradado del
   titular.

   `--text-3` se mide también sobre `--surface` porque los metadatos de la
   tarjeta y el pie se pintan sobre la superficie y no sobre el papel: un
   token que pasa en `--bg` y falla en `--surface` está mal, aunque en la
   primera comprobación parezca bien. Los tres grises de texto también se
   miden sobre `--surface-2`, que es donde viven los chips y los hueco
   interiores, y sobre `--ink`, que es el fondo de las secciones oscuras. */
const ink = token('--ink') || '#000000';
const rule = token('--rule') || '#767676';
const surface2 = token('--surface-2') || surface;
const accent = token('--accent') || '#ffd500';
[
  ['--text-1', bg, 4.5, 'texto principal sobre el papel'],
  ['--text-2', bg, 4.5, 'texto secundario sobre el papel'],
  ['--text-3', bg, 4.5, 'texto terciario sobre el papel'],
  ['--text-3', surface, 4.5, 'texto terciario sobre la superficie'],
  ['--text-3', surface2, 4.5, 'texto terciario sobre el gris de apoyo'],
  ['--brand-ink', bg, 4.5, 'rojo de texto sobre el papel'],
  ['--brand-ink', surface, 4.5, 'rojo de texto sobre la superficie'],
  ['--on-brand', token('--brand'), 4.5, 'texto sobre el rojo de marca'],
  ['--on-ink', ink, 4.5, 'texto sobre el carbón (CTA secundario, secciones)'],
  ['--on-ink-2', ink, 4.5, 'texto atenuado sobre el carbón'],
  ['--paper', ink, 4.5, 'texto de sección sobre el carbón'],
  ['--ink', rule, 4.5, 'insignia de nivel rápido (gris sobre gris)'],
  ['--ink', accent, 4.5, 'texto del ladrillo amarillo'],
  ['--accent', ink, 4.5, 'antetítulo amarillo sobre el carbón'],
].forEach(([name, against, min, desc]) => {
  const c = token(name);
  if (!c) { warn(0, `token ${name} no encontrado`); return; }
  if (!against) { warn(0, `fondo de referencia para ${name} no encontrado`); return; }
  const r = ratio(c, against);
  r >= min ? console.log(`  ok      ${name} ${c} sobre ${against} = ${r.toFixed(2)}:1 (mín ${min})`)
           : err(0, `${name} ${c} sobre ${against} = ${r.toFixed(2)}:1, por debajo de ${min} (${desc})`);
});

/* ---- 4b · El cromo permitido -------------------------------------------
   La regla de la paleta no es "usar estos N colores", es "no tener más de
   tres colores de marca y que el resto sea una rampa neutra". Un linter que
   solo midiera contraste dejaría pasar un verde nuevo sin despeinarse, así que
   aquí se cuentan los canales: un hex con croma (canal mayor menos canal
   menor) es de color.

   Hay dos listas, y la distinción no es "saturado contra poco saturado" sino
   por papel, porque esa es la diferencia que de verdad decide si un color
   compite con la marca:

     · Los COLORES DE MARCA pueden ser tan saturados como sea. Son tres -rojo,
       amarillo y azul- y son los únicos que pueden shout. La lista es
       explicita, asi que meter un cuarto color obliga a escribir su nombre
       aqui, que es justo el momento en que hay que justificarse.

     · La RAMPA NEUTRA admite croma calido hasta NEUTRAL_CHROMA_MAX. El papel y
       la tinta dejaron de ser gris de maquina cuando la paleta paso a ser
       calida: sin crema y carbon, los tres colores de ladrillo se leian
       pegados encima de un fondo frio y no como parte de la misma escena.

   El tope de 40 separa las dos familias con holgura. Un verde como #4a7c3f
   llega a croma 61 y un purpura como #8e7cc3 a 75: los dos siguen saltando.
   El limite honrado del que hay que ser consciente es el otro extremo: un azul
   muy desaturado, del tipo #3a4a5a, llega a 32 y se colaria como si fuera un
   gris. Es un agujero consciente y no un descuido -un token que se desatura
   tanto se ve gris de todos modos-, pero conviene saber que existe en vez de
   confiar en que la regla es hermetica. */
console.log('\n[4b] Cromo de la paleta');
const allowedChroma = new Set([
  '--brand', '--brand-ink',
  '--accent', '--accent-deep',
  '--blue', '--blue-ink',
]);
/* Tokens que son papel, tinta o un tono de apoyo: neutros por papel aunque
   lleven el croma calido del crema. `--on-*` entran aqui porque son texto
   sobre un color de marca, no un cuarto color. */
const NEUTRAL_TOKENS = new Set([
  '--bg', '--surface', '--surface-2', '--paper',
  '--ink', '--ink-2', '--text-1', '--text-2', '--text-3',
  '--on-ink', '--on-ink-2', '--on-brand', '--on-blue',
  '--line', '--rule',
]);
const CHROMA_MIN = 8;
const NEUTRAL_CHROMA_MAX = 40;
const rootBlock = css.slice(css.indexOf(':root'), css.indexOf('\n}', css.indexOf(':root')) + 2);
const palette = [...rootBlock.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)];
const chromaOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return Math.max((n >> 16) & 255, (n >> 8) & 255, n & 255) - Math.min((n >> 16) & 255, (n >> 8) & 255, n & 255);
};
const offenders = [];
const unknown = [];
for (const [, name, hex] of palette) {
  const ch = chromaOf(hex);
  if (ch <= CHROMA_MIN) continue;
  if (allowedChroma.has(name)) continue;
  if (NEUTRAL_TOKENS.has(name)) {
    if (ch > NEUTRAL_CHROMA_MAX) offenders.push(`${name} ${hex} (croma ${ch}, tope de la rampa ${NEUTRAL_CHROMA_MAX})`);
    continue;
  }
  /* Ni color de marca ni neutro conocido: esto es un token nuevo, y hay que
     decidir en que lista entra antes de que se use. */
  unknown.push(`${name} ${hex} (croma ${ch})`);
  offenders.push(`${name} ${hex} (croma ${ch}, token fuera de las dos listas)`);
}
const chromatic = palette.filter(([, name, hex]) => {
  const ch = chromaOf(hex);
  return ch > CHROMA_MIN && (allowedChroma.has(name) || NEUTRAL_TOKENS.has(name));
});
if (offenders.length) {
  offenders.forEach((o) => err(0, `color fuera de la paleta: ${o}`));
  if (unknown.length) {
    console.log('  token sin clasificar: un --nuevo tiene que entrar en allowedChroma');
    console.log('  (marca) o en NEUTRAL_TOKENS (rampa neutra) antes de usarse');
  }
  console.log('  la paleta admite rojo, amarillo y azul de marca, y una rampa neutra calida');
} else {
  console.log(`  ok      ${palette.length} tokens, ${chromatic.length} con croma (${[...allowedChroma].join(', ')} y la rampa neutra) y el resto gris`);
}

/* ---- 5 · Tamaño mínimo de objetivo táctil ----------------------------- */
console.log('\n[5] Objetivos táctiles');
const smallTargets = [...css.matchAll(/^\s*(\.[\w-]+)\s*\{[^}]*min-height:\s*(\d+)px/gm)]
  .filter(([, , v]) => Number(v) < 44)
  .map(([s, sel, v]) => `${sel.trim()} = ${v}px`);
/* Estos dos avisos entran por `warn` y no por un `console.log` suelto: el
   resumen del final cuenta `warnings`, y con el log directo sérieusement que no
   hubiera nada que contar mientras se imprimen dos avisos debajo. */
smallTargets.length
  ? warn(0, 'min-height por debajo de 44px: ' + smallTargets.join(', '))
  : console.log('  ok      todos los controles declaran min-height suficiente');

console.log('\n' + '='.repeat(58));
console.log(errors ? `  ${errors} ERROR / ${warnings} aviso` : `  Sin errores · ${warnings} avisos`);
console.log('='.repeat(58));
process.exit(errors ? 1 : 0);
