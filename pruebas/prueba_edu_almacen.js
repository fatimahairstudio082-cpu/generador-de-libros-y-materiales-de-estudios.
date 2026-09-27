/* Pruebas de nucleo/edu_almacen.js en Node (motor en memoria).
   Se ejecutan con:  node pruebas/prueba_edu_almacen.js
   La misma batería con IndexedDB real: abrir pruebas/prueba_edu_almacen.html servido por HTTP. */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function leer(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }
var codigo = leer('nucleo/edu_almacen.js');

var ctx = {
  console: { info: function () { }, warn: function () { }, error: function () { } },
  crypto: require('crypto').webcrypto, structuredClone: structuredClone,
  Blob: Blob, btoa: btoa, atob: atob, Promise: Promise, Uint8Array: Uint8Array
};
ctx.globalThis = ctx;
vm.createContext(ctx);

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}

console.log('edu_almacen.js (Node · memoria)');
ok(codigo.split('\n').length <= 800, 'no supera 800 líneas (' + codigo.split('\n').length + ')');

var ctxSolo = { console: ctx.console }; ctxSolo.globalThis = ctxSolo; vm.createContext(ctxSolo);
vm.runInContext(leer('nucleo/edu_base.js'), ctxSolo);
vm.runInContext(codigo, ctxSolo);
ok(!ctxSolo.EDU.almacen, 'sin edu_esquemas.js no se carga y no lanza error');

vm.runInContext(leer('nucleo/edu_base.js'), ctx);
vm.runInContext(leer('nucleo/edu_esquemas.js'), ctx);
vm.runInContext(codigo, ctx);
vm.runInContext(codigo, ctx);
vm.runInContext(leer('pruebas/prueba_edu_almacen_comun.js'), ctx);
var EDU = ctx.EDU;
ok(EDU.modulos().filter(function (m) { return m.nombre === 'almacen'; }).length === 1, 'la doble carga no duplica el módulo');
ok(!/matem|fraccion|ciencias|historia/i.test(codigo), 'el almacén no menciona ninguna materia');

EDU.almacen.abrir().then(function (modo) {
  ok(modo === 'memoria', 'sin IndexedDB trabaja en memoria');
  ok(EDU.incidencias('aviso').some(function (n) { return /memoria/.test(n.mensaje); }), 'y lo avisa');
  return ctx.PRUEBA_ALMACEN(EDU, ok);
}).then(function () {
  console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
  process.exit(fallos ? 1 : 0);
}, function (e) {
  console.log('  ✗ excepción: ' + (e && e.message), e && e.errores);
  process.exit(1);
});
