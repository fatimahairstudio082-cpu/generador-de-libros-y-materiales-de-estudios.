/* Pruebas de conocimiento/edu_biblioteca.js con los tres paquetes reales.
   Se ejecutan con:  node pruebas/prueba_edu_biblioteca.js   (almacén en memoria) */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function leer(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }
function paquete(f) { return JSON.parse(leer('datos/biblioteca/' + f)); }
var codigo = leer('conocimiento/edu_biblioteca.js');

var ctx = {
  console: { info: function () { }, warn: function () { }, error: function () { } },
  crypto: require('crypto').webcrypto, structuredClone: structuredClone,
  Blob: Blob, btoa: btoa, atob: atob, Promise: Promise, Uint8Array: Uint8Array
};
ctx.globalThis = ctx;
vm.createContext(ctx);
['nucleo/edu_base.js', 'nucleo/edu_esquemas.js', 'nucleo/edu_almacen.js'].forEach(function (f) { vm.runInContext(leer(f), ctx); });
vm.runInContext(codigo, ctx);
vm.runInContext(codigo, ctx);
var EDU = ctx.EDU, B = EDU.biblioteca, A = EDU.almacen;

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}
function rechaza(promesa, nombre, comprobar) {
  return promesa.then(function () { ok(false, nombre + ' (no se rechazó)'); }, function (e) { ok(!comprobar || comprobar(e), nombre); });
}

var indice = paquete('indice.json');
var AGUA = paquete('ciencias_primaria_agua.json');
var FRAC = paquete('matematicas_primaria_fracciones.json');
var HIST = paquete('historia_secundaria_revolucion_francesa.json');
function idUC(paq, clave) {
  var u = paq.ucs.filter(function (x) { return x.clave === clave; })[0];
  return EDU.esquemas.crear('uc', { tipo: u.tipo, titulo: u.titulo, rama: ctx.__ramas[paq.id][u.rama] }).id;
}
// ids de rama por clave, calculados igual que la biblioteca (para las comprobaciones)
ctx.__ramas = {};
[AGUA, FRAC, HIST].forEach(function (p) {
  var m = {}; ctx.__ramas[p.id] = m;
  p.ramas.forEach(function (r) { m[r.clave] = EDU.esquemas.crear('rama', { clase: r.clase, nombre: r.nombre, padre: r.padre ? m[r.padre] : null }).id; });
});

console.log('edu_biblioteca.js');
ok(codigo.split('\n').length <= 800, 'no supera 800 líneas (' + codigo.split('\n').length + ')');
ok(EDU.modulos().filter(function (m) { return m.nombre === 'biblioteca'; }).length === 1, 'la doble carga no duplica el módulo');
ok(!/matem|fraccion|ciencias|historia|agua|revoluc/i.test(codigo), 'el código no menciona ninguna materia');
ok(indice.paquetes.length === 3 && indice.paquetes.every(function (f) { return fs.existsSync(path.join(__dirname, '..', 'datos', 'biblioteca', f)); }), 'el índice lista los 3 paquetes y existen');

var esperado = {};
[AGUA, FRAC, HIST].forEach(function (p) { esperado[p.id] = { ucs: p.ucs.length, rel: p.relaciones.length }; });

A.abrir({ memoria: true }).then(function () {
  return B.cargarPaquete(AGUA);
}).then(function (inf) {
  ok(inf.ok && inf.cuenta.ucs === esperado[AGUA.id].ucs && inf.cuenta.relaciones === esperado[AGUA.id].rel, 'carga «agua» (' + inf.cuenta.ucs + ' UC, ' + inf.cuenta.relaciones + ' relaciones)');
  return B.cargarPaquete(FRAC);
}).then(function (inf) {
  ok(inf.ok && inf.cuenta.ucs === esperado[FRAC.id].ucs, 'carga «fracciones» (' + inf.cuenta.ucs + ' UC, ' + inf.cuenta.relaciones + ' relaciones)');
  return B.cargarPaquete(HIST);
}).then(function (inf) {
  ok(inf.ok && inf.cuenta.ucs === esperado[HIST.id].ucs, 'carga «revolución» (' + inf.cuenta.ucs + ' UC, ' + inf.cuenta.relaciones + ' relaciones)');
  ok(EDU.incidencias('error').length === 0 && EDU.incidencias('aviso').filter(function (n) { return /almacen|biblioteca/.test(n.modulo); }).length === 0, 'carga sin errores ni avisos');
  return B.estadisticas();
}).then(function (st) {
  var totUC = AGUA.ucs.length + FRAC.ucs.length + HIST.ucs.length;
  var totRel = AGUA.relaciones.length + FRAC.relaciones.length + HIST.relaciones.length;
  ok(st.ucs === totUC && st.relaciones === totRel, 'estadísticas: ' + st.ucs + ' UC, ' + st.relaciones + ' relaciones, ' + st.ramas + ' ramas');
  ok(st.fuentes === 1, 'la fuente idéntica de los tres paquetes se guarda una sola vez');
  return B.cargarPaquete(AGUA).then(function () { return B.estadisticas(); }).then(function (st2) {
    ok(st2.ucs === st.ucs && st2.relaciones === st.relaciones && st2.ramas === st.ramas, 'recargar un paquete no duplica nada');
  });
}).then(function () {
  return B.arbol();
}).then(function (arbol) {
  var nombres = arbol.map(function (n) { return n.nombre; }).sort().join(', ');
  ok(arbol.length === 3 && nombres === 'Ciencias naturales, Historia, Matemáticas', 'árbol con 3 materias: ' + nombres);
  var cien = arbol.filter(function (n) { return n.nombre === 'Ciencias naturales'; })[0];
  var tema = cien.hijas[0].hijas[0];
  ok(cien.hijas[0].clase === 'nivel' && tema.clase === 'tema' && tema.hijas.length === 2, 'materia → nivel → tema → subtemas');
  ok(tema.hijas[0].nombre === 'El ciclo del agua' && tema.hijas[1].nombre === 'Los estados del agua', 'subtemas en su orden');
  ok(cien.total === AGUA.ucs.length && tema.propias === 0, 'recuento de unidades por rama (total con subramas)');
  return B.ruta(ctx.__ramas[AGUA.id].ciclo);
}).then(function (r) {
  ok(r.map(function (x) { return x.clase; }).join('>') === 'materia>nivel>tema>subtema', 'ruta de un subtema hasta su materia');
  return B.hijas(null);
}).then(function (l) {
  ok(l.length === 3 && l.every(function (x) { return x.clase === 'materia'; }), 'hijas(null) devuelve las materias');
  return B.obtener(idUC(AGUA, 'evaporacion'));
}).then(function (u) {
  ok(u && u.titulo === 'Evaporación' && u.origen === 'biblioteca' && u.paquete === AGUA.id, 'la UC se guarda con origen y paquete');
  ok(u && u.niveles.join() === 'primaria', 'la UC hereda el nivel de su rama');
  ok(u && /^fue_/.test(u.fuente), 'la UC recibe la fuente única del paquete');
  return B.buscar('evaporacion');
}).then(function (l) {
  ok(l.length >= 1 && l[0].titulo === 'Evaporación', 'buscar sin tildes: «evaporacion» → Evaporación primero');
  return B.buscar('fraccion', { nivel: 'secundaria' });
}).then(function (l) {
  ok(l.length === 0, 'filtrar por nivel: nada de fracciones en secundaria');
  return B.buscar('', { tipo: 'fecha' });
}).then(function (l) {
  ok(l.length === HIST.ucs.filter(function (u) { return u.tipo === 'fecha'; }).length, 'filtrar por tipo: ' + l.length + ' fechas');
  return B.buscar('', { rama: ctx.__ramas[FRAC.id].oper });
}).then(function (l) {
  ok(l.length === FRAC.ucs.filter(function (u) { return u.rama === 'oper'; }).length, 'filtrar por rama');
  return B.ucsDeRama(ctx.__ramas[AGUA.id].tema);
}).then(function (l) {
  ok(l.length === AGUA.ucs.length, 'ucsDeRama incluye las subramas');
  return B.ucsDeRama(ctx.__ramas[AGUA.id].tema, { subramas: false });
}).then(function (l) {
  ok(l.length === 0, 'ucsDeRama sin subramas');
  return B.vecinos(idUC(AGUA, 'ciclo'));
}).then(function (v) {
  var partes = v.filter(function (x) { return x.lectura === 'tiene_parte'; }).map(function (x) { return x.uc.titulo; });
  ok(partes.length === 6, 'vecinos del ciclo: 6 partes leídas como «tiene_parte»');
  ok(v.some(function (x) { return x.lectura === 'requiere' && x.uc.titulo === 'Estados del agua'; }), 'vecino de salida conserva su relación («requiere»)');
  return B.vecinos(idUC(AGUA, 'condensacion'));
}).then(function (v) {
  ok(v.some(function (x) { return x.lectura === 'contrasta_con' && x.sentido === 'entrada'; }), 'relación simétrica se lee igual desde los dos lados');
  return B.relaciones(idUC(AGUA, 'precipitacion'), { tipo: 'antes_de', sentido: 'salida' });
}).then(function (l) {
  ok(l.length === 2, 'relaciones filtradas por tipo y sentido');
  return B.cobertura(ctx.__ramas[HIST.id].tema);
}).then(function (c) {
  var fechas = HIST.ucs.filter(function (u) { return u.tipo === 'fecha'; }).length;
  ok(c.ucs === HIST.ucs.length && c.porTipo.fecha === fechas && c.sinFuente === 0 && c.relaciones === HIST.relaciones.length, 'cobertura del tema: ' + c.ucs + ' UC, ' + c.porTipo.fecha + ' fechas, ' + c.relaciones + ' relaciones internas');
}).then(function () {
  // Paquetes rotos: no se escribe nada
  return B.estadisticas().then(function (antes) {
    var roto1 = JSON.parse(JSON.stringify(AGUA)); roto1.id = 'paq_roto1'; roto1.ucs.push(JSON.parse(JSON.stringify(roto1.ucs[0])));
    var roto2 = JSON.parse(JSON.stringify(FRAC)); roto2.id = 'paq_roto2'; roto2.relaciones.push({ tipo: 'causa', de: 'fraccion', a: 'no_existe' });
    var roto3 = JSON.parse(JSON.stringify(HIST)); roto3.id = 'paq_roto3'; roto3.ucs[0].tipo = 'formula';
    var roto4 = { formato: 'edu-paquete', id: 'paq_roto4', ramas: [{ clave: 'x', clase: 'tema', nombre: 'Tema suelto' }], ucs: [] };
    var nuevo = JSON.parse(JSON.stringify(AGUA)); nuevo.id = 'paq_roto5'; nuevo.ucs = [{ clave: 'n', tipo: 'concepto', titulo: 'Nuevo', rama: 'ciclo' }];
    nuevo.relaciones = [{ tipo: 'relacionado', de: 'n', a: 'uc_00000000' }];
    return rechaza(B.cargarPaquete(roto1), 'clave repetida → rechazado', function (e) { return e.errores.some(function (x) { return /repetida/.test(x.mensaje); }); })
      .then(function () { return rechaza(B.cargarPaquete(roto2), 'referencia inexistente → rechazado', function (e) { return e.errores.some(function (x) { return /no_existe/.test(x.mensaje); }); }); })
      .then(function () { return rechaza(B.cargarPaquete(roto3), 'UC inválida (fórmula sin expresión) → rechazado con su clave', function (e) { return e.errores.some(function (x) { return x.clave === 'antiguo_regimen'; }); }); })
      .then(function () { return rechaza(B.cargarPaquete(roto4), 'tema sin padre → rechazado'); })
      .then(function () { return rechaza(B.cargarPaquete(nuevo), 'id externo inexistente → rechazado', function (e) { return e.errores[0].clave === 'uc_00000000'; }); })
      .then(function () { return rechaza(B.cargarPaquete({ formato: 'otro' }), 'formato ajeno → rechazado'); })
      .then(function () { return B.estadisticas(); })
      .then(function (despues) { ok(JSON.stringify(antes) === JSON.stringify(despues), 'ningún paquete roto ha escrito nada'); });
  });
}).then(function () {
  // Alta manual y baja con relaciones
  return B.anadirUC({ tipo: 'concepto', titulo: 'Nota manual', rama: ctx.__ramas[AGUA.id].ciclo, origen: 'manual' });
}).then(function (r) {
  ok(r.ok, 'alta manual de una UC');
  return rechaza(B.anadirUC({ tipo: 'formula', titulo: 'Mal', rama: ctx.__ramas[AGUA.id].ciclo }), 'alta manual inválida → rechazada');
}).then(function () {
  var id = idUC(AGUA, 'condensacion');
  return B.relaciones(id).then(function (antes) {
    return B.borrarUC(id).then(function (r) {
      ok(r.relaciones === antes.length && antes.length > 0, 'borrarUC quita la UC y sus ' + antes.length + ' relaciones');
      return B.relaciones(id);
    }).then(function (l) { ok(l.length === 0, 'no quedan relaciones colgando'); });
  });
}).then(function () {
  return B.quitarPaquete(AGUA.id);
}).then(function (r) {
  ok(r.ok && r.cuenta.ucs === AGUA.ucs.length - 1, 'quitarPaquete borra las UC del paquete');
  return B.arbol();
}).then(function (arbol) {
  var cien = arbol.filter(function (n) { return n.nombre === 'Ciencias naturales'; })[0];
  ok(cien && cien.total === 1, 'la rama con una UC manual se conserva (no se borra contenido ajeno)');
  ok(arbol.length === 3, 'los demás paquetes siguen intactos');
  return B.estadisticas();
}).then(function (st) {
  ok(st.ucs === FRAC.ucs.length + HIST.ucs.length + 1, 'quedan ' + st.ucs + ' UC');
  ok(st.fuentes === 1, 'la fuente compartida sigue viva para los otros paquetes');
  return B.cargarPaquete(AGUA);
}).then(function (inf) {
  ok(inf.ok, 'el paquete se puede volver a cargar después de quitarlo');
  console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) {
  console.log('  ✗ excepción: ' + (e && e.message), JSON.stringify(e && e.errores));
  process.exit(1);
});
