/* edu_expansor.js — Motor de Expansión de Contenido.
   Módulo 7 de la fase 1. Requiere edu_base, edu_esquemas, edu_almacen y edu_biblioteca.

   Convierte una unidad de conocimiento en una estructura educativa
   reutilizable: concepto, subconceptos, definiciones, relaciones,
   ejemplos, procedimientos, preguntas, ejercicios, repasos y
   visualizaciones.

   REGLA ESTRICTA — NO INVENTAR
     · Cada pieza COPIA datos que existen (títulos, textos, pasos, fechas,
       expresiones) y dice en «desde» de qué UC y relaciones salen.
     · Si falta un dato que se esperaba (una definición, un ejemplo), se
       crea una pieza «pendiente» con una nota. Nunca un texto de relleno.
     · Las preguntas y los ejercicios son ESPECIFICACIONES: qué se pregunta
       y cuál es la respuesta, ambas tomadas de los datos. No llevan
       enunciado redactado (eso es del redactor) ni valores nuevos (eso
       será de los generadores de cada dominio).
     · auditar(estructura) comprueba que todo lo copiado coincide con su
       origen y que todo origen existe.

   La expansión es determinista: los mismos datos dan la misma estructura.
   La semilla solo se guarda para el módulo de variación.

     EDU.expansor.expandir(ucId, opciones)      → Promise<estructura>
     EDU.expansor.expandirRama(ramaId, opciones) → Promise<[estructura]>
     EDU.expansor.guardar(estructura)           → Promise
     EDU.expansor.auditar(estructura)           → Promise<{ ok, problemas }>
     EDU.expansor.resumen(estructura)           → { total, con_respaldo, parcial, pendiente, cobertura, porClase }
   opciones: { nivel, profundidad, semilla } */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base || !EDU.esquemas || !EDU.almacen || !EDU.biblioteca) { if (raiz.console) raiz.console.error('[expansor] Faltan edu_base, edu_esquemas, edu_almacen o edu_biblioteca'); return; }
  if (EDU.expansor) return;

  var E = EDU.esquemas, A = EDU.almacen, B = EDU.biblioteca;

  // Profundidad de subconceptos según el nivel (se puede forzar con opciones.profundidad).
  var PROFUNDIDAD = { infantil: 1, primaria: 2, secundaria: 3, bachillerato: 3, fp: 3, universidad: 4, profesional: 4 };

  // Lecturas (desde la UC que se expande) que abren subconceptos.
  var HIJAS = { tiene_parte: true, tiene_tipo: true };
  // Tipos de UC de los que se espera definición y ejemplo.
  var ESPERA_DEFINICION = { concepto: true };
  var ESPERA_EJEMPLO = { concepto: true, procedimiento: true };

  function porTitulo(a, b) { return String(a.titulo).localeCompare(String(b.titulo), 'es'); }

  /* ───────────────────────── Recogida del subgrafo ───────────────────────── */

  // ¿La UC sirve para este nivel? Sin niveles: sí. Con niveles: si alguno no supera el pedido.
  function aptaParaNivel(uc, nivel) {
    if (!nivel || !uc.niveles || !uc.niveles.length) return true;
    return uc.niveles.some(function (n) { var c = E.compararNivel(n, nivel); return !isNaN(c) && c <= 0; });
  }

  /* Recorre desde la raíz. Devuelve:
       nodos:   id → { uc, prof, rol:'raiz'|'sub'|'satelite', via, padre }
       orden:   ids en orden de recorrido (determinista)
       rels:    id → relación (solo entre UC aceptadas o hacia fuera)
       fuera:   id → UC externa citada por una relación (se copia su título)
       excluidas: UC descartadas por nivel */
  function recoger(raizUC, nivel, maxProf) {
    var nodos = {}, orden = [], rels = {}, fuera = {}, excluidas = [];
    nodos[raizUC.id] = { uc: raizUC, prof: 0, rol: 'raiz', via: null, padre: null };
    orden.push(raizUC.id);
    var cola = [raizUC.id];

    function paso() {
      if (!cola.length) return Promise.resolve();
      var id = cola.shift(), nodo = nodos[id];
      return B.vecinos(id).then(function (vec) {
        vec.sort(function (x, y) { return (x.lectura < y.lectura ? -1 : x.lectura > y.lectura ? 1 : 0) || porTitulo(x.uc, y.uc); });
        vec.forEach(function (v) {
          var otro = v.uc, r = v.relacion;
          if (!aptaParaNivel(otro, nivel)) { if (excluidas.indexOf(otro.id) < 0) excluidas.push(otro.id); return; }
          rels[r.id] = r;
          if (nodos[otro.id]) return;
          var abreHija = HIJAS[v.lectura] && nodo.rol !== 'satelite' && nodo.prof < maxProf;
          if (abreHija) {
            nodos[otro.id] = { uc: otro, prof: nodo.prof + 1, rol: 'sub', via: r, padre: id };
            orden.push(otro.id);
            cola.push(otro.id);
          } else if (nodo.rol !== 'satelite' && (v.lectura === 'tiene_ejemplo' || v.lectura === 'definido_por' || v.lectura === 'tiene_propiedad')) {
            nodos[otro.id] = { uc: otro, prof: nodo.prof + 1, rol: 'satelite', via: r, padre: id };
            orden.push(otro.id);
          } else {
            fuera[otro.id] = otro;
          }
        });
        return paso();
      });
    }
    return paso().then(function () {
      // Una UC externa que acabó dentro del subgrafo ya no es externa.
      Object.keys(fuera).forEach(function (k) { if (nodos[k]) delete fuera[k]; });
      return { nodos: nodos, orden: orden, rels: rels, fuera: fuera, excluidas: excluidas };
    });
  }

  /* ───────────────────────── Construcción de piezas ───────────────────────── */

  function copiaUC(u) {
    var o = { uc: u.id, titulo: u.titulo, tipo: u.tipo };
    if (u.texto) o.texto = u.texto;
    if (u.campos && u.campos.fecha) o.fecha = u.campos.fecha;
    if (u.campos && u.campos.expresion) o.expresion = u.campos.expresion;
    if (u.campos && u.campos.pasos) o.pasos = u.campos.pasos.slice();
    if (u.campos && u.campos.autor) o.autor = u.campos.autor;
    return o;
  }

  function pieza(clase, estado, desde, datos, nota) {
    var unicos = [];
    (desde || []).forEach(function (d) { if (d && unicos.indexOf(d) < 0) unicos.push(d); });
    var clave = clase + '|' + (datos && datos.modo ? datos.modo + '|' : '') + (datos && datos.forma ? datos.forma + '|' : '') + unicos.slice().sort().join(',');
    var p = E.crear('pieza', { id: 'pz_' + EDU.hash(clave), clase: clase, estado: estado, desde: unicos, datos: datos || {} });
    if (nota) p.nota = nota;
    return p;
  }

  // Orden topológico de «antes_de» entre UC del subgrafo. null si hay ciclo o no hay cadena.
  function cadenaTemporal(ids, rels) {
    var dentro = {}, entra = {}, sale = {}, usadas = [];
    ids.forEach(function (id) { dentro[id] = true; entra[id] = 0; sale[id] = []; });
    Object.keys(rels).forEach(function (k) {
      var r = rels[k];
      if (r.tipo === 'antes_de' && dentro[r.de] && dentro[r.a]) { sale[r.de].push(r.a); entra[r.a]++; usadas.push(r.id); }
    });
    if (!usadas.length) return null;
    var implicados = ids.filter(function (id) { return sale[id].length || entra[id]; });
    var libres = implicados.filter(function (id) { return !entra[id]; }), res = [];
    while (libres.length) {
      libres.sort();
      var n = libres.shift();
      res.push(n);
      sale[n].forEach(function (m) { if (--entra[m] === 0) libres.push(m); });
    }
    if (res.length !== implicados.length) return { ciclo: true };
    return { orden: res, rels: usadas };
  }

  function construir(g, raizUC, opciones) {
    var piezas = [], avisos = [];
    var ucsDe = function (id) { return g.nodos[id] ? g.nodos[id].uc : g.fuera[id]; };
    var principales = g.orden.filter(function (id) { return g.nodos[id].rol !== 'satelite'; });

    function relDe(filtro) {
      return Object.keys(g.rels).map(function (k) { return g.rels[k]; }).filter(filtro)
        .sort(function (x, y) { return x.id < y.id ? -1 : 1; });
    }

    // 1 · Concepto y subconceptos
    principales.forEach(function (id) {
      var n = g.nodos[id], d = copiaUC(n.uc);
      d.profundidad = n.prof;
      if (n.via) { d.via = n.via.tipo; d.padre = n.padre; }
      piezas.push(pieza(n.rol === 'raiz' ? 'concepto' : 'subconcepto', 'con_respaldo', [id, n.via && n.via.id], d));
    });

    // 2 · Definiciones (texto propio o UC de tipo definición que la define)
    principales.forEach(function (id) {
      var u = g.nodos[id].uc;
      if (!ESPERA_DEFINICION[u.tipo]) return;
      var defs = relDe(function (r) { return r.tipo === 'define' && r.a === id && g.nodos[r.de]; });
      if (u.texto) piezas.push(pieza('definicion', 'con_respaldo', [id], { uc: id, titulo: u.titulo, texto: u.texto }));
      defs.forEach(function (r) {
        var du = g.nodos[r.de].uc;
        var dd = { uc: du.id, de: id, titulo: du.titulo };
        if (du.texto) dd.texto = du.texto;
        piezas.push(pieza('definicion', du.texto ? 'con_respaldo' : 'pendiente', [du.id, r.id, id], dd));
      });
      if (!u.texto && !defs.length) piezas.push(pieza('definicion', 'pendiente', [id], { de: { uc: id, titulo: u.titulo } }, 'Falta la definición de «' + u.titulo + '»'));
    });

    // 3 · Relaciones (con los títulos copiados de ambos extremos)
    relDe(function () { return true; }).forEach(function (r) {
      var de = ucsDe(r.de), a = ucsDe(r.a);
      if (!de || !a) return;
      var reglas = E.relacion(r.tipo) || {};
      piezas.push(pieza('relacion', 'con_respaldo', [r.id, r.de, r.a], {
        tipo: r.tipo, nombre: reglas.nombre,
        de: { uc: r.de, titulo: de.titulo }, a: { uc: r.a, titulo: a.titulo },
        externa: !g.nodos[r.de] || !g.nodos[r.a]
      }));
    });

    // 4 · Ejemplos (y ejemplos pendientes donde se esperaban)
    principales.forEach(function (id) {
      var u = g.nodos[id].uc;
      var ejs = relDe(function (r) { return r.tipo === 'ejemplo_de' && r.a === id && g.nodos[r.de]; });
      ejs.forEach(function (r) {
        var e = copiaUC(g.nodos[r.de].uc);
        e.de = id;
        piezas.push(pieza('ejemplo', 'con_respaldo', [r.de, r.id, id], e));
      });
      if (!ejs.length && ESPERA_EJEMPLO[u.tipo]) piezas.push(pieza('ejemplo', 'pendiente', [id], { de: { uc: id, titulo: u.titulo } }, 'Falta un ejemplo de «' + u.titulo + '»'));
    });

    // 5 · Procedimientos
    principales.forEach(function (id) {
      var u = g.nodos[id].uc;
      if (u.tipo === 'procedimiento') piezas.push(pieza('procedimiento', 'con_respaldo', [id], copiaUC(u)));
    });

    // 6 · Preguntas (especificación: qué se pregunta y qué se responde, sacado de los datos)
    var conTexto = principales.map(function (id) { return g.nodos[id].uc; }).filter(function (u) { return ESPERA_DEFINICION[u.tipo] && u.texto; });
    conTexto.forEach(function (u) {
      piezas.push(pieza('pregunta', 'con_respaldo', [u.id], { modo: 'definicion', pista: { uc: u.id, texto: u.texto }, respuesta: { uc: u.id, titulo: u.titulo } }));
    });
    g.orden.forEach(function (id) {
      var u = g.nodos[id].uc;
      if (u.tipo === 'fecha' && u.campos && u.campos.fecha) piezas.push(pieza('pregunta', 'con_respaldo', [id], { modo: 'fecha', sobre: { uc: id, titulo: u.titulo }, respuesta: { uc: id, fecha: u.campos.fecha } }));
      if (u.tipo === 'formula' && u.campos && u.campos.expresion) piezas.push(pieza('pregunta', 'con_respaldo', [id], { modo: 'formula', sobre: { uc: id, titulo: u.titulo }, respuesta: { uc: id, expresion: u.campos.expresion } }));
      if (u.tipo === 'procedimiento' && u.campos && u.campos.pasos && u.campos.pasos.length >= 2) piezas.push(pieza('pregunta', 'con_respaldo', [id], { modo: 'ordenar_pasos', sobre: { uc: id, titulo: u.titulo }, respuesta: { uc: id, pasos: u.campos.pasos.slice() } }));
    });
    relDe(function (r) { return r.tipo === 'causa' && ucsDe(r.de) && ucsDe(r.a); }).forEach(function (r) {
      piezas.push(pieza('pregunta', 'con_respaldo', [r.id, r.de, r.a], { modo: 'causa', sobre: { uc: r.a, titulo: ucsDe(r.a).titulo }, respuesta: { uc: r.de, titulo: ucsDe(r.de).titulo } }));
    });
    relDe(function (r) { return r.tipo !== 'relacionado' && ucsDe(r.de) && ucsDe(r.a); }).forEach(function (r) {
      piezas.push(pieza('pregunta', 'con_respaldo', [r.id, r.de, r.a], { modo: 'verdadero', afirmacion: { tipo: r.tipo, de: { uc: r.de, titulo: ucsDe(r.de).titulo }, a: { uc: r.a, titulo: ucsDe(r.a).titulo } }, respuesta: true }));
    });
    principales.forEach(function (id) {
      var hijas = relDe(function (r) { return (r.tipo === 'parte_de' || r.tipo === 'es_un') && r.a === id && g.nodos[r.de] && g.nodos[r.de].rol === 'sub'; });
      if (hijas.length >= 2) {
        piezas.push(pieza('pregunta', 'con_respaldo', [id].concat(hijas.map(function (r) { return r.id; }), hijas.map(function (r) { return r.de; })), {
          modo: 'clasificar', grupo: { uc: id, titulo: g.nodos[id].uc.titulo },
          respuesta: hijas.map(function (r) { return { uc: r.de, titulo: g.nodos[r.de].uc.titulo, relacion: r.tipo }; })
        }));
      }
    });
    if (conTexto.length >= 3) {
      piezas.push(pieza('pregunta', 'con_respaldo', conTexto.map(function (u) { return u.id; }), {
        modo: 'emparejar', respuesta: conTexto.map(function (u) { return { uc: u.id, titulo: u.titulo, texto: u.texto }; })
      }));
    }
    var cadena = cadenaTemporal(g.orden, g.rels);
    if (cadena && cadena.ciclo) avisos.push('Las relaciones «antes de» forman un ciclo: no se propone ordenar');
    if (cadena && cadena.orden && cadena.orden.length >= 3) {
      piezas.push(pieza('pregunta', 'con_respaldo', cadena.orden.concat(cadena.rels), {
        modo: 'ordenar', respuesta: cadena.orden.map(function (id) { var o = copiaUC(g.nodos[id].uc); return { uc: id, titulo: o.titulo, fecha: o.fecha }; })
      }));
    }

    // 7 · Ejercicios: procedimiento + ejemplos resueltos. Sin ejemplo, los valores quedan pendientes.
    principales.forEach(function (id) {
      var u = g.nodos[id].uc;
      if (u.tipo !== 'procedimiento') return;
      var ejs = relDe(function (r) { return r.tipo === 'ejemplo_de' && r.a === id && g.nodos[r.de]; });
      if (ejs.length) {
        piezas.push(pieza('ejercicio', 'con_respaldo', [id].concat(ejs.map(function (r) { return r.id; }), ejs.map(function (r) { return r.de; })), {
          modo: 'resuelto', procedimiento: { uc: id, titulo: u.titulo, pasos: u.campos.pasos.slice() },
          resueltos: ejs.map(function (r) { var e = g.nodos[r.de].uc; return { uc: e.id, titulo: e.titulo, texto: e.texto }; })
        }));
      }
      piezas.push(pieza('ejercicio', 'pendiente', [id], { modo: 'nuevo', procedimiento: { uc: id, titulo: u.titulo } },
        'Los valores de ejercicios nuevos para «' + u.titulo + '» los aportará el generador del dominio'));
    });

    // 8 · Repaso: lo esencial que ya está en los datos
    var esencial = g.orden.map(function (id) { return g.nodos[id].uc; }).filter(function (u) {
      return (ESPERA_DEFINICION[u.tipo] && u.texto) || u.tipo === 'fecha' || u.tipo === 'formula';
    });
    if (esencial.length) {
      piezas.push(pieza('repaso', 'con_respaldo', esencial.map(function (u) { return u.id; }), {
        modo: 'esencial', items: esencial.map(function (u) { var o = copiaUC(u); delete o.pasos; return o; })
      }));
    } else {
      piezas.push(pieza('repaso', 'pendiente', [raizUC.id], { modo: 'esencial' }, 'No hay definiciones, fechas ni fórmulas con las que hacer un repaso'));
    }

    // 9 · Visualizaciones: la forma de dato sale de las relaciones que existen
    var familias = E.catalogo('formasDato');
    var jer = principales.filter(function (id) { return g.nodos[id].rol === 'sub'; });
    if (jer.length >= 2) {
      piezas.push(pieza('visualizacion', 'con_respaldo', principales.concat(jer.map(function (id) { return g.nodos[id].via.id; })), {
        forma: 'jerarquia', familias: familias.jerarquia.familias,
        nodos: principales.map(function (id) { var n = g.nodos[id]; return { uc: id, titulo: n.uc.titulo, padre: n.padre, nivel: n.prof }; })
      }));
    }
    if (cadena && cadena.orden && cadena.orden.length >= 2) {
      piezas.push(pieza('visualizacion', 'con_respaldo', cadena.orden.concat(cadena.rels), {
        forma: 'secuencia', familias: familias.secuencia.familias,
        pasos: cadena.orden.map(function (id) { var o = copiaUC(g.nodos[id].uc); return { uc: id, titulo: o.titulo, fecha: o.fecha }; })
      }));
    }
    principales.forEach(function (id) {
      var u = g.nodos[id].uc;
      if (u.tipo === 'procedimiento' && u.campos.pasos.length >= 2) {
        piezas.push(pieza('visualizacion', 'con_respaldo', [id], { forma: 'secuencia', familias: familias.secuencia.familias, uc: id, titulo: u.titulo, pasos: u.campos.pasos.slice() }));
      }
    });
    relDe(function (r) { return r.tipo === 'contrasta_con' && g.nodos[r.de] && g.nodos[r.a]; }).forEach(function (r) {
      piezas.push(pieza('visualizacion', 'con_respaldo', [r.id, r.de, r.a], {
        forma: 'comparacion', familias: familias.comparacion.familias,
        lados: [copiaUC(g.nodos[r.de].uc), copiaUC(g.nodos[r.a].uc)]
      }));
    });
    principales.forEach(function (id) {
      var ejs = relDe(function (r) { return r.tipo === 'ejemplo_de' && r.a === id && g.nodos[r.de]; });
      if (ejs.length >= 3) {
        piezas.push(pieza('visualizacion', 'con_respaldo', [id].concat(ejs.map(function (r) { return r.id; }), ejs.map(function (r) { return r.de; })), {
          forma: 'lista', familias: familias.lista.familias, de: { uc: id, titulo: g.nodos[id].uc.titulo },
          items: ejs.map(function (r) { var e = g.nodos[r.de].uc; return { uc: e.id, titulo: e.titulo, texto: e.texto }; })
        }));
      }
    });

    // Sin duplicados (el mismo id de pieza solo una vez).
    var vistos = {};
    piezas = piezas.filter(function (p) { if (vistos[p.id]) return false; vistos[p.id] = true; return true; });
    return { piezas: piezas, avisos: avisos };
  }

  /* ───────────────────────── API ───────────────────────── */

  function resumen(est) {
    var r = { total: 0, con_respaldo: 0, parcial: 0, pendiente: 0, porClase: {} };
    (est.piezas || []).forEach(function (p) {
      r.total++;
      r[p.estado]++;
      var c = r.porClase[p.clase] = r.porClase[p.clase] || { con_respaldo: 0, parcial: 0, pendiente: 0 };
      c[p.estado]++;
    });
    r.cobertura = r.total ? Math.round(100 * (r.con_respaldo + r.parcial / 2) / r.total) : 0;
    return r;
  }

  function expandir(ucId, opciones) {
    opciones = opciones || {};
    return A.obtener('uc', ucId).then(function (raizUC) {
      if (!raizUC) throw new Error('No existe la unidad «' + ucId + '»');
      var nivel = opciones.nivel || (raizUC.niveles && raizUC.niveles[0]) || 'primaria';
      if (!E.catalogo('niveles')[nivel]) throw new Error('Nivel desconocido: «' + nivel + '»');
      var maxProf = typeof opciones.profundidad === 'number' ? opciones.profundidad : (PROFUNDIDAD[nivel] || 2);
      return recoger(raizUC, nivel, maxProf).then(function (g) {
        var c = construir(g, raizUC, opciones);
        var est = E.crear('estructura', {
          id: 'est_' + EDU.hash(ucId + '|' + nivel + '|' + maxProf),
          raiz: ucId, nivel: nivel,
          semilla: typeof opciones.semilla === 'number' ? opciones.semilla : 1,
          piezas: c.piezas
        });
        est.profundidad = maxProf;
        est.excluidas = g.excluidas.slice();
        est.avisos = c.avisos;
        if (!aptaParaNivel(raizUC, nivel)) est.avisos.push('La unidad raíz está marcada para un nivel superior a «' + nivel + '»');
        est.resumen = resumen(est);
        // Red de seguridad: la estructura debe cumplir el contrato (ninguna pieza con contenido sin origen).
        var v = E.validar('estructura', est);
        if (!v.ok) {
          var e = new Error('La expansión produjo piezas no válidas');
          e.errores = v.errores;
          throw e;
        }
        EDU.emitir('expansor:expandido', { id: est.id, raiz: ucId, resumen: est.resumen });
        return est;
      });
    });
  }

  // Raíces de una rama: UC que no cuelgan (parte_de, es_un, ejemplo_de, define, propiedad_de) de otra UC de la misma rama.
  function expandirRama(ramaId, opciones) {
    var CUELGA = { parte_de: true, es_un: true, ejemplo_de: true, define: true, propiedad_de: true };
    return B.ucsDeRama(ramaId).then(function (ucs) {
      var dentro = {};
      ucs.forEach(function (u) { dentro[u.id] = true; });
      return Promise.all(ucs.map(function (u) {
        return B.relaciones(u.id, { sentido: 'salida' }).then(function (rels) {
          return rels.some(function (r) { return CUELGA[r.tipo] && dentro[r.a]; }) ? null : u;
        });
      }));
    }).then(function (raices) {
      raices = raices.filter(Boolean).sort(porTitulo);
      return raices.reduce(function (p, u) {
        return p.then(function (lista) { return expandir(u.id, opciones).then(function (est) { lista.push(est); return lista; }); });
      }, Promise.resolve([]));
    });
  }

  function guardar(est) { return A.guardar('estructura', est); }

  /* Auditoría de no invención:
       · todo id de «desde» existe (UC o relación);
       · todo objeto de «datos» que cita una UC ({uc: id, …}) coincide campo a campo
         (titulo, texto, fecha, expresion, pasos, autor) con esa UC. */
  var CAMPOS_COPIA = { titulo: 'titulo', texto: 'texto', fecha: 'campos.fecha', expresion: 'campos.expresion', pasos: 'campos.pasos', autor: 'campos.autor' };

  function leerRuta(o, ruta) { return ruta.split('.').reduce(function (x, k) { return x ? x[k] : undefined; }, o); }

  function auditar(est) {
    var problemas = [], ids = {};
    (est.piezas || []).forEach(function (p) {
      if (p.estado !== 'pendiente' && (!p.desde || !p.desde.length)) problemas.push({ pieza: p.id, problema: 'Pieza con contenido sin origen' });
      (p.desde || []).forEach(function (d) { ids[d] = true; });
    });
    var lista = Object.keys(ids), existe = {}, ucs = {};
    return Promise.all(lista.map(function (id) {
      var tipo = id.indexOf('rel_') === 0 ? 'relacion' : 'uc';
      return A.obtener(tipo, id).then(function (o) { existe[id] = !!o; if (o && tipo === 'uc') ucs[id] = o; });
    })).then(function () {
      lista.forEach(function (id) { if (!existe[id]) problemas.push({ id: id, problema: 'El origen no existe' }); });
      function revisar(v, pz) {
        if (!v || typeof v !== 'object') return;
        if (Object.prototype.toString.call(v) === '[object Array]') { v.forEach(function (x) { revisar(x, pz); }); return; }
        if (typeof v.uc === 'string') {
          var u = ucs[v.uc];
          if (!u) problemas.push({ pieza: pz.id, id: v.uc, problema: 'Cita una UC que no está en «desde»' });
          else Object.keys(CAMPOS_COPIA).forEach(function (k) {
            if (v[k] === undefined) return;
            if (JSON.stringify(v[k]) !== JSON.stringify(leerRuta(u, CAMPOS_COPIA[k]))) problemas.push({ pieza: pz.id, id: v.uc, campo: k, problema: 'No coincide con el origen' });
          });
        }
        Object.keys(v).forEach(function (k) { if (k !== 'uc') revisar(v[k], pz); });
      }
      (est.piezas || []).forEach(function (p) { revisar(p.datos, p); });
      return { ok: problemas.length === 0, problemas: problemas };
    });
  }

  EDU.expansor = {
    expandir: expandir,
    expandirRama: expandirRama,
    guardar: guardar,
    auditar: auditar,
    resumen: resumen
  };

  EDU.registrar('expansor', EDU.expansor, { requiere: ['base', 'esquemas', 'almacen', 'biblioteca'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
