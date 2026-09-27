/* edu_esquemas.js — contratos de datos del sistema.
   Módulo 2 de la fase 1. Requiere edu_base.js.

   Define la forma de cada dato, sus valores por defecto y cómo se valida.
   No contiene ninguna materia: las materias, temas y contenidos son datos
   que llegan después (biblioteca e importador).

     Tipos:  rama · fuente · uc · relacion · proyecto · pieza · estructura · derivado

     EDU.esquemas.crear(tipo, datos)     → objeto completo con id, fechas y defectos
     EDU.esquemas.validar(tipo, obj)     → { ok, errores:[{campo,mensaje}], avisos:[…] }
     EDU.esquemas.catalogo(nombre)       → copia de un catálogo (niveles, tipos de UC…)
     EDU.esquemas.ampliar(nombre, clave, def) → añade una entrada nueva a un catálogo
     EDU.esquemas.relacion(tipo)         → reglas de una relación (inversa, simétrica, transitiva)
     EDU.esquemas.compararNivel(a, b)    → negativo / 0 / positivo

   Regla que protege «no inventar hechos»: una pieza de una estructura
   educativa que no esté «pendiente» debe decir de qué datos sale (desde). */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base) { if (raiz.console) raiz.console.error('[esquemas] Falta edu_base.js'); return; }
  if (EDU.esquemas) return;

  var VERSION_ESQUEMA = 1;

  /* ───────────────────────── Catálogos ─────────────────────────
     Se pueden ampliar con EDU.esquemas.ampliar sin tocar este archivo.
     Nunca se sobrescribe una entrada existente. */

  var CATALOGOS = {
    // rango ordena los niveles de menor a mayor profundidad.
    niveles: {
      infantil: { nombre: 'Infantil', rango: 1 },
      primaria: { nombre: 'Primaria', rango: 2 },
      secundaria: { nombre: 'Secundaria', rango: 3 },
      bachillerato: { nombre: 'Bachillerato', rango: 4 },
      fp: { nombre: 'Formación profesional', rango: 4 },
      universidad: { nombre: 'Universidad', rango: 5 },
      profesional: { nombre: 'Profesional', rango: 6 }
    },

    // Árbol de la biblioteca: cada rama cuelga de la clase anterior.
    clasesRama: {
      materia: { nombre: 'Materia', padre: null },
      nivel: { nombre: 'Nivel', padre: 'materia' },
      tema: { nombre: 'Tema', padre: 'nivel' },
      subtema: { nombre: 'Subtema', padre: 'tema' }
    },

    // Unidad de conocimiento: qué campos propios exige cada tipo.
    tiposUC: {
      concepto: { nombre: 'Concepto', campos: [] },
      definicion: { nombre: 'Definición', campos: [] },
      ejemplo: { nombre: 'Ejemplo', campos: [] },
      dato: { nombre: 'Dato', campos: [] },
      propiedad: { nombre: 'Propiedad', campos: [] },
      fecha: { nombre: 'Fecha o periodo', campos: ['fecha'] },
      formula: { nombre: 'Fórmula', campos: ['expresion'] },
      procedimiento: { nombre: 'Procedimiento', campos: ['pasos'] },
      cita: { nombre: 'Cita', campos: ['autor'] }
    },

    /* Relaciones entre unidades. Estas reglas las usan después el expansor
       (descomponer), la secuencia (ordenar) y el redactor (elegir conector). */
    tiposRelacion: {
      es_un: { nombre: 'es un', inversa: 'tiene_tipo', transitiva: true, simetrica: false },
      parte_de: { nombre: 'es parte de', inversa: 'tiene_parte', transitiva: true, simetrica: false },
      causa: { nombre: 'causa', inversa: 'causado_por', transitiva: false, simetrica: false },
      antes_de: { nombre: 'ocurre antes de', inversa: 'despues_de', transitiva: true, simetrica: false },
      requiere: { nombre: 'requiere saber', inversa: 'es_requisito_de', transitiva: true, simetrica: false },
      define: { nombre: 'define', inversa: 'definido_por', transitiva: false, simetrica: false },
      ejemplo_de: { nombre: 'es ejemplo de', inversa: 'tiene_ejemplo', transitiva: false, simetrica: false },
      propiedad_de: { nombre: 'es propiedad de', inversa: 'tiene_propiedad', transitiva: false, simetrica: false },
      contrasta_con: { nombre: 'contrasta con', inversa: 'contrasta_con', transitiva: false, simetrica: true },
      relacionado: { nombre: 'se relaciona con', inversa: 'relacionado', transitiva: false, simetrica: true }
    },

    origenes: {
      biblioteca: { nombre: 'Biblioteca interna' },
      usuaria: { nombre: 'Aportación de la usuaria' },
      manual: { nombre: 'Edición manual' }
    },

    clasesFuente: {
      propia: { nombre: 'Fuente propia' },
      curriculo: { nombre: 'Currículo oficial' },
      libro: { nombre: 'Libro o publicación' },
      web: { nombre: 'Página web' },
      datos_abiertos: { nombre: 'Datos abiertos' },
      apuntes: { nombre: 'Apuntes de la usuaria' }
    },

    // atribucion: la licencia obliga a citar la fuente al publicar.
    licencias: {
      propia: { nombre: 'Propia', atribucion: false },
      dominio_publico: { nombre: 'Dominio público', atribucion: false },
      cc0: { nombre: 'CC0', atribucion: false },
      cc_by: { nombre: 'CC BY', atribucion: true },
      cc_by_sa: { nombre: 'CC BY-SA', atribucion: true },
      curriculo_oficial: { nombre: 'Currículo oficial', atribucion: true },
      uso_personal: { nombre: 'Uso personal', atribucion: true },
      desconocida: { nombre: 'Desconocida', atribucion: true }
    },

    // Qué puede salir del Motor de Expansión.
    clasesPieza: {
      concepto: { nombre: 'Concepto' },
      subconcepto: { nombre: 'Subconcepto' },
      definicion: { nombre: 'Definición' },
      relacion: { nombre: 'Relación' },
      ejemplo: { nombre: 'Ejemplo' },
      procedimiento: { nombre: 'Procedimiento' },
      pregunta: { nombre: 'Pregunta' },
      ejercicio: { nombre: 'Ejercicio' },
      repaso: { nombre: 'Repaso' },
      visualizacion: { nombre: 'Visualización' }
    },

    estadosPieza: {
      con_respaldo: { nombre: 'Con respaldo' },
      parcial: { nombre: 'Parcial' },
      pendiente: { nombre: 'Pendiente de contenido' }
    },

    /* Forma de dato de una visualización. Es el punto de enganche con el
       futuro Motor Visual: cada forma tiene familias compatibles de los
       motores heredados (solo nombres; aquí no se dibuja nada). */
    formasDato: {
      jerarquia: { nombre: 'Jerarquía', familias: ['mapa', 'piramide'] },
      secuencia: { nombre: 'Secuencia o proceso', familias: ['flujo', 'tiempo'] },
      comparacion: { nombre: 'Comparación', familias: ['comparar'] },
      cantidades: { nombre: 'Cantidades', familias: ['datos'] },
      lista: { nombre: 'Lista o tarjetas', familias: ['ficha', 'carrusel'] },
      libre: { nombre: 'Composición libre', familias: ['poster'] },
      simetria: { nombre: 'Simetría decorativa', familias: ['mandala'] }
    },

    idiomas: {
      es: { nombre: 'Español' }
    }
  };

  function catalogo(nombre) {
    return CATALOGOS[nombre] ? EDU.clonar(CATALOGOS[nombre]) : null;
  }

  function ampliar(nombre, clave, def) {
    var c = CATALOGOS[nombre];
    if (!c) { EDU.aviso('error', 'esquemas', 'No existe el catálogo «' + nombre + '»'); return false; }
    if (!clave || typeof clave !== 'string' || !/^[a-z0-9_]+$/.test(clave)) { EDU.aviso('error', 'esquemas', 'Clave no válida: «' + clave + '»'); return false; }
    if (c[clave]) { EDU.aviso('aviso', 'esquemas', '«' + clave + '» ya existe en ' + nombre + '; no se sustituye'); return false; }
    if (!def || typeof def !== 'object' || !def.nombre) { EDU.aviso('error', 'esquemas', 'La entrada necesita al menos «nombre»'); return false; }
    c[clave] = EDU.clonar(def);
    EDU.emitir('esquemas:ampliado', { catalogo: nombre, clave: clave });
    return true;
  }

  function relacion(tipo) {
    return CATALOGOS.tiposRelacion[tipo] ? EDU.clonar(CATALOGOS.tiposRelacion[tipo]) : null;
  }

  function compararNivel(a, b) {
    var na = CATALOGOS.niveles[a], nb = CATALOGOS.niveles[b];
    if (!na || !nb) return NaN;
    return na.rango - nb.rango;
  }

  /* ───────────────────────── Comprobaciones básicas ───────────────────────── */

  function esTexto(v) { return typeof v === 'string' && v.trim().length > 0; }
  function esLista(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function esObjeto(v) { return v !== null && typeof v === 'object' && !esLista(v); }
  function enCatalogo(nombre, v) { return typeof v === 'string' && !!CATALOGOS[nombre][v]; }

  /* Especificación declarativa de campos:
       t: 'texto' | 'texto?' (opcional) | 'lista' | 'objeto' | 'numero' | 'id' | 'id?'
       cat: nombre de catálogo cuyo valor debe existir */
  var CAMPOS = {
    rama: {
      id: { t: 'id' }, v: { t: 'numero' }, clase: { t: 'texto', cat: 'clasesRama' },
      nombre: { t: 'texto' }, padre: { t: 'id?' }, orden: { t: 'numero' }, nivel: { t: 'texto?', cat: 'niveles' }
    },
    fuente: {
      id: { t: 'id' }, v: { t: 'numero' }, clase: { t: 'texto', cat: 'clasesFuente' },
      titulo: { t: 'texto' }, autor: { t: 'texto?' }, anio: { t: 'texto?' }, url: { t: 'texto?' },
      licencia: { t: 'texto', cat: 'licencias' }, nota: { t: 'texto?' }
    },
    uc: {
      id: { t: 'id' }, v: { t: 'numero' }, tipo: { t: 'texto', cat: 'tiposUC' },
      titulo: { t: 'texto' }, texto: { t: 'texto?' }, campos: { t: 'objeto' },
      rama: { t: 'id?' }, niveles: { t: 'lista' }, fuente: { t: 'id?' },
      origen: { t: 'texto', cat: 'origenes' }, idioma: { t: 'texto', cat: 'idiomas' },
      etiquetas: { t: 'lista' }, proyecto: { t: 'id?' }, creado: { t: 'texto' }, tocado: { t: 'texto' }
    },
    relacion: {
      id: { t: 'id' }, v: { t: 'numero' }, tipo: { t: 'texto', cat: 'tiposRelacion' },
      de: { t: 'id' }, a: { t: 'id' }, fuente: { t: 'id?' }, origen: { t: 'texto', cat: 'origenes' }, nota: { t: 'texto?' }
    },
    proyecto: {
      id: { t: 'id' }, v: { t: 'numero' }, titulo: { t: 'texto' }, autoria: { t: 'texto?' },
      nivel: { t: 'texto', cat: 'niveles' }, idioma: { t: 'texto', cat: 'idiomas' }, semilla: { t: 'numero' },
      ramas: { t: 'lista' }, ucs: { t: 'lista' }, modulos: { t: 'lista' }, derivados: { t: 'lista' },
      creado: { t: 'texto' }, tocado: { t: 'texto' }
    },
    pieza: {
      id: { t: 'id' }, clase: { t: 'texto', cat: 'clasesPieza' }, estado: { t: 'texto', cat: 'estadosPieza' },
      desde: { t: 'lista' }, datos: { t: 'objeto' }, nota: { t: 'texto?' }
    },
    estructura: {
      id: { t: 'id' }, v: { t: 'numero' }, raiz: { t: 'id' }, nivel: { t: 'texto', cat: 'niveles' },
      semilla: { t: 'numero' }, piezas: { t: 'lista' }, creado: { t: 'texto' }
    },
    derivado: {
      id: { t: 'id' }, v: { t: 'numero' }, proyecto: { t: 'id' }, perfil: { t: 'texto' },
      semilla: { t: 'numero' }, estructuras: { t: 'lista' }, fijadas: { t: 'objeto' },
      creado: { t: 'texto' }, tocado: { t: 'texto' }
    }
  };

  function validarCampos(tipo, obj, errores) {
    var spec = CAMPOS[tipo];
    Object.keys(spec).forEach(function (k) {
      var s = spec[k], v = obj[k];
      var opcional = s.t.charAt(s.t.length - 1) === '?';
      var t = opcional ? s.t.slice(0, -1) : s.t;
      if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
        if (!opcional) errores.push({ campo: k, mensaje: 'Falta el campo obligatorio' });
        return;
      }
      if ((t === 'texto' || t === 'id') && typeof v !== 'string') errores.push({ campo: k, mensaje: 'Debe ser texto' });
      else if (t === 'lista' && !esLista(v)) errores.push({ campo: k, mensaje: 'Debe ser una lista' });
      else if (t === 'objeto' && !esObjeto(v)) errores.push({ campo: k, mensaje: 'Debe ser un objeto' });
      else if (t === 'numero' && (typeof v !== 'number' || !isFinite(v))) errores.push({ campo: k, mensaje: 'Debe ser un número' });
      else if (s.cat && !enCatalogo(s.cat, v)) errores.push({ campo: k, mensaje: 'Valor «' + v + '» fuera del catálogo ' + s.cat });
    });
  }

  /* ───────────────────────── Reglas propias de cada tipo ───────────────────────── */

  var REGLAS = {
    rama: function (o, err) {
      var c = CATALOGOS.clasesRama[o.clase];
      if (!c) return;
      if (c.padre === null && o.padre) err.push({ campo: 'padre', mensaje: 'Una materia no cuelga de otra rama' });
      if (c.padre !== null && !o.padre) err.push({ campo: 'padre', mensaje: 'Un/a ' + o.clase + ' debe colgar de un/a ' + c.padre });
      if (o.clase === 'nivel' && !o.nivel) err.push({ campo: 'nivel', mensaje: 'Una rama de nivel debe indicar qué nivel es' });
    },

    fuente: function (o, err, av) {
      if (o.licencia === 'desconocida') av.push({ campo: 'licencia', mensaje: 'Licencia desconocida: confirmar antes de publicar' });
    },

    uc: function (o, err, av) {
      var t = CATALOGOS.tiposUC[o.tipo];
      if (t && esObjeto(o.campos)) {
        t.campos.forEach(function (c) {
          var v = o.campos[c];
          if (c === 'pasos') {
            if (!esLista(v) || !v.length || !v.every(esTexto)) err.push({ campo: 'campos.pasos', mensaje: 'Un procedimiento necesita una lista de pasos con texto' });
          } else if (!esTexto(v)) err.push({ campo: 'campos.' + c, mensaje: 'El tipo «' + o.tipo + '» necesita «' + c + '»' });
        });
      }
      if (esLista(o.niveles)) {
        o.niveles.forEach(function (n) { if (!enCatalogo('niveles', n)) err.push({ campo: 'niveles', mensaje: 'Nivel desconocido: «' + n + '»' }); });
      }
      if (o.origen === 'biblioteca' && !o.fuente) av.push({ campo: 'fuente', mensaje: 'Unidad de biblioteca sin fuente registrada' });
      if (o.origen === 'biblioteca' && !o.rama) err.push({ campo: 'rama', mensaje: 'Una unidad de biblioteca debe estar en una rama' });
      if (o.origen === 'usuaria' && !o.proyecto && !o.rama) av.push({ campo: 'proyecto', mensaje: 'Aportación sin proyecto ni rama' });
    },

    relacion: function (o, err) {
      if (o.de && o.de === o.a) err.push({ campo: 'a', mensaje: 'Una relación no puede unir una unidad consigo misma' });
    },

    proyecto: function (o, err) {
      if (esLista(o.modulos)) {
        o.modulos.forEach(function (m, i) {
          if (!esObjeto(m) || !esTexto(m.id) || !esTexto(m.titulo) || !esLista(m.ucs)) {
            err.push({ campo: 'modulos[' + i + ']', mensaje: 'Cada módulo necesita id, titulo y lista ucs' });
          }
        });
      }
    },

    // Aquí vive la garantía de no inventar: sin «desde», solo puede estar pendiente.
    pieza: function (o, err) {
      if (esLista(o.desde) && o.estado && o.estado !== 'pendiente' && !o.desde.length) {
        err.push({ campo: 'desde', mensaje: 'Una pieza con contenido debe indicar de qué datos sale' });
      }
      if (esLista(o.desde) && !o.desde.every(esTexto)) err.push({ campo: 'desde', mensaje: 'Las referencias deben ser identificadores' });
      if (o.clase === 'visualizacion' && esObjeto(o.datos) && !enCatalogo('formasDato', o.datos.forma)) {
        err.push({ campo: 'datos.forma', mensaje: 'Una visualización necesita una forma de dato del catálogo' });
      }
    },

    estructura: function (o, err, av) {
      if (!esLista(o.piezas)) return;
      o.piezas.forEach(function (p, i) {
        var r = validar('pieza', p);
        r.errores.forEach(function (e) { err.push({ campo: 'piezas[' + i + '].' + e.campo, mensaje: e.mensaje }); });
      });
      var pend = o.piezas.filter(function (p) { return p && p.estado === 'pendiente'; }).length;
      if (pend) av.push({ campo: 'piezas', mensaje: pend + ' pieza(s) pendientes de contenido' });
    },

    derivado: function () { }
  };

  function validar(tipo, obj) {
    var errores = [], avisos = [];
    if (!CAMPOS[tipo]) return { ok: false, errores: [{ campo: '', mensaje: 'Tipo desconocido: «' + tipo + '»' }], avisos: avisos };
    if (!esObjeto(obj)) return { ok: false, errores: [{ campo: '', mensaje: 'Se esperaba un objeto' }], avisos: avisos };
    validarCampos(tipo, obj, errores);
    REGLAS[tipo](obj, errores, avisos);
    return { ok: errores.length === 0, errores: errores, avisos: avisos };
  }

  /* ───────────────────────── Creación con valores por defecto ─────────────────────────
     crear() no valida: completa. Quien guarda (edu_almacen) valida. */

  function base(o, d) {
    Object.keys(d).forEach(function (k) { if (o[k] === undefined) o[k] = d[k]; });
    return o;
  }

  // Relaciones simétricas: el mismo par da el mismo id sea cual sea el orden.
  function idRelacion(tipo, de, a) {
    var r = CATALOGOS.tiposRelacion[tipo];
    var par = (r && r.simetrica && String(a) < String(de)) ? [a, de] : [de, a];
    return 'rel_' + EDU.hash(tipo + '|' + par[0] + '|' + par[1]);
  }

  var CREADORES = {
    rama: function (o) {
      return base(o, { id: EDU.idEstable('rama', (o.padre || '') + '|' + (o.clase || '') + '|' + (o.nombre || '')), clase: 'materia', padre: null, orden: 0 });
    },
    fuente: function (o) {
      return base(o, { id: EDU.idEstable('fue', (o.titulo || '') + '|' + (o.autor || '') + '|' + (o.url || '')), clase: 'propia', licencia: 'desconocida' });
    },
    uc: function (o, ahora) {
      return base(o, {
        id: EDU.idEstable('uc', (o.tipo || '') + '|' + (o.rama || o.proyecto || '') + '|' + (o.titulo || '')),
        tipo: 'concepto', texto: '', campos: {}, rama: null, niveles: [], fuente: null,
        origen: 'manual', idioma: 'es', etiquetas: [], proyecto: null, creado: ahora, tocado: ahora
      });
    },
    relacion: function (o) {
      if (o.tipo && o.de && o.a && o.id === undefined) o.id = idRelacion(o.tipo, o.de, o.a);
      return base(o, { fuente: null, origen: 'manual' });
    },
    proyecto: function (o, ahora) {
      return base(o, {
        id: EDU.id('pro'), autoria: '', nivel: 'primaria', idioma: 'es', semilla: EDU.semillaNueva(),
        ramas: [], ucs: [], modulos: [], derivados: [], creado: ahora, tocado: ahora
      });
    },
    pieza: function (o) {
      return base(o, { id: EDU.id('pz'), estado: 'pendiente', desde: [], datos: {} });
    },
    estructura: function (o, ahora) {
      return base(o, { id: EDU.id('est'), nivel: 'primaria', semilla: 1, piezas: [], creado: ahora });
    },
    derivado: function (o, ahora) {
      return base(o, { id: EDU.id('der'), semilla: 1, estructuras: [], fijadas: {}, creado: ahora, tocado: ahora });
    }
  };

  var CON_VERSION = { rama: 1, fuente: 1, uc: 1, relacion: 1, proyecto: 1, estructura: 1, derivado: 1 };

  function crear(tipo, datos) {
    if (!CREADORES[tipo]) { EDU.aviso('error', 'esquemas', 'Tipo desconocido: «' + tipo + '»'); return null; }
    var o = EDU.clonar(datos || {});
    if (CON_VERSION[tipo] && o.v === undefined) o.v = VERSION_ESQUEMA;
    return CREADORES[tipo](o, EDU.ahora());
  }

  // Marca un objeto como modificado ahora (sin tocar nada más).
  function tocar(obj) {
    if (esObjeto(obj) && obj.tocado !== undefined) obj.tocado = EDU.ahora();
    return obj;
  }

  EDU.esquemas = {
    VERSION: VERSION_ESQUEMA,
    tipos: function () { return Object.keys(CAMPOS); },
    crear: crear,
    validar: validar,
    tocar: tocar,
    catalogo: catalogo,
    ampliar: ampliar,
    relacion: relacion,
    idRelacion: idRelacion,
    compararNivel: compararNivel
  };

  EDU.registrar('esquemas', EDU.esquemas, { requiere: ['base'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
