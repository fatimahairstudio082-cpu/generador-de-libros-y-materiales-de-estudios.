/* edu_visual.js — Motor Visual Universal (adaptador).
   Fase 2 · paso 2. Requiere edu_base y edu_esquemas; usa los motores
   heredados de FATIMA PRO sin modificarlos (heredados/b6_laminas_motor.js,
   b6_laminas_disenos.js y, para los acabados de color, b6_folleto_motor.js).

   Reparto de papeles:
     · LOS MOTORES DE FATIMA PRO ponen el estilo: estructura, paleta, formato,
       formas de nodo y animación de cada uno de sus 300 diseños.
     · EL SISTEMA pone el contenido: los nodos salen SOLO de los datos de la
       pieza de visualización (títulos, textos, fechas copiados tal cual). El
       contenido de muestra de cada diseño nunca se usa.
     · verificar() comprueba que cada texto de la lámina está en los datos.

   Elección de diseño: familias compatibles con la forma de dato y, dentro de
   ellas, las categorías del catálogo que comparten palabras con la materia y
   el nivel (sin nombres de materias escritos en el código). El desempate usa
   la semilla, y siempre se puede elegir otro diseño a mano.

     EDU.visual.disponible()                         → true si los motores están cargados
     EDU.visual.familias(forma)                      → familias válidas para esa forma de dato
     EDU.visual.disenos(forma, { materia, nivel, familia }) → diseños ordenados por afinidad
     EDU.visual.lamina(pieza, { diseno, titulo, semilla, materia, nivel, familia }) → lámina lista para pintar
     EDU.visual.verificar(lamina, pieza)             → { ok, problemas }
     EDU.visual.pintar(canvas, lamina, { prog, escala }) → dibuja (prog 0-1 = fotograma de la animación)
     EDU.visual.duracion(lamina)                     → segundos recomendados de animación */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base || !EDU.esquemas) { if (raiz.console) raiz.console.error('[visual] Faltan edu_base o edu_esquemas'); return; }
  if (EDU.visual) return;

  var TOPE_DETALLE = 90;   // un texto más largo no cabe en un nodo: se omite (nunca se recorta)

  // Familias adicionales que tienen sentido para cada forma, además de las del catálogo de esquemas.
  var EXTRA = { jerarquia: ['mandala', 'poster'], secuencia: ['carrusel'], lista: ['poster', 'mandala'], comparacion: ['ficha'] };

  function motor() { return EDU.puente.obtener('laminas'); }
  function catalogo() { return EDU.puente.obtener('laminas_disenos'); }
  function disponible() { return !!(motor() && catalogo()); }

  function exigir() {
    if (!disponible()) throw new Error('No están cargados los motores de láminas de FATIMA PRO (heredados/b6_laminas_motor.js y b6_laminas_disenos.js)');
  }

  function familias(forma) {
    var fd = EDU.esquemas.catalogo('formasDato')[forma];
    if (!fd) return [];
    var r = fd.familias.slice();
    (EXTRA[forma] || []).forEach(function (f) { if (r.indexOf(f) < 0) r.push(f); });
    return r;
  }

  /* ───────────────────────── Elección de diseño ───────────────────────── */

  var VACIAS = { y: 1, e: 1, de: 1, del: 1, la: 1, las: 1, el: 1, los: 1, en: 1, a: 1 };
  // Sin afinidad con la materia se prefieren las categorías neutras del catálogo, nunca las de otra especialidad.
  var NEUTRAS = { 'Plantilla en blanco': 2, 'Estudio y método': 1 };
  function palabras(t) {
    return EDU.normalizar(t).split(/[^a-zñ0-9]+/).filter(function (w) { return w.length > 2 && !VACIAS[w]; });
  }
  function afinidad(cat, textos) {
    var pc = palabras(cat), p = 0;
    textos.forEach(function (t, peso) {
      palabras(t).forEach(function (w) {
        if (pc.some(function (c) { return c === w || (c.length > 4 && w.length > 4 && (c.indexOf(w.slice(0, 5)) === 0 || w.indexOf(c.slice(0, 5)) === 0)); })) p += peso === 0 ? 2 : 1;
      });
    });
    return p;
  }

  function disenos(forma, op) {
    exigir();
    op = op || {};
    var fams = op.familia ? [op.familia] : familias(forma);
    var nivelNombre = op.nivel ? ((EDU.esquemas.catalogo('niveles')[op.nivel] || {}).nombre || op.nivel) : '';
    return catalogo().lista().filter(function (d) { return fams.indexOf(d.fam) >= 0; })
      .map(function (d) { return { id: d.id, nombre: d.nombre, familia: d.fam, categoria: d.cat, estructura: d.est, paleta: d.pal, formato: d.fmt, afinidad: afinidad(d.cat, [op.materia || '', nivelNombre]) }; })
      .sort(function (a, b) { return (b.afinidad - a.afinidad) || ((NEUTRAS[b.categoria] || 0) - (NEUTRAS[a.categoria] || 0)) || (fams.indexOf(a.familia) - fams.indexOf(b.familia)); });
  }

  /* ───────────────────────── Nodos desde los datos ───────────────────────── */

  function detalle(t) { t = String(t || ''); return t.length && t.length <= TOPE_DETALLE ? t : ''; }
  function nodo(nivel, t, d, uc) { var n = { nivel: nivel, t: t, d: d || '' }; if (uc) n.uc = uc; return n; }

  // Devuelve { nodos, titulo, subtitulo } usando solo lo que trae la pieza (y el título de contexto).
  function nodosDe(p, contexto) {
    var d = p.datos || {}, nodos = [];
    switch (d.forma) {
      case 'jerarquia': {
        var raizN = d.nodos.filter(function (x) { return !x.padre; })[0] || d.nodos[0];
        nodos.push(nodo(0, raizN.titulo, '', raizN.uc));
        function hijos(id, nivel) {
          d.nodos.filter(function (x) { return x.padre === id; }).forEach(function (x) {
            nodos.push(nodo(Math.min(2, nivel), x.titulo, '', x.uc));
            hijos(x.uc, nivel + 1);
          });
        }
        hijos(raizN.uc, 1);
        return { nodos: nodos, titulo: raizN.titulo };
      }
      case 'secuencia': {
        var cab = d.titulo || contexto || '';
        nodos.push(nodo(0, cab, '', d.uc || null));
        (d.pasos || []).forEach(function (x) {
          if (typeof x === 'string') nodos.push(nodo(1, x, '', d.uc));
          else nodos.push(nodo(1, x.titulo, x.fecha || '', x.uc));
        });
        return { nodos: nodos, titulo: cab };
      }
      case 'comparacion': {
        var a = d.lados[0], b = d.lados[1];
        var cab2 = a.titulo + ' · ' + b.titulo;
        nodos.push(nodo(0, cab2, ''));
        [a, b].forEach(function (x) { nodos.push(nodo(1, x.titulo, detalle(x.texto), x.uc)); });
        return { nodos: nodos, titulo: cab2 };
      }
      case 'lista': {
        nodos.push(nodo(0, d.de.titulo, '', d.de.uc));
        d.items.forEach(function (x) { nodos.push(nodo(1, x.titulo, detalle(x.texto), x.uc)); });
        return { nodos: nodos, titulo: d.de.titulo };
      }
    }
    throw new Error('Forma de dato sin adaptador visual: ' + d.forma);
  }

  /* Lámina = estilo del diseño de FATIMA PRO + contenido de los datos. */
  function lamina(p, op) {
    exigir();
    op = op || {};
    if (!p || p.clase !== 'visualizacion') throw new Error('La pieza no es una visualización');
    var lista = disenos(p.datos.forma, { materia: op.materia, nivel: op.nivel, familia: op.familia });
    if (!lista.length) throw new Error('No hay diseños para la forma «' + p.datos.forma + '»');
    var id = op.diseno;
    if (!id || !lista.some(function (x) { return x.id === id; })) {
      var mejor = lista.filter(function (x) { return x.afinidad === lista[0].afinidad; });
      id = EDU.azar(op.semilla === undefined ? 1 : op.semilla).derivar('visual|' + p.id).uno(mejor).id;
    }
    var base = catalogo().lamina(id);
    var c = nodosDe(p, op.titulo);
    base.nodos = c.nodos;
    base.titulo = base.opciones && base.opciones.sinCab ? '' : c.titulo;
    base.subtitulo = '';
    base.rotulo = '';
    base.pie = '';
    base.pieza = p.id;
    base.contexto = op.titulo || '';
    return base;
  }

  // Todo texto visible de la lámina tiene que estar, tal cual, en los datos de la pieza.
  function verificar(lam, p) {
    var permitidos = {}, problemas = [];
    (function recoger(v) {
      if (typeof v === 'string') { permitidos[v] = true; return; }
      if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { recoger(v[k]); });
    })(p.datos);
    if (lam.contexto) permitidos[lam.contexto] = true;
    if (p.datos.forma === 'comparacion') permitidos[p.datos.lados[0].titulo + ' · ' + p.datos.lados[1].titulo] = true;
    function mirar(t, donde) { if (t && !permitidos[t]) problemas.push({ donde: donde, texto: t, problema: 'Texto que no está en los datos de la pieza' }); }
    mirar(lam.titulo, 'título'); mirar(lam.subtitulo, 'subtítulo'); mirar(lam.rotulo, 'rótulo'); mirar(lam.pie, 'pie');
    (lam.nodos || []).forEach(function (n, i) { mirar(n.t, 'nodo ' + i); mirar(n.d, 'detalle ' + i); });
    return { ok: problemas.length === 0, problemas: problemas };
  }

  /* ───────────────────────── Dibujo ───────────────────────── */

  function tamano(lam, escala) {
    var F = motor().FORMATOS[lam.formato] || motor().FORMATOS.a4h;
    var e = escala || 0.5;
    return { w: Math.round(F.w * e), h: Math.round(F.h * e) };
  }

  function pintar(canvas, lam, op) {
    exigir();
    op = op || {};
    var t = tamano(lam, op.escala);
    if (canvas.width !== t.w) canvas.width = t.w;
    if (canvas.height !== t.h) canvas.height = t.h;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, t.w, t.h);
    return motor().pintar(ctx, t.w, t.h, lam, { prog: op.prog == null ? 1 : op.prog });
  }

  function duracion(lam) {
    var n = (lam.nodos || []).length;
    return Math.max(4, Math.round(n * (lam.segPorNodo || 1.6)));
  }

  EDU.visual = {
    disponible: disponible,
    familias: familias,
    disenos: disenos,
    lamina: lamina,
    verificar: verificar,
    pintar: pintar,
    tamano: function (lam, e) { exigir(); return tamano(lam, e); },
    duracion: duracion
  };

  EDU.registrar('visual', EDU.visual, { requiere: ['base', 'esquemas'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
