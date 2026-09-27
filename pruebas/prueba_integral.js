/* Prueba integral de la fase 1: todo el recorrido con todos los datos.
   biblioteca → expansión → secuencia → redacción → auditoría → variación,
   para cada rama y cada unidad de los tres paquetes, más apuntes propios y
   copia de seguridad.  Se ejecuta con:  node pruebas/prueba_integral.js */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function leer(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }
var MODULOS = ['nucleo/edu_base.js', 'nucleo/edu_esquemas.js', 'nucleo/edu_almacen.js', 'conocimiento/edu_biblioteca.js',
  'conocimiento/edu_importador.js', 'expansion/edu_expansor.js', 'expansion/edu_secuencia.js', 'redaccion/edu_lengua_es.js',
  'redaccion/edu_redactor.js', 'variacion/edu_variacion.js'];
var ctx = {
  console: { info: function () { }, warn: function () { }, error: function () { } },
  crypto: require('crypto').webcrypto, structuredClone: structuredClone,
  Blob: Blob, btoa: btoa, atob: atob, Promise: Promise, Uint8Array: Uint8Array
};
ctx.globalThis = ctx;
vm.createContext(ctx);
MODULOS.forEach(function (f) { vm.runInContext(leer(f), ctx); });
var EDU = ctx.EDU, A = EDU.almacen, B = EDU.biblioteca, X = EDU.expansor, S = EDU.secuencia, R = EDU.redactor, V = EDU.variacion, I = EDU.importador;

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}

console.log('Prueba integral · fase 1');
ok(EDU.modulos().length === MODULOS.length && EDU.modulos().every(function (m) { return m.completo; }), 'los ' + MODULOS.length + ' módulos se registran con todos sus requisitos');
ok(MODULOS.every(function (f) { return leer(f).split('\n').length <= 800; }), 'ningún módulo supera 800 líneas');

// Recorrido completo sobre una lista de estructuras: devuelve problemas encontrados.
function recorrer(nombre, ests) {
  var problemas = [];
  ests.forEach(function (e) {
    if (!EDU.esquemas.validar('estructura', e).ok) problemas.push(nombre + ': estructura no válida');
  });
  var sec = S.secuenciar(ests);
  if (!S.verificar(sec, ests).ok) problemas.push(nombre + ': secuencia incoherente');
  var r1 = R.redactar(sec, ests, { semilla: 1 }), r2 = R.redactar(sec, ests, { semilla: 5 });
  [r1, r2].forEach(function (r, i) {
    var au = R.auditar(r, ests);
    if (!au.ok) problemas.push(nombre + ' (semilla ' + (i ? 5 : 1) + '): ' + au.problemas[0].problema + (au.problemas[0].texto ? ' «' + au.problemas[0].texto + '»' : ''));
  });
  if (JSON.stringify(R.hechos(r1)) !== JSON.stringify(R.hechos(r2))) problemas.push(nombre + ': la variación cambió hechos');
  return { problemas: problemas, frases: R.afirmaciones(r1).length };
}

var cuenta = { ramas: 0, ucs: 0, frases: 0 };
A.abrir({ memoria: true }).then(function () {
  var ind = JSON.parse(leer('datos/biblioteca/indice.json'));
  return ind.paquetes.reduce(function (p, f) { return p.then(function () { return B.cargarPaquete(JSON.parse(leer('datos/biblioteca/' + f))); }); }, Promise.resolve());
}).then(function () {
  return A.listar('rama');
}).then(function (ramas) {
  var todas = [];
  // Cada rama de tema y subtema, expandida entera
  return ramas.filter(function (r) { return r.clase === 'tema' || r.clase === 'subtema'; }).reduce(function (p, r) {
    return p.then(function () {
      return X.expandirRama(r.id).then(function (ests) {
        cuenta.ramas++;
        var res = recorrer('rama «' + r.nombre + '»', ests);
        cuenta.frases += res.frases;
        todas = todas.concat(res.problemas);
      });
    });
  }, Promise.resolve()).then(function () { return todas; });
}).then(function (problemasRamas) {
  ok(problemasRamas.length === 0, 'RAMAS · ' + cuenta.ramas + ' temas y subtemas: expansión, secuencia, redacción y auditoría correctas' + (problemasRamas.length ? ' → ' + problemasRamas.slice(0, 3).join(' | ') : ''));
  return A.listar('uc');
}).then(function (ucs) {
  var problemas = [];
  return ucs.reduce(function (p, u) {
    return p.then(function () {
      return X.expandir(u.id).then(function (e) {
        cuenta.ucs++;
        var res = recorrer('UC «' + u.titulo + '»', [e]);
        cuenta.frases += res.frases;
        problemas = problemas.concat(res.problemas);
        return X.auditar(e).then(function (au) { if (!au.ok) problemas.push('UC «' + u.titulo + '»: expansión con copia alterada'); });
      });
    });
  }, Promise.resolve()).then(function () {
    ok(problemas.length === 0, 'UNIDADES · las ' + cuenta.ucs + ' unidades, una por una, pasan todas las auditorías' + (problemas.length ? ' → ' + problemas.slice(0, 3).join(' | ') : ''));
    ok(cuenta.frases > 2000, 'en total se han redactado y auditado ' + cuenta.frases + ' frases');
  });
}).then(function () {
  var apuntes = ['# Mis apuntes', 'Célula: unidad básica de los seres vivos', '  Núcleo: contiene el material genético', '    Ej: el núcleo de una célula de la piel', '  → requiere: Seres vivos', 'Seres vivos',
    '  Definición: organismos que nacen, crecen, se reproducen y mueren', '1665: Hooke observa celdas en el corcho', 'Procedimiento: Observar al microscopio', '  Colocar la muestra', '  Enfocar'].join('\n');
  return I.importar(apuntes, { proyecto: 'pro_integral', titulo: 'Apuntes integrales', nivel: 'secundaria' }).then(function (inf) {
    return B.buscar('Mis apuntes').then(function (l) { return X.expandir(l.filter(function (u) { return u.titulo === 'Mis apuntes'; })[0].id); })
      .then(function (e) {
        var res = recorrer('apuntes', [e]);
        ok(inf.ok && res.problemas.length === 0, 'APUNTES PROPIOS · importados (' + inf.cuenta.ucs + ' UC) y convertidos en material auditado' + (res.problemas.length ? ' → ' + res.problemas[0] : ''));
        var sec = S.secuenciar(e), v = V.versiones(sec, e, { n: 3 });
        ok(v.versiones.length === 3 && v.versiones.every(function (x) { return x.huella === v.huella; }), 'VARIACIÓN · 3 versiones distintas de los apuntes con la misma huella de hechos');
      });
  });
}).then(function () {
  return Promise.all([B.estadisticas(), A.exportar()]);
}).then(function (r) {
  var antes = r[0], copia = JSON.stringify(r[1]);
  return A.vaciar({ confirmar: true }).then(function () { return A.importar(JSON.parse(copia)); }).then(function () { return B.estadisticas(); }).then(function (despues) {
    ok(JSON.stringify(antes) === JSON.stringify(despues), 'COPIA DE SEGURIDAD · exportar, vaciar e importar deja la biblioteca idéntica (' + despues.ucs + ' UC, ' + despues.relaciones + ' relaciones)');
  });
}).then(function () {
  ok(EDU.incidencias('error').length === 0, 'sin errores internos en todo el recorrido');
  console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) {
  console.log('  ✗ excepción: ' + (e && e.stack), JSON.stringify(e && e.errores));
  process.exit(1);
});
