/* edu_variacion.js — versiones distintas con los mismos hechos.
   Módulo 11 de la fase 1. Requiere edu_base, edu_esquemas, edu_almacen y edu_redactor.

   La variación solo cambia la FORMA (plantillas, conectores, orden de las
   opciones de las preguntas). Los HECHOS no cambian nunca:
     · cada versión se audita con EDU.redactor.auditar;
     · su huella de hechos tiene que ser idéntica a la de la versión base;
     · una versión que falle cualquiera de las dos cosas se rechaza.

     EDU.variacion.versiones(sec, estructuras, { n, desde, redactor })  → { base, versiones, rechazadas }
     EDU.variacion.otraVersion(sec, estructuras, semillaActual, opciones) → { semilla, redaccion, comparacion }
     EDU.variacion.comparar(redA, redB)          → { mismosHechos, total, cambiadas, porcentaje, diferencias }
     EDU.variacion.huella(redaccion)             → texto (hash de los hechos)
     EDU.variacion.guardarVersion(proyectoId, redaccion) → Promise<derivado>
     EDU.variacion.comprobarVersion(derivado, sec, estructuras) → { ok, motivo } */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base || !EDU.esquemas || !EDU.almacen || !EDU.redactor) { if (raiz.console) raiz.console.error('[variacion] Faltan edu_base, edu_esquemas, edu_almacen o edu_redactor'); return; }
  if (EDU.variacion) return;

  var R = EDU.redactor, E = EDU.esquemas, A = EDU.almacen;
  var INTENTOS = 25;

  function huella(red) { return EDU.hash(R.hechos(red).join('\n')) + '·' + R.hechos(red).length; }

  // Recorre dos redacciones de la misma secuencia emparejando cada frase con la de la misma posición.
  function frasesDe(red) {
    var lista = [];
    function bloque(ruta, b) {
      (b.frases || []).forEach(function (a, i) { lista.push({ ruta: ruta + '.f' + i, a: a }); });
      if (b.enunciado) lista.push({ ruta: ruta + '.e', a: b.enunciado });
      if (b.opciones) {
        var ops = b.opciones.conceptos ? b.opciones.conceptos.concat(b.opciones.definiciones) : b.opciones;
        ops.forEach(function (a, i) { lista.push({ ruta: ruta + '.o' + i, a: a }); });
      }
      if (b.respuesta) [].concat(b.respuesta).forEach(function (a, i) { lista.push({ ruta: ruta + '.r' + i, a: a }); });
    }
    if (red.requisitos) lista.push({ ruta: 'req', a: red.requisitos });
    red.secciones.forEach(function (s, i) {
      s.objetivos.forEach(function (a, j) { lista.push({ ruta: 's' + i + '.obj' + j, a: a }); });
      s.bloques.forEach(function (b, j) { bloque('s' + i + '.b' + j, b); });
    });
    red.sintesis.objetivos.forEach(function (a, j) { lista.push({ ruta: 'sin.obj' + j, a: a }); });
    red.sintesis.bloques.forEach(function (b, j) { bloque('sin.b' + j, b); });
    return lista;
  }

  function comparar(a, b) {
    var fa = frasesDe(a), fb = frasesDe(b), mapa = {}, diferencias = [];
    fb.forEach(function (x) { mapa[x.ruta] = x.a; });
    fa.forEach(function (x) {
      var otra = mapa[x.ruta];
      if (!otra || otra.texto !== x.a.texto) diferencias.push({ ruta: x.ruta, antes: x.a.texto, despues: otra ? otra.texto : null });
    });
    return {
      mismosHechos: huella(a) === huella(b),
      mismaEstructura: fa.length === fb.length,
      total: fa.length,
      cambiadas: diferencias.length,
      porcentaje: fa.length ? Math.round(100 * diferencias.length / fa.length) : 0,
      diferencias: diferencias
    };
  }

  // Una versión es aceptable si pasa la auditoría y conserva exactamente los hechos de la base.
  function evaluar(red, estructuras, huellaBase) {
    var au = R.auditar(red, estructuras);
    if (!au.ok) return { ok: false, motivo: 'No pasa la auditoría: ' + au.problemas[0].problema, auditoria: au };
    if (huellaBase && huella(red) !== huellaBase) return { ok: false, motivo: 'Cambia los hechos', auditoria: au };
    return { ok: true, auditoria: au };
  }

  function semillaNum(s) { return typeof s === 'number' && isFinite(s) ? s : 1; }

  function versiones(sec, estructuras, opciones) {
    opciones = opciones || {};
    var n = Math.max(1, Math.min(opciones.n || 3, 20)), desde = semillaNum(opciones.desde);
    var op = EDU.clonar(opciones.redactor || {});
    op.semilla = desde;
    var base = R.redactar(sec, estructuras, op);
    var eb = evaluar(base, estructuras, null);
    if (!eb.ok) throw new Error('La versión base no es válida: ' + eb.motivo);
    var hb = huella(base), lista = [{ semilla: desde, redaccion: base, auditoria: eb.auditoria, huella: hb }], rechazadas = [];
    var textos = {};
    textos[R.aTexto(base)] = true;
    for (var s = desde + 1; lista.length < n && s < desde + 1 + n * INTENTOS; s++) {
      op.semilla = s;
      var red = R.redactar(sec, estructuras, op);
      var ev = evaluar(red, estructuras, hb);
      if (!ev.ok) { rechazadas.push({ semilla: s, motivo: ev.motivo }); continue; }
      var t = R.aTexto(red);
      if (textos[t]) continue;            // idéntica a otra: no aporta variación
      textos[t] = true;
      lista.push({ semilla: s, redaccion: red, auditoria: ev.auditoria, huella: hb });
    }
    return { base: desde, huella: hb, versiones: lista, rechazadas: rechazadas };
  }

  // La siguiente semilla que da un texto distinto con los mismos hechos.
  function otraVersion(sec, estructuras, semillaActual, opciones) {
    opciones = opciones || {};
    var op = EDU.clonar(opciones.redactor || opciones);
    var actual = semillaNum(semillaActual);
    op.semilla = actual;
    var previa = R.redactar(sec, estructuras, op), hb = huella(previa), tp = R.aTexto(previa);
    for (var s = actual + 1; s <= actual + INTENTOS; s++) {
      op.semilla = s;
      var red = R.redactar(sec, estructuras, op);
      if (R.aTexto(red) === tp) continue;
      if (evaluar(red, estructuras, hb).ok) return { semilla: s, redaccion: red, comparacion: comparar(previa, red) };
    }
    throw new Error('No se ha encontrado otra versión distinta en ' + INTENTOS + ' intentos');
  }

  /* Guarda una versión como derivado del Proyecto Maestro. Se guarda la semilla
     (para regenerarla igual) y la huella de hechos (para saber si los datos cambiaron). */
  function guardarVersion(proyectoId, red) {
    var der = E.crear('derivado', { proyecto: proyectoId, perfil: 'texto', semilla: semillaNum(red.semilla), estructuras: red.estructuras.slice() });
    der.secuencia = red.secuencia;
    der.huella = huella(red);
    der.nivel = red.nivel;
    return A.guardar('derivado', der).then(function () {
      return A.obtener('proyecto', proyectoId);
    }).then(function (pro) {
      if (!pro) return der;
      if (pro.derivados.indexOf(der.id) < 0) pro.derivados.push(der.id);
      E.tocar(pro);
      return A.guardar('proyecto', pro).then(function () { return der; });
    }).then(function (d) {
      EDU.emitir('variacion:guardada', { derivado: d.id, proyecto: proyectoId });
      return d;
    });
  }

  // Regenera una versión guardada y comprueba que dice exactamente lo mismo que cuando se guardó.
  function comprobarVersion(der, sec, estructuras) {
    var red = R.redactar(sec, estructuras, { semilla: der.semilla });
    if (huella(red) !== der.huella) return { ok: false, motivo: 'Los datos han cambiado desde que se guardó esta versión', redaccion: red };
    var ev = evaluar(red, estructuras, der.huella);
    return ev.ok ? { ok: true, redaccion: red } : { ok: false, motivo: ev.motivo, redaccion: red };
  }

  EDU.variacion = {
    versiones: versiones,
    otraVersion: otraVersion,
    comparar: comparar,
    huella: huella,
    guardarVersion: guardarVersion,
    comprobarVersion: comprobarVersion
  };

  EDU.registrar('variacion', EDU.variacion, { requiere: ['base', 'esquemas', 'almacen', 'redactor'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
