/* Localizador del navegador para las herramientas que conducen Chrome por CDP.
   Vive aquí porque e2e.js, render.js y rasterize.js necesitan exactamente lo
   mismo y cada una llevaba su propia copia de la lista. Tres copias se
   desincronizan: las tres eran solo de Windows, así que ninguna podía correr
   en un runner de Linux o en macOS.

   No necesita dependencias: solo fs y child_process de Node.
   CHROME_PATH tiene prioridad sobre todo lo demás, y es la via que usan los
   runners de CI, donde el navegador se instala en una ruta que no se puede
   adivinar desde aqui. */
'use strict';
const fs = require('fs');
const { spawnSync, execFileSync } = require('child_process');

/* Rutas de instalacion habituales. En Windows se prueban las de los
   instaladores por defecto; en macOS, las de las apps; en Linux, las de los
   paquetes de las distribuciones y las del navegador empaquetado de
   GitHub Actions. */
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/usr/bin/microsoft-edge-stable',
  '/snap/bin/chromium',
  '/opt/google/chrome/chrome',
].filter(Boolean);

/* Nombres con los que se registran los navegadores en el PATH de macOS y
   Linux. Se consultan solo si ninguna ruta fija existe, para no tener que
   mantener una lista por distribucion. */
const NAMES = [
  'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
  'microsoft-edge', 'microsoft-edge-stable', 'brave-browser',
];

const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

function fromPath() {
  if (process.platform === 'win32') return undefined;
  for (const name of NAMES) {
    const hit = spawnSync('which', [name], { encoding: 'utf8' });
    const bin = (hit.stdout || '').trim().split('\n')[0];
    if (hit.status === 0 && bin && exists(bin)) return bin;
  }
  return undefined;
}

function findBrowser() {
  return CANDIDATES.find(exists) || fromPath();
}

function requireBrowser() {
  const bin = findBrowser();
  if (!bin) {
    console.error(
      'No se encuentra Chrome ni Edge.\n' +
      'Instala uno, o define CHROME_PATH con la ruta al ejecutable, por ejemplo:\n' +
      '  CHROME_PATH=/usr/bin/google-chrome node tools/e2e.js'
    );
    process.exit(2);
  }
  return bin;
}

/* En Windows hay que matar el arbol de procesos entero: el proceso que
   lanzamos solo es el padre de los procesos de trabajo, y si se queda vivo
   retiene el puerto de depuracion y el perfil temporal. */
function killBrowser(child) {
  try {
    if (!child || !child.pid) return;
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill();
    }
  } catch { /* el proceso ya habia terminado: noop */ }
}

module.exports = { findBrowser, requireBrowser, killBrowser, CANDIDATES };
