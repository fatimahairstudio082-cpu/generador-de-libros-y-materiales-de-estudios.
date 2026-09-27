/* Pruebas de redaccion/edu_redactor.js con los tres paquetes reales.
   Se ejecutan con:  node pruebas/prueba_edu_redactor.js   (almacén en memoria) */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function leer(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }
function paquete(f) { return JSON.parse(leer('datos/biblioteca/' + f)); }
var codigo = leer('redaccion/edu_redactor.js');

var ctx = {
  console: { info: function () { }, warn: function () { }, error: function () { } },
  crypto: require('crypto').webcrypto, structuredClone: structuredClone,
  Blob: Blob, btoa: btoa, atob: atob, Promise: Promise, Uint8Array: Uint8Array
};
ctx.globalThis = ctx;
vm.createContext(ctx);
['nucleo/edu_base.js', 'nucleo/edu_esquemas.js', 'nucleo/edu_almacen.js', 'conocimiento/edu_biblioteca.js',
 'expansion/edu_expansor.js', 'expansion/edu_secuencia.js', 'redaccion/edu_lengua_es.js'].forEach(function (f) { vm.runInContext(leer(f), ctx); });
vm.runInContext(codigo, ctx);
vm.runInContext(codigo, ctx);
var EDU = ctx.EDU, R = EDU.redactor, X = EDU.expansor, S = EDU.secuencia, A = EDU.almacen, B = EDU.biblioteca;

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}
function clonar(o) { return JSON.parse(JSON.stringify(o)); }
function preparar(titulo) {
  return B.buscar(titulo).then(function (l) { return X.expandir(l.filter(function (u) { return u.titulo === titulo; })[0].id); })
    .then(function (est) { return { est: est, sec: S.secuenciar(est) }; });
}
function primerBloque(red, tipo) {
  for (var i = 0; i < red.secciones.length; i++) for (var j = 0; j < red.secciones[i].bloques.length; j++) if (red.secciones[i].bloques[j].tipo === tipo) return red.secciones[i].bloques[j];
  return null;
}

console.log('edu_redactor.js');
ok(codigo.split('\n').length <= 800, 'no supera 800 líneas (' + codigo.split('\n').length + ')');
ok(EDU.modulos().filter(function (m) { return m.nombre === 'redactor'; }).length === 1, 'la doble carga no duplica el módulo');
ok(!/matem|fraccion|ciencias|historia|agua|revoluc|bastilla|evapora/i.test(codigo), 'el código no menciona ninguna materia');
ok(!/'Por eso'|'Después'|'Por tanto'|'En consecuencia'/.test(codigo), 'el redactor no usa conectores causales ni temporales propios');

var C;
A.abrir({ memoria: true }).then(function () {
  return ['ciencias_primaria_agua.json', 'matematicas_primaria_fracciones.json', 'historia_secundaria_revolucion_francesa.json']
    .reduce(function (p, f) { return p.then(function () { return B.cargarPaquete(paquete(f)); }); }, Promise.resolve());
}).then(function () {
  return preparar('Ciclo del agua');
}).then(function (c) {
  C = c;
  var red = R.redactar(c.sec, c.est, { semilla: 1 });
  ok(red.secciones.length === c.sec.modulos.length && red.secciones.every(function (s, i) { return s.titulo === c.sec.modulos[i].titulo; }), 'CICLO · una sección por módulo, con el título copiado');
  var au = R.auditar(red, c.est);
  ok(au.ok, 'auditoría completa: nada alterado, añadido ni eliminado' + (au.ok ? '' : ' → ' + JSON.stringify(au.problemas.slice(0, 3))));
  ok(au.cobertura.cubiertas === c.est.piezas.length, 'NADA ELIMINADO: las ' + c.est.piezas.length + ' piezas quedan redactadas');
  var texto = R.aTexto(red);
  var defs = c.est.piezas.filter(function (p) { return p.clase === 'definicion' && p.estado === 'con_respaldo'; });
  ok(defs.every(function (p) { return texto.indexOf(p.datos.texto) >= 0; }), 'cada definición aparece LITERAL (sin parafrasear)');
  var ejs = c.est.piezas.filter(function (p) { return p.clase === 'ejemplo' && p.estado === 'con_respaldo'; });
  ok(ejs.every(function (p) { var t = p.datos.texto; return texto.indexOf(t) >= 0 || texto.indexOf(t.charAt(0).toLowerCase() + t.slice(1)) >= 0; }), 'cada ejemplo aparece literal (como mucho cambia la primera letra)');
  var afs = R.afirmaciones(red);
  ok(afs.length > 50 && afs.every(function (a) { return a.desde.length > 0; }), 'TRAZABILIDAD: las ' + afs.length + ' afirmaciones indican su origen');
  ok(afs.every(function (a) { return a.texto.charAt(0) === a.texto.charAt(0).toUpperCase(); }), 'toda afirmación empieza con mayúscula');
  ok(!/Por eso|Por tanto|En consecuencia|Después,|Luego,|A continuación/.test(texto), 'sin conectores que afirmen causas u órdenes no respaldados');
  var pend = [];
  red.secciones.forEach(function (s) { s.bloques.forEach(function (b) { if (b.tipo === 'pendiente') pend.push(b); }); });
  ok(pend.length === 4 && pend.every(function (b) { return !b.frases && /Falta un ejemplo/.test(b.nota); }), 'los 4 huecos se muestran como PENDIENTES, sin texto de relleno');
  ok(red.requisitos && /estados del agua/.test(red.requisitos.texto), 'requisito previo redactado: «' + red.requisitos.texto + '»');
  var pasosOrden = primerBloque(red, 'pregunta');
  ok(pasosOrden && pasosOrden.enunciado && pasosOrden.respuesta, 'las preguntas llevan enunciado y respuesta');
  // Determinismo y variación
  var red1b = R.redactar(c.sec, c.est, { semilla: 1 });
  ok(JSON.stringify(red1b) === JSON.stringify(red), 'determinista: la misma semilla da el mismo texto');
  var red2 = R.redactar(c.sec, c.est, { semilla: 2 });
  ok(R.aTexto(red2) !== texto, 'VARIACIÓN: otra semilla cambia la redacción');
  ok(JSON.stringify(R.hechos(red2)) === JSON.stringify(R.hechos(red)), 'INVARIANCIA: los hechos son exactamente los mismos con otra semilla (' + R.hechos(red).length + ' hechos)');
  ok(R.auditar(red2, c.est).ok, 'la versión 2 también pasa la auditoría');
  return c;
}).then(function (c) {
  // Manipulaciones: el auditor tiene que detectarlas
  var red = R.redactar(c.sec, c.est, { semilla: 1 });
  var m1 = clonar(red), def = primerBloque(m1, 'definicion');
  def.frases[0].texto = def.frases[0].texto.replace('continuo', 'constante');
  var a1 = R.auditar(m1, c.est);
  ok(!a1.ok && a1.problemas.some(function (p) { return /no aparece|ALTERADO|AÑADIDO/.test(p.problema); }), 'detecta un hecho ALTERADO en la frase («continuo» → «constante»)');
  var m1b = clonar(red); def = primerBloque(m1b, 'definicion');
  def.frases[0].hechos[0].valor = 'Un texto que no está en los datos';
  ok(R.auditar(m1b, c.est).problemas.some(function (p) { return /ALTERADO/.test(p.problema); }), 'detecta un hecho que no coincide con su fuente');
  var m2 = clonar(red), rel = primerBloque(m2, 'relacion');
  rel.frases[0].texto = rel.frases[0].texto.replace(/\.$/, ' de forma muy rápida.');
  var a2 = R.auditar(m2, c.est);
  ok(a2.problemas.some(function (p) { return /AÑADIDO/.test(p.problema) && /rápida/.test(p.problema); }), 'detecta información AÑADIDA («de forma muy rápida»)');
  var m3 = clonar(red);
  m3.secciones[1].bloques = m3.secciones[1].bloques.filter(function (b) { return b.tipo !== 'ejemplo'; });
  ok(R.auditar(m3, c.est).problemas.some(function (p) { return /ELIMINADO/.test(p.problema); }), 'detecta una pieza ELIMINADA');
  var m4 = clonar(red); rel = primerBloque(m4, 'relacion');
  rel.frases[0].hechos.forEach(function (h) { if (h.campo === 'relacion') h.tipo = 'causa'; });
  ok(R.auditar(m4, c.est).problemas.some(function (p) { return /Relación que no está/.test(p.problema); }), 'detecta una relación que no existe en los datos');
  var m5 = clonar(red); m5.secciones[0].titulo = 'Título inventado';
  ok(R.auditar(m5, c.est).problemas.some(function (p) { return /título de sección/.test(p.problema); }), 'detecta un título de sección cambiado');
  // Opciones
  var sinP = R.redactar(c.sec, c.est, { preguntas: false, pendientes: false });
  ok(!primerBloque(sinP, 'pregunta') && !primerBloque(sinP, 'pendiente') && sinP.omitidas.length > 0, 'preguntas:false y pendientes:false las omiten (' + sinP.omitidas.length + ' piezas)');
  ok(R.auditar(sinP, c.est).ok, 'lo omitido por opción queda registrado y la auditoría lo respeta');
  var sinO = R.redactar(c.sec, c.est, { objetivos: false });
  ok(sinO.secciones.every(function (s) { return !s.objetivos.length; }), 'objetivos:false los quita');
}).then(function () {
  return preparar('Revolución francesa');
}).then(function (c) {
  var semillas = [1, 2, 3, 4, 5], todas = true, hs = null, iguales = true;
  semillas.forEach(function (s) {
    var red = R.redactar(c.sec, c.est, { semilla: s });
    if (!R.auditar(red, c.est).ok) todas = false;
    var h = JSON.stringify(R.hechos(red));
    if (hs === null) hs = h; else if (h !== hs) iguales = false;
  });
  ok(todas && iguales, 'REVOLUCIÓN · 5 semillas: todas auditadas y con los mismos hechos');
  var red = R.redactar(c.sec, c.est, { semilla: 1 });
  var texto = R.aTexto(red);
  ok(texto.indexOf('14 de julio de 1789') >= 0 && texto.indexOf('noviembre de 1799') >= 0, 'las fechas aparecen tal cual');
  ok(/Situar cronológicamente/.test(texto), 'objetivos con el verbo de secundaria');
  var todosCon = [];
  ['causa', 'contraste', 'adicion', 'ejemplo', 'resumen'].forEach(function (t) { todosCon = todosCon.concat(EDU.lenguas.es.conectores(t, 'primaria')); });
  var sencillos = EDU.lenguas.es.conectores('resumen', 'primaria').concat(EDU.lenguas.es.conectores('adicion', 'primaria'));
  ok(!sencillos.some(function (c) { return c === 'Para terminar' && texto.indexOf(c + ':') >= 0; }), 'en secundaria no usa el registro sencillo («Para terminar»)');
  var ord = null;
  red.sintesis.bloques.forEach(function (b) { if (b.modo === 'ordenar') ord = b; });
  ok(ord && ord.respuesta[0].texto.indexOf('mayo de 1789') > 0 && ord.opciones.length === ord.respuesta.length, 'pregunta de ordenar: opciones barajadas y respuesta en orden con sus fechas');
}).then(function () {
  return preparar('Sumar fracciones con igual denominador');
}).then(function (c) {
  var red = R.redactar(c.sec, c.est, { semilla: 1 });
  var pasos = primerBloque(red, 'pasos');
  ok(pasos && /^(Pasos para|Cómo) sumar fracciones con igual denominador:$/.test(pasos.frases[0].texto) && pasos.frases.length === 5, 'FRACCIONES · procedimiento: «' + pasos.frases[0].texto + '» + 4 pasos');
  ok(pasos.frases[1].texto === '1. Comprobar que las fracciones tienen el mismo denominador.', 'los pasos, numerados y literales');
  var ej = primerBloque(red, 'ejercicio');
  ok(ej && /2\/7 \+ 3\/7 = 5\/7\./.test(ej.frases[0].texto), 'ejercicio resuelto con el ejemplo real');
  ok(R.auditar(red, c.est).ok, 'auditoría de fracciones');
}).then(function () {
  return A.listar('rama').then(function (r) { return X.expandirRama(r.filter(function (x) { return x.nombre === 'El agua'; })[0].id); });
}).then(function (ests) {
  var sec = S.secuenciar(ests);
  var red = R.redactar(sec, ests, { semilla: 9 });
  var au = R.auditar(red, ests);
  ok(au.ok && au.cobertura.cubiertas === au.cobertura.piezas, 'RAMA completa (varias estructuras): auditoría y cobertura ' + au.cobertura.cubiertas + '/' + au.cobertura.piezas);
  ok(red.secciones.some(function (s) { return s.ordenIndeterminado; }), 'las secciones conservan la marca de orden indeterminado');
  var conFormal = S.secuenciar(ests[0]);
  ok(conFormal.nivel === 'primaria' && /¿Qué es |:/.test(R.aTexto(R.redactar(conFormal, ests[0], { semilla: 4 }))), 'en primaria admite el marco sencillo «¿Qué es…?»');
}).then(function () {
  var lenguas = EDU.lenguas; EDU.lenguas = {};
  try { R.redactar(C.sec, C.est, {}); ok(false, 'debería fallar'); } catch (e) { ok(/paquete de lengua/.test(e.message), 'sin paquete de lengua → error claro'); }
  EDU.lenguas = lenguas;
  try { R.redactar(null, C.est); ok(false, 'debería fallar'); } catch (e) { ok(/Falta la secuencia/.test(e.message), 'sin secuencia → error claro'); }
  ok(EDU.incidencias('error').length === 0, 'sin errores internos');
  console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) {
  console.log('  ✗ excepción: ' + (e && e.stack), JSON.stringify(e && e.errores));
  process.exit(1);
});
