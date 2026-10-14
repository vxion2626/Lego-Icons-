/* Render real en Edge/Chrome headless: vuelca el DOM ya ejecutado por el
   navegador y una captura de pantalla, para verificar que el JS no falla y
   que la maquetación no se rompe.
   Uso: node tools/render.js [url] [salida.png] [ancho] [alto] */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const url = process.argv[2] || 'http://localhost:8137/';
const shot = process.argv[3] || path.join(os.tmpdir(), 'legoicons.png');
const width = process.argv[4] || '1440';
const height = process.argv[5] || '2400';

const { requireBrowser } = require('./browser');
const bin = requireBrowser();
console.log('Navegador: ' + bin);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
const dump = shot.replace(/\.png$/, '') + '.html';

const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--virtual-time-budget=6000',
  '--enable-logging=stderr',
  '--v=0',
  '--user-data-dir=' + profile,
  '--window-size=' + width + ',' + height,
  '--screenshot=' + shot,
  '--dump-dom',
  url,
];

try {
  const out = execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(dump, out, 'utf8');
  console.log('DOM volcado en ' + dump + ' (' + out.length + ' bytes)');
  console.log('Captura en ' + shot + (fs.existsSync(shot) ? ' (' + fs.statSync(shot).size + ' bytes)' : ' (NO GENERADA)'));
} catch (e) {
  const err = (e.stderr || '') + (e.stdout || '');
  console.error(err.split('\n').filter((l) => /ERROR|Uncaught|SEVERE/i.test(l)).slice(0, 20).join('\n'));
  process.exitCode = 1;
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
}
