# LEGO Icons — Brick Architecture & Collector Series

Landing page de alta conversión para una gama de sets de construcción premium para adultos.
Sitio estático: **HTML5 + CSS moderno + JavaScript vanilla**, sin dependencias, sin build
y sin framework.

---

## 1 · Puesta en marcha

No hay instalación. Solo necesita un servidor local (los `fetch`/módulos no se usan, pero
algunos navegadores restringen el sistema de ficheros).

```bash
# Opción A · Python
python -m http.server 8080

# Opción B · Node
npx serve .

# Opción C · VS Code
# Extensión "Live Server" → botón Go Live
```

Luego abrir <http://localhost:8080>.

Publicación: sube la carpeta tal cual a cualquier hosting estático
(Netlify, Vercel, Cloudflare Pages). No hay carpeta de compilación.

### GitHub Pages

En la raíz del repositorio hay dos archivos que el hosting necesita y que no
son opcionales:

- **`.nojekyll`** (vacío). Sin él, Jekyll interviene, se salta todo lo que
  empieza por `_` y la publicación no coincide con lo que hay en el repo.
- **`404.html`**. GitHub Pages lo sirve con estado 404 en cualquier ruta
  inexistente. El nuestro es autónomo, con `noindex` y enlaces relativos, de
  modo que funciona igual en la raíz del dominio y en `/mi-repo`.

La URL del sitio se resuelve sola al publicar, así que **no hay que tocar nada
antes del primer `git push`**. `GITHUB_REPOSITORY` la inyecta GitHub Actions y
de ahí se derivan el origen y la subruta; si algún día hay dominio propio, se
define con `SITE_URL` (ver sección 6). El sitio entero se despliega con:

```bash
git add -A && git commit -m "Catálogo de sets LEGO" && git push
```

Y en GitHub, **Settings → Pages → Source = GitHub Actions**. Tarda unos
minutos en estar disponible.

El HTML del repositorio se guarda **sin canonical y sin URLs absolutas**, a
propósito: es lo único que no depende de conocer el nombre final del
repositorio, y evita dejar un dominio inventado versionado. El workflow
regenera el HTML con la URL buena antes de verificarlo y de subirlo, de modo
que lo que se publica siempre lo lleva.

Si alguna vez el sitio se rompe con rutas tipo `/mi-repo/politica-privacidad`,
el motivo casi siempre es un `href="/..."` escrito a mano: `tools/check.js` y
`tools/e2e.js` avisan de eso precisamente.

---

## 2 · Estructura

```
.
├── index.html                  # Documento completo (contenido, SEO, JSON-LD)
├── 404.html                     # Página de error que sirve GitHub Pages (noindex)
├── .nojekyll                    # Desactiva Jekyll al publicar (vacío)
├── .gitignore                   # Sistema, editores y artefactos
├── README.md
├── aviso-legal/index.html      # Aviso legal (LSSI)
├── cookies/index.html          # Política de cookies
├── politica-privacidad/index.html
├── terminos-y-condiciones/index.html
├── assets/
│   ├── css/
│   │   └── styles.css          # Tokens, componentes, catálogo, responsive, a11y
│   ├── js/
│   │   ├── site-data.js        # FUENTE ÚNICA de configuración (ver §2.1)
│   │   ├── main.js             # 7 módulos de comportamiento (sin librerías)
│   │   └── legal-page.js       # Solo las páginas legales
│   └── img/
│       ├── hero-pyramid.jpg     # Visual principal del hero (portada)
│       ├── hero-pyramid-cuadrada.jpg  # El mismo visual, cuadrado (páginas interiores)
│       ├── hero-tower.svg       # Torre anterior, ya sin referencias
│       ├── led-module.svg       # Diagrama del módulo LED
│       ├── sets/                # Las 12 fotos de los sets (aún vacías, ver §7)
│       ├── og-cover.svg         # Plantilla de la imagen social
│       └── og-cover.png         # Imagen social (1200×630), generada
└── tools/                      # Utilidades de verificación (Node, sin dependencias)
    ├── serve.js                # Servidor estático local (resuelve rutas de directorio)
    ├── sync-config.js          # Genera el HTML y el JSON-LD desde site-data.js
    ├── sync-legal-head.js      # Mantén las cuatro cabeceras legales en sincronía
    ├── check.js                # Valida HTML, ARIA, SEO, JSON-LD, config y assets
    ├── subpath-check.js        # Publica el proyecto en /repo y comprueba que nada se rompe
    ├── css-lint.js             # Valida el CSS: llaves, variables y contraste
    ├── render.js               # Captura y vuelca el DOM con Edge/Chrome
    ├── verify-dom.js           # Comprobaciones del DOM ya renderizado
    ├── e2e.js                  # 167 comprobaciones de interacción vía CDP
    └── rasterize.js            # Convierte un SVG a PNG con Edge/Chrome
```

Las páginas legales viven en `<ruta>/index.html` para que la ruta sin extensión
(`/politica-privacidad`) funcione en cualquier hosting estático. Sus textos
legales son **plantillas sin valor jurídico**: revísalas con un profesional
antes de publicar.

---

## 2.1 · Configuración centralizada

**Todo lo editable está en `assets/js/site-data.js`.** No hay datos de empresa,
precios ni metadatos escritos a mano en el HTML.

```js
SITE_URL, SITE_BASE, CANONICAL_URL   // URL base, prefijo de publicación y canónica
path(route, depth)                   // Ruta relativa para la navegación (depth 0 = raíz)
url(p)                               // URL absoluta para canonical, OG y JSON-LD
setId(id)                            // URL absoluta de la ficha de un set
COMPANY_LEGAL                        // Razón social, NIF, dirección, email, DPO
PRICING_DATA                         // Moneda, IVA, formateo y las 4 categorías
LEGAL_LINKS                          // Rutas de las cuatro páginas legales
META_BRAND                           // Marca y metadatos OG / Twitter
PRODUCT_DATA                         // Fabricante, marca, categoría, material, edad
sets(), setById(), categories()      // Los 12 sets, ya decorados con precio y URL
catalogSummary()                     // Totales del catálogo: sets, piezas, rango de precio
copyright(year), legalLinks(), money() // Pie de página y formateo
```

`sets()` devuelve los datos ya normalizados: precio formateado, disponibilidad
legible, icono de categoría y URL de la ficha. El HTML y el JSON-LD se construyen
sobre eso, así que un cambio de formato de precio no se propaga a mano.

### Rutas: por qué hay dos helpers

El sitio se publica en GitHub Pages, y ahí la URL final depende de dónde se
suba: en un dominio propio es `https://midominio.com/`, y en un repositorio
cualquiera es `https://usuario.github.io/mi-repo/`. El mismo HTML tiene que
funcionar en los dos sitios sin editarlo.

- **`path(route, depth)`** es lo que se usa en **enlaces**: devuelve rutas
  relativas (`./politica-privacidad/`, `../politica-privacidad/`), que se
  resuelven bien en la raíz y en cualquier subruta. No depende de `SITE_BASE`.
- **`url(p)`** es lo que se usa en **canonical, Open Graph y JSON-LD**: aquí sí
  hacen falta direcciones absolutas, porque un buscador nunca resuelve
  `assets/img/og-cover.png` por su cuenta.

La URL de publicación ya no se escribe a mano: se deduce del entorno.

| Prioridad | Variable | Ejemplo | Para qué sirve |
|---|---|---|---|
| 1 | `SITE_URL` | `https://midominio.es` | Dominio final. Admite también la URL completa (`https://midominio.es/catalogo`) y el dominio sin esquema. Si no se define, se deriva de `GITHUB_REPOSITORY`. |
| 2 | `SITE_BASE` | `/mi-repo` o `/` | Subruta de publicación. `/` significa raíz. Si no se define, se usa la ruta de `SITE_URL` o la del repositorio. |
| — | `GITHUB_REPOSITORY` | `usuario/mi-repo` | GitHub Actions la inyecta sola. No hay que configurarla. |

Con `GITHUB_REPOSITORY=usuario/mi-repo` el resultado es
`https://usuario.github.io/mi-repo/`, y con `usuario/usuario.github.io`, que es
un sitio de usuario, la raíz sin subruta. La navegación no se toca al
cambiar nada de esto, porque es relativa; solo se mueven las URLs absolutas.

Con `SITE_URL` sin resolver —en local, o en un repo sin remoto— las funciones
que necesitan direcciones absolutas devuelven cadena vacía y el HTML se genera
**sin** canonical, `og:url`, `og:image` y URLs en el JSON-LD. Es un estado
legítimo: es preferible no declarar un canonical a declarar uno equivocado, que
es un error caro porque lo indexa el buscador. `tools/check-env.js` es la puerta
que impide publicar en ese estado.

Para ver los cuatro casos sin desplegar nada:

```bash
node tools/url-scenarios.js
```

Tras editar la configuración:

```bash
node tools/sync-config.js
```

El script reescribe los bloques delimitados por
`<!-- site:HEAD:start -->`, `site:JSONLD`, `site:FOOTER` y `site:LEGAL` en cada
página, y sustituye los tokens `{{company}}`, `{{taxId}}`, `{{email}}`,
`{{dpoEmail}}`, `{{address}}`, `{{legalNotice}}`, `{{shippingDays}}`… del texto
legal. `node tools/check.js` falla si la configuración y el HTML se desincronizan,
así que no se puede publicar a medias.

Los metadatos se escriben en el HTML estático a propósito: los crawlers no
ejecutan JavaScript, de modo que canonical, Open Graph y JSON-LD tienen que estar
en el HTML y no generarse en runtime.

`site-data.js` se exporta con un patrón UMD, de modo que lo usan tanto el
navegador (`window.SITE_DATA`) como las herramientas de Node. Esa doble vida
tiene una consecuencia que conviene no pasar por alto: **el navegador no tiene
`process.env`**, así que en la página `SITE_DATA.CANONICAL_URL` siempre está
vacío, mientras que el HTML sí lleva la URL real porque la resolvió Node al
generarse. Por eso `tools/e2e.js` resuelve el canonical esperado en Node, en vez
de leerlo de `window.SITE_DATA`: leerlo de la página haría que el test pasara en
local y fallara en producción, justo al revés de lo que sirve. En la práctica el
navegador no necesita la URL canónica para nada, porque no se usa en runtime.

### Valores que hay que cambiar antes de publicar

| Clave | Ahora | Actionable |
| --- | --- | --- |
| `SITE_URL` | se deduce sola | **Nada.** Solo si hay dominio propio, y entonces se define en el entorno del runner |
| `SITE_BASE` | se deduce sola | **Nada.** Se deriva del repositorio; `/` lo fuerza a la raíz |
| `COMPANY_LEGAL.name` / `taxId` / `address` / `email` | datos inventados | Datos del registro |
| `COMPANY_LEGAL.dpo` | `name: null` | Delegado de Datos, si existe |
| `PRICING_DATA.priceFrom` / `priceMax` | 79,99 / 119,99 | Precio real |
| `META_BRAND.twitter.site` / `creator` | `@tudominio` | Cuentas reales |
| `META_BRAND.og.image` | `assets/img/og-cover.png` | Subir el PNG y comprobar la URL pública |
| `PRODUCT_DATA.rating.isPlaceholder` | `true` | Poner a `false` **solo** con reseñas reales |

Con `rating.isPlaceholder` en `true` el JSON-LD **omite** el nodo
`aggregateRating`: publicar reseñas ficticias es motivo de acción manual de
Google. Las reseñas visibles en la página siguen siendo de demostración.

---

## 3 · Secciones de la página

| Ancla          | Bloque                                        | Para qué sirve                  |
| -------------- | --------------------------------------------- | ------------------------------- |
| `#como`        | Qué somos y qué no somos                      | Situar el proyecto y sus límites |
| `#categorias`  | Las cuatro categorías                         | Enseñar el surtido              |
| `#catalogo`    | Fichas filtrables                             | **El centro de la página**      |
| `#comunidad`   | Revelado gigante y polaroids                 | La gente que construye          |
| `#tiendas`     | Tiendas de ejemplo                            | Dónde mirar antes de comprar    |
| `#iluminacion` | Módulo de iluminación LED                     | Detalle de producto             |
| `#faq`         | 6 preguntas                                   | Objeciones frecuentes            |

Hay cinco secciones con `id`; el resto se alcanza por scroll normal. Las CTAs
apuntan a `#catalogo` y, cuando exista, al enlace de afiliado del set.
**No hay carrito ni checkout**: el sitio no vende, deriva a la tienda oficial.

Entre el catálogo y la comunidad hay una banda de **marquesina** que no es una
sección —no lleva `id` ni título propio— sino tránsito: separa dos bloques
claros para que el ojo no los lea como una sola tira larga.

### 3.1 · Secciones fuera de los bloques `site:`

`#comunidad`, `#tiendas` y la marquesina **no** las genera `tools/sync-config.js`.
No es un descuido: su texto no sale de `site-data.js` —la lista de motivos de la
marquesina son seis frases fijas, y las tiendas son un bloque de ejemplo sin
datos de origen—. Si algún día tienen que venir de los datos, lo que corresponde
es un bloque `site:MARQUEE` o `site:SHOPS` en el generador, no este HTML escrito
a mano. Editar estos bloques a mano es seguro; lo que no sobrevive a un
`sync-config` es contenido colocado *dentro* de un `site:`.

### 3.2 · El preloader

Antes de esto había una intro 3D con Three.js desde un CDN. Se retiró entera —
archivo, `<canvas>`, preload— y la sustituyó un **muro de ocho ladrillos** dibujado
con CSS (`assets/js/preloader.js`, `assets/css/styles.css` §16).

- Se juega solo la primera visita de la sesión: la llave es
  `sessionStorage['lego-intro-seen']`, que decide un script en línea de la `<head>`.
- **El `<body>` nunca se oculta.** Se tapó con `visibility:hidden` en una versión
  anterior y hundía el LCP de la portada de 472 ms a 8160 ms. El overlay tapa sin
  necesidad de dejar de pintar la página.
- Hay dos relojes de seguridad: 5,2 s en la `<head>` y 9 s en el módulo. Si el
  script no llega, la web se ve igual. `prefers-reduced-motion` lo salta entero.
- Con `data-intro="pending"` el contenido de detrás queda `inert`: sin foco ni
  puntero mientras el overlay está puesto.

---

## 4 · Sistema de diseño

Definido con custom properties en `:root` (`assets/css/styles.css`).

- **Color**: fondo crema `#fff4dc`, superficies `#f2e6ce`, tinta `#1b1612` y línea
  `#dfd3bc`. Acento amarillo `#ffd500`, rojo `#d01012` y azul `#0055bf` / `#00429a`.
- **Tipografía**: Anton (display grande), Bricolage Grotesque (texto), Instrument
  Sans y JetBrains Mono (datos y etiquetas). Sin script: la intro 3D usaba una
  Lobster Two que se retiró con ella.
- **Superficies**: cristal (`backdrop-filter`), radios de 2/16 px y píldora,
  bordes de 1–2 px.
- **Movimiento**: transiciones de 160–320 ms con `cubic-bezier(.22,1,.36,1)`.
- **Foco**: anillo dorado de 3 px con desplazamiento de 2 px en todos los interactivos.

Para re-tematizar la página basta con cambiar las variables de `:root`. Dos
invariantes que `tools/css-lint.js` vigila y que conviene no romper:

- **El croma de los neutros.** Los grises se miden contra el fondo: por encima de
  40 de croma, un neutro que debería ser cálido se vuelve azul o verde y rompe la
  paleta. `--line` está en `#dfd3bc` por eso, no por gusto.
- **Las variables huérfanas y los targets táctiles** avisan cuando un token se
  deja de usar o cuando un interactivo se queda por debajo de 44 px.

Las animaciones de la marquesina, el revelado gigante y los polaroids arrancan
**visibles**: el estado final lo pone `animation`, no una clase de JavaScript. Si
el script no llega, no hay contenido invisible.

El desplazamiento por anclas usa un único offset: `scroll-padding-top` en `html`
(`--header-h + 16px`). No hay `scroll-margin-top` en las secciones porque se
sumaría al anterior y dejaría ~160 px de hueco bajo una cabecera de 68 px.

---

## 5 · Comportamiento (`assets/js/main.js`)

Todo se inicializa desde `boot()` y respeta `prefers-reduced-motion`. Los siete
módulos son independientes: si falta su marcado en una página, no hacen nada.

1. `initHeader` — cabecera fija, barra de progreso de lectura y enlace de nav
   activo con `IntersectionObserver`.
2. `initDrawer` — menú móvil con `aria-expanded`, cierre con `Escape`, clic fuera,
   scroll o paso a escritorio, y devolución del foco. Ignora el reajuste de scroll
   que provoca su propia apertura, para que el menú no se cierre solo.
3. `initAnchors` — desplazamiento suave y foco movido al destino.
4. `initReveal` — aparición progresiva de bloques al entrar en pantalla.
5. `initFaq` — acordeón con `aria-expanded` y un panel abierto a la vez.
6. `initImages` — skeleton con shimmer mientras carga, fundido al cargar y
   contenedor glassmorphism con icono, nombre del set y categoría si la ruta falla.
7. `initCatalog` — filtros por categoría, buscador, cuatro ordenaciones y
   contadores de sets y piezas. Es la única parte que lee y escribe en el DOM del
   catálogo, y siempre a partir de los `data-*` del HTML.

### El catálogo (`initCatalog`)

Es una mejora progresiva sobre HTML ya completo: sin JavaScript las 12 fichas se
leen, se filtran con el buscador del navegador y enlazan a la sección correcta.

- Los `data-*` de cada ficha (`data-set-id`, `data-category`, `data-name`,
  `data-pieces`, `data-price`) se leen **una vez** al arrancar; el índice original
  se guarda como `order` y sirve de desempate estable en empates de precio o piezas.
- Un set sin piezas o sin precio **no se ordena como 0**: se va al final en los dos
  sentidos, porque multiplicar el comparador por `-1` también invertiría ese caso.
- El buscador normaliza a minúsculas y sin acentos, así que «sagrada» encuentra
  «Sagrada Família» y «e-type» encuentra «Jaguar E-Type». También acepta el
  número de set, que es lo que alguien teclea: «21065». `Escape` limpia el campo.
  Solo recorre el **nombre y el número de set**, no la categoría: escribir
  «vehículo» no devuelve nada, porque «Vehículos» es el nombre de una categoría
  y no entra en el texto buscado. Para eso están los chips.
- Los contadores de cada chip reflejan lo que habría con ese filtro, no lo que hay
  ahora, para que se vea cuánto hay antes de pulsarlo.
- Las fichas que no entran se ocultan con `hidden`, no se borran: siguen en el DOM
  para el buscador del navegador y para el JSON-LD.

### `initImages`

No necesita librerías: se marca el contenedor con `data-img` y el script gestiona
el estado del ciclo de vida de la imagen.

```html
<div class="setcard__media imgbox" data-img data-img-label="Set 21065">
  <span class="imgbox__skeleton" aria-hidden="true"></span>
  <img class="imgbox__el" src="assets/img/sets/21065.jpg" width="640" height="480"
       loading="lazy" decoding="async" alt="Sagrada Família (set 21065), Arquitectura. Fotografía del set."
       data-img-has-source="false">
  <noscript><span class="imgbox__fallback-note">
    <a href="assets/img/sets/21065.jpg">Abrir la imagen de Sagrada Família</a>.
  </span></noscript>
</div>
```

| Estado | Qué hace |
| --- | --- |
| `data-state="loading"` | Skeleton con shimmer detrás de la imagen |
| `data-state="loaded"` | La imagen se funde y el skeleton se oculta |
| `data-state="error"` | Se oculta el `<img>` roto y aparece el contenedor de sustitución |

Detalles de implementación:

- **El skeleton es un desenfoque con gradientes y shimmer en CSS, no un BlurHash
  real.** Decodificar un BlurHash exige su algoritmo (base64 → DC/AC → YCbCr) y,
  sin dependencias, no compensa: el resultado visual es equivalente y no ocupa
  bytes extra en el HTML.
- Con `data-img-has-source="false"` el contenedor lleva directamente a la
  sustitución: la imagen no existe todavía y no hay nada que esperar. Así, las
  12 fichas del catálogo funcionan hoy sin tocar una sola línea de JavaScript.
- La sustitución de las fichas la inyecta `setCardFallback()`: icono de la
  categoría, **nombre del set**, referencia y categoría, todo con DOM y
  `textContent` en lugar de `innerHTML`.
- Una imagen ya en caché puede no disparar `load`, así que se comprueba
  `img.complete && naturalWidth > 0` antes de esperar al evento.
- Al fallar, el `<img>` recibe `aria-hidden="true"` y `display: none`: si no, un
  lector de pantalla anunciaría dos veces la descripción.
- Todos los fallos se acumulan en **un único** nodo `role="status"`
  (`[data-img-announcer]`), no uno por imagen: con las 12 fotos ausentes no se
  anuncian doce errores seguidos.
- Hay un `<noscript>` con enlace directo al asset, para el caso de que no se
  cargue el JavaScript.

### Eventos de medición

`main.js` no envía nada a ningún servidor. Emite los eventos en dos sitios:

```js
// 1. dataLayer, si existe (Google Tag Manager, etc.)
window.dataLayer.push({ event: 'catalog_filter', detail: { category: 'botanica' } });

// 2. Evento nativo en document, para conectar cualquier analítica
document.addEventListener('legoicons:track', function (e) {
  console.log(e.detail.event, e.detail.detail);
});
```

Eventos emitidos: `catalog_filter`, `catalog_search`, `catalog_sort`,
`affiliate_click`, `faq_open`, `image_fallback`.

No se emite nada por escribir en el buscador: se filtran 12 fichas sin coste, y un
evento por pulsación llenaría la analítica de ruido sin información útil.

El evento se despacha en `document` y con burbujeo, así que se puede escuchar en
`document` o en `window` indistintamente.

---

## 6 · Datos placeholder que hay que sustituir

Nada de esto es real: son valores de demostración y **deben** reemplazarse antes de
publicar. Los datos de empresa, precios, URLs y metadatos **no** están en el HTML:
viven en `assets/js/site-data.js` (§2.1). El generador los inyecta.

| Ubicación              | Placeholder                                          | Dónde            | Cómo se ve ahora              |
| ---------------------- | ---------------------------------------------------- | ---------------- | ----------------------------- |
| Dominio canónico       | se deduce del repositorio o de `SITE_URL`            | `site-data.js`   | **Nada pendiente**            |
| Razón social           | `Brick Studio Editorial S.L.`                       | `site-data.js`   | En el pie y en las legales     |
| NIF y dirección        | `B-00000000`, `Calle de la Ejemplo 00`              | `site-data.js`   | En el pie y en las legales     |
| Correos                | `hola@` y `privacidad@tudominio.com`                 | `site-data.js`   | Enlaces del pie               |
| Redes                  | `@tudominio`                                         | `site-data.js`   | Solo en `twitter:site`         |
| Enlaces de afiliado   | `affiliateUrl: null` en los 12 sets                  | `site-data.js`   | CTA «Enlace de afiliado pendiente» |
| Precio del 21066       | `price: null`                                        | `site-data.js`   | «Precio pendiente», sin `offers` en el JSON-LD |
| Piezas del 11383       | `pieces: null`                                       | `site-data.js`   | «Piezas por confirmar»; se ordena al final |
| Precios de los otros 11| `priceStatus: 'referencia'`, sin confirmar en España | `site-data.js`   | «precio de referencia» en cada ficha |
| Fechas de los 4 previos | `availability: 'PreOrder'`                          | `site-data.js`   | «Reserva anticipada»          |
| Fotos de los 12 sets   | `assets/img/sets/` vacío                            | sistema de archivos | Sustituto con nombre y categoría |
| Fotos de la comunidad  | `assets/img/polaroid-0{1..4}.jpg` ausentes       | sistema de archivos | Marco con proporción 1:1 y sustituto |
| Tiendas de `#tiendas`  | Direcciones y horarios de ejemplo                 | `index.html`       | `Calle de la Ejemplo NN` y etiqueta «dato de ejemplo» en cada nombre |
| Texto de `#tiendas`    | Plano dibujado con CSS, sin imagen real           | `index.html`       | `aria-hidden`; la información está en la lista |
| Textos legales         | Plantillas para el marco español                    | las 4 páginas   | Declaran ser plantilla        |

### 6.1 · `#tiendas`: por qué los datos son tan obviamente falsos

Las tres tiendas de la portada llevan direcciones de ejemplo (`Calle de la
Ejemplo 01`…), el mismo patrón que los datos legales de `site-data.js`. La
primera versión del bloque usaba calles de verdad —`Calle Alcalá 21`,
`Avinguda Diagonal 512`, `Carrer de Russafa 41`— con horarios concretos, y eso
era lo peor que podía hacer: **una dirección real con horario real se lee como
un dato bueno**. Alguien acabaría yendo a una tienda que existe y no tiene nada
que ver con este catálogo. Ficticio del principio al final.

El texto de la sección dice que los precios son **de referencia** y pueden no
coincidir con los de la tienda, que es lo que afirma `site-data.js` y lo que
coherente con lo que cada ficha declara en su `priceSpecification`. Antes decía
«los comprobamos nosotros, no la tienda», que contradecía la legal y convertía
una advertencia en una promesa.

Cuando se sustituyan por tiendas reales hay que revisar las tres cosas a la vez:
los datos, el `aria-label` del plano y los tres chinchones posicionados a mano
por `style="left:…; top:…%"`, que no significan nada hasta que haya geodatos.

Sobre los precios: los once importes actuales son **precios de referencia** tomados
de la tienda oficial en EUR y sin confirmar para España, y así lo dice cada ficha
en su `priceSpecification`. No se presenta como precio final ni se calcula ningún
descuento: hacerlo sin confirmar el precio real sería publicar una cifra que puede
no ser la que paga la persona.

> **Aviso**: publicar un `aggregateRating` inventado es contrario a las directrices de
> Google para datos estructurados. No hay reseñas en el sitio, así que el JSON-LD
> no lleva `aggregateRating`. Si algún día las hay, que sean reales y verificadas.

El único modo en el que la tabla se queda corta es `SITE_URL`/`SITE_BASE`: se
cambian una vez y `node tools/sync-config.js` propaga el canonical, los `og:url`, los
enlaces del pie y los `content:url` del JSON-LD.

---

## 7 · Imágenes

El visual del hero es una **fotografía** (`hero-pyramid.jpg`); el resto de
ilustraciones son **SVG**. Las fotos de los sets no están todavía y son lo que
falta para que la página se parezca a producción.

### El recorte cuadrado del hero

La foto original es panorámica (1024×575). El marco del hero de portada es 4:3
con `object-fit: contain`, así que ahí cabe entera; pero los heroes de las
cuatro páginas interiores van en un marco **cuadrado**, y una panorámica metida
en un cuadrado queda con la pirámide diminuta en el centro. Por eso existe
`hero-pyramid-cuadrada.jpg`: un recorte 575×575 hecho desde el propio archivo, no
un `object-fit: cover` en CSS. Con `cover` el recorte lo decidía el navegador y
dependía de la caja.

Los dos archivos se guardan en JPEG calidad 86 en lugar de PNG: el original
pesaba 1,3 MB y los dos JPEG suman unos 190 KB.

| Archivo                        | Uso                                    | ViewBox   | Estado      |
| ------------------------------ | -------------------------------------- | --------- | ----------- |
| `hero-pyramid.jpg`             | Visual principal del hero (portada)     | 1024×575  | En uso      |
| `hero-pyramid-cuadrada.jpg`    | El mismo visual, recortado a cuadrado   | 575×575   | En uso      |
| `hero-tower.svg`               | Torre anterior, ya sin referencias      | 1200×1000 | **Sin uso** |
| `led-module.svg`               | Diagrama del módulo LED, en `#iluminacion` | 220×90  | En uso      |
| `og-cover.svg`                 | Fuente de `og-cover.png`               | 1200×630  | En uso      |
| `og-cover.png`                 | Imagen social (1200×630)               | —         | Pendiente de revisar |
| `sets/<id>.jpg` (×12)          | Foto de cada ficha (640×480)           | —         | **Ausentes** |
| `polaroid-01..04.jpg` (×4)     | Foto de la comunidad en `#comunidad`    | 480×480   | **Ausentes** |

Los dos archivos marcados «pendiente de revisar» son los que representan un
producto y una marca que pueden no ser los definitivos: hay que confirmarlos
antes de publicar.

### Las fotos ausentes

Hay 22: las 12 del catálogo más 4 polaroids, y en total 18 fichas a lo largo de
las tres páginas. El HTML las referencia igual, con dos mecanismos para que la
página no se rompa mientras tanto:

- `data-img-has-source="false"` en cada `<img>`: el contenedor va directo al estado
  de sustitución, sin esperar una carga que va a fallar.
- Un `<noscript>` por foto con el enlace al archivo original.

El sustituto no es un icono genérico: lleva el nombre del set, su referencia y la
categoría, para que la ficha siga leyéndose como una ficha. En los polaroids,
donde no hay referencia que enseñar, el marco conserva su `aspect-ratio` de 1:1
para que la rejilla no se cave al fallar los cuatro archivos.

`tools/check.js` las lista como aviso y `tools/subpath-check.js` acepta su 404
**solo** si la página que las referencia declara la sustitución. Las dos
herramientas reconocen lo pendiente por la marca `data-img-has-source="false"`, no
por la carpeta: así una carpeta nueva de fotos pendientes no obliga a ampliar dos
regex, cosa que además convertía un 404 esperado en un fallo de build. Al copiar
las fotos, ambas herramientas dejan de avisar sin tocar nada.

### Imagen social (Open Graph)

`assets/img/og-cover.png` (1200×630) está generada a partir de `og-cover.svg`.
Para regenerarla o cambiar sus dimensiones:

```bash
# Con el propio navegador, sin dependencias
node tools/rasterize.js assets/img/og-cover.svg assets/img/og-cover.png 1200 630

# O con Inkscape
inkscape assets/img/og-cover.svg -w 1200 -h 630 -o og-cover.png
```

Falta subir el PNG al dominio real y ajustar `META_BRAND.og.image` en
`assets/js/site-data.js` (las etiquetas `og:image`, `twitter:image`, `og:url` y el
JSON-LD se regeneran solas con `node tools/sync-config.js`).

---

## 8 · SEO y datos estructurados

Todo lo de `<head>` se genera desde `META_BRAND` y `CANONICAL_URL` en
`assets/js/site-data.js`; los valores literales viven solo en ese fichero.

- `title` y `description` ajustados a los límites de snippet; `tools/e2e.js`
  falla si el `title` pasa de 70 caracteres o la description de 160.
- `canonical`, Open Graph completo y Twitter Card `summary_large_image`, con
  `og:image` absoluta y `twitter:image:alt`.
- `robots`, `theme-color` y `preconnect` a Google Fonts.
- Las cuatro páginas legales van en `noindex, follow` con canonical propio.

El `@graph` de la portada tiene 17 nodos: `Organization`, `WebSite`,
`BreadcrumbList`, `ItemList` con los 12, `Product` ×12 y `FAQPage`.

En cada `Product`:

- `offers` **solo si hay precio**: los 11 con importe lo llevan y el 21066 no, porque
  un `Offer` sin `price` es inválido para Google y un precio estimado sería mentira.
- `priceSpecification` con `UnitPriceSpecification`. Si algún día hay precio
  anterior, se añade una segunda entrada con `priceType: ListPrice`: schema.org no
  define `compareAtPrice` en `Offer`, esa es la forma válida de expresarlo.
- `url` de la oferta apunta a la ficha (`…/#set-21065`) mientras no exista el
  enlace de afiliado; en cuanto se rellene `affiliateUrl`, pasa a ser el destino
  real de la compra.
- `image` **solo si el archivo existe**. Las 12 fotos no están, así que el JSON-LD
  no declara ninguna imagen inexistente; aparece cuando se copien.
- **Sin** `aggregateRating`, `AggregateOffer`, `shippingDetails`,
  `hasMerchantReturnPolicy` ni `variants`. El sitio no vende: no hay stock, ni
  envío, ni devoluciones, y declararlo sería afirmar un servicio que no existe.
  `tools/e2e.js` falla si alguno de esos nodos reaparece.

- El `FAQPage` se **extrae del DOM** en tiempo de compilación, así que no puede
  contradecir lo que el visitante lee. Si añades una pregunta al acordeón, aparece
  sola en el JSON-LD.
- Tras cambiar cualquier dato, `node tools/check.js` falla si el HTML y la
  configuración no coinciden.

---

## 9 · Accesibilidad

Objetivo: **WCAG 2.2 nivel AA**.

- Skip link, landmarks y jerarquía de encabezados sin saltos.
- Foco visible en todo elemento interactivo; `outline` nunca se elimina.
- Los filtros son `button` con `aria-pressed`, y cada uno lleva la cuenta de lo que
  habría con ese filtro en un `.chip__count` legible. El buscador y el desplegable de
  orden tienen `label` explícito; el buscador se describe con el contador
  (`aria-describedby="catalog-count"`), que es un `role="status"`.
- La rejilla se marca con `data-empty="true"` cuando una búsqueda no devuelve nada,
  y el mensaje se pinta con un `::after` de CSS, sin depender del script.
- Acordeón con `aria-expanded`/`aria-controls`, un panel abierto a la vez y foco
  movido al destino de cada ancla.
- `prefers-reduced-motion` desactiva scroll suave, contadores, paralaje y animaciones.
- El menú móvil abre y cierra con el botón y con `Escape`, devuelve el foco al
  botón al cerrarse, y se cierra solo al pulsar fuera o al desplazar la página
  (la cabecera es fija y el panel quedaría flotando sobre el contenido).
- `prefers-contrast: more` refuerza bordes y textos.
- `forced-colors: active` fuerza `Canvas`/`CanvasText` y iconos de sistema.
- El SVG decorativo va con `aria-hidden="true"`; los informativos con `<title>` y `<desc>`.
- Los 12 fallos de imagen se anuncian en **un único** `role="status"`, no en doce.
- Sin JavaScript, todo el contenido sigue visible: la marca `no-js` pasa a `js` en
  la `<head>` y solo entonces se ocultan skeletons y bloques `.reveal`. La prueba
  e2e desactiva el script y lo comprueba.

Comprobado en Edge con teclado. La revisión con lector de pantalla y en otros
navegadores queda pendiente: no se ha verificado en Firefox ni con NVDA/JAWS.

---

## 10 · Verificación

Las utilidades de `tools/` no necesitan instalar nada: solo Node 22+ y un
Edge o Chrome instalado.

```bash
# 1. Servidor local (Ctrl+C para parar)
node tools/serve.js 8137

# 2. En otra terminal
node tools/sync-config.js   # regenera el HTML y el JSON-LD desde site-data.js
node tools/check.js         # HTML, ARIA, SEO, JSON-LD, config y assets
node tools/css-lint.js      # Sintaxis CSS, variables, contraste y targets táctiles
node --check assets/js/main.js

# 3. La navegación tal como se verá publicada en /mi-repo
node tools/subpath-check.js

# 4. Interacciones reales en Edge/Chrome (con el servidor ya arrancado)
node tools/e2e.js http://localhost:8137/
```

`tools/check.js` incluye un bloque que ejecuta `sync-config.js --check`, así que un
HTML desincronizado con la configuración es un **error**, no un aviso.

`tools/e2e.js` conduce el navegador por CDP y ejecuta **238 comprobaciones**:
estructura de las 12 fichas, los cinco filtros con sus contadores, el buscador
(acentos, mayúsculas, sin resultados y `Escape`), las cuatro ordenaciones con sus
empates y sus casos sin dato, los enlaces de categoría, el acordeón, las anclas, el
menú móvil, `prefers-reduced-motion`, el preloader de ladrillos (que existe, que
sin JavaScript no tapa nada y que siempre se retira), la marquesina (que sus dos
copias sean idénticas y que solo la segunda esté oculta al lector), los polaroids
y la sección de tiendas, la sustitución de las 18 fotos ausentes, la página
**sin JavaScript**, metadatos y JSON-LD contra `SITE_DATA`, rutas relativas
del pie y de las páginas legales, y las páginas legales completas.

> **El e2e necesita el servidor arrancado.** `node tools/e2e.js` sin argumento
> carga una página de error y las comprobaciones deben en cascada con
> `Cannot read properties of undefined`. El error real es `ERR_CONNECTION_REFUSED`
> en la salida, no un problema del HTML. Arranca `node tools/serve.js 8137`
> primero, en otra terminal.

Detalles que hacen falta para no mentir al leer las aserciones:

- El buscador **se combina con el filtro activo**, así que las pruebas lo devuelven
  a «todos» antes de medir. Quien busca lo hace sobre el catálogo completo, no
  sobre lo que dejó pulsado el filtro anterior.
- `#faq` y `#transparencia` llevan `content-visibility: auto`: fuera de la ventana
  el navegador no calcula su layout y la altura del desplegable mediría 0. Las
  pruebas llevan la sección a la vista antes de medir.
- El salto a un ancla es un scroll suave que no ha terminado a los 150 ms, así que
  las pruebas esperan lo suficiente antes de mirar la posición.
- Las esperas se hacen desde Node y no con `setTimeout` dentro de la página: en
  headless los temporizadores de la página vienen estrangulados y devuelven el
  resultado antes de tiempo. El script elige un puerto de depuración según su PID
  y mata el árbol de procesos del navegador al terminar, para no dejar instancias
  colgadas de ejecuciones anteriores.
- Los 404 de `assets/img/*.jpg` están permitidos, pero no en silencio: la
  prueba exige que la página que los referencia declare su sustitución
  (`data-img-has-source="false"` y un `<noscript>` por foto). Un 404 nuevo en
  cualquier otra ruta sigue siendo un fallo.
- Los bloques que dependan del scroll llevan cada elemento a la vista con
  `scrollIntoView` antes de esperar su estado. Las fotos van con
  `loading="lazy"`: sin traerlas a la pantalla el navegador no las pide, no hay
  error que dispensar y el marco se queda en `loading` para siempre.
- Una sección nueva tiene que **devolver la página a donde la encontró** la
  anterior. La sección 11 cuenta 18 fichas del catálogo; si la sección anterior
  dejó el navegador en la portada contaría cuatro y sus siete aserciones
  fallarían sin que hubiera nada roto.
- Dentro de los literales de plantilla que se envían al navegador **no puede
  haber comillas invertidas**: cierran el literal y el error sale en la línea
  siguiente, lejos de su causa.

`tools/subpath-check.js` copia el proyecto a una carpeta temporal y lo publica bajo
`/repo`, que es como se rompe de verdad un sitio de GitHub Pages. Acepta las fotos
pendientes **solo** si la página que las referencia declara su sustitución, y las
lista al final en vez de esconderlas.

### 10.1 · Qué espera la prueba y por qué

Las comprobaciones de interfaz dependen del estado real de la página, no de que pase
un tiempo concreto. Un `setTimeout` fijo es una carrera: en un equipo con el
navegador abierto, en un runner de CI o en una máquina saturada, la animación todavía
no ha terminado y la aserción falla señalando al sitio cuando el problema es la
espera. Por eso se sondea la condición:

- El acordeón se mide por fotogramas hasta que la altura se queda quieta, y cada
  tarjeta se trae a la vista antes de esperar a que su imagen llegue a estado
  terminal. Con un barrido a paso fijo, las tres últimas tarjetas no llegaban a
  pedir su foto —van con `loading="lazy"`— y se reportaba que solo nueve de las doce
  habían recibido el sustituto.
- Después de un `Page.reload` se espera a `readyState === 'complete'` y a que
  `SITE_DATA` exista. Si no, la comprobación sin JavaScript se cancelaba a los 15 s y
  arrastraba a cuatro de SEO, que comparaban contra una configuración vacía.
- `COMMAND_TIMEOUT` son 60 s y se puede subir con `CDP_TIMEOUT`.

### 10.2 · Despliegue en GitHub Pages

`.github/workflows/deploy.yml` tiene dos trabajos. **Verificar** corre en cada push
y en cada pull request, contra `main` y `master`, y ejecuta toda la sección 10 con
Google Chrome del propio runner. No publica nada en un PR. **Publicar** solo
arranca en `main`, `master` o a mano, y exige que Verificar haya pasado.

> ⚠️ **Paso requerido en GitHub Web:** Ve a `Settings` → `Pages` → `Build and deployment` → `Source` y selecciona **"GitHub Actions"**. Sin este cambio, la Action se ejecutará correctamente pero no publicará el sitio.

Es el único ajuste manual de todo el despliegue. Si `Source` no es
`GitHub Actions`, el workflow se ejecuta entero, todas las comprobaciones pasan
en verde y aun así no se publica nada: no hay ningún error que lo delate, y el
log del workflow termina sin una sola línea roja. Por eso el último paso
imprime un aviso aunque el despliegue haya ido bien.

No hace falta nada más. El nombre del repositorio no se configura en el
código: `GITHUB_REPOSITORY` la inyecta GitHub y de ahí se derivan el origen y la
subruta. Si algún día hay dominio propio, se define `SITE_URL` en el entorno del
runner y se deja `SITE_BASE=/` si se sirve en la raíz (sección 6).

Detalles que importan:

- **El HTML se regenera en los dos trabajos**, antes de verificar y antes de
  subir. No se reutiliza el resultado del trabajo anterior porque cada uno parte
  de un checkout limpio; sin ese paso, el artefacto llevaría el HTML sin
  canonical, que es justo lo que se quiere evitar.
- `node tools/check-env.js` es la puerta previa: falla si la URL no se ha podido
  determinar o si el HTML contiene un dominio de ejemplo. Corta aquí un error
  caro, porque un canonical equivocado lo indexa el buscador y el dominio
  incorrecto se hereda a todo el sitio.
- Se publica **el árbol entero**, sin stage ni copia, para que lo verificado sea
  exactamente lo publicado.
- `.nojekyll` está en el repositorio: sin él, Pages pasa los ficheros por Jekyll, que
  ignora los directorios que empiezan por guion bajo.
- Todas las rutas son relativas, nunca `/algo`, porque el sitio vive bajo
  `/lego-icons/` y no en la raíz del dominio. `SITE_BASE` solo alimenta las URLs
  absolutas (canonical, Open Graph, JSON-LD); la navegación va por `path()`, que
  devuelve rutas relativas, y por eso no cambia nada al mover el sitio.
- `tools/subpath-check.js` sirve el proyecto de verdad bajo `/repo` y recorre los
  enlaces, así que un `href="/..."` escrito a mano se detecta en la suite y no
  en producción.
- El runner de `ubuntu-latest` ya trae Chrome en `/usr/bin/google-chrome`, y
  `tools/browser.js` lo encuentra sin `CHROME_PATH`. Ese módulo existe porque las tres
  herramientas que conducen el navegador (`e2e`, `render`, `rasterize`) tenían cada
  una su propia copia de la lista de rutas, y las tres eran solo de Windows.
- El job de publicar lleva `contents: read`, `pages: write` e `id-token: write`.
  Los dos últimos son los que Pages necesita para crear la publicación y para
  validarla por OIDC; si falta alguno, el deploy falla con un error de permisos
  poco descriptivo. El job de verificar **no** lleva `pages: write` a propósito:
  si lo llevara, un pull request podría publicar.
- `concurrency: {group: pages, cancel-in-progress: true}` hace que un push nuevo
  cancele un despliegue obsoleto en curso, de modo que nunca se publique una
  versión antigua por encima de otra más nueva. Pages solo admite una
  publicación a la vez, así que el grupo es único para el repositorio.
- `environment: github-pages` con `url: ${{ steps.deployment.outputs.page_url }}` es
  lo que muestra el enlace al sitio ya publicado en la propia ejecución. El `id`
  del paso de despliegue tiene que ser exactamente `deployment` para que esa
  expresión resuelva; si se renombra uno y no el otro, la `url` queda vacía sin
  ningún error visible.
- Las acciones van con etiqueta de versión mayor (`actions/checkout@v7`), no con
  SHA fijado. Para un despliegue con permiso de escritura, fijar el SHA es lo
  recomendable, porque una etiqueta mayor puede mover el código bajo los pies.


---

## 11 · Licencia, marcas y textos legales

Este es un **proyecto de demostración con fines de diseño**. No está afiliado,
patrocinado ni autorizado por el Grupo LEGO, que no interviene en su desarrollo
ni en su publicación.

LEGO, el logotipo LEGO, el brick y las marcas relacionadas son propiedad del Grupo LEGO.
Para una publicación real hay que sustituir toda la marca por una original y revisar
las condiciones de uso de las tipografías y de las imágenes de terceros.

Las cuatro páginas legales son **plantillas redactadas para el marco español**
(RGPD, LOPDGDD, LSSI y Ley de Consumo) y así lo declaran ellas mismas en un aviso
visible. Antes de publicarlas hay que hacerlas pasar por un profesional del
derecho: los datos de empresa son inventados, y la sección de transferencias
internacionales presume un modelo de destino de los datos que debe ajustarse a
los encargados reales del tratamiento.
