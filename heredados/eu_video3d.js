/* ══════════════════════════════════════════════════════════════════
   ESTUDIO UNIVERSAL · P3 · ESTUDIO DE VÍDEO (3D)
   ------------------------------------------------------------------
   Los cuadros del folleto entran de uno en uno con una animación 3D
   mientras suena la voz. Todo se monta EN EL DISPOSITIVO: sólo la
   voz de estudio sale a internet (functions/tts).

   Cómo se dibuja sin repintar la hoja 30 veces por segundo:
     · «lleno»  → la hoja entera, pintada UNA vez.
     · «base»   → la hoja con los cuadros que ya han entrado; se
                  repinta sólo al cambiar de escena.
     · cada fotograma = base + el trozo del cuadro que entra, recortado
       de «lleno» y transformado (giro, volteo, cubo…).
   Así la grabación va fluida hasta en un móvil.

   Aviso honesto que se enseña siempre: la grabación va en tiempo real
   (un vídeo de 30 s tarda 30 s) porque es cosa del navegador.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window._EU_VIDEO3D_LOADED) return;
  window._EU_VIDEO3D_LOADED = true;

  var V = {};
  window.EU_VIDEO = V;

  var LADO_MAX = 1280;

  /* ───────────── Catálogo de efectos ───────────── */

  var EFECTOS = {
    giroy:      { nombre: 'Giro en Y',       grupo: '3D' },
    volteox:    { nombre: 'Volteo en X',     grupo: '3D' },
    cubo:       { nombre: 'Cubo',            grupo: '3D' },
    puerta:     { nombre: 'Puerta',          grupo: '3D' },
    caida:      { nombre: 'Caída con rebote',grupo: '3D' },
    profundidad:{ nombre: 'Profundidad',     grupo: '3D' },
    orbita:     { nombre: 'Órbita',          grupo: '3D' },
    hoja:       { nombre: 'Hoja que gira',   grupo: '3D' },
    deslizar:   { nombre: 'Deslizar',        grupo: 'Plana' },
    olas:       { nombre: 'Olas',            grupo: 'Plana' },
    circulo:    { nombre: 'Círculo',         grupo: 'Plana' },
    persiana:   { nombre: 'Persiana',        grupo: 'Plana' }
  };

  var CAMARAS = {
    ninguna:  'Sin movimiento',
    zoomlento:'Zoom lento',
    acercar:  'Acercar',
    sacudida: 'Sacudida',
    fundido:  'Fundido'
  };

  var VOCES = ['nova', 'alloy', 'shimmer', 'echo', 'fable', 'onyx'];

  /* ───────────── Estado ───────────── */

  var esc = [];              // escenas
  var sel = 0;
  var camara = 'zoomlento';
  var ritmo = 1;
  var subtitulos = true;
  var cierreQR = true;
  var audio = { modo: 'ninguno', blob: null, segundos: 0, nombre: '' };
  var lleno = null, base = null, rects = [], baseK = -1;
  var corriendo = false, pararTodo = null;

  /* ───────────── Entrar ───────────── */

  V.entrar = function () {
    if (!EU.pagina) { EU.toast('Elige antes una plantilla.'); EU.ir('plantillas'); return; }
    if (!esc.length || esc._rejilla !== EU.pagina.rejilla) construirEscenas();
    panel();
    preparar();
    pintarFotograma(0);
    duracionTexto();
  };

  function construirEscenas() {
    var celdas = EU.pagina.celdas || [];
    var n = (EU.motor.REJILLAS[EU.pagina.rejilla] || EU.motor.REJILLAS.r4a).n;
    var claves = Object.keys(EFECTOS);
    esc = [{ tipo: 'portada', nombre: 'Portada', efecto: 'profundidad', seg: 2.2, frase: fraseCabecera() }];
    for (var i = 0; i < Math.min(n, celdas.length); i++) {
      esc.push({
        tipo: 'cuadro', idx: i,
        nombre: (i + 1) + ' · ' + (celdas[i].titulo || 'Cuadro'),
        efecto: claves[i % 8],
        seg: 2.5,
        frase: fraseCelda(celdas[i])
      });
    }
    esc.push({ tipo: 'cierre', nombre: 'Cierre + QR', efecto: 'profundidad', seg: 2.6, frase: fraseCierre() });
    esc._rejilla = EU.pagina.rejilla;
    sel = 0;
  }

  function fraseCabecera() {
    var c = EU.pagina.cabecera || {};
    return limpiar((c.marca || '') + '. ' + (c.titulo || ''));
  }
  function fraseCelda(c) {
    return limpiar((c.titulo || '') + '. ' + (c.texto || '') + (c.precio ? ' ' + c.precio : ''));
  }
  function fraseCierre() {
    var p = EU.pagina.pie || {};
    return limpiar((p.cta || 'Contacta con nosotros') + '. ' + (EU.contactoTexto() || ''));
  }
  /* El cerebro ya sabe quitar símbolos que la voz lee raro (€, ·, …). */
  function limpiar(t) {
    if (EU.cerebro && EU.cerebro.limpiarParaVoz) { try { return EU.cerebro.limpiarParaVoz(t); } catch (e) {} }
    return String(t || '').replace(/[·•|]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* ───────────── Lienzos de trabajo ───────────── */

  function medidas() {
    var F = EU.motor.FORMATOS[EU.pagina.formato] || EU.motor.FORMATOS.a4v;
    var e = LADO_MAX / Math.max(F.w, F.h);
    // par: algunos codificadores de MP4 rechazan lados impares
    return { W: Math.round(F.w * e / 2) * 2, H: Math.round(F.h * e / 2) * 2 };
  }

  function preparar() {
    var m = medidas();
    lleno = document.createElement('canvas');
    lleno.width = m.W; lleno.height = m.H;
    rects = EU.motor.pintar(lleno.getContext('2d'), m.W, m.H, EU.pagina, opVideo()) || [];
    base = document.createElement('canvas');
    base.width = m.W; base.height = m.H;
    baseK = -1;
  }

  function opVideo(extra) {
    var op = (window.EU_EDITOR ? EU_EDITOR.opciones(extra) : Object.assign({ nPagina: 1 }, extra || {}));
    return op;
  }

  /* base = la hoja con los cuadros 0..k-1 ya puestos. Se repinta sólo cuando
     cambia la escena, no en cada fotograma. */
  function ponerBase(k) {
    if (baseK === k) return;
    baseK = k;
    var m = medidas();
    var ctx = base.getContext('2d');
    ctx.clearRect(0, 0, m.W, m.H);
    EU.motor.pintar(ctx, m.W, m.H, EU.pagina, opVideo({
      revelar: function (i) { return (i < k) ? null : { a: 0 }; }
    }));
  }

  /* ───────────── Un fotograma ───────────── */

  function total() {
    var t = 0;
    esc.forEach(function (e) { t += e.seg; });
    return t / ritmo;
  }

  function escenaEn(t) {
    var acu = 0;
    for (var i = 0; i < esc.length; i++) {
      var d = esc[i].seg / ritmo;
      if (t < acu + d || i === esc.length - 1) return { i: i, p: Math.max(0, Math.min(1, (t - acu) / d)) };
      acu += d;
    }
    return { i: 0, p: 0 };
  }

  function pintarFotograma(t, cv) {
    cv = cv || EU.$('euVideoLienzo');
    if (!cv || !lleno) return;
    var m = medidas();
    var mostrar = (cv.id === 'euVideoLienzo');
    if (mostrar) {
      var caja = cv.parentNode.clientWidth - 30;
      // que quepa entero de alto: el vídeo se juzga viéndolo, no haciendo scroll
      var porAlto = Math.max(240, window.innerHeight - 300) * (m.W / m.H);
      var ancho = Math.max(200, Math.min(420, caja, porAlto));
      var e2 = ancho / m.W;
      cv.width = Math.round(m.W * e2); cv.height = Math.round(m.H * e2);
    }
    var ctx = cv.getContext('2d');
    var s = cv.width / m.W;

    var E = escenaEn(t), e = esc[E.i], p = suave(E.p);
    // Cuántos cuadros están YA puestos en la base: los de las escenas
    // anteriores. El de la escena actual es el que está entrando.
    var cuadroK = 0;
    for (var i = 0; i < E.i; i++) if (esc[i].tipo === 'cuadro') cuadroK++;
    if (e.tipo === 'cierre') cuadroK = rects.length;
    ponerBase(cuadroK);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.scale(s, s);
    aplicarCamara(ctx, m, t, E, p);

    ctx.drawImage(base, 0, 0);

    if (e.tipo === 'cuadro' && rects[e.idx]) dibujarEfecto(ctx, rects[e.idx], e.efecto, p);
    if (subtitulos && e.frase) subtitulo(ctx, m, e.frase);
    ctx.restore();
  }

  function suave(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

  function aplicarCamara(ctx, m, t, E, p) {
    var cx = m.W / 2, cy = m.H / 2;
    if (camara === 'zoomlento') {
      var z = 1 + 0.06 * (t / Math.max(0.1, total()));
      ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy);
    } else if (camara === 'acercar') {
      var z2 = 1 + 0.045 * p;
      ctx.translate(cx, cy); ctx.scale(z2, z2); ctx.translate(-cx, -cy);
    } else if (camara === 'sacudida') {
      var a = Math.sin(t * 17) * m.W * 0.003, b = Math.cos(t * 13) * m.W * 0.003;
      ctx.translate(a, b);
    } else if (camara === 'fundido') {
      var f = Math.min(1, p / 0.18);
      ctx.globalAlpha = Math.max(0.15, f);
    }
  }

  /* El cuadro que entra: se recorta de «lleno» y se transforma. */
  function dibujarEfecto(ctx, r, efecto, p) {
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.save();

    if (efecto === 'circulo' || efecto === 'persiana') {
      ctx.beginPath();
      if (efecto === 'circulo') {
        ctx.arc(cx, cy, Math.sqrt(r.w * r.w + r.h * r.h) / 2 * p, 0, Math.PI * 2);
      } else {
        var n = 6, alto = r.h / n, abre = alto * p;
        for (var k = 0; k < n; k++) ctx.rect(r.x, r.y + k * alto, r.w, abre);
      }
      ctx.clip();
      trozo(ctx, r);
      ctx.restore();
      return;
    }

    ctx.beginPath(); ctx.rect(r.x - r.w, r.y - r.h, r.w * 3, r.h * 3); ctx.clip();

    if (efecto === 'giroy') {
      var ang = (1 - p) * Math.PI / 2;
      ctx.translate(cx, cy); ctx.scale(Math.max(0.02, Math.cos(ang)), 1); ctx.translate(-cx, -cy);
      ctx.globalAlpha = p;
    } else if (efecto === 'volteox') {
      var a2 = (1 - p) * Math.PI / 2;
      ctx.translate(cx, cy); ctx.scale(1, Math.max(0.02, Math.cos(a2))); ctx.translate(-cx, -cy);
      ctx.globalAlpha = p;
    } else if (efecto === 'cubo') {
      var a3 = (1 - p) * Math.PI / 2;
      ctx.translate(cx + Math.sin(a3) * r.w * 0.5, cy);
      ctx.scale(Math.max(0.02, Math.cos(a3)), 1);
      ctx.translate(-cx, -cy);
    } else if (efecto === 'puerta') {
      ctx.translate(r.x, cy); ctx.scale(Math.max(0.02, p), 1); ctx.translate(-r.x, -cy);
      ctx.globalAlpha = Math.min(1, p * 1.6);
    } else if (efecto === 'caida') {
      var q = rebote(p);
      ctx.translate(0, -(1 - q) * r.h * 1.25);
      ctx.translate(cx, cy); ctx.rotate((1 - q) * -0.12); ctx.translate(-cx, -cy);
    } else if (efecto === 'profundidad') {
      var z = 0.35 + 0.65 * p;
      ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy);
      ctx.globalAlpha = p;
    } else if (efecto === 'orbita') {
      var z2 = 0.6 + 0.4 * p;
      ctx.translate(cx, cy); ctx.rotate((1 - p) * -0.42); ctx.scale(z2, z2); ctx.translate(-cx, -cy);
      ctx.globalAlpha = p;
    } else if (efecto === 'hoja') {
      var a4 = (1 - p) * Math.PI / 2;
      ctx.translate(cx, cy); ctx.rotate((1 - p) * 0.18); ctx.scale(Math.max(0.02, Math.cos(a4)), 1); ctx.translate(-cx, -cy);
    } else if (efecto === 'deslizar') {
      ctx.translate(-(1 - p) * (r.x + r.w), 0);
    } else if (efecto === 'olas') {
      ctx.translate(0, (1 - p) * r.h * 0.6 * Math.sin(p * Math.PI + 1));
      ctx.globalAlpha = p;
    }

    trozo(ctx, r);
    ctx.restore();
  }

  function trozo(ctx, r) {
    ctx.drawImage(lleno, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  }

  function rebote(p) {
    if (p < 0.72) return (p / 0.72) * 1.06;
    return 1.06 - 0.06 * ((p - 0.72) / 0.28);
  }

  /* ───────────── Subtítulos ───────────── */

  function subtitulo(ctx, m, frase) {
    var t = String(frase || '').trim();
    if (!t) return;
    if (t.length > 90) t = t.slice(0, 88) + '…';
    var tam = Math.max(14, m.W * 0.032);
    ctx.save();
    ctx.font = '600 ' + tam.toFixed(1) + 'px Segoe UI,Arial,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var lineas = partir(ctx, t, m.W * 0.86);
    var alto = lineas.length * tam * 1.35;
    var y0 = m.H - m.H * 0.09 - alto;
    ctx.fillStyle = 'rgba(0,0,0,.52)';
    ctx.fillRect(m.W * 0.05, y0 - tam * 0.55, m.W * 0.90, alto + tam * 0.9);
    ctx.fillStyle = '#ffffff';
    lineas.forEach(function (l, i) { ctx.fillText(l, m.W / 2, y0 + tam * 0.7 + i * tam * 1.35); });
    ctx.restore();
  }
  function partir(ctx, t, ancho) {
    var pal = t.split(' '), li = [], cur = '';
    pal.forEach(function (w) {
      var pr = cur ? cur + ' ' + w : w;
      if (ctx.measureText(pr).width > ancho && cur) { li.push(cur); cur = w; }
      else cur = pr;
    });
    if (cur) li.push(cur);
    return li.slice(0, 3);
  }

  /* ───────────── Panel ───────────── */

  function panel() {
    var c = EU.$('euVideoPanel');
    if (!c) return;
    var grupos = { '3D': [], 'Plana': [] };
    Object.keys(EFECTOS).forEach(function (k) { grupos[EFECTOS[k].grupo].push(k); });

    c.innerHTML =
      '<div class="panel"><h3>Qué se anima</h3>' +
      '<p style="font-size:11px;color:var(--tx2);line-height:1.6;margin:0 0 8px">' +
      'Una escena por cuadro. Toca una y elige su efecto y su frase.</p>' +
      esc.map(function (e, i) {
        return '<div class="escena' + (i === sel ? ' sel' : '') + '" data-e="' + i + '">' +
          '<div class="cab"><b>' + EU.esc(e.nombre) + '</b>' +
          '<span>' + EU.esc(EFECTOS[e.efecto] ? EFECTOS[e.efecto].nombre : e.efecto) + ' · ' + e.seg.toFixed(1) + ' s</span></div>' +
          (i === sel ? '<textarea rows="2" data-frase="' + i + '" placeholder="lo que dice la voz en esta escena">' + EU.esc(e.frase || '') + '</textarea>' +
            '<div class="fila"><label class="lb">Dura</label><input type="range" min="1" max="8" step="0.1" value="' + e.seg + '" data-seg="' + i + '"></div>' : '') +
          '</div>';
      }).join('') +
      '<div class="ed-barra"><button class="btn btn-g btn-sm" data-guion="1">✍️ Que lo escriba el cerebro</button></div>' +
      '</div>' +

      '<div class="panel"><h3>Efecto de la escena</h3>' +
      ['3D', 'Plana'].map(function (g) {
        return '<label class="mini-lbl">' + (g === '3D' ? '3D del cuadro · 8' : 'Entradas planas · 4') + '</label>' +
          '<div class="tira">' + grupos[g].map(function (k) {
            return '<button class="pill' + (esc[sel] && esc[sel].efecto === k ? ' on' : '') + '" data-ef="' + k + '">' +
              EU.esc(EFECTOS[k].nombre) + '</button>';
          }).join('') + '</div>';
      }).join('') +
      '<label class="mini-lbl">Cámara</label><div class="tira">' +
      Object.keys(CAMARAS).map(function (k) {
        return '<button class="pill' + (camara === k ? ' on' : '') + '" data-cam="' + k + '">' + EU.esc(CAMARAS[k]) + '</button>';
      }).join('') + '</div>' +
      '<label class="mini-lbl">Ritmo</label><div class="tira">' +
      [['0.8', 'Lento'], ['1', 'Normal'], ['1.3', 'Rápido']].map(function (r) {
        return '<button class="pill' + (String(ritmo) === r[0] ? ' on' : '') + '" data-rit="' + r[0] + '">' + r[1] + '</button>';
      }).join('') + '</div>' +
      '</div>' +

      '<div class="panel"><h3>Sonido</h3>' +
      [['ninguno', 'Sin voz, sólo imagen'],
       ['vozgratis', 'Voz gratis del navegador'],
       ['grabar', 'Grabar mi voz'],
       ['subir', 'Subir música o audio'],
       ['estudio', 'Voz de estudio']].map(function (o) {
        var pro = o[0] === 'estudio';
        return '<div class="fila" style="margin:5px 0"><input type="radio" name="euSon" value="' + o[0] + '"' +
          (audio.modo === o[0] ? ' checked' : '') + ' style="width:auto"><span style="font-size:11.5px">' +
          o[1] + (pro ? '<span class="badge-pro">PRO</span>' : '') + '</span></div>';
      }).join('') +
      '<div id="euSonCtrl"></div>' +
      '<div class="st avi">Con la voz gratis: <b>altavoz, no auriculares</b>, y sitio en silencio — se capta por el micrófono. ' +
      'Y no cambies de pestaña mientras graba.</div>' +
      '</div>' +

      '<div class="panel"><h3>Marca en el vídeo</h3>' +
      '<div class="fila"><input type="checkbox" id="euSubs"' + (subtitulos ? ' checked' : '') + ' style="width:auto">' +
      '<span style="font-size:11.5px">Subtítulos de la narración</span></div>' +
      '<div class="fila"><input type="checkbox" id="euCierreQR"' + (cierreQR ? ' checked' : '') + ' style="width:auto">' +
      '<span style="font-size:11.5px">Cierre con el QR grande</span></div>' +
      '<p style="font-size:11px;color:var(--tx2);line-height:1.6;margin:8px 0 0">' +
      (EU_PLAN.llevaMarcaAgua()
        ? 'Con el plan Free el vídeo lleva marca de agua y dura como mucho ' + EU_PLAN.topeVideo() + ' s.'
        : 'Plan Pro: sin marca de agua, hasta ' + EU_PLAN.topeVideo() + ' s.') + '</p>' +
      '</div>';

    cablearPanel(c);
    controlesSonido();
  }

  function cablearPanel(c) {
    c.querySelectorAll('[data-e]').forEach(function (d) {
      d.onclick = function (ev) {
        if (ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'INPUT') return;
        sel = parseInt(d.getAttribute('data-e'), 10);
        panel(); pintarEnSel();
      };
    });
    c.querySelectorAll('[data-frase]').forEach(function (t) {
      t.oninput = function () { esc[parseInt(t.getAttribute('data-frase'), 10)].frase = t.value; };
    });
    c.querySelectorAll('[data-seg]').forEach(function (r) {
      r.oninput = function () {
        esc[parseInt(r.getAttribute('data-seg'), 10)].seg = parseFloat(r.value);
        duracionTexto();
      };
      r.onchange = function () { panel(); };
    });
    c.querySelectorAll('[data-ef]').forEach(function (b) {
      b.onclick = function () {
        if (!esc[sel]) return;
        esc[sel].efecto = b.getAttribute('data-ef');
        panel(); pintarEnSel();
      };
    });
    c.querySelectorAll('[data-cam]').forEach(function (b) {
      b.onclick = function () { camara = b.getAttribute('data-cam'); panel(); pintarEnSel(); };
    });
    c.querySelectorAll('[data-rit]').forEach(function (b) {
      b.onclick = function () { ritmo = parseFloat(b.getAttribute('data-rit')); panel(); duracionTexto(); };
    });
    var g = c.querySelector('[data-guion]');
    if (g) g.onclick = guionCerebro;
    c.querySelectorAll('input[name=euSon]').forEach(function (r) {
      r.onchange = function () {
        if (r.value === 'estudio' && !EU_PLAN.puede('vozEstudio')) {
          EU_PLAN.muro('vozEstudio');
          r.checked = false;
          audio.modo = 'ninguno';
          panel();
          return;
        }
        audio.modo = r.value;
        controlesSonido();
      };
    });
    var s = EU.$('euSubs'); if (s) s.onchange = function () { subtitulos = s.checked; pintarEnSel(); };
    var q = EU.$('euCierreQR'); if (q) q.onchange = function () { cierreQR = q.checked; };
  }

  function pintarEnSel() {
    var t = 0;
    for (var i = 0; i < sel; i++) t += esc[i].seg / ritmo;
    pintarFotograma(t + (esc[sel] ? esc[sel].seg / ritmo * 0.75 : 0));
  }

  function duracionTexto() {
    var e = EU.$('euVideoDur');
    if (!e) return;
    var t = total(), tope = EU_PLAN.topeVideo();
    e.innerHTML = t.toFixed(1) + ' s' + (t > tope ? ' <b style="color:var(--warn)">· tope ' + tope + ' s</b>' : '');
  }

  function guionCerebro() {
    esc.forEach(function (e) {
      if (e.tipo === 'portada') e.frase = fraseCabecera();
      else if (e.tipo === 'cierre') e.frase = fraseCierre();
      else e.frase = fraseCelda(EU.pagina.celdas[e.idx] || {});
    });
    panel();
    EU.toast('Guion escrito con los textos de tu folleto.');
  }

  /* ───────────── Sonido ───────────── */

  function controlesSonido() {
    var c = EU.$('euSonCtrl');
    if (!c) return;
    if (audio.modo === 'ninguno') { c.innerHTML = ''; return; }
    if (audio.modo === 'subir') {
      c.innerHTML = '<input type="file" accept="audio/*" id="euAudioFile" style="font-size:11px;margin-top:6px">';
      EU.$('euAudioFile').onchange = function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        audio.blob = f; audio.nombre = f.name;
        medirAudio(f);
      };
    } else if (audio.modo === 'grabar') {
      c.innerHTML = '<button class="btn btn-g btn-sm" style="margin-top:6px;width:100%" id="euGrabarVoz">🎙️ Grabar mi voz</button>';
      EU.$('euGrabarVoz').onclick = grabarVoz;
    } else if (audio.modo === 'vozgratis') {
      c.innerHTML = '<button class="btn btn-g btn-sm" style="margin-top:6px;width:100%" id="euVozGratis">🎙️ Preparar la voz gratis</button>';
      EU.$('euVozGratis').onclick = vozGratis;
    } else if (audio.modo === 'estudio') {
      c.innerHTML = '<label class="mini-lbl">Voz</label><select id="euVozSel">' +
        VOCES.map(function (v) { return '<option value="' + v + '">' + v + '</option>'; }).join('') + '</select>' +
        '<button class="btn btn-g btn-sm" style="margin-top:6px;width:100%" id="euVozEstudio">🎧 Preparar la voz de estudio</button>';
      EU.$('euVozEstudio').onclick = vozEstudio;
    }
    if (audio.blob) {
      c.insertAdjacentHTML('beforeend',
        '<div class="st ok">Audio listo: ' + EU.esc(audio.nombre || 'voz') +
        (audio.segundos ? ' · ' + audio.segundos.toFixed(1) + ' s' : '') + '</div>');
    }
  }

  function guion() {
    return esc.map(function (e) { return e.frase; }).filter(Boolean).join(' ');
  }

  function medirAudio(blob) {
    var a = new Audio();
    a.onloadedmetadata = function () {
      audio.segundos = isFinite(a.duration) ? a.duration : 0;
      if (audio.segundos > 0) ajustarADuracion(audio.segundos);
      controlesSonido(); panel();
    };
    a.onerror = function () { controlesSonido(); };
    a.src = URL.createObjectURL(blob);
  }

  /* «Cada escena dura lo que su frase»: el tiempo del audio se reparte entre
     las escenas en proporción a lo larga que es su frase. */
  function ajustarADuracion(seg) {
    var pesos = esc.map(function (e) { return Math.max(8, (e.frase || '').length); });
    var suma = pesos.reduce(function (a, b) { return a + b; }, 0);
    esc.forEach(function (e, i) { e.seg = Math.max(1, seg * pesos[i] / suma); });
    ritmo = 1;
    duracionTexto();
  }

  function vozGratis() {
    var t = guion();
    if (!t) { EU.estado('euVideoEstado', 'Escribe antes el guion de las escenas.', 'avi'); return; }
    if (!window.B6_VOZ_GRATIS || !B6_VOZ_GRATIS.disponible()) {
      EU.estado('euVideoEstado', 'Este navegador no puede captar la voz gratis. Prueba en Chrome, o graba tu voz.', 'err');
      return;
    }
    EU.estado('euVideoEstado', 'Preparando la voz… pon el <b>altavoz</b> y no cambies de pestaña.', 'proc');
    B6_VOZ_GRATIS.capturar({
      texto: t, vel: 1, tono: 1,
      aviso: function (m) { EU.estado('euVideoEstado', EU.esc(m), 'proc'); }
    }).then(function (r) {
      audio.blob = r.blob; audio.nombre = 'voz gratis'; audio.segundos = r.segundos;
      ajustarADuracion(r.segundos);
      EU.estado('euVideoEstado', 'Voz lista (' + r.segundos.toFixed(1) + ' s). Ya puedes grabar el vídeo.', 'ok');
      controlesSonido(); panel();
    }).catch(function (e) {
      EU.estado('euVideoEstado', EU.esc(e.message || e), 'err');
    });
  }

  function grabarVoz() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      EU.estado('euVideoEstado', 'Este navegador no deja grabar audio.', 'err'); return;
    }
    var btn = EU.$('euGrabarVoz');
    if (btn._rec) { btn._rec.stop(); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
      var trozos = [], rec = new MediaRecorder(st);
      btn._rec = rec;
      btn.textContent = '■ Parar de grabar';
      rec.ondataavailable = function (e) { if (e.data && e.data.size) trozos.push(e.data); };
      rec.onstop = function () {
        st.getTracks().forEach(function (t) { t.stop(); });
        btn._rec = null; btn.textContent = '🎙️ Grabar mi voz';
        var b = new Blob(trozos, { type: rec.mimeType || 'audio/webm' });
        audio.blob = b; audio.nombre = 'mi voz';
        medirAudio(b);
      };
      rec.start();
      EU.estado('euVideoEstado', 'Grabando tu voz… vuelve a pulsar para parar.', 'proc');
    }).catch(function (e) {
      EU.estado('euVideoEstado', 'No se pudo abrir el micrófono: ' + EU.esc(e.message || e), 'err');
    });
  }

  function vozEstudio() {
    if (!EU_PLAN.puede('vozEstudio')) { EU_PLAN.muro('vozEstudio'); return; }
    var t = guion();
    if (!t) { EU.estado('euVideoEstado', 'Escribe antes el guion de las escenas.', 'avi'); return; }
    EU.estado('euVideoEstado', 'Pidiendo la voz de estudio…', 'proc');
    fetch('/.netlify/functions/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: t.slice(0, 4000), voice: (EU.$('euVozSel') || {}).value || 'nova', speed: 1 })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (x) { throw new Error(x); });
      return r.blob();
    }).then(function (b) {
      audio.blob = b; audio.nombre = 'voz de estudio';
      medirAudio(b);
      EU.estado('euVideoEstado', 'Voz de estudio lista.', 'ok');
    }).catch(function (e) {
      EU.estado('euVideoEstado', 'No se pudo generar la voz de estudio: ' + EU.esc(String(e.message || e).slice(0, 300)), 'err');
    });
  }

  /* ───────────── Vista previa ───────────── */

  V.previa = function () {
    if (corriendo) { if (pararTodo) pararTodo(); return; }
    preparar();
    correr(null, function () {});
  };

  function correr(alFotograma, alAcabar) {
    corriendo = true;
    var t0 = performance.now(), dur = total() * 1000, cancelado = false;
    pararTodo = function () { cancelado = true; };
    (function paso() {
      if (cancelado) { corriendo = false; pararTodo = null; alAcabar(); return; }
      var t = (performance.now() - t0) / 1000;
      if (t >= total()) {
        pintarFotograma(total() - 0.001);
        corriendo = false; pararTodo = null;
        alAcabar();
        return;
      }
      pintarFotograma(t);
      if (alFotograma) alFotograma(t);
      requestAnimationFrame(paso);
    })();
    return dur;
  }

  /* ───────────── Grabar ───────────── */

  V.grabar = function () {
    if (corriendo) { if (pararTodo) pararTodo(); return; }
    if (!EU_PLAN.exigeSesion()) return;

    var tope = EU_PLAN.topeVideo();
    if (total() > tope) {
      EU_PLAN.muro('video', 'Tu vídeo dura ' + total().toFixed(1) + ' s. Acorta las escenas o pasa a Pro.');
      return;
    }
    if (!window.MediaRecorder || !document.createElement('canvas').captureStream) {
      EU.estado('euVideoEstado', 'Este navegador no sabe grabar vídeo. Prueba en Chrome.', 'err');
      return;
    }

    preparar();
    var m = medidas();
    var cv = document.createElement('canvas');
    cv.width = m.W; cv.height = m.H;

    var flujo = new MediaStream();
    cv.captureStream(30).getVideoTracks().forEach(function (t) { flujo.addTrack(t); });

    var ac = null, fuente = null;
    var seguir = function () { arranca(); };

    if (audio.blob) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      audio.blob.arrayBuffer().then(function (ab) { return ac.decodeAudioData(ab); })
        .then(function (buf) {
          var dest = ac.createMediaStreamDestination();
          fuente = ac.createBufferSource();
          fuente.buffer = buf;
          fuente.connect(dest);
          fuente.connect(ac.destination);
          dest.stream.getAudioTracks().forEach(function (t) { flujo.addTrack(t); });
          seguir();
        })
        .catch(function () {
          EU.estado('euVideoEstado', 'No se pudo leer el audio: el vídeo saldrá sin sonido.', 'avi');
          seguir();
        });
    } else { seguir(); }

    function arranca() {
      var tipo = '';
      ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].some(function (x) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x)) { tipo = x; return true; }
        return false;
      });
      var rec;
      try { rec = new MediaRecorder(flujo, tipo ? { mimeType: tipo, videoBitsPerSecond: 4500000 } : undefined); }
      catch (e) { EU.estado('euVideoEstado', 'No se pudo iniciar la grabación: ' + EU.esc(e.message || e), 'err'); return; }

      var trozos = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) trozos.push(e.data); };
      rec.onstop = function () {
        try { if (fuente) fuente.stop(); } catch (e) {}
        try { if (ac) ac.close(); } catch (e) {}
        var mp4 = /mp4/.test(rec.mimeType || tipo || '');
        var b = new Blob(trozos, { type: mp4 ? 'video/mp4' : 'video/webm' });
        EU_EDITOR.bajar(b, EU_EDITOR.limpio(EU.marca.nombre || 'video') + (mp4 ? '.mp4' : '.webm'));
        EU.estado('euVideoEstado',
          'Vídeo descargado' + (mp4 ? '.' : ' en formato WebM: este navegador no sabe hacer MP4. Se ve en el ordenador y en Android; para iPhone conviértelo.') +
          ' Pesa ' + Math.round(b.size / 1024) + ' KB.', mp4 ? 'ok' : 'avi');
        EU.$('euBtnGrabar').textContent = '⏺ Grabar el vídeo';
      };

      EU.$('euBtnGrabar').textContent = '■ Parar';
      EU.estado('euVideoEstado',
        'Grabando… tarda lo mismo que dura el vídeo (' + total().toFixed(1) + ' s). ' +
        '<b>No cambies de pestaña</b>.', 'proc');

      rec.start();
      if (fuente) { try { fuente.start(); } catch (e) {} }

      var ctxOff = cv.getContext('2d');
      var t0 = performance.now(), cancelado = false;
      corriendo = true;
      pararTodo = function () { cancelado = true; };

      (function paso() {
        var t = (performance.now() - t0) / 1000;
        if (cancelado || t >= total()) {
          pintarFotograma(Math.min(t, total() - 0.001), cv);
          EU_PLAN.marcaAgua(ctxOff, m.W, m.H);
          corriendo = false; pararTodo = null;
          setTimeout(function () { try { rec.stop(); } catch (e) {} }, 120);
          return;
        }
        pintarFotograma(t, cv);
        EU_PLAN.marcaAgua(ctxOff, m.W, m.H);
        pintarFotograma(t);           // espejo en pantalla, para verlo salir
        requestAnimationFrame(paso);
      })();
    }
  };

  window.addEventListener('resize', function () { if (EU.pantalla === 'video' && !corriendo) pintarEnSel(); });
  window.addEventListener('pagehide', function () { if (pararTodo) pararTodo(); });
})();
