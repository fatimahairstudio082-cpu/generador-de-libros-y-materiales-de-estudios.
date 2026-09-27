/* Pruebas de variacion/edu_variacion.js.
   Se ejecutan con:  node pruebas/prueba_edu_variacion.js   (almacén en memoria) */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function leer(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }
var codigo = leer('variacion/edu_variacion.js');
var ctx = {
  console: { info: function () { }, warn: function () { }, error: function () { } },
  crypto: require('crypto').webcrypto, structuredClone: structuredClone,
  Blob: Blob, btoa: btoa, atob: atob, Promise: Promise, Uint8Array: Uint8Array
};
ctx.globalThis = ctx;
vm.createContext(ctx);
['nucleo/edu_base.js', 'nucleo/edu_esquemas.js', 'nucleo/edu_almacen.js', 'conocimiento/edu_biblioteca.js',
 'expansion/edu_expansor.js', 'expansion/edu_secuencia.js', 'redaccion/edu_lengua_es.js', 'redaccion/edu_redactor.js'].forEach(function (f) { vm.runInContext(leer(f), ctx); });
vm.runInContext(codigo, ctx);
vm.runInContext(codigo, ctx);
var EDU = ctx.EDU, V = EDU.variacion, R = EDU.redactor, A = EDU.almacen, B = EDU.biblioteca;

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}

console.log('edu_variacion.js');
ok(codigo.split('\n').length <= 800, 'no supera 800 líneas (' + codigo.split('\n').length + ')');
ok(EDU.modulos().filter(function (m) { return m.nombre === 'variacion'; }).length === 1, 'la doble carga no duplica el módulo');
ok(!/matem|fraccion|ciencias|historia|agua|revoluc/i.test(codigo), 'el código no menciona ninguna materia');

var est, sec;
A.abrir({ memoria: true }).then(function () {
  return B.cargarPaquete(JSON.parse(leer('datos/biblioteca/historia_secundaria_revolucion_francesa.json')));
}).then(function () {
  return B.buscar('Revolución francesa');
}).then(function (l) {
  return EDU.expansor.expandir(l.filter(function (u) { return u.titulo === 'Revolución francesa'; })[0].id);
}).then(function (e) {
  est = e; sec = EDU.secuencia.secuenciar(est);
  var r = V.versiones(sec, est, { n: 4, desde: 1 });
  ok(r.versiones.length === 4, 'versiones(): 4 versiones distintas');
  ok(r.versiones.every(function (v) { return v.huella === r.huella && v.auditoria.ok; }), 'todas auditadas y con la misma huella de hechos');
  var textos = r.versiones.map(function (v) { return R.aTexto(v.redaccion); });
  ok(textos.every(function (t, i) { return textos.indexOf(t) === i; }), 'ninguna versión repite el texto de otra');
  var c = V.comparar(r.versiones[0].redaccion, r.versiones[1].redaccion);
  ok(c.mismosHechos && c.mismaEstructura && c.cambiadas > 0 && c.cambiadas < c.total, 'comparar(): mismos hechos, misma estructura, ' + c.cambiadas + ' de ' + c.total + ' frases cambian (' + c.porcentaje + '%)');
  ok(c.diferencias[0].antes !== c.diferencias[0].despues, 'cada diferencia muestra el antes y el después');
  var o = V.otraVersion(sec, est, 1);
  ok(o.semilla > 1 && o.comparacion.mismosHechos && o.comparacion.cambiadas > 0, 'otraVersion(): semilla ' + o.semilla + ', texto distinto, mismos hechos');
  ok(V.comparar(r.versiones[0].redaccion, r.versiones[0].redaccion).cambiadas === 0, 'una versión comparada consigo misma no cambia nada');
  // Una versión que alterase hechos se detecta por su huella
  var trucada = JSON.parse(JSON.stringify(r.versiones[1].redaccion));
  trucada.secciones[0].bloques.filter(function (b) { return b.tipo === 'definicion'; })[0].frases[0].hechos[0].valor = 'Otro hecho';
  ok(!V.comparar(r.versiones[0].redaccion, trucada).mismosHechos, 'una versión con un hecho cambiado tiene otra huella');
  var pro = EDU.esquemas.crear('proyecto', { titulo: 'Proyecto de prueba', nivel: 'secundaria' });
  return A.guardar('proyecto', pro).then(function () { return V.guardarVersion(pro.id, r.versiones[2].redaccion); })
    .then(function (der) { return Promise.all([A.obtener('derivado', der.id), A.obtener('proyecto', pro.id), der]); });
}).then(function (x) {
  var der = x[0], pro = x[1];
  ok(der && der.perfil === 'texto' && der.huella && EDU.esquemas.validar('derivado', der).ok, 'guardarVersion(): derivado válido con semilla y huella');
  ok(pro.derivados.indexOf(der.id) >= 0, 'el derivado queda enlazado al Proyecto Maestro');
  var cv = V.comprobarVersion(der, sec, est);
  ok(cv.ok, 'comprobarVersion(): la versión guardada se regenera idéntica');
  var der2 = JSON.parse(JSON.stringify(der));
  der2.huella = 'otra';
  ok(!V.comprobarVersion(der2, sec, est).ok, 'si los datos cambian, la versión guardada se marca como desactualizada');
  ok(EDU.incidencias('error').length === 0, 'sin errores internos');
  console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) {
  console.log('  ✗ excepción: ' + (e && e.stack));
  process.exit(1);
});
