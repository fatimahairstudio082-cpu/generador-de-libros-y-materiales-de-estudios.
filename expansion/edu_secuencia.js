/* edu_secuencia.js — secuencia pedagógica.
   Módulo 8 de la fase 1. Requiere edu_base, edu_esquemas y edu_almacen.

   Ordena y estructura lo que produjo el Motor de Expansión. NO crea
   contenido: solo decide en qué orden y en qué módulo va cada pieza, y
   qué objetivos sostienen las piezas que existen.

     · Unidades: el concepto raíz y los subconceptos de las estructuras.
     · Orden (por prioridad; una regla que crearía un ciclo se descarta; si es
       un requisito, además se avisa):
         1. requisito  — lo que una unidad «requiere» va antes
         2. jerarquía  — el todo antes que sus partes
         3. «antes de» — el orden temporal de los datos
         4. causa      — la causa antes que el efecto
       Empates: el orden en que llegaron las unidades (determinista). Esas
       posiciones se marcan como indeterminadas: los datos no las fijan.
     · Cada pieza va a UN solo sitio. Si cita varias unidades, va a la última
       de ellas en la secuencia (cuando ya se conocen todas). Las piezas de
       conjunto (repaso, emparejar, ordenar, clasificar, visualizaciones de
       varias unidades) van al bloque final de síntesis.
     · Dentro de cada módulo, las piezas siguen las FASES (configurables).
     · Objetivos: estructurados { operacion, verbo, objeto:{uc,titulo}, desde }.
       El verbo sale de una tabla por nivel; el objeto se copia de los datos.
       Solo se propone un objetivo si hay piezas con respaldo que lo sostienen.

     EDU.secuencia.secuenciar(estructuras, opciones) → secuencia (síncrono, puro)
     EDU.secuencia.verificar(secuencia, estructuras) → { ok, problemas }
     EDU.secuencia.aplicarAProyecto(proyectoId, secuencia) → Promise<proyecto>
     EDU.secuencia.verbos(nivel) / fases()
   opciones: { profundidad, excluirClases:[…], fases:[…], verbos:{ operacion: 'Verbo' } } */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base || !EDU.esquemas || !EDU.almacen) { if (raiz.console) raiz.console.error('[secuencia] Faltan edu_base, edu_esquemas o edu_almacen'); return; }
  if (EDU.secuencia) return;

  var E = EDU.esquemas, A = EDU.almacen;

  // Orden pedagógico por defecto de las piezas dentro de un módulo. Propuesta revisable.
  var FASES = ['concepto', 'subconcepto', 'definicion', 'relacion', 'ejemplo', 'procedimiento', 'ejercicio', 'visualizacion', 'pregunta', 'repaso'];

  // Piezas que, si citan varias unidades, van a la síntesis final.
  function esDeSintesis(p) {
    if (p.clase === 'repaso') return true;
    if (p.clase === 'visualizacion') return true;
    return p.clase === 'pregunta' && (p.datos.modo === 'emparejar' || p.datos.modo === 'ordenar' || p.datos.modo === 'clasificar');
  }

  /* Verbos por operación y grupo de nivel. Tabla de vocabulario, propuesta
     revisable por Fátima: no contiene datos de ninguna materia. */
  var GRUPO = { infantil: 'basico', primaria: 'primaria', secundaria: 'medio', bachillerato: 'medio', fp: 'medio', universidad: 'superior', profesional: 'superior' };
  var OPERACIONES = ['identificar', 'definir', 'descomponer', 'ejemplificar', 'situar', 'explicar_causas', 'comparar', 'aplicar', 'clasificar', 'secuenciar', 'relacionar', 'repasar'];
  var VERBOS = {
    identificar: { basico: 'Reconocer', primaria: 'Reconocer', medio: 'Identificar', superior: 'Caracterizar' },
    definir: { basico: 'Nombrar', primaria: 'Definir', medio: 'Definir', superior: 'Conceptualizar' },
    descomponer: { basico: 'Nombrar las partes de', primaria: 'Describir las partes de', medio: 'Analizar la estructura de', superior: 'Analizar la estructura de' },
    ejemplificar: { basico: 'Señalar ejemplos de', primaria: 'Poner ejemplos de', medio: 'Ejemplificar', superior: 'Ejemplificar' },
    situar: { basico: 'Ordenar', primaria: 'Situar en el tiempo', medio: 'Situar cronológicamente', superior: 'Periodizar' },
    explicar_causas: { basico: 'Decir por qué ocurre', primaria: 'Explicar las causas de', medio: 'Explicar las causas de', superior: 'Analizar las causas de' },
    comparar: { basico: 'Diferenciar', primaria: 'Comparar', medio: 'Comparar', superior: 'Contrastar' },
    aplicar: { basico: 'Practicar', primaria: 'Aplicar', medio: 'Aplicar', superior: 'Aplicar y justificar' },
    clasificar: { basico: 'Agrupar', primaria: 'Clasificar', medio: 'Clasificar', superior: 'Categorizar' },
    secuenciar: { basico: 'Ordenar', primaria: 'Ordenar', medio: 'Secuenciar', superior: 'Secuenciar' },
    relacionar: { basico: 'Unir', primaria: 'Relacionar', medio: 'Relacionar', superior: 'Integrar' },
    repasar: { basico: 'Recordar', primaria: 'Repasar', medio: 'Sintetizar', superior: 'Sintetizar' }
  };

  /* extra: { operacion: 'Verbo' } sustituye verbos de la tabla para esta llamada.
     Una operación que no existe es un error (evita erratas silenciosas). */
  function verbos(nivel, extra) {
    var g = GRUPO[nivel] || 'primaria', r = {};
    OPERACIONES.forEach(function (op) { r[op] = VERBOS[op][g]; });
    Object.keys(extra || {}).forEach(function (op) {
      if (OPERACIONES.indexOf(op) < 0) throw new Error('Operación desconocida en verbos: «' + op + '»');
      if (typeof extra[op] !== 'string' || !extra[op].trim()) throw new Error('El verbo de «' + op + '» debe ser un texto');
      r[op] = extra[op].trim();
    });
    return r;
  }

  /* ───────────────────────── Unidades y reparto ───────────────────────── */

  function unirPiezas(estructuras) {
    var vistas = {}, lista = [];
    estructuras.forEach(function (est) {
      (est.piezas || []).forEach(function (p) { if (!vistas[p.id]) { vistas[p.id] = true; lista.push(p); } });
    });
    return lista;
  }

  // ¿Esta UC es satélite (ejemplo o definición) de una unidad?
  function mapaSatelites(piezas) {
    var m = {};
    piezas.forEach(function (p) {
      if ((p.clase === 'ejemplo' || p.clase === 'definicion') && p.datos && typeof p.datos.uc === 'string' && typeof p.datos.de === 'string') m[p.datos.uc] = p.datos.de;
    });
    return m;
  }

  /* Orden de las unidades. Aristas «x antes que y» añadidas por prioridad;
     una arista que cerraría un ciclo se descarta (y se avisa si es un requisito).
     Cuando en un paso hay varias unidades posibles, los datos no deciden:
     se toma la primera en orden de llegada y se anota como indeterminado. */
  function ordenar(unidades, piezas, avisos) {
    var idx = {}, sale = {}, ignorados = [];
    unidades.forEach(function (u, i) { idx[u.uc] = i; sale[u.uc] = []; });
    function alcanza(a, b) {
      var pila = [a], visto = {};
      while (pila.length) { var x = pila.pop(); if (x === b) return true; if (visto[x]) continue; visto[x] = true; pila.push.apply(pila, sale[x]); }
      return false;
    }
    function arista(x, y, fuerte, motivo, pieza) {
      if (x === y || idx[x] === undefined || idx[y] === undefined || sale[x].indexOf(y) >= 0) return;
      if (alcanza(y, x)) {
        if (fuerte) { avisos.push('Se ignora «' + motivo + '» porque contradice un orden anterior'); if (pieza) ignorados.push(pieza); }
        return;
      }
      sale[x].push(y);
    }
    var rels = piezas.filter(function (p) { return p.clase === 'relacion' && p.datos.de && p.datos.a; });
    function titulo(id) { var u = unidades[idx[id]]; return u ? u.titulo : id; }
    rels.filter(function (p) { return p.datos.tipo === 'requiere'; }).forEach(function (p) { arista(p.datos.a.uc, p.datos.de.uc, true, titulo(p.datos.de.uc) + ' requiere ' + titulo(p.datos.a.uc), p.id); });
    // La jerarquía es un orden por defecto: si un requisito explícito la contradice, cede sin aviso.
    unidades.forEach(function (u) { if (u.padre) arista(u.padre, u.uc, false); });
    rels.filter(function (p) { return p.datos.tipo === 'parte_de' || p.datos.tipo === 'es_un'; }).forEach(function (p) { arista(p.datos.a.uc, p.datos.de.uc, false); });
    rels.filter(function (p) { return p.datos.tipo === 'antes_de'; }).forEach(function (p) { arista(p.datos.de.uc, p.datos.a.uc, false); });
    rels.filter(function (p) { return p.datos.tipo === 'causa'; }).forEach(function (p) { arista(p.datos.de.uc, p.datos.a.uc, false); });

    // Kahn con desempate por orden de llegada.
    var entra = {};
    unidades.forEach(function (u) { entra[u.uc] = 0; });
    unidades.forEach(function (u) { sale[u.uc].forEach(function (v) { entra[v]++; }); });
    var libres = unidades.filter(function (u) { return !entra[u.uc]; }).map(function (u) { return u.uc; }), res = [];
    var indeterminado = [], estable = {};
    while (libres.length) {
      libres.sort(function (a, b) { return idx[a] - idx[b]; });
      var n = libres.shift();
      if (libres.length) {
        estable[n] = true;
        indeterminado.push({ posicion: res.length + 1, elegida: { uc: n, titulo: titulo(n) }, alternativas: libres.map(function (x) { return { uc: x, titulo: titulo(x) }; }) });
      }
      res.push(n);
      sale[n].forEach(function (v) { if (--entra[v] === 0) libres.push(v); });
    }
    return { orden: res, aristas: sale, indeterminado: indeterminado, estable: estable, ignorados: ignorados };
  }

  function unidadesDe(p, esUnidad, satelites) {
    var r = [];
    (p.desde || []).forEach(function (d) {
      var u = esUnidad[d] ? d : satelites[d];
      if (u && esUnidad[u] && r.indexOf(u) < 0) r.push(u);
    });
    return r;
  }

  /* ───────────────────────── Objetivos ───────────────────────── */

  function objetivosDe(unidad, piezasMod, hijas, v) {
    var res = {};
    function poner(op, pz) {
      if (!res[op]) res[op] = { operacion: op, verbo: v[op], objeto: { uc: unidad.uc, titulo: unidad.titulo }, desde: [] };
      if (res[op].desde.indexOf(pz) < 0) res[op].desde.push(pz);
    }
    piezasMod.forEach(function (p) {
      if (p.estado !== 'con_respaldo') return;
      var d = p.datos;
      if (p.clase === 'definicion') poner('definir', p.id);
      else if (p.clase === 'ejemplo') poner('ejemplificar', p.id);
      else if (p.clase === 'procedimiento' || p.clase === 'ejercicio') poner('aplicar', p.id);
      else if (p.clase === 'relacion' && d.tipo === 'causa' && d.a.uc === unidad.uc) poner('explicar_causas', p.id);
      else if (p.clase === 'relacion' && d.tipo === 'contrasta_con') poner('comparar', p.id);
      else if ((p.clase === 'concepto' || p.clase === 'subconcepto') && d.tipo === 'fecha' && d.fecha) poner('situar', p.id);
    });
    if (hijas.length) hijas.forEach(function (pz) { poner('descomponer', pz); });
    var lista = OPERACIONES.filter(function (op) { return res[op]; }).map(function (op) { return res[op]; });
    if (!lista.length) {
      var c = piezasMod.filter(function (p) { return p.clase === 'concepto' || p.clase === 'subconcepto'; })[0];
      if (c) lista.push({ operacion: 'identificar', verbo: v.identificar, objeto: { uc: unidad.uc, titulo: unidad.titulo }, desde: [c.id] });
    }
    return lista;
  }

  function objetivosSintesis(piezas, v) {
    var res = [];
    var mapa = { ordenar: 'secuenciar', emparejar: 'relacionar', clasificar: 'clasificar' };
    piezas.forEach(function (p) {
      if (p.estado !== 'con_respaldo') return;
      var op = p.clase === 'repaso' ? 'repasar' : (p.clase === 'pregunta' ? mapa[p.datos.modo] : null);
      if (!op) return;
      var o = res.filter(function (x) { return x.operacion === op; })[0];
      if (!o) { o = { operacion: op, verbo: v[op], desde: [] }; res.push(o); }
      o.desde.push(p.id);
    });
    return res.sort(function (a, b) { return OPERACIONES.indexOf(a.operacion) - OPERACIONES.indexOf(b.operacion); });
  }

  /* ───────────────────────── Secuenciar ───────────────────────── */

  function porFases(piezas, fases) {
    return fases.map(function (f) {
      return { fase: f, piezas: piezas.filter(function (p) { return p.clase === f; }).map(function (p) { return p.id; }) };
    }).filter(function (f) { return f.piezas.length; });
  }

  function secuenciar(estructuras, opciones) {
    opciones = opciones || {};
    if (!estructuras) throw new Error('Faltan las estructuras a secuenciar');
    if (Object.prototype.toString.call(estructuras) !== '[object Array]') estructuras = [estructuras];
    if (!estructuras.length) throw new Error('No hay estructuras que secuenciar');
    var nivel = estructuras[0].nivel;
    var tablaVerbos = verbos(nivel, opciones.verbos);
    var fases = opciones.fases || FASES;
    var excluir = {};
    (opciones.excluirClases || []).forEach(function (c) { excluir[c] = true; });
    var avisos = [], recortadas = [];

    var todas = unirPiezas(estructuras);
    // Unidades: concepto y subconceptos, en orden de llegada.
    var unidades = [], esUnidad = {};
    todas.forEach(function (p) {
      if ((p.clase === 'concepto' || p.clase === 'subconcepto') && !esUnidad[p.datos.uc]) {
        esUnidad[p.datos.uc] = true;
        unidades.push({ uc: p.datos.uc, titulo: p.datos.titulo, tipo: p.datos.tipo, profundidad: p.datos.profundidad || 0, padre: p.datos.padre || null, pieza: p.id });
      }
    });
    if (!unidades.length) throw new Error('Las estructuras no tienen ningún concepto');

    // Recorte por profundidad: fuera la unidad y todo lo que la cite.
    if (typeof opciones.profundidad === 'number') {
      unidades = unidades.filter(function (u) {
        if (u.profundidad <= opciones.profundidad) return true;
        delete esUnidad[u.uc];
        return false;
      });
    }
    var satelites = mapaSatelites(todas);
    var citaFuera = function (p) {
      return (p.desde || []).some(function (d) {
        var u = satelites[d] || d;
        return todas.some(function (q) { return (q.clase === 'concepto' || q.clase === 'subconcepto') && q.datos.uc === u; }) && !esUnidad[u];
      });
    };
    var piezas = todas.filter(function (p) {
      if (excluir[p.clase] || citaFuera(p)) { recortadas.push(p.id); return false; }
      return true;
    });

    var ord = ordenar(unidades, piezas, avisos);
    var posicion = {};
    ord.orden.forEach(function (id, i) { posicion[id] = i; });
    var porUnidad = {}, sintesis = [];
    ord.orden.forEach(function (id) { porUnidad[id] = []; });

    piezas.forEach(function (p) {
      var us = unidadesDe(p, esUnidad, satelites);
      if (us.length > 1 && esDeSintesis(p)) { sintesis.push(p); return; }
      if (!us.length) { sintesis.push(p); return; }
      var ultima = us.reduce(function (a, b) { return posicion[a] >= posicion[b] ? a : b; });
      porUnidad[ultima].push(p);
    });

    // Requisitos previos: lo que se requiere y no forma parte de la secuencia (se cita, no se desarrolla).
    var previos = [];
    piezas.forEach(function (p) {
      if (p.clase !== 'relacion' || p.datos.tipo !== 'requiere' || esUnidad[p.datos.a.uc]) return;
      var r = previos.filter(function (x) { return x.uc === p.datos.a.uc; })[0];
      if (!r) { r = { uc: p.datos.a.uc, titulo: p.datos.a.titulo, para: [], desde: [] }; previos.push(r); }
      if (r.para.indexOf(p.datos.de.uc) < 0) r.para.push(p.datos.de.uc);
      r.desde.push(p.id);
    });

    var byId = {};
    unidades.forEach(function (u) { byId[u.uc] = u; });
    var modulos = ord.orden.map(function (id, i) {
      var u = byId[id], mias = porUnidad[id];
      var hijas = unidades.filter(function (h) { return h.padre === id; }).map(function (h) { return h.pieza; });
      var ucs = [id];
      Object.keys(satelites).forEach(function (s) { if (satelites[s] === id && mias.some(function (p) { return (p.desde || []).indexOf(s) >= 0; })) ucs.push(s); });
      return {
        id: 'mod_' + EDU.hash(id + '|' + nivel),
        orden: i + 1, uc: id, titulo: u.titulo, profundidad: u.profundidad,
        ucs: ucs,
        fases: porFases(mias, fases),
        objetivos: objetivosDe(u, mias, hijas, tablaVerbos),
        ordenIndeterminado: !!ord.estable[id],
        pendientes: mias.filter(function (p) { return p.estado === 'pendiente'; }).length
      };
    });

    var sec = {
      id: 'sec_' + EDU.hash(estructuras.map(function (e) { return e.id; }).join(',') + '|' + JSON.stringify(opciones)),
      nivel: nivel,
      estructuras: estructuras.map(function (e) { return e.id; }),
      requisitosPrevios: previos,
      modulos: modulos,
      sintesis: { fases: porFases(sintesis, fases), objetivos: objetivosSintesis(sintesis, tablaVerbos) },
      recortadas: recortadas,
      avisos: avisos,
      requisitosIgnorados: ord.ignorados,
      // Posiciones que los datos no fijan: se conserva el orden estable y se informa.
      indeterminado: ord.indeterminado,
      informe: {
        modulos: modulos.length, piezas: piezas.length, recortadas: recortadas.length,
        pendientes: piezas.filter(function (p) { return p.estado === 'pendiente'; }).length,
        ordenIndeterminado: modulos.filter(function (m) { return m.ordenIndeterminado; }).length
      }
    };

    var v = verificar(sec, estructuras);
    if (!v.ok) { var e = new Error('La secuencia no es coherente'); e.errores = v.problemas; throw e; }
    sec.aristas = ord.aristas;
    return sec;
  }

  /* Comprobaciones: cada pieza no recortada aparece UNA vez; toda pieza citada
     existe; el orden respeta los requisitos; los objetivos citan piezas del módulo. */
  function verificar(sec, estructuras) {
    if (Object.prototype.toString.call(estructuras) !== '[object Array]') estructuras = [estructuras];
    var problemas = [], existe = {}, cuenta = {};
    unirPiezas(estructuras).forEach(function (p) { existe[p.id] = p; });
    function contar(fs) { fs.forEach(function (f) { f.piezas.forEach(function (id) { cuenta[id] = (cuenta[id] || 0) + 1; }); }); }
    sec.modulos.forEach(function (m) { contar(m.fases); });
    contar(sec.sintesis.fases);
    Object.keys(existe).forEach(function (id) {
      var n = cuenta[id] || 0, rec = sec.recortadas.indexOf(id) >= 0;
      if (!rec && n !== 1) problemas.push({ pieza: id, problema: n ? 'Aparece ' + n + ' veces' : 'No aparece' });
      if (rec && n) problemas.push({ pieza: id, problema: 'Recortada pero presente' });
    });
    Object.keys(cuenta).forEach(function (id) { if (!existe[id]) problemas.push({ pieza: id, problema: 'No existe en las estructuras' }); });
    var pos = {};
    sec.modulos.forEach(function (m, i) { pos[m.uc] = i; });
    Object.keys(existe).forEach(function (id) {
      var p = existe[id];
      if (p.clase === 'relacion' && p.datos.tipo === 'requiere' && pos[p.datos.de.uc] !== undefined && pos[p.datos.a.uc] !== undefined && pos[p.datos.a.uc] > pos[p.datos.de.uc]) {
        if ((sec.requisitosIgnorados || []).indexOf(id) < 0) problemas.push({ pieza: id, problema: 'Un requisito queda después de quien lo necesita' });
      }
    });
    sec.modulos.forEach(function (m) {
      var mias = {};
      m.fases.forEach(function (f) { f.piezas.forEach(function (id) { mias[id] = true; }); });
      m.objetivos.forEach(function (o) {
        o.desde.forEach(function (id) { if (!mias[id] && o.operacion !== 'descomponer') problemas.push({ modulo: m.id, problema: 'Objetivo «' + o.operacion + '» sin pieza propia que lo sostenga' }); });
        if (o.objeto.uc !== m.uc || o.objeto.titulo !== m.titulo) problemas.push({ modulo: m.id, problema: 'Objetivo con un objeto que no es la unidad del módulo' });
      });
    });
    return { ok: problemas.length === 0, problemas: problemas };
  }

  /* Guarda la secuencia en el Proyecto Maestro: sus módulos pasan a ser la
     estructura pedagógica del proyecto (contrato de esquemas: id, titulo, ucs). */
  function aplicarAProyecto(proyectoId, sec) {
    return A.obtener('proyecto', proyectoId).then(function (pro) {
      if (!pro) throw new Error('No existe el proyecto «' + proyectoId + '»');
      pro.modulos = sec.modulos.map(function (m) { return EDU.clonar({ id: m.id, titulo: m.titulo, uc: m.uc, orden: m.orden, ucs: m.ucs, fases: m.fases, objetivos: m.objetivos }); });
      pro.sintesis = EDU.clonar(sec.sintesis);
      pro.requisitosPrevios = EDU.clonar(sec.requisitosPrevios);
      pro.secuencia = sec.id;
      var todas = pro.ucs.slice();
      sec.modulos.forEach(function (m) { m.ucs.forEach(function (u) { if (todas.indexOf(u) < 0) todas.push(u); }); });
      pro.ucs = todas;
      E.tocar(pro);
      return A.guardar('proyecto', pro).then(function () {
        EDU.emitir('secuencia:aplicada', { proyecto: proyectoId, secuencia: sec.id });
        return pro;
      });
    });
  }

  EDU.secuencia = {
    secuenciar: secuenciar,
    verificar: verificar,
    aplicarAProyecto: aplicarAProyecto,
    verbos: verbos,
    operaciones: function () { return OPERACIONES.slice(); },
    fases: function () { return FASES.slice(); }
  };

  EDU.registrar('secuencia', EDU.secuencia, { requiere: ['base', 'esquemas', 'almacen'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
