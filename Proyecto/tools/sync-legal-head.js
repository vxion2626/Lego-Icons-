/* Aplica el bloque de cabecera legal a las cuatro páginas legales.
   Uso: node tools/sync-legal-head.js
   Reduce el riesgo de que las cuatro copias se desincronicen entre sí. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const head = `<a class="brand" href="../" aria-label="LEGO Icons, ir al inicio">
      <span class="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" focusable="false">
          <rect x="2" y="9" width="20" height="4" rx="0.6"></rect>
          <rect x="2" y="15" width="20" height="4" rx="0.6"></rect>
          <rect x="5" y="5.5" width="4" height="3" rx="0.5"></rect>
          <rect x="12" y="5.5" width="4" height="3" rx="0.5"></rect>
          <rect x="9" y="12" width="4" height="3" rx="0.5"></rect>
          <rect x="5" y="19.5" width="4" height="2" rx="0.5"></rect>
          <rect x="12" y="19.5" width="4" height="2" rx="0.5"></rect>
        </svg>
      </span>
      <span class="brand__name">LEGO Icons</span>
    </a>
    <a class="btn btn--ghost" href="../">Volver a la tienda</a>`;

const START = '<!-- legal-head:start -->';
const END = '<!-- legal-head:end -->';

let changed = 0;
for (const dir of ['politica-privacidad', 'terminos-y-condiciones', 'cookies', 'aviso-legal']) {
  const file = path.join(root, dir, 'index.html');
  if (!fs.existsSync(file)) { console.error('falta ' + dir); continue; }
  let html = fs.readFileSync(file, 'utf8');
  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  if (!re.test(html)) { console.error(dir + ': sin marcadores legal-head'); continue; }
  const next = html.replace(re, START + '\n    ' + head + '\n    ' + END);
  if (next !== html) { fs.writeFileSync(file, next, 'utf8'); changed++; console.log('  actualizado ' + dir); }
}
if (!changed) console.log('cabeceras legales ya sincronizadas');
