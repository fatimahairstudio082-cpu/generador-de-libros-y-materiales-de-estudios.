/* edu_biblioteca.js — biblioteca de conocimiento estructurada y creciente.
   Módulo 4 de la fase 1. Requiere edu_base, edu_esquemas y edu_almacen.

   Organiza el conocimiento por materia → nivel → tema → subtema. Crece
   añadiendo paquetes de datos (datos/biblioteca/*.json), sin tocar código.
   No conoce ninguna materia: todo lo que sabe llega en los paquetes.

   Formato de paquete «edu-paquete» v1: fuentes, ramas, ucs y relaciones
   escritas con claves locales legibles («evaporacion», «tema»…). Aquí se
   convierten en ids estables, así que cargar dos veces el mismo paquete
   no duplica nada.

     EDU.biblioteca.cargarPaquete(paq)          → Promise<informe>
     EDU.biblioteca.cargarDesdeURL(url) / cargarIndice(url?)
     EDU.biblioteca.arbol() / hijas(padreId) / ruta(ramaId)
     EDU.biblioteca.obtener(id) / ucsDeRama(ramaId, {subramas}) / buscar(texto, filtro)
     EDU.biblioteca.relaciones(ucId, {tipo, sentido}) / vecinos(ucId)
     EDU.biblioteca.anadirUC(datos) / borrarUC(id) / quitarPaquete(id)
     EDU.biblioteca.cobertura(ramaId) / estadisticas() */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base || !EDU.esquemas || !EDU.almacen) { if (raiz.console) raiz.console.error('[biblioteca] Faltan edu_base, edu_esquemas o edu_almacen'); return; }
  if (EDU.biblioteca) return;

  var E = EDU.esquemas, A = EDU.almacen;
  var FORMATO = 'edu-paquete';
  var INDICE = 'datos/biblioteca/indice.json';

  function error(mensaje, errores) {
    var e = new Error(mensaje);
    e.errores = errores || [];
    return e;
  }

  function esLista(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

  /* ───────────────────────── Carga de paquetes ───────────────────────── */

  /* Convierte el paquete en objetos del sistema sin escribir nada.
     Devuelve { objetos:{fuente,rama,uc,relacion}, errores, externos }.
     externos: ids que el paquete cita y que deben existir ya en el almacén. */
  function traducir(paq) {
    var errores = [], externos = { fuente: [], rama: [], uc: [] };
    var objetos = { fuente: [], rama: [], uc: [], relacion: [] };
    var mapa = { fuente: {}, rama: {}, uc: {} };
    var nivelDeRama = {};
    var claveDe = {};   // id del objeto → clave del paquete, para los mensajes de error

    function err(donde, clave, mensaje) { errores.push({ donde: donde, clave: clave, mensaje: mensaje }); }

    function registrarClave(tipo, donde, o) {
      if (!o || typeof o.clave !== 'string' || !o.clave.trim()) { err(donde, '', 'Falta «clave»'); return false; }
      if (mapa[tipo][o.clave]) { err(donde, o.clave, 'Clave repetida'); return false; }
      return true;
    }

    // Una referencia es una clave del paquete o un id ya existente (prefijo del tipo).
    function resolver(tipo, prefijo, valor, donde, clave) {
      if (valor === undefined || valor === null || valor === '') return null;
      if (mapa[tipo][valor]) return mapa[tipo][valor];
      if (typeof valor === 'string' && valor.indexOf(prefijo + '_') === 0) { externos[tipo].push(valor); return valor; }
      err(donde, clave, 'Referencia desconocida: «' + valor + '»');
      return null;
    }

    (paq.fuentes || []).forEach(function (f) {
      if (!registrarClave('fuente', 'fuentes', f)) return;
      var o = E.crear('fuente', { clase: f.clase, titulo: f.titulo, autor: f.autor, anio: f.anio, url: f.url, licencia: f.licencia, nota: f.nota });
      o.paquete = paq.id;
      mapa.fuente[f.clave] = o.id;
      claveDe[o.id] = f.clave;
      objetos.fuente.push(o);
    });

    // Las ramas se leen en orden: el padre debe aparecer antes (o existir ya).
    (paq.ramas || []).forEach(function (r) {
      if (!registrarClave('rama', 'ramas', r)) return;
      var padre = resolver('rama', 'rama', r.padre, 'ramas', r.clave);
      var o = E.crear('rama', { clase: r.clase, nombre: r.nombre, padre: padre, orden: typeof r.orden === 'number' ? r.orden : 0, nivel: r.nivel });
      if (typeof r.disenos === 'string' && r.disenos) o.disenos = r.disenos;   // categoría de diseños de láminas afín (opcional)
      o.paquete = paq.id;
      mapa.rama[r.clave] = o.id;
      claveDe[o.id] = r.clave;
      nivelDeRama[o.id] = r.nivel || (padre && nivelDeRama[padre]) || null;
      objetos.rama.push(o);
    });

    (paq.ucs || []).forEach(function (u) {
      if (!registrarClave('uc', 'ucs', u)) return;
      var rama = resolver('rama', 'rama', u.rama, 'ucs', u.clave);
      var fuente = resolver('fuente', 'fue', u.fuente || (paq.fuentes && paq.fuentes.length === 1 ? paq.fuentes[0].clave : null), 'ucs', u.clave);
      var niveles = esLista(u.niveles) && u.niveles.length ? u.niveles.slice() : (rama && nivelDeRama[rama] ? [nivelDeRama[rama]] : []);
      var o = E.crear('uc', {
        tipo: u.tipo, titulo: u.titulo, texto: u.texto || '', campos: u.campos || {},
        rama: rama, niveles: niveles, fuente: fuente, origen: 'biblioteca',
        idioma: u.idioma || paq.idioma || 'es', etiquetas: esLista(u.etiquetas) ? u.etiquetas.slice() : []
      });
      o.paquete = paq.id;
      mapa.uc[u.clave] = o.id;
      claveDe[o.id] = u.clave;
      objetos.uc.push(o);
    });

    (paq.relaciones || []).forEach(function (r, i) {
      var nombre = r && (r.de + ' → ' + r.a);
      var de = resolver('uc', 'uc', r && r.de, 'relaciones[' + i + ']', nombre);
      var a = resolver('uc', 'uc', r && r.a, 'relaciones[' + i + ']', nombre);
      if (!de || !a) return;
      var o = E.crear('relacion', { tipo: r.tipo, de: de, a: a, fuente: null, origen: 'biblioteca', nota: r.nota });
      o.paquete = paq.id;
      claveDe[o.id] = nombre;
      objetos.relacion.push(o);
    });

    // Validación completa con los esquemas, indicando la clave del paquete.
    ['fuente', 'rama', 'uc', 'relacion'].forEach(function (t) {
      objetos[t].forEach(function (o) {
        var r = E.validar(t, o);
        r.errores.forEach(function (e) { err(t, claveDe[o.id] || o.id, e.campo + ': ' + e.mensaje); });
      });
    });

    return { objetos: objetos, errores: errores, externos: externos };
  }

  function comprobarExternos(externos) {
    var faltan = [];
    var pedidos = [];
    externos.fuente.forEach(function (id) { pedidos.push(A.obtener('fuente', id).then(function (o) { if (!o) faltan.push(id); })); });
    externos.rama.forEach(function (id) { pedidos.push(A.obtener('rama', id).then(function (o) { if (!o) faltan.push(id); })); });
    externos.uc.forEach(function (id) { pedidos.push(A.obtener('uc', id).then(function (o) { if (!o) faltan.push(id); })); });
    return Promise.all(pedidos).then(function () { return faltan; });
  }

  /* Valida TODO antes de escribir. Si algo falla, no se guarda nada.
     La escritura va por tipos (fuentes → ramas → ucs → relaciones). */
  function cargarPaquete(paq) {
    if (!paq || paq.formato !== FORMATO) return Promise.reject(error('No es un paquete de biblioteca (formato «' + FORMATO + '»)'));
    if (typeof paq.id !== 'string' || !paq.id.trim()) return Promise.reject(error('El paquete necesita «id»'));
    if (!esLista(paq.ramas) || !esLista(paq.ucs)) return Promise.reject(error('El paquete necesita listas «ramas» y «ucs»'));
    var t = traducir(paq);
    if (t.errores.length) {
      EDU.aviso('aviso', 'biblioteca', 'Paquete «' + paq.id + '» rechazado: ' + t.errores.length + ' error(es)');
      return Promise.reject(error('El paquete «' + paq.id + '» tiene errores; no se ha cargado nada', t.errores));
    }
    return comprobarExternos(t.externos).then(function (faltan) {
      if (faltan.length) throw error('El paquete cita datos que no existen en la biblioteca', faltan.map(function (id) { return { donde: 'externo', clave: id, mensaje: 'No existe' }; }));
      var avisos = [];
      function guardar(tipo) {
        return A.guardarVarios(tipo, t.objetos[tipo]).then(function (r) { avisos = avisos.concat(r.avisos); });
      }
      return guardar('fuente').then(function () { return guardar('rama'); })
        .then(function () { return guardar('uc'); })
        .then(function () { return guardar('relacion'); });
    }).then(function () {
      var informe = {
        ok: true, paquete: paq.id, titulo: paq.titulo || paq.id,
        cuenta: { fuentes: t.objetos.fuente.length, ramas: t.objetos.rama.length, ucs: t.objetos.uc.length, relaciones: t.objetos.relacion.length }
      };
      EDU.emitir('biblioteca:paquete', informe);
      EDU.emitir('biblioteca:cambio', { motivo: 'paquete', paquete: paq.id });
      return informe;
    });
  }

  function leerJSON(url) {
    if (typeof raiz.fetch !== 'function') return Promise.reject(error('Este entorno no puede descargar archivos (sin fetch)'));
    return raiz.fetch(url).then(function (r) {
      if (!r.ok) throw error('No se pudo leer «' + url + '» (' + r.status + ')');
      return r.json();
    });
  }

  function cargarDesdeURL(url) { return leerJSON(url).then(cargarPaquete); }

  // Carga en orden todos los paquetes del índice. Uno roto no impide los demás.
  function cargarIndice(url) {
    url = url || INDICE;
    var base = url.replace(/[^\/]*$/, '');
    return leerJSON(url).then(function (ind) {
      if (!ind || ind.formato !== 'edu-indice' || !esLista(ind.paquetes)) throw error('«' + url + '» no es un índice de biblioteca');
      var informes = [];
      return ind.paquetes.reduce(function (p, archivo) {
        return p.then(function () {
          return cargarDesdeURL(base + archivo).then(function (inf) { informes.push(inf); }, function (e) {
            informes.push({ ok: false, archivo: archivo, mensaje: e.message, errores: e.errores || [] });
          });
        });
      }, Promise.resolve()).then(function () { return informes; });
    });
  }

  /* ───────────────────────── Árbol de ramas ───────────────────────── */

  function porOrden(a, b) { return (a.orden - b.orden) || (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0); }

  function hijas(padreId) {
    return A.listar('rama', { campo: 'padre', valor: padreId || null }).then(function (l) { return l.sort(porOrden); });
  }

  // Árbol completo con el número de unidades de cada rama (propias y total con subramas).
  function arbol() {
    return Promise.all([A.listar('rama'), A.listar('uc')]).then(function (r) {
      var ramas = r[0], ucs = r[1], nodos = {};
      ramas.forEach(function (x) { nodos[x.id] = { id: x.id, clase: x.clase, nombre: x.nombre, nivel: x.nivel || null, orden: x.orden, propias: 0, total: 0, hijas: [] }; });
      ucs.forEach(function (u) { if (u.rama && nodos[u.rama]) nodos[u.rama].propias++; });
      var raices = [];
      ramas.forEach(function (x) {
        if (x.padre && nodos[x.padre]) nodos[x.padre].hijas.push(nodos[x.id]);
        else raices.push(nodos[x.id]);
      });
      function sumar(n) { n.hijas.sort(porOrden); n.total = n.propias + n.hijas.reduce(function (s, h) { return s + sumar(h); }, 0); return n.total; }
      raices.sort(porOrden).forEach(sumar);
      return raices;
    });
  }

  // De la materia a la rama pedida: [materia, nivel, tema, subtema].
  function ruta(ramaId) {
    var camino = [], vistos = {};
    function subir(id) {
      if (!id || vistos[id]) return Promise.resolve(camino);
      vistos[id] = true;
      return A.obtener('rama', id).then(function (r) {
        if (!r) return camino;
        camino.unshift(r);
        return subir(r.padre);
      });
    }
    return subir(ramaId);
  }

  function descendientes(ramaId, ramas) {
    var ids = [ramaId], i = 0;
    while (i < ids.length) {
      var actual = ids[i++];
      ramas.forEach(function (r) { if (r.padre === actual && ids.indexOf(r.id) < 0) ids.push(r.id); });
    }
    return ids;
  }

  /* ───────────────────────── Consultas de unidades ───────────────────────── */

  function obtener(id) { return A.obtener('uc', id); }

  function ucsDeRama(ramaId, opciones) {
    opciones = opciones || {};
    if (opciones.subramas === false) return A.listar('uc', { campo: 'rama', valor: ramaId });
    return Promise.all([A.listar('rama'), A.listar('uc')]).then(function (r) {
      var ids = descendientes(ramaId, r[0]);
      return r[1].filter(function (u) { return ids.indexOf(u.rama) >= 0; });
    });
  }

  /* Búsqueda sin tildes ni mayúsculas. Filtros: nivel, tipo, rama (incluye subramas).
     Orden: título que empieza por el texto, título que lo contiene, texto que lo contiene. */
  function buscar(texto, filtro) {
    filtro = filtro || {};
    var q = EDU.normalizar(texto);
    var pedirRamas = filtro.rama ? A.listar('rama') : Promise.resolve(null);
    return Promise.all([A.listar('uc'), pedirRamas]).then(function (r) {
      var ucs = r[0];
      if (filtro.rama) { var ids = descendientes(filtro.rama, r[1]); ucs = ucs.filter(function (u) { return ids.indexOf(u.rama) >= 0; }); }
      if (filtro.tipo) ucs = ucs.filter(function (u) { return u.tipo === filtro.tipo; });
      if (filtro.nivel) ucs = ucs.filter(function (u) { return (u.niveles || []).indexOf(filtro.nivel) >= 0; });
      var puntuadas = ucs.map(function (u) {
        var t = EDU.normalizar(u.titulo), c = EDU.normalizar(u.texto);
        var p = !q ? 1 : t.indexOf(q) === 0 ? 3 : t.indexOf(q) > 0 ? 2 : c.indexOf(q) >= 0 ? 1 : 0;
        return { u: u, p: p };
      }).filter(function (x) { return x.p > 0; });
      puntuadas.sort(function (a, b) { return (b.p - a.p) || (a.u.titulo < b.u.titulo ? -1 : 1); });
      return puntuadas.map(function (x) { return x.u; });
    });
  }

  /* ───────────────────────── Relaciones ───────────────────────── */

  // sentido: 'salida' (la UC es «de»), 'entrada' (es «a») o 'ambos' (por defecto).
  function relaciones(ucId, opciones) {
    opciones = opciones || {};
    var sentido = opciones.sentido || 'ambos';
    var pedidos = [
      sentido !== 'entrada' ? A.listar('relacion', { campo: 'de', valor: ucId }) : Promise.resolve([]),
      sentido !== 'salida' ? A.listar('relacion', { campo: 'a', valor: ucId }) : Promise.resolve([])
    ];
    return Promise.all(pedidos).then(function (r) {
      var todas = r[0].concat(r[1].filter(function (x) { return x.de !== x.a; }));
      return opciones.tipo ? todas.filter(function (x) { return x.tipo === opciones.tipo; }) : todas;
    });
  }

  /* Unidades conectadas, con la relación leída desde esta UC:
     «evaporación parte_de ciclo» visto desde el ciclo es «tiene_parte evaporación». */
  function vecinos(ucId) {
    return relaciones(ucId).then(function (rels) {
      return Promise.all(rels.map(function (r) {
        var salida = r.de === ucId;
        var reglas = E.relacion(r.tipo) || {};
        var otro = salida ? r.a : r.de;
        return A.obtener('uc', otro).then(function (u) {
          return { relacion: r, sentido: salida ? 'salida' : 'entrada', lectura: salida || reglas.simetrica ? r.tipo : reglas.inversa, uc: u };
        });
      }));
    }).then(function (l) { return l.filter(function (v) { return v.uc; }); });
  }

  /* ───────────────────────── Altas y bajas ───────────────────────── */

  function anadirUC(datos) {
    var o = E.crear('uc', datos || {});
    return A.guardar('uc', o).then(function (r) {
      EDU.emitir('biblioteca:cambio', { motivo: 'alta', id: o.id });
      return { ok: true, id: o.id, avisos: r.avisos };
    });
  }

  // Borra la unidad y todas sus relaciones, para no dejar relaciones colgando.
  function borrarUC(id) {
    return relaciones(id).then(function (rels) {
      return Promise.all(rels.map(function (r) { return A.borrar('relacion', r.id); }));
    }).then(function (quitadas) {
      return A.borrar('uc', id).then(function () {
        EDU.emitir('biblioteca:cambio', { motivo: 'baja', id: id });
        return { ok: true, relaciones: quitadas.length };
      });
    });
  }

  /* Quita lo que trajo un paquete. Las ramas solo se borran si quedan vacías
     (sin unidades ni subramas): una materia compartida con otro paquete se conserva. */
  function quitarPaquete(paqueteId) {
    var cuenta = { ucs: 0, relaciones: 0, fuentes: 0, ramas: 0 };
    function delPaquete(o) { return o.paquete === paqueteId; }
    return A.listar('relacion').then(function (rels) {
      var mias = rels.filter(delPaquete);
      cuenta.relaciones = mias.length;
      return Promise.all(mias.map(function (r) { return A.borrar('relacion', r.id); }));
    }).then(function () { return A.listar('uc'); }).then(function (ucs) {
      var mias = ucs.filter(delPaquete);
      cuenta.ucs = mias.length;
      return Promise.all(mias.map(function (u) { return borrarUC(u.id); }));
    }).then(function () { return Promise.all([A.listar('fuente'), A.listar('uc')]); }).then(function (r) {
      // Una fuente compartida con otro paquete se conserva mientras alguna UC la cite.
      var citadas = {};
      r[1].forEach(function (u) { if (u.fuente) citadas[u.fuente] = true; });
      var mias = r[0].filter(function (f) { return delPaquete(f) && !citadas[f.id]; });
      cuenta.fuentes = mias.length;
      return Promise.all(mias.map(function (f) { return A.borrar('fuente', f.id); }));
    }).then(function podar() {
      return Promise.all([A.listar('rama'), A.listar('uc')]).then(function (r) {
        var ramas = r[0], ucs = r[1];
        var vacias = ramas.filter(function (x) {
          return delPaquete(x) &&
            !ramas.some(function (h) { return h.padre === x.id; }) &&
            !ucs.some(function (u) { return u.rama === x.id; });
        });
        if (!vacias.length) return null;
        cuenta.ramas += vacias.length;
        return Promise.all(vacias.map(function (x) { return A.borrar('rama', x.id); })).then(podar);
      });
    }).then(function () {
      EDU.emitir('biblioteca:cambio', { motivo: 'quitar', paquete: paqueteId });
      return { ok: true, paquete: paqueteId, cuenta: cuenta };
    });
  }

  /* ───────────────────────── Cobertura y estadísticas ───────────────────────── */

  // Cuánto conocimiento hay bajo una rama. Es la base del indicador de cobertura.
  function cobertura(ramaId) {
    return Promise.all([A.listar('rama'), A.listar('uc'), A.listar('relacion')]).then(function (r) {
      var ids = descendientes(ramaId, r[0]);
      var ucs = r[1].filter(function (u) { return ids.indexOf(u.rama) >= 0; });
      var dentro = {};
      ucs.forEach(function (u) { dentro[u.id] = true; });
      var porTipo = {};
      ucs.forEach(function (u) { porTipo[u.tipo] = (porTipo[u.tipo] || 0) + 1; });
      return {
        rama: ramaId,
        ramas: ids.length,
        ucs: ucs.length,
        porTipo: porTipo,
        relaciones: r[2].filter(function (x) { return dentro[x.de] && dentro[x.a]; }).length,
        sinFuente: ucs.filter(function (u) { return !u.fuente; }).length
      };
    });
  }

  function estadisticas() {
    return Promise.all(['rama', 'fuente', 'uc', 'relacion'].map(function (t) { return A.contar(t); })).then(function (n) {
      return { ramas: n[0], fuentes: n[1], ucs: n[2], relaciones: n[3] };
    });
  }

  EDU.biblioteca = {
    cargarPaquete: cargarPaquete,
    cargarDesdeURL: cargarDesdeURL,
    cargarIndice: cargarIndice,
    arbol: arbol,
    hijas: hijas,
    ruta: ruta,
    obtener: obtener,
    ucsDeRama: ucsDeRama,
    buscar: buscar,
    relaciones: relaciones,
    vecinos: vecinos,
    anadirUC: anadirUC,
    borrarUC: borrarUC,
    quitarPaquete: quitarPaquete,
    cobertura: cobertura,
    estadisticas: estadisticas
  };

  EDU.registrar('biblioteca', EDU.biblioteca, { requiere: ['base', 'esquemas', 'almacen'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
