/* edu_examen.js — adaptador del examen (motor heredado b6_examen.js de FATIMA PRO).
   Fase 2 · paso 3. Requiere edu_base; usa EU_EXAMEN a través de EDU.puente sin modificarlo.

   Convierte las preguntas ya redactadas y auditadas (bloques «pregunta» de una
   redacción) en el formato del motor: { titulo, centro, modulo, preguntas:[{p,o,c,x}], abierta:{p,clave} }.

   NO INVENTAR TAMBIÉN EN LAS OPCIONES
     · El enunciado y la respuesta correcta son los de la redacción.
     · Las opciones incorrectas salen de los mismos datos: otros títulos, fechas o
       fórmulas del mismo trabajo. Son verdades sobre OTRAS cosas, nunca frases nuevas.
     · En «causa» nunca se ofrece como incorrecta otra causa del mismo efecto.
     · Si no hay al menos 2 opciones incorrectas en los datos, la pregunta se omite
       (y se informa); no se rellena.
     · «Verdadero o falso» solo con afirmaciones verdaderas de los datos (opción correcta: Verdadero).

     EDU.examen.construir(redaccion, { titulo, centro, modulo, semilla, maximo }) → { datos, omitidas }
     EDU.examen.verificar(datos, redaccion) → { ok, problemas }
     EDU.examen.paginas(datos, 'examen'|'correccion', escala) → [canvas]  (navegador) */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base) { if (raiz.console) raiz.console.error('[examen] Falta edu_base'); return; }
  if (EDU.examen) return;

  var MC = { definicion: 'titulo', fecha: 'fecha', formula: 'expresion', causa: 'titulo' };
  var ABIERTAS = { ordenar: true, ordenar_pasos: true, clasificar: true };
  var VF = ['Verdadero', 'Falso'];

  function preguntasDe(red) {
    var l = [];
    red.secciones.concat([red.sintesis]).forEach(function (s) { s.bloques.forEach(function (b) { if (b.tipo === 'pregunta') l.push(b); }); });
    return l;
  }
  function valorRespuesta(b, campo) {
    var h = [].concat(b.respuesta)[0].hechos.filter(function (x) { return x.campo === campo; })[0];
    return h ? { valor: h.valor, uc: h.uc } : null;
  }

  // Todas las respuestas posibles de un tipo que aparecen en el trabajo (candidatas a opción incorrecta).
  function reserva(preguntas, campo) {
    var vistos = {}, r = [];
    preguntas.forEach(function (b) {
      [].concat(b.respuesta).concat(b.opciones && !b.opciones.conceptos ? b.opciones : []).forEach(function (a) {
        a.hechos.forEach(function (h) {
          if (h.campo === campo && !vistos[h.valor]) { vistos[h.valor] = true; r.push({ valor: h.valor, uc: h.uc }); }
        });
      });
    });
    return r;
  }

  // Causas conocidas de cada efecto (para no ofrecer una causa verdadera como falsa).
  function causasPorEfecto(preguntas) {
    var m = {};
    preguntas.forEach(function (b) {
      if (b.modo !== 'causa') return;
      var efecto = b.enunciado.hechos.filter(function (h) { return h.campo === 'titulo'; })[0];
      var causa = valorRespuesta(b, 'titulo');
      if (efecto && causa) (m[efecto.uc] = m[efecto.uc] || {})[causa.uc] = true;
    });
    return m;
  }

  function construir(red, op) {
    op = op || {};
    var azar = EDU.azar(op.semilla === undefined ? 1 : op.semilla).derivar('examen');
    var todas = preguntasDe(red), omitidas = [], preguntas = [], abierta = null;
    var causas = causasPorEfecto(todas);
    var maximo = op.maximo || 20;
    todas.forEach(function (b) {
      if (ABIERTAS[b.modo]) {
        if (!abierta) abierta = { p: b.enunciado.texto, clave: [].concat(b.respuesta).map(function (a) { return a.texto.replace(/\.$/, ''); }), pieza: b.pieza };
        else omitidas.push({ pieza: b.pieza, motivo: 'Solo cabe una pregunta abierta por examen' });
        return;
      }
      if (preguntas.length >= maximo) { omitidas.push({ pieza: b.pieza, motivo: 'Supera el máximo de preguntas' }); return; }
      if (b.modo === 'verdadero') {
        preguntas.push({ p: b.enunciado.texto.replace(/^Verdadero o falso:\s*/, ''), o: VF.slice(), c: 0, x: '', pieza: b.pieza, modo: b.modo });
        return;
      }
      var campo = MC[b.modo];
      if (!campo) { omitidas.push({ pieza: b.pieza, motivo: 'Modo de pregunta sin formato de examen: ' + b.modo }); return; }
      var ok = valorRespuesta(b, campo);
      if (!ok) { omitidas.push({ pieza: b.pieza, motivo: 'Sin respuesta en los datos' }); return; }
      var efecto = b.modo === 'causa' ? b.enunciado.hechos.filter(function (h) { return h.campo === 'titulo'; })[0] : null;
      var malas = reserva(todas, campo).filter(function (r) {
        if (r.valor === ok.valor || r.uc === ok.uc) return false;
        if (efecto && (r.uc === efecto.uc || (causas[efecto.uc] && causas[efecto.uc][r.uc]))) return false;
        return true;
      });
      if (malas.length < 2) { omitidas.push({ pieza: b.pieza, motivo: 'No hay opciones incorrectas suficientes en los datos' }); return; }
      var elegidas = azar.derivar(b.pieza).barajar(malas).slice(0, 3).map(function (r) { return r.valor; });
      var opciones = azar.derivar(b.pieza + '|orden').barajar(elegidas.concat([ok.valor]));
      preguntas.push({ p: b.enunciado.texto, o: opciones, c: opciones.indexOf(ok.valor), x: '', pieza: b.pieza, modo: b.modo });
    });
    var datos = {
      titulo: op.titulo || (red.secciones[0] ? red.secciones[0].titulo : 'Examen'),
      subtitulo: op.subtitulo || '',
      centro: op.centro || ' ', modulo: op.modulo || ' ',   // un espacio: el motor no pone su texto por defecto
      enunciado: op.enunciado || '',
      preguntas: preguntas,
      abierta: abierta
    };
    return { datos: datos, omitidas: omitidas };
  }

  /* Cada opción tiene que ser un valor de los datos (o Verdadero/Falso); cada
     enunciado, el de la redacción auditada; y la opción marcada, la correcta. */
  function verificar(datos, red) {
    var problemas = [], porPieza = {}, valores = {};
    preguntasDe(red).forEach(function (b) {
      porPieza[b.pieza] = b;
      [b.enunciado].concat([].concat(b.respuesta), b.opciones && !b.opciones.conceptos ? b.opciones : []).forEach(function (a) { a.hechos.forEach(function (h) { valores[h.valor] = true; }); });
    });
    datos.preguntas.forEach(function (q, i) {
      var b = porPieza[q.pieza];
      if (!b) { problemas.push({ pregunta: i + 1, problema: 'No sale de ninguna pregunta de la redacción' }); return; }
      var enunciado = q.modo === 'verdadero' ? b.enunciado.texto.replace(/^Verdadero o falso:\s*/, '') : b.enunciado.texto;
      if (q.p !== enunciado) problemas.push({ pregunta: i + 1, problema: 'Enunciado cambiado' });
      q.o.forEach(function (o) { if (!valores[o] && VF.indexOf(o) < 0) problemas.push({ pregunta: i + 1, problema: 'Opción que no está en los datos: «' + o + '»' }); });
      if (q.modo !== 'verdadero') {
        var campo = MC[q.modo], ok = valorRespuesta(b, campo);
        if (!ok || q.o[q.c] !== ok.valor) problemas.push({ pregunta: i + 1, problema: 'La opción marcada como correcta no es la respuesta de los datos' });
      } else if (q.c !== 0) problemas.push({ pregunta: i + 1, problema: 'Verdadero o falso mal marcado' });
    });
    if (datos.abierta) {
      var ba = porPieza[datos.abierta.pieza];
      if (!ba || ba.enunciado.texto !== datos.abierta.p) problemas.push({ pregunta: 'abierta', problema: 'Enunciado de la abierta cambiado' });
    }
    return { ok: problemas.length === 0, problemas: problemas };
  }

  // El motor dice cuántas hojas hay (paginas) y dibuja cada una (hoja). Aquí se devuelve un lienzo por hoja.
  function paginas(datos, cara, escala) {
    var M = EDU.puente.obtener('examen');
    if (!M) throw new Error('No está cargado el motor de examen de FATIMA PRO (heredados/b6_examen.js)');
    var e = escala || 2, n = M.paginas(datos, cara || 'examen'), lienzos = [];
    for (var i = 0; i < n; i++) {
      var cv = document.createElement('canvas');
      cv.width = M.A4.w * e; cv.height = M.A4.h * e;
      var ctx = cv.getContext('2d');
      ctx.scale(e, e);
      M.hoja(ctx, datos, cara || 'examen', i);
      lienzos.push(cv);
    }
    return lienzos;
  }

  EDU.examen = { construir: construir, verificar: verificar, paginas: paginas };
  EDU.registrar('examen', EDU.examen, { requiere: ['base'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
