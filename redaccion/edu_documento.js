/* edu_documento.js — texto de autor (contenido pegado o propio) tal como es.
   Fase 2 · asistente. Requiere edu_base, edu_esquemas, edu_almacen y edu_biblioteca.

   El contenido pegado ya es prosa escrita por alguien: no se expande ni se
   reescribe. Se reproduce en su ORDEN ORIGINAL y LITERAL:
     · apartado (concepto sin texto)        → sección con su título
     · «Término: definición»                 → «Término: definición»
     · párrafo o viñeta (dato)               → el párrafo íntegro
   Además se prepara una lámina con el índice de apartados (forma jerarquía)
   para dibujarla con los diseños de FATIMA PRO.

   El resultado tiene la misma forma que una redacción (secciones y bloques
   con afirmaciones), así que el visor y las salidas lo tratan igual y se
   puede combinar con el material generado desde el banco (trabajo híbrido).

     EDU.documento.redactar(raizId) → Promise<documento>
     EDU.documento.auditar(documento) → Promise<{ ok, problemas, cobertura }>
     EDU.documento.combinar(redaccionBanco, documento) → redacción conjunta */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base || !EDU.esquemas || !EDU.almacen || !EDU.biblioteca) { if (raiz.console) raiz.console.error('[documento] Faltan edu_base, edu_esquemas, edu_almacen o edu_biblioteca'); return; }
  if (EDU.documento) return;

  var A = EDU.almacen, B = EDU.biblioteca;

  function hecho(campo, uc, valor) { return { campo: campo, uc: uc, valor: valor }; }
  function afirmacion(texto, uc, hechos) { return { texto: texto, desde: [uc], hechos: hechos }; }
  function porOrden(a, b) { return ((a.orden || 0) - (b.orden || 0)) || (a.titulo < b.titulo ? -1 : 1); }

  // Árbol del documento: hijas por «parte_de», en el orden original.
  function arbol(id, vistos) {
    vistos = vistos || {};
    if (vistos[id]) return Promise.resolve(null);
    vistos[id] = true;
    return A.obtener('uc', id).then(function (u) {
      if (!u) return null;
      return B.relaciones(id, { sentido: 'entrada', tipo: 'parte_de' }).then(function (rels) {
        return Promise.all(rels.map(function (r) { return arbol(r.de, vistos); }));
      }).then(function (hijas) {
        return { uc: u, hijas: hijas.filter(Boolean).sort(function (a, b) { return porOrden(a.uc, b.uc); }) };
      });
    });
  }

  function esApartado(u) { return u.tipo === 'concepto' && !u.texto; }

  function redactar(raizId) {
    return arbol(raizId).then(function (t) {
      if (!t) throw new Error('No existe la unidad «' + raizId + '»');
      var secciones = [], nodosIndice = [], nSec = 0;
      function seccion(nodo, nivel) {
        var s = { id: 'doc_' + nodo.uc.id, orden: ++nSec, uc: nodo.uc.id, titulo: nodo.uc.titulo, nivel: nivel, ordenIndeterminado: false, objetivos: [], bloques: [] };
        secciones.push(s);
        nodosIndice.push({ uc: nodo.uc.id, titulo: nodo.uc.titulo, padre: nivel === 0 ? null : nodo.padre, nivel: nivel });
        nodo.hijas.forEach(function (h) {
          var u = h.uc;
          if (esApartado(u)) { h.padre = nodo.uc.id; seccion(h, nivel + 1); return; }
          var b = u.tipo === 'concepto'
            ? { tipo: 'definicion', pieza: u.id, frases: [afirmacion(u.titulo + ': ' + u.texto, u.id, [hecho('titulo', u.id, u.titulo), hecho('texto', u.id, u.texto)])] }
            : { tipo: 'texto', pieza: u.id, frases: [afirmacion(u.texto, u.id, [hecho('texto', u.id, u.texto)])] };
          s.bloques.push(b);
        });
      }
      seccion(t, 0);
      // Las secciones sin nada propio ni subapartados se quedan (son títulos del autor), pero se marcan.
      secciones.forEach(function (s) { s.vacia = !s.bloques.length; });
      var pieza = {
        id: 'pz_doc_' + EDU.hash(raizId), clase: 'visualizacion', estado: 'con_respaldo', desde: nodosIndice.map(function (n) { return n.uc; }),
        datos: { forma: 'jerarquia', familias: EDU.esquemas.catalogo('formasDato').jerarquia.familias, nodos: nodosIndice }
      };
      var sintesis = { titulo: '', objetivos: [], bloques: [] };
      if (nodosIndice.length >= 3) sintesis.bloques.push({ tipo: 'visualizacion', pieza: pieza.id, forma: 'jerarquia', familias: pieza.datos.familias.slice(), frases: [afirmacion('Esquema: ' + t.uc.titulo + '.', t.uc.id, [hecho('titulo', t.uc.id, t.uc.titulo)])] });
      return {
        tipo: 'documento', id: 'docu_' + EDU.hash(raizId), raiz: raizId, secuencia: null, nivel: (t.uc.niveles || [])[0] || '', idioma: t.uc.idioma || 'es', semilla: 1,
        requisitos: null, secciones: secciones, sintesis: sintesis, indeterminado: [], omitidas: [], estructuras: [],
        piezasExtra: nodosIndice.length >= 3 ? [pieza] : []
      };
    });
  }

  /* Todo lo del documento tiene que ser literal y estar completo:
     cada hecho coincide con su UC y aparece tal cual en su frase; toda UC del
     árbol aparece (como sección o como bloque); y no hay palabras añadidas
     salvo el separador «: » y la palabra de marco «Esquema». */
  function auditar(doc) {
    var problemas = [];
    return arbol(doc.raiz).then(function (t) {
      var todas = {};
      (function recorrer(n) { todas[n.uc.id] = n.uc; n.hijas.forEach(recorrer); })(t);
      var cubiertas = {};
      doc.secciones.forEach(function (s) {
        cubiertas[s.uc] = true;
        if (!todas[s.uc] || todas[s.uc].titulo !== s.titulo) problemas.push({ seccion: s.id, problema: 'ALTERADO: título de sección distinto del original' });
        s.bloques.forEach(function (b) {
          cubiertas[b.pieza] = true;
          b.frases.forEach(function (a) {
            var resto = a.texto;
            a.hechos.forEach(function (h) {
              var u = todas[h.uc];
              if (!u || u[h.campo] !== h.valor) problemas.push({ texto: a.texto, problema: 'ALTERADO: «' + h.valor + '» no coincide con el original' });
              if (resto.indexOf(h.valor) < 0) problemas.push({ texto: a.texto, problema: 'El hecho no aparece literal en su frase' });
              resto = resto.replace(h.valor, '');
            });
            if (resto.replace(/[:\s.]/g, '').length) problemas.push({ texto: a.texto, problema: 'AÑADIDO: texto que no está en el original: «' + resto.trim() + '»' });
          });
        });
      });
      Object.keys(todas).forEach(function (id) { if (!cubiertas[id]) problemas.push({ uc: id, problema: 'ELIMINADO: «' + todas[id].titulo + '» no aparece en el documento' }); });
      return { ok: problemas.length === 0, problemas: problemas, cobertura: { piezas: Object.keys(todas).length, cubiertas: Object.keys(cubiertas).filter(function (k) { return todas[k]; }).length, omitidas: 0 } };
    });
  }

  // Trabajo híbrido: primero el material del banco, después el texto de autor (numeración seguida).
  function combinar(red, doc) {
    if (!red) return doc;
    if (!doc) return red;
    var c = EDU.clonar(red), n = c.secciones.length;
    doc.secciones.forEach(function (s) { var x = EDU.clonar(s); x.orden = ++n; c.secciones.push(x); });
    c.sintesis.bloques = c.sintesis.bloques.concat(EDU.clonar(doc.sintesis.bloques));
    c.piezasExtra = (red.piezasExtra || []).concat(doc.piezasExtra || []);
    c.documentos = (red.documentos || []).concat([doc.raiz]);
    return c;
  }

  EDU.documento = { redactar: redactar, auditar: auditar, combinar: combinar };
  EDU.registrar('documento', EDU.documento, { requiere: ['base', 'esquemas', 'almacen', 'biblioteca'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
