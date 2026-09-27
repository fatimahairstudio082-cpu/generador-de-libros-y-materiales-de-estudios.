/* Pruebas de conocimiento/edu_importador.js.
   Se ejecutan con:  node pruebas/prueba_edu_importador.js   (almacén en memoria) */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function leer(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }
var codigo = leer('conocimiento/edu_importador.js');

var ctx = {
  console: { info: function () { }, warn: function () { }, error: function () { } },
  crypto: require('crypto').webcrypto, structuredClone: structuredClone,
  Blob: Blob, btoa: btoa, atob: atob, Promise: Promise, Uint8Array: Uint8Array
};
ctx.globalThis = ctx;
vm.createContext(ctx);
['nucleo/edu_base.js', 'nucleo/edu_esquemas.js', 'nucleo/edu_almacen.js', 'conocimiento/edu_biblioteca.js'].forEach(function (f) { vm.runInContext(leer(f), ctx); });
vm.runInContext(codigo, ctx);
vm.runInContext(codigo, ctx);
var EDU = ctx.EDU, I = EDU.importador, A = EDU.almacen, B = EDU.biblioteca;

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}
function porTitulo(lista, t) { return lista.filter(function (u) { return u.titulo === t; })[0]; }
function rel(an, tipo, deT, aT) {
  var de = porTitulo(an.ucs, deT), a = porTitulo(an.ucs, aT);
  return !!(de && a) && an.relaciones.some(function (r) { return r.tipo === tipo && r.de === de.id && r.a === a.id; });
}

console.log('edu_importador.js');
ok(codigo.split('\n').length <= 800, 'no supera 800 líneas (' + codigo.split('\n').length + ')');
ok(EDU.modulos().filter(function (m) { return m.nombre === 'importador'; }).length === 1, 'la doble carga no duplica el módulo');
ok(!/matem|fraccion|ciencias|historia|agua|revoluc/i.test(codigo), 'el código no menciona ninguna materia');

// Reconocimiento de fechas
['1789', '14 de julio de 1789', 'mayo de 1789', '1793-1794', '44 a. C.', 'siglo XVIII', 'siglo V a. C.'].forEach(function (f) { ok(I.esFecha(f), 'fecha reconocida: «' + f + '»'); });
['3', 'Mitosis', '12 de cosas', '2 + 2'].forEach(function (f) { ok(!I.esFecha(f), 'no es fecha: «' + f + '»'); });

var APUNTES = [
  '# La célula',
  'Célula: unidad básica de los seres vivos',
  '  Núcleo: contiene el material genético',
  '  Membrana: envuelve la célula',
  '    Ej: la membrana de un glóbulo rojo',
  '  Dato: todos los seres vivos están formados por células',
  '  → requiere: Seres vivos',
  'Seres vivos',
  '  Definición: organismos que nacen, crecen, se reproducen y mueren',
  '',
  '## Cronología',
  '- 1665: Hooke observa células en el corcho',
  '- Teoría celular: 1839',
  '',
  '## Medidas',
  'Fórmula: A = l × l — área de un cuadrado',
  'Procedimiento: Observar al microscopio',
  '  1. Colocar la muestra en el portaobjetos',
  '  2. Enfocar con el objetivo de menor aumento',
  'Cita: «Omnis cellula e cellula» — Rudolf Virchow',
  'Las células se dividen para formar nuevas células y así el organismo crece y se renueva.'
].join('\n');

var mat, niv, tema;
A.abrir({ memoria: true }).then(function () {
  return B.cargarPaquete(JSON.parse(leer('datos/biblioteca/ciencias_primaria_agua.json')));
}).then(function () {
  return A.listar('rama');
}).then(function (ramas) {
  tema = ramas.filter(function (r) { return r.nombre === 'El agua'; })[0];
  return I.analizar(APUNTES, { proyecto: 'pro_prueba', titulo: 'Mis apuntes' });
}).then(function (an) {
  ok(an.errores.length === 0, 'apuntes correctos sin errores' + (an.errores.length ? ': ' + JSON.stringify(an.errores) : ''));
  ok(an.ucs.length === 16, 'reconoce 16 unidades (3 encabezados + 13 líneas) (' + an.ucs.length + ')');
  var t = {}; an.ucs.forEach(function (u) { t[u.tipo] = (t[u.tipo] || 0) + 1; });
  ok(t.concepto === 7 && t.ejemplo === 1 && t.dato === 2 && t.definicion === 1 && t.fecha === 2 && t.formula === 1 && t.procedimiento === 1 && t.cita === 1, 'tipos reconocidos: ' + JSON.stringify(t));
  var cel = porTitulo(an.ucs, 'Célula');
  ok(cel && cel.texto === 'unidad básica de los seres vivos', '«Término: definición» → concepto con su texto');
  ok(rel(an, 'parte_de', 'Célula', 'La célula'), 'lo que va bajo un encabezado cuelga de él');
  ok(rel(an, 'parte_de', 'Núcleo', 'Célula') && rel(an, 'parte_de', 'Membrana', 'Célula'), 'la sangría crea «parte_de»');
  ok(rel(an, 'ejemplo_de', 'la membrana de un glóbulo rojo', 'Membrana'), '«Ej:» crea «ejemplo_de» con la línea de arriba');
  ok(rel(an, 'propiedad_de', 'todos los seres vivos están formados por células', 'Célula'), '«Dato:» sangrado crea «propiedad_de»');
  ok(rel(an, 'requiere', 'Célula', 'Seres vivos'), '«→ requiere: X» enlaza con otra línea de los apuntes');
  var def = porTitulo(an.ucs, 'Definición de Seres vivos');
  ok(def && def.tipo === 'definicion' && rel(an, 'define', 'Definición de Seres vivos', 'Seres vivos'), '«Definición:» crea una definición que define a su concepto');
  var hooke = porTitulo(an.ucs, 'Hooke observa células en el corcho');
  ok(hooke && hooke.tipo === 'fecha' && hooke.campos.fecha === '1665', 'fecha delante: «1665: …»');
  var teoria = porTitulo(an.ucs, 'Teoría celular');
  ok(teoria && teoria.tipo === 'fecha' && teoria.campos.fecha === '1839', 'fecha detrás: «Teoría celular: 1839»');
  ok(rel(an, 'parte_de', 'Teoría celular', 'Cronología') && rel(an, 'parte_de', 'Cronología', 'La célula'), 'la viñeta y el subtítulo respetan la jerarquía');
  var f = an.ucs.filter(function (u) { return u.tipo === 'formula'; })[0];
  ok(f && f.campos.expresion === 'A = l × l' && f.texto === 'área de un cuadrado', 'fórmula con expresión y explicación');
  var pr = porTitulo(an.ucs, 'Observar al microscopio');
  ok(pr && pr.campos.pasos.length === 2 && pr.campos.pasos[0] === 'Colocar la muestra en el portaobjetos', 'procedimiento con sus pasos (sin la numeración)');
  var c = an.ucs.filter(function (u) { return u.tipo === 'cita'; })[0];
  ok(c && c.texto === 'Omnis cellula e cellula' && c.campos.autor === 'Rudolf Virchow', 'cita con autor');
  var larga = an.ucs.filter(function (u) { return u.tipo === 'dato' && u.texto.indexOf('se dividen') > 0; })[0];
  ok(larga && larga.titulo.length <= 80 && /…$/.test(larga.titulo), 'frase larga → dato con título recortado y el texto completo');
  ok(an.ucs.every(function (u) { return u.origen === 'usuaria' && u.proyecto === 'pro_prueba' && u.fuente === an.fuente.id; }), 'todo queda como aportación de la usuaria, con proyecto y fuente');
  ok(an.fuente.clase === 'apuntes' && an.fuente.licencia === 'propia' && an.fuente.titulo === 'Mis apuntes', 'fuente de tipo apuntes');
  return A.contar('uc');
}).then(function (n) {
  ok(n === 20, 'analizar() no guarda nada (siguen las 20 UC de la biblioteca)');
  // Errores: todo o nada
  var ROTOS = [
    'Célula: unidad básica',
    '→ causa: algo',
    'Procedimiento: Sin pasos',
    'Ej:',
    '→ inventada: X',
    'Célula: repetida',
    'Membrana',
    '  → ver: Algo que no existe'
  ].join('\n');
  return I.analizar(ROTOS, { proyecto: 'pro_prueba' });
}).then(function (an) {
  var lin = an.errores.map(function (e) { return e.linea; });
  ok(an.errores.length === 6, 'detecta los 6 errores (' + an.errores.length + ')');
  ok(lin.join(',') === '2,3,4,5,6,8', 'cada error señala su línea: ' + lin.join(','));
  ok(/sangrada/.test(an.errores[0].mensaje) && /pasos/.test(an.errores[1].mensaje) && /Falta el contenido/.test(an.errores[2].mensaje) && /desconocida/.test(an.errores[3].mensaje) && /Repite la línea 1/.test(an.errores[4].mensaje) && /No se encuentra/.test(an.errores[5].mensaje), 'mensajes claros para cada caso');
  return I.importar('Uno: bien\n→ causa: nada', { proyecto: 'pro_prueba' }).then(function () { ok(false, 'debería rechazar'); }, function (e) {
    ok(e.errores && e.errores.length === 1, 'importar() rechaza los apuntes con errores');
    return A.contar('uc').then(function (n) { ok(n === 20, 'y no guarda nada, ni siquiera las líneas buenas'); });
  });
}).then(function () {
  return I.analizar('Algo', {}).then(function (an) { ok(an.errores.length === 1 && /proyecto o la rama/.test(an.errores[0].mensaje), 'sin proyecto ni rama → error'); });
}).then(function () {
  return I.analizar('   \n\n', { proyecto: 'p' }).then(function (an) { ok(an.errores.length === 1 && /vacíos/.test(an.errores[0].mensaje), 'apuntes vacíos → error'); });
}).then(function () {
  // Conexión con la biblioteca
  var MIS = ['Evaporación: el agua pasa a vapor con el calor', '  → antes de: Condensación', 'Mi experimento', '  → ver: Evaporación'].join('\n');
  return I.analizar(MIS, { rama: tema.id }).then(function (an) {
    ok(an.errores.length === 0, 'apuntes enlazados sin errores' + (an.errores.length ? ': ' + JSON.stringify(an.errores) : ''));
    var mia = porTitulo(an.ucs, 'Evaporación');
    ok(mia && mia.niveles.join() === 'primaria', 'hereda el nivel de la rama indicada');
    ok(an.enlaces.length === 1 && an.enlaces[0].titulo === 'Evaporación', 'detecta la UC de la biblioteca con el mismo título');
    var cond = an.relaciones.filter(function (r) { return r.tipo === 'antes_de'; })[0];
    return A.obtener('uc', cond && cond.a).then(function (u) {
      ok(u && u.origen === 'biblioteca' && u.titulo === 'Condensación', '«→ antes de: X» encuentra X en la biblioteca');
      var ver = an.relaciones.filter(function (r) { return r.tipo === 'relacionado' && r.de === porTitulo(an.ucs, 'Mi experimento').id; })[0];
      ok(ver && ver.a === mia.id, 'si el título está en los apuntes y en la biblioteca, se prefieren los apuntes');
      return I.analizar(MIS, { rama: tema.id, enlazar: false });
    }).then(function (an2) { ok(an2.enlaces.length === 0, 'enlazar:false desactiva los enlaces automáticos'); });
  });
}).then(function () {
  return I.importar(APUNTES, { proyecto: 'pro_prueba', titulo: 'Mis apuntes' });
}).then(function (inf) {
  ok(inf.ok && inf.cuenta.ucs === 16 && inf.porTipo.fecha === 2, 'importar() guarda las 16 unidades y sus relaciones (' + inf.cuenta.relaciones + ')');
  return Promise.all([A.contar('uc'), A.contar('relacion'), A.obtener('fuente', inf.fuente)]).then(function (r) {
    ok(r[0] === 36 && r[2] && r[2].clase === 'apuntes', 'quedan 36 UC y la fuente de los apuntes');
    return I.importar(APUNTES, { proyecto: 'pro_prueba', titulo: 'Mis apuntes' }).then(function () {
      return Promise.all([A.contar('uc'), A.contar('relacion')]);
    }).then(function (r2) { ok(r2[0] === r[0] && r2[1] === r[1], 'reimportar los mismos apuntes no duplica nada'); })
      .then(function () { return B.buscar('celula'); })
      .then(function (l) { ok(l.length >= 1 && l[0].titulo === 'Célula', 'lo importado aparece en las búsquedas de la biblioteca'); })
      .then(function () { return I.quitarImportacion(inf.fuente); })
      .then(function (q) {
        ok(q.ok && q.ucs === 16, 'quitarImportacion borra las 16 unidades');
        return Promise.all([A.contar('uc'), A.contar('relacion'), A.obtener('fuente', inf.fuente)]);
      }).then(function (r3) {
        ok(r3[0] === 20 && r3[1] === 25 && r3[2] === null, 'la biblioteca queda como estaba (20 UC, 25 relaciones) y sin la fuente');
      });
  });
}).then(function () {
  ok(EDU.incidencias('error').length === 0, 'sin errores internos');
  console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) {
  console.log('  ✗ excepción: ' + (e && e.message), JSON.stringify(e && e.errores));
  process.exit(1);
});
