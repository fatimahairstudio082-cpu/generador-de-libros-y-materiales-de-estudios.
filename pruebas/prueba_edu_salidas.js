/* Pruebas de las salidas: compat/edu_examen.js y salidas/edu_libro.js (partes sin navegador).
   Se ejecutan con:  node pruebas/prueba_edu_salidas.js   (almacén en memoria)
   El PDF y el dibujo de las hojas se comprueban en el navegador. */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function leer(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }
var ctx = {
  console: { info: function () { }, warn: function () { }, error: function () { } },
  crypto: require('crypto').webcrypto, structuredClone: structuredClone,
  Blob: Blob, btoa: btoa, atob: atob, Promise: Promise, Uint8Array: Uint8Array
};
ctx.globalThis = ctx;
vm.createContext(ctx);
['nucleo/edu_base.js', 'nucleo/edu_esquemas.js', 'nucleo/edu_almacen.js', 'conocimiento/edu_biblioteca.js',
 'expansion/edu_expansor.js', 'expansion/edu_secuencia.js', 'redaccion/edu_lengua_es.js', 'redaccion/edu_redactor.js',
 'compat/edu_examen.js', 'salidas/edu_exportar.js', 'salidas/edu_libro.js'].forEach(function (f) { vm.runInContext(leer(f), ctx); });
var EDU = ctx.EDU, A = EDU.almacen, B = EDU.biblioteca, X = EDU.expansor, S = EDU.secuencia, R = EDU.redactor, EX = EDU.examen, L = EDU.libro;

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}

console.log('Salidas: examen y libro');
['compat/edu_examen.js', 'salidas/edu_exportar.js', 'salidas/edu_libro.js'].forEach(function (f) {
  var c = leer(f);
  ok(c.split('\n').length <= 800 && !/matem|fraccion|ciencias|historia|revoluc/i.test(c), f + ': ≤800 líneas y sin materias');
});
ok(['examen', 'exportar', 'libro'].every(function (n) { return EDU.modulos().some(function (m) { return m.nombre === n && m.completo; }); }), 'los tres módulos se registran');

// ¿Se puede formar el texto t uniendo con espacios afirmaciones de la redacción?
function formable(t, conjunto) {
  if (conjunto[t] || conjunto[t + ':']) return true;
  var memo = {};
  function desde(i) {
    if (i === t.length) return true;
    if (memo[i] !== undefined) return memo[i];
    memo[i] = false;
    for (var j = t.length; j > i; j--) {
      if (conjunto[t.slice(i, j)] && (j === t.length || t[j] === ' ') && desde(j === t.length ? j : j + 1)) { memo[i] = true; break; }
    }
    return memo[i];
  }
  return desde(0);
}

var redes = [];
A.abrir({ memoria: true }).then(function () {
  var ind = JSON.parse(leer('datos/biblioteca/indice.json'));
  return ind.paquetes.reduce(function (p, f) { return p.then(function () { return B.cargarPaquete(JSON.parse(leer('datos/biblioteca/' + f))); }); }, Promise.resolve());
}).then(function () {
  return A.listar('rama');
}).then(function (ramas) {
  return ramas.filter(function (r) { return r.clase === 'tema'; }).reduce(function (p, r) {
    return p.then(function () {
      return X.expandirRama(r.id).then(function (ests) {
        var sec = S.secuenciar(ests);
        redes.push({ nombre: r.nombre, red: R.redactar(sec, ests, { semilla: 3 }) });
      });
    });
  }, Promise.resolve());
}).then(function () {
  ok(redes.length >= 3, 'hay ' + redes.length + ' temas redactados para probar');

  // ── Examen ──
  var problemasEx = [], nPreg = 0, nOmit = 0, conAbierta = 0;
  redes.forEach(function (x) {
    var r = EX.construir(x.red, { semilla: 7 });
    nPreg += r.datos.preguntas.length; nOmit += r.omitidas.length;
    if (r.datos.abierta) conAbierta++;
    var v = EX.verificar(r.datos, x.red);
    if (!v.ok) problemasEx.push(x.nombre + ': ' + v.problemas[0].problema);
    r.datos.preguntas.forEach(function (q) {
      if (q.o.length < 2 || q.c < 0 || q.c >= q.o.length) problemasEx.push(x.nombre + ': opciones mal formadas');
      if (q.modo !== 'verdadero' && q.o.length < 3) problemasEx.push(x.nombre + ': menos de 2 incorrectas');
      if (new Set(q.o).size !== q.o.length) problemasEx.push(x.nombre + ': opción repetida');
    });
    r.omitidas.forEach(function (o) { if (!o.motivo) problemasEx.push(x.nombre + ': omitida sin motivo'); });
  });
  ok(problemasEx.length === 0, 'EXAMEN · ' + nPreg + ' preguntas verificadas: enunciado literal, opciones de los datos, correcta bien marcada' + (problemasEx.length ? ' → ' + problemasEx.slice(0, 3).join(' | ') : ''));
  ok(nPreg > 0, 'se generan preguntas de tipo test');
  ok(conAbierta > 0, 'hay pregunta abierta (ordenar o clasificar) con su clave');
  console.log('    (' + nOmit + ' preguntas omitidas por falta de opciones en los datos o por límite; se informan, no se rellenan)');

  var red0 = redes[0].red, e1 = EX.construir(red0, { semilla: 7 }), e2 = EX.construir(red0, { semilla: 7 }), e3 = EX.construir(red0, { semilla: 99 });
  ok(JSON.stringify(e1) === JSON.stringify(e2), 'misma semilla → mismo examen');
  ok(e3.datos.preguntas.map(function (q) { return q.p; }).join('|') === e1.datos.preguntas.map(function (q) { return q.p; }).join('|'), 'otra semilla → mismas preguntas (solo cambia el orden de las opciones)');
  ok(EX.construir(red0, { maximo: 2 }).datos.preguntas.length <= 2, 'respeta el máximo de preguntas');
  ok(e1.datos.centro === ' ' && e1.datos.modulo === ' ', 'centro y módulo vacíos: el motor no escribe textos que no son de la usuaria');

  // Trampas: el verificador detecta cambios
  var t = JSON.parse(JSON.stringify(e1.datos)), q = t.preguntas.filter(function (x) { return x.modo !== 'verdadero'; })[0];
  if (q) {
    var t1 = JSON.parse(JSON.stringify(t)); t1.preguntas[t.preguntas.indexOf(q)].o[0] = 'Una opción inventada';
    ok(!EX.verificar(t1, red0).ok, 'verificar() detecta una opción inventada');
    var t2 = JSON.parse(JSON.stringify(t)), q2 = t2.preguntas[t.preguntas.indexOf(q)]; q2.c = (q2.c + 1) % q2.o.length;
    ok(!EX.verificar(t2, red0).ok, 'verificar() detecta la correcta mal marcada');
    var t3 = JSON.parse(JSON.stringify(t)); t3.preguntas[0].p += ' ¿seguro?';
    ok(!EX.verificar(t3, red0).ok, 'verificar() detecta un enunciado cambiado');
  }

  // ── Libro ──
  var problemasLib = [];
  redes.forEach(function (x) {
    var conj = {};
    R.afirmaciones(x.red).forEach(function (a) { conj[a.texto] = true; });
    var m = L.modelo(x.red, { titulo: x.nombre });
    L.textos(m).forEach(function (tx) { if (!formable(tx, conj)) problemasLib.push(x.nombre + ': «' + tx.slice(0, 60) + '»'); });
    if (!m.capitulos.length) problemasLib.push(x.nombre + ': sin capítulos');
    var nPregLibro = m.capitulos.reduce(function (s, c) { return s + c.preguntas.length; }, 0);
    if (nPregLibro !== m.soluciones.length) problemasLib.push(x.nombre + ': preguntas y soluciones no cuadran');
  });
  ok(problemasLib.length === 0, 'LIBRO · todos los textos del libro son afirmaciones auditadas de la redacción (nada añadido)' + (problemasLib.length ? ' → ' + problemasLib.slice(0, 3).join(' | ') : ''));

  var m0 = L.modelo(red0, {});
  var sinPend = L.modelo(red0, { pendientes: false, preguntas: false });
  ok(sinPend.soluciones.length === 0 && sinPend.capitulos.every(function (c) { return !c.preguntas.length && c.elementos.every(function (e) { return e.tipo !== 'pendiente'; }); }), 'opciones: sin pendientes y sin preguntas');
  var h = L.html(red0, { titulo: 'Prueba <b>', papel: 'carta' });
  ok(/^<!doctype html>/.test(h) && /<title>Prueba &lt;b&gt;<\/title>/.test(h) && /size: letter/.test(h), 'HTML completo, con el título escapado y el papel elegido');
  ok((h.match(/<section class="capitulo/g) || []).length === m0.capitulos.length + (m0.soluciones.length ? 1 : 0), 'HTML: una sección por capítulo (y soluciones)');
  ok(m0.capitulos.filter(function (c) { return !c.nivel; }).every(function (c, i) { return h.indexOf('>' + EDU.esc(c.titulo) + '</a>') > 0; }), 'HTML: índice con enlace a cada capítulo');

  var dataPNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  var lam = {};
  m0.capitulos.forEach(function (c) { c.elementos.forEach(function (e) { if (e.tipo === 'lamina') lam[e.pieza] = dataPNG; }); });
  var nLam = Object.keys(lam).length;
  var ep = L.epub(red0, { titulo: 'Prueba', autoria: 'Fátima', laminas: lam });
  var rutas = ep.map(function (a) { return a.ruta; });
  ok(rutas[0] === 'mimetype' && ep[0].texto === 'application/epub+zip', 'EPUB: «mimetype» va primero');
  ok(['META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/portada.xhtml', 'OEBPS/estilo.css'].every(function (r) { return rutas.indexOf(r) >= 0; }), 'EPUB: contenedor, paquete, índice, portada y estilo');
  var opf = ep.filter(function (a) { return a.ruta === 'OEBPS/content.opf'; })[0].texto;
  var enManifiesto = (opf.match(/href="([^"]+)"/g) || []).map(function (s) { return 'OEBPS/' + s.slice(6, -1); });
  ok(enManifiesto.every(function (r) { return rutas.indexOf(r) >= 0; }) && rutas.filter(function (r) { return /^OEBPS\/(cap|img)/.test(r); }).every(function (r) { return enManifiesto.indexOf(r) >= 0; }), 'EPUB: todo lo del manifiesto existe y todo capítulo o imagen está en el manifiesto');
  ok(rutas.filter(function (r) { return /^OEBPS\/img\//.test(r); }).length === nLam, 'EPUB: ' + nLam + ' láminas incluidas como imagen');
  ok(/<dc:creator>Fátima<\/dc:creator>/.test(opf) && /dcterms:modified/.test(opf), 'EPUB: autoría y fecha en los metadatos');
  var malFormados = ep.filter(function (a) { return /\.xhtml$/.test(a.ruta) && (/<br>|<img [^>]*[^/]>/.test(a.texto) || (a.texto.match(/<section/g) || []).length !== (a.texto.match(/<\/section>/g) || []).length); });
  ok(malFormados.length === 0, 'EPUB: XHTML con etiquetas cerradas');
  var ep2 = L.epub(red0, { titulo: 'Prueba', autoria: 'Fátima', laminas: lam });
  ok(JSON.stringify(ep) === JSON.stringify(ep2), 'EPUB: mismo trabajo → mismo archivo (identificador estable)');

  ok(EDU.incidencias('error').length === 0, 'sin errores internos');
  console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) { console.log('  ✗ excepción: ' + (e && e.stack || JSON.stringify(e))); console.log('\n' + (total - fallos) + '/' + (total + 1) + ' pruebas correctas'); process.exit(1); });
