/* Pruebas del asistente: conocimiento/edu_pegado.js y proyecto/edu_proyecto.js.
   Se ejecutan con:  node pruebas/prueba_edu_asistente.js   (almacén en memoria) */
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
['nucleo/edu_base.js', 'nucleo/edu_esquemas.js', 'nucleo/edu_almacen.js', 'conocimiento/edu_biblioteca.js', 'conocimiento/edu_importador.js',
 'conocimiento/edu_pegado.js', 'proyecto/edu_proyecto.js', 'expansion/edu_expansor.js', 'expansion/edu_secuencia.js',
 'redaccion/edu_lengua_es.js', 'redaccion/edu_redactor.js', 'redaccion/edu_documento.js'].forEach(function (f) { vm.runInContext(leer(f), ctx); });
var EDU = ctx.EDU, PG = EDU.pegado, PR = EDU.proyecto, A = EDU.almacen;

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}

console.log('Asistente: pegado libre y proyecto');
['conocimiento/edu_pegado.js', 'proyecto/edu_proyecto.js', 'redaccion/edu_documento.js'].forEach(function (f) {
  var c = leer(f);
  ok(c.split('\n').length <= 800 && !/matem|fraccion|ciencias|historia|revoluc|energ[ií]a solar/i.test(c), f + ': ≤800 líneas y sin materias');
});

var WEB = [
  'La energía solar',
  'La energía solar es la energía que procede de la radiación del Sol. Se aprovecha mediante distintas tecnologías.',
  '## Tipos de aprovechamiento',
  'Energía fotovoltaica: transforma la luz del Sol en electricidad mediante paneles',
  'Energía térmica: usa el calor del Sol para calentar agua o aire',
  '- Los paneles solares se instalan en tejados y en grandes plantas.',
  '- Los paneles solares se instalan en tejados y en grandes plantas.',
  '',
  'Ventajas',
  'Es una fuente renovable y no emite gases durante su funcionamiento, aunque su producción depende de las horas de sol y del clima de cada lugar.'
].join('\n');

var pro;
A.abrir({ memoria: true }).then(function () {
  return PR.crear({ titulo: '', tipo: 'nada', hojas: 0 }).then(function () { ok(false, 'debería rechazar'); }, function (e) {
    ok(e.errores.length >= 3, 'crear() rechaza título vacío, tipo desconocido y hojas fuera de rango (' + e.errores.length + ' errores)');
  });
}).then(function () {
  return PR.crear({ titulo: 'Energías renovables', tipo: 'libro', nivel: 'secundaria', hojas: 20, papel: 'a4', origen: 'pegado' });
}).then(function (p) {
  pro = p;
  ok(EDU.esquemas.validar('proyecto', p).ok && p.trabajo.tipo === 'libro' && p.trabajo.hojas === 20, 'crear(): Proyecto Maestro válido con tipo, hojas y papel');
  ok(Object.keys(PR.tipos()).length === 10 && PR.tipos().curso.formatos.indexOf('SCORM') >= 0, '10 tipos de trabajo con sus formatos (curso: HTML, SCORM, PDF)');
  return PG.analizar(WEB, { proyecto: p.id, titulo: 'Energía solar', url: 'https://ejemplo.org/energia-solar' });
}).then(function (an) {
  ok(an.errores.length === 0, 'el texto pegado de una web se analiza sin errores');
  var por = {}; an.ucs.forEach(function (u) { por[u.titulo] = u; });
  ok(por['La energía solar'] && por['Tipos de aprovechamiento'] && por['Ventajas'] && por['La energía solar'].tipo === 'concepto', 'reconoce los apartados (línea corta y «##»)');
  var par = an.ucs.filter(function (u) { return u.tipo === 'dato' && /radiación del Sol/.test(u.texto); })[0];
  ok(par && par.texto === 'La energía solar es la energía que procede de la radiación del Sol. Se aprovecha mediante distintas tecnologías.', 'cada párrafo se guarda ÍNTEGRO, sin cambiar una palabra');
  ok(par.titulo === 'La energía solar es la energía que procede de la radiación del Sol', 'su título es la primera frase');
  var larga = an.ucs.filter(function (u) { return /renovable/.test(u.texto); })[0];
  ok(larga.titulo.length <= 70 && /…$/.test(larga.titulo) && larga.texto.length > 100, 'un párrafo largo lleva la frase recortada como etiqueta y el texto completo');
  ok(por['Energía fotovoltaica'] && por['Energía fotovoltaica'].texto === 'transforma la luz del Sol en electricidad mediante paneles', '«Término: definición» → concepto con su definición');
  ok(an.avisos.some(function (a) { return /repetido/.test(a.mensaje); }), 'un texto repetido se guarda una sola vez (y se avisa)');
  ok(an.avisos.some(function (a) { return /Licencia/.test(a.mensaje); }) && an.fuente.clase === 'web' && an.fuente.url === 'https://ejemplo.org/energia-solar', 'fuente web con su dirección y aviso de licencia');
  var fv = por['Energía fotovoltaica'], tipos = por['Tipos de aprovechamiento'];
  ok(an.relaciones.some(function (r) { return r.de === fv.id && r.a === tipos.id; }), 'lo que va bajo un apartado cuelga de él');
  ok(an.ucs.every(function (u) { return u.origen === 'usuaria' && u.proyecto === pro.id; }), 'todo queda como aportación de la usuaria en su proyecto');
  return PG.analizar('   ', { proyecto: pro.id });
}).then(function (an) {
  ok(an.errores.length === 1, 'sin texto → error');
  return PG.importar(WEB, {}).then(function () { ok(false, 'debería rechazar'); }, function (e) { ok(/proyecto o la rama/.test(e.errores[0].mensaje), 'sin proyecto ni rama → no se guarda nada'); });
}).then(function () {
  return PG.importar(WEB, { proyecto: pro.id, titulo: 'Energía solar', url: 'https://ejemplo.org/energia-solar', nivel: 'secundaria' });
}).then(function (inf) {
  ok(inf.ok && inf.cuenta.ucs >= 8 && inf.raices.length === 1, 'importar(): ' + inf.cuenta.ucs + ' unidades y ' + inf.cuenta.relaciones + ' relaciones guardadas');
  return PR.anadirContenido(pro.id, { ucs: inf.raices }).then(function (p) {
    ok(p.ucs.indexOf(inf.raices[0]) >= 0, 'anadirContenido(): la raíz queda en el proyecto');
    return EDU.documento.redactar(inf.raices[0]);
  }).then(function (doc) {
    var titulos = doc.secciones.map(function (x) { return x.titulo; });
    ok(titulos.join(' | ') === 'Energía solar | La energía solar | Tipos de aprovechamiento | Ventajas', 'DOCUMENTO · apartados en el orden original: ' + titulos.join(' | '));
    var primero = doc.secciones[1].bloques[0].frases[0].texto;
    ok(primero === 'La energía solar es la energía que procede de la radiación del Sol. Se aprovecha mediante distintas tecnologías.', 'los párrafos salen literales, sin frases generadas');
    var tipos = doc.secciones[2].bloques.map(function (b) { return b.frases[0].texto; });
    ok(tipos[0] === 'Energía fotovoltaica: transforma la luz del Sol en electricidad mediante paneles' && tipos.length === 3, '«Término: definición» y viñetas, en su orden');
    ok(doc.piezasExtra.length === 1 && EDU.esquemas.validar('pieza', doc.piezasExtra[0]).ok, 'prepara la lámina del índice (pieza de visualización válida)');
    return EDU.documento.auditar(doc).then(function (au) {
      ok(au.ok && au.cobertura.cubiertas === au.cobertura.piezas, 'auditoría del documento: nada alterado, añadido ni eliminado (' + au.cobertura.cubiertas + '/' + au.cobertura.piezas + ')');
      var trucado = JSON.parse(JSON.stringify(doc));
      trucado.secciones[1].bloques[0].frases[0].texto += ' Además es la mejor energía.';
      return EDU.documento.auditar(trucado);
    }).then(function (au2) {
      ok(!au2.ok && au2.problemas.some(function (p) { return /AÑADIDO/.test(p.problema); }), 'la auditoría detecta una frase añadida al texto de autor');
      var est2 = PR.estimarHojas(doc, { papel: 'a4' });
      ok(est2.hojas >= 1, 'estimarHojas() también sirve para documentos (' + est2.hojas + ' hojas)');
      var c = PR.cobertura(pro, est2);
      ok(c.objetivo === 20 && c.faltan > 0 && /No se rellenará con texto vacío/.test(c.mensaje), 'cobertura(): dice honestamente cuántas hojas faltan para las 20');
      return EDU.biblioteca.cargarPaquete(JSON.parse(leer('datos/biblioteca/ciencias_primaria_agua.json'))).then(function () {
        return EDU.biblioteca.buscar('Ciclo del agua');
      }).then(function (l) { return EDU.expansor.expandir(l.filter(function (u) { return u.titulo === 'Ciclo del agua'; })[0].id); })
        .then(function (est) {
          var red = EDU.redactor.redactar(EDU.secuencia.secuenciar(est), est, { semilla: 1 });
          var mix = EDU.documento.combinar(red, doc);
          ok(mix.secciones.length === red.secciones.length + doc.secciones.length && mix.secciones[mix.secciones.length - 1].orden === mix.secciones.length, 'HÍBRIDO · banco + texto pegado en un mismo trabajo, con numeración seguida');
          ok(EDU.redactor.auditar(red, est).ok, 'la parte del banco sigue auditada por el redactor');
        });
    });
  }).then(function () {
    return PG.quitar(inf.fuente);
  }).then(function (q) {
    ok(q.ok && q.ucs === inf.cuenta.ucs, 'quitar(): deshace el pegado entero');
  });
}).then(function () {
  return PR.listar().then(function (l) { ok(l.length === 1 && l[0].titulo === 'Energías renovables', 'listar() devuelve los trabajos creados'); });
}).then(function () {
  ok(EDU.incidencias('error').length === 0, 'sin errores internos');
  console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) { console.log('  ✗ excepción: ' + (e && e.stack), JSON.stringify(e && e.errores)); process.exit(1); });
