/* edu_visor_salidas.js — panel «Descargar / Vista previa» de la pestaña Material.
   Un trabajo → muchas salidas: examen y corrección (motor b6_examen de FATIMA PRO),
   libro PDF, eBook EPUB, página HTML y todo junto en ZIP.
   Solo usa las API de los módulos; lee el estado del visor con EDU_VISOR.estado(). */
(function () {
  'use strict';
  var EDU = window.EDU, V = window.EDU_VISOR;
  var caja = document.getElementById('salidas');
  if (!EDU || !V || !caja || !EDU.libro || !EDU.examen || !EDU.exportar) return;
  var esc = EDU.esc;
  function $(id) { return document.getElementById(id); }

  caja.innerHTML =
    '<span class="salidas-titulo">Descargar</span>' +
    '<button type="button" class="boton secundario" data-salida="examen">Examen PDF</button>' +
    '<button type="button" class="boton secundario" data-salida="correccion">Corrección PDF</button>' +
    '<button type="button" class="boton secundario" data-salida="libro">Libro PDF</button>' +
    '<button type="button" class="boton secundario" data-salida="epub">eBook EPUB</button>' +
    '<button type="button" class="boton secundario" data-salida="html">Página HTML</button>' +
    '<button type="button" class="boton" data-salida="zip">Todo (ZIP)</button>' +
    '<span class="salidas-titulo">Ver</span>' +
    '<button type="button" class="boton secundario" data-previa="libro">Libro</button>' +
    '<button type="button" class="boton secundario" data-previa="examen">Examen</button>' +
    '<button type="button" class="boton secundario" data-previa="correccion">Corrección</button>' +
    '<span class="salidas-titulo">Editar</span>' +
    '<button type="button" class="boton secundario" data-editar="1">✏️ Editar texto</button>' +
    '<span class="salidas-estado" id="salidasEstado" aria-live="polite"></span>' +
    '<div class="previa" id="previa" hidden></div>';

  function estado(t, mal) { var e = $('salidasEstado'); e.textContent = t; e.className = 'salidas-estado' + (mal ? ' mal' : ''); }

  function listo() {
    var st = V.estado();
    if (!st || !st.red || !(st.red.secciones.length || st.red.sintesis.bloques.length)) throw new Error('Primero elige o crea un trabajo con contenido.');
    return st;
  }

  function titulo(st) { return (st.proyecto && st.proyecto.titulo) || (st.objetivo && st.objetivo.titulo) || (st.red.secciones[0] ? st.red.secciones[0].titulo : 'Material'); }
  function papel(st) { return st.proyecto && st.proyecto.trabajo ? st.proyecto.trabajo.papel : 'a4'; }
  function acento(st) {
    var L = EDU.puente.obtener('laminas'), id = st.proyecto && st.proyecto.trabajo && st.proyecto.trabajo.paleta;
    return id && L && L.paleta ? L.paleta(id).acento : undefined;
  }

  // Láminas dibujadas con el Motor Visual, con el diseño que la usuaria haya elegido en pantalla.
  function laminas(st) {
    var out = {};
    if (!EDU.visual || !EDU.visual.disponible()) return out;
    function recorrer(s, ctxTitulo) {
      s.bloques.forEach(function (b) {
        if (b.tipo !== 'visualizacion' || out[b.pieza]) return;
        var p = V.piezaPorId(b.pieza);
        if (!p) return;
        try {
          var lam = EDU.visual.lamina(p, { titulo: ctxTitulo, materia: st.materia, nivel: st.red.nivel, semilla: st.semilla, diseno: st.disenos[p.id] });
          if (!EDU.visual.verificar(lam, p).ok) return;   // solo láminas con textos verificados
          var cv = document.createElement('canvas');
          EDU.visual.pintar(cv, lam, { prog: 1, escala: 1 });
          out[b.pieza] = cv.toDataURL('image/jpeg', 0.9);
        } catch (e) { /* sin lámina: el libro deja su pie como texto */ }
      });
    }
    st.red.secciones.forEach(function (s) { recorrer(s, s.titulo); });
    recorrer(st.red.sintesis, st.red.secciones.length ? st.red.secciones[0].titulo : '');
    return out;
  }

  function opcionesLibro(st) {
    return { titulo: titulo(st), papel: papel(st), acento: acento(st), laminas: laminas(st),
      pendientes: $('chkPendientes').checked, preguntas: $('chkPreguntas').checked };
  }

  function examen(st) {
    var r = EDU.examen.construir(st.red, { titulo: titulo(st), semilla: st.semilla });
    if (!r.datos.preguntas.length && !r.datos.abierta) throw new Error('Este trabajo no tiene preguntas con opciones suficientes en los datos para un examen.');
    var v = EDU.examen.verificar(r.datos, st.red);
    if (!v.ok) throw new Error('El examen no pasa la verificación: ' + v.problemas[0].problema);
    return r;
  }
  function informeExamen(r) {
    var faltan = r.omitidas.filter(function (o) { return /opciones incorrectas|Sin respuesta/.test(o.motivo); }).length;
    return r.datos.preguntas.length + ' preguntas' + (r.datos.abierta ? ' + 1 abierta' : '') + ' · verificado' + (faltan ? ' · ' + faltan + ' sin opciones suficientes en los datos (omitidas)' : '');
  }
  function hojasExamen(r, cara, escala) {
    if (!EDU.puente.obtener('examen')) throw new Error('Falta el motor de examen de FATIMA PRO (heredados/b6_examen.js).');
    return EDU.examen.paginas(r.datos, cara, escala);
  }

  function nombre(st, ext) { return EDU.slug(titulo(st)) + ext; }
  function blobTexto(t, tipo) { return new Blob([t], { type: tipo }); }

  function crear(que, st) {
    var ol = opcionesLibro;
    switch (que) {
      case 'examen': case 'correccion':
        var r = examen(st);
        return EDU.exportar.pdfDeLienzos(hojasExamen(r, que, 2), { papel: papel(st) }).then(function (b) { return { blob: b, nombre: nombre(st, que === 'examen' ? '-examen.pdf' : '-correccion.pdf'), nota: informeExamen(r) }; });
      case 'libro': return EDU.libro.pdf(st.red, ol(st)).then(function (b) { return { blob: b, nombre: nombre(st, '.pdf') }; });
      case 'epub': return EDU.exportar.zip(EDU.libro.epub(st.red, ol(st))).then(function (b) { return { blob: new Blob([b], { type: 'application/epub+zip' }), nombre: nombre(st, '.epub') }; });
      case 'html': return Promise.resolve({ blob: blobTexto(EDU.libro.html(st.red, ol(st)), 'text/html'), nombre: nombre(st, '.html') });
      case 'zip':
        var partes = ['libro', 'epub', 'html'], notas = [];
        var conExamen = true;
        try { examen(st); } catch (e) { conExamen = false; notas.push('sin examen: ' + e.message); }
        if (conExamen) partes.push('examen', 'correccion');
        return partes.reduce(function (p, q) {
          return p.then(function (lista) { return crear(q, st).then(function (x) { lista.push({ ruta: x.nombre, blob: x.blob }); return lista; }); });
        }, Promise.resolve([])).then(function (lista) {
          var lam = laminas(st), i = 0;
          Object.keys(lam).forEach(function (k) { lista.push({ ruta: 'laminas/lamina-' + (++i) + '.jpg', base64: lam[k].split(',')[1] }); });
          return EDU.exportar.zip(lista);
        }).then(function (b) { return { blob: b, nombre: nombre(st, '.zip'), nota: notas.join(' · ') }; });
    }
    return Promise.reject(new Error('Salida desconocida'));
  }

  caja.addEventListener('click', function (ev) {
    var bot = ev.target.closest('button');
    if (!bot) return;
    var st;
    try { st = listo(); } catch (e) { estado(e.message, true); return; }
    if (bot.hasAttribute('data-previa')) { previa(bot.getAttribute('data-previa'), st); return; }
    if (bot.hasAttribute('data-editar')) { editar(st); return; }
    var que = bot.getAttribute('data-salida');
    bot.disabled = true;
    estado('Preparando…');
    Promise.resolve().then(function () { return crear(que, st); }).then(function (x) {
      EDU.exportar.descargar(x.blob, x.nombre);
      estado('✓ ' + x.nombre + ' (' + Math.max(1, Math.round(x.blob.size / 1024)) + ' KB)' + (x.nota ? ' · ' + x.nota : ''));
    }).catch(function (e) { estado('No se ha podido crear: ' + (e && e.message || e), true); })
      .then(function () { bot.disabled = false; });
  });

  /* Editar: el material pasa a «Crear» como texto de la usuaria (apartados con «##» y párrafos).
     Allí se corrige, se amplía o se dicta, y al crear el trabajo es SU texto, literal, en todas las salidas. */
  function textoEditable(red) {
    var l = [];
    function seccion(s) {
      if (!s.bloques.length) return;
      l.push('', '## ' + s.titulo);
      s.bloques.forEach(function (b) {
        if (b.tipo === 'pregunta' || b.tipo === 'pendiente' || b.tipo === 'repaso' || b.tipo === 'visualizacion') return;
        if (b.tipo === 'pasos') { l.push(b.frases[0].texto); b.frases.slice(1).forEach(function (a, i) { l.push((i + 1) + '. ' + a.texto); }); return; }
        if (b.frases && b.frases.length) l.push(b.frases.map(function (a) { return a.texto; }).join(' '));
      });
    }
    red.secciones.forEach(seccion);
    seccion(red.sintesis);
    return l.join('\n').trim();
  }
  function editar(st) {
    $('crTitulo').value = titulo(st);
    $('crUsarBanco').checked = false; $('crRama').disabled = true;
    $('crUsarPegado').checked = true; $('bloquePegado').hidden = false;
    $('crTexto').value = textoEditable(st.red);
    V.pestana('Crear');
    $('crTexto').focus(); $('crTexto').setSelectionRange(0, 0);
    $('crTexto').scrollIntoView({ block: 'center' });
    estado('');
  }

  // Vista previa en la propia página (sirve también donde las descargas están bloqueadas).
  function previa(que, st) {
    var p = $('previa');
    try {
      p.innerHTML = '<div class="previa-barra"><strong>Vista previa · ' + esc(que === 'libro' ? 'libro' : que === 'examen' ? 'examen' : 'corrección') + '</strong><button type="button" class="cerrar" id="cerrarPrevia">Cerrar</button></div>';
      if (que === 'libro') {
        var f = document.createElement('iframe');
        f.title = 'Vista previa del libro';
        f.setAttribute('sandbox', '');
        f.srcdoc = EDU.libro.html(st.red, opcionesLibro(st));
        p.appendChild(f);
        estado('Vista del libro tal como sale en HTML, EPUB y PDF.');
      } else {
        var r = examen(st), hojas = document.createElement('div');
        hojas.className = 'previa-hojas';
        hojasExamen(r, que, 1).forEach(function (cv) { hojas.appendChild(cv); });
        p.appendChild(hojas);
        estado(informeExamen(r));
      }
      p.hidden = false;
      $('cerrarPrevia').addEventListener('click', function () { p.hidden = true; p.innerHTML = ''; });
    } catch (e) { p.hidden = true; estado(e.message, true); }
  }
})();
