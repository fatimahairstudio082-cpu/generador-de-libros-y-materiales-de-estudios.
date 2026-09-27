/* edu_pegado.js — pegado libre de contenido (por ejemplo, lo que se investiga en internet).
   Fase 2 · asistente. Requiere edu_base, edu_esquemas, edu_almacen y edu_importador.

   A diferencia del importador de apuntes, aquí no hace falta escribir con
   convenciones: se pega el texto tal como viene de una página web o de un
   documento y se organiza así, sin cambiar ni una palabra:
     · «# Título» o una línea corta sin punto final seguida de un párrafo → apartado
     · cada párrafo o viñeta                                              → dato con su texto íntegro
     · «Término: definición» (término corto)                              → concepto con su definición
   El título de un dato es su primera frase (recortada si es muy larga): es
   solo una etiqueta; el texto completo se guarda literal.

   Todo lo pegado queda con origen «usuaria» y una fuente propia con la
   dirección web. La licencia se marca como desconocida (aviso) salvo que se
   indique: hay que comprobarla antes de publicar.

   Todo o nada: con un solo error no se guarda nada.

     EDU.pegado.analizar(texto, opciones) → Promise<{ ucs, relaciones, fuente, raices, errores, avisos }>
     EDU.pegado.importar(texto, opciones) → Promise<informe>
   opciones: { proyecto | rama (obligatorio), titulo, url, licencia, nivel } */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base || !EDU.esquemas || !EDU.almacen || !EDU.importador) { if (raiz.console) raiz.console.error('[pegado] Faltan edu_base, edu_esquemas, edu_almacen o edu_importador'); return; }
  if (EDU.pegado) return;

  var E = EDU.esquemas, A = EDU.almacen;
  var TOPE_TITULO = 70;

  function primeraFrase(t) {
    var m = /^(.+?[.!?])(\s|$)/.exec(t);
    var f = (m ? m[1] : t).replace(/[.!?]+$/, '').trim();
    if (f.length <= TOPE_TITULO) return f;
    return f.slice(0, TOPE_TITULO - 1).replace(/\s+\S*$/, '') + '…';
  }

  function esTitular(linea, siguiente) {
    if (/^#{1,6}\s+\S/.test(linea)) return true;
    if (/^[^:]{1,50}:\s+\S/.test(linea)) return false;   // «Término: definición» nunca es un título
    return linea.length <= 80 && !/[.,;:!?…]$/.test(linea) && !!siguiente && siguiente.length > linea.length;
  }

  function analizar(texto, op) {
    op = op || {};
    var errores = [], avisos = [];
    if (!op.proyecto && !op.rama) errores.push({ linea: 0, mensaje: 'Indica el proyecto o la rama a la que pertenece el contenido' });
    var lineas = String(texto || '').replace(/\r\n?/g, '\n').split('\n').map(function (l, i) { return { n: i + 1, t: l.replace(/\s+/g, ' ').trim() }; })
      .filter(function (l) { return l.t; });
    if (!lineas.length) errores.push({ linea: 0, mensaje: 'No hay texto pegado' });
    if (errores.length) return Promise.resolve({ ucs: [], relaciones: [], fuente: null, raices: [], errores: errores, avisos: avisos });

    return (op.nivel ? Promise.resolve([op.nivel]) : op.rama ? EDU.biblioteca.ruta(op.rama).then(function (c) { var n = c.filter(function (r) { return r.nivel; }).pop(); return n ? [n.nivel] : []; }) : Promise.resolve([])).then(function (niveles) {
      var titulo = String(op.titulo || '').trim() || 'Contenido pegado';
      var fuente = E.crear('fuente', {
        id: EDU.idEstable('fue', 'pegado|' + (op.proyecto || op.rama) + '|' + titulo + '|' + (op.url || '')),
        clase: op.url ? 'web' : 'apuntes', titulo: titulo, url: op.url || undefined,
        licencia: op.licencia || 'desconocida', nota: 'Contenido pegado por la usuaria'
      });
      if (!op.licencia) avisos.push({ linea: 0, mensaje: 'Licencia desconocida: compruébala antes de publicar o compartir' });

      var ucs = [], rels = [], vistos = {};
      function nueva(tipo, t, texto, n) {
        var u = E.crear('uc', { tipo: tipo, titulo: t, texto: texto || '', rama: op.rama || null, proyecto: op.proyecto || null, niveles: niveles.slice(), fuente: fuente.id, origen: 'usuaria', idioma: 'es' });
        if (vistos[u.id]) { avisos.push({ linea: n, mensaje: 'Texto repetido: se guarda una sola vez' }); return null; }
        vistos[u.id] = true;
        u.linea = n;
        u.orden = n;   // orden original del texto: el documento se reproduce en este orden
        ucs.push(u);
        return u;
      }
      function colgar(hija, madre) { if (hija && madre) rels.push(E.crear('relacion', { tipo: 'parte_de', de: hija.id, a: madre.id, origen: 'usuaria' })); }

      var raizUC = nueva('concepto', titulo, '', 0);
      var pila = [{ nivel: 0, uc: raizUC }];
      lineas.forEach(function (l, i) {
        var sig = lineas[i + 1] ? lineas[i + 1].t : '';
        var h = /^(#{1,6})\s+(.*)$/.exec(l.t);
        if (h || esTitular(l.t, sig)) {
          var nivel = h ? h[1].length : 1, t = h ? h[2].trim() : l.t;
          while (pila.length > 1 && pila[pila.length - 1].nivel >= nivel) pila.pop();
          var ap = nueva('concepto', t, '', l.n);
          colgar(ap, pila[pila.length - 1].uc);
          if (ap) pila.push({ nivel: nivel, uc: ap });
          return;
        }
        var limpio = l.t.replace(/^([-*•·]|\d{1,3}[.)])\s+/, '');
        var def = /^([^:]{1,50}):\s+(.{3,})$/.exec(limpio);
        var u = def && !/[.!?]/.test(def[1]) ? nueva('concepto', def[1].trim(), def[2].trim(), l.n) : nueva('dato', primeraFrase(limpio), limpio, l.n);
        colgar(u, pila[pila.length - 1].uc);
      });

      ucs.forEach(function (u) {
        E.validar('uc', u).errores.forEach(function (e) { errores.push({ linea: u.linea, mensaje: e.campo + ': ' + e.mensaje }); });
      });
      rels.forEach(function (r) { E.validar('relacion', r).errores.forEach(function (e) { errores.push({ linea: 0, mensaje: 'Relación: ' + e.mensaje }); }); });
      return { ucs: ucs, relaciones: rels, fuente: fuente, raices: [raizUC.id], errores: errores, avisos: avisos };
    });
  }

  function importar(texto, op) {
    return analizar(texto, op).then(function (an) {
      if (an.errores.length) {
        var e = new Error('El contenido pegado tiene ' + an.errores.length + ' error(es); no se ha guardado nada');
        e.errores = an.errores;
        throw e;
      }
      var ucs = an.ucs.map(function (u) { var c = EDU.clonar(u); delete c.linea; return c; });
      return A.guardar('fuente', an.fuente)
        .then(function () { return A.guardarVarios('uc', ucs); })
        .then(function () { return A.guardarVarios('relacion', an.relaciones); })
        .then(function () {
          var inf = { ok: true, fuente: an.fuente.id, raices: an.raices, cuenta: { ucs: ucs.length, relaciones: an.relaciones.length, apartados: ucs.filter(function (u) { return u.tipo === 'concepto'; }).length - 1 }, avisos: an.avisos };
          EDU.emitir('pegado:importado', inf);
          EDU.emitir('biblioteca:cambio', { motivo: 'pegado', fuente: an.fuente.id });
          return inf;
        });
    });
  }

  EDU.pegado = { analizar: analizar, importar: importar, quitar: function (fuenteId) { return EDU.importador.quitarImportacion(fuenteId); } };
  EDU.registrar('pegado', EDU.pegado, { requiere: ['base', 'esquemas', 'almacen', 'importador'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
