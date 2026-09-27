/* edu_libro.js — libro y eBook a partir del trabajo (redacción auditada).
   Fase 2 · paso 4. Requiere edu_base; para PDF y EPUB usa EDU.exportar.

   Un solo modelo de lectura sirve para todas las salidas:
     portada → índice → capítulos (objetivos, texto, láminas, preguntas) → soluciones
   Los textos se copian TAL CUAL de las afirmaciones de la redacción (que ya
   pasaron la auditoría). Aquí solo se decide la maqueta, nunca el contenido.
   Las láminas llegan ya dibujadas (dataURL) desde el Motor Visual.

     EDU.libro.modelo(redaccion, opciones)  → { portada, capitulos, soluciones }
     EDU.libro.html(redaccion, opciones)    → texto HTML completo e imprimible
     EDU.libro.epub(redaccion, opciones)    → [{ ruta, texto | base64 }]  (EPUB 3; empaquetar con EDU.exportar.zip)
     EDU.libro.pdf(redaccion, opciones)     → Promise<Blob>              (navegador)
     EDU.libro.textos(modelo)               → todos los textos del libro (para comprobar que son los de la redacción)
   opciones: { titulo, subtitulo, autoria, papel, laminas: { piezaId: dataURL }, portada: dataURL, pendientes (true), preguntas (true), acento } */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base) { if (raiz.console) raiz.console.error('[libro] Falta edu_base'); return; }
  if (EDU.libro) return;

  var esc = EDU.esc;

  /* ───────────────────────── Modelo de lectura ───────────────────────── */

  function modelo(red, op) {
    op = op || {};
    var conPend = op.pendientes !== false, conPreg = op.preguntas !== false;
    var capitulos = [], soluciones = [], numPregunta = 0;
    function capitulo(s, esSintesis) {
      var cap = { id: s.id || 'sintesis', titulo: esSintesis ? (s.titulo || 'Síntesis') : s.titulo, nivel: s.nivel || 0, objetivos: (s.objetivos || []).map(function (a) { return a.texto; }), elementos: [], preguntas: [] };
      var rel = [];
      function soltar() { if (rel.length) { cap.elementos.push({ tipo: 'parrafo', texto: rel.join(' ') }); rel = []; } }
      s.bloques.forEach(function (b) {
        if (b.tipo === 'relacion') { rel.push(b.frases.map(function (a) { return a.texto; }).join(' ')); return; }
        soltar();
        switch (b.tipo) {
          case 'pendiente': if (conPend) cap.elementos.push({ tipo: 'pendiente', texto: 'Pendiente: ' + b.nota }); break;
          case 'pasos':
            cap.elementos.push({ tipo: 'parrafo', texto: b.frases[0].texto });
            cap.elementos.push({ tipo: 'pasos', lineas: b.frases.slice(1).map(function (a) { return a.texto; }) });
            break;
          case 'repaso':
            cap.elementos.push({ tipo: 'subtitulo', texto: b.frases[0].texto.replace(/:$/, '') });
            cap.elementos.push({ tipo: 'lista', lineas: b.frases.slice(1).map(function (a) { return a.texto; }) });
            break;
          case 'visualizacion':
            cap.elementos.push({ tipo: 'lamina', pieza: b.pieza, pie: b.frases[0].texto, imagen: op.laminas ? op.laminas[b.pieza] || null : null });
            break;
          case 'pregunta':
            if (!conPreg) break;
            numPregunta++;
            var ops = !b.opciones ? [] : b.opciones.conceptos ? b.opciones.conceptos.concat(b.opciones.definiciones) : b.opciones;
            cap.preguntas.push({ n: numPregunta, enunciado: b.enunciado.texto, opciones: ops.map(function (a) { return a.texto; }) });
            soluciones.push({ n: numPregunta, capitulo: cap.titulo, respuesta: [].concat(b.respuesta).map(function (a) { return a.texto; }) });
            break;
          default:
            (b.frases || []).forEach(function (a) { cap.elementos.push({ tipo: b.tipo === 'ejemplo' ? 'ejemplo' : 'parrafo', texto: a.texto }); });
        }
      });
      soltar();
      if (cap.elementos.length || cap.preguntas.length || cap.objetivos.length || !esSintesis) capitulos.push(cap);
    }
    red.secciones.forEach(function (s) { capitulo(s, false); });
    if (red.sintesis && red.sintesis.bloques.length) capitulo(red.sintesis, true);
    var portada = {
      titulo: op.titulo || (red.secciones[0] ? red.secciones[0].titulo : 'Libro'),
      subtitulo: op.subtitulo || '', autoria: op.autoria || '',
      requisitos: red.requisitos ? red.requisitos.texto : ''
    };
    return { portada: portada, capitulos: capitulos, soluciones: soluciones };
  }

  // Todos los textos del libro que salen de la redacción (para comprobar que no se añade nada).
  function textos(m) {
    var t = [];
    if (m.portada.requisitos) t.push(m.portada.requisitos);
    m.capitulos.forEach(function (c) {
      t = t.concat(c.objetivos);
      c.elementos.forEach(function (e) {
        if (e.texto && e.tipo !== 'pendiente') t.push(e.texto);
        if (e.lineas) t = t.concat(e.lineas);
        if (e.pie) t.push(e.pie);
      });
      c.preguntas.forEach(function (p) { t.push(p.enunciado); t = t.concat(p.opciones); });
    });
    m.soluciones.forEach(function (s) { t = t.concat(s.respuesta); });
    return t;
  }

  /* ───────────────────────── HTML ───────────────────────── */

  function cuerpoHTML(m, xhtml) {
    var br = xhtml ? '<br/>' : '<br>';
    var h = '';
    m.capitulos.forEach(function (c, i) {
      var nivel = Math.min(3, (c.nivel || 0) + 2);
      h += '<section class="capitulo' + (c.nivel ? ' sub' : '') + '" id="cap' + (i + 1) + '">';
      h += '<h' + nivel + '>' + esc(c.titulo) + '</h' + nivel + '>';
      if (c.objetivos.length) h += '<ul class="objetivos">' + c.objetivos.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ul>';
      c.elementos.forEach(function (e) {
        if (e.tipo === 'parrafo') h += '<p>' + esc(e.texto) + '</p>';
        else if (e.tipo === 'ejemplo') h += '<p class="ejemplo">' + esc(e.texto) + '</p>';
        else if (e.tipo === 'pendiente') h += '<p class="pendiente">' + esc(e.texto) + '</p>';
        else if (e.tipo === 'subtitulo') h += '<h4>' + esc(e.texto) + '</h4>';
        else if (e.tipo === 'pasos') h += '<div class="pasos">' + e.lineas.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div>';
        else if (e.tipo === 'lista') h += '<ul class="repaso">' + e.lineas.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
        else if (e.tipo === 'lamina') h += e.imagen ? '<figure><img src="' + (e.rutaImagen || e.imagen) + '" alt="' + esc(e.pie) + '"' + (xhtml ? '/>' : '>') + '<figcaption>' + esc(e.pie) + '</figcaption></figure>' : '<p class="pendiente">' + esc(e.pie) + '</p>';
      });
      if (c.preguntas.length) {
        h += '<h4>Preguntas</h4><ol class="preguntas">' + c.preguntas.map(function (p) {
          return '<li value="' + p.n + '">' + esc(p.enunciado) + (p.opciones.length ? br + '<span class="opciones">' + p.opciones.map(esc).join(' · ') + '</span>' : '') + '</li>';
        }).join('') + '</ol>';
      }
      h += '</section>';
    });
    if (m.soluciones.length) {
      h += '<section class="capitulo" id="soluciones"><h2>Soluciones</h2><ol class="soluciones">' + m.soluciones.map(function (s) {
        return '<li value="' + s.n + '">' + esc(s.respuesta.join(' ')) + '</li>';
      }).join('') + '</ol></section>';
    }
    return h;
  }

  function estilo(op) {
    var acento = op.acento || '#2d5b8c';
    var pagina = op.papel === 'carta' ? 'letter' : 'A4';
    return '@page { size: ' + pagina + '; margin: 20mm; }\n' +
      'body { font: 11.5pt/1.6 Georgia, "Times New Roman", serif; color: #1c1f26; max-width: 42em; margin: 0 auto; padding: 1.5em 16px; background: #fff; }\n' +
      'h1 { font-size: 2.2em; line-height: 1.15; margin: 0 0 .3em; color: ' + acento + '; } h2 { font-size: 1.6em; margin: 2em 0 .4em; color: ' + acento + '; } h3 { font-size: 1.25em; margin: 1.6em 0 .3em; } h4 { font-size: 1em; margin: 1.4em 0 .3em; text-transform: uppercase; letter-spacing: .06em; color: #555; }\n' +
      '.portada { min-height: 60vh; display: flex; flex-direction: column; justify-content: center; border-bottom: 3px solid ' + acento + '; margin-bottom: 2em; } .portada p { color: #555; }\n' +
      '.indice ol { padding-left: 1.2em; } .indice a { color: inherit; }\n' +
      '.capitulo { break-before: page; } .capitulo.sub { break-before: auto; }\n' +
      '.objetivos { color: #555; font-size: .92em; } .ejemplo { border-left: 3px solid ' + acento + '; padding-left: .8em; }\n' +
      '.pendiente { background: #fdf5cc; padding: .3em .6em; font-size: .9em; } .pasos p { margin: .2em 0 .2em 1em; }\n' +
      'figure { margin: 1.2em 0; break-inside: avoid; } figure img { max-width: 100%; height: auto; border: 1px solid #ddd; } figcaption { font-size: .85em; color: #555; }\n' +
      '.opciones { color: #555; font-size: .92em; } .preguntas li, .soluciones li { margin-bottom: .5em; }\n';
  }

  function html(red, op) {
    op = op || {};
    var m = modelo(red, op);
    var indice = '<nav class="indice"><h2>Índice</h2><ol>' + m.capitulos.map(function (c, i) { return c.nivel ? '' : '<li><a href="#cap' + (i + 1) + '">' + esc(c.titulo) + '</a></li>'; }).join('') + (m.soluciones.length ? '<li><a href="#soluciones">Soluciones</a></li>' : '') + '</ol></nav>';
    var portada = '<header class="portada"><h1>' + esc(m.portada.titulo) + '</h1>' + (m.portada.subtitulo ? '<p>' + esc(m.portada.subtitulo) + '</p>' : '') + (m.portada.autoria ? '<p>' + esc(m.portada.autoria) + '</p>' : '') +
      (op.portada ? '<figure><img src="' + op.portada + '" alt=""></figure>' : '') + (m.portada.requisitos ? '<p>' + esc(m.portada.requisitos) + '</p>' : '') + '</header>';
    return '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + esc(m.portada.titulo) + '</title>\n<style>\n' + estilo(op) + '</style>\n</head>\n<body>\n' + portada + indice + cuerpoHTML(m, false) + '\n</body>\n</html>\n';
  }

  /* ───────────────────────── EPUB 3 ───────────────────────── */

  function epub(red, op) {
    op = op || {};
    var m = modelo(red, op);
    var id = 'urn:uuid:' + EDU.hash(m.portada.titulo + '|' + (op.autoria || '')) + '-' + EDU.hash(JSON.stringify(textos(m))) + '-4000-8000-000000000000';
    var archivos = [{ ruta: 'mimetype', texto: 'application/epub+zip' }];
    archivos.push({ ruta: 'META-INF/container.xml', texto: '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n' });
    var imagenes = [], nImg = 0;
    m.capitulos.forEach(function (c) {
      c.elementos.forEach(function (e) {
        if (e.tipo === 'lamina' && e.imagen && /^data:image\/(png|jpeg);base64,/.test(e.imagen)) {
          var ext = /image\/png/.test(e.imagen) ? 'png' : 'jpg';
          var ruta = 'img/lamina' + (++nImg) + '.' + ext;
          imagenes.push({ ruta: ruta, tipo: ext === 'png' ? 'image/png' : 'image/jpeg', base64: e.imagen.split(',')[1] });
          e.rutaImagen = ruta;
        }
      });
    });
    function xhtml(titulo, cuerpo) {
      return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="es" xml:lang="es"><head><meta charset="UTF-8"/><title>' + esc(titulo) + '</title><link rel="stylesheet" href="estilo.css" type="text/css"/></head><body>' + cuerpo + '</body></html>\n';
    }
    var cuerpo = cuerpoHTML(m, true);
    var trozos = cuerpo.split('<section ').slice(1).map(function (t) { return '<section ' + t; });
    var capArchivos = trozos.map(function (t, i) { return { ruta: 'cap' + (i + 1) + '.xhtml', texto: xhtml(m.portada.titulo, t) }; });
    var portada = { ruta: 'portada.xhtml', texto: xhtml(m.portada.titulo, '<header class="portada"><h1>' + esc(m.portada.titulo) + '</h1>' + (m.portada.subtitulo ? '<p>' + esc(m.portada.subtitulo) + '</p>' : '') + (m.portada.autoria ? '<p>' + esc(m.portada.autoria) + '</p>' : '') + (m.portada.requisitos ? '<p>' + esc(m.portada.requisitos) + '</p>' : '') + '</header>') };
    var titulosCap = m.capitulos.map(function (c) { return c.titulo; }).concat(m.soluciones.length ? ['Soluciones'] : []);
    var nav = { ruta: 'nav.xhtml', texto: xhtml('Índice', '<nav epub:type="toc" id="toc"><h2>Índice</h2><ol>' + capArchivos.map(function (a, i) { return '<li><a href="' + a.ruta + '">' + esc(titulosCap[i] || ('Capítulo ' + (i + 1))) + '</a></li>'; }).join('') + '</ol></nav>') };
    var opf = '<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="es"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      '<dc:identifier id="id">' + id + '</dc:identifier><dc:title>' + esc(m.portada.titulo) + '</dc:title><dc:language>es</dc:language>' + (op.autoria ? '<dc:creator>' + esc(op.autoria) + '</dc:creator>' : '') +
      '<meta property="dcterms:modified">' + (op.fecha || '2026-01-01T00:00:00Z') + '</meta></metadata><manifest>' +
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="estilo.css" media-type="text/css"/><item id="portada" href="portada.xhtml" media-type="application/xhtml+xml"/>' +
      capArchivos.map(function (a, i) { return '<item id="c' + (i + 1) + '" href="' + a.ruta + '" media-type="application/xhtml+xml"/>'; }).join('') +
      imagenes.map(function (im, i) { return '<item id="i' + (i + 1) + '" href="' + im.ruta + '" media-type="' + im.tipo + '"/>'; }).join('') +
      '</manifest><spine><itemref idref="portada"/><itemref idref="nav"/>' + capArchivos.map(function (a, i) { return '<itemref idref="c' + (i + 1) + '"/>'; }).join('') + '</spine></package>\n';
    archivos.push({ ruta: 'OEBPS/content.opf', texto: opf });
    archivos.push({ ruta: 'OEBPS/estilo.css', texto: estilo(op).replace(/@page[^\n]*\n/, '') });
    archivos.push({ ruta: 'OEBPS/portada.xhtml', texto: portada.texto });
    archivos.push({ ruta: 'OEBPS/nav.xhtml', texto: nav.texto });
    capArchivos.forEach(function (a) { archivos.push({ ruta: 'OEBPS/' + a.ruta, texto: a.texto }); });
    imagenes.forEach(function (im) { archivos.push({ ruta: 'OEBPS/' + im.ruta, base64: im.base64 }); });
    return archivos;
  }

  /* ───────────────────────── PDF (navegador) ───────────────────────── */

  function pdf(red, op) {
    op = op || {};
    if (!EDU.exportar) return Promise.reject(new Error('Falta EDU.exportar'));
    var m = modelo(red, op);
    return EDU.exportar.nuevoPDF({ papel: op.papel }).then(function (doc) {
      var P = doc.papel, M = 20, ancho = P.w - M * 2, y = M, paginasCap = [];
      var acento = op.acento || '#2d5b8c';
      function lh(pt) { return pt * 0.3528 * 1.45; }
      function nueva() { doc.addPage(); y = M; }
      function asegurar(h) { if (y + h > P.h - M - 6) nueva(); }
      function escribir(t, o) {
        o = o || {};
        var pt = o.pt || 11, sang = o.sangria || 0;
        doc.setFont('libro', o.negrita ? 'bold' : 'normal');
        doc.setFontSize(pt);
        doc.setTextColor(o.color || '#1c1f26');
        y += o.antes || 0;
        doc.splitTextToSize(String(t), ancho - sang).forEach(function (l) { asegurar(lh(pt)); doc.text(l, M + sang, y + lh(pt) * 0.75); y += lh(pt); });
        y += o.despues === undefined ? 1.6 : o.despues;
      }
      // Portada
      doc.setFillColor(acento);
      doc.rect(0, 0, P.w, 8, 'F');
      y = P.h * 0.30;
      escribir(m.portada.titulo, { pt: 28, negrita: true, color: acento, despues: 4 });
      if (m.portada.subtitulo) escribir(m.portada.subtitulo, { pt: 14, color: '#555555' });
      if (m.portada.autoria) escribir(m.portada.autoria, { pt: 12, color: '#555555', antes: 2 });
      if (op.portada) {
        try { var pp = doc.getImageProperties(op.portada), wP = ancho, hP = wP * pp.height / pp.width; if (y + hP > P.h - M) { hP = P.h - M - y - 4; wP = hP * pp.width / pp.height; } doc.addImage(op.portada, M + (ancho - wP) / 2, y + 6, wP, hP); } catch (e) { }
      }
      // Índice (se reserva y se escribe al final, cuando se conocen las páginas)
      var lineasIndice = m.capitulos.filter(function (c) { return !c.nivel; }).length + (m.soluciones.length ? 1 : 0);
      var hojasIndice = Math.max(1, Math.ceil(lineasIndice / 30));
      for (var k = 0; k < hojasIndice; k++) nueva();
      var primeraIndice = 2;
      // Capítulos
      m.capitulos.forEach(function (c) {
        if (!c.nivel) nueva(); else asegurar(20);
        paginasCap.push({ titulo: c.titulo, pagina: doc.getNumberOfPages(), nivel: c.nivel });
        escribir(c.titulo, { pt: c.nivel ? 14 : 18, negrita: true, color: c.nivel ? '#1c1f26' : acento, antes: c.nivel ? 4 : 0, despues: 3 });
        c.objetivos.forEach(function (o) { escribir('• ' + o, { pt: 9.5, color: '#555555', despues: 0.6 }); });
        if (c.objetivos.length) y += 3;
        c.elementos.forEach(function (e) {
          if (e.tipo === 'parrafo') escribir(e.texto);
          else if (e.tipo === 'ejemplo') { doc.setDrawColor(acento); var y0 = y; escribir(e.texto, { sangria: 4 }); doc.setLineWidth(0.8); doc.line(M + 1, y0 + 0.5, M + 1, y - 2); }
          else if (e.tipo === 'pendiente') escribir(e.texto, { pt: 9.5, color: '#8a6d00' });
          else if (e.tipo === 'subtitulo') escribir(e.texto, { pt: 10, negrita: true, color: '#555555', antes: 3 });
          else if (e.tipo === 'pasos' || e.tipo === 'lista') e.lineas.forEach(function (l) { escribir((e.tipo === 'lista' ? '• ' : '') + l, { sangria: 5, despues: 0.8 }); });
          else if (e.tipo === 'lamina') {
            if (!e.imagen) { escribir(e.pie, { pt: 9.5, color: '#555555' }); return; }
            try {
              var pr = doc.getImageProperties(e.imagen), w = ancho, h = w * pr.height / pr.width, max = P.h - M * 2 - 20;
              if (h > max) { h = max; w = h * pr.width / pr.height; }
              asegurar(h + 10);
              doc.addImage(e.imagen, M + (ancho - w) / 2, y + 2, w, h);
              y += h + 4;
              escribir(e.pie, { pt: 9, color: '#555555' });
            } catch (err) { escribir(e.pie, { pt: 9.5, color: '#555555' }); }
          }
        });
        if (c.preguntas.length) {
          escribir('Preguntas', { pt: 10, negrita: true, color: '#555555', antes: 4 });
          c.preguntas.forEach(function (p) {
            escribir(p.n + '. ' + p.enunciado, { despues: 0.8 });
            if (p.opciones.length) escribir(p.opciones.join('  ·  '), { pt: 9.5, color: '#555555', sangria: 5 });
          });
        }
      });
      if (m.soluciones.length) {
        nueva();
        paginasCap.push({ titulo: 'Soluciones', pagina: doc.getNumberOfPages(), nivel: 0 });
        escribir('Soluciones', { pt: 18, negrita: true, color: acento, despues: 3 });
        m.soluciones.forEach(function (s) { escribir(s.n + '. ' + s.respuesta.join(' '), { pt: 10, despues: 1 }); });
      }
      // Índice con números de página
      doc.setPage(primeraIndice); y = M;
      escribir('Índice', { pt: 18, negrita: true, color: acento, despues: 4 });
      var pagIndice = primeraIndice;
      paginasCap.filter(function (x) { return !x.nivel; }).forEach(function (x) {
        if (y > P.h - M - 10) { pagIndice++; doc.setPage(pagIndice); y = M; }
        doc.setFont('libro', 'normal'); doc.setFontSize(11); doc.setTextColor('#1c1f26');
        var t = doc.splitTextToSize(x.titulo, ancho - 18)[0];
        doc.text(t, M, y + 4); doc.text(String(x.pagina), P.w - M, y + 4, { align: 'right' });
        y += 7.5;
      });
      // Números de página y título en el pie
      var total = doc.getNumberOfPages();
      for (var i = 2; i <= total; i++) {
        doc.setPage(i);
        doc.setFont('libro', 'normal'); doc.setFontSize(8.5); doc.setTextColor('#888888');
        doc.text(doc.splitTextToSize(m.portada.titulo, ancho - 20)[0], M, P.h - 10);
        doc.text(String(i), P.w - M, P.h - 10, { align: 'right' });
      }
      return doc.output('blob');
    });
  }

  EDU.libro = { modelo: modelo, textos: textos, html: html, epub: epub, pdf: pdf };
  EDU.registrar('libro', EDU.libro, { requiere: ['base'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
