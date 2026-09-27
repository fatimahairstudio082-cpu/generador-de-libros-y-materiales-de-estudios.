/* Pruebas de los datos: índice de la biblioteca, catálogo de materias, paquetes de contenido y perfiles de país.
   Se ejecutan con:  node pruebas/prueba_datos.js   (almacén en memoria) */
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
['nucleo/edu_base.js', 'nucleo/edu_esquemas.js', 'nucleo/edu_almacen.js', 'conocimiento/edu_biblioteca.js'].forEach(function (f) { vm.runInContext(leer(f), ctx); });
var EDU = ctx.EDU, A = EDU.almacen, B = EDU.biblioteca;

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}

console.log('Datos: biblioteca, catálogo y países');
var ind = JSON.parse(leer('datos/biblioteca/indice.json'));
ok(ind.paquetes.every(function (f) { return fs.existsSync(path.join(__dirname, '..', 'datos/biblioteca', f)); }), 'los ' + ind.paquetes.length + ' paquetes del índice existen');
var enDisco = fs.readdirSync(path.join(__dirname, '..', 'datos/biblioteca')).filter(function (f) { return /\.json$/.test(f) && f !== 'indice.json'; });
ok(enDisco.every(function (f) { return ind.paquetes.indexOf(f) >= 0; }), 'ningún paquete en disco se ha quedado fuera del índice');
ok(ind.paquetes[0] === 'catalogo_materias.json', 'el catálogo de materias se carga el primero');

var paquetes = ind.paquetes.map(function (f) { return JSON.parse(leer('datos/biblioteca/' + f)); });
ok(paquetes.every(function (p) { return p.fuentes.every(function (f) { return /Pendiente de revisión/.test(f.nota || ''); }); }), 'todo paquete declara que está pendiente de revisión por Fátima');
var cat = paquetes[0], materias = cat.ramas.filter(function (r) { return r.clase === 'materia'; });
ok(materias.length >= 40 && cat.ucs.length === 0, 'catálogo: ' + materias.length + ' materias, solo estructura (sin contenido inventado)');
ok(new Set(materias.map(function (m) { return m.nombre; })).size === materias.length, 'catálogo: sin materias repetidas');
var niveles = EDU.esquemas.catalogo('niveles');
ok(cat.ramas.filter(function (r) { return r.clase === 'nivel'; }).every(function (r) { return niveles[r.nivel]; }), 'catálogo: todos los niveles son del sistema');
var nombresCat = {}; materias.forEach(function (m) { nombresCat[m.nombre] = true; });
ok(paquetes.slice(1).every(function (p) { return p.ramas.filter(function (r) { return r.clase === 'materia'; }).every(function (r) { return nombresCat[r.nombre]; }); }), 'cada paquete de contenido cuelga de una materia del catálogo');
['Biología', 'Anatomía y fisiología', 'Contabilidad', 'Química', 'Física', 'Inglés', 'Enfermería', 'Peluquería'].forEach(function (m) { if (!nombresCat[m]) ok(false, 'falta la materia ' + m); });
ok(['Biología', 'Anatomía y fisiología', 'Contabilidad', 'Química', 'Física'].every(function (m) { return paquetes.some(function (p) { return p.ramas.some(function (r) { return r.clase === 'materia' && r.nombre === m; }) && p.ucs.length >= 20; }); }), 'tanda 1 con contenido: biología, anatomía, contabilidad, química y física (≥20 unidades cada una)');

// Países
var P = JSON.parse(leer('datos/paises/paises.json')).paises;
var codigos = Object.keys(P);
ok(['es', 've', 'us', 'ec', 'pe', 'co', 'mx'].every(function (c) { return P[c]; }), 'perfiles de España, Venezuela, Estados Unidos, Ecuador, Perú, Colombia y México');
ok(codigos.every(function (c) { var p = P[c]; return /^(a4|carta)$/.test(p.papel) && p.decimal !== p.miles && p.moneda && p.moneda.codigo && p.contabilidad && p.contabilidad.norma; }), 'cada país: papel, números, moneda y norma contable');
ok(codigos.every(function (c) { return P[c].etapas.every(function (e) { return niveles[e.nivel] && e.cursos.length; }); }), 'cada etapa de cada país corresponde a un nivel del sistema y nombra sus cursos');
ok(codigos.every(function (c) { return ['infantil', 'primaria', 'secundaria', 'bachillerato', 'fp', 'universidad'].every(function (n) { return P[c].etapas.some(function (e) { return e.nivel === n; }); }); }), 'todos los países cubren de infantil a universidad');

A.abrir({ memoria: true }).then(function () {
  return paquetes.reduce(function (p, paq) { return p.then(function () { return B.cargarPaquete(paq); }); }, Promise.resolve());
}).then(function () {
  return Promise.all([B.estadisticas(), A.listar('rama')]);
}).then(function (r) {
  var est = r[0], ramas = r[1];
  ok(est.ucs >= 200, 'todo el índice carga: ' + est.ucs + ' unidades y ' + est.relaciones + ' relaciones');
  var mat = ramas.filter(function (x) { return x.clase === 'materia'; });
  ok(mat.length === materias.length, 'las materias de los paquetes se unen a las del catálogo (' + mat.length + ' en el árbol, sin duplicados)');
  return paquetes.reduce(function (p, paq) { return p.then(function () { return B.cargarPaquete(paq); }); }, Promise.resolve()).then(function () { return B.estadisticas(); }).then(function (e2) {
    ok(JSON.stringify(e2) === JSON.stringify(est), 'recargar todo el índice no duplica nada');
  });
}).then(function () {
  ok(EDU.incidencias('error').length === 0, 'sin errores internos');
  console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) { console.log('  ✗ excepción: ' + (e && e.stack || JSON.stringify(e))); console.log('\n' + (total - fallos) + '/' + (total + 1) + ' pruebas correctas'); process.exit(1); });
