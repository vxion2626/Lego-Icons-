/* Preloader de ladrillos: un muro de ocho piezas que se levanta y el nombre
   debajo. Solo se ejecuta si el script de la <head> puso `data-intro` en el
   <html>, o sea: en la portada, la primera vez de cada sesión y sin
   `prefers-reduced-motion`. Ese script es también el que destapa la web si este
   módulo no llega a correr, así que el reparto es deliberado: la red de
   seguridad no depende de este fichero.

   Sustituye a una intro 3D que montaba el mismo ladrillo con Three.js. Todo lo
   que se ve aquí lo anima CSS —las piezas entran con `brick-rise` y el nombre
   con una `transition`— y este módulo solo decide CUÁNDO se destapa. La
   ventaja no es el peso: es que ya no hay un bucle de `requestAnimationFrame`
   que pueda quedarse atascado ni una librería que pueda no descargarse. El peor
   caso de este preloader es que se vea un poco más tarde, no que la web se
   quede cerrada. */
'use strict';

const root = document.documentElement;
const overlay = document.getElementById('preloader');
const word = document.getElementById('preloader-word');

/* --- Cronograma, en milisegundos ------------------------------------------
   Todo lo esperable está en CSS y solo se coordina aquí. Los números vienen
   del bloque `preloader` de la hoja de estilos, así que si se tocan hay que
   tocarlos en los dos sitios: la última pieza entra en 530 ms y dura 400, o
   sea que el muro está entero en 930. */
const T = {
  wallUp: 940,
  wordAt: 1000,
  /* Suelo del tiempo en pantalla, no del trabajo. Si las fuentes llegan antes
     —casi siempre, si vienen de caché— no se acorta: una pantalla que aparece
     y se va en 600 ms no se lee. */
  exitAt: 1900,
  /* Techo de la espera por las fuentes. Está por debajo de los 5,2 s del reloj
     de la <head> a propósito: si una petición de fuente se queda colgada, este
     módulo tiene que llegar a destapar la web él mismo y no delegar en el
     reloj de seguridad, que está pensado para el caso de que este módulo no
     llegue a ejecutarse. */
  fontsCap: 2600,
  fadeDur: 380,
  /* Margen tras `done` para que entre el escalonado del hero. */
  settle: 1100,
};

const timers = [];
const later = (fn, ms) => {
  timers.push(window.setTimeout(fn, ms));
};

function cleanup() {
  for (const id of timers) window.clearTimeout(id);
  timers.length = 0;
  root.removeAttribute('data-intro');
  root.removeAttribute('data-intro-live');
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
}

/* Estado de `data-intro` en el <html>. Tres valores, todos escritos aquí y en
   el bloque 16 del CSS: `pending` (se está levantando el muro), `leaving` (los
   ladrillos ya están y solo se desvanece el fondo) y `done` (se enseña la web y
   entra el escalonado). Al final se quita el atributo y se deja la página tal
   cual, sin estado residual. */
function setPhase(phase) {
  root.setAttribute('data-intro', phase);
}

/* Espera a que las tipografías estén disponibles, con techo.

   Es la razón de que esto sea un preloader y no un splash: mientras el overlay
   tape, las fuentes se descargan y se aplican, y cuando se destapa el texto de
   debajo ya está en su tipografía definitiva. Sin esta espera el titular de la
   portada se pinta con la de reserva y cambia de ancho al llegar Anton, que es
   un salto visible justo en el momento en que el ojo empieza a fijarse.

   `document.fonts.ready` resuelve una sola vez y nunca rechaza, pero un
   `Promise.race` con un temporizador hace que el módulo no dependa de que eso
   siga siendo cierto: si mañana la API cambia, el preloader sigue destapando.
   El temporizador perdedor se limpia para no dejar un callback suelto. */
function fontsSettled() {
  if (!document.fonts || !document.fonts.ready) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let cap = 0;
    const done = (v) => {
      window.clearTimeout(cap);
      resolve(v);
    };
    cap = window.setTimeout(() => done(false), T.fontsCap);
    document.fonts.ready.then(() => done(true), () => done(false));
  });
}

/* La salida. Se separó de la entrada porque es la parte que no puede fallar:
   cualquier error antes de aquí solo afecta a lo que se ve, y cualquier error
   aquí dejaría la web cerrada. */
function finish() {
  setPhase('leaving');
  later(() => {
    setPhase('done');
    later(cleanup, T.settle);
  }, T.fadeDur);
}

function run() {
  /* El nombre entra cuando el muro ya está entero. Antes se cruzaría con las
     dos últimas piezas y los dos textos competirían por el centro. */
  later(() => {
    if (word) word.setAttribute('data-visible', '');
  }, T.wordAt);

  /* El reloj arranca ya, en paralelo con la espera de fuentes: si tardan, el
     suelo sigue siendo `exitAt` desde este momento, no desde que resuelvan. */
  const floorAt = performance.now() + T.exitAt;
  fontsSettled().then(() => {
    /* Si el mínimo se pasó mientras se esperaban las fuentes no se alarga la
       espera, y si las fuentes impidieron llegar al suelo se destapa en cuanto
       llegan. */
    const wait = Math.max(0, floorAt - performance.now());
    later(finish, wait);
  });
}

(function main() {
  /* Solo tiene sentido si la <head> decidió que toca. Esto cubre el caso de
     que el módulo llegue tarde, por ejemplo con la pestaña en segundo plano, y
     el preloader ya haya pasado o no llegara a empezar. */
  if (root.getAttribute('data-intro') !== 'pending') return;

  /* A partir de aquí el preloader es nuestro y el reloj de la <head> deja de
     mandar. La marca existe justo para eso: mientras esté puesta, el reloj de
     seguridad no retira el atributo, así que no puede cortar el preloader por
     la mitad y enseñar la web debajo mientras el muro todavía se levanta. */
  root.setAttribute('data-intro-live', '');

  if (!overlay) {
    cleanup();
    return;
  }

  try {
    run();
  } catch (err) {
    console.warn('Preloader: fallo al arrancar, se salta.', err);
    cleanup();
  }
})();

/* Red de seguridad propia. El `cleanup` del final cubre los caminos felices,
   pero este temporizador también recoge el caso raro de que el proceso se quede
   atascado sin llegar a la salida. Va muy por encima de los ~2,4 s que dura el
   preloader: si se dispara, el problema es de verdad y el sitio tiene que verse
   igualmente. */
window.setTimeout(cleanup, 9000);