/* Prueba manual de la resolucion de URL en los cuatro escenarios.
   No forma parte de la suite: es para comprobar el resolver a mano.
   Uso: node tools/url-scenarios.js                                       */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCENARIOS = [
  { name: 'local sin nada configurado -> cae en la URL por defecto', env: {} },
  { name: 'el repo real, que es lo que se publica', env: { GITHUB_REPOSITORY: 'vxion2626/lego-icons' } },
  { name: 'GitHub Actions, proyecto owner/lego-icons', env: { GITHUB_REPOSITORY: 'duro-software-citas/lego-icons', GITHUB_REPOSITORY_OWNER: 'duro-software-citas' } },
  { name: 'GitHub Actions, sitio de usuario owner.github.io', env: { GITHUB_REPOSITORY: 'duro-software-citas/duro-software-citas.github.io', GITHUB_REPOSITORY_OWNER: 'duro-software-citas' } },
  { name: 'SITE_URL explicito con barra final', env: { SITE_URL: 'https://catalogo.midominio.es/', SITE_BASE: '/lego-icons/', GITHUB_REPOSITORY: 'duro-software-citas/lego-icons' } },
  { name: 'dominio propio en la raiz (SITE_BASE=/)', env: { SITE_URL: 'https://midominio.es', SITE_BASE: '/' } },
  { name: 'URL completa, con y sin barra final', env: { SITE_URL: 'https://duro-software-citas.github.io/lego-icons' } },
  { name: 'dominio sin esquema', env: { SITE_URL: 'midominio.es', SITE_BASE: '/' } },
  /* Un SITE_URL que no se puede parsear no se propaga: se descarta y se usa el
     valor por defecto, que es una URL real. Antes esto se quedaba sin URL
     alguna; ahora es un dato malo que se descarta en vez de un sitio sin
     canonical. */
  { name: 'SITE_URL invalido: se descarta y se usa el valor por defecto', env: { SITE_URL: 'javascript:alert(1)' } },
];

const probe = 'const d = require("./assets/js/site-data.js");'
  + ' console.log(JSON.stringify({ url: d.SITE_URL, base: d.SITE_BASE, canonical: d.CANONICAL_URL,'
  + ' urlSource: d.SITE_URL_SOURCE, baseSource: d.SITE_BASE_SOURCE, setUrl: d.url("/#set-21065") }));';

for (const s of SCENARIOS) {
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  for (const [k, v] of Object.entries(s.env)) env[k] = v;
  const out = execFileSync(process.execPath, ['-e', probe], { cwd: ROOT, env, encoding: 'utf8' });
  const r = JSON.parse(out.trim());
  console.log('\n  ' + s.name);
  console.log('    SITE_URL      ' + (r.url || '(sin resolver)') + '   [fuente: ' + r.urlSource + ']');
  console.log('    SITE_BASE     ' + (r.base === '' ? '(raíz, sin subruta)' : r.base) + '   [fuente: ' + r.baseSource + ']');
  console.log('    CANONICAL_URL ' + (r.canonical || '(vacía: se omiten canonical, og:url y las URL del JSON-LD)'));
  console.log('    url("#set-…") ' + (r.setUrl || '(vacía)'));
  /* Si el canonical vino del valor por defecto mientras el entorno decía otra
     cosa, es la señal de que el repo se ha renombrado. */
  if (r.urlSource === 'default' && s.env.GITHUB_REPOSITORY) {
    console.log('    AVISO: el entorno declara ' + s.env.GITHUB_REPOSITORY + ' pero se ha usado el valor por defecto.');
  }
}
console.log('');
