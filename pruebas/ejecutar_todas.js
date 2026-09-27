/* Ejecuta todas las pruebas del sistema y resume el resultado.
   Uso:  node pruebas/ejecutar_todas.js */
'use strict';
var fs = require('fs');
var path = require('path');
var hijo = require('child_process');

var dir = __dirname;
var orden = ['base', 'esquemas', 'almacen', 'biblioteca', 'importador', 'expansor', 'secuencia', 'lengua_es', 'redactor', 'variacion'];
var archivos = orden.map(function (n) { return 'prueba_edu_' + n + '.js'; }).filter(function (f) { return fs.existsSync(path.join(dir, f)); });
archivos.push('prueba_heredados.js');
if (fs.existsSync(path.join(dir, 'prueba_datos.js'))) archivos.push('prueba_datos.js');
if (fs.existsSync(path.join(dir, 'prueba_edu_visual.js'))) archivos.push('prueba_edu_visual.js');
if (fs.existsSync(path.join(dir, 'prueba_edu_asistente.js'))) archivos.push('prueba_edu_asistente.js');
if (fs.existsSync(path.join(dir, 'prueba_edu_salidas.js'))) archivos.push('prueba_edu_salidas.js');
archivos.push('prueba_integral.js');

var fallidas = 0, correctas = 0, conjuntos = 0;
archivos.forEach(function (f) {
  var r = hijo.spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8' });
  var linea = (r.stdout.match(/(\d+)\/(\d+) pruebas correctas/) || []);
  var bien = Number(linea[1] || 0), tot = Number(linea[2] || 0);
  correctas += bien; fallidas += tot - bien; conjuntos++;
  var ok = r.status === 0;
  console.log((ok ? '✓ ' : '✗ ') + f.replace(/\.js$/, '') + '  ' + (linea[0] || 'sin resultado'));
  if (!ok) {
    r.stdout.split('\n').filter(function (l) { return /✗/.test(l); }).forEach(function (l) { console.log('    ' + l.trim()); });
    if (r.stderr) console.log(r.stderr);
    if (!tot) fallidas++;
  }
});
console.log('\n' + conjuntos + ' conjuntos · ' + correctas + ' pruebas correctas · ' + fallidas + ' fallidas');
process.exit(fallidas ? 1 : 0);
