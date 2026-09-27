/* Pruebas de nucleo/edu_base.js. Se ejecutan con:  node pruebas/prueba_edu_base.js */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ruta = path.join(__dirname, '..', 'nucleo', 'edu_base.js');
var codigo = fs.readFileSync(ruta, 'utf8');

function cargar() {
  var ctx = { console: { info: function () { }, warn: function () { }, error: function () { } }, crypto: require('crypto').webcrypto, structuredClone: structuredClone };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  return ctx;
}

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}

var ctx = cargar();
var EDU = ctx.EDU;

console.log('edu_base.js');

// Tamaño
ok(codigo.split('\n').length <= 800, 'no supera 800 líneas (' + codigo.split('\n').length + ')');

// Doble carga
vm.runInContext(codigo, ctx);
ok(ctx.EDU === EDU && EDU.modulos().length === 1, 'la doble carga no duplica nada');

// Registro
ok(EDU.hay('base') && EDU.modulo('base') === EDU, 'se registra a sí mismo como «base»');
var api = { x: 1 };
EDU.registrar('prueba', api, { requiere: ['base'], version: '1.0.0' });
ok(EDU.modulo('prueba') === api, 'registrar y recuperar un módulo');
EDU.registrar('prueba', { x: 2 });
ok(EDU.modulo('prueba') === api, 'no sustituye un módulo ya registrado');
EDU.registrar('huerfano', {}, { requiere: ['inexistente'] });
var h = EDU.modulos().filter(function (m) { return m.nombre === 'huerfano'; })[0];
ok(h && h.completo === false, 'marca como incompleto un módulo con requisitos ausentes');
ok(EDU.incidencias('aviso').length >= 2, 'deja constancia en incidencias');

// Avisos
var recibido = [];
var baja = EDU.on('x', function (d) { recibido.push(d); });
EDU.on('x', function () { throw new Error('roto'); });
EDU.emitir('x', 1);
baja();
EDU.emitir('x', 2);
ok(recibido.join() === '1', 'on/emitir/baja; un oyente roto no bloquea a los demás');
var veces = 0;
EDU.una('y', function () { veces++; });
EDU.emitir('y'); EDU.emitir('y');
ok(veces === 1, 'una() escucha una sola vez');

// Azar determinista
function serie(s) { var a = EDU.azar(s); return [a.siguiente(), a.siguiente(), a.entero(1, 6), a.uno(['a', 'b', 'c'])].join(); }
ok(serie(42) === serie(42), 'misma semilla numérica → misma serie');
ok(serie('fracciones') === serie('fracciones'), 'misma semilla de texto → misma serie');
ok(serie(42) !== serie(43), 'semillas distintas → series distintas');
var a1 = EDU.azar(7), a2 = EDU.azar(7);
var h1 = a1.derivar('redactor'); a2.siguiente(); a2.siguiente();
var h2 = a2.derivar('redactor');
ok(h1.siguiente() === h2.siguiente(), 'derivar() no depende de las tiradas del padre');
var lista = [1, 2, 3, 4, 5];
var b = EDU.azar(3).barajar(lista);
ok(lista.join() === '1,2,3,4,5' && b.slice().sort().join() === '1,2,3,4,5', 'barajar no altera el original y conserva los elementos');
var bol = EDU.azar(9).bolsa(['a', 'b', 'c']);
ok([bol.coger(), bol.coger(), bol.coger()].sort().join() === 'a,b,c', 'la bolsa no repite hasta vaciarse');
var enRango = true, az = EDU.azar(1);
for (var i = 0; i < 500; i++) { var n = az.entero(3, 5); if (n < 3 || n > 5) enRango = false; }
ok(enRango, 'entero(min,max) queda dentro del rango');

// Identificadores
ok(EDU.id('uc') !== EDU.id('uc'), 'id() no se repite');
ok(EDU.idEstable('uc', 'El Ciclo del agua') === EDU.idEstable('uc', 'el ciclo  del  agua'), 'idEstable ignora mayúsculas, tildes y espacios');

// Utilidades
ok(EDU.esc('<a href="x">&</a>') === '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;', 'esc() escapa HTML');
ok(EDU.normalizar('  Canción  Ñandú ') === 'cancion ñandu', 'normalizar() quita tildes y conserva la ñ');
ok(EDU.slug('Ciencias Naturales · 5º') === 'ciencias-naturales-5', 'slug()');
var o = { a: [1, { b: 2 }] }, c = EDU.clonar(o); c.a[1].b = 3;
ok(o.a[1].b === 2, 'clonar() hace copia profunda');
ok(EDU.hash('abc') === EDU.hash('abc') && EDU.hash('abc').length === 8, 'hash() estable de 8 cifras hex');

// Puentes a heredados
ok(EDU.puente.estado().length === 8, 'catálogo de 8 motores heredados declarado');
ok(EDU.puente.obtener('laminas') === null && !EDU.puente.hay('laminas'), 'sin cargar el heredado, el puente devuelve null');
ctx.LAMINAS_MOTOR = { pintar: function () { } };
ok(EDU.puente.obtener('laminas') === ctx.LAMINAS_MOTOR, 'al cargarse el heredado, el puente lo encuentra');

console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
process.exit(fallos ? 1 : 0);
