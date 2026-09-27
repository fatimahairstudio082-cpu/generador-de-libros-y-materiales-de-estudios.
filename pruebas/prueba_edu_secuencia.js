/* Pruebas de expansion/edu_secuencia.js con los tres paquetes reales.
   Se ejecutan con:  node pruebas/prueba_edu_secuencia.js   (almacén en memoria) */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function leer(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }
function paquete(f) { return JSON.parse(leer('datos/biblioteca/' + f)); }
var codigo = leer('expansion/edu_secuencia.js');

var ctx = {
  console: { info: function () { }, warn: function () { }, error: function () { } },
  crypto: require('crypto').webcrypto, structuredClone: structuredClone,
  Blob: Blob, btoa: btoa, atob: atob, Promise: Promise, Uint8Array: Uint8Array
};
ctx.globalThis = ctx;
vm.createContext(ctx);
['nucleo/edu_base.js', 'nucleo/edu_esquemas.js', 'nucleo/edu_almacen.js', 'conocimiento/edu_biblioteca.js', 'expansion/edu_expansor.js'].forEach(function (f) { vm.runInContext(leer(f), ctx); });
vm.runInContext(codigo, ctx);
vm.runInContext(codigo, ctx);
var EDU = ctx.EDU, S = EDU.secuencia, X = EDU.expansor, A = EDU.almacen, B = EDU.biblioteca;

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}
function buscarUC(t) { return B.buscar(t).then(function (l) { return l.filter(function (u) { return u.titulo === t; })[0]; }); }
function titulos(sec) { return sec.modulos.map(function (m) { return m.titulo; }); }
function idsDe(sec) {
  var r = [];
  sec.modulos.forEach(function (m) { m.fases.forEach(function (f) { r = r.concat(f.piezas); }); });
  sec.sintesis.fases.forEach(function (f) { r = r.concat(f.piezas); });
  return r;
}
function ramaPorNombre(n) { return A.listar('rama').then(function (l) { return l.filter(function (r) { return r.nombre === n; })[0]; }); }

console.log('edu_secuencia.js');
ok(codigo.split('\n').length <= 800, 'no supera 800 líneas (' + codigo.split('\n').length + ')');
ok(EDU.modulos().filter(function (m) { return m.nombre === 'secuencia'; }).length === 1, 'la doble carga no duplica el módulo');
ok(!/matem|fraccion|ciencias|historia|agua|revoluc|bastilla/i.test(codigo), 'el código no menciona ninguna materia');
ok(S.verbos('primaria').definir === 'Definir' && S.verbos('universidad').comparar === 'Contrastar' && S.verbos('infantil').definir === 'Nombrar', 'tabla de verbos por nivel');

var estCiclo, secCiclo;
A.abrir({ memoria: true }).then(function () {
  return ['ciencias_primaria_agua.json', 'matematicas_primaria_fracciones.json', 'historia_secundaria_revolucion_francesa.json']
    .reduce(function (p, f) { return p.then(function () { return B.cargarPaquete(paquete(f)); }); }, Promise.resolve());
}).then(function () {
  return buscarUC('Ciclo del agua').then(function (u) { return X.expandir(u.id); });
}).then(function (est) {
  estCiclo = est;
  secCiclo = S.secuenciar(est);
  var t = titulos(secCiclo);
  ok(t[0] === 'Ciclo del agua', 'CICLO · el todo va primero: ' + t.join(' → '));
  ok(t.indexOf('Evaporación') < t.indexOf('Condensación') && t.indexOf('Transpiración') < t.indexOf('Condensación') && t.indexOf('Condensación') < t.indexOf('Precipitación') && t.indexOf('Precipitación') < t.indexOf('Escorrentía') && t.indexOf('Precipitación') < t.indexOf('Infiltración'), 'respeta todas las relaciones «antes de»');
  var ids = idsDe(secCiclo);
  ok(ids.length === est.piezas.length && ids.every(function (id, i) { return ids.indexOf(id) === i; }), 'CONSERVACIÓN: las ' + est.piezas.length + ' piezas aparecen exactamente una vez');
  ok(S.verificar(secCiclo, est).ok, 'verificar() confirma la secuencia');
  var evap = secCiclo.modulos.filter(function (m) { return m.titulo === 'Evaporación'; })[0];
  var fases = evap.fases.map(function (f) { return f.fase; });
  ok(fases[0] === 'subconcepto' && fases.indexOf('definicion') < fases.indexOf('ejemplo') && fases.indexOf('ejemplo') < fases.indexOf('pregunta'), 'fases del módulo en orden pedagógico: ' + fases.join(', '));
  var causa = est.piezas.filter(function (p) { return p.clase === 'relacion' && p.datos.tipo === 'causa'; })[0];
  ok(evap.fases.some(function (f) { return f.piezas.indexOf(causa.id) >= 0; }), 'la causa externa (Energía del Sol) se explica en el módulo de Evaporación');
  var ops = evap.objetivos.map(function (o) { return o.operacion; });
  ok(ops.join(',') === 'definir,ejemplificar,explicar_causas', 'objetivos de Evaporación sostenidos por sus piezas: ' + ops.join(', '));
  var cond = secCiclo.modulos.filter(function (m) { return m.titulo === 'Condensación'; })[0];
  ok(cond.objetivos.some(function (o) { return o.operacion === 'comparar'; }), '«comparar» va a Condensación: el contraste se explica cuando ya se conocen las dos');
  ok(evap.objetivos.every(function (o) { return o.verbo && o.objeto.titulo === 'Evaporación' && o.desde.length; }), 'cada objetivo: verbo del nivel + unidad copiada + piezas que lo sostienen');
  var raizMod = secCiclo.modulos[0];
  ok(raizMod.objetivos.some(function (o) { return o.operacion === 'descomponer' && o.desde.length === 6; }), 'la raíz tiene «descomponer» sostenido por sus 6 partes');
  var escorr = secCiclo.modulos.filter(function (m) { return m.titulo === 'Escorrentía'; })[0];
  ok(escorr.pendientes === 1 && !escorr.objetivos.some(function (o) { return o.operacion === 'ejemplificar'; }), 'sin ejemplo real no se propone «ejemplificar» (el ejemplo sigue pendiente)');
  var rel = est.piezas.filter(function (p) { return p.clase === 'relacion' && p.datos.tipo === 'antes_de' && p.datos.de.titulo === 'Condensación'; })[0];
  var prec = secCiclo.modulos.filter(function (m) { return m.titulo === 'Precipitación'; })[0];
  ok(prec.fases.some(function (f) { return f.piezas.indexOf(rel.id) >= 0; }), 'una relación entre dos unidades va a la última de ellas (Precipitación)');
  var sfases = secCiclo.sintesis.fases.map(function (f) { return f.fase; });
  ok(sfases.indexOf('repaso') >= 0 && sfases.indexOf('visualizacion') >= 0, 'síntesis final con visualizaciones y repaso');
  var sops = secCiclo.sintesis.objetivos.map(function (o) { return o.operacion; });
  ok(sops.join(',') === 'clasificar,secuenciar,relacionar,repasar', 'objetivos de síntesis: ' + sops.join(', '));
  ok(secCiclo.requisitosPrevios.length === 1 && secCiclo.requisitosPrevios[0].titulo === 'Estados del agua', 'requisito previo citado sin desarrollar: Estados del agua');
  var s2 = S.secuenciar(est);
  ok(JSON.stringify(s2) === JSON.stringify(secCiclo), 'determinista: la misma entrada da la misma secuencia');
  // No se inventa texto: todo título de la secuencia viene de las piezas
  var textos = {};
  est.piezas.forEach(function (p) { JSON.stringify(p.datos).replace(/"([^"]*)"/g, function (_, s) { textos[s] = true; }); });
  var verbosTodos = {};
  Object.keys(S.verbos('primaria')).forEach(function (k) { verbosTodos[S.verbos('primaria')[k]] = true; });
  var malos = [];
  secCiclo.modulos.forEach(function (m) {
    if (!textos[m.titulo]) malos.push(m.titulo);
    m.objetivos.forEach(function (o) { if (!textos[o.objeto.titulo]) malos.push(o.objeto.titulo); if (!verbosTodos[o.verbo]) malos.push(o.verbo); });
  });
  ok(malos.length === 0, 'NO INVENCIÓN: títulos copiados de las piezas y verbos de la tabla' + (malos.length ? ' → ' + malos.join(', ') : ''));
}).then(function () {
  // Rama completa: el requisito entra en la secuencia y va antes
  return ramaPorNombre('El agua').then(function (r) { return X.expandirRama(r.id); });
}).then(function (ests) {
  var sec = S.secuenciar(ests);
  var t = titulos(sec);
  ok(t.indexOf('Estados del agua') >= 0 && t.indexOf('Estados del agua') < t.indexOf('Ciclo del agua'), 'RAMA · «Ciclo requiere Estados»: Estados va antes → ' + t.slice(0, 4).join(' → ') + '…');
  ok(sec.requisitosPrevios.length === 0, 'dentro de la rama ya no hay requisitos externos');
  ok(S.verificar(sec, ests).ok, 'conservación con varias estructuras (piezas compartidas una sola vez)');
  return buscarUC('Revolución francesa').then(function (u) { return X.expandir(u.id); });
}).then(function (est) {
  var sec = S.secuenciar(est);
  var t = titulos(sec);
  ok(t[0] === 'Revolución francesa' && t.indexOf('Reunión de los Estados Generales') < t.indexOf('Toma de la Bastilla') && t.indexOf('Toma de la Bastilla') < t.indexOf('Golpe de Estado de Napoleón'), 'REVOLUCIÓN · las etapas siguen el orden temporal');
  var bast = sec.modulos.filter(function (m) { return m.titulo === 'Toma de la Bastilla'; })[0];
  ok(bast.objetivos.some(function (o) { return o.operacion === 'situar' && o.verbo === 'Situar cronológicamente'; }), 'una fecha tiene objetivo «situar» con el verbo de secundaria');
  ok(S.verificar(sec, est).ok && idsDe(sec).length === est.piezas.length, 'conservación en historia');
  // Recorte por profundidad
  var corta = S.secuenciar(est, { profundidad: 0 });
  ok(corta.modulos.length === 1 && corta.recortadas.length > 0 && S.verificar(corta, est).ok, 'profundidad 0: un solo módulo; lo recortado no aparece (' + corta.recortadas.length + ' piezas)');
  var sinPreg = S.secuenciar(est, { excluirClases: ['pregunta'] });
  ok(idsDe(sinPreg).every(function (id) { return est.piezas.filter(function (p) { return p.id === id; })[0].clase !== 'pregunta'; }) && S.verificar(sinPreg, est).ok, 'excluirClases quita una clase entera sin romper la conservación');
  return buscarUC('Fracción').then(function (u) { return X.expandir(u.id); });
}).then(function (est) {
  var sec = S.secuenciar(est);
  var t = titulos(sec);
  ok(t[0] === 'Fracción' && S.verificar(sec, est).ok, 'FRACCIONES · la fracción primero y secuencia coherente: ' + t.join(' → '));
}).then(function () {
  // Conflicto: un requisito que contradice la jerarquía se ignora y se avisa
  var est = JSON.parse(JSON.stringify(estCiclo));
  var raizId = est.raiz, evap = est.piezas.filter(function (p) { return p.clase === 'subconcepto' && p.datos.titulo === 'Evaporación'; })[0].datos.uc;
  est.piezas.push({ id: 'pz_conflicto', clase: 'relacion', estado: 'con_respaldo', desde: ['rel_x', raizId, evap], datos: { tipo: 'requiere', de: { uc: raizId, titulo: 'Ciclo del agua' }, a: { uc: evap, titulo: 'Evaporación' } } });
  var sec = S.secuenciar(est);
  ok(sec.avisos.length === 0 && titulos(sec).indexOf('Evaporación') < titulos(sec).indexOf('Ciclo del agua'), 'un requisito explícito tiene prioridad sobre la jerarquía');
  est.piezas.push({ id: 'pz_conflicto2', clase: 'relacion', estado: 'con_respaldo', desde: ['rel_y', raizId, evap], datos: { tipo: 'requiere', de: { uc: evap, titulo: 'Evaporación' }, a: { uc: raizId, titulo: 'Ciclo del agua' } } });
  var sec2 = S.secuenciar(est);
  ok(sec2.avisos.length === 1 && /contradice/.test(sec2.avisos[0]), 'dos requisitos contradictorios: se aplica el primero y se avisa del otro');
}).then(function () {
  var pro = EDU.esquemas.crear('proyecto', { titulo: 'Proyecto de prueba' });
  return A.guardar('proyecto', pro).then(function () { return S.aplicarAProyecto(pro.id, secCiclo); }).then(function () { return A.obtener('proyecto', pro.id); });
}).then(function (pro) {
  ok(pro.modulos.length === secCiclo.modulos.length && pro.modulos[0].titulo === 'Ciclo del agua', 'aplicarAProyecto guarda los módulos en el Proyecto Maestro');
  ok(EDU.esquemas.validar('proyecto', pro).ok && pro.ucs.length >= secCiclo.modulos.length && pro.secuencia === secCiclo.id, 'el proyecto sigue cumpliendo el contrato y reúne sus UC');
}).then(function () {
  try { S.secuenciar([]); ok(false, 'debería fallar'); } catch (e) { ok(/No hay estructuras/.test(e.message), 'sin estructuras → error claro'); }
  ok(EDU.incidencias('error').length === 0, 'sin errores internos');
  console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
  process.exit(fallos ? 1 : 0);
}).catch(function (e) {
  console.log('  ✗ excepción: ' + (e && e.message), JSON.stringify(e && e.errores));
  process.exit(1);
});
