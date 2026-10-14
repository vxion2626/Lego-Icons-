/* ======================================================================
   legal-page.js · Comportamiento de las páginas legales
   ======================================================================
   Deliberadamente mínimo y sin dependencias: main.js asume la estructura de
   la home y no debe cargarse aquí. Su único trabajo es mantener el año del
   copyright al día sin depender de que el sincronizador se haya ejecutado.
   ====================================================================== */
(function () {
  'use strict';

  var D = window.SITE_DATA;
  if (!D) return;

  /* El año se pinta siempre en el HTML por el sincronizador, así que esta
     línea solo actúa si la página se cachea más de un año. */
  var nodes = document.querySelectorAll('[data-copyright]');
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].textContent = D.copyright(new Date().getFullYear());
  }
})();
