/* edu_visor.js — pantalla de prueba del núcleo (módulo 12 de la fase 1).
   Solo usa las API de los módulos: no contiene reglas de contenido.
   Biblioteca → expansión → secuencia → redacción → auditoría, con «otra
   versión», origen de cada frase y entrada de apuntes propios. */
(function () {
  'use strict';
  var EDU = window.EDU;
  if (!EDU || !EDU.redactor || !EDU.variacion) { document.getElementById('documento').innerHTML = '<p>No se han podido cargar los módulos del sistema.</p>'; return; }
  var A = EDU.almacen, B = EDU.biblioteca, X = EDU.expansor, S = EDU.secuencia, R = EDU.redactor, V = EDU.variacion, I = EDU.importador, E = EDU.esquemas;
  var esc = EDU.esc;
  function $(id) { return document.getElementById(id); }

  var PROYECTO_APUNTES = 'pro_apuntes';
  var EJEMPLO_APUNTES = [
    '# La célula',
    'Célula: unidad básica de los seres vivos',
    '  Membrana: capa que envuelve la célula y la separa del exterior',
    '  Citoplasma: medio en el que se encuentran los orgánulos',
    '  Núcleo: parte de la célula que contiene el material genético',
    '    Ej: el núcleo de una célula de la piel',
    '  → requiere: Seres vivos',
    'Seres vivos',
    '  Definición: organismos que nacen, crecen, se reproducen y mueren',
    '## Descubrimiento',
    '- 1665: Robert Hooke observa celdas en una lámina de corcho',
    'Procedimiento: Observar células al microscopio',
    '  1. Colocar la muestra en el portaobjetos',
    '  2. Cubrirla con el cubreobjetos',
    '  3. Enfocar primero con el objetivo de menor aumento'
  ].join('\n');

  var st = {
    objetivo: null,          // { modo:'uc'|'rama', id, titulo }
    nivel: '', semilla: 1,
    estructuras: null, sec: null, red: null, auditoria: null,
    anterior: null, marcar: false, afs: [], ultimaImportacion: null
  };

  function pref(k, v) { try { return v === undefined ? A.pref(k) : A.pref(k, v); } catch (e) { return null; } }

  /* ───────────────────────── Arranque ───────────────────────── */

  function arrancar() {
    rellenarNiveles($('selNivel'), true);
    rellenarNiveles($('selNivelApuntes'), false);
    $('selNivelApuntes').value = 'secundaria';
    $('txtApuntes').value = EJEMPLO_APUNTES;
    ['chkObjetivos', 'chkPreguntas', 'chkPendientes'].forEach(function (id) { $(id).addEventListener('change', regenerar); });
    $('selNivel').addEventListener('change', function () { st.nivel = $('selNivel').value; generar(); });
    $('btnOtra').addEventListener('click', otraVersion);
    $('btnMarcar').addEventListener('click', function () { st.marcar = !st.marcar; this.setAttribute('aria-pressed', String(st.marcar)); this.textContent = st.marcar ? 'Ocultar cambios' : 'Marcar cambios'; pintarDocumento(); });
    $('tabMaterial').addEventListener('click', function () { pestana('Material'); });
    $('tabApuntes').addEventListener('click', function () { pestana('Apuntes'); });
    $('btnAnalizar').addEventListener('click', function () { apuntes(false); });
    $('btnImportar').addEventListener('click', function () { apuntes(true); });
    $('btnDeshacer').addEventListener('click', deshacerImportacion);
    $('btnRestablecer').addEventListener('click', restablecer);
    $('documento').addEventListener('click', clicFrase);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarOrigen(); });

    A.abrir().then(function (modo) {
      $('avisoMemoria').hidden = modo === 'indexeddb';
      return B.estadisticas();
    }).then(function (stt) {
      return stt.ucs ? null : B.cargarIndice();
    }).then(function () {
      return pintarArbol();
    }).then(function () {
      var guardado = pref('visor_objetivo');
      if (guardado && guardado.id) return seleccionar(guardado);
      return B.buscar('Ciclo del agua').then(function (l) {
        var u = l.filter(function (x) { return x.titulo === 'Ciclo del agua'; })[0] || l[0];
        return u ? seleccionar({ modo: 'uc', id: u.id, titulo: u.titulo, rama: u.rama }) : null;
      });
    }).catch(function (e) { mostrarError(e); });
  }

  function rellenarNiveles(sel, auto) {
    var cat = E.catalogo('niveles');
    var html = auto ? '<option value="">Automático</option>' : '';
    Object.keys(cat).sort(function (a, b) { return cat[a].rango - cat[b].rango; }).forEach(function (k) { html += '<option value="' + k + '">' + esc(cat[k].nombre) + '</option>'; });
    sel.innerHTML = html;
  }

  function pestana(cual) {
    var mat = cual === 'Material';
    $('tabMaterial').setAttribute('aria-selected', String(mat));
    $('tabApuntes').setAttribute('aria-selected', String(!mat));
    $('vistaMaterial').hidden = !mat;
    $('vistaApuntes').hidden = mat;
    cerrarOrigen();
  }

  function mostrarError(e) {
    $('documento').innerHTML = '<p class="pendiente">No se ha podido generar el material: ' + esc(e && e.message ? e.message : String(e)) + '</p>';
    if (window.console) console.error(e);
  }

  /* ───────────────────────── Biblioteca ───────────────────────── */

  function pintarArbol() {
    return Promise.all([B.arbol(), B.estadisticas(), A.listar('uc', { campo: 'proyecto', valor: PROYECTO_APUNTES })]).then(function (r) {
      var arbol = r[0], stt = r[1], mios = r[2];
      function nodo(n) {
        var marcado = st.objetivo && st.objetivo.modo === 'rama' && st.objetivo.id === n.id;
        return '<li class="' + esc(n.clase) + '"><button type="button" data-rama="' + esc(n.id) + '" data-titulo="' + esc(n.nombre) + '" aria-current="' + marcado + '"><span>' + esc(n.nombre) + '</span><span class="cuenta">' + n.total + '</span></button>' +
          (n.hijas.length ? '<ul>' + n.hijas.map(nodo).join('') + '</ul>' : '') + '</li>';
      }
      var html = arbol.map(nodo).join('');
      if (mios.length) html += '<li class="materia"><button type="button" data-apuntes="1"><span>Mis apuntes</span><span class="cuenta">' + mios.length + '</span></button></li>';
      $('arbol').innerHTML = html || '<li class="vacio">La biblioteca está vacía.</li>';
      $('arbol').querySelectorAll('button[data-rama]').forEach(function (b) {
        b.addEventListener('click', function () { seleccionar({ modo: 'rama', id: b.getAttribute('data-rama'), titulo: b.getAttribute('data-titulo') }); });
      });
      var ap = $('arbol').querySelector('button[data-apuntes]');
      if (ap) ap.addEventListener('click', function () { pintarUnidades(null, 'Mis apuntes', mios); });
      $('estadoDatos').textContent = stt.ucs + ' unidades · ' + stt.relaciones + ' relaciones · ' + stt.ramas + ' ramas · guardado en este navegador';
    });
  }

  function pintarUnidades(ramaId, titulo, lista) {
    var pedir = lista ? Promise.resolve(lista) : B.ucsDeRama(ramaId);
    return pedir.then(function (ucs) {
      $('tituloUnidades').textContent = 'Unidades · ' + titulo;
      var tipos = E.catalogo('tiposUC');
      ucs.sort(function (a, b) { return a.titulo.localeCompare(b.titulo, 'es'); });
      $('unidades').innerHTML = ucs.length ? ucs.map(function (u) {
        var marcado = st.objetivo && st.objetivo.modo === 'uc' && st.objetivo.id === u.id;
        return '<li><button type="button" data-uc="' + esc(u.id) + '" data-titulo="' + esc(u.titulo) + '" aria-current="' + marcado + '"><span>' + esc(u.titulo) + '</span><span class="tipo">' + esc((tipos[u.tipo] || {}).nombre || u.tipo) + '</span></button></li>';
      }).join('') : '<li class="vacio">Sin unidades.</li>';
      $('unidades').querySelectorAll('button[data-uc]').forEach(function (b) {
        b.addEventListener('click', function () { seleccionar({ modo: 'uc', id: b.getAttribute('data-uc'), titulo: b.getAttribute('data-titulo'), rama: ramaId }); });
      });
    });
  }

  function seleccionar(obj) {
    st.objetivo = obj;
    st.semilla = 1;
    st.anterior = null;
    pref('visor_objetivo', obj);
    pestana('Material');
    var ramaLista = obj.modo === 'rama' ? obj.id : obj.rama;
    var tareas = [pintarArbol()];
    if (ramaLista) tareas.push(B.ruta(ramaLista).then(function (c) { return pintarUnidades(ramaLista, c.length ? c[c.length - 1].nombre : ''); }));
    else tareas.push(A.listar('uc', { campo: 'proyecto', valor: PROYECTO_APUNTES }).then(function (l) { return pintarUnidades(null, 'Mis apuntes', l); }));
    return Promise.all(tareas).then(generar);
  }

  /* ───────────────────────── Generación ───────────────────────── */

  function opcionesRedactor() {
    return { semilla: st.semilla, objetivos: $('chkObjetivos').checked, preguntas: $('chkPreguntas').checked, pendientes: $('chkPendientes').checked };
  }

  function generar() {
    if (!st.objetivo) return Promise.resolve();
    $('documento').innerHTML = '<p class="vacio">Generando…</p>';
    var op = st.nivel ? { nivel: st.nivel } : {};
    var pedir = st.objetivo.modo === 'rama' ? X.expandirRama(st.objetivo.id, op) : X.expandir(st.objetivo.id, op).then(function (e) { return [e]; });
    return pedir.then(function (ests) {
      if (!ests.length) throw new Error('Esta rama no tiene unidades con las que trabajar.');
      st.estructuras = ests;
      st.sec = S.secuenciar(ests);
      regenerar();
    }).catch(mostrarError);
  }

  function regenerar() {
    if (!st.sec) return;
    try {
      st.red = R.redactar(st.sec, st.estructuras, opcionesRedactor());
      st.auditoria = R.auditar(st.red, st.estructuras);
      pintarIndicadores();
      pintarDocumento();
    } catch (e) { mostrarError(e); }
  }

  function otraVersion() {
    if (!st.sec) return;
    try {
      var o = V.otraVersion(st.sec, st.estructuras, st.semilla, { redactor: opcionesRedactor() });
      st.anterior = st.red;
      st.semilla = o.semilla;
      st.red = o.redaccion;
      st.auditoria = R.auditar(st.red, st.estructuras);
      st.comparacion = o.comparacion;
      pintarIndicadores();
      pintarDocumento();
    } catch (e) { mostrarError(e); }
  }

  /* ───────────────────────── Indicadores ───────────────────────── */

  function pintarIndicadores() {
    var total = 0, pend = 0;
    st.estructuras.forEach(function (e) { total += e.resumen.total; pend += e.resumen.pendiente; });
    var cob = total ? Math.round(100 * (total - pend) / total) : 0;
    var au = st.auditoria, hechos = R.hechos(st.red).length;
    var html = '<div class="cobertura" title="Parte del material que tiene respaldo en los datos"><span>Cobertura ' + cob + '%</span><span class="pista"><span class="relleno" style="width:' + cob + '%"></span></span></div>';
    html += au.ok ? '<span class="chip bien">✓ Auditoría: nada alterado, añadido ni eliminado</span>'
      : '<button type="button" class="chip mal" id="chipProblemas">✗ Auditoría: ' + au.problemas.length + ' problemas</button>';
    html += '<span class="chip">' + hechos + ' hechos · ' + R.afirmaciones(st.red).length + ' frases</span>';
    html += '<span class="chip pend">' + pend + ' huecos pendientes</span>';
    html += '<span class="chip">Versión ' + st.semilla + '</span>';
    if (st.comparacion && st.anterior) html += '<span class="chip">' + (st.comparacion.mismosHechos ? 'Mismos hechos · ' : 'HECHOS DISTINTOS · ') + st.comparacion.porcentaje + '% de frases cambiadas</span>';
    if (st.sec.indeterminado.length) html += '<span class="chip" title="Posiciones que los datos no fijan; se conserva el orden estable">' + st.sec.indeterminado.length + ' posiciones sin orden fijado por los datos</span>';
    $('indicadores').innerHTML = html;
    var lista = $('problemas');
    lista.hidden = true;
    lista.innerHTML = au.problemas.map(function (p) { return '<li>' + esc(p.problema) + (p.texto ? ' — «' + esc(p.texto) + '»' : '') + '</li>'; }).join('');
    var chip = $('chipProblemas');
    if (chip) chip.addEventListener('click', function () { lista.hidden = !lista.hidden; });
    $('btnMarcar').disabled = !st.anterior;
  }

  /* ───────────────────────── Documento ───────────────────────── */

  function pintarDocumento() {
    var red = st.red, cambiadas = {};
    st.afs = [];
    if (st.marcar && st.comparacion) st.comparacion.diferencias.forEach(function (d) { if (d.despues) cambiadas[d.despues] = true; });
    function af(a, clase) {
      st.afs.push(a);
      var c = 'af' + (cambiadas[a.texto] ? ' cambio' : '') + (clase ? ' ' + clase : '');
      return '<span class="' + c + '" data-af="' + (st.afs.length - 1) + '" tabindex="0">' + esc(a.texto) + '</span>';
    }
    function frases(b) { return (b.frases || []).map(function (a) { return af(a); }).join(' '); }
    function bloques(lista) {
      var html = '', rel = [], preg = [];
      function vaciar() {
        if (rel.length) { html += '<p>' + rel.join(' ') + '</p>'; rel = []; }
        if (preg.length) { html += '<h3>Preguntas</h3>' + preg.join(''); preg = []; }
      }
      lista.forEach(function (b) {
        if (b.tipo === 'relacion') { if (preg.length) vaciar(); rel.push(frases(b)); return; }
        if (b.tipo === 'pregunta') { if (rel.length) { html += '<p>' + rel.join(' ') + '</p>'; rel = []; } preg.push(pregunta(b)); return; }
        vaciar();
        html += bloque(b);
      });
      vaciar();
      return html;
    }
    function bloque(b) {
      switch (b.tipo) {
        case 'pendiente': return '<p class="pendiente">Pendiente — ' + esc(b.nota) + '</p>';
        case 'presentacion': return b.frases.length ? '<p>' + frases(b) + '</p>' : '';
        case 'ejemplo': return '<p class="ejemplo">' + frases(b) + '</p>';
        case 'pasos': return '<p>' + af(b.frases[0]) + '</p><div class="pasos">' + b.frases.slice(1).map(function (a) { return '<div>' + af(a) + '</div>'; }).join('') + '</div>';
        case 'repaso': return '<h3>' + esc(b.frases[0].texto.replace(/:$/, '')) + '</h3><ul class="repaso">' + b.frases.slice(1).map(function (a) { return '<li>' + af(a) + '</li>'; }).join('') + '</ul>';
        case 'visualizacion': return '<div class="esquema">' + af(b.frases[0]) + ' Forma: ' + esc(b.forma) + '. Se dibujará con el Motor Visual (fase 2), con las familias ' + esc(b.familias.join(', ')) + '.</div>';
        default: return '<p>' + frases(b) + '</p>';
      }
    }
    function pregunta(b) {
      var ops = '';
      if (b.opciones && b.opciones.conceptos) ops = '<div class="opciones">' + b.opciones.conceptos.map(function (a) { return af(a); }).join('') + '</div><div class="opciones">' + b.opciones.definiciones.map(function (a) { return af(a); }).join('') + '</div>';
      else if (b.opciones) ops = '<div class="opciones">' + b.opciones.map(function (a) { return af(a); }).join('') + '</div>';
      return '<div class="pregunta">' + af(b.enunciado) + ops + '<details><summary>Ver respuesta</summary><div>' + [].concat(b.respuesta).map(function (a) { return af(a); }).join(' ') + '</div></details></div>';
    }
    var html = '';
    if (red.requisitos) html += '<p class="requisitos">' + af(red.requisitos) + '</p>';
    red.secciones.forEach(function (s) {
      html += '<h2><span class="num">' + s.orden + '</span>' + esc(s.titulo) + (s.ordenIndeterminado ? '<span class="etiqueta" title="Los datos no fijan la posición de esta sección">orden no fijado</span>' : '') + '</h2>';
      if (s.objetivos.length) html += '<ul class="objetivos">' + s.objetivos.map(function (a) { return '<li>' + af(a) + '</li>'; }).join('') + '</ul>';
      html += bloques(s.bloques);
    });
    if (red.sintesis.bloques.length || red.sintesis.objetivos.length) {
      html += '<h2>' + esc(red.sintesis.titulo) + '</h2>';
      if (red.sintesis.objetivos.length) html += '<ul class="objetivos">' + red.sintesis.objetivos.map(function (a) { return '<li>' + af(a) + '</li>'; }).join('') + '</ul>';
      html += bloques(red.sintesis.bloques);
    }
    $('documento').innerHTML = html;
  }

  /* ───────────────────────── Origen de una frase ───────────────────────── */

  var NOMBRES = { titulo: 'Título', texto: 'Texto', fecha: 'Fecha', expresion: 'Expresión', paso: 'Paso', relacion: 'Relación', verbo: 'Verbo del objetivo' };

  function clicFrase(e) {
    var el = e.target.closest ? e.target.closest('.af') : null;
    if (!el) return;
    var a = st.afs[Number(el.getAttribute('data-af'))];
    if (!a) return;
    document.querySelectorAll('.af.elegida').forEach(function (x) { x.classList.remove('elegida'); });
    el.classList.add('elegida');
    mostrarOrigen(a);
  }

  function mostrarOrigen(a) {
    var ucs = [];
    a.hechos.forEach(function (h) { if (h.uc && ucs.indexOf(h.uc) < 0) ucs.push(h.uc); });
    var panel = $('origen');
    var hechos = a.hechos.length ? a.hechos.map(function (h) {
      var v = h.campo === 'relacion' ? ((E.relacion(h.tipo) || {}).nombre || h.tipo) : h.valor;
      return '<div><dt>' + esc(NOMBRES[h.campo] || h.campo) + '</dt><dd>' + esc(v) + '</dd></div>';
    }).join('') : '<div><dd class="vacio">Frase de marco: no afirma ningún hecho.</dd></div>';
    panel.innerHTML = '<header><h2>Origen de la frase</h2><button type="button" class="cerrar" id="btnCerrarOrigen">Cerrar</button></header>' +
      '<p class="frase">' + esc(a.texto) + '</p><dl>' + hechos + '<div><dt>Unidades de conocimiento</dt><dd id="origenUCs">…</dd></div>' +
      '<div><dt>Identificadores de origen</dt><dd class="ids">' + esc(a.desde.join(' · ')) + '</dd></div></dl>';
    panel.hidden = false;
    $('btnCerrarOrigen').addEventListener('click', cerrarOrigen);
    Promise.all(ucs.map(function (id) { return A.obtener('uc', id); })).then(function (lista) {
      return Promise.all(lista.filter(Boolean).map(function (u) {
        return (u.fuente ? A.obtener('fuente', u.fuente) : Promise.resolve(null)).then(function (f) { return { u: u, f: f }; });
      }));
    }).then(function (items) {
      var lic = E.catalogo('licencias'), ori = E.catalogo('origenes');
      $('origenUCs').innerHTML = items.length ? items.map(function (x) {
        return '<div><strong>' + esc(x.u.titulo) + '</strong> · ' + esc((ori[x.u.origen] || {}).nombre || x.u.origen) +
          (x.f ? '<br><span class="tipo">Fuente: ' + esc(x.f.titulo) + ' · ' + esc((lic[x.f.licencia] || {}).nombre || x.f.licencia) + '</span>' : '<br><span class="tipo">Sin fuente registrada</span>') + '</div>';
      }).join('') : '<span class="vacio">—</span>';
    });
  }

  function cerrarOrigen() {
    $('origen').hidden = true;
    document.querySelectorAll('.af.elegida').forEach(function (x) { x.classList.remove('elegida'); });
  }

  /* ───────────────────────── Apuntes ───────────────────────── */

  function apuntes(guardar) {
    var texto = $('txtApuntes').value, op = { proyecto: PROYECTO_APUNTES, titulo: $('txtTitulo').value.trim() || 'Apuntes', nivel: $('selNivelApuntes').value };
    var salida = $('resultadoApuntes');
    salida.innerHTML = '<p class="vacio">Analizando…</p>';
    var tarea = guardar ? I.importar(texto, op).then(function (inf) { return I.analizar(texto, op).then(function (an) { return { an: an, inf: inf }; }); })
      : I.analizar(texto, op).then(function (an) { return { an: an }; });
    tarea.then(function (r) {
      var an = r.an, tipos = E.catalogo('tiposUC'), porId = {};
      an.ucs.forEach(function (u) { porId[u.id] = u; });
      var html = '';
      if (r.inf) {
        st.ultimaImportacion = r.inf.fuente;
        $('btnDeshacer').hidden = false;
        html += '<p class="chip bien">✓ Guardado: ' + r.inf.cuenta.ucs + ' unidades y ' + r.inf.cuenta.relaciones + ' relaciones' + (r.inf.cuenta.enlaces ? ' · ' + r.inf.cuenta.enlaces + ' enlaces con la biblioteca' : '') + '</p>';
      } else if (!an.errores.length) {
        html += '<p class="chip bien">✓ Sin errores: se pueden guardar ' + an.ucs.length + ' unidades y ' + an.relaciones.length + ' relaciones</p>';
      }
      if (an.errores.length) html += '<ul class="errores">' + an.errores.map(function (e) { return '<li>Línea ' + e.linea + ': ' + esc(e.mensaje) + (e.texto ? ' — «' + esc(e.texto) + '»' : '') + '</li>'; }).join('') + '</ul><p class="ayuda">No se guarda nada hasta que no haya ningún error.</p>';
      var filas = an.lineas.map(function (l) {
        var u = l.id ? porId[l.id] : null, desc = l.clase === 'paso' ? 'Paso de «' + ((porId[l.de] || {}).titulo || '') + '»' : l.clase === 'relacion' ? 'Relación' : u ? u.titulo : '';
        var accion = u && r.inf ? '<button type="button" class="cerrar" data-generar="' + esc(u.id) + '" data-titulo="' + esc(u.titulo) + '">Generar material</button>' : '';
        return '<tr><td class="n">' + l.linea + '</td><td>' + esc(l.clase === 'uc' ? (tipos[l.tipo] || {}).nombre || l.tipo : l.clase === 'paso' ? 'Paso' : 'Relación') + '</td><td>' + esc(desc) + '</td><td>' + accion + '</td></tr>';
      }).join('');
      if (filas) html += '<div class="tabla"><table><thead><tr><th>Línea</th><th>Tipo</th><th>Contenido</th><th></th></tr></thead><tbody>' + filas + '</tbody></table></div>';
      salida.innerHTML = html;
      salida.querySelectorAll('button[data-generar]').forEach(function (b) {
        b.addEventListener('click', function () { seleccionar({ modo: 'uc', id: b.getAttribute('data-generar'), titulo: b.getAttribute('data-titulo') }); });
      });
      if (r.inf) pintarArbol();
    }).catch(function (e) {
      salida.innerHTML = '<ul class="errores">' + (e.errores || [{ linea: 0, mensaje: e.message }]).map(function (x) { return '<li>' + (x.linea ? 'Línea ' + x.linea + ': ' : '') + esc(x.mensaje) + '</li>'; }).join('') + '</ul><p class="ayuda">No se ha guardado nada.</p>';
    });
  }

  function deshacerImportacion() {
    if (!st.ultimaImportacion) return;
    I.quitarImportacion(st.ultimaImportacion).then(function (r) {
      st.ultimaImportacion = null;
      $('btnDeshacer').hidden = true;
      $('resultadoApuntes').innerHTML = '<p class="chip">Importación deshecha: ' + r.ucs + ' unidades retiradas.</p>';
      if (st.objetivo && !st.objetivo.rama && st.objetivo.modo === 'uc') st.objetivo = null;
      return pintarArbol();
    });
  }

  /* Restablecer: dos pasos en la propia página (la vista no admite confirm()). */
  var confirmando = false;
  function restablecer() {
    var b = $('btnRestablecer');
    if (!confirmando) { confirmando = true; b.textContent = 'Pulsa otra vez para borrar todo y recargar los paquetes'; setTimeout(function () { confirmando = false; b.textContent = 'Restablecer biblioteca de prueba'; }, 5000); return; }
    confirmando = false;
    b.textContent = 'Restableciendo…';
    A.vaciar({ confirmar: true }).then(function () { return B.cargarIndice(); }).then(function () {
      b.textContent = 'Restablecer biblioteca de prueba';
      pref('visor_objetivo', null);
      st.objetivo = null;
      return pintarArbol();
    }).then(function () {
      return B.buscar('Ciclo del agua').then(function (l) { var u = l[0]; if (u) return seleccionar({ modo: 'uc', id: u.id, titulo: u.titulo, rama: u.rama }); });
    }).catch(mostrarError);
  }

  arrancar();
})();
