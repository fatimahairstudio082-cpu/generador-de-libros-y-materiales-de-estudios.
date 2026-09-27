/* Pruebas de compat/edu_visual.js con los motores heredados reales (sin dibujar:
   el dibujo se comprueba en el navegador).  node pruebas/prueba_edu_visual.js */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function leer(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }
var codigo = leer('compat/edu_visual.js');
var ctx = {
  console: { info: function () { }, warn: function () { }, error: function () { } },
  crypto: require('crypto').webcrypto, structuredClone: structuredClone,
  Blob: Blob, btoa: btoa, atob: atob, Promise: Promise, Uint8Array: Uint8Array
};
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
['heredados/b6_folleto_motor.js', 'heredados/b6_laminas_motor.js', 'heredados/b6_laminas_disenos.js',
 'nucleo/edu_base.js', 'nucleo/edu_esquemas.js', 'nucleo/edu_almacen.js', 'conocimiento/edu_biblioteca.js', 'expansion/edu_expansor.js'].forEach(function (f) { vm.runInContext(leer(f), ctx); });
vm.runInContext(codigo, ctx);
vm.runInContext(codigo, ctx);
var EDU = ctx.EDU, VI = EDU.visual, A = EDU.almacen, B = EDU.biblioteca;

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}

console.log('edu_visual.js (Motor Visual)');
ok(codigo.split('\n').length <= 800, 'no supera 800 líneas (' + codigo.split('\n').length + ')');
ok(!/matem|fraccion|ciencias|historia|agua|revoluc|infantil|primaria/i.test(codigo.replace(/\/\*[\s\S]*?\*\//g, '')), 'el código no escribe ninguna materia ni nivel');
ok(VI.disponible(), 'encuentra los motores de FATIMA PRO a través de EDU.puente');
ok(VI.familias('jerarquia').join() === 'mapa,piramide,mandala,poster', 'familias de jerarquía: mapa, pirámide, mandala y póster');
var d1 = VI.disenos('jerarquia', { materia: 'Ciencias naturales', nivel: 'primaria' });
ok(d1.length > 40 && d1[0].categoria === 'Ciencias', 'CIENCIAS · los primeros diseños son de la categoría Ciencias (' + d1.length + ' compatibles)');
var d2 = VI.disenos('jerarquia', { materia: 'Matemáticas', nivel: 'primaria' });
ok(/Matem/.test(d2[0].categoria), 'MATEMÁTICAS · diseños de Matemáticas primero');
var d3 = VI.disenos('secuencia', { materia: 'Historia', nivel: 'secundaria' });
ok(/Historia/.test(d3[0].categoria), 'HISTORIA · líneas de tiempo de Historia primero');
var d4 = VI.disenos('lista', { materia: 'Los animales', nivel: 'infantil' });
ok(d4[0].categoria === 'Infantil y primaria', 'INFANTIL · diseños de Infantil y primaria primero');

var piezas = [];
A.abrir({ memoria: true }).then(function () {
  return ['ciencias_primaria_agua.json', 'historia_secundaria_revolucion_francesa.json', 'matematicas_primaria_fracciones.json']
    .reduce(function (p, f) { return p.then(function () { return B.cargarPaquete(JSON.parse(leer('datos/biblioteca/' + f))); }); }, Promise.resolve());
}).then(function () {
  return Promise.all(['Ciclo del agua', 'Revolución francesa', 'Sumar fracciones con igual denominador'].map(function (t) {
    return B.buscar(t).then(function (l) { return EDU.expansor.expandir(l.filter(function (u) { return u.titulo === t; })[0].id); });
  }));
}).then(function (ests) {
  ests.forEach(function (e) { e.piezas.forEach(function (p) { if (p.clase === 'visualizacion') piezas.push({ p: p, est: e }); }); });
  var formas = {};
  piezas.forEach(function (x) { formas[x.p.datos.forma] = (formas[x.p.datos.forma] || 0) + 1; });
  ok(Object.keys(formas).sort().join() === 'comparacion,jerarquia,lista,secuencia', 'hay piezas de las 4 formas: ' + JSON.stringify(formas));
  var todasOk = true, detalles = [];
  piezas.forEach(function (x) {
    var lam = VI.lamina(x.p, { titulo: 'Contexto de prueba', materia: 'Ciencias naturales', nivel: x.est.nivel });
    var v = VI.verificar(lam, x.p);
    if (!v.ok) { todasOk = false; detalles.push(JSON.stringify(v.problemas[0])); }
  });
  ok(todasOk, 'NO INVENCIÓN · las ' + piezas.length + ' láminas solo contienen textos de sus datos' + (detalles.length ? ' → ' + detalles[0] : ''));
  var jer = piezas.filter(function (x) { return x.p.datos.forma === 'jerarquia'; })[0].p;
  var lam = VI.lamina(jer, { materia: 'Ciencias naturales', nivel: 'primaria' });
  var muestra = EDU.puente.obtener('laminas_disenos').lamina(lam.diseno).nodos.map(function (n) { return n.t; });
  ok(lam.nodos[0].t === 'Ciclo del agua' && lam.nodos.filter(function (n) { return n.nivel === 1; }).length === 6, 'jerarquía: centro «Ciclo del agua» y sus 6 partes como ramas');
  var propios = jer.datos.nodos.map(function (n) { return n.titulo; }).sort().join('|');
  ok(lam.nodos.map(function (n) { return n.t; }).sort().join('|') === propios && muestra.join('|') !== propios, 'los nodos son exactamente los de los datos; el contenido de muestra del diseño no se usa');
  ok(lam.nodos.every(function (n) { return n.uc; }), 'cada nodo guarda la UC de la que sale (trazabilidad)');
  ok(typeof lam.estructura === 'string' && typeof lam.paleta === 'string' && lam.formato && lam.animacion, 'el estilo sale del diseño: estructura «' + lam.estructura + '», paleta «' + lam.paleta + '», animación «' + lam.animacion + '»');
  var lam2 = VI.lamina(jer, { materia: 'Ciencias naturales', nivel: 'primaria' });
  ok(lam2.diseno === lam.diseno, 'determinista: la misma semilla elige el mismo diseño');
  var otros = {};
  for (var s = 1; s <= 12; s++) otros[VI.lamina(jer, { materia: 'Ciencias naturales', nivel: 'primaria', semilla: s }).diseno] = true;
  ok(Object.keys(otros).length > 1, 'otra semilla puede elegir otro diseño afín (' + Object.keys(otros).length + ' distintos en 12 semillas)');
  var elegido = VI.disenos('jerarquia', {})[5].id;
  ok(VI.lamina(jer, { diseno: elegido }).diseno === elegido, 'se puede elegir un diseño concreto a mano');
  var mand = VI.lamina(jer, { familia: 'mandala' });
  ok(mand.familia === 'mandala' && mand.animacion === 'rotar', 'la misma jerarquía como mandala (animación «rotar»)');
  var tiempo = piezas.filter(function (x) { return x.p.datos.forma === 'secuencia' && x.est.nivel === 'secundaria'; })[0].p;
  var lt = VI.lamina(tiempo, { titulo: 'Revolución francesa', materia: 'Historia', nivel: 'secundaria' });
  ok(lt.nodos.length === 10 && lt.nodos[1].d === 'mayo de 1789' && /tiempo|flujo|carrusel/.test(lt.familia), 'línea de tiempo con las 9 etapas y sus fechas (' + lt.familia + ')');
  var trucada = JSON.parse(JSON.stringify(lt));
  trucada.nodos[3].t = 'Suceso inventado';
  ok(!VI.verificar(trucada, tiempo).ok, 'verificar() detecta un nodo inventado');
  var larga = piezas.filter(function (x) { return x.p.datos.forma === 'comparacion'; })[0].p;
  var lc = VI.lamina(larga, {});
  ok(lc.nodos.every(function (n) { return !n.d || n.d.length <= 90; }) && VI.verificar(lc, larga).ok, 'los textos largos se omiten en el nodo, nunca se recortan');
  ok((function () { try { VI.lamina({ clase: 'definicion', datos: {} }); return false; } catch (e) { return true; } })(), 'rechaza piezas que no son visualizaciones');
  ok(VI.duracion(lam) >= 4, 'duración de animación calculada (' + VI.duracion(lam) + ' s)');
  ok(EDU.incidencias('error').length === 0, 'sin errores internos');
  console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) { console.log('  ✗ excepción: ' + (e && e.stack)); process.exit(1); });
