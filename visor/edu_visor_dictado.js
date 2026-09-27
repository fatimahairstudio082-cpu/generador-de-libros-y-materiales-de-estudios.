/* edu_visor_dictado.js — dictado por voz en los cuadros de texto (🎤 Dictar).
   Usa el reconocimiento de voz del propio navegador (Web Speech API): gratis y sin claves.
   Chrome y Edge lo procesan en el servicio de voz del navegador; Safari, en el dispositivo.
   Lo dictado se escribe donde está el cursor, como si se hubiera tecleado. */
(function () {
  'use strict';
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var CAJAS = ['crTexto', 'txtApuntes'];
  var activo = null;   // { rec, boton, caja }

  function insertar(caja, texto) {
    var ini = caja.selectionStart != null ? caja.selectionStart : caja.value.length;
    var fin = caja.selectionEnd != null ? caja.selectionEnd : ini;
    var antes = caja.value.slice(0, ini), despues = caja.value.slice(fin);
    var sep = antes && !/\s$/.test(antes) ? ' ' : '';
    caja.value = antes + sep + texto + despues;
    var pos = (antes + sep + texto).length;
    caja.setSelectionRange(pos, pos);
    caja.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Órdenes habladas para la puntuación y los saltos de línea.
  function puntuar(t) {
    return t.replace(/\s*\b(punto y aparte|nuevo párrafo)\b\s*/gi, '.\n')
      .replace(/\s*\bnueva línea\b\s*/gi, '\n')
      .replace(/\s*\bpunto y coma\b/gi, ';')
      .replace(/\s*\bdos puntos\b/gi, ':')
      .replace(/\s*\bpunto\b/gi, '.')
      .replace(/\s*\bcoma\b/gi, ',');
  }

  function parar() {
    if (!activo) return;
    try { activo.rec.stop(); } catch (e) { }
    activo.boton.textContent = '🎤 Dictar';
    activo.boton.setAttribute('aria-pressed', 'false');
    activo = null;
  }

  function empezar(caja, boton, nota) {
    parar();
    var rec = new Rec();
    rec.lang = document.documentElement.lang === 'es' ? 'es-ES' : (navigator.language || 'es-ES');
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = function (ev) {
      for (var i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) insertar(caja, puntuar(ev.results[i][0].transcript.trim()));
    };
    rec.onerror = function (ev) { nota.textContent = ev.error === 'not-allowed' ? 'Permite el uso del micrófono para dictar.' : 'Dictado detenido (' + ev.error + ').'; parar(); };
    rec.onend = function () { if (activo && activo.rec === rec) parar(); };
    activo = { rec: rec, boton: boton, caja: caja };
    boton.textContent = '⏹ Parar dictado';
    boton.setAttribute('aria-pressed', 'true');
    nota.textContent = 'Habla con normalidad. Di «punto», «coma», «nueva línea» o «punto y aparte».';
    caja.focus();
    rec.start();
  }

  CAJAS.forEach(function (id) {
    var caja = document.getElementById(id);
    if (!caja) return;
    var barra = document.createElement('div');
    barra.className = 'dictado';
    barra.innerHTML = '<button type="button" class="boton secundario" aria-pressed="false">🎤 Dictar</button><span class="dictado-nota"></span>';
    caja.parentNode.insertBefore(barra, caja);
    var boton = barra.querySelector('button'), nota = barra.querySelector('.dictado-nota');
    if (!Rec) { boton.disabled = true; nota.textContent = 'Este navegador no permite dictar: usa Chrome, Edge o Safari.'; return; }
    boton.addEventListener('click', function () { if (activo && activo.caja === caja) parar(); else empezar(caja, boton, nota); });
  });
})();
