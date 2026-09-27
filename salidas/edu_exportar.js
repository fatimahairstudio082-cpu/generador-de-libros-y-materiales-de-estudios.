/* edu_exportar.js — utilidades de salida: PDF, ZIP y descarga.
   Fase 2 · pasos 3 y 4. Requiere edu_base. Funciona en el navegador.

   Las librerías se cargan desde vendor/ (copias locales, funcionan sin
   conexión y en la página publicada) y, si faltan, desde cdnjs:
     jsPDF 2.5.1 (PDF) · JSZip 3.10.1 (ZIP y EPUB) · DejaVu Serif (fuente con
     todos los caracteres, para que ningún dato salga mal escrito en el PDF).

     EDU.exportar.cargar('jspdf'|'jszip')           → Promise<librería>
     EDU.exportar.nuevoPDF({ papel })               → Promise<documento jsPDF con la fuente cargada>
     EDU.exportar.pdfDeLienzos(lienzos, { papel })  → Promise<Blob>   (una hoja por lienzo)
     EDU.exportar.zip(archivos)                     → Promise<Blob>   archivos: [{ ruta, texto | base64 | blob }]
     EDU.exportar.descargar(blob, nombre)           → inicia la descarga */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base) { if (raiz.console) raiz.console.error('[exportar] Falta edu_base'); return; }
  if (EDU.exportar) return;

  var LIBS = {
    jspdf: { local: 'vendor/jspdf-2.5.1.umd.min.js', cdn: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', global: function () { return raiz.jspdf && raiz.jspdf.jsPDF ? raiz.jspdf : null; } },
    jszip: { local: 'vendor/jszip-3.10.1.min.js', cdn: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', global: function () { return raiz.JSZip || null; } }
  };
  var FUENTES = { normal: 'vendor/DejaVuSerif.ttf', bold: 'vendor/DejaVuSerif-Bold.ttf' };
  var PAPEL = { a4: { w: 210, h: 297, formato: 'a4' }, carta: { w: 215.9, h: 279.4, formato: 'letter' } };

  var cargando = {};

  function script(src) {
    return new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { ok(); };
      s.onerror = function () { s.remove(); mal(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  function cargar(nombre) {
    var L = LIBS[nombre];
    if (!L) return Promise.reject(new Error('Librería desconocida: ' + nombre));
    if (L.global()) return Promise.resolve(L.global());
    if (cargando[nombre]) return cargando[nombre];
    cargando[nombre] = script(L.local).catch(function () { return script(L.cdn); }).then(function () {
      if (!L.global()) throw new Error('La librería ' + nombre + ' no se ha podido iniciar');
      return L.global();
    });
    cargando[nombre].catch(function () { delete cargando[nombre]; });
    return cargando[nombre];
  }

  function aBase64(buf) {
    var b = new Uint8Array(buf), trozos = [], PASO = 0x8000;
    for (var i = 0; i < b.length; i += PASO) trozos.push(String.fromCharCode.apply(null, b.subarray(i, i + PASO)));
    return raiz.btoa(trozos.join(''));
  }

  var fuentes = null;
  function cargarFuentes() {
    if (fuentes) return fuentes;
    fuentes = Promise.all([FUENTES.normal, FUENTES.bold].map(function (u) {
      return raiz.fetch(u).then(function (r) { if (!r.ok) throw new Error('No se encuentra ' + u); return r.arrayBuffer(); }).then(aBase64);
    })).catch(function (e) { fuentes = null; throw e; });
    return fuentes;
  }

  // Documento jsPDF con DejaVu Serif registrada como «libro» (normal y bold).
  function nuevoPDF(op) {
    op = op || {};
    var P = PAPEL[op.papel] || PAPEL.a4;
    return Promise.all([cargar('jspdf'), cargarFuentes()]).then(function (r) {
      var doc = new r[0].jsPDF({ unit: 'mm', format: P.formato, orientation: op.horizontal ? 'landscape' : 'portrait', compress: true });
      doc.addFileToVFS('DejaVuSerif.ttf', r[1][0]);
      doc.addFont('DejaVuSerif.ttf', 'libro', 'normal');
      doc.addFileToVFS('DejaVuSerif-Bold.ttf', r[1][1]);
      doc.addFont('DejaVuSerif-Bold.ttf', 'libro', 'bold');
      doc.setFont('libro', 'normal');
      doc.papel = P;
      return doc;
    });
  }

  function pdfDeLienzos(lienzos, op) {
    op = op || {};
    if (!lienzos || !lienzos.length) return Promise.reject(new Error('No hay hojas que exportar'));
    return cargar('jspdf').then(function (lib) {
      var P = PAPEL[op.papel] || PAPEL.a4, doc = null;
      lienzos.forEach(function (cv) {
        var horizontal = cv.width > cv.height;
        var pw = horizontal ? P.h : P.w, ph = horizontal ? P.w : P.h;
        if (!doc) doc = new lib.jsPDF({ unit: 'mm', format: P.formato, orientation: horizontal ? 'landscape' : 'portrait', compress: true });
        else doc.addPage(P.formato, horizontal ? 'landscape' : 'portrait');
        var k = Math.min(pw / cv.width, ph / cv.height), w = cv.width * k, h = cv.height * k;
        doc.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h);
      });
      return doc.output('blob');
    });
  }

  function zip(archivos) {
    return cargar('jszip').then(function (JSZip) {
      var z = new JSZip();
      archivos.forEach(function (a) {
        var op = a.ruta === 'mimetype' ? { compression: 'STORE', createFolders: false } : { createFolders: false };
        if (a.base64 !== undefined) { op.base64 = true; z.file(a.ruta, a.base64, op); }
        else z.file(a.ruta, a.blob !== undefined ? a.blob : a.texto, op);
      });
      return z.generateAsync({ type: 'blob', mimeType: 'application/zip' });
    });
  }

  function descargar(blob, nombre) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 8000);
    EDU.emitir('exportar:descarga', { nombre: nombre, bytes: blob.size });
  }

  EDU.exportar = { cargar: cargar, nuevoPDF: nuevoPDF, pdfDeLienzos: pdfDeLienzos, zip: zip, descargar: descargar, papeles: function () { return EDU.clonar(PAPEL); } };
  EDU.registrar('exportar', EDU.exportar, { requiere: ['base'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
