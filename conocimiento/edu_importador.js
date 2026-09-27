/* edu_importador.js — convierte los apuntes de la usuaria en unidades de conocimiento.
   Módulo 5 de la fase 1. Requiere edu_base, edu_esquemas, edu_almacen y edu_biblioteca.

   Lee texto plano (o Markdown sencillo) y lo traduce a UC y relaciones con
   origen «usuaria». No interpreta el sentido del texto: solo aplica las
   convenciones de escritura de abajo. Lo que no encaja en ninguna se
   guarda tal cual, sin inventar nada.

   CONVENCIONES (una idea por línea)
     Sangría o viñeta (-, *, •, 1., a))   lo sangrado pertenece a la línea de arriba
     # Título, ## Subtítulo              encabezados; ordenan la jerarquía igual que la sangría
     Término: definición                 concepto con su definición
     Término                             concepto sin definición (línea corta sin punto final)
     Frase larga terminada en punto.     dato
     1789: Toma de la Bastilla           fecha (también «Toma de la Bastilla: 14 de julio de 1789»)
     Ej: …  / Ejemplo: …                 ejemplo de la línea de arriba
     Dato: …  / Propiedad: …             dato o propiedad de la línea de arriba
     Definición: …                       definición de la línea de arriba
     Fórmula: a/b — explicación          fórmula
     Procedimiento: título               procedimiento; las líneas sangradas debajo son sus pasos
     Cita: «texto» — Autor               cita
     → causa: X   → requiere: X          relación explícita de la línea de arriba con X
     → es un: X   → parte de: X          (X es otra línea de los apuntes o una UC de la biblioteca
     → antes de: X  → contrasta con: X     con ese mismo título)
     → ver: X                            relación general

   Relación que crea la sangría (hija → madre): ejemplo → ejemplo_de,
   dato/propiedad → propiedad_de, definición → define, cita → relacionado,
   el resto → parte_de.

   TODO O NADA: si una sola línea tiene un error no se guarda nada y el
   informe dice qué línea falla y por qué.

     EDU.importador.analizar(texto, opciones)  → Promise<{ ucs, relaciones, fuente, lineas, enlaces, errores, avisos }>  (no guarda)
     EDU.importador.importar(texto, opciones)  → Promise<informe>  (guarda; rechaza si hay errores)
     EDU.importador.quitarImportacion(fuenteId) → Promise<{ ok, ucs }>
   opciones: { proyecto, rama, nivel, titulo, enlazar (true por defecto) } — proyecto o rama obligatorio. */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base || !EDU.esquemas || !EDU.almacen || !EDU.biblioteca) { if (raiz.console) raiz.console.error('[importador] Faltan edu_base, edu_esquemas, edu_almacen o edu_biblioteca'); return; }
  if (EDU.importador) return;

  var E = EDU.esquemas, A = EDU.almacen, B = EDU.biblioteca;
  var TOPE_TITULO = 80;
  var PASO_ENCABEZADO = 10000;   // separa la profundidad de los encabezados de la sangría

  var PREFIJOS = [
    { re: /^(ej|ejemplo)\s*[:.]\s*/i, tipo: 'ejemplo' },
    { re: /^dato\s*:\s*/i, tipo: 'dato' },
    { re: /^propiedad\s*:\s*/i, tipo: 'propiedad' },
    { re: /^definici[oó]n\s*:\s*/i, tipo: 'definicion' },
    { re: /^f[oó]rmula\s*:\s*/i, tipo: 'formula' },
    { re: /^procedimiento\s*:\s*/i, tipo: 'procedimiento' },
    { re: /^cita\s*:\s*/i, tipo: 'cita' }
  ];

  var MARCAS = {
    'causa': 'causa', 'requiere': 'requiere', 'es un': 'es_un', 'es una': 'es_un',
    'parte de': 'parte_de', 'antes de': 'antes_de', 'contrasta con': 'contrasta_con', 'ver': 'relacionado'
  };

  var POR_SANGRIA = { ejemplo: 'ejemplo_de', dato: 'propiedad_de', propiedad: 'propiedad_de', definicion: 'define', cita: 'relacionado' };

  var MESES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
  /* Un año tiene 3 o 4 cifras, o cualquier cifra seguida de «a. C.» / «d. C.»:
     así «3: …» no se confunde con una fecha. */
  var ERA = '\\s*[ad]\\.?\\s?c\\.?';
  var ANIO = '(\\d{3,4}(' + ERA + ')?|\\d{1,4}' + ERA + ')';
  var RE_FECHA = new RegExp('^(' +
    '(\\d{1,2}\\s+de\\s+)?((' + MESES + ')\\s+de\\s+)?' + ANIO +
    '|' + ANIO + '\\s*[-–—]\\s*' + ANIO +
    '|siglo\\s+[ivxlc]+(' + ERA + ')?' +
    ')$', 'i');

  function esFecha(s) { return RE_FECHA.test(String(s || '').trim()); }

  function recortar(s) {
    s = String(s || '').trim().replace(/[.;:]+$/, '');
    return s.length <= TOPE_TITULO ? s : s.slice(0, TOPE_TITULO - 1).replace(/\s+\S*$/, '') + '…';
  }

  /* ───────────────────────── Lectura de líneas ───────────────────────── */

  // Cada línea útil → { n, prof, texto }. prof combina encabezados y sangría.
  function leerLineas(texto) {
    var salida = [], encabezado = 0;
    String(texto || '').replace(/\r\n?/g, '\n').split('\n').forEach(function (bruta, i) {
      if (!bruta.trim()) return;
      var h = /^\s*(#{1,6})\s+(.*)$/.exec(bruta);
      if (h) {
        encabezado = h[1].length;
        salida.push({ n: i + 1, prof: (encabezado - 1) * PASO_ENCABEZADO, texto: h[2].trim(), encabezado: true });
        return;
      }
      var sangria = /^[ \t]*/.exec(bruta)[0].replace(/\t/g, '    ').length;
      var limpio = bruta.trim().replace(/^([-*•·]|\d{1,3}[.)]|[a-z][)])\s+/i, '');
      salida.push({ n: i + 1, prof: encabezado * PASO_ENCABEZADO + sangria, texto: limpio.trim() });
    });
    return salida;
  }

  /* Clasifica una línea sin mirar su contexto.
     → { clase:'uc', tipo, titulo, texto, campos } | { clase:'marca', rel, destino } | { error } */
  function clasificar(t) {
    var m = /^(→|->)\s*([^:]+?)\s*:\s*(.+)$/.exec(t);
    if (m) {
      var rel = MARCAS[EDU.normalizar(m[2])];
      if (!rel) return { error: 'Relación desconocida «' + m[2] + '». Usa: ' + Object.keys(MARCAS).join(', ') };
      return { clase: 'marca', rel: rel, destino: m[3].trim() };
    }
    if (/^(→|->)/.test(t)) return { error: 'Relación mal escrita: usa «→ causa: título»' };

    for (var i = 0; i < PREFIJOS.length; i++) {
      var p = PREFIJOS[i], r = p.re.exec(t);
      if (!r) continue;
      var resto = t.slice(r[0].length).trim();
      if (!resto) return { error: 'Falta el contenido después de «' + r[0].trim() + '»' };
      if (p.tipo === 'formula') {
        var f = resto.split(/\s+[—–-]\s+/);
        return { clase: 'uc', tipo: 'formula', titulo: recortar(f[0]), texto: f.slice(1).join(' — '), campos: { expresion: f[0].trim() } };
      }
      if (p.tipo === 'cita') {
        var c = /^(.*?)\s+[—–-]\s+([^—–-]+)$/.exec(resto);
        if (!c) return { error: 'Una cita necesita autor: «Cita: texto — Autor»' };
        var dicho = c[1].replace(/^[«"“]|[»"”]$/g, '').trim();
        return { clase: 'uc', tipo: 'cita', titulo: recortar(dicho), texto: dicho, campos: { autor: c[2].trim() } };
      }
      if (p.tipo === 'procedimiento') return { clase: 'uc', tipo: 'procedimiento', titulo: recortar(resto), texto: '', campos: { pasos: [] } };
      return { clase: 'uc', tipo: p.tipo, titulo: recortar(resto), texto: resto, campos: {} };
    }

    var dos = /^([^:]{1,80}?)\s*:\s+(.+)$/.exec(t);
    if (dos) {
      var cab = dos[1].trim(), cola = dos[2].trim();
      if (esFecha(cab)) return { clase: 'uc', tipo: 'fecha', titulo: recortar(cola), texto: '', campos: { fecha: cab } };
      if (esFecha(cola)) return { clase: 'uc', tipo: 'fecha', titulo: recortar(cab), texto: '', campos: { fecha: cola } };
      return { clase: 'uc', tipo: 'concepto', titulo: cab, texto: cola, campos: {} };
    }
    var guion = /^(.{1,40}?)\s+[—–-]\s+(.+)$/.exec(t);
    if (guion && esFecha(guion[1])) return { clase: 'uc', tipo: 'fecha', titulo: recortar(guion[2]), texto: '', campos: { fecha: guion[1].trim() } };

    if (t.length <= TOPE_TITULO && !/[.!?]$/.test(t)) return { clase: 'uc', tipo: 'concepto', titulo: t, texto: '', campos: {} };
    return { clase: 'uc', tipo: 'dato', titulo: recortar(t), texto: t, campos: {} };
  }

  /* ───────────────────────── Análisis ───────────────────────── */

  function nivelesDe(opciones) {
    if (opciones.nivel) return Promise.resolve([opciones.nivel]);
    if (!opciones.rama) return Promise.resolve([]);
    return B.ruta(opciones.rama).then(function (camino) {
      var n = camino.filter(function (r) { return r.nivel; }).pop();
      return n ? [n.nivel] : [];
    });
  }

  // Busca un título en los apuntes y, si no está, en la biblioteca (título exacto, sin tildes).
  function resolverDestino(titulo, propios, biblio) {
    var q = EDU.normalizar(titulo);
    var enApuntes = propios.filter(function (u) { return EDU.normalizar(u.titulo) === q; });
    if (enApuntes.length === 1) return { id: enApuntes[0].id };
    if (enApuntes.length > 1) return { error: 'El título «' + titulo + '» aparece varias veces en los apuntes' };
    var enBiblio = biblio.filter(function (u) { return EDU.normalizar(u.titulo) === q; });
    if (enBiblio.length === 1) return { id: enBiblio[0].id, biblioteca: true };
    if (enBiblio.length > 1) return { error: 'El título «' + titulo + '» es ambiguo: hay ' + enBiblio.length + ' unidades con ese nombre en la biblioteca' };
    return { error: 'No se encuentra «' + titulo + '» ni en los apuntes ni en la biblioteca' };
  }

  function analizar(texto, opciones) {
    opciones = opciones || {};
    var errores = [], avisos = [];
    function err(n, mensaje, linea) { errores.push({ linea: n, mensaje: mensaje, texto: linea || '' }); }

    if (!opciones.proyecto && !opciones.rama) {
      return Promise.resolve({ ucs: [], relaciones: [], fuente: null, lineas: [], enlaces: [], avisos: [], errores: [{ linea: 0, mensaje: 'Indica el proyecto o la rama a la que pertenecen los apuntes', texto: '' }] });
    }
    var lineas = leerLineas(texto);
    if (!lineas.length) {
      return Promise.resolve({ ucs: [], relaciones: [], fuente: null, lineas: [], enlaces: [], avisos: [], errores: [{ linea: 0, mensaje: 'Los apuntes están vacíos', texto: '' }] });
    }

    return Promise.all([nivelesDe(opciones), A.listar('uc')]).then(function (r) {
      var niveles = r[0], todas = r[1];
      var biblio = todas.filter(function (u) { return u.origen === 'biblioteca'; });
      var titulo = opciones.titulo || 'Apuntes';
      var fuente = E.crear('fuente', {
        id: EDU.idEstable('fue', 'apuntes|' + (opciones.proyecto || opciones.rama) + '|' + titulo),
        clase: 'apuntes', titulo: titulo, licencia: 'propia', nota: 'Aportación de la usuaria'
      });

      var ucs = [], marcas = [], jerarquia = [], mapaLineas = [], pila = [], vistos = {};
      lineas.forEach(function (l) {
        while (pila.length && pila[pila.length - 1].prof >= l.prof) pila.pop();
        var madre = pila.length ? pila[pila.length - 1] : null;

        // Dentro de un procedimiento, cada línea sangrada es un paso.
        if (madre && madre.uc.tipo === 'procedimiento' && !l.encabezado && !/^(→|->)/.test(l.texto)) {
          madre.uc.campos.pasos.push(l.texto);
          mapaLineas.push({ linea: l.n, clase: 'paso', de: madre.uc.id });
          return;
        }

        var c = clasificar(l.texto);
        if (c.error) { err(l.n, c.error, l.texto); return; }

        if (c.clase === 'marca') {
          if (!madre) { err(l.n, 'Una relación «→» debe ir sangrada debajo de la línea a la que pertenece', l.texto); return; }
          marcas.push({ linea: l.n, texto: l.texto, de: madre.uc, rel: c.rel, destino: c.destino });
          mapaLineas.push({ linea: l.n, clase: 'relacion' });
          return;
        }

        if (c.tipo === 'definicion' && !madre) { err(l.n, '«Definición:» debe ir debajo del concepto que define', l.texto); return; }
        if (c.tipo === 'ejemplo' && !madre) avisos.push({ linea: l.n, mensaje: 'Ejemplo sin línea de arriba: se guarda suelto' });
        var titu = c.titulo;
        if (c.tipo === 'definicion') titu = 'Definición de ' + madre.uc.titulo;
        if (!titu || !titu.trim()) { err(l.n, 'La línea no tiene título', l.texto); return; }

        var uc = E.crear('uc', {
          tipo: c.tipo, titulo: titu, texto: c.texto, campos: c.campos,
          rama: opciones.rama || null, proyecto: opciones.proyecto || null,
          niveles: niveles.slice(), fuente: fuente.id, origen: 'usuaria', idioma: 'es'
        });
        if (vistos[uc.id]) { err(l.n, 'Repite la línea ' + vistos[uc.id] + ' (mismo tipo y título)', l.texto); return; }
        vistos[uc.id] = l.n;
        ucs.push(uc);
        mapaLineas.push({ linea: l.n, clase: 'uc', id: uc.id, tipo: uc.tipo });
        if (madre) jerarquia.push({ linea: l.n, de: uc, a: madre.uc });
        pila.push({ prof: l.prof, uc: uc });
      });

      ucs.forEach(function (u) {
        if (u.tipo === 'procedimiento' && !u.campos.pasos.length) err(vistos[u.id], 'El procedimiento «' + u.titulo + '» no tiene pasos sangrados debajo', u.titulo);
      });

      var relaciones = [];
      function anadirRel(tipo, de, a, nota) {
        var o = E.crear('relacion', { tipo: tipo, de: de, a: a, origen: 'usuaria', nota: nota });
        if (!relaciones.some(function (x) { return x.id === o.id; })) relaciones.push(o);
      }
      jerarquia.forEach(function (j) { anadirRel(POR_SANGRIA[j.de.tipo] || 'parte_de', j.de.id, j.a.id); });
      marcas.forEach(function (m) {
        var d = resolverDestino(m.destino, ucs, biblio);
        if (d.error) { err(m.linea, d.error, m.texto); return; }
        if (d.id === m.de.id) { err(m.linea, 'Una línea no puede relacionarse consigo misma', m.texto); return; }
        anadirRel(m.rel, m.de.id, d.id);
      });

      // Enlaces con la biblioteca: mismo título → «relacionado» (se puede desactivar).
      var enlaces = [];
      if (opciones.enlazar !== false) {
        ucs.forEach(function (u) {
          var q = EDU.normalizar(u.titulo);
          biblio.forEach(function (b) {
            if (b.id !== u.id && EDU.normalizar(b.titulo) === q) {
              enlaces.push({ uc: u.id, biblioteca: b.id, titulo: b.titulo });
              anadirRel('relacionado', u.id, b.id, 'Mismo título en la biblioteca');
            }
          });
        });
      }

      // Validación final con los esquemas: nada pasa sin cumplir el contrato.
      // Una línea que ya tiene su error no se repite con el mensaje técnico.
      var conError = {};
      errores.forEach(function (e) { conError[e.linea] = true; });
      ucs.forEach(function (u) {
        if (conError[vistos[u.id]]) return;
        E.validar('uc', u).errores.forEach(function (e) { err(vistos[u.id], e.campo + ': ' + e.mensaje, u.titulo); });
      });
      relaciones.forEach(function (x) {
        E.validar('relacion', x).errores.forEach(function (e) { err(0, 'Relación: ' + e.campo + ': ' + e.mensaje, ''); });
      });
      E.validar('fuente', fuente).errores.forEach(function (e) { err(0, 'Fuente: ' + e.mensaje, ''); });

      errores.sort(function (a, b) { return a.linea - b.linea; });
      return { ucs: ucs, relaciones: relaciones, fuente: fuente, lineas: mapaLineas, enlaces: enlaces, errores: errores, avisos: avisos };
    });
  }

  /* ───────────────────────── Importación ───────────────────────── */

  function importar(texto, opciones) {
    return analizar(texto, opciones).then(function (an) {
      if (an.errores.length) {
        var e = new Error('Los apuntes tienen ' + an.errores.length + ' error(es); no se ha guardado nada');
        e.errores = an.errores;
        EDU.aviso('aviso', 'importador', e.message);
        throw e;
      }
      return A.guardar('fuente', an.fuente)
        .then(function () { return A.guardarVarios('uc', an.ucs); })
        .then(function () { return A.guardarVarios('relacion', an.relaciones); })
        .then(function () {
          var informe = {
            ok: true, fuente: an.fuente.id,
            cuenta: { ucs: an.ucs.length, relaciones: an.relaciones.length, enlaces: an.enlaces.length },
            porTipo: an.ucs.reduce(function (m, u) { m[u.tipo] = (m[u.tipo] || 0) + 1; return m; }, {}),
            ids: an.ucs.map(function (u) { return u.id; }),
            avisos: an.avisos
          };
          EDU.emitir('importador:importado', informe);
          EDU.emitir('biblioteca:cambio', { motivo: 'importacion', fuente: an.fuente.id });
          return informe;
        });
    });
  }

  // Deshace una importación: borra sus UC (con sus relaciones) y su fuente.
  function quitarImportacion(fuenteId) {
    return A.listar('uc').then(function (ucs) {
      var mias = ucs.filter(function (u) { return u.fuente === fuenteId && u.origen === 'usuaria'; });
      return mias.reduce(function (p, u) { return p.then(function () { return B.borrarUC(u.id); }); }, Promise.resolve())
        .then(function () { return A.borrar('fuente', fuenteId); })
        .then(function () { return { ok: true, ucs: mias.length }; });
    });
  }

  EDU.importador = {
    analizar: analizar,
    importar: importar,
    quitarImportacion: quitarImportacion,
    esFecha: esFecha
  };

  EDU.registrar('importador', EDU.importador, { requiere: ['base', 'esquemas', 'almacen', 'biblioteca'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
