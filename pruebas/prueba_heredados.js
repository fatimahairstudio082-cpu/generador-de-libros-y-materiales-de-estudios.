/* Comprueba que los motores heredados de FATIMA PRO siguen intactos.
   Compara la huella sha256 de cada archivo de heredados/ con la de ORIGEN.md.
   Se ejecuta con:  node pruebas/prueba_heredados.js */
'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var dir = path.join(__dirname, '..', 'heredados');
var origen = fs.readFileSync(path.join(dir, 'ORIGEN.md'), 'utf8');
var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}

console.log('Motores heredados de FATIMA PRO');
var filas = origen.split('\n').filter(function (l) { return /^\| `[^`]+\.js`/.test(l); });
ok(filas.length === 10, 'ORIGEN.md registra 10 motores');
var registrados = {};
filas.forEach(function (l) {
  var archivo = /^\| `([^`]+)`/.exec(l)[1];
  var huella = /`([0-9a-f]{64})`/.exec(l)[1];
  registrados[archivo] = true;
  var ruta = path.join(dir, archivo);
  if (!fs.existsSync(ruta)) { ok(false, archivo + ' existe'); return; }
  var real = crypto.createHash('sha256').update(fs.readFileSync(ruta)).digest('hex');
  ok(real === huella, archivo + ' intacto (sha256 coincide con ORIGEN.md)');
});
var sobrantes = fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f) && !registrados[f]; });
ok(sobrantes.length === 0, 'no hay motores sin registrar en ORIGEN.md' + (sobrantes.length ? ': ' + sobrantes.join(', ') : ''));

console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
process.exit(fallos ? 1 : 0);
