/* ==========================================================================
   LEGO Icons · Catálogo de construcción para adultos
   Comportamiento del sitio. Sin dependencias externas.
   --------------------------------------------------------------------------
    1 · Utilidades
    2 · Cabecera: estado fijo, progreso de lectura, enlace activo
    3 · Menú móvil
    4 · Navegación por anclas con gestión de foco
    5 · Aparición al hacer scroll
    6 · Acordeón de preguntas frecuentes
    7 · Imágenes con skeleton y sustitución
     8 · Catálogo: filtros, búsqueda, orden y conteo
     9 · Visor 3D del bloque
    10 · Arranque
   ========================================================================== */
(function () {
  'use strict';

  /* ======================================================================
     1 · UTILIDADES
     ====================================================================== */
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function prefersReduced() { return reduceMotion.matches; }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  /* Envío de eventos de conversión a la capa de datos, si existe. */
  function track(event, detail) {
    var payload = { event: event, detail: detail || {} };
    if (Array.isArray(window.dataLayer)) window.dataLayer.push(payload);
    /* Se despacha en document y con burbujeo, así se puede escuchar en
       document o en window indistintamente. */
    document.dispatchEvent(new CustomEvent('legoicons:track', { detail: payload, bubbles: true }));
  }

  /* Navegación suave al destino, con el foco movido para lectores de pantalla. */
  function goTo(target) {
    if (!target) return;
    var reduced = prefersReduced();
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }

  /* ======================================================================
     2 · CABECERA
     ====================================================================== */
  function initHeader() {
    var header = $('#site-header');
    var progress = $('#scroll-progress');
    if (!header) return;

    var ticking = false;

    function update() {
      var y = window.scrollY;
      header.setAttribute('data-stuck', y > 12 ? 'true' : 'false');

      if (progress) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.setProperty('--p', max > 0 ? clamp(y / max, 0, 1).toFixed(4) : '0');
      }
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });

    window.addEventListener('resize', update, { passive: true });
    update();

    /* Enlace de navegación marcado como actual según la sección visible. */
    var links = $$('.nav__link');
    var targets = links
      .map(function (link) { return document.getElementById(link.getAttribute('href').slice(1)); })
      .filter(Boolean);

    if (!targets.length || !('IntersectionObserver' in window)) return;

    var visible = new Map();

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visible.set(entry.target.id, entry.intersectionRatio);
        else visible.delete(entry.target.id);
      });

      var bestId = null;
      var bestRatio = 0;
      visible.forEach(function (ratio, id) {
        if (ratio > bestRatio) { bestRatio = ratio; bestId = id; }
      });

      links.forEach(function (link) {
        var isCurrent = bestId !== null && link.getAttribute('href') === '#' + bestId;
        if (isCurrent) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5, 1] });

    targets.forEach(function (target) { spy.observe(target); });
  }

  /* ======================================================================
     3 · MENÚ MÓVIL
     ====================================================================== */
  function initDrawer() {
    var toggle = $('#nav-toggle');
    var drawer = $('#nav-drawer');
    if (!toggle || !drawer) return;

      function isOpen() { return toggle.getAttribute('aria-expanded') === 'true'; }

      /* Al mostrar u ocultar el panel, el navegador reajusta el scroll de la
         página (scroll anchoring), y eso dispara el evento scroll de este
         mismo listener. Sin esta marca, abrir el menú lo cerraba acto
         seguido: el panel se veía aparecer y desaparecer. Con ella se ignora
         el reajuste que nosotros mismos acabamos de provocar. */
      var adjusting = false;
      function settle() {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { adjusting = false; });
        });
      }

      function open() {
        adjusting = true;
        drawer.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        $('.sr-only', toggle).textContent = 'Cerrar menú de navegación';
        settle();
      }

      function close(returnFocus) {
        adjusting = true;
        drawer.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        $('.sr-only', toggle).textContent = 'Abrir menú de navegación';
        if (returnFocus) toggle.focus();
        settle();
      }

    toggle.addEventListener('click', function () {
      if (isOpen()) close(false);
      else open();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isOpen()) close(true);
    });

    $$('a', drawer).forEach(function (link) {
      link.addEventListener('click', function () { close(false); });
    });

    /* Clic fuera del panel: cierra y devuelve el foco al botón. */
    document.addEventListener('click', function (event) {
      if (!isOpen()) return;
      if (drawer.contains(event.target) || toggle.contains(event.target)) return;
      close(true);
    });

    /* La cabecera es fija: si la página se desplaza con el panel abierto,
       este quedaría flotando sobre el contenido. Se cierra sin mover el foco
       para no interrumpir a quien esté navegando con teclado. */
      window.addEventListener('scroll', function () {
        if (adjusting) return;
        if (isOpen()) close(false);
      }, { passive: true });

    var desktop = window.matchMedia('(min-width: 940px)');
    var onChange = function (event) { if (event.matches) close(false); };
    if (desktop.addEventListener) desktop.addEventListener('change', onChange);
    else if (desktop.addListener) desktop.addListener(onChange);
  }

  /* ======================================================================
     4 · ANCLAS CON GESTIÓN DE FOCO
     ====================================================================== */
  function initAnchors() {
    var ids = ['coleccion', 'experiencia', 'detalles', 'opiniones', 'faq', 'checkout', 'problema', 'top'];

    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    });

    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[href^="#"]');
      if (!link) return;

      var hash = link.getAttribute('href');
      if (!hash || hash === '#' || link.hasAttribute('data-no-scroll')) return;

      var target = document.getElementById(hash.slice(1));
      if (!target) return;

      event.preventDefault();
      track('cta_click', { cta: link.dataset.cta || 'anchor', target: hash, label: link.textContent.trim().slice(0, 60) });

      goTo(target);

      if (history.replaceState) history.replaceState(null, '', hash);
    });
  }

  /* ======================================================================
     5 · APARICIÓN AL HACER SCROLL
     ====================================================================== */
  function initReveal() {
    var items = $$('.reveal');
    if (!items.length) return;

    if (prefersReduced() || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ======================================================================
     11 · ACORDEÓN DE PREGUNTAS FRECUENTES
     ====================================================================== */
  function initFaq() {
    var buttons = $$('.faq__q');
    if (!buttons.length) return;

    function panelOf(button) { return document.getElementById(button.getAttribute('aria-controls')); }

    function setOpen(button, open) {
      var panel = panelOf(button);
      if (!panel) return;
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.setAttribute('data-open', open ? 'true' : 'false');
    }

    function closeAll(except) {
      buttons.forEach(function (button) {
        if (button !== except) setOpen(button, false);
      });
    }

    buttons.forEach(function (button, index) {
      button.addEventListener('click', function () {
        var willOpen = button.getAttribute('aria-expanded') !== 'true';
        closeAll(button);
        setOpen(button, willOpen);
        if (willOpen) track('faq_open', { question: button.textContent.trim().slice(0, 60) });
      });

      button.addEventListener('keydown', function (event) {
        var next = null;

        switch (event.key) {
          case 'ArrowDown': next = buttons[(index + 1) % buttons.length]; break;
          case 'ArrowUp':   next = buttons[(index - 1 + buttons.length) % buttons.length]; break;
          case 'Home':      next = buttons[0]; break;
          case 'End':       next = buttons[buttons.length - 1]; break;
          case 'Escape':    if (button.getAttribute('aria-expanded') === 'true') { setOpen(button, false); } return;
          default: return;
        }

        event.preventDefault();
        next.focus();
      });
    });
  }

  /* ======================================================================
     13 · IMÁGENES CON PLACEHOLDER Y FALLBACK
     ======================================================================
     Equivalente en vanilla del componente <ImageWithFallback> de React.

     Cada contenedor [data-img] gestiona el estado de su <img>:

       loading -> skeleton con shimmer (solo si el contenedor es .imgbox)
       loaded  -> la imagen se funde sobre el skeleton
       error   -> se oculta el <img> roto y aparece un contenedor
                  glassmorphism con icono y la ruta que falló

     El error se registra en un único nodo aria-live en vez de uno por
     imagen: así un lector de pantalla no anuncia seis fallos de golpe
     cuando se montage el visor 3D. */
  function initImages() {
    var boxes = document.querySelectorAll('[data-img]');
    if (!boxes.length) return;

    /* Hook en data- y no en una clase: el nodo solo necesita .sr-only, y una
       clase sin regla CSS sería ruido. El data- lo usa el e2e para
       comprobar que solo existe una región de anuncios. */
    var announce = document.createElement('p');
    announce.className = 'sr-only';
    announce.setAttribute('data-img-announcer', '');
    announce.setAttribute('role', 'status');
    announce.setAttribute('aria-live', 'polite');
    document.body.appendChild(announce);

    var failures = [];

    /* Cada fallo se avisa en el momento en que ocurre. Si el aviso se
       recogiera al final de la inicialización, los errores que aparecieran
       más tarde (un src cambiado en runtime, un asset que cae en caliente)
       nunca se notificarían ni se registrarían. */
    function report(label) {
      failures.push(label);
      announce.textContent = failures.length + ' imagen'
        + (failures.length > 1 ? 'es no se han podido cargar: ' : ' no se ha podido cargar: ')
        + failures.join(', ') + '.';
      track('image_fallback', { images: failures.join('|') });
    }

    /* Una tarjeta de set tiene más que decir que "Set 21065 no disponible":
       el sustituto muestra el icono de la categoría, el nombre del set y su
       referencia, que es justo lo que la fotografía iba a identificar. */
    function setCardFallback(box) {
      var card = box.closest('.setcard');
      if (!card) return null;

      var titleEl = $('.setcard__title', card);
      var catEl = $('.setcard__cat', card);
      var useEl = catEl && catEl.querySelector('use');
      var iconHref = useEl ? useEl.getAttribute('href') : null;
      var ref = card.dataset.setId || '';

      return {
        icon: iconHref,
        title: titleEl ? titleEl.textContent.trim() : ref,
        meta: catEl ? catEl.textContent.replace(/\s+/g, ' ').trim() : ''
      };
    }

    function fallback(box, img) {
      /* La misma caja puede llegar por dos caminos: el evento error, o la
         comprobación del estado ya asentado que hace initImages. Solo el
         primero debe anunciarse, o el lector de pantalla oiría dos veces el
         mismo fallo y la lista de imágenes rotas saldría con duplicados. */
      if (box.getAttribute('data-state') === 'error') return;
      box.setAttribute('data-state', 'error');
      /* El <img> roto se oculta y deja de anunciar su alt: el texto del
         contenedor de sustitución es lo que debe leer el lector de
         pantalla, o se oiría la descripción dos veces. */
      img.setAttribute('aria-hidden', 'true');
      img.style.display = 'none';
      report(box.getAttribute('data-img-label') || 'Una imagen');
      if (box.querySelector('.imgbox__fallback')) return;

      var label = box.getAttribute('data-img-label') || 'Esta imagen';
      var path = (img.getAttribute('src') || '').split('/').pop();
      var box$ = document.createElement('div');
      box$.className = 'imgbox__fallback';

      var card = setCardFallback(box);

      var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'imgbox__fallback-icon');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('stroke-width', '1.5');
      icon.setAttribute('aria-hidden', 'true');
      icon.setAttribute('focusable', 'false');

      if (card && card.icon) {
        /* Se reutiliza el mismo icono de categoría que la tarjeta, para que
           el sustituto no contradiga lo que hay justo debajo. */
        var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', card.icon);
        icon.appendChild(use);
      } else {
        icon.innerHTML =
          '<rect x="3" y="4" width="18" height="16" rx="2.5"></rect>' +
          '<circle cx="8.5" cy="9.5" r="1.6"></circle>' +
          '<path d="M3.5 17l4.8-5 3.4 3.4 2.8-2.4 6 5.1" stroke-linecap="round" stroke-linejoin="round"></path>' +
          '<path d="M3 21h18" stroke-linecap="round" opacity=".45"></path>';
      }
      box$.appendChild(icon);

      /* Los textos van con textContent y no en el innerHTML de arriba: vienen
         de site-data.js y no deben poder inyectar marcado. */
      var title = document.createElement('p');
      title.className = 'imgbox__fallback-title';
      title.textContent = card ? card.title : label + ' no disponible';
      box$.appendChild(title);

      var sub = document.createElement('p');
      sub.className = 'imgbox__fallback-path';
      sub.textContent = card ? card.meta : path;
      box$.appendChild(sub);

      box.appendChild(box$);
    }

    boxes.forEach(function (box) {
      var img = box.querySelector('img');
      if (!img) return;
      box.setAttribute('data-state', 'loading');

      /* Una imagen que ya estaba en caché puede no disparar load: sin este
         filtro se quedaría en "loading" para siempre. */
      if (img.complete && img.naturalWidth > 0) {
        box.setAttribute('data-state', 'loaded');
        return;
      }

      img.addEventListener('load', function () {
        box.setAttribute('data-state', 'loaded');
      });

      img.addEventListener('error', function () {
        fallback(box, img);
      });

      /* Y el caso inverso al de arriba: un 404 que ya había fallado antes de
         que se le enganchara este listener no vuelve a disparar 'error',
         porque el elemento ya está completo y no queda nada que pedir. Sin
         esta comprobación esa tarjeta se queda en "loading" para siempre, con
         el esqueleto girando, sin sustituto y sin aviso al lector de pantalla.
         Se disparaba sobre todo cuando el 404 llegaba muy deprisa, y por eso
         aparecía a veces en nueve tarjetas de las doce y otras en las doce. */
      if (img.complete && img.naturalWidth === 0) {
        fallback(box, img);
      }
    });
  }

  /* ======================================================================
     8 · CATÁLOGO: FILTROS, BÚSQUEDA, ORDEN Y CONTEO
     El HTML ya viene con las 12 tarjetas y todos los datos en data-*, así que
     esto solo filtra y reordena lo que ya está en el DOM. Si el script no
     llega a cargarse, el catálogo se ve entero: es el mismo criterio que en
     el resto del sitio.
     ====================================================================== */
  function initCatalog() {
    var grid = $('#set-grid');
    if (!grid) return;

    var cards = $$('.setcard', grid);
    if (!cards.length) return;

    var chips = $$('.chip[data-filter]');
    var search = $('#catalog-search');
    var sort = $('#catalog-sort');
    var countEl = $('#catalog-count');
    var countSets = countEl && $('[data-count-sets]', countEl);
    var countPieces = countEl && $('[data-count-pieces]', countEl);

      /* Lectura de los data-*. Se leen una vez y se guardan: el orden cambia
         con cada cambio de sort y no tiene sentido volver a parsearlos.
         `order` es la posición original en el HTML y sirve de desempate: es
         lo único que mantiene estable la lista cuando dos sets coinciden en
         precio o en piezas (no es raro: hay dos pares de empate). */
      var rows = cards.map(function (card, index) {
        return {
          el: card,
          order: index,
          name: card.dataset.name || '',
          ref: card.dataset.setId || '',
          category: card.dataset.category || '',
          pieces: parseInt(card.dataset.pieces, 10),
          price: parseFloat(card.dataset.price)
        };
      });

    var hasPieces = function (row) { return !isNaN(row.pieces); };
    var hasPrice = function (row) { return !isNaN(row.price); };

    var state = { category: 'all', query: '', sort: 'featured', order: 0 };

      /* Los sets sin piezas o sin precio no pueden ordenar por ese campo: se
         van al final en lugar de tratado como 0, que los mezclaría con los
         más baratos. La dirección va como parámetro en vez de multiplicar
         el resultado porque, al multiplicar, el caso "no hay dato" también
         se invierte y el 21066 acababa primero en vez de último. */
      function compare(a, b, key, desc) {
        var aHas = key === 'pieces' ? hasPieces(a) : hasPrice(a);
        var bHas = key === 'pieces' ? hasPieces(b) : hasPrice(b);
        if (aHas !== bHas) return aHas ? -1 : 1;
        if (!aHas) return a.order - b.order;
        if (a[key] === b[key]) return a.order - b.order;
        return (a[key] < b[key] ? -1 : 1) * (desc ? -1 : 1);
      }

      var comparators = {
        'pieces-desc': function (a, b) { return compare(a, b, 'pieces', true); },
        'price-asc': function (a, b) { return compare(a, b, 'price', false); },
        'price-desc': function (a, b) { return compare(a, b, 'price', true); },
        'name-asc': function (a, b) {
          /* localeCompare devuelve 0 en empate, y ordenar por 0 dejaría el
             resultado en el orden previo del DOM en lugar de en el de los
             datos. Se resuelve con el índice original. */
          return a.name.localeCompare(b.name, 'es') || a.order - b.order;
        }
      };

    function matches(row) {
      if (state.category !== 'all' && row.category !== state.category) return false;
      return matchesQuery(row);
    }

    /* Separado de matches() porque los contadores de los chips tienen que
       ignorar el filtro activo: el chip "Todos" debe decir cuántos hay en
       total, no cuántos hay después de pulsar otro chip. */
    function matchesQuery(row) {
      if (!state.query) return true;
      /* Se busca en el nombre normalizado y también en el número de set, que
         es lo que alguien teclea ("21065"). */
      var haystack = normalize(row.name + ' ' + row.ref);
      return haystack.indexOf(state.query) !== -1;
    }

    function normalize(text) {
      /* minúsculas sin acentos: "vehiculo" tiene que encontrar "Vehículos". */
      return (text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    }

    function render() {
      var visible = rows.filter(matches);

      /* Featured = el orden del HTML, que es el de site-data.js. Se usa el
         índice original, no el del DOM, para que el orden sea estable. */
      var ordered = comparators[state.sort]
        ? visible.slice().sort(comparators[state.sort])
        : visible;

      ordered.forEach(function (row) {
        grid.appendChild(row.el);
      });

      /* Los que no entran se ocultan, no se borran: siguen en el DOM para
         que el buscador de Ctrl+F y el JSON-LD sigan viéndolos. */
      var shown = {};
      ordered.forEach(function (row) { shown[row.ref] = true; });
      rows.forEach(function (row) {
        row.el.hidden = !shown[row.ref];
      });

      if (countSets) countSets.textContent = String(ordered.length);
      if (countPieces) {
        var total = ordered.reduce(function (sum, row) {
          return sum + (hasPieces(row) ? row.pieces : 0);
        }, 0);
        countPieces.textContent = total.toLocaleString('es-ES');
      }

      grid.setAttribute('data-empty', ordered.length ? 'false' : 'true');

      /* El contador de cada chip refleja lo que habría con ese filtro, no lo
         que hay ahora, para que se vea cuánto hay antes de pulsarlo. */
      chips.forEach(function (chip) {
        var key = chip.dataset.filter;
        var n = rows.filter(function (row) {
          if (!matchesQuery(row)) return false;
          return key === 'all' || row.category === key;
        }).length;
        var badge = $('.chip__count', chip);
        if (badge) badge.textContent = String(n);
        chip.hidden = key !== 'all' && n === 0;
      });
    }

    function setCategory(key) {
      state.category = key;
      chips.forEach(function (chip) {
        var on = chip.dataset.filter === key;
        chip.classList.toggle('is-active', on);
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      render();
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        setCategory(chip.dataset.filter);
        track('catalog_filter', { category: chip.dataset.filter });
      });
    });

    if (search) {
      /* Se filtra mientras se escribe, sin esperar al Enter ni al blur: con
         12 tarjetas no hay nada que ganar esperándose. */
      var onInput = function () {
        state.query = normalize(search.value);
        render();
      };
      search.addEventListener('input', onInput);
      /* Escape limpia el campo: es lo que espera quien busca y no encuentra. */
      search.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || !search.value) return;
        search.value = '';
        state.query = '';
        render();
      });
    }

    if (sort) {
      sort.addEventListener('change', function () {
        state.sort = sort.value;
        render();
        track('catalog_sort', { sort: sort.value });
      });
    }

    /* Los enlaces "Ver arquitectura" de las tarjetas de categoría activan el
       filtro correspondiente en vez de solo saltar al catálogo. */
    $$('[data-jump-category]').forEach(function (link) {
      link.addEventListener('click', function () {
        setCategory(link.dataset.jumpCategory);
      });
    });

    render();
  }

  /* ======================================================================
     9 · VISOR 3D DEL BLOQUE
     ----------------------------------------------------------------------
     Un único diálogo para todas las fichas. No hay WebGL ni malla del set:
     el bloque son seis caras colocadas con `rotateY(θ) translateZ()` y aquí
     solo se escriben tres variables CSS a partir del arrastre y de la rueda.
     Que la escena se componga sin este módulo es correcto: en ese caso el
     bloque se queda en su posición inicial, que es la que mejor se lee.
     ====================================================================== */
  function initViewer3d() {
    var viewer = $('#viewer-3d');
    var stage = $('[data-viewer-stage]');
    var pivot = $('[data-viewer-pivot]');
    var brick = $('[data-viewer-brick]');
    if (!viewer || !stage || !brick) return;
    /* El pivote es quien lee --rx y --ry, y el bloque quien lee --z. Que
       falte el pivote no se nota mirando la caja: el bloque seguiría
       apareciendo y solo se acercaría por el desplazamiento en Z, así que
       el error se delata al arrastrar, no al abrir. */
    if (!pivot) return;

    var FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

    /* Estado del giro. Vive en variables, y no en el `transform` de la
       etiqueta, porque el CSS ya lo lee: así el navegador no tiene que
       recalcular el árbol de estilo desde cero en cada fotograma. */
    var state = { ry: -28, rx: 22, z: 0 };
    var MAX_PITCH = 72;   /* más allá el bloque se ve por debajo y no aporta */
    var MAX_ZOOM = 90;
    var lastFocus = null;

    var fields = {
      name: $('[data-viewer-name]'),
      cat: $('[data-viewer-cat]'),
      ref: $('[data-viewer-ref]'),
      pieces: $('[data-viewer-pieces]'),
      hours: $('[data-viewer-hours]')
    };

    function paint() {
      /* Cada propiedad se escribe donde el CSS la lee. Las variables
         heredan hacia abajo y no hacia arriba, así que poner las tres en el
         bloque dejaba al pivote con sus valores por defecto para siempre: la
         escena se abría en la postura inicial, el arrastre no movía nada y
         el zoom tampoco, porque --z sí se leía pero --rx y --ry no. */
      pivot.style.setProperty('--ry', state.ry.toFixed(2) + 'deg');
      pivot.style.setProperty('--rx', state.rx.toFixed(2) + 'deg');
      brick.style.setProperty('--z', state.z.toFixed(1) + 'px');
    }

    /* Sin inercia. Se probó y con ella el bloque llegaba al borde y se
       paraba oscilando un segundo, que en un objeto que parece de plástico
       se lee como que "va". Un giro que sigue al dedo es más controlable. */
    function open(trigger) {
      var id = trigger.dataset.setId || '';
      var card = trigger.closest('.setcard');
      var pieces = trigger.dataset.setPieces;

      lastFocus = trigger;
      fields.name.textContent = trigger.dataset.setName || 'Set';
      fields.cat.textContent = trigger.dataset.setCategory || 'Set';
      fields.ref.textContent = id ? 'Set ' + id : '';
      fields.pieces.textContent = pieces
        ? new Intl.NumberFormat('es-ES').format(Number(pieces)) + ' piezas'
        : 'Por confirmar';
      var hours = card ? card.dataset.buildHours : '';
      fields.hours.textContent = hours || 'Por confirmar';

      state.ry = -28; state.rx = 22; state.z = 0;
      paint();

      viewer.hidden = false;
      document.body.style.overflow = 'hidden';
      trigger.setAttribute('aria-expanded', 'true');
      /* El foco entra en el diálogo, no en el botón que ya está detrás de
         él: si se queda fuera, el siguiente Tab se lo lleva al contenido de
         la página, que es el error clásico de los diálogos. */
      var close = $('[data-viewer-close]', viewer);
      if (close) close.focus();
      track('viewer_3d_open', { setId: id });
    }

    function close() {
      if (viewer.hidden) return;
      viewer.hidden = true;
      document.body.style.overflow = '';
      $$('[data-viewer-3d][aria-expanded="true"]').forEach(function (b) {
        b.setAttribute('aria-expanded', 'false');
      });
      /* El foco vuelve a la ficha de la que se salió. Sin esto, al cerrar con
         Escape el foco se pierde en el principio del documento. */
      if (lastFocus) lastFocus.focus();
      lastFocus = null;
    }

    $$('[data-viewer-3d]').forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', function () { open(btn); });
    });

    $$('[data-viewer-close]', viewer).forEach(function (el) {
      el.addEventListener('click', close);
    });

    /* --- Arrastre --------------------------------------------------------
       `pointerdown/move/up` y no eventos de ratón: así funciona igual con
       dedo, lápiz y ratón sin ramificar el código tres veces. El
       `setPointerCapture` evita tener que soltar el puntero fuera del
       elemento, que es donde se perdía el evento. */
    var drag = null;

    stage.addEventListener('pointerdown', function (event) {
      if (event.button != null && event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, ry: state.ry, rx: state.rx };
      stage.setPointerCapture(event.pointerId);
      stage.style.cursor = 'grabbing';
    });

    stage.addEventListener('pointermove', function (event) {
      if (!drag || event.pointerId !== drag.id) return;
      /* El factor 0,4 está medido en píxeles de pantalla: a 0,4 el giro
         responde al dedo sin dar una vuelta completa por cada 200 px. */
      state.ry = drag.ry + (event.clientX - drag.x) * 0.4;
      state.rx = clamp(drag.rx - (event.clientY - drag.y) * 0.35, -MAX_PITCH, MAX_PITCH);
      paint();
    });

    function endDrag(event) {
      if (!drag || (event && event.pointerId !== drag.id)) return;
      var id = drag.id;
      drag = null;
      stage.style.cursor = 'grab';
      if (stage.hasPointerCapture && stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
    }

    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);

    /* --- Rueda ------------------------------------------------------------
       `passive: false` porque aquí se hace preventDefault para que la página
       no siga haciendo scroll por debajo del diálogo. Sin eso, el bloque se
       acerca y a la vez la página se desliza, y parece un fallo. */
    stage.addEventListener('wheel', function (event) {
      event.preventDefault();
      state.z = clamp(state.z - event.deltaY * 0.4, -MAX_ZOOM, MAX_ZOOM);
      paint();
    }, { passive: false });

    /* --- Teclado ---------------------------------------------------------
       Escape cierra. Las flechas giran, para que el visor se pueda usar sin
       ratón, que si no es un visor decorativo. */
    document.addEventListener('keydown', function (event) {
      if (viewer.hidden) return;

      if (event.key === 'Escape') { close(); return; }

      if (event.key === 'Tab') {
        /* Trampa de foco: el diálogo es modal, así que el Tab no puede salir
           a la página de detrás. Con dos elementos enfocables (cerrar y
           nada más) esto podría ser un `if`, pero se hace el recorrido
           entero para que añadir un control no rompa la trampa. */
        var items = $$(FOCUSABLE, viewer).filter(function (el) {
          return el.offsetParent !== null || el === document.activeElement;
        });
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
        return;
      }

      var step = event.shiftKey ? 22 : 8;
      if (event.key === 'ArrowLeft') { state.ry -= step; paint(); event.preventDefault(); }
      else if (event.key === 'ArrowRight') { state.ry += step; paint(); event.preventDefault(); }
      else if (event.key === 'ArrowUp') {
        state.rx = clamp(state.rx - step, -MAX_PITCH, MAX_PITCH); paint(); event.preventDefault();
      } else if (event.key === 'ArrowDown') {
        state.rx = clamp(state.rx + step, -MAX_PITCH, MAX_PITCH); paint(); event.preventDefault();
      }
    });

    paint();
  }

  /* ======================================================================
     10 · ARRANQUE
     ====================================================================== */
  function boot() {
    initHeader();
    initDrawer();
    initAnchors();
    initReveal();
    initFaq();
    initImages();
    initCatalog();
    initViewer3d();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
