/* ======================================================================
   site-data.js · FUENTE ÚNICA DE CONFIGURACIÓN
   ======================================================================
   Todo lo que antes estaba escrito a mano en el HTML (URL canónica, datos
   de la empresa, precios, enlaces legales y metadatos sociales) vive aquí.

   Cómo funciona
   ------------
   1. Editas este fichero.
   2. Ejecutas  node tools/sync-config.js
   3. El script reescribe los bloques delimitados por comentarios
      <!-- site:*:start --> / <!-- site:*:end --> en cada HTML.

   Los metadatos se quedan escritos en el HTML estático a propósito: los
   crawlers no ejecutan JavaScript, así que canonical, Open Graph y JSON-LD
   tienen que estar en el HTML, no generados en runtime.

   El mismo objeto se carga también en el navegador (define window.SITE_DATA)
   para las partes dinámicas: el año del copyright, los fallbacks de imagen y
   los textos legales. Si los dos se desincronizan, `node tools/sync-config.js`
   lo detecta y avisa.
   ====================================================================== */
(function (root, factory) {
  'use strict';
  var data = factory();
  /* Node (herramientas) */
  if (typeof module === 'object' && module.exports) module.exports = data;
  /* Navegador */
  root.SITE_DATA = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------
     1 · URL CANÓNICA
     ------------------------------------------------------------------
     Lo que tiene que ser URL absoluta (canonical, Open Graph, @id de
     schema.org) sale de SITE_URL + SITE_BASE. La navegación no depende de
     estas dos: los `href` se emiten relativos con `path()`, de modo que el
     mismo HTML funciona igual en la raíz del dominio que en una subruta.

     Antes aquí havia escrito un dominio de ejemplo y el generador lo
     publicaba tal cual: 66 URLs fantasma dentro del JSON-LD, más el
     canonical y el og:url, de las 131 que había en el repositorio. Un
     dominio inventado en un canonical es peor que no tener canonical,
     porque Google lo indexa y lo descendsa. Ahora la URL se resuelve y, si
     no se puede determinar con certeza, no se emite ninguna.

     De dónde sale, en este orden:

       1. SITE_URL            variable de entorno, gana sobre todo
       2. GITHUB_REPOSITORY   la inyecta GitHub Actions en cada run
       3. sin valor           CANONICAL_URL queda vacía y el generador
                              omite canonical, og:url y las URL del JSON-LD
                              en vez de inventarse un dominio

     SITE_BASE sigue su propia regla:

       1. SITE_BASE           variable de entorno. '/' significa raíz
       2. la ruta de SITE_URL  si se escribió una URL completa, no solo el
                              origen, esa ruta es la subruta
       3. GITHUB_REPOSITORY   el nombre del repositorio, que es la subruta
                              real. Si el repositorio es <owner>.github.io
                              es un sitio de usuario y no lleva subruta.
       4. '/lego-icons'       valor por defecto para trabajar en local

     En el navegador no hay `process`, así que readEnv devuelve vacío y
     SITE_URL queda sin resolver. Es intencionado y no rompe nada: el
     navegador no usa estos tres valores para nada (solo el año del
     copyright, los textos de los sustitutos de imagen y los enlaces legales,
     que no dependen de la URL). Quien decide el canonical es el HTML
     estático que genera tools/sync-config.js, porque los crawlers no
     ejecutan JavaScript.
     ------------------------------------------------------------------ */
  function readEnv(name) {
    try {
      if (typeof process !== 'undefined' && process && process.env) return process.env[name] || '';
    } catch (e) { /* sin process: estamos en el navegador */ }
    return '';
  }

  /* Descompone SITE_URL en origen y ruta, en vez de recortarla con regex.
     Se hace con el parser de URL porque un recorte a mano es fragil: la
     version anterior quitaba el ultimo segmento, de modo que
     https://a.github.io/mi-repo se convertia en https://a.github.io y
     perdia la subruta, mientras que https://a.github.io/mi-repo/ la
     conservaba. El mismo valor daba dos resultados segun la barra final.

     Devuelve el origen, la ruta que llevaba dentro (o "") y si era válida,
     para que resolverSiteBase pueda respetar esa ruta en vez de tirarla. */
  function splitSiteUrl(value) {
    var raw = String(value || "").trim();
    if (!raw) return { origin: "", path: "", ok: false };
    /* Quien escriba el dominio sin esquema significa https, que es lo que
       se espera al escribir midominio.es en una variable de entorno. */
    var candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw;
    var parsed;
    try { parsed = new URL(candidate); } catch (e) { return { origin: "", path: "", ok: false }; }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { origin: "", path: "", ok: false };
    }
    return {
      origin: parsed.origin,
      path: parsed.pathname.replace(/\/+$/, ""),
      ok: true
    };
  }


  /* Último recurso cuando no hay ninguna variable de entorno. Es la URL
     real y verificada de este sitio, así que el HTML commiteado lleva el
     canonical correcto tal cual, sin depender de que la build lo regenere.

     `path` se deja vacío a propósito: la subruta por defecto la pone
     `resolveSiteBase()`, que así sigue siendo quien decide de dónde sale. */
  var DEFAULT_SITE_URL = 'https://vxion2626.github.io';

  function resolveSiteUrl() {
    var explicit = splitSiteUrl(readEnv('SITE_URL'));
    if (explicit.ok) return { value: explicit.origin, path: explicit.path, source: 'SITE_URL' };

    /* GITHUB_REPOSITORY tiene la forma owner/repo. */
    var repo = readEnv('GITHUB_REPOSITORY').trim();
    var owner = readEnv('GITHUB_REPOSITORY_OWNER').trim();
    if (repo && repo.indexOf('/') !== -1) {
      var parts = repo.split('/');
      owner = owner || parts[0];
      if (owner) return { value: 'https://' + owner + '.github.io', path: '', source: 'GITHUB_REPOSITORY' };
    }
    return { value: DEFAULT_SITE_URL, path: '', source: 'default' };
  }

  function resolveSiteBase(urlResolved) {
    var raw = readEnv('SITE_BASE').trim();
    if (raw !== '') {
      /* '/' significa "raíz del dominio", y es un centinela y no un
         accident: en Windows una variable de entorno vacía se borra en vez
         de definirse, así que SITE_BASE='' no se puede expresar y quien
         quisiera publicar en la raíz acababa en /lego-icons sin querer. */
      if (raw === '/') return { value: '', source: 'SITE_BASE' };
      return { value: raw.replace(/\/+$/, ''), source: 'SITE_BASE' };
    }

    /* Si SITE_URL traía una ruta, esa ruta es la subruta. Se respeta en vez
       de descartarla: poner SITE_URL=https://midominio.es/catalogo y dejar
       que la subruta saliera del nombre del repositorio publicaría el sitio
       en un sitio distinto del que se ha pedido, sin avisar. */
    if (urlResolved.path) return { value: urlResolved.path, source: 'SITE_URL' };

    var repo = readEnv('GITHUB_REPOSITORY').trim();
    if (repo && repo.indexOf('/') !== -1) {
      var parts = repo.split('/');
      var owner = readEnv('GITHUB_REPOSITORY_OWNER').trim() || parts[0];
      var name = parts[1];
      /* owner.github.io es un sitio de usuario o de organización: se sirve
         en la raíz del dominio, sin subruta. */
      if (name && name !== owner + '.github.io') return { value: '/' + name, source: 'GITHUB_REPOSITORY' };
      return { value: '', source: 'GITHUB_REPOSITORY' };
    }
    return { value: '/lego-icons', source: 'default' };
  }

  var SITE_URL_RESOLVED = resolveSiteUrl();
  var SITE_BASE_RESOLVED = resolveSiteBase(SITE_URL_RESOLVED);
  var SITE_URL = SITE_URL_RESOLVED.value;
  var SITE_BASE = SITE_BASE_RESOLVED.value;
  /* Siempre hay origen: si no hay ninguna variable de entorno, se usa
     DEFAULT_SITE_URL. Aun así se deja la comprobación, porque si alguien
     borrara el valor por defecto el canonical tiene que omitirse en vez de
     salir mal formado. */
  var CANONICAL_URL = SITE_URL ? SITE_URL + SITE_BASE : '';
  var SITE_URL_SOURCE = SITE_URL_RESOLVED.source;
  var SITE_BASE_SOURCE = SITE_BASE_RESOLVED.source;

  /* ------------------------------------------------------------------
     2 · EMPRESA Y DATOS LEGALES
     ------------------------------------------------------------------
    obligatorio para una web en la UE: la LSSI y el RGPD exigen identificar
     al titular y un canal de contacto. `dpo` es el Delegado de Protección de
     Datos; si la empresa no lo ha designado, pon null y usa `email`.
     ------------------------------------------------------------------ */
  var COMPANY_LEGAL = {
    /* Razón social exacta según registro mercantil */
    name: 'Brick Studio Editorial S.L.',
    taxId: 'B-00000000',
    /* NIF/NIE/CIF sin letra inicial, para los props de schema.org */
    taxIdSchema: 'B00000000',
    address: {
      street: 'Calle de la Ejemplo 00',
      locality: 'Madrid',
      region: 'Madrid',
      postalCode: '28001',
      country: 'ES',
      countryName: 'España',
    },
    email: 'hola@tudominio.com',
    /* Delegado de Protección de Datos; null si no lo hay */
    dpo: {
      name: null,
      email: 'privacidad@tudominio.com',
    },
    /* Número de registro mercantil y datos de facturación */
    commerceRegister: null,
    vatNumber: null,
  };

  /* ------------------------------------------------------------------
     3 · CATÁLOGO, PRECIOS Y DISPONIBILIDAD
     ------------------------------------------------------------------
     Este es el corazón del sitio: la lista de sets reales. Todo lo que se
     ve en pantalla (tarjetas, filtros, precios, JSON-LD) se deriva de aquí,
     así que no hay ni un importe escrito a mano en el HTML.

     `amount` SIEMPRE en notación de punto, sin símbolo ni separador de
     millares: así es como lo exige Schema.org. El formato visible lo pone
     `money()` al pintar en pantalla.

     ESTADOS DE PRECIO
     -----------------
     'verificado'  precio confirmado en el mercado español (fuente oficial)
     'referencia'  precio oficial en otro mercado (DE/UK/US). Se muestra
                   etiquetado como referencia, nunca como precio en España
     'pendiente'   no hay precio fiable: `price` es null y la tarjeta lo dice

     No se inventa ningún precio. Un `null` es información útil; un importe
     estimado, no.
     ------------------------------------------------------------------ */
  var PRICING_DATA = {
    currency: 'EUR',
    currencySymbol: '€',
    locale: 'es-ES',
    taxIncluded: true,
    taxRatePercent: 21,

    /* ------------------ Categorías ------------------
       `icon` apunta a un símbolo del sprite SVG de index.html (#ic-*).
       Es lo que se muestra mientras no haya foto del set. */
    categories: [
      {
        key: 'arquitectura',
        label: 'Arquitectura',
        icon: 'ic-building',
        description: 'Monumentos y edificios icónicos a escala de colección.',
      },
      {
        key: 'vehiculos',
        label: 'Vehículos',
        icon: 'ic-car',
        description: 'Coches, naves y máquinas con historia propia.',
      },
      {
        key: 'cultura-pop',
        label: 'Cultura pop',
        icon: 'ic-rocket',
        description: 'Escenas de cine y series que todo el mundo reconoce.',
      },
      {
        key: 'botanica',
        label: 'Botánica',
        icon: 'ic-leaf',
        description: 'Flores y plantas de las colecciones de temporada.',
      },
      {
        key: 'arte',
        label: 'Arte',
        icon: 'ic-brush',
        description: 'Cuadros y obras clásicas llevadas a ladrillo.',
      },
    ],

    /* ------------------ Los 12 sets ------------------
       `image` apunta al fichero que aportará el usuario. Mientras no exista,
       `ImageWithFallback` pinta la tarjeta con glassmorphism, el nombre, la
       categoría y el icono; no hay que hacer nada más. */
    sets: [
      {
        id: '21065',
        name: 'Sagrada Família',
        category: 'arquitectura',
        pieces: 12060,
        ageMin: 18,
        year: 2026,
        releaseDate: '2026-11-01',
        releaseLabel: 'noviembre de 2026',
        availability: 'PreOrder',
        availabilityLabel: 'Reserva anticipada',
        price: 749.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/en-us/product/sagrada-familia-21065',
        image: 'assets/img/sets/21065.jpg',
        summary: 'La basílica de Gaudí en Barcelona a escala de colección, con su fachada y sus pináculos.',
      },
      {
        id: '21066',
        name: 'New York City',
        category: 'arquitectura',
        pieces: 1465,
        ageMin: 18,
        year: 2026,
        releaseDate: '2026-01-01',
        releaseLabel: '2026',
        availability: 'PreOrder',
        availabilityLabel: 'Reserva anticipada',
        price: null,
        priceStatus: 'pendiente',
        priceSource: 'Precio oficial pendiente de publicar',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/en-us/product/new-york-city-the-big-apple-21066',
        image: 'assets/img/sets/21066.jpg',
        summary: 'El horizonte de Manhattan a escala de colección, con sus edificios más reconocibles.',
      },
      {
        id: '11383',
        name: 'Mayor Manor',
        category: 'arquitectura',
        pieces: null,
        ageMin: 18,
        year: 2026,
        releaseDate: '2026-09-01',
        releaseLabel: 'septiembre de 2026',
        availability: 'PreOrder',
        availabilityLabel: 'Reserva anticipada',
        price: 109.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/en-us/product/mayor-manor-11383',
        image: 'assets/img/sets/11383.jpg',
        summary: 'Edificio de la serie de arquitectura para adultos.',
      },
      {
        id: '11381',
        name: 'Jaguar E-Type',
        category: 'vehiculos',
        pieces: 1673,
        ageMin: 18,
        year: 2026,
        releaseDate: '2026-08-01',
        releaseLabel: 'agosto de 2026',
        availability: 'InStock',
        availabilityLabel: 'Disponible',
        price: 139.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/en-us/product/jaguar-e-type-11381',
        image: 'assets/img/sets/11381.jpg',
        summary: 'El coupé deportivo inglés de los años sesenta, con su carrocería descapotable.',
      },
      {
        id: '75440',
        name: 'AT-AT',
        category: 'vehiculos',
        pieces: 525,
        ageMin: null,
        year: 2026,
        releaseDate: '2026-01-01',
        releaseLabel: 'enero de 2026',
        availability: 'InStock',
        availabilityLabel: 'Disponible',
        price: 69.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/en-us/product/at-at-75440',
        image: 'assets/img/sets/75440.jpg',
        summary: 'El walker de la galaxia, con sus cuatro patas articuladas.',
      },
      {
        id: '75426',
        name: 'Millennium Falcon',
        category: 'vehiculos',
        pieces: 885,
        ageMin: null,
        year: 2026,
        releaseDate: '2026-03-01',
        releaseLabel: 'marzo de 2026',
        availability: 'InStock',
        availabilityLabel: 'Disponible',
        price: 89.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/en-us/product/smart-play-millennium-falcon-75426',
        image: 'assets/img/sets/75426.jpg',
        summary: 'El Halcón Milenario con su casco de mandíbulas abierto.',
      },
      {
        id: '75442',
        name: 'N-1 Starfighter',
        category: 'cultura-pop',
        pieces: 1809,
        ageMin: 18,
        year: 2026,
        releaseDate: '2026-05-04',
        releaseLabel: 'mayo de 2026',
        availability: 'InStock',
        availabilityLabel: 'Disponible',
        price: 249.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/en-us/product/the-mandalorians-n-1-starfighter-75442',
        image: 'assets/img/sets/75442.jpg',
        summary: 'El caza naranja de las preliminares, con cockpit y aletas plegables.',
      },
      {
        id: '75457',
        name: 'Executor Super Star Destroyer',
        category: 'cultura-pop',
        pieces: 6130,
        ageMin: null,
        year: 2026,
        releaseDate: '2026-10-01',
        releaseLabel: 'octubre de 2026',
        availability: 'PreOrder',
        availabilityLabel: 'Reserva anticipada',
        price: 749.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/en-us/product/executor-super-star-destroyer-75457',
        image: 'assets/img/sets/75457.jpg',
        summary: 'El destructor estelar más largo construido en piezas, con su puente y su hangar.',
      },
      {
        id: '75455',
        name: 'Boba Fett',
        category: 'cultura-pop',
        pieces: 1544,
        ageMin: null,
        year: 2026,
        releaseDate: '2026-08-01',
        releaseLabel: 'agosto de 2026',
        availability: 'InStock',
        availabilityLabel: 'Disponible',
        price: 149.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/en-us/product/boba-fett-75455',
        image: 'assets/img/sets/75455.jpg',
        summary: 'El cazador de Mandaloria con su armadura, su blaster y su lancha.',
      },
      {
        id: '11501',
        name: 'Tulip Bouquet',
        category: 'botanica',
        pieces: 576,
        ageMin: 18,
        year: 2026,
        releaseDate: '2026-01-01',
        releaseLabel: 'enero de 2026',
        availability: 'InStock',
        availabilityLabel: 'Disponible',
        price: 59.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/en-us/product/tulip-bouquet-11501',
        image: 'assets/img/sets/11501.jpg',
        summary: 'Un ramo de tulipanes con tallos, hojas y florero.',
      },
      {
        id: '11504',
        name: 'Peace Lily',
        category: 'botanica',
        pieces: 474,
        ageMin: 18,
        year: 2026,
        releaseDate: '2026-01-01',
        releaseLabel: 'enero de 2026',
        availability: 'InStock',
        availabilityLabel: 'Disponible',
        price: 59.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/en-us/product/peace-lily-11504',
        image: 'assets/img/sets/11504.jpg',
        summary: 'El lirio de paz en flor, con la maceta y sus hojas anchas.',
      },
      {
        id: '11508',
        name: 'Daisies',
        category: 'botanica',
        pieces: 133,
        ageMin: 9,
        year: 2026,
        releaseDate: '2026-01-01',
        releaseLabel: 'enero de 2026',
        availability: 'InStock',
        availabilityLabel: 'Disponible',
        price: 14.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/en-us/product/daisies-11508',
        image: 'assets/img/sets/11508.jpg',
        summary: 'Margaritas en flor para empezar: la entrada más fácil a la botánica.',
      },

      /* ---- Los seis sets de la ampliación "Light Edition" ----
         `buildHours` y `difficulty` son los únicos datos de estos seis que
         vienen dados. En los doce de arriba no están, y no se escriben a
         mano: se estiman en `decorate()` a partir del número de piezas,
         que es lo que hace la propia LEGO en su ficha. La tarjeta dice
         siempre si la cifra es estimada o dada, para que no se lea como un
         dato de fábrica. */
      {
        id: '10281',
        name: 'Lego Icons Árbol Bonsái',
        category: 'botanica',
        pieces: 878,
        ageMin: 18,
        year: 2021,
        releaseDate: '2021-01-01',
        releaseLabel: '2021',
        availability: 'InStock',
        availabilityLabel: 'Disponible',
        buildHours: '3-5 h',
        difficulty: 'Intermedio',
        price: 49.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/es-es/product/bonsai-tree-10281',
        image: 'assets/img/sets/10281.jpg',
        summary: 'Una pieza de exhibición relajante, con hojas verdes intercambiables o flores de cerezo rosadas compuestas por pequeñas ranas LEGO.',
      },
      {
        id: '75192',
        name: 'Millennium Falcon Ultimate Collector Series',
        category: 'cultura-pop',
        pieces: 7541,
        ageMin: 18,
        year: 2017,
        releaseDate: '2017-01-01',
        releaseLabel: '2017',
        availability: 'InStock',
        availabilityLabel: 'Disponible',
        buildHours: '25-30 h',
        difficulty: 'Experto',
        price: 849.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/es-es/product/millennium-falcon-75192',
        image: 'assets/img/sets/75192.jpg',
        summary: 'El modelo LEGO Star Wars más grande jamás creado, con detalles interiores minuciosos, armas láser y las tripulaciones clásica y moderna.',
      },
      {
        id: '10300',
        name: 'Máquina del Tiempo de Regreso al Futuro',
        category: 'cultura-pop',
        pieces: 1872,
        ageMin: 18,
        year: 2025,
        releaseDate: '2025-01-01',
        releaseLabel: '2025',
        availability: 'InStock',
        availabilityLabel: 'Disponible',
        buildHours: '8-10 h',
        difficulty: 'Avanzado',
        price: 199.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/es-es/product/back-to-the-future-time-machine-10300',
        image: 'assets/img/sets/10300.jpg',
        summary: 'Una de las tres versiones del icónico DeLorean, con condensador de flujo iluminado, ruedas abatibles y minifiguras de Doc y Marty.',
      },
      {
        id: '21042',
        name: 'Estatua de la Libertad',
        category: 'arquitectura',
        pieces: 1685,
        ageMin: 18,
        year: 2024,
        releaseDate: '2024-01-01',
        releaseLabel: '2024',
        availability: 'InStock',
        availabilityLabel: 'Disponible',
        buildHours: '6-8 h',
        difficulty: 'Intermedio',
        price: 99.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/es-es/product/statue-of-liberty-21042',
        image: 'assets/img/sets/21042.jpg',
        summary: 'Recreación fiel del monumento, con pedestal de columnas, túnica fluida, corona de siete rayos e icónica antorcha dorada.',
      },
      {
        id: '42143',
        name: 'Ferrari Daytona SP3',
        category: 'vehiculos',
        pieces: 3778,
        ageMin: 18,
        year: 2023,
        releaseDate: '2023-01-01',
        releaseLabel: '2023',
        availability: 'InStock',
        availabilityLabel: 'Disponible',
        buildHours: '18-20 h',
        difficulty: 'Experto',
        price: 449.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/es-es/product/ferrari-daytona-sp3-42143',
        image: 'assets/img/sets/42143.jpg',
        summary: 'Ingeniería de precisión a escala 1:8, con caja de cambios secuencial de ocho velocidades, motor V12 de pistones móviles y puertas de mariposa.',
      },
      {
        id: '31208',
        name: 'Hokusai: La Gran Ola',
        category: 'arte',
        pieces: 1810,
        ageMin: 18,
        year: 2022,
        releaseDate: '2022-01-01',
        releaseLabel: '2022',
        availability: 'InStock',
        availabilityLabel: 'Disponible',
        buildHours: '5-7 h',
        difficulty: 'Intermedio',
        price: 99.99,
        priceStatus: 'referencia',
        priceSource: 'Precio oficial LEGO en EUR, sin confirmar en España',
        compareAtPrice: null,
        affiliateUrl: 'https://www.lego.com/es-es/product/hokusai-the-great-wave-31208',
        image: 'assets/img/sets/31208.jpg',
        summary: 'La xilografía japonesa reconstruida con capas de ladrillo, en tres dimensiones y con el zebrillo de la cresta hecho con piezas distintas.',
      },
    ],

    /* --------------------------------------------------------------
       TODO: Rellenar con datos de producción
       --------------------------------------------------------------
       Los cuatro objetos siguientes (`shipping`, `returns`, `stock` y
       `taxRatePercent`) ya NO se usan en el catálogo ni en el JSON-LD:
       este sitio es un editor afiliado, no un vendedor, así que no puede
       emitir OfferShippingDetails ni MerchantReturnPolicy.

       Sobreviven únicamente porque las páginas legales los interpolan con
       los tokens {{shippingLabel}}, {{returnsDays}}, {{stockUnits}}… y esas
       páginas se reescriben en la fase siguiente. Cuando se reescriban,
       hay que BORRAR este bloque entero junto con los tokens.

       hasta entonces, los valores son de plantilla y no son ciertos.
       -------------------------------------------------------------- */
    shipping: {
      freeOver: 0,
      freeLabel: 'Envío gratis',
      cost: 0,
      daysMin: 2,
      daysMax: 5,
      carrier: 'SEUR',
      shipsToEUE: true,
    },
    returns: {
      windowDays: 14,
      method: 'ReturnByMail',
      returnFees: 'FreeReturn',
      policyCategory: 'MerchantReturnFiniteReturnWindow',
      freeReturn: true,
    },
    stock: {
      totalUnits: 500,
      claimedUnits: 312,
    },
  };

  /* ------------------------------------------------------------------
     4 · ENLACES LEGALES
     ------------------------------------------------------------------
     Rutas relativas a la raíz del sitio. Los ficheros viven en
     <ruta>/index.html` para que la ruta sin extensión funcione en
     cualquier hosting estático.
     ------------------------------------------------------------------ */
  var LEGAL_LINKS = {
    privacy: { href: '/politica-privacidad', label: 'Política de privacidad' },
    terms: { href: '/terminos-y-condiciones', label: 'Términos y condiciones' },
    cookies: { href: '/cookies', label: 'Cookies' },
    notice: { href: '/aviso-legal', label: 'Aviso legal' },
  };

  /* ------------------------------------------------------------------
     4b · PÁGINAS PÚBLICAS DEL SITIO
     ------------------------------------------------------------------
     El sitio dejó de ser una sola página. Este objeto es la lista maestra:
     el generador (`tools/sync-config.js`) la lee para saber qué ficheros
     existen, qué metadatos lleva cada uno, qué bloques tiene que pintar en
     cada uno y en qué orden aparece cada página en la navegación.

     Decidir aquí, y no en el HTML, tiene una razón concreta: si la
     navegación estuviera escrita a mano en las cinco páginas, añadir una
     sexta obligaría a editar cinco ficheros y sería fácil que una se
     quedara sin el enlace. Con la lista en un sitio, el enlace se genera
     siempre y además `check.js` puede verificar que las cinco páginas
     existen de verdad.

     `file` es el nombre real del fichero, porque en esta parte del sitio
     se usan ficheros planos (`catalogo.html`) y no directorios con
     `index.html` como en las páginas legales. La razón es práctica: las
     cinco páginas son contenido, no Legal, y un `catalogo.html` enlazable
     directamente evita depender de la reescritura de URLs del servidor
     estático. Cuando `SITE_URL` esté resuelto, `pageUrl()` devuelve la
     URL absoluta; si no, la ruta relativa, que funciona igual al abrir el
     fichero en local.

     `description` se mide en caracteres, no en palabras: Google recorta
     el meta entre 155 y 160, así que todos los de abajo se quedan por
     debajo de 155 y no pierden el final de la frase, que es donde suele
     estar la parte que convence a hacer clic.
     ------------------------------------------------------------------ */
  var PAGES = {
    home: {
      file: 'index.html',
      isHome: true,
      nav: 'Inicio',
      navOrder: 0,
      /* El `h1` de la portada lo escribe el bloque HERO_TITLE, no esto.
         Lo de aquí es el título de la pestaña y el `og:title`, y no tiene por
         qué ser una copia del titular: Search y Open Graph se leen en un
         resultado, sin contexto y en dos líneas, así que aquí va el qué y el
         para quién. */
      title: 'LEGO Icons · __TOTAL__ sets de construcción para adultos',
      /* La descripción es el texto que se ve en el snippet. Sequitó el
         inventario de categorías que tenía antes por lo mismo que en el
         subtítulo: cinco nombres seguidos no le dicen a nadie nada nuevo y
         consumen los 160 caracteres que sí importan. Lo que se conserva es la
         promesa concreta —piezas, edad, montaje, precio de referencia— porque
         es la diferencia entre este sitio y un catálogo más. */
      description: '__TOTAL__ sets de LEGO® para adultos con piezas, edad, tiempo de montaje y precio oficial de referencia. Sin sorpresas ni precios inventados.',
    },
    catalogo: {
      file: 'catalogo.html',
      nav: 'Catálogo',
      navOrder: 1,
      title: 'Catálogo completo · __TOTAL__ sets de LEGO® para adultos',
      description: 'Los __TOTAL__ sets del catálogo con piezas, edad mínima, precio de referencia y disponibilidad. Filtra por categoría, orden y dificultad.',
    },
    temas: {
      file: 'temas.html',
      nav: 'Temas',
      navOrder: 2,
      title: 'Temas y estilos de construcción · LEGO® para adultos',
      description: 'Arquitectura, vehículos, cultura pop, botánica y arte, con los sets más destacados de cada estilo y cuánto tiempo lleva montar cada uno.',
    },
    faq: {
      file: 'preguntas-frecuentes.html',
      nav: 'Guía y FAQ',
      navOrder: 3,
      title: 'Guía de montaje y preguntas frecuentes · LEGO® para adultos',
      description: 'Qué nivel tiene cada set, cuánto tarda en montarse con calma, qué material necesitas y las preguntas más habituales sobre este catálogo.',
    },
    transparencia: {
      file: 'transparencia.html',
      nav: 'Transparencia',
      navOrder: 4,
      title: 'Transparencia · Cómo funciona este catálogo de LEGO®',
      description: 'Qué hace y qué no hace este sitio, de dónde salen los datos y por qué los precios son orientativos. Sin letra pequeña.',
    },
  };

  /* Orden de la navegación. Se declara en los datos y no en el HTML para que
     las cinco páginas compartan exactamente el mismo orden. */
  var NAV_PAGES = Object.keys(PAGES)
    .filter(function (k) { return PAGES[k].nav && PAGES[k].navOrder != null; })
    .sort(function (a, b) { return PAGES[a].navOrder - PAGES[b].navOrder; });

  /* Ruta de una página. Sin SITE_URL resuelto devuelve la ruta relativa al
     sitio, que es lo que hace falta para abrir el HTML en local sin un
     servidor; con SITE_URL devuelve la absoluta, que es la que debe ir en
     un canonical o en un og:url. */
  function pageUrl(key) {
    var p = PAGES[key];
    if (!p) return '';
    var rel = p.isHome ? '' : p.file;
    if (!SITE_URL) return rel;
    var base = String(SITE_BASE || '').replace(/\/+$/, '');
    var out = String(SITE_URL).replace(/\/+$/, '') + base;
    return out + (rel ? '/' + rel : '/');
  }

  /* Ruta relativa para enlazar entre páginas del propio sitio. Siempre
     relativa al directorio raíz del sitio, que es donde viven las cinco
     páginas, así que el mismo valor sirve en todas ellas. */
  function pageHref(key) {
    var p = PAGES[key];
    if (!p) return '';
    return p.isHome ? 'index.html' : p.file;
  }

  /* ------------------------------------------------------------------
     5 · MARCA Y METADATOS SOCIALES
     ------------------------------------------------------------------
     `title`/`description` tienen longitudes pensadas para no truncarse:
     OG trunca a ~95 caracteres y Twitter a ~70. `fallback` se usa cuando
     falta el campo equivalente en SITE_URL.
     ------------------------------------------------------------------ */
  var META_BRAND = {
    name: 'LEGO Icons',
    longName: 'LEGO Icons · Brick Architecture & Collector Series',
    siteName: 'LEGO Icons',
    /* El nombre de marca aquí es la marca del EDITOR, no LEGO Group. */
    legalNotice: 'LEGO® es una marca registrada de LEGO Group, que no patrocina, autoriza ni avala este sitio.',
    defaultTitle: 'LEGO Icons · Catálogo de sets de construcción para adultos',
    /* El recuento y los nombres de categoría no se escriben a mano. Estaban
       fijos ("12 sets", "arquitectura, vehículos, cultura pop y botánica")
       y se quedaron cortos dos veces sin que nada lo delatara: el contador
       del catálogo sí se generaba, así que la página llegaba diciendo 12 en
       el meta y 18 en el cuerpo. Se calculan más abajo, al final del
       módulo, porque aquí todavía no están los sets. */
    og: {
      type: 'website',
      locale: 'es_ES',
      siteName: 'LEGO Icons',
      image: 'assets/img/og-cover.png',
      imageWidth: 1200,
      imageHeight: 630,
      imageAlt: 'LEGO Icons: catálogo de sets de construcción de colección para adultos.',
      title: 'LEGO Icons · __TOTAL__ sets de construcción para adultos',
      description: 'Arquitectura, vehículos, cultura pop y botánica. Catálogo con piezas, precio de referencia y disponibilidad.',
    },
    twitter: {
      card: 'summary_large_image',
      site: '@tudominio',
      creator: '@tudominio',
      title: 'LEGO Icons · Catálogo de sets para adultos',
      description: '__TOTAL__ sets de construcción de colección, con piezas, precio de referencia y disponibilidad.',
      image: 'assets/img/og-cover.png',
      imageAlt: 'LEGO Icons: catálogo de sets de construcción para adultos.',
    },
  };

  /* ------------------------------------------------------------------
     6 · CONFIGURACIÓN DE LOS SETS (Schema.org y textos de la ficha)
     ------------------------------------------------------------------
     Lo que aquí se declara es igual para todos los sets, así que no se
     repite doce veces en el array. `brand` es la marca del EDITOR, no
     LEGO Group: el fabricante real es LEGO, y el JSON-LD lo dice aparte
     con la propiedad `manufacturer`.
     ------------------------------------------------------------------ */
  var PRODUCT_DATA = {
    /* Fabricante real del producto. */
    manufacturer: 'LEGO Group',
    /* Marca del editor, que es quien publica el catálogo. */
    brand: 'LEGO Icons',
    category: 'Juguetes para adultos › Sets de construcción de colección',
    material: 'ABS de alta precisión',
    maxAge: 65,
    /* Sin aggregateRating: no hay reseñas reales, y publicar un
       aggregateRating inventado es motivo de acción manual de Google.
       Mientras `rating` sea null no se emite el nodo. */
    rating: null,
  };

  /* ------------------------------------------------------------------
     7 · AFILIACIÓN
     ------------------------------------------------------------------
     `affiliateUrl` es siempre la URL LIMPIA del producto en LEGO.com. Los
     parámetros de seguimiento se añaden al pintar, nunca se escriben a mano
     en el array de arriba: así se puede cambiar de red o de identificador
     tocando solo este bloque, sin editar doce líneas.

     `LEGO_AFFILIATE_ID` está VACÍO A PROPÓSITO. Publicar un ID inventado es
     peor que no publicar ninguno: se pierde la comisión y además se atribuyen
     ventas a una cuenta ajena. Mientras esté vacío, `affiliateLink()` devuelve
     la URL tal cual, sin parámetros.

     REDES
     -----
     El programa oficial de LEGO Group se gestiona con Impact. Rakuten es una
     red distinta, con otro contrato y otro nombre de parámetro, así que la red
     se declara en `network` y el nombre del parámetro se declara en `params`.
     Si tu contrato usa otro nombre, se cambia ahí y no en otro sitio: el
     nombre exacto te lo da tu gestor de afiliados, no esta página.
     ------------------------------------------------------------------ */
  var AFFILIATE = {
    /* Identificador de afiliado. Vacío = enlaces limpios, sin tracking. */
    LEGO_AFFILIATE_ID: '',

    /* 'impact' | 'rakuten' | 'none' */
    network: 'impact',

    /* Nombre del parámetro que cada red espera en la URL. */
    params: {
      impact: 'irclickid',
      rakuten: 'tag',
    },
  };

  /* El aviso se compone según lo que haya configurado de verdad, no se
     escribe siempre el mismo. Decía, sin condiciones, "Como Afiliado de
     LEGO.com obtengo ingresos por las compras adscritas", mientras
     `LEGO_AFFILIATE_ID` está vacío y `affiliateLink()` devuelve la URL sin
     ningún parámetro: es decir, se declaraba una relación comercial que no
     existe. Es justo el tipo de matiz que el resto del sitio se detiene a
     respetar (el precio sin confirmar, la disponibilidad sin verificar), y
     aquí era el único sitio donde se afirmaba algo sin comprobar.

     Sin identificador se dice lo que es verdad: que el enlace lleva a la
     tienda oficial, que este sitio no cobra comisión y que no hay relación
     de afiliación. Cuando se rellene el ID, el texto pasa a declarar el
     vínculo real y `affiliateLink()` empieza a añadir el parámetro. */
  (function () {
    var id = String(AFFILIATE.LEGO_AFFILIATE_ID || '').trim();
    var redActiva = id && AFFILIATE.network !== 'none' && AFFILIATE.params
      && AFFILIATE.params[AFFILIATE.network];
    var marca = 'LEGO®';

    AFFILIATE.disclosure = redActiva
      ? 'Enlace de afiliado. Como afiliado de LEGO.com obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables. '
        + marca + ' es una marca registrada de LEGO Group, que no patrocina, autoriza ni avala este sitio.'
      : 'Enlace a la tienda oficial. Este sitio no recibe comisión por las compras y no mantiene ninguna relación de afiliación con LEGO. '
        + marca + ' es una marca registrada de LEGO Group, que no patrocina, autoriza ni avala este sitio. '
        + 'No vendemos nada aquí ni aceptamos encargos: el precio que se muestra es de referencia y puede no coincidir con el de la tienda.';

    AFFILIATE.active = !!redActiva;

    /* Versión corta para el pie de página. Tiene que caber en un párrafo
       corto sin mentir: por eso dice lo mismo que la larga en menos
       palabras, y enlaza a transparencia.html, que es donde está el detalle.
       No lleva el aviso de marca, que sí está en el pie de todas las
       páginas en el bloque legal. */
    AFFILIATE.disclosureShort = redActiva
      ? 'Enlaces de afiliado: podemos cobrar una comisión si compras a través de ellos, sin coste para ti. El detalle, en transparencia.'
      : 'Enlaces a tiendas de terceros. Este sitio no cobra comisión por ellos. El detalle, en transparencia.';
  })();

  /* ------------------------------------------------------------------
     7b · GUÍA DE MONTAJE
     ------------------------------------------------------------------
     El contenido de la página de preguntas frecuentes. Vive en los datos y
     no en el HTML por la misma razón que el resto: si alguien corrige una
     recomendación de material, tiene que corregirse en un sitio, y la
     página se regenera sola en la siguiente pasada del generador.

     `tools` es material necesario, no una lista de sugerencias de compra:
     el primero es imprescindible y el segundo es opcional pero en la
     práctica necesario. El tercero es un extra. */
  var GUIDE = {
    tools: [
      ['Una superficie de trabajo amplia', 'Un set de miles de piezas se come una mesa entera. Si la mesa es pequeña, monta sobre una sábana extendida en el suelo: los tetones se enganchan al tejido y se te van sin darte cuenta.'],
      ['Un separador de piezas o tres platos hondos', 'Los ladrillos de 1×1 y 1×2 se mezclan con las piezas largas y no se distinguen de un vistazo. Sin separador, acabas desmontando media construcción para recuperar los que te faltan.'],
      ['Un buen par de pinzas (opcional)', 'Comodidad, no necesidad. Sirve sobre todo para las luces y las piezas de 1×1, que se pierden con los dedos y no aparecen más.'],
    ],
  };

  /* ==================================================================
     Helpers
     ================================================================== */

  /* Ruta RELATIVA, para `href` y `src`. Es la que debe usarse en la
     navegación: al ser relativa, el mismo HTML funciona publicado en la raíz
     del dominio y en una subruta de GitHub Pages sin cambiar nada.
     `depth` son los niveles de directorio del documento que la usa: 0 en
     index.html, 1 en <pagina>/index.html. Por eso el helper necesita que se
     le diga dónde se está escribiendo el enlace. */
  function path(route, depth) {
    var up = new Array((depth || 0) + 1).join('../');
    var clean = String(route == null ? '' : route).replace(/^\/+/, '');
    if (!clean) return (up || './') + '';
    /* Un directorio necesita barra final para que la ruta sin extensión
       funcione en cualquier hosting estático; un fichero, no. */
    var isDir = clean.slice(clean.lastIndexOf('/') + 1).indexOf('.') === -1;
    return (up || './') + clean + (isDir ? '/' : '');
  }

  /* URL ABSOLUTA, solo para schema.org, canonical y Open Graph. Acepta '/x',
     'x/y' y URLs completas (que se devuelven tal cual). Incluye SITE_BASE
     porque estas no admiten rutas relativas. */
  function url(p) {
    /* Sin origen conocido no se puede construir una URL absoluta. Se
       devuelve vacío y quien llama omite el campo, en vez de emitir
       '/lego-icons/...', que es una URL absoluta mal formada y bastante
       peor que un dominio inventado: rompe el que la parsea. */
    if (!SITE_URL) return '';
    if (!p) return SITE_URL + SITE_BASE + '/';
    if (/^https?:\/\//i.test(p)) return p;
    return SITE_URL + SITE_BASE + '/' + String(p).replace(/^\/+/, '');
  }

  /* Dirección postal formateada para schema.org y para el pie. */
  function postalAddress() {
    var a = COMPANY_LEGAL.address;
    return {
      '@type': 'PostalAddress',
      streetAddress: a.street,
      addressLocality: a.locality,
      addressRegion: a.region,
      postalCode: a.postalCode,
      addressCountry: a.country,
    };
  }

  /* Formatea un importe desde los datos de config. Devuelve null si no hay
     importe: es preferible no pintar precio a inventar uno. */
  function money(amount) {
    if (amount == null) return null;
    return new Intl.NumberFormat(PRICING_DATA.locale, {
      style: 'currency',
      currency: PRICING_DATA.currency,
      minimumFractionDigits: 2,
    }).format(amount);
  }

  /* ------------------------------------------------------------------
     Helpers del catálogo
     ------------------------------------------------------------------ */

  /* Añade el parámetro de afiliado a una URL de producto.

     Reglas, en este orden:
       1. Sin URL, se devuelve tal cual: no hay nada que ciclar.
       2. Sin ID, se devuelve la URL LIMPIA. Es el caso por defecto y no
          puede fallar: sin identificador no se emite ningún parámetro, ni
          vacío ni de relleno.
       3. Red 'none', o params[network] ausente: también URL limpia. Es
          mejor un enlace sin tracking que un enlace con un parámetro
          inventado que la red no recognise.
       4. Solo se toca lo que apunta a LEGO.com. El helper es genérico y
          no debe alterar ninguna otra URL que pase por él.

     Se usa `URL` y no concatenación de cadenas a mano porque el destino
     puede traer ya su propia query (?q=, ?storeId=…) y hay que encadenar
     con & y no con ?, y codificar el valor. */
  function affiliateLink(target) {
    var clean = String(target == null ? '' : target).trim();
    if (!clean) return '';
    var id = String(AFFILIATE.LEGO_AFFILIATE_ID || '').trim();
    if (!id) return clean;
    if (AFFILIATE.network === 'none' || !AFFILIATE.params) return clean;
    var key = AFFILIATE.params[AFFILIATE.network];
    if (!key) return clean;
    if (!/^https?:\/\/([^/]*\.)?lego\.com\//i.test(clean)) return clean;
    try {
      var u = new URL(clean);
      u.searchParams.set(key, id);
      return u.toString();
    } catch (e) {
      /* Si la URL no se puede parsear se deja como está: es preferible un
         enlace que funciona a uno que se ha roto al normalizarlo. */
      return clean;
    }
  }

  /* ------------------------------------------------------------------
     Estimación de horas de montaje
     ------------------------------------------------------------------
     Seis de los sets traen `buildHours` porque el dato está dado. En los
     demás se estima aquí a partir del número de piezas, y la tarjeta lo
     dice: una estimación presentada como dato de fábrica sería falsa.

     RITMO: 250 piezas/hora. Es un ritmo conservador a propósito: un adulto
     concentrating en un set detallado va entre 300 y 500 piezas/h, pero en
     un set grande la media baja porque aparecen subensamblajes largos y
     pausas para consultar el manual. Es la cifra que mejor se ajusta a
     los seis datos conocidos: 7541 piezas da 30 h (dado: 25-30 h) y 878
     da 3,5 h (dado: 3-5 h).

     El rango es +-25 %, y el mínimo de 1 h porque ningún set —ni las
     margaritas de 133 piezas— se monta en diez minutos. Un set sin número
     de piezas no se estima: sale null y la tarjeta lo dice, igual que
     hace con las piezas. */
  var PIECES_PER_HOUR = 250;

  function estimateBuildHours(pieces) {
    if (pieces == null || pieces <= 0) return null;
    var h = pieces / PIECES_PER_HOUR;
    if (h < 1) return '1 h';
    return Math.max(1, Math.round(h * 0.75)) + '-' + Math.round(h * 1.25) + ' h';
  }

  /* Un set con su categoría resuelta, que es lo que necesitan la tarjeta,
     el filtro y el JSON-LD. Se devuelve una copia para que nadie pueda
     mutar la configuración por accidente. */
  function decorate(set) {
    var cat = null;
    for (var i = 0; i < PRICING_DATA.categories.length; i++) {
      if (PRICING_DATA.categories[i].key === set.category) { cat = PRICING_DATA.categories[i]; break; }
    }
    var out = {};
    for (var k in set) if (Object.prototype.hasOwnProperty.call(set, k)) out[k] = set[k];
    out.categoryLabel = cat ? cat.label : set.category;
    out.categoryIcon = cat ? cat.icon : 'ic-cube';
    out.priceFormatted = money(set.price);
    out.compareAtFormatted = money(set.compareAtPrice);
    out.hasDiscount = !!(set.compareAtPrice && set.price
      && set.compareAtPrice > set.price);
    out.discountPercent = out.hasDiscount
      ? Math.round((1 - set.price / set.compareAtPrice) * 100)
      : 0;
    /* El CTA solo es un enlace si hay URL de afiliado real. Con null se
       muestra el estado deshabilitado: es preferible a un botón que no
       lleva a ninguna parte. `affiliateBase` conserva la URL limpia de la
       configuración y `affiliateUrl` es la que se pinta, ya con el
       parámetro de la red si hay identificador. */
    out.affiliateBase = set.affiliateUrl || '';
    out.affiliateUrl = affiliateLink(set.affiliateUrl);
    out.hasAffiliate = !!out.affiliateUrl;
    out.isUpcoming = set.availability === 'PreOrder';

    /* Horas de montaje: el dato dado si lo hay, y si no la estimación.
       `buildHoursEstimated` es lo que permite que la tarjeta distinga una
       de otra en lugar de presentar las dos como si fueran lo mismo. */
    out.buildHoursEstimated = !set.buildHours;
    out.buildHours = set.buildHours || estimateBuildHours(set.pieces);
    out.buildHoursLabel = out.buildHours == null
      ? 'Horas por confirmar'
      : (out.buildHoursEstimated ? '~' + out.buildHours + ' (estimadas)' : out.buildHours);
    return out;
  }

  /* Los 12 sets, con la categoría ya resuelta. */
  function sets() {
    return PRICING_DATA.sets.map(decorate);
  }

  /* Un set por id, o null. */
  function setById(id) {
    for (var i = 0; i < PRICING_DATA.sets.length; i++) {
      if (String(PRICING_DATA.sets[i].id) === String(id)) return decorate(PRICING_DATA.sets[i]);
    }
    return null;
  }

  /* Categorías con el número de sets que contiene cada una, para poder
     pintar el contador en el filtro sin recorrer el array en el HTML. */
  function categories() {
    return PRICING_DATA.categories.map(function (c) {
      return {
        key: c.key,
        label: c.label,
        icon: c.icon,
        description: c.description,
        count: PRICING_DATA.sets.filter(function (s) { return s.category === c.key; }).length,
      };
    });
  }

  /* Resumen para la cabecera del catálogo. Los precios sin confirmar se
     cuentan aparte: no se suman al mínimo como si fueran definitivos. */
  function catalogSummary() {
    var withPrice = PRICING_DATA.sets.filter(function (s) { return s.price != null; });
    var prices = withPrice.map(function (s) { return s.price; });
    return {
      total: PRICING_DATA.sets.length,
      categories: PRICING_DATA.categories.length,
      pieces: PRICING_DATA.sets.reduce(function (a, s) { return a + (s.pieces || 0); }, 0),
      priceFrom: prices.length ? Math.min.apply(null, prices) : null,
      priceMax: prices.length ? Math.max.apply(null, prices) : null,
      priceFromFormatted: prices.length ? money(Math.min.apply(null, prices)) : null,
      priceMaxFormatted: prices.length ? money(Math.max.apply(null, prices)) : null,
      pendingPrice: PRICING_DATA.sets.length - withPrice.length,
      upcoming: PRICING_DATA.sets.filter(function (s) { return s.availability === 'PreOrder'; }).length,
      withAffiliate: PRICING_DATA.sets.filter(function (s) { return !!s.affiliateUrl; }).length,
    };
  }

  /* Texto del copyright del pie. La razón social suele terminar en abreviatura
     punctuated ("S.L.", "S.A."), así que no añadimos un punto extra. */
  function copyright(year) {
    var name = COMPANY_LEGAL.name.replace(/[.\s]+$/, '');
    return '© ' + (year || new Date().getFullYear()) + ' ' + name
      + '. Todos los derechos reservados. ' + META_BRAND.legalNotice;
  }

  /* Los cuatro enlaces legales en el orden en que se pintan. */
  function legalLinks() {
    return [LEGAL_LINKS.privacy, LEGAL_LINKS.terms, LEGAL_LINKS.cookies, LEGAL_LINKS.notice];
  }

  /* Identificadores estables del JSON-LD.
     Los `@id` de las colecciones apuntan ahora a la página que las contiene y
     no a la portada: el ItemList está en catalogo.html y el FAQPage en
     preguntas-frecuentes.html. Un `@id` que apunta a una página que ya no
     contiene ese contenido hace que los buscadores confundan el nodo, y
     cada URL tiene que ser estable: cambiarla después invalida lo ya
     indexado sin avisar. */
  function ids() {
    return {
      organization: url('/#organization'),
      website: url('/#website'),
      breadcrumb: url('/#breadcrumb'),
      itemList: url('/catalogo.html#catalogo'),
      faq: url('/preguntas-frecuentes.html#faq'),
    };
  }

  /* @id de un set concreto, para que el Product del JSON-LD y la tarjeta
     de la página apunten al mismo nodo. Los sets viven en catalogo.html
     desde que el catálogo pasó a ser su propia página, así que el ancla va
     detrás del fichero y no de la raíz del sitio. */
  function setId(id) {
    return url('/catalogo.html#set-' + id);
  }

  /* Los textos de la meta que dependen del catálogo se resuelven aquí, ya
     con los sets leídos, y no al construir META_BRAND (sección 5), que está
     por encima de los datos. Antes eran literales: "12 sets" y una lista de
     cuatro categorías. Al crecer el catálogo se quedaron cortos dos veces y nada
     lo detectó, porque el contador del catálogo sí se generaba y la página
     se contradecía a sí misma entre el meta y el cuerpo. */
  var _total = catalogSummary().total;
  var _temas = categories().map(function (c) { return c.label.toLowerCase(); });
  META_BRAND.defaultDescription = 'Catálogo de ' + _total + ' sets de LEGO® para adultos: '
    + _temas.join(', ') + '. Piezas, precio de referencia y disponibilidad.';
  META_BRAND.og.title = META_BRAND.og.title.replace('__TOTAL__', _total);
  META_BRAND.twitter.description = META_BRAND.twitter.description.replace('__TOTAL__', _total);

  /* Lo mismo para los títulos y descripciones de cada página: el `__TOTAL__`
     que aparece en PAGES se resuelve ahora que ya se sabe cuántos sets hay.
     Se recorre con un bucle y no a mano porque el valor solo existe en este
     punto del módulo: PAGES está declarado en la sección 4b, por encima de
     los sets, y en ese momento `catalogSummary()` todavía no se puede
     llamar. */
  Object.keys(PAGES).forEach(function (k) {
    PAGES[k].title = PAGES[k].title.replace('__TOTAL__', _total);
    PAGES[k].description = PAGES[k].description.replace('__TOTAL__', _total);
  });

  return {
  SITE_URL: SITE_URL,
  SITE_BASE: SITE_BASE,
  CANONICAL_URL: CANONICAL_URL,
  SITE_URL_SOURCE: SITE_URL_SOURCE,
  SITE_BASE_SOURCE: SITE_BASE_SOURCE,
    COMPANY_LEGAL: COMPANY_LEGAL,
    PRICING_DATA: PRICING_DATA,
    LEGAL_LINKS: LEGAL_LINKS,
    PAGES: PAGES,
    NAV_PAGES: NAV_PAGES,
    pageUrl: pageUrl,
    pageHref: pageHref,
    META_BRAND: META_BRAND,
    PRODUCT_DATA: PRODUCT_DATA,
    AFFILIATE: AFFILIATE,
    GUIDE: GUIDE,
    /* Helpers */
    path: path,
    url: url,
    postalAddress: postalAddress,
    money: money,
    affiliateLink: affiliateLink,
    copyright: copyright,
    legalLinks: legalLinks,
    ids: ids,
    setId: setId,
    /* Catálogo */
    sets: sets,
    setById: setById,
    categories: categories,
    catalogSummary: catalogSummary,
  };
});
