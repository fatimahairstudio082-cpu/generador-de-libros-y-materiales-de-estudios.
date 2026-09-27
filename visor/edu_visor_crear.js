/* edu_visor_crear.js — pestaña «Crear» (asistente «¿Qué quieres crear?»).
   Usa EDU.proyecto, EDU.pegado y la API mínima que expone el visor
   (window.EDU_VISOR). No contiene reglas de contenido. */
(function () {
  'use strict';
  var EDU = window.EDU, VIS = window.EDU_VISOR;
  if (!EDU || !EDU.proyecto || !EDU.pegado || !VIS) return;
  var esc = EDU.esc, B = EDU.biblioteca;
  function $(id) { return document.getElementById(id); }

  var tipoElegido = 'libro';

  function pintarTipos() {
    var T = EDU.proyecto.tipos();
    $('tiposTrabajo').innerHTML = Object.keys(T).map(function (k) {
      var t = T[k];
      return '<button type="button" class="tipo-trabajo" role="radio" aria-checked="' + (k === tipoElegido) + '" data-tipo="' + k + '"><strong>' + esc(t.nombre) + '</strong><span>' + esc(t.desc) + '</span><span>' + esc(t.formatos.join(' · ')) + (t.listo ? '' : ' · descarga en preparación') + '</span></button>';
    }).join('');
    $('tiposTrabajo').querySelectorAll('.tipo-trabajo').forEach(function (b) {
      b.addEventListener('click', function () { tipoElegido = b.getAttribute('data-tipo'); pintarTipos(); });
    });
  }

  function rellenar() {
    var niv = EDU.esquemas.catalogo('niveles');
    $('crNivel').innerHTML = Object.keys(niv).sort(function (a, b) { return niv[a].rango - niv[b].rango; }).map(function (k) { return '<option value="' + k + '">' + esc(niv[k].nombre) + '</option>'; }).join('');
    $('crNivel').value = 'secundaria';
    var L = EDU.puente.obtener('laminas');
    var pals = L ? L.paletas() : [];
    $('crPaleta').innerHTML = '<option value="">Automático según la materia</option>' + pals.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.nombre || p.id) + '</option>'; }).join('');
    return B.arbol().then(function (arbol) {
      var ops = [];
      (function recorrer(nodos, ruta) {
        nodos.forEach(function (n) {
          var r = ruta.concat(n.nombre);
          if (n.clase === 'tema' || n.clase === 'subtema') ops.push('<option value="' + esc(n.id) + '">' + esc(r.join(' › ')) + ' (' + n.total + ')</option>');
          recorrer(n.hijas, r);
        });
      })(arbol, []);
      $('crRama').innerHTML = ops.join('') || '<option value="">El banco está vacío</option>';
    });
  }

  function pintarTrabajos() {
    return EDU.proyecto.listar().then(function (l) {
      var T = EDU.proyecto.tipos();
      l = l.filter(function (p) { return p.trabajo; });
      $('listaTrabajos').innerHTML = l.length ? l.map(function (p) {
        return '<li><button type="button" data-proyecto="' + esc(p.id) + '" data-titulo="' + esc(p.titulo) + '"><span>' + esc(p.titulo) + '</span><span class="tipo">' + esc((T[p.trabajo.tipo] || {}).nombre || '') + ' · ' + p.trabajo.hojas + ' hojas</span></button></li>';
      }).join('') : '<li class="vacio">Todavía no hay trabajos.</li>';
      $('listaTrabajos').querySelectorAll('button[data-proyecto]').forEach(function (b) {
        b.addEventListener('click', function () { VIS.seleccionar({ modo: 'proyecto', id: b.getAttribute('data-proyecto'), titulo: b.getAttribute('data-titulo') }); });
      });
    });
  }

  function estado(t, mal) { var e = $('crEstado'); e.textContent = t; e.style.color = mal ? 'var(--mal)' : ''; }

  function crear(ev) {
    ev.preventDefault();
    var usarBanco = $('crUsarBanco').checked && $('crRama').value;
    var texto = $('crUsarPegado').checked ? $('crTexto').value : '';
    if (!usarBanco && !texto.trim()) { estado('Elige un tema del banco o pega un texto.', true); return; }
    $('btnCrear').disabled = true;
    estado('Creando…');
    var op = {
      titulo: $('crTitulo').value, tipo: tipoElegido, nivel: $('crNivel').value, hojas: Number($('crHojas').value),
      papel: $('crPapel').value, paleta: $('crPaleta').value || null,
      origen: usarBanco && texto.trim() ? 'mixto' : usarBanco ? 'banco' : 'pegado',
      ramas: usarBanco ? [$('crRama').value] : []
    };
    var pro;
    EDU.proyecto.crear(op).then(function (p) {
      pro = p;
      if (!texto.trim()) return null;
      return EDU.pegado.importar(texto, { proyecto: p.id, titulo: p.titulo, url: $('crUrl').value.trim() || undefined, nivel: p.nivel })
        .then(function (inf) { return EDU.proyecto.anadirContenido(p.id, { ucs: inf.raices }); });
    }).then(function () {
      estado('');
      $('btnCrear').disabled = false;
      return Promise.all([pintarTrabajos(), VIS.pintarArbol()]);
    }).then(function () {
      return VIS.seleccionar({ modo: 'proyecto', id: pro.id, titulo: pro.titulo });
    }).catch(function (e) {
      $('btnCrear').disabled = false;
      var det = e.errores && e.errores.length ? ' ' + e.errores.map(function (x) { return (x.linea ? 'Línea ' + x.linea + ': ' : '') + x.mensaje; }).slice(0, 3).join(' · ') : '';
      estado(e.message + det, true);
    });
  }

  function arrancar() {
    $('tabCrear').addEventListener('click', function () { VIS.pestana('Crear'); pintarTrabajos(); });
    $('crUsarPegado').addEventListener('change', function () { $('bloquePegado').hidden = !this.checked; });
    $('crUsarBanco').addEventListener('change', function () { $('crRama').disabled = !this.checked; });
    $('crHojasRango').addEventListener('input', function () { $('crHojas').value = this.value; });
    $('crHojas').addEventListener('input', function () { var v = Number(this.value); if (v >= 10 && v <= 300) $('crHojasRango').value = v; });
    $('formCrear').addEventListener('submit', crear);
    pintarTipos();
    EDU.almacen.abrir().then(rellenar).then(pintarTrabajos).catch(function () { });
    EDU.on('biblioteca:cambio', function () { rellenar(); });
  }

  arrancar();
})();
