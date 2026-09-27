/* Pruebas de expansion/edu_expansor.js con los tres paquetes reales.
   Se ejecutan con:  node pruebas/prueba_edu_expansor.js   (almacén en memoria) */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function leer(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }
function paquete(f) { return JSON.parse(leer('datos/biblioteca/' + f)); }
var codigo = leer('expansion/edu_expansor.js');

var ctx = {
  console: { info: function () { }, warn: function () { }, error: function () { } },
  crypto: require('crypto').webcrypto, structuredClone: structuredClone,
  Blob: Blob, btoa: btoa, atob: atob, Promise: Promise, Uint8Array: Uint8Array
};
ctx.globalThis = ctx;
vm.createContext(ctx);
['nucleo/edu_base.js', 'nucleo/edu_esquemas.js', 'nucleo/edu_almacen.js', 'conocimiento/edu_biblioteca.js', 'conocimiento/edu_importador.js'].forEach(function (f) { vm.runInContext(leer(f), ctx); });
vm.runInContext(codigo, ctx);
vm.runInContext(codigo, ctx);
var EDU = ctx.EDU, X = EDU.expansor, A = EDU.almacen, B = EDU.biblioteca;

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}
function de(est, clase, modo) { return est.piezas.filter(function (p) { return p.clase === clase && (!modo || p.datos.modo === modo || p.datos.forma === modo); }); }
function buscarUC(titulo) { return B.buscar(titulo).then(function (l) { return l.filter(function (u) { return u.titulo === titulo; })[0]; }); }

/* Prueba de NO INVENCIÓN independiente del auditor: todo texto que aparece en
   los datos de una pieza tiene que ser, tal cual, un campo de alguna UC, un id,
   o un nombre/clave de catálogo. */
var permitidos = null;
function prepararPermitidos() {
  permitidos = {};
  function pon(v) { if (typeof v === 'string') permitidos[v] = true; }
  ['tiposRelacion', 'formasDato', 'tiposUC', 'clasesPieza'].forEach(function (c) {
    var cat = EDU.esquemas.catalogo(c);
    Object.keys(cat).forEach(function (k) { pon(k); pon(cat[k].nombre); (cat[k].familias || []).forEach(pon); });
  });
  ['definicion', 'fecha', 'formula', 'ordenar_pasos', 'causa', 'verdadero', 'clasificar', 'emparejar', 'ordenar', 'resuelto', 'nuevo', 'esencial'].forEach(pon);
  return Promise.all([A.listar('uc'), A.listar('relacion')]).then(function (r) {
    r[0].forEach(function (u) {
      pon(u.id); pon(u.titulo); pon(u.texto); pon(u.tipo);
      Object.keys(u.campos || {}).forEach(function (k) { var v = u.campos[k]; if (Array.isArray(v)) v.forEach(pon); else pon(v); });
    });
    r[1].forEach(function (x) { pon(x.id); });
  });
}
function textosInventados(est) {
  var malos = [];
  function mirar(v, p) {
    if (typeof v === 'string') { if (!permitidos[v]) malos.push(p.clase + ': «' + v + '»'); return; }
    if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { mirar(v[k], p); });
  }
  est.piezas.forEach(function (p) { mirar(p.datos, p); });
  return malos;
}

console.log('edu_expansor.js');
ok(codigo.split('\n').length <= 800, 'no supera 800 líneas (' + codigo.split('\n').length + ')');
ok(EDU.modulos().filter(function (m) { return m.nombre === 'expansor'; }).length === 1, 'la doble carga no duplica el módulo');
ok(!/matem|fraccion|ciencias|historia|agua|revoluc|bastilla/i.test(codigo), 'el código no menciona ninguna materia');

var estCiclo, estRev, estFrac;
A.abrir({ memoria: true }).then(function () {
  return ['ciencias_primaria_agua.json', 'matematicas_primaria_fracciones.json', 'historia_secundaria_revolucion_francesa.json']
    .reduce(function (p, f) { return p.then(function () { return B.cargarPaquete(paquete(f)); }); }, Promise.resolve());
}).then(prepararPermitidos).then(function () {
  return buscarUC('Ciclo del agua');
}).then(function (u) {
  return X.expandir(u.id).then(function (est) {
    estCiclo = est;
    ok(EDU.esquemas.validar('estructura', est).ok, 'CICLO · la estructura cumple el contrato de esquemas');
    ok(est.nivel === 'primaria' && est.profundidad === 2, 'toma el nivel de la UC (primaria) y su profundidad (2)');
    ok(de(est, 'concepto').length === 1 && de(est, 'concepto')[0].datos.titulo === 'Ciclo del agua', 'una pieza concepto: la raíz');
    var subs = de(est, 'subconcepto').map(function (p) { return p.datos.titulo; }).sort();
    ok(subs.join(', ') === 'Condensación, Escorrentía, Evaporación, Infiltración, Precipitación, Transpiración', '6 subconceptos: ' + subs.join(', '));
    ok(de(est, 'definicion').filter(function (p) { return p.estado === 'con_respaldo'; }).length === 7, '7 definiciones con respaldo (raíz + 6)');
    var ejs = de(est, 'ejemplo').filter(function (p) { return p.estado === 'con_respaldo'; }).map(function (p) { return p.datos.titulo; }).sort();
    ok(ejs.join(', ') === 'El granizo, Gotas en un vaso frío, La lluvia, La nieve, Un charco que se seca', 'ejemplos reales copiados: ' + ejs.join(', '));
    var pend = de(est, 'ejemplo').filter(function (p) { return p.estado === 'pendiente'; }).map(function (p) { return p.datos.de.titulo; }).sort();
    ok(pend.join(', ') === 'Ciclo del agua, Escorrentía, Infiltración, Transpiración', 'ejemplos que faltan quedan PENDIENTES (no se inventan): ' + pend.join(', '));
    ok(de(est, 'ejemplo').filter(function (p) { return p.estado === 'pendiente'; }).every(function (p) { return !p.datos.texto && /Falta un ejemplo/.test(p.nota); }), 'las piezas pendientes no llevan texto, solo una nota');
    var sec = de(est, 'visualizacion', 'secuencia')[0];
    ok(sec && sec.datos.pasos.map(function (x) { return x.titulo; }).slice(0, 3).join(' → ').indexOf('Condensación') > 0, 'visualización de secuencia a partir de «antes de»');
    var ord = sec.datos.pasos.map(function (x) { return x.titulo; });
    ok(ord.indexOf('Evaporación') < ord.indexOf('Condensación') && ord.indexOf('Condensación') < ord.indexOf('Precipitación') && ord.indexOf('Precipitación') < ord.indexOf('Escorrentía'), 'el orden respeta todas las relaciones «antes de»: ' + ord.join(' → '));
    ok(de(est, 'visualizacion', 'jerarquia').length === 1, 'visualización de jerarquía (raíz + partes)');
    ok(de(est, 'visualizacion', 'comparacion').length === 1, 'visualización de comparación (evaporación ↔ condensación)');
    ok(de(est, 'visualizacion', 'lista').length === 1 && de(est, 'visualizacion', 'lista')[0].datos.items.length === 3, 'visualización de lista (3 ejemplos de precipitación)');
    ok(de(est, 'visualizacion').every(function (p) { return Array.isArray(p.datos.familias) && p.datos.familias.length; }), 'cada visualización lleva sus familias visuales compatibles');
    var causa = de(est, 'pregunta', 'causa')[0];
    ok(causa && causa.datos.respuesta.titulo === 'Energía del Sol' && causa.datos.sobre.titulo === 'Evaporación', 'pregunta de causa sacada de la relación «causa»');
    ok(de(est, 'pregunta', 'clasificar').length === 1 && de(est, 'pregunta', 'clasificar')[0].datos.respuesta.length === 6, 'pregunta de clasificar con las 6 partes');
    ok(de(est, 'pregunta', 'emparejar').length === 1, 'pregunta de emparejar término-definición');
    ok(de(est, 'pregunta', 'ordenar').length === 1, 'pregunta de ordenar la secuencia');
    ok(de(est, 'pregunta').every(function (p) { return p.datos.respuesta !== undefined && !p.datos.enunciado; }), 'las preguntas son especificaciones: respuesta de los datos y sin enunciado redactado');
    ok(de(est, 'repaso').length === 1 && de(est, 'repaso')[0].estado === 'con_respaldo', 'repaso con lo esencial');
    ok(est.piezas.every(function (p) { return p.estado === 'pendiente' || p.desde.length > 0; }), 'toda pieza con contenido indica su origen');
    var inv = textosInventados(est);
    ok(inv.length === 0, 'NO INVENCIÓN: ningún texto que no esté en los datos' + (inv.length ? ' → ' + inv.slice(0, 5).join(' | ') : ''));
    return X.auditar(est);
  });
}).then(function (au) {
  ok(au.ok, 'auditar(): todo lo copiado coincide con su origen' + (au.ok ? '' : ' → ' + JSON.stringify(au.problemas.slice(0, 3))));
  return buscarUC('Ciclo del agua').then(function (u) { return X.expandir(u.id); });
}).then(function (est2) {
  ok(JSON.stringify(est2.piezas) === JSON.stringify(estCiclo.piezas) && est2.id === estCiclo.id, 'determinista: los mismos datos dan la misma estructura');
  return buscarUC('Ciclo del agua').then(function (u) { return X.expandir(u.id, { profundidad: 0 }); });
}).then(function (est0) {
  ok(de(est0, 'subconcepto').length === 0 && de(est0, 'relacion').length > 0, 'profundidad 0: sin subconceptos, pero con sus relaciones');
  return buscarUC('Revolución francesa');
}).then(function (u) {
  return X.expandir(u.id).then(function (est) {
    estRev = est;
    ok(est.nivel === 'secundaria' && est.profundidad === 3, 'REVOLUCIÓN · nivel secundaria, profundidad 3');
    var ord = de(est, 'pregunta', 'ordenar')[0];
    var fechas = ord && ord.datos.respuesta.map(function (x) { return x.fecha; });
    ok(fechas && fechas[0] === 'mayo de 1789' && fechas[fechas.length - 1] === 'noviembre de 1799' && fechas.length === 9, 'ordenar: 9 etapas de mayo de 1789 a noviembre de 1799');
    ok(de(est, 'pregunta', 'fecha').length === 9 && de(est, 'pregunta', 'fecha').every(function (p) { return p.datos.respuesta.fecha; }), '9 preguntas de fecha con la fecha real');
    var causas = de(est, 'pregunta', 'causa').map(function (p) { return p.datos.respuesta.titulo + ' → ' + p.datos.sobre.titulo; }).sort();
    ok(causas.length === 4 && causas.indexOf('Crisis económica y de la Hacienda real → Reunión de los Estados Generales') >= 0, '4 preguntas de causa, tal como están en los datos: ' + causas.join(' | '));
    var req = de(est, 'relacion').filter(function (p) { return p.datos.tipo === 'requiere'; })[0];
    ok(req && req.datos.externa && req.datos.a.titulo === 'Antiguo Régimen', 'un requisito fuera del subgrafo se cita (externo) sin expandirlo');
    ok(textosInventados(est).length === 0, 'NO INVENCIÓN en historia');
    return X.auditar(est);
  });
}).then(function (au) {
  ok(au.ok, 'auditar() en historia');
  return buscarUC('Sumar fracciones con igual denominador');
}).then(function (u) {
  return X.expandir(u.id).then(function (est) {
    estFrac = est;
    var pr = de(est, 'procedimiento')[0];
    ok(pr && pr.datos.pasos.length === 4, 'FRACCIONES · procedimiento con sus 4 pasos copiados');
    var res = de(est, 'ejercicio', 'resuelto')[0];
    ok(res && res.datos.resueltos[0].texto === '2/7 + 3/7 = 5/7.', 'ejercicio resuelto = el ejemplo real');
    var nuevo = de(est, 'ejercicio', 'nuevo')[0];
    ok(nuevo && nuevo.estado === 'pendiente' && /generador del dominio/.test(nuevo.nota), 'ejercicios nuevos: PENDIENTES (el expansor no inventa números)');
    ok(de(est, 'pregunta', 'ordenar_pasos').length === 1, 'pregunta de ordenar los pasos');
    ok(de(est, 'visualizacion', 'secuencia').length === 1, 'los pasos dan una visualización de secuencia');
    ok(textosInventados(est).length === 0, 'NO INVENCIÓN en fracciones');
    return X.auditar(est);
  });
}).then(function (au) {
  ok(au.ok, 'auditar() en fracciones');
  // Filtro de nivel: una UC de universidad no entra en una expansión de primaria
  return buscarUC('Fracción').then(function (f) {
    return B.anadirUC({ tipo: 'concepto', titulo: 'Cuerpo de fracciones', texto: 'Estructura algebraica.', rama: f.rama, niveles: ['universidad'], origen: 'manual' }).then(function (r) {
      return A.guardar('relacion', EDU.esquemas.crear('relacion', { tipo: 'es_un', de: r.id, a: f.id })).then(function () {
        return Promise.all([X.expandir(f.id, { nivel: 'primaria' }), X.expandir(f.id, { nivel: 'universidad' })]);
      }).then(function (dos) {
        var enPri = dos[0].piezas.some(function (p) { return p.datos.titulo === 'Cuerpo de fracciones'; });
        var enUni = dos[1].piezas.some(function (p) { return p.datos.titulo === 'Cuerpo de fracciones'; });
        ok(!enPri && dos[0].excluidas.indexOf(r.id) >= 0, 'nivel: una UC de universidad se excluye en primaria (y se informa)');
        ok(enUni, 'nivel: la misma UC sí entra en universidad');
      });
    });
  });
}).then(function () {
  // Apuntes con huecos: definición pendiente
  return EDU.importador.importar('Concepto suelto\n  Parte uno\n  Parte dos', { proyecto: 'pro_x' }).then(function (inf) {
    return B.buscar('Concepto suelto').then(function (l) { return X.expandir(l[0].id, { nivel: 'primaria' }); });
  }).then(function (est) {
    return prepararPermitidos().then(function () { return est; });
  }).then(function (est) {
    var defs = de(est, 'definicion');
    ok(defs.length === 3 && defs.every(function (p) { return p.estado === 'pendiente'; }), 'sin definiciones en los datos → 3 definiciones PENDIENTES');
    ok(est.resumen.cobertura < 100 && est.resumen.pendiente > 0, 'el resumen refleja la cobertura real (' + est.resumen.cobertura + '%)');
    ok(de(est, 'pregunta', 'definicion').length === 0 && de(est, 'pregunta', 'emparejar').length === 0, 'sin definiciones no se proponen preguntas de definición');
    ok(textosInventados(est).length === 0, 'NO INVENCIÓN con apuntes incompletos');
  });
}).then(function () {
  return X.expandir('uc_no_existe').then(function () { ok(false, 'debería fallar'); }, function (e) { ok(/No existe/.test(e.message), 'UC inexistente → error claro'); });
}).then(function () {
  return A.listar('rama').then(function (ramas) {
    var ciclo = ramas.filter(function (r) { return r.nombre === 'El ciclo del agua'; })[0];
    return X.expandirRama(ciclo.id);
  });
}).then(function (lista) {
  var raices = lista.map(function (e) { return e.piezas.filter(function (p) { return p.clase === 'concepto'; })[0].datos.titulo; });
  ok(raices.indexOf('Ciclo del agua') >= 0 && raices.indexOf('Evaporación') < 0, 'expandirRama parte de las raíces (el ciclo, no sus partes): ' + raices.join(', '));
  return X.guardar(estCiclo);
}).then(function () {
  return A.obtener('estructura', estCiclo.id);
}).then(function (o) {
  ok(o && o.piezas.length === estCiclo.piezas.length, 'guardar() deja la estructura en el almacén');
  // El auditor detecta una manipulación
  var trucada = JSON.parse(JSON.stringify(estCiclo));
  var p = trucada.piezas.filter(function (x) { return x.clase === 'definicion' && x.estado === 'con_respaldo'; })[0];
  p.datos.texto = 'Texto inventado que no está en los datos';
  return X.auditar(trucada);
}).then(function (au) {
  ok(!au.ok && au.problemas.some(function (x) { return x.campo === 'texto'; }), 'auditar() detecta un texto que no coincide con su origen');
  ok(EDU.incidencias('error').length === 0, 'sin errores internos');
  var r = estCiclo.resumen;
  console.log('\n  Resumen «Ciclo del agua»: ' + r.total + ' piezas · ' + r.con_respaldo + ' con respaldo · ' + r.pendiente + ' pendientes · cobertura ' + r.cobertura + '%');
  console.log('  Resumen «Revolución francesa»: ' + estRev.resumen.total + ' piezas · ' + estRev.resumen.pendiente + ' pendientes · cobertura ' + estRev.resumen.cobertura + '%');
  console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) {
  console.log('  ✗ excepción: ' + (e && e.message), JSON.stringify(e && e.errores));
  process.exit(1);
});
