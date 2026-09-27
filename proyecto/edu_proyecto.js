/* edu_proyecto.js — «¿Qué quieres crear?»: tipos de trabajo y Proyecto Maestro.
   Fase 2 · asistente. Requiere edu_base, edu_esquemas y edu_almacen.

   Un proyecto reúne el contenido (ramas del banco, contenido pegado, apuntes)
   y las decisiones del trabajo: tipo, nivel, número de hojas, papel y
   plantilla. Cambiar de tipo de trabajo no regenera nada: el mismo proyecto
   alimenta todas las salidas.

   estimarHojas() dice cuántas hojas salen con el contenido que hay, para que
   el objetivo (de 10 a 300) nunca se rellene con texto vacío: si faltan
   hojas, el sistema lo dice y hay que añadir contenido.

     EDU.proyecto.tipos()                          → catálogo de tipos de trabajo
     EDU.proyecto.crear(opciones)                  → Promise<proyecto>
     EDU.proyecto.anadirContenido(id, { ramas, ucs }) → Promise<proyecto>
     EDU.proyecto.obtener(id) / listar()
     EDU.proyecto.estimarHojas(redaccion, { papel }) → { hojas, detalle }
     EDU.proyecto.cobertura(proyecto, estimacion)  → { objetivo, estimadas, faltan, porcentaje, mensaje } */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base || !EDU.esquemas || !EDU.almacen) { if (raiz.console) raiz.console.error('[proyecto] Faltan edu_base, edu_esquemas o edu_almacen'); return; }
  if (EDU.proyecto) return;

  var E = EDU.esquemas, A = EDU.almacen;

  /* Tipos de trabajo. «listo» indica si su salida descargable ya está conectada;
     mientras no lo esté, el trabajo se prepara y se ve en pantalla. */
  var TIPOS = {
    libro: { nombre: 'Libro', desc: 'Libro de estudio paginado, imprimible', formatos: ['PDF', 'HTML'], listo: true },
    ebook: { nombre: 'Libro electrónico', desc: 'eBook para leer en pantalla', formatos: ['EPUB', 'HTML'], listo: true },
    curso: { nombre: 'Curso virtual', desc: 'Curso por módulos, navegable e imprimible', formatos: ['HTML', 'SCORM', 'PDF'], listo: false },
    guia: { nombre: 'Guía paso a paso', desc: 'Explicación paso a paso con ejemplos', formatos: ['PDF', 'HTML'], listo: false },
    examen: { nombre: 'Examen', desc: 'Examen con hoja de corrección', formatos: ['PDF'], listo: true },
    presentacion: { nombre: 'Presentación', desc: 'Diapositivas con los diseños del catálogo', formatos: ['PDF', 'PPTX', 'PNG'], listo: false },
    video: { nombre: 'Vídeo explicativo', desc: 'Láminas animadas con voz', formatos: ['WebM'], listo: false },
    fichas: { nombre: 'Fichas y láminas', desc: 'Fichas de estudio, mapas y esquemas', formatos: ['PNG', 'PDF'], listo: false },
    infantil: { nombre: 'Cuaderno infantil', desc: 'Caligrafía, sopas de letras, crucigramas…', formatos: ['PDF'], listo: false },
    diccionario: { nombre: 'Diccionario', desc: 'Diccionario de términos, también bilingüe', formatos: ['PDF', 'HTML'], listo: false }
  };

  var PAPEL = {
    a4: { nombre: 'A4', caracteresPorHoja: 2600 },
    carta: { nombre: 'Carta', caracteresPorHoja: 2500 }
  };

  var ORIGENES = { banco: 'Banco de conocimiento', pegado: 'Contenido pegado', apuntes: 'Mis apuntes', mixto: 'Mezcla' };
  var HOJAS_MIN = 1, HOJAS_MAX = 500;

  function tipos() { return EDU.clonar(TIPOS); }

  function error(m, errores) { var e = new Error(m); e.errores = errores || []; return e; }

  function crear(op) {
    op = op || {};
    var errores = [];
    if (!String(op.titulo || '').trim()) errores.push({ campo: 'titulo', mensaje: 'Escribe un título para el trabajo' });
    if (!TIPOS[op.tipo]) errores.push({ campo: 'tipo', mensaje: 'Elige un tipo de trabajo' });
    var hojas = Number(op.hojas);
    if (!isFinite(hojas) || hojas < HOJAS_MIN || hojas > HOJAS_MAX) errores.push({ campo: 'hojas', mensaje: 'El número de hojas debe estar entre ' + HOJAS_MIN + ' y ' + HOJAS_MAX });
    if (op.papel && !PAPEL[op.papel]) errores.push({ campo: 'papel', mensaje: 'Papel no válido' });
    if (op.origen && !ORIGENES[op.origen]) errores.push({ campo: 'origen', mensaje: 'Origen del contenido no válido' });
    var pro = E.crear('proyecto', {
      titulo: String(op.titulo || '').trim(), autoria: op.autoria || '',
      nivel: op.nivel || 'primaria', idioma: op.idioma || 'es',
      ramas: (op.ramas || []).slice(), ucs: (op.ucs || []).slice()
    });
    pro.trabajo = {
      tipo: op.tipo, hojas: Math.round(hojas), papel: op.papel || 'a4',
      origen: op.origen || 'banco', paleta: op.paleta || null, diseno: op.diseno || null
    };
    var v = E.validar('proyecto', pro);
    v.errores.forEach(function (e) { errores.push(e); });
    if (errores.length) return Promise.reject(error('El trabajo no se puede crear: ' + errores[0].mensaje, errores));
    return A.guardar('proyecto', pro).then(function () {
      EDU.emitir('proyecto:creado', { id: pro.id });
      return pro;
    });
  }

  function obtener(id) { return A.obtener('proyecto', id); }

  function listar() {
    return A.listar('proyecto').then(function (l) { return l.sort(function (a, b) { return a.tocado < b.tocado ? 1 : -1; }); });
  }

  function anadirContenido(id, cont) {
    cont = cont || {};
    return A.obtener('proyecto', id).then(function (pro) {
      if (!pro) throw error('No existe el trabajo «' + id + '»');
      (cont.ramas || []).forEach(function (r) { if (pro.ramas.indexOf(r) < 0) pro.ramas.push(r); });
      (cont.ucs || []).forEach(function (u) { if (pro.ucs.indexOf(u) < 0) pro.ucs.push(u); });
      E.tocar(pro);
      return A.guardar('proyecto', pro).then(function () { return pro; });
    });
  }

  /* ───────────────────────── Estimación de hojas ─────────────────────────
     Texto: caracteres / capacidad de una hoja. Cada lámina ocupa media hoja y
     cada pregunta unos 350 caracteres. Es una estimación, no una maqueta. */

  function estimarHojas(red, op) {
    op = op || {};
    var P = PAPEL[op.papel] || PAPEL.a4;
    var chars = 0, laminas = 0, preguntas = 0, pendientes = 0;
    function contar(b) {
      if (b.tipo === 'pendiente') { pendientes++; return; }
      if (b.tipo === 'visualizacion') { laminas++; return; }
      if (b.tipo === 'pregunta') { preguntas++; return; }
      (b.frases || []).forEach(function (a) { chars += a.texto.length + 1; });
    }
    red.secciones.forEach(function (s) {
      chars += s.titulo.length + 40;
      s.objetivos.forEach(function (a) { chars += a.texto.length + 1; });
      s.bloques.forEach(contar);
    });
    red.sintesis.bloques.forEach(contar);
    var hojasTexto = chars / P.caracteresPorHoja;
    var hojas = hojasTexto + laminas * 0.5 + (preguntas * 350) / P.caracteresPorHoja + 1;   // + portada
    return {
      hojas: Math.max(1, Math.round(hojas)),
      detalle: { caracteres: chars, hojasTexto: Math.round(hojasTexto * 10) / 10, laminas: laminas, preguntas: preguntas, pendientes: pendientes, papel: P.nombre }
    };
  }

  function cobertura(pro, est) {
    var objetivo = pro && pro.trabajo ? pro.trabajo.hojas : 0;
    var estimadas = est.hojas, faltan = Math.max(0, objetivo - estimadas);
    var porcentaje = objetivo ? Math.min(100, Math.round(100 * estimadas / objetivo)) : 100;
    var mensaje = !objetivo ? 'Sin objetivo de hojas.'
      : faltan === 0 ? 'Hay contenido suficiente para ' + objetivo + ' hojas.'
        : 'Con el contenido actual salen unas ' + estimadas + ' hojas de ' + objetivo + '. Para llegar hay que añadir contenido: pegarlo, escribirlo o sumar más temas del banco. No se rellenará con texto vacío.';
    return { objetivo: objetivo, estimadas: estimadas, faltan: faltan, porcentaje: porcentaje, mensaje: mensaje, pendientes: est.detalle.pendientes };
  }

  EDU.proyecto = {
    tipos: tipos,
    papeles: function () { return EDU.clonar(PAPEL); },
    origenes: function () { return EDU.clonar(ORIGENES); },
    crear: crear,
    obtener: obtener,
    listar: listar,
    anadirContenido: anadirContenido,
    estimarHojas: estimarHojas,
    cobertura: cobertura
  };

  EDU.registrar('proyecto', EDU.proyecto, { requiere: ['base', 'esquemas', 'almacen'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
