/* edu_base.js — base común del Sistema Universal de Materiales Educativos.
   Módulo 1 de la fase 1. No sabe nada de materias, niveles ni productos:
   solo da lo que todos los demás módulos necesitan compartir.

     · Registro de módulos     EDU.registrar / EDU.modulo / EDU.hay / EDU.modulos
     · Puentes a heredados     EDU.puente.declarar / obtener / hay / estado
     · Avisos entre módulos    EDU.on / EDU.una / EDU.emitir
     · Azar con semilla        EDU.azar(semilla) → { siguiente, entero, uno, barajar, bolsa, derivar }
     · Identificadores         EDU.id / EDU.idEstable
     · Utilidades              EDU.hash / esc / clonar / normalizar / slug / ahora
     · Registro de incidencias EDU.aviso / EDU.incidencias

   JavaScript clásico, sin import/export. Funciona en el navegador (window)
   y también en Node para las pruebas (globalThis). Protegido contra doble carga. */
(function (raiz) {
  'use strict';
  if (raiz.EDU && raiz.EDU._base) return;

  var EDU = raiz.EDU || {};
  EDU._base = true;
  EDU.version = '0.1.0';

  /* ───────────────────────── Incidencias ───────────────────────── */

  var TOPE_INCIDENCIAS = 200;
  var incidencias = [];

  /* nivel: 'info' | 'aviso' | 'error'. Se guarda en memoria (últimas 200)
     y se muestra en consola con el nombre del módulo delante. */
  function aviso(nivel, modulo, mensaje, detalle) {
    var n = { nivel: nivel || 'info', modulo: modulo || 'edu', mensaje: String(mensaje || ''), detalle: detalle, ts: Date.now() };
    incidencias.push(n);
    if (incidencias.length > TOPE_INCIDENCIAS) incidencias.shift();
    try {
      var c = raiz.console;
      if (c) {
        var f = n.nivel === 'error' ? c.error : n.nivel === 'aviso' ? c.warn : c.info;
        if (f) f.call(c, '[' + n.modulo + '] ' + n.mensaje, detalle === undefined ? '' : detalle);
      }
    } catch (e) { }
    return n;
  }

  EDU.aviso = aviso;
  EDU.incidencias = function (nivel) {
    return incidencias.filter(function (n) { return !nivel || n.nivel === nivel; }).slice();
  };

  /* ───────────────────────── Avisos entre módulos ───────────────────────── */

  var oyentes = {};

  /* Devuelve la función para darse de baja. Un oyente que falla no
     impide que los demás reciban el aviso. */
  function on(evento, fn) {
    if (typeof fn !== 'function') return function () { };
    (oyentes[evento] = oyentes[evento] || []).push(fn);
    return function () {
      oyentes[evento] = (oyentes[evento] || []).filter(function (x) { return x !== fn; });
    };
  }

  function una(evento, fn) {
    var baja = on(evento, function (datos) { baja(); fn(datos); });
    return baja;
  }

  function emitir(evento, datos) {
    var lista = (oyentes[evento] || []).slice();
    for (var i = 0; i < lista.length; i++) {
      try { lista[i](datos); } catch (e) { aviso('error', 'avisos', 'Falló un oyente de «' + evento + '»', e && e.message); }
    }
    return lista.length;
  }

  EDU.on = on;
  EDU.una = una;
  EDU.emitir = emitir;

  /* ───────────────────────── Registro de módulos ───────────────────────── */

  var modulos = {};

  /* EDU.registrar('biblioteca', api, { requiere: ['esquemas'], version: '0.1.0' })
     · No sustituye un módulo ya registrado: avisa y conserva el primero.
     · Si falta algún requisito lo avisa, pero registra igual; el orden de
       carga de los <script> es responsabilidad del armazón. */
  function registrar(nombre, api, opciones) {
    opciones = opciones || {};
    if (!nombre || typeof nombre !== 'string') { aviso('error', 'registro', 'Módulo sin nombre'); return null; }
    if (modulos[nombre]) { aviso('aviso', 'registro', 'El módulo «' + nombre + '» ya estaba registrado; se conserva el primero'); return modulos[nombre].api; }
    var requiere = (opciones.requiere || []).slice();
    var faltan = requiere.filter(function (r) { return !modulos[r]; });
    if (faltan.length) aviso('aviso', 'registro', '«' + nombre + '» se registra sin: ' + faltan.join(', '));
    modulos[nombre] = { nombre: nombre, api: api, version: opciones.version || '0.0.0', requiere: requiere, ts: Date.now() };
    emitir('modulo:registrado', { nombre: nombre });
    return api;
  }

  function modulo(nombre) { return modulos[nombre] ? modulos[nombre].api : null; }
  function hay(nombre) { return !!modulos[nombre]; }

  function listaModulos() {
    return Object.keys(modulos).map(function (k) {
      var m = modulos[k];
      return { nombre: m.nombre, version: m.version, requiere: m.requiere.slice(), completo: m.requiere.every(hay) };
    });
  }

  EDU.registrar = registrar;
  EDU.modulo = modulo;
  EDU.hay = hay;
  EDU.modulos = listaModulos;

  /* ───────────────────────── Puentes a motores heredados ─────────────────────────
     El núcleo no carga ni modifica los motores de FATIMA PRO. Solo sabe
     cómo se llaman sus globales para que, cuando el armazón los cargue
     (fase del Motor Visual), los adaptadores los encuentren aquí.
     Un puente declarado cuyo global no existe devuelve null: nada se rompe. */

  var puentes = {};

  function declararPuente(nombre, datos) {
    datos = datos || {};
    if (!nombre || !datos.global) { aviso('error', 'puente', 'Puente sin nombre o sin global'); return false; }
    if (puentes[nombre]) return false;
    puentes[nombre] = { nombre: nombre, global: datos.global, archivo: datos.archivo || '', descripcion: datos.descripcion || '' };
    return true;
  }

  function obtenerPuente(nombre) {
    var p = puentes[nombre];
    if (!p) return null;
    var g = raiz[p.global];
    return g === undefined ? null : g;
  }

  function estadoPuentes() {
    return Object.keys(puentes).map(function (k) {
      var p = puentes[k];
      return { nombre: p.nombre, global: p.global, archivo: p.archivo, descripcion: p.descripcion, cargado: raiz[p.global] !== undefined };
    });
  }

  EDU.puente = {
    declarar: declararPuente,
    obtener: obtenerPuente,
    hay: function (nombre) { return obtenerPuente(nombre) !== null; },
    estado: estadoPuentes
  };

  // Catálogo conocido de motores heredados (solo nombres; no se cargan aquí).
  [
    ['laminas', 'LAMINAS_MOTOR', 'b6_laminas_motor.js', '77 estructuras visuales: mapas, flujos, tiempo, mandalas…'],
    ['laminas_disenos', 'LAMINAS_DISENOS', 'b6_laminas_disenos.js', 'Temas y presets de láminas'],
    ['folleto', 'FOLLETO_MOTOR', 'b6_folleto_motor.js', 'Rejillas de página, temas y encaje'],
    ['folleto_disenos', 'FOLLETO_DISENOS', 'b6_folleto_disenos.js', 'Presets de folleto'],
    ['examen', 'EU_EXAMEN', 'b6_examen.js', 'Maqueta A4 de examen y corrección'],
    ['voz', 'EU_VOZ', 'b6_voz.js', 'Narración con la voz del navegador'],
    ['bandeja', 'B6Bandeja', 'b6_bandeja.js', 'Bandeja de descargas y ZIP'],
    ['volantes', 'VOLANTES', 'b6_volantes.js', 'Imposición de impresión']
  ].forEach(function (p) { declararPuente(p[0], { global: p[1], archivo: p[2], descripcion: p[3] }); });

  /* ───────────────────────── Hash ───────────────────────── */

  /* FNV-1a de 32 bits sobre el texto. Rápido y estable entre navegadores;
     sirve para semillas y para identificadores estables, no para seguridad. */
  function hash32(texto) {
    var s = String(texto === undefined || texto === null ? '' : texto);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function hashHex(texto) {
    var h = hash32(texto).toString(16);
    return ('00000000' + h).slice(-8);
  }

  EDU.hash = hashHex;

  /* ───────────────────────── Azar con semilla ─────────────────────────
     Mismo generador que motorAzar de FATIMA PRO (mulberry32): la misma
     semilla da siempre la misma secuencia. La semilla puede ser número
     o texto. derivar(etiqueta) crea un azar hijo independiente, para que
     añadir una tirada en un módulo no cambie las de los demás. */

  function aSemilla(semilla) {
    if (typeof semilla === 'number' && isFinite(semilla)) return (semilla >>> 0) || 1;
    return hash32(semilla) || 1;
  }

  function mulberry32(s) {
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function azar(semilla) {
    var base = aSemilla(semilla);
    var rng = mulberry32(base);

    function entero(min, max) {
      if (max < min) { var t = min; min = max; max = t; }
      return min + Math.floor(rng() * (max - min + 1));
    }

    function uno(lista) {
      if (!lista || !lista.length) return undefined;
      return lista[Math.floor(rng() * lista.length) % lista.length];
    }

    // Fisher-Yates sobre una copia: nunca altera la lista original.
    function barajar(lista) {
      var c = (lista || []).slice();
      for (var i = c.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var tmp = c[i]; c[i] = c[j]; c[j] = tmp;
      }
      return c;
    }

    /* Bolsa sin reposición: no repite ningún elemento hasta gastarlos todos
       (mismo comportamiento que la Bolsa de FATIMA PRO). */
    function bolsa(lista) {
      var origen = (lista || []).slice();
      var quedan = [];
      return {
        coger: function () {
          if (!origen.length) return undefined;
          if (!quedan.length) quedan = barajar(origen);
          return quedan.pop();
        },
        quedan: function () { return quedan.length; }
      };
    }

    function derivar(etiqueta) { return azar(hash32(base + '·' + String(etiqueta))); }

    return {
      semilla: base,
      siguiente: rng,
      entero: entero,
      uno: uno,
      barajar: barajar,
      bolsa: bolsa,
      derivar: derivar
    };
  }

  function semillaNueva() {
    try {
      if (raiz.crypto && raiz.crypto.getRandomValues) {
        var a = new Uint32Array(1);
        raiz.crypto.getRandomValues(a);
        return (a[0] >>> 0) || 1;
      }
    } catch (e) { }
    return ((Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0) || 1;
  }

  EDU.azar = azar;
  EDU.semillaNueva = semillaNueva;

  /* ───────────────────────── Identificadores ───────────────────────── */

  var contador = 0;

  // Único en la sesión y entre sesiones (tiempo + azar + contador).
  function id(prefijo) {
    contador = (contador + 1) % 1679616;
    return (prefijo || 'id') + '_' + Date.now().toString(36) + semillaNueva().toString(36) + contador.toString(36);
  }

  // Siempre el mismo para el mismo texto: evita duplicar una unidad al reimportarla.
  function idEstable(prefijo, texto) {
    return (prefijo || 'id') + '_' + hashHex(normalizar(texto));
  }

  EDU.id = id;
  EDU.idEstable = idEstable;

  /* ───────────────────────── Utilidades ───────────────────────── */

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(texto) {
    return String(texto === undefined || texto === null ? '' : texto).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  // Copia profunda de datos (objetos planos, listas, textos, números, fechas como texto).
  function clonar(v) {
    if (v === undefined) return undefined;
    try { if (typeof raiz.structuredClone === 'function') return raiz.structuredClone(v); } catch (e) { }
    return JSON.parse(JSON.stringify(v));
  }

  // Para comparar y buscar: minúsculas, sin tildes, espacios simples. Conserva la ñ.
  function normalizar(texto) {
    return String(texto === undefined || texto === null ? '' : texto)
      .toLowerCase()
      .replace(/ñ/g, '\u0001')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\u0001/g, 'ñ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slug(texto) {
    return normalizar(texto).replace(/ñ/g, 'n').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  EDU.esc = esc;
  EDU.clonar = clonar;
  EDU.normalizar = normalizar;
  EDU.slug = slug;
  EDU.ahora = function () { return new Date().toISOString(); };

  raiz.EDU = EDU;
  registrar('base', EDU, { version: EDU.version });
})(typeof window !== 'undefined' ? window : globalThis);
