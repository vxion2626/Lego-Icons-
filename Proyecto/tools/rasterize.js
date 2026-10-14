/* Rasteriza un SVG a PNG usando Edge/Chrome por CDP, sin dependencias.
   Uso: node tools/rasterize.js <entrada.svg> <salida.png> [ancho] [alto] */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const input = process.argv[2];
const output = process.argv[3];
const width = Number(process.argv[4] || 1200);
const height = Number(process.argv[5] || 630);

if (!input || !output) {
  console.error('Uso: node tools/rasterize.js <entrada.svg> <salida.png> [ancho] [alto]');
  process.exit(2);
}
if (!fs.existsSync(input)) {
  console.error('No existe el archivo de entrada: ' + input);
  process.exit(2);
}

  const { requireBrowser, killBrowser } = require('./browser');
  const bin = requireBrowser();

const PORT = 9733 + (process.pid % 200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'raster-'));
const chrome = spawn(bin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-device-scale-factor=1',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--window-size=' + width + ',' + height, 'about:blank',
], { stdio: 'ignore' });

/* El cierre lo hace el modulo compartido, que sabe que en Windows hay que
   matar el arbol de procesos entero y no solo el padre. */
const stop = () => killBrowser(chrome);

let ws, id = 0;
const pending = new Map();

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    const timer = setTimeout(() => {
      pending.delete(msg.id);
      reject(new Error('Tiempo agotado en ' + method));
    }, 30000);
    pending.set(msg.id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    ws.send(JSON.stringify(msg));
  });
}

async function main() {
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
      if (m.error) reject(new Error(m.error.message));
      else resolve(m.result);
    }
  };

  const { sessionId } = await send('Target.attachToTarget', { targetId: target.id, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, sessionId);

  const svg = fs.readFileSync(input, 'utf8');
  const html = '<!doctype html><meta charset="utf-8">'
    + '<style>html,body{margin:0;padding:0;background:#0C0C0E;overflow:hidden}'
    + 'svg{display:block;width:' + width + 'px;height:' + height + 'px}</style>'
    + svg;

  await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) }, sessionId);
  await sleep(1200);

  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false, fromSurface: true,
  }, sessionId);
  if (!shot.data) throw new Error('El navegador no devolvió la imagen');
  fs.writeFileSync(output, Buffer.from(shot.data, 'base64'));
  console.log('OK  ' + output + '  ' + width + 'x' + height + '  '
    + Math.round(fs.statSync(output).size / 1024) + ' KB');
}

main()
  .catch((e) => { console.error('Error: ' + e.message); process.exitCode = 1; })
  .finally(async () => {
    stop();
    await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* noop */ }
    process.exit(process.exitCode || 0);
  });
