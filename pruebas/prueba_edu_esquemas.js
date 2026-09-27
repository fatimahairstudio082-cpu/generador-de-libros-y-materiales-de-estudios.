/* Pruebas de nucleo/edu_esquemas.js. Se ejecutan con:  node pruebas/prueba_edu_esquemas.js */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function leer(f) { return fs.readFileSync(path.join(__dirname, '..', 'nucleo', f), 'utf8'); }
var codigoBase = leer('edu_base.js');
var codigo = leer('edu_esquemas.js');

var ctx = { console: { info: function () { }, warn: function () { }, error: function () { } }, crypto: require('crypto').webcrypto, structuredClone: structuredClone };
ctx.globalThis = ctx;
vm.createContext(ctx);

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}

console.log('edu_esquemas.js');
ok(codigo.split('\n').length <= 800, 'no supera 800 líneas (' + codigo.split('\n').length + ')');

// Sin base no se carga ni rompe
var ctxSolo = { console: ctx.console }; ctxSolo.globalThis = ctxSolo; vm.createContext(ctxSolo);
vm.runInContext(codigo, ctxSolo);
ok(!ctxSolo.EDU, 'sin edu_base.js no hace nada y no lanza error');

vm.runInContext(codigoBase, ctx);
vm.runInContext(codigo, ctx);
vm.runInContext(codigo, ctx);
var EDU = ctx.EDU, E = EDU.esquemas;
ok(EDU.hay('esquemas') && EDU.modulos().filter(function (m) { return m.nombre === 'esquemas'; })[0].completo, 'se registra con su requisito «base»');
ok(E.tipos().join() === 'rama,fuente,uc,relacion,proyecto,pieza,estructura,derivado', 'ocho tipos de datos');

// Independencia de materias: ningún nombre de materia en el código
ok(!/matem|fraccion|ciencias|historia|ciclo del agua/i.test(codigo), 'el núcleo no menciona ninguna materia');

// Ramas: materia → nivel → tema → subtema
var mat = E.crear('rama', { clase: 'materia', nombre: 'Materia X' });
ok(E.validar('rama', mat).ok, 'rama materia válida');
var niv = E.crear('rama', { clase: 'nivel', nombre: 'Primaria', padre: mat.id, nivel: 'primaria' });
ok(E.validar('rama', niv).ok, 'rama nivel válida');
ok(!E.validar('rama', E.crear('rama', { clase: 'tema', nombre: 'T' })).ok, 'un tema sin padre no es válido');
ok(!E.validar('rama', E.crear('rama', { clase: 'nivel', nombre: 'N', padre: mat.id })).ok, 'una rama de nivel sin «nivel» no es válida');
ok(E.crear('rama', { clase: 'materia', nombre: 'Materia X' }).id === mat.id, 'la misma rama da el mismo id');

// Fuentes
var fue = E.crear('fuente', { clase: 'curriculo', titulo: 'Currículo', licencia: 'curriculo_oficial' });
ok(E.validar('fuente', fue).ok, 'fuente válida');
var fueDesc = E.crear('fuente', { titulo: 'Sin licencia' });
var rf = E.validar('fuente', fueDesc);
ok(rf.ok && rf.avisos.length === 1, 'licencia desconocida se admite con aviso');
ok(!E.validar('fuente', E.crear('fuente', { titulo: 'x', licencia: 'inventada' })).ok, 'licencia fuera de catálogo no es válida');

// Unidades de conocimiento
var uc = E.crear('uc', { tipo: 'concepto', titulo: 'Concepto A', rama: niv.id, fuente: fue.id, origen: 'biblioteca', niveles: ['primaria'] });
var ru = E.validar('uc', uc);
ok(ru.ok && ru.avisos.length === 0, 'UC de biblioteca completa es válida y sin avisos');
ok(uc.v === E.VERSION && uc.idioma === 'es' && uc.creado === uc.tocado, 'crear() pone versión, idioma y fechas');
ok(E.crear('uc', { tipo: 'concepto', titulo: 'concepto  a', rama: niv.id }).id === uc.id, 'la misma UC reimportada da el mismo id');
ok(!E.validar('uc', E.crear('uc', { tipo: 'formula', titulo: 'F', rama: niv.id })).ok, 'una fórmula sin expresión no es válida');
ok(E.validar('uc', E.crear('uc', { tipo: 'formula', titulo: 'F', rama: niv.id, campos: { expresion: 'a/b' } })).ok, 'una fórmula con expresión es válida');
ok(!E.validar('uc', E.crear('uc', { tipo: 'procedimiento', titulo: 'P', rama: niv.id, campos: { pasos: [] } })).ok, 'un procedimiento sin pasos no es válido');
ok(E.validar('uc', E.crear('uc', { tipo: 'procedimiento', titulo: 'P', rama: niv.id, campos: { pasos: ['uno', 'dos'] } })).ok, 'un procedimiento con pasos es válido');
ok(!E.validar('uc', E.crear('uc', { tipo: 'fecha', titulo: 'Periodo', rama: niv.id })).ok, 'una fecha sin «fecha» no es válida');
ok(!E.validar('uc', E.crear('uc', { tipo: 'concepto', titulo: 'B', origen: 'biblioteca' })).ok, 'UC de biblioteca sin rama no es válida');
var sinFuente = E.validar('uc', E.crear('uc', { tipo: 'concepto', titulo: 'C', rama: niv.id, origen: 'biblioteca' }));
ok(sinFuente.ok && sinFuente.avisos.length === 1, 'UC de biblioteca sin fuente: válida con aviso');
ok(!E.validar('uc', E.crear('uc', { tipo: 'concepto', titulo: 'D', rama: niv.id, niveles: ['guarderia'] })).ok, 'nivel desconocido no es válido');
ok(!E.validar('uc', E.crear('uc', { tipo: 'rumor', titulo: 'E', rama: niv.id })).ok, 'tipo de UC desconocido no es válido');
ok(!E.validar('uc', E.crear('uc', { tipo: 'concepto', titulo: '  ', rama: niv.id })).ok, 'título vacío no es válido');

// Relaciones
var uc2 = E.crear('uc', { tipo: 'concepto', titulo: 'Concepto B', rama: niv.id });
var rel = E.crear('relacion', { tipo: 'parte_de', de: uc2.id, a: uc.id });
ok(E.validar('relacion', rel).ok, 'relación válida');
ok(!E.validar('relacion', E.crear('relacion', { tipo: 'parte_de', de: uc.id, a: uc.id })).ok, 'relación consigo misma no es válida');
ok(E.idRelacion('contrasta_con', uc.id, uc2.id) === E.idRelacion('contrasta_con', uc2.id, uc.id), 'relación simétrica: mismo id en ambos sentidos');
ok(E.idRelacion('parte_de', uc.id, uc2.id) !== E.idRelacion('parte_de', uc2.id, uc.id), 'relación dirigida: ids distintos por sentido');
var rp = E.relacion('parte_de');
ok(rp.transitiva && rp.inversa === 'tiene_parte' && !rp.simetrica, 'reglas de relación disponibles');

// Proyecto
var pro = E.crear('proyecto', { titulo: 'Proyecto', ucs: [uc.id] });
ok(E.validar('proyecto', pro).ok && typeof pro.semilla === 'number', 'proyecto válido con semilla');
pro.modulos = [{ id: 'm1', titulo: 'Módulo 1', ucs: [uc.id] }, { titulo: 'sin id' }];
ok(!E.validar('proyecto', pro).ok, 'módulo mal formado no es válido');

// Piezas: garantía de no inventar
ok(E.validar('pieza', E.crear('pieza', { clase: 'definicion' })).ok, 'pieza pendiente sin origen es válida');
ok(!E.validar('pieza', E.crear('pieza', { clase: 'definicion', estado: 'con_respaldo' })).ok, 'pieza con contenido sin «desde» NO es válida');
ok(E.validar('pieza', E.crear('pieza', { clase: 'definicion', estado: 'con_respaldo', desde: [uc.id] })).ok, 'pieza con contenido y origen es válida');
ok(!E.validar('pieza', E.crear('pieza', { clase: 'visualizacion', estado: 'parcial', desde: [uc.id], datos: {} })).ok, 'visualización sin forma de dato no es válida');
ok(E.validar('pieza', E.crear('pieza', { clase: 'visualizacion', estado: 'parcial', desde: [uc.id], datos: { forma: 'jerarquia' } })).ok, 'visualización con forma de dato es válida');

// Estructura
var est = E.crear('estructura', { raiz: uc.id, piezas: [
  E.crear('pieza', { clase: 'concepto', estado: 'con_respaldo', desde: [uc.id] }),
  E.crear('pieza', { clase: 'ejemplo' })
] });
var re = E.validar('estructura', est);
ok(re.ok && re.avisos.length === 1, 'estructura válida que avisa de piezas pendientes');
est.piezas.push({ id: 'x', clase: 'ejemplo', estado: 'con_respaldo', desde: [], datos: {} });
ok(!E.validar('estructura', est).ok, 'estructura con una pieza inventada no es válida');

// Derivado
ok(E.validar('derivado', E.crear('derivado', { proyecto: pro.id, perfil: 'resumen' })).ok, 'derivado válido');

// Formas de dato enlazadas con familias de los motores heredados
var fd = E.catalogo('formasDato');
ok(fd.jerarquia.familias.indexOf('mapa') >= 0 && fd.simetria.familias[0] === 'mandala', 'formas de dato enlazadas con familias visuales');

// Catálogos: copia y ampliación sin sobrescribir
var niveles = E.catalogo('niveles'); niveles.primaria.rango = 99;
ok(E.catalogo('niveles').primaria.rango === 2, 'catalogo() devuelve una copia');
ok(E.compararNivel('primaria', 'universidad') < 0 && E.compararNivel('fp', 'bachillerato') === 0, 'compararNivel()');
ok(E.ampliar('tiposUC', 'teorema', { nombre: 'Teorema', campos: ['expresion'] }), 'ampliar un catálogo con una entrada nueva');
ok(!E.validar('uc', E.crear('uc', { tipo: 'teorema', titulo: 'T', rama: niv.id })).ok, 'la entrada nueva aplica sus campos obligatorios');
ok(!E.ampliar('tiposUC', 'concepto', { nombre: 'Otro' }), 'ampliar no sobrescribe una entrada existente');
ok(!E.ampliar('tiposUC', 'Mal Nombre', { nombre: 'x' }), 'ampliar rechaza claves no válidas');

// Entradas incorrectas
ok(!E.validar('nada', {}).ok && !E.validar('uc', null).ok, 'tipo desconocido o nulo no es válido');
ok(E.crear('nada', {}) === null, 'crear() de tipo desconocido devuelve null');
var datos = { tipo: 'concepto', titulo: 'Z', rama: niv.id };
E.crear('uc', datos);
ok(datos.id === undefined, 'crear() no altera el objeto de entrada');

console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
process.exit(fallos ? 1 : 0);
