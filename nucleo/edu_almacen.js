/* edu_almacen.js — persistencia local del sistema.
   Módulo 3 de la fase 1. Requiere edu_base.js y edu_esquemas.js.

   · IndexedDB guarda los datos: ramas, fuentes, unidades, relaciones,
     proyectos, estructuras, derivados y recursos (imágenes como Blob).
   · localStorage guarda SOLO preferencias pequeñas (prefijo «edu_pref_»).
   · Si IndexedDB no está disponible (modo privado, navegador antiguo,
     pruebas en Node) trabaja en memoria y lo avisa: nada se rompe, pero
     los datos no sobreviven a una recarga.
   · Todo lo que entra se valida con EDU.esquemas: lo inválido se rechaza
     entero y no se guarda nada a medias.

     EDU.almacen.abrir()                      → Promise<'indexeddb'|'memoria'>
     EDU.almacen.guardar(tipo, obj)           → Promise<{ ok, id, avisos }>
     EDU.almacen.guardarVarios(tipo, lista)   → Promise<{ ok, ids, avisos }>
     EDU.almacen.obtener(tipo, id)            → Promise<obj|null>
     EDU.almacen.listar(tipo, filtro?)        → Promise<[obj]>   filtro: { campo, valor }
     EDU.almacen.borrar(tipo, id) / contar(tipo)
     EDU.almacen.guardarRecurso(blob, meta) / obtenerRecurso(id) / borrarRecurso(id)
     EDU.almacen.exportar(opciones?)          → Promise<copia JSON>
     EDU.almacen.importar(copia, opciones?)   → Promise<informe>
     EDU.almacen.vaciar({ confirmar: true })
     EDU.almacen.pref(clave[, valor])         → preferencias en localStorage
     EDU.almacen.estado()                     → { modo, persistente, bd } */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base || !EDU.esquemas) { if (raiz.console) raiz.console.error('[almacen] Faltan edu_base.js o edu_esquemas.js'); return; }
  if (EDU.almacen) return;

  var NOMBRE_BD = 'edu_sistema';
  var VERSION_BD = 1;
  var FORMATO_COPIA = 'edu-copia';
  var PREFIJO_PREF = 'edu_pref_';

  /* Tipo de dato → almacén e índices. Las piezas viven dentro de su
     estructura; no tienen almacén propio. */
  var ALMACENES = {
    rama: { nombre: 'ramas', indices: ['padre', 'clase'] },
    fuente: { nombre: 'fuentes', indices: [] },
    uc: { nombre: 'ucs', indices: ['rama', 'proyecto', 'tipo', 'origen'] },
    relacion: { nombre: 'relaciones', indices: ['de', 'a', 'tipo'] },
    proyecto: { nombre: 'proyectos', indices: [] },
    estructura: { nombre: 'estructuras', indices: ['raiz'] },
    derivado: { nombre: 'derivados', indices: ['proyecto'] }
  };
  var RECURSOS = { nombre: 'recursos', indices: ['proyecto'] };
  var TIPOS = Object.keys(ALMACENES);

  function almacenDe(tipo) {
    var a = ALMACENES[tipo];
    if (!a) throw new Error('Tipo sin almacén: «' + tipo + '»');
    return a.nombre;
  }

  /* ───────────────────────── Motor en memoria ─────────────────────────
     Misma interfaz que el de IndexedDB. Guarda copias para que nadie
     pueda cambiar un dato guardado tocando el objeto que tiene en la mano. */

  function motorMemoria() {
    var datos = {};
    function tabla(n) { return (datos[n] = datos[n] || {}); }
    function copia(o) { return (o && o.blob) ? Object.assign({}, o) : EDU.clonar(o); }
    return {
      modo: 'memoria',
      poner: function (n, lista) {
        var t = tabla(n);
        lista.forEach(function (o) { t[o.id] = copia(o); });
        return Promise.resolve();
      },
      obtener: function (n, id) {
        var o = tabla(n)[id];
        return Promise.resolve(o ? copia(o) : null);
      },
      todos: function (n, campo, valor) {
        var t = tabla(n);
        var r = Object.keys(t).map(function (k) { return t[k]; });
        if (campo) r = r.filter(function (o) { return o[campo] === valor; });
        return Promise.resolve(r.map(copia));
      },
      quitar: function (n, id) { delete tabla(n)[id]; return Promise.resolve(); },
      contar: function (n) { return Promise.resolve(Object.keys(tabla(n)).length); },
      limpiar: function (n) { datos[n] = {}; return Promise.resolve(); }
    };
  }

  /* ───────────────────────── Motor IndexedDB ───────────────────────── */

  function pedir(req) {
    return new Promise(function (ok, mal) {
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { mal(req.error); };
    });
  }

  function motorIndexedDB(bd) {
    function transaccion(n, modo) { return bd.transaction(n, modo); }
    function terminar(tx) {
      return new Promise(function (ok, mal) {
        tx.oncomplete = function () { ok(); };
        tx.onerror = function () { mal(tx.error); };
        tx.onabort = function () { mal(tx.error || new Error('Transacción cancelada')); };
      });
    }
    return {
      modo: 'indexeddb',
      bd: bd,
      // Una sola transacción: o se guardan todos o ninguno.
      poner: function (n, lista) {
        var tx = transaccion(n, 'readwrite'), st = tx.objectStore(n);
        lista.forEach(function (o) { st.put(o); });
        return terminar(tx);
      },
      obtener: function (n, id) {
        return pedir(transaccion(n, 'readonly').objectStore(n).get(id)).then(function (o) { return o === undefined ? null : o; });
      },
      todos: function (n, campo, valor) {
        var st = transaccion(n, 'readonly').objectStore(n);
        if (campo && st.indexNames.contains(campo) && valor !== null && valor !== undefined) return pedir(st.index(campo).getAll(valor));
        return pedir(st.getAll()).then(function (r) {
          return campo ? r.filter(function (o) { return o[campo] === valor; }) : r;
        });
      },
      quitar: function (n, id) {
        var tx = transaccion(n, 'readwrite');
        tx.objectStore(n).delete(id);
        return terminar(tx);
      },
      contar: function (n) { return pedir(transaccion(n, 'readonly').objectStore(n).count()); },
      limpiar: function (n) {
        var tx = transaccion(n, 'readwrite');
        tx.objectStore(n).clear();
        return terminar(tx);
      }
    };
  }

  function abrirIndexedDB() {
    return new Promise(function (ok, mal) {
      var idb;
      try { idb = raiz.indexedDB; } catch (e) { idb = null; }
      if (!idb) { mal(new Error('IndexedDB no disponible')); return; }
      var req;
      try { req = idb.open(NOMBRE_BD, VERSION_BD); } catch (e) { mal(e); return; }
      req.onupgradeneeded = function () {
        var bd = req.result;
        TIPOS.map(function (t) { return ALMACENES[t]; }).concat([RECURSOS]).forEach(function (a) {
          if (bd.objectStoreNames.contains(a.nombre)) return;
          var st = bd.createObjectStore(a.nombre, { keyPath: 'id' });
          a.indices.forEach(function (i) { st.createIndex(i, i, { unique: false }); });
        });
      };
      req.onsuccess = function () {
        var bd = req.result;
        // Si otra pestaña abre una versión nueva, se cierra esta sin romper.
        bd.onversionchange = function () { bd.close(); EDU.aviso('aviso', 'almacen', 'La base de datos se actualizó en otra pestaña; recarga la página'); };
        ok(bd);
      };
      req.onerror = function () { mal(req.error); };
      req.onblocked = function () { EDU.aviso('aviso', 'almacen', 'Apertura bloqueada por otra pestaña abierta'); };
    });
  }

  /* ───────────────────────── Apertura ───────────────────────── */

  var motor = null;
  var abriendo = null;

  function abrir(opciones) {
    if (motor) return Promise.resolve(motor.modo);
    if (abriendo) return abriendo;
    opciones = opciones || {};
    var intento = opciones.memoria ? Promise.reject(new Error('Memoria pedida')) : abrirIndexedDB();
    abriendo = intento.then(function (bd) {
      motor = motorIndexedDB(bd);
      return motor.modo;
    }, function (e) {
      motor = motorMemoria();
      if (!opciones.memoria) EDU.aviso('aviso', 'almacen', 'Sin IndexedDB: los datos se guardan solo en memoria y se perderán al recargar', e && e.message);
      return motor.modo;
    }).then(function (modo) {
      abriendo = null;
      EDU.emitir('almacen:abierto', { modo: modo });
      return modo;
    });
    return abriendo;
  }

  function listo() { return motor ? Promise.resolve(motor) : abrir().then(function () { return motor; }); }

  function estado() {
    return { modo: motor ? motor.modo : 'cerrado', persistente: !!motor && motor.modo === 'indexeddb', bd: NOMBRE_BD, version: VERSION_BD };
  }

  /* ───────────────────────── Datos validados ───────────────────────── */

  function error(mensaje, errores) {
    var e = new Error(mensaje);
    e.errores = errores || [];
    return e;
  }

  // Valida una lista completa antes de escribir nada.
  function validarLista(tipo, lista) {
    var errores = [], avisos = [];
    lista.forEach(function (o, i) {
      var r = EDU.esquemas.validar(tipo, o);
      r.errores.forEach(function (e) { errores.push({ indice: i, id: o && o.id, campo: e.campo, mensaje: e.mensaje }); });
      r.avisos.forEach(function (a) { avisos.push({ indice: i, id: o && o.id, campo: a.campo, mensaje: a.mensaje }); });
    });
    return { errores: errores, avisos: avisos };
  }

  function guardarVarios(tipo, lista) {
    var n;
    try { n = almacenDe(tipo); } catch (e) { return Promise.reject(e); }
    if (!lista || !lista.length) return Promise.resolve({ ok: true, ids: [], avisos: [] });
    var r = validarLista(tipo, lista);
    if (r.errores.length) {
      EDU.aviso('aviso', 'almacen', 'Rechazado: ' + r.errores.length + ' error(es) en ' + tipo);
      return Promise.reject(error('Datos no válidos (' + tipo + ')', r.errores));
    }
    var copias = lista.map(function (o) { return EDU.clonar(o); });
    return listo().then(function (m) { return m.poner(n, copias); }).then(function () {
      var ids = copias.map(function (o) { return o.id; });
      EDU.emitir('almacen:guardado', { tipo: tipo, ids: ids });
      return { ok: true, ids: ids, avisos: r.avisos };
    });
  }

  function guardar(tipo, obj) {
    return guardarVarios(tipo, [obj]).then(function (r) { return { ok: true, id: r.ids[0], avisos: r.avisos }; });
  }

  function obtener(tipo, id) {
    var n;
    try { n = almacenDe(tipo); } catch (e) { return Promise.reject(e); }
    return listo().then(function (m) { return m.obtener(n, id); });
  }

  function listar(tipo, filtro) {
    var n;
    try { n = almacenDe(tipo); } catch (e) { return Promise.reject(e); }
    return listo().then(function (m) { return filtro ? m.todos(n, filtro.campo, filtro.valor) : m.todos(n); });
  }

  // Borrar no arrastra nada: la biblioteca decidirá qué hacer con las relaciones.
  function borrar(tipo, id) {
    var n;
    try { n = almacenDe(tipo); } catch (e) { return Promise.reject(e); }
    return listo().then(function (m) { return m.quitar(n, id); }).then(function () {
      EDU.emitir('almacen:borrado', { tipo: tipo, id: id });
      return true;
    });
  }

  function contar(tipo) {
    var n;
    try { n = almacenDe(tipo); } catch (e) { return Promise.reject(e); }
    return listo().then(function (m) { return m.contar(n); });
  }

  /* ───────────────────────── Recursos (imágenes) ─────────────────────────
     Se guarda el Blob tal cual, sin convertirlo: ocupa menos y no se degrada. */

  function esBlob(b) { return !!b && typeof b === 'object' && typeof b.size === 'number' && typeof b.type === 'string'; }

  function guardarRecurso(blob, meta) {
    if (!esBlob(blob)) return Promise.reject(error('El recurso debe ser un archivo (Blob)'));
    meta = meta || {};
    var r = {
      id: meta.id || EDU.id('rec'),
      nombre: meta.nombre || 'recurso',
      mime: blob.type || 'application/octet-stream',
      bytes: blob.size,
      proyecto: meta.proyecto || null,
      fuente: meta.fuente || null,
      creado: EDU.ahora(),
      blob: blob
    };
    return listo().then(function (m) { return m.poner(RECURSOS.nombre, [r]); }).then(function () {
      EDU.emitir('almacen:guardado', { tipo: 'recurso', ids: [r.id] });
      return { ok: true, id: r.id };
    });
  }

  function obtenerRecurso(id) { return listo().then(function (m) { return m.obtener(RECURSOS.nombre, id); }); }
  function listarRecursos(filtro) {
    return listo().then(function (m) { return filtro ? m.todos(RECURSOS.nombre, filtro.campo, filtro.valor) : m.todos(RECURSOS.nombre); });
  }
  function borrarRecurso(id) {
    return listo().then(function (m) { return m.quitar(RECURSOS.nombre, id); }).then(function () {
      EDU.emitir('almacen:borrado', { tipo: 'recurso', id: id });
      return true;
    });
  }

  /* ───────────────────────── Copia de seguridad ───────────────────────── */

  function blobABase64(blob) {
    return blob.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf), trozos = [], PASO = 0x8000;
      for (var i = 0; i < bytes.length; i += PASO) trozos.push(String.fromCharCode.apply(null, bytes.subarray(i, i + PASO)));
      return raiz.btoa(trozos.join(''));
    });
  }

  function base64ABlob(b64, mime) {
    var bin = raiz.atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new raiz.Blob([bytes], { type: mime });
  }

  /* opciones.recursos === true incluye las imágenes en base64 (la copia
     puede pesar mucho). Por defecto solo van sus datos, sin el archivo. */
  function exportar(opciones) {
    opciones = opciones || {};
    var copia = { formato: FORMATO_COPIA, version: VERSION_BD, esquema: EDU.esquemas.VERSION, fecha: EDU.ahora(), datos: {}, recursos: [] };
    return listo().then(function (m) {
      return Promise.all(TIPOS.map(function (t) {
        return m.todos(almacenDe(t)).then(function (lista) { copia.datos[t] = lista; });
      })).then(function () { return m.todos(RECURSOS.nombre); });
    }).then(function (recs) {
      return Promise.all(recs.map(function (r) {
        var sinBlob = { id: r.id, nombre: r.nombre, mime: r.mime, bytes: r.bytes, proyecto: r.proyecto, fuente: r.fuente, creado: r.creado };
        if (!opciones.recursos || !esBlob(r.blob)) return sinBlob;
        return blobABase64(r.blob).then(function (b64) { sinBlob.base64 = b64; return sinBlob; });
      }));
    }).then(function (recs) {
      copia.recursos = recs;
      return copia;
    });
  }

  /* opciones.modo: 'combinar' (por defecto; lo que ya existe con el mismo
     id se sustituye) o 'reemplazar' (vacía todo antes). Se valida la copia
     COMPLETA antes de escribir: si algo falla no se toca nada. */
  function importar(copia, opciones) {
    opciones = opciones || {};
    var modo = opciones.modo === 'reemplazar' ? 'reemplazar' : 'combinar';
    if (!copia || copia.formato !== FORMATO_COPIA || typeof copia.datos !== 'object') {
      return Promise.reject(error('El archivo no es una copia de este sistema'));
    }
    if (copia.esquema > EDU.esquemas.VERSION) {
      return Promise.reject(error('La copia es de una versión más nueva del sistema (' + copia.esquema + ')'));
    }
    var errores = [], avisos = [], cuenta = {};
    TIPOS.forEach(function (t) {
      var lista = copia.datos[t] || [];
      var r = validarLista(t, lista);
      r.errores.forEach(function (e) { e.tipo = t; errores.push(e); });
      r.avisos.forEach(function (a) { a.tipo = t; avisos.push(a); });
      cuenta[t] = lista.length;
    });
    if (errores.length) return Promise.reject(error('La copia tiene ' + errores.length + ' dato(s) no válidos; no se ha importado nada', errores));
    var recs = (copia.recursos || []).filter(function (r) { return r && r.id && r.base64; });
    return listo().then(function (m) {
      var previo = modo === 'reemplazar' ? vaciarTodo(m) : Promise.resolve();
      return previo.then(function () {
        return Promise.all(TIPOS.map(function (t) {
          var lista = copia.datos[t] || [];
          return lista.length ? m.poner(almacenDe(t), lista.map(EDU.clonar)) : null;
        }));
      }).then(function () {
        if (!recs.length) return null;
        return m.poner(RECURSOS.nombre, recs.map(function (r) {
          return { id: r.id, nombre: r.nombre, mime: r.mime, bytes: r.bytes, proyecto: r.proyecto || null, fuente: r.fuente || null, creado: r.creado, blob: base64ABlob(r.base64, r.mime) };
        }));
      });
    }).then(function () {
      var informe = { ok: true, modo: modo, cuenta: cuenta, recursos: recs.length, avisos: avisos };
      EDU.emitir('almacen:importado', informe);
      return informe;
    });
  }

  function vaciarTodo(m) {
    return Promise.all(TIPOS.map(function (t) { return m.limpiar(almacenDe(t)); }).concat([m.limpiar(RECURSOS.nombre)]));
  }

  // Borra TODO. Exige confirmación explícita para que no ocurra por error.
  function vaciar(opciones) {
    if (!opciones || opciones.confirmar !== true) return Promise.reject(error('Vaciar exige { confirmar: true }'));
    return listo().then(vaciarTodo).then(function () {
      EDU.emitir('almacen:vaciado', {});
      return true;
    });
  }

  /* ───────────────────────── Preferencias (localStorage) ─────────────────────────
     Solo valores pequeños: idioma, último proyecto, pestaña… Nunca contenido. */

  var prefMemoria = {};

  function pref(clave, valor) {
    var k = PREFIJO_PREF + clave;
    var ls = null;
    try { ls = raiz.localStorage || null; } catch (e) { ls = null; }
    if (arguments.length < 2) {
      try {
        var t = ls ? ls.getItem(k) : (k in prefMemoria ? prefMemoria[k] : null);
        return t === null || t === undefined ? null : JSON.parse(t);
      } catch (e) { return null; }
    }
    var texto = JSON.stringify(valor === undefined ? null : valor);
    try {
      if (valor === null || valor === undefined) { if (ls) ls.removeItem(k); delete prefMemoria[k]; }
      else if (ls) ls.setItem(k, texto);
      else prefMemoria[k] = texto;
      return true;
    } catch (e) {
      prefMemoria[k] = texto;
      EDU.aviso('aviso', 'almacen', 'No se pudo guardar la preferencia «' + clave + '» en localStorage', e && e.message);
      return false;
    }
  }

  EDU.almacen = {
    abrir: abrir,
    estado: estado,
    tipos: function () { return TIPOS.slice(); },
    guardar: guardar,
    guardarVarios: guardarVarios,
    obtener: obtener,
    listar: listar,
    borrar: borrar,
    contar: contar,
    guardarRecurso: guardarRecurso,
    obtenerRecurso: obtenerRecurso,
    listarRecursos: listarRecursos,
    borrarRecurso: borrarRecurso,
    exportar: exportar,
    importar: importar,
    vaciar: vaciar,
    pref: pref
  };

  EDU.registrar('almacen', EDU.almacen, { requiere: ['base', 'esquemas'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
