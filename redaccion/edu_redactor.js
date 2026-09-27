/* edu_redactor.js — redacción de una secuencia en texto.
   Módulo 9 de la fase 1. Requiere edu_base, edu_esquemas y un paquete de
   lengua (EDU.lenguas.es).

   SEPARACIÓN ESTRICTA ENTRE HECHOS Y REDACCIÓN
     · Los HECHOS (definiciones, textos, fechas, fórmulas, pasos, títulos)
       se insertan tal cual están en las piezas. Solo puede cambiar la
       mayúscula inicial. Nunca se parafrasean, recortan ni amplían.
     · La REDACCIÓN pone el marco: plantillas de frase, artículos,
       conectores y el orden de presentación. Las relaciones se expresan
       con las plantillas del paquete de lengua, que solo dicen la
       relación que existe.
     · Conectores solo donde su sentido está respaldado: «por ejemplo»
       delante de un ejemplo, «además» entre afirmaciones independientes.
       Nunca «por eso» ni «después», que afirmarían causas u órdenes que
       los datos no dicen.
     · Cada frase es una AFIRMACIÓN con sus hechos { campo, uc, valor } y
       su origen (piezas, UC y relaciones).
     · La variación (semilla) cambia plantillas, conectores y el orden de
       opciones; los hechos son siempre los mismos.

   auditar() comprueba:
     nada alterado  — cada hecho coincide con su fuente y aparece en su frase;
     nada añadido   — quitando los hechos, solo quedan palabras del vocabulario
                      de las plantillas y del paquete de lengua;
     nada eliminado — toda pieza con respaldo queda redactada.

     EDU.redactor.redactar(secuencia, estructuras, opciones) → redacción (síncrono)
     EDU.redactor.auditar(redaccion, estructuras)            → { ok, problemas, cobertura }
     EDU.redactor.hechos(redaccion)                          → lista canónica de hechos
     EDU.redactor.aTexto(redaccion)                          → texto plano
   opciones: { semilla, idioma:'es', preguntas:true, objetivos:true, pendientes:true } */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base || !EDU.esquemas) { if (raiz.console) raiz.console.error('[redactor] Faltan edu_base o edu_esquemas'); return; }
  if (EDU.redactor) return;

  /* ───────────────────────── Plantillas (solo palabras de marco) ─────────────────────────
     Huecos: {S} sintagma con artículo y mayúscula · {s} sintagma · {s0} sin artículo
     {T} título tal cual · {t0} título con minúscula inicial · {TEXTO} texto tal cual
     {texto} texto con minúscula inicial (solo si es seguro) · {FECHA} · {EXPR}
     {CON} conector · {LISTA} · {VERBO} · {ORACION} · {P} padre con artículo · {p0} padre sin artículo */
  var FRASES = {
    es: {
      definicion: ['{S}: {TEXTO}', '{S} se define así: {TEXTO}', 'Definición de {s0}: {TEXTO}'],
      definicion_sencilla: ['¿Qué es {s}? {TEXTO}'],
      definicion_segura: ['{T}: {TEXTO}', 'Definición de {t0}: {TEXTO}'],
      texto: ['{TEXTO}'],
      fecha: ['{FECHA}: {T}.', '{T} ({FECHA}).'],
      formula: ['{T}: {EXPR}.', 'Fórmula de {t0}: {EXPR}.'],
      ejemplo: ['{CON}, {texto}', '{CON}: {TEXTO}', 'Ejemplo: {TEXTO}'],
      ejemplo_segura: ['{CON}: {TEXTO}', 'Ejemplo: {TEXTO}'],
      ejemplo_sin_texto: ['{CON}: {T}.', 'Ejemplo de {p0}: {T}.'],
      pasos_infinitivo: ['Pasos para {t0}:', 'Cómo {t0}:'],
      pasos: ['Procedimiento: {T}.', 'Pasos de {t0}:'],
      resuelto: ['Ejercicio resuelto: {TEXTO}', 'Ejemplo resuelto: {TEXTO}'],
      requisitos: ['Antes de empezar conviene conocer {LISTA}.', 'Para seguir este tema hay que conocer {LISTA}.'],
      objetivo: ['{VERBO} {s}.'],
      objetivo_sintesis: ['{VERBO} los contenidos del tema.'],
      titulo_sintesis: ['Síntesis'],
      titulo_objetivos: ['Objetivos'],
      titulo_preguntas: ['Preguntas'],
      repaso: ['{CON}:'],
      repaso_item: ['{T}: {TEXTO}', '{T}: {FECHA}.', '{T}: {EXPR}.', '{T}.'],
      visual: ['Esquema: {T}.', 'Esquema'],
      relacion_segura: ['{T}: {NOMBRE} {TA}.'],
      p_definicion: ['¿Qué concepto corresponde a esta definición? «{TEXTO}»', '¿A qué concepto se refiere esta definición? «{TEXTO}»'],
      p_fecha: ['¿Qué fecha corresponde a {s}?', '¿Qué fecha corresponde a {t0}?'],
      p_formula: ['¿Qué expresión corresponde a {s}?', '¿Qué expresión corresponde a {t0}?'],
      p_causa: ['¿Cuál es una de las causas de {s}?', '¿Cuál es una de las causas de {t0}?'],
      p_verdadero: ['Verdadero o falso: {ORACION}'],
      r_verdadero: ['Verdadero.'],
      p_ordenar_pasos: ['Ordena los pasos para {t0}:', 'Ordena los pasos de {t0}:'],
      p_ordenar: ['Ordena según el orden en que ocurren:', 'Ordena de lo que ocurre antes a lo que ocurre después:'],
      p_clasificar_parte: ['¿Qué forma parte de {s}?', '¿Qué forma parte de {t0}?'],
      p_clasificar_tipo: ['¿Qué tipos de {s0} hay?', '¿Qué tipos de {t0} hay?'],
      p_clasificar: ['¿Qué elementos se relacionan con {s}?', '¿Qué elementos se relacionan con {t0}?'],
      p_emparejar: ['Relaciona cada concepto con su definición:'],
      respuesta: ['{T}.', '{FECHA}.', '{EXPR}.']
    }
  };

  // Primeras palabras que se pueden poner en minúscula tras un conector sin riesgo (no son nombres propios).
  var FUNCIONALES = {};
  'el la los las un una unos unas lo al del en si cuando para por con sin se su sus este esta estos estas ese esa hay es son a de'.split(' ').forEach(function (p) { FUNCIONALES[p] = true; });

  function lengua(idioma) {
    var L = EDU.lenguas && EDU.lenguas[idioma || 'es'];
    if (!L) throw new Error('No está cargado el paquete de lengua «' + (idioma || 'es') + '»');
    return L;
  }

  /* ───────────────────────── Afirmaciones ───────────────────────── */

  function hecho(campo, uc, valor) { return { campo: campo, uc: uc, valor: valor }; }

  // Toda afirmación empieza con mayúscula (solo cambia la primera letra, lo único que la regla permite).
  function afirmacion(texto, desde, hechos, extra) {
    var t = String(texto || '');
    var a = { texto: t.charAt(0).toUpperCase() + t.slice(1), desde: [], hechos: hechos || [] };
    (desde || []).forEach(function (d) { if (d && a.desde.indexOf(d) < 0) a.desde.push(d); });
    if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
    return a;
  }

  function rellenar(plantilla, v) {
    return plantilla.replace(/\{([A-Za-z0-9]+)\}/g, function (_, k) {
      if (v[k] === undefined) throw new Error('Falta el hueco {' + k + '} en «' + plantilla + '»');
      return v[k];
    });
  }

  function sinPuntoFinal(s) { return String(s || '').replace(/[.\s]+$/, ''); }

  /* ───────────────────────── Redacción ───────────────────────── */

  function Redactor(opciones, piezas, L) {
    var F = FRASES[opciones.idioma] || FRASES.es;
    var base = EDU.azar(opciones.semilla).derivar('redactor');
    var nivel = opciones.nivel;
    var sencillo = nivel === 'infantil' || nivel === 'primaria';

    // Cada pieza tiene su propio azar: añadir o quitar piezas no cambia las elecciones de las demás.
    function azarDe(clave) { return base.derivar(clave); }
    function elegir(lista, rng) { return rng.uno(lista); }

    function sint(titulo, op) { return L.sintagma(titulo, op); }
    function min(t) { return L.minusculaInicial(t, L.analizar(t).propio); }

    function valores(titulo, extra) {
      var s = sint(titulo), S = sint(titulo, { inicio: true }), s0 = sint(titulo, { articulo: 'ninguno' });
      var v = { S: S.texto, s: s.texto, s0: s0.texto, T: titulo, t0: min(titulo) };
      Object.keys(extra || {}).forEach(function (k) { v[k] = extra[k]; });
      return { v: v, seguro: s.seguro };
    }

    // ¿Puede ir el texto en minúscula tras un conector? Solo si empieza por palabra funcional.
    function textoTrasConector(t) {
      var primera = String(t || '').split(/\s+/)[0] || '';
      return FUNCIONALES[primera.toLowerCase()] ? primera.toLowerCase() + t.slice(primera.length) : null;
    }

    // Relación como oración (plantilla del paquete de lengua) o, si el género no es seguro, con el nombre del catálogo.
    function oracionRelacion(p, rng) {
      var d = p.datos;
      var plantillas = L.plantillasRelacion(d.tipo);
      var o = L.oracion(elegir(plantillas, rng), { de: d.de.titulo, a: d.a.titulo });
      if (!o.seguro) {
        var nombre = (EDU.esquemas.relacion(d.tipo) || {}).nombre || d.tipo;
        o = { texto: rellenar(F.relacion_segura[0], { T: d.de.titulo, NOMBRE: nombre, TA: d.a.titulo }), seguro: true, catalogo: nombre };
      }
      var hs = [hecho('titulo', d.de.uc, d.de.titulo), hecho('titulo', d.a.uc, d.a.titulo), { campo: 'relacion', tipo: d.tipo, de: d.de.uc, a: d.a.uc, valor: d.tipo }];
      return afirmacion(o.texto, [p.id].concat(p.desde), hs, o.catalogo ? { catalogo: o.catalogo } : null);
    }

    function relacionCubierta(tipo, de, a) {
      return piezas.filter(function (q) { return q.clase === 'relacion' && q.datos.tipo === tipo && q.datos.de.uc === de && q.datos.a.uc === a; }).map(function (q) { return q.id; });
    }

    /* Una pieza → bloque { tipo, pieza, frases:[afirmación] } (o varios datos más en preguntas). */
    function bloque(p) {
      var d = p.datos, rng = azarDe(p.id);
      if (p.estado === 'pendiente') return { tipo: 'pendiente', pieza: p.id, clase: p.clase, nota: p.nota || 'Pendiente de contenido' };
      switch (p.clase) {
        case 'concepto':
        case 'subconcepto': {
          var fr = [];
          if (d.tipo === 'fecha' && d.fecha) fr.push(afirmacion(rellenar(elegir(F.fecha, rng), { T: d.titulo, FECHA: d.fecha }), [p.id, d.uc], [hecho('titulo', d.uc, d.titulo), hecho('fecha', d.uc, d.fecha)]));
          if (d.tipo === 'formula' && d.expresion) fr.push(afirmacion(rellenar(elegir(F.formula, rng), { T: d.titulo, t0: min(d.titulo), EXPR: d.expresion }), [p.id, d.uc], [hecho('titulo', d.uc, d.titulo), hecho('expresion', d.uc, d.expresion)]));
          if (d.texto && d.tipo !== 'concepto' && d.tipo !== 'procedimiento') fr.push(afirmacion(d.texto, [p.id, d.uc], [hecho('texto', d.uc, d.texto)]));
          return { tipo: 'presentacion', pieza: p.id, titulo: d.titulo, frases: fr };
        }
        case 'definicion': {
          var vv = valores(d.de ? tituloDe(d.de) || d.titulo : d.titulo, { TEXTO: d.texto });
          var lista = !vv.seguro ? F.definicion_segura : (sencillo ? F.definicion.concat(F.definicion_sencilla) : F.definicion);
          var hs = [hecho('texto', d.uc, d.texto)];
          var desde = [p.id].concat(p.desde);
          if (d.de) desde = desde.concat(relacionCubierta('define', d.uc, d.de));
          var plantilla = elegir(lista, rng);
          if (/\{[Ss]0?\}|\{T\}|\{t0\}/.test(plantilla)) hs.push(hecho('titulo', d.de || d.uc, vv.v.T));
          return { tipo: 'definicion', pieza: p.id, frases: [afirmacion(rellenar(plantilla, vv.v), desde, hs)] };
        }
        case 'relacion':
          return { tipo: 'relacion', pieza: p.id, frases: [oracionRelacion(p, rng)] };
        case 'ejemplo': {
          var con = L.conector('ejemplo', nivel, rng.entero(0, 9));
          var cubre = [p.id].concat(p.desde, relacionCubierta('ejemplo_de', d.uc, d.de));
          if (!d.texto) {
            var pt = tituloDe(d.de) || '';
            return { tipo: 'ejemplo', pieza: p.id, frases: [afirmacion(rellenar(elegir(F.ejemplo_sin_texto, rng), { CON: con, T: d.titulo, p0: pt ? L.sintagma(pt, { articulo: 'ninguno' }).texto : '' }), cubre, [hecho('titulo', d.uc, d.titulo)].concat(pt ? [hecho('titulo', d.de, pt)] : []))] };
          }
          var bajo = textoTrasConector(d.texto);
          var pl = elegir(bajo ? F.ejemplo : F.ejemplo_segura, rng);
          return { tipo: 'ejemplo', pieza: p.id, frases: [afirmacion(rellenar(pl, { CON: con, TEXTO: d.texto, texto: bajo || d.texto }), cubre, [hecho('texto', d.uc, d.texto)])] };
        }
        case 'procedimiento': {
          var inf = L.analizar(d.titulo).infinitivo;
          var intro = afirmacion(rellenar(elegir(inf ? F.pasos_infinitivo : F.pasos, rng), { T: d.titulo, t0: min(d.titulo) }), [p.id, d.uc], [hecho('titulo', d.uc, d.titulo)]);
          var pasos = d.pasos.map(function (paso, i) { return afirmacion((i + 1) + '. ' + paso, [p.id, d.uc], [hecho('paso', d.uc, paso)], { orden: i + 1 }); });
          return { tipo: 'pasos', pieza: p.id, frases: [intro].concat(pasos) };
        }
        case 'ejercicio': {
          var fr2 = d.resueltos.map(function (r) { return afirmacion(rellenar(elegir(F.resuelto, rng), { TEXTO: r.texto }), [p.id, r.uc, d.procedimiento.uc], [hecho('texto', r.uc, r.texto)]); });
          return { tipo: 'ejercicio', pieza: p.id, frases: fr2 };
        }
        case 'pregunta': return pregunta(p, rng);
        case 'repaso': {
          var cab = afirmacion(rellenar(F.repaso[0], { CON: L.conector('resumen', nivel, rng.entero(0, 9)) }), [p.id], []);
          var items = d.items.map(function (it) {
            var hs2 = [hecho('titulo', it.uc, it.titulo)], t;
            if (it.texto) { t = rellenar(F.repaso_item[0], { T: it.titulo, TEXTO: it.texto }); hs2.push(hecho('texto', it.uc, it.texto)); }
            else if (it.fecha) { t = rellenar(F.repaso_item[1], { T: it.titulo, FECHA: it.fecha }); hs2.push(hecho('fecha', it.uc, it.fecha)); }
            else if (it.expresion) { t = rellenar(F.repaso_item[2], { T: it.titulo, EXPR: it.expresion }); hs2.push(hecho('expresion', it.uc, it.expresion)); }
            else t = rellenar(F.repaso_item[3], { T: it.titulo });
            if (it.texto && it.fecha) { t = t + ' ' + rellenar(F.fecha[1], { T: it.titulo, FECHA: it.fecha }); hs2.push(hecho('fecha', it.uc, it.fecha)); }
            return afirmacion(t, [p.id, it.uc], hs2);
          });
          return { tipo: 'repaso', pieza: p.id, frases: [cab].concat(items) };
        }
        case 'visualizacion': {
          var tv = d.titulo || (d.de && d.de.titulo) || null;
          var fv = tv ? afirmacion(rellenar(F.visual[0], { T: tv }), [p.id], [hecho('titulo', d.uc || (d.de && d.de.uc), tv)]) : afirmacion(F.visual[1], [p.id], []);
          return { tipo: 'visualizacion', pieza: p.id, forma: d.forma, familias: (d.familias || []).slice(), frases: [fv] };
        }
      }
      return { tipo: 'pendiente', pieza: p.id, clase: p.clase, nota: 'Clase de pieza sin redacción' };
    }

    var titulos = {};
    piezas.forEach(function (p) {
      (function recoger(v) {
        if (!v || typeof v !== 'object') return;
        if (Array.isArray(v)) { v.forEach(recoger); return; }
        if (typeof v.uc === 'string' && typeof v.titulo === 'string' && !titulos[v.uc]) titulos[v.uc] = v.titulo;
        Object.keys(v).forEach(function (k) { recoger(v[k]); });
      })(p.datos);
    });
    function tituloDe(uc) { return titulos[uc]; }

    function pregunta(p, rng) {
      var d = p.datos, desde = [p.id].concat(p.desde), b = { tipo: 'pregunta', pieza: p.id, modo: d.modo };
      // lista = [con artículo, sin artículo]. La segunda solo si el género no es seguro.
      function conTitulo(lista, titulo, extra) {
        var vv = valores(titulo, extra);
        return rellenar(vv.seguro ? lista[0] : lista[1], vv.v);
      }
      switch (d.modo) {
        case 'definicion':
          b.enunciado = afirmacion(rellenar(elegir(F.p_definicion, rng), { TEXTO: sinPuntoFinal(d.pista.texto) }), desde, [hecho('texto', d.pista.uc, sinPuntoFinal(d.pista.texto))]);
          b.respuesta = afirmacion(rellenar(F.respuesta[0], { T: d.respuesta.titulo }), desde, [hecho('titulo', d.respuesta.uc, d.respuesta.titulo)]);
          break;
        case 'fecha':
          b.enunciado = afirmacion(conTitulo(F.p_fecha, d.sobre.titulo), desde, [hecho('titulo', d.sobre.uc, d.sobre.titulo)]);
          b.respuesta = afirmacion(rellenar(F.respuesta[1], { FECHA: d.respuesta.fecha }), desde, [hecho('fecha', d.respuesta.uc, d.respuesta.fecha)]);
          break;
        case 'formula':
          b.enunciado = afirmacion(conTitulo(F.p_formula, d.sobre.titulo), desde, [hecho('titulo', d.sobre.uc, d.sobre.titulo)]);
          b.respuesta = afirmacion(rellenar(F.respuesta[2], { EXPR: d.respuesta.expresion }), desde, [hecho('expresion', d.respuesta.uc, d.respuesta.expresion)]);
          break;
        case 'causa':
          b.enunciado = afirmacion(conTitulo(F.p_causa, d.sobre.titulo), desde, [hecho('titulo', d.sobre.uc, d.sobre.titulo)]);
          b.respuesta = afirmacion(rellenar(F.respuesta[0], { T: d.respuesta.titulo }), desde, [hecho('titulo', d.respuesta.uc, d.respuesta.titulo)]);
          break;
        case 'verdadero': {
          var o = oracionRelacion({ id: p.id, desde: p.desde, datos: { tipo: d.afirmacion.tipo, de: d.afirmacion.de, a: d.afirmacion.a } }, rng);
          b.enunciado = afirmacion(rellenar(F.p_verdadero[0], { ORACION: o.texto }), desde, o.hechos, o.catalogo ? { catalogo: o.catalogo } : null);
          b.respuesta = afirmacion(F.r_verdadero[0], desde, []);
          break;
        }
        case 'ordenar_pasos':
          b.enunciado = afirmacion(rellenar(elegir(F.p_ordenar_pasos, rng), { t0: min(d.sobre.titulo) }), desde, [hecho('titulo', d.sobre.uc, d.sobre.titulo)]);
          b.opciones = rng.barajar(d.respuesta.pasos).map(function (x) { return afirmacion(x, desde, [hecho('paso', d.respuesta.uc, x)]); });
          b.respuesta = d.respuesta.pasos.map(function (x, i) { return afirmacion((i + 1) + '. ' + x, desde, [hecho('paso', d.respuesta.uc, x)]); });
          break;
        case 'ordenar':
          b.enunciado = afirmacion(elegir(F.p_ordenar, rng), desde, []);
          b.opciones = rng.barajar(d.respuesta).map(function (x) { return afirmacion(x.titulo, desde, [hecho('titulo', x.uc, x.titulo)]); });
          b.respuesta = d.respuesta.map(function (x, i) {
            var hs = [hecho('titulo', x.uc, x.titulo)], t = (i + 1) + '. ' + x.titulo;
            if (x.fecha) { t = (i + 1) + '. ' + rellenar(F.fecha[1], { T: x.titulo, FECHA: x.fecha }); hs.push(hecho('fecha', x.uc, x.fecha)); }
            return afirmacion(t, desde, hs);
          });
          break;
        case 'clasificar': {
          var tipos = d.respuesta.map(function (x) { return x.relacion; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
          var lista = tipos.length === 1 && tipos[0] === 'parte_de' ? F.p_clasificar_parte : tipos.length === 1 && tipos[0] === 'es_un' ? F.p_clasificar_tipo : F.p_clasificar;
          b.enunciado = afirmacion(conTitulo(lista, d.grupo.titulo), desde, [hecho('titulo', d.grupo.uc, d.grupo.titulo)]);
          b.respuesta = d.respuesta.map(function (x) { return afirmacion(rellenar(F.respuesta[0], { T: x.titulo }), desde, [hecho('titulo', x.uc, x.titulo), { campo: 'relacion', tipo: x.relacion, de: x.uc, a: d.grupo.uc, valor: x.relacion }]); });
          break;
        }
        case 'emparejar':
          b.enunciado = afirmacion(F.p_emparejar[0], desde, []);
          b.opciones = {
            conceptos: rng.barajar(d.respuesta).map(function (x) { return afirmacion(x.titulo, desde, [hecho('titulo', x.uc, x.titulo)]); }),
            definiciones: rng.barajar(d.respuesta).map(function (x) { return afirmacion(x.texto, desde, [hecho('texto', x.uc, x.texto)]); })
          };
          b.respuesta = d.respuesta.map(function (x) { return afirmacion(x.titulo + ': ' + x.texto, desde, [hecho('titulo', x.uc, x.titulo), hecho('texto', x.uc, x.texto)]); });
          break;
        default:
          return { tipo: 'pendiente', pieza: p.id, clase: p.clase, nota: 'Modo de pregunta sin redacción: ' + d.modo };
      }
      return b;
    }

    // «Además» solo entre afirmaciones de relación independientes, nunca delante de un nombre propio.
    function enlazar(bloques) {
      var n = 0;
      bloques.forEach(function (b) {
        if (b.tipo !== 'relacion') { n = 0; return; }
        n++;
        var a = b.frases[0];
        if (n > 1 && !a.catalogo && azarDe(b.pieza + '|enlace').siguiente() < 0.5) {
          var bajo = textoTrasConector(a.texto);
          if (bajo) a.texto = L.conector('adicion', nivel, azarDe(b.pieza + '|con').entero(0, 9)) + ', ' + bajo;
        }
      });
      return bloques;
    }

    function objetivo(o) {
      var s = sint(o.objeto.titulo);
      var usar = s.seguro ? s.texto : o.objeto.titulo;
      var t = L.contraer(rellenar(F.objetivo[0], { VERBO: o.verbo, s: usar }));
      return afirmacion(t, o.desde, [{ campo: 'verbo', uc: null, valor: o.verbo }, hecho('titulo', o.objeto.uc, o.objeto.titulo)]);
    }

    return { F: F, bloque: bloque, enlazar: enlazar, objetivo: objetivo, azarDe: azarDe, elegir: elegir, sint: sint };
  }

  function redactar(sec, estructuras, opciones) {
    opciones = opciones || {};
    if (!sec || !sec.modulos) throw new Error('Falta la secuencia a redactar');
    if (Object.prototype.toString.call(estructuras) !== '[object Array]') estructuras = [estructuras];
    var L = lengua(opciones.idioma);
    var piezas = [], porId = {};
    estructuras.forEach(function (e) { (e.piezas || []).forEach(function (p) { if (!porId[p.id]) { porId[p.id] = p; piezas.push(p); } }); });
    var op = {
      semilla: typeof opciones.semilla === 'number' || typeof opciones.semilla === 'string' ? opciones.semilla : 1,
      idioma: opciones.idioma || 'es', nivel: sec.nivel
    };
    var R = Redactor(op, piezas, L);
    var conPreguntas = opciones.preguntas !== false, conObjetivos = opciones.objetivos !== false, conPendientes = opciones.pendientes !== false;
    var omitidas = [];

    function bloquesDe(fases) {
      var bs = [];
      fases.forEach(function (f) {
        f.piezas.forEach(function (id) {
          var p = porId[id];
          if (!p) throw new Error('La secuencia cita una pieza que no está en las estructuras: ' + id);
          if (!conPreguntas && p.clase === 'pregunta') { omitidas.push(id); return; }
          if (!conPendientes && p.estado === 'pendiente') { omitidas.push(id); return; }
          bs.push(R.bloque(p));
        });
      });
      return R.enlazar(bs);
    }

    var secciones = sec.modulos.map(function (m) {
      return {
        id: m.id, orden: m.orden, uc: m.uc, titulo: m.titulo, ordenIndeterminado: !!m.ordenIndeterminado,
        objetivos: conObjetivos ? m.objetivos.map(R.objetivo) : [],
        bloques: bloquesDe(m.fases)
      };
    });

    var requisitos = null;
    if (sec.requisitosPrevios && sec.requisitosPrevios.length) {
      var rng = R.azarDe('requisitos');
      var partes = sec.requisitosPrevios.map(function (r) { var s = R.sint(r.titulo); return s.seguro ? s.texto : r.titulo; });
      requisitos = afirmacion(L.contraer(rellenar(R.elegir(R.F.requisitos, rng), { LISTA: L.unirLista(partes) })),
        [].concat.apply([], sec.requisitosPrevios.map(function (r) { return r.desde.concat([r.uc]); })),
        sec.requisitosPrevios.map(function (r) { return hecho('titulo', r.uc, r.titulo); }));
    }

    var sintesis = {
      titulo: R.F.titulo_sintesis[0],
      objetivos: conObjetivos ? (sec.sintesis.objetivos || []).map(function (o) {
        return afirmacion(rellenar(R.F.objetivo_sintesis[0], { VERBO: o.verbo }), o.desde, [{ campo: 'verbo', uc: null, valor: o.verbo }]);
      }) : [],
      bloques: bloquesDe(sec.sintesis.fases || [])
    };

    return {
      id: 'red_' + EDU.hash(sec.id + '|' + op.semilla + '|' + op.idioma + '|' + [conPreguntas, conObjetivos, conPendientes].join()),
      secuencia: sec.id, nivel: sec.nivel, idioma: op.idioma, semilla: op.semilla,
      requisitos: requisitos, secciones: secciones, sintesis: sintesis,
      indeterminado: (sec.indeterminado || []).slice(), omitidas: omitidas,
      estructuras: estructuras.map(function (e) { return e.id; })
    };
  }

  /* ───────────────────────── Recorrido ───────────────────────── */

  function afirmaciones(red) {
    var todas = [];
    function de(b) {
      if (b.frases) b.frases.forEach(function (a) { todas.push({ a: a, bloque: b }); });
      if (b.enunciado) todas.push({ a: b.enunciado, bloque: b });
      [].concat(b.opciones && b.opciones.conceptos ? b.opciones.conceptos.concat(b.opciones.definiciones) : (b.opciones || []), b.respuesta ? [].concat(b.respuesta) : [])
        .forEach(function (a) { todas.push({ a: a, bloque: b }); });
    }
    if (red.requisitos) todas.push({ a: red.requisitos, bloque: null });
    red.secciones.forEach(function (s) { s.objetivos.forEach(function (a) { todas.push({ a: a, bloque: null }); }); s.bloques.forEach(de); });
    red.sintesis.objetivos.forEach(function (a) { todas.push({ a: a, bloque: null }); });
    red.sintesis.bloques.forEach(de);
    return todas;
  }

  // Lista canónica de hechos (para comprobar que la variación no los cambia).
  function hechos(red) {
    var claves = {};
    afirmaciones(red).forEach(function (x) {
      x.a.hechos.forEach(function (h) {
        if (h.campo === 'verbo') return;
        claves[h.campo === 'relacion' ? 'relacion|' + h.tipo + '|' + h.de + '|' + h.a : h.campo + '|' + h.uc + '|' + h.valor] = true;
      });
    });
    return Object.keys(claves).sort();
  }

  /* ───────────────────────── Auditoría ───────────────────────── */

  // Vocabulario de marco: plantillas del redactor + paquete de lengua. Nada más puede aparecer fuera de los hechos.
  var vocabularios = {};
  function palabras(t) { return String(t || '').toLowerCase().split(/[^a-záéíóúüñ]+/).filter(Boolean); }

  function vocabulario(idioma) {
    if (vocabularios[idioma]) return vocabularios[idioma];
    var L = lengua(idioma), V = {};
    function pon(t) { palabras(String(t).replace(/\{[A-Za-z0-9]+\}/g, ' ')).forEach(function (w) { V[w] = true; }); }
    var F = FRASES[idioma] || FRASES.es;
    Object.keys(F).forEach(function (k) { F[k].forEach(pon); });
    'el la los las un una unos unas lo del al y e o u'.split(' ').forEach(pon);
    L.tiposConector().forEach(function (t) { ['infantil', 'universidad'].forEach(function (n) { L.conectores(t, n).forEach(pon); }); });
    var cat = EDU.esquemas.catalogo('tiposRelacion');
    Object.keys(cat).forEach(function (t) {
      pon(cat[t].nombre);
      L.plantillasRelacion(t).forEach(function (pl) {
        pon(pl.c.replace(/@\S+/g, ''));
        (pl.c.match(/@(\S+)/g) || []).forEach(function (m) { var a = m.slice(1); [['m', 'sg'], ['f', 'sg'], ['m', 'pl'], ['f', 'pl']].forEach(function (gn) { pon(L.concordar(a, gn[0], gn[1])); }); });
        if (pl.v) ['sg', 'pl'].forEach(function (n) { pon(L.conjugar(pl.v, 'presente', 3, n)); });
      });
    });
    vocabularios[idioma] = V;
    return V;
  }

  // Búsqueda sin distinguir mayúsculas y respetando los límites de palabra
  // («el Terror» no debe encontrarse dentro de «del Terror»).
  var LETRA = /[a-záéíóúüñ0-9]/i;
  function posicion(texto, valor) {
    var t = String(texto).toLowerCase(), v = String(valor).toLowerCase(), desde = 0, i;
    if (!v) return -1;
    while ((i = t.indexOf(v, desde)) >= 0) {
      var antes = i === 0 || !LETRA.test(t.charAt(i - 1)) || !LETRA.test(v.charAt(0));
      var despues = i + v.length >= t.length || !LETRA.test(t.charAt(i + v.length)) || !LETRA.test(v.charAt(v.length - 1));
      if (antes && despues) return i;
      desde = i + 1;
    }
    return -1;
  }
  function contiene(texto, valor) { return posicion(texto, valor) >= 0; }
  function quitar(texto, valor) { var t = String(texto), i; while ((i = posicion(t, valor)) >= 0) t = t.slice(0, i) + ' ' + t.slice(i + String(valor).length); return t; }

  function auditar(red, estructuras) {
    if (Object.prototype.toString.call(estructuras) !== '[object Array]') estructuras = [estructuras];
    var problemas = [], V = vocabulario(red.idioma || 'es');
    var piezas = {}, ids = {}, fuentes = {}, relaciones = {};
    estructuras.forEach(function (e) {
      (e.piezas || []).forEach(function (p) {
        piezas[p.id] = p; ids[p.id] = true;
        (p.desde || []).forEach(function (d) { ids[d] = true; });
        if (p.clase === 'relacion') relaciones[p.datos.tipo + '|' + p.datos.de.uc + '|' + p.datos.a.uc] = true;
        if (p.clase === 'pregunta' && p.datos.modo === 'clasificar') p.datos.respuesta.forEach(function (x) { relaciones[x.relacion + '|' + x.uc + '|' + p.datos.grupo.uc] = true; });
        (function recoger(v) {
          if (!v || typeof v !== 'object') return;
          if (Array.isArray(v)) { v.forEach(recoger); return; }
          if (typeof v.uc === 'string') {
            var f = fuentes[v.uc] = fuentes[v.uc] || { titulo: {}, texto: {}, fecha: {}, expresion: {}, paso: {} };
            if (v.titulo) f.titulo[v.titulo] = true;
            if (v.texto) { f.texto[v.texto] = true; f.texto[sinPuntoFinal(v.texto)] = true; }
            if (v.fecha) f.fecha[v.fecha] = true;
            if (v.expresion) f.expresion[v.expresion] = true;
            (v.pasos || []).forEach(function (x) { f.paso[x] = true; });
          }
          Object.keys(v).forEach(function (k) { recoger(v[k]); });
        })(p.datos);
      });
    });

    // Cobertura: una pieza está cubierta si tiene bloque (aunque sea «pendiente», que se muestra
    // como hueco) o si alguna afirmación la cita en su origen.
    var cubiertas = {};
    red.secciones.concat([red.sintesis]).forEach(function (s) {
      s.bloques.forEach(function (b) { cubiertas[b.pieza] = true; });
      if (s.uc && (!fuentes[s.uc] || !fuentes[s.uc].titulo[s.titulo])) problemas.push({ seccion: s.id, problema: 'ALTERADO: el título de sección «' + s.titulo + '» no es el de su unidad' });
    });
    afirmaciones(red).forEach(function (x) {
      var a = x.a;
      // Solo las frases de los bloques cubren piezas: un objetivo que cita una pieza no la redacta.
      a.desde.forEach(function (d) { if (piezas[d] && x.bloque) cubiertas[d] = true; if (!ids[d]) problemas.push({ texto: a.texto, problema: 'Origen desconocido: ' + d }); });
      var resto = a.texto;
      a.hechos.slice().sort(function (h1, h2) { return String(h2.valor).length - String(h1.valor).length; }).forEach(function (h) {
        if (h.campo === 'relacion') {
          if (!relaciones[h.tipo + '|' + h.de + '|' + h.a]) problemas.push({ texto: a.texto, problema: 'Relación que no está en las piezas: ' + h.tipo });
          return;
        }
        if (h.campo !== 'verbo') {
          var f = fuentes[h.uc];
          if (!f || !f[h.campo] || !f[h.campo][h.valor]) problemas.push({ texto: a.texto, problema: 'ALTERADO: «' + h.valor + '» no coincide con ningún ' + h.campo + ' de su fuente' });
        }
        // El verbo del objetivo puede acabar en «de»/«a» y contraerse con el artículo («… de» + «el» → «del»).
        var buscar = h.campo === 'texto' ? sinPuntoFinal(h.valor) : h.campo === 'verbo' ? String(h.valor).replace(/\s+(de|a)$/i, '') : h.valor;
        var forma = !contiene(resto, buscar) && h.campo === 'titulo' ? EDU.lenguas[red.idioma || 'es'].sintagma(h.valor, { articulo: 'ninguno' }).texto : buscar;
        if (!contiene(a.texto, buscar) && !contiene(a.texto, forma)) problemas.push({ texto: a.texto, problema: 'El hecho «' + h.valor + '» no aparece en su frase' });
        resto = quitar(resto, contiene(resto, buscar) ? buscar : forma);
      });
      var ajenas = palabras(resto).filter(function (w) { return !V[w]; });
      if (ajenas.length) problemas.push({ texto: a.texto, problema: 'AÑADIDO: palabras fuera de los hechos y del vocabulario de marco: ' + ajenas.join(', ') });
    });

    var omitidas = {};
    (red.omitidas || []).forEach(function (id) { omitidas[id] = true; });
    var total = 0, nCub = 0;
    Object.keys(piezas).forEach(function (id) {
      var p = piezas[id];
      if (omitidas[id]) return;
      total++;
      if (cubiertas[id]) nCub++;
      else problemas.push({ pieza: id, problema: 'ELIMINADO: la pieza «' + p.clase + '» no aparece en la redacción' });
    });
    return { ok: problemas.length === 0, problemas: problemas, cobertura: { piezas: total, cubiertas: nCub, omitidas: (red.omitidas || []).length } };
  }

  /* ───────────────────────── Texto plano (para revisar) ───────────────────────── */

  function aTexto(red) {
    var out = [];
    function lin(t) { out.push(t); }
    function bloque(b) {
      if (b.tipo === 'pendiente') { lin('[Pendiente: ' + b.nota + ']'); return; }
      if (b.tipo === 'pregunta') {
        lin('• ' + b.enunciado.texto);
        if (b.opciones && b.opciones.conceptos) { lin('   Conceptos: ' + b.opciones.conceptos.map(function (a) { return a.texto; }).join(' | ')); lin('   Definiciones: ' + b.opciones.definiciones.map(function (a) { return a.texto; }).join(' | ')); }
        else if (b.opciones) lin('   ' + b.opciones.map(function (a) { return a.texto; }).join(' | '));
        lin('   → ' + [].concat(b.respuesta).map(function (a) { return a.texto; }).join(' '));
        return;
      }
      if (b.tipo === 'pasos' || b.tipo === 'repaso') { b.frases.forEach(function (a, i) { lin(i ? '   ' + a.texto : a.texto); }); return; }
      if (b.tipo === 'visualizacion') { lin('[' + b.frases[0].texto + ' · ' + b.forma + ']'); return; }
      b.frases.forEach(function (a) { lin(a.texto); });
    }
    if (red.requisitos) { lin(red.requisitos.texto); lin(''); }
    red.secciones.forEach(function (s) {
      lin(s.orden + '. ' + s.titulo);
      if (s.objetivos.length) lin('   ' + FRASES.es.titulo_objetivos[0] + ': ' + s.objetivos.map(function (a) { return a.texto; }).join(' '));
      s.bloques.forEach(bloque);
      lin('');
    });
    lin(red.sintesis.titulo);
    if (red.sintesis.objetivos.length) lin('   ' + FRASES.es.titulo_objetivos[0] + ': ' + red.sintesis.objetivos.map(function (a) { return a.texto; }).join(' '));
    red.sintesis.bloques.forEach(bloque);
    return out.join('\n');
  }

  EDU.redactor = {
    redactar: redactar,
    auditar: auditar,
    hechos: hechos,
    afirmaciones: function (red) { return afirmaciones(red).map(function (x) { return x.a; }); },
    aTexto: aTexto
  };

  EDU.registrar('redactor', EDU.redactor, { requiere: ['base', 'esquemas', 'lengua_es'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
