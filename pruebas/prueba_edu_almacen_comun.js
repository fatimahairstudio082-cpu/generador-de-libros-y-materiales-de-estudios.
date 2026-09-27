/* Batería común de pruebas de edu_almacen.js.
   La usan dos lanzadores con el mismo código:
     · node pruebas/prueba_edu_almacen.js        → motor en memoria
     · pruebas/prueba_edu_almacen.html (navegador) → motor IndexedDB real
   Define PRUEBA_ALMACEN(EDU, ok) → Promise. */
(function (raiz) {
  'use strict';
  raiz.PRUEBA_ALMACEN = function (EDU, ok) {
    var A = EDU.almacen, E = EDU.esquemas;
    var mat = E.crear('rama', { clase: 'materia', nombre: 'Materia prueba' });
    var niv = E.crear('rama', { clase: 'nivel', nombre: 'Primaria', padre: mat.id, nivel: 'primaria' });
    var fue = E.crear('fuente', { clase: 'propia', titulo: 'Fuente prueba', licencia: 'propia' });
    var u1 = E.crear('uc', { tipo: 'concepto', titulo: 'Uno', rama: niv.id, fuente: fue.id, origen: 'biblioteca' });
    var u2 = E.crear('uc', { tipo: 'concepto', titulo: 'Dos', rama: niv.id, fuente: fue.id, origen: 'biblioteca' });
    var u3 = E.crear('uc', { tipo: 'ejemplo', titulo: 'Tres', proyecto: 'pro_x', origen: 'usuaria' });
    var rel = E.crear('relacion', { tipo: 'parte_de', de: u2.id, a: u1.id });
    var veces = { guardado: 0 };
    EDU.on('almacen:guardado', function () { veces.guardado++; });

    return A.vaciar({ confirmar: true }).then(function () {
      ok(A.estado().modo !== 'cerrado', 'se abre solo al primer uso (' + A.estado().modo + ')');
      return A.vaciar().then(function () { ok(false, 'vaciar sin confirmar debería fallar'); }, function () { ok(true, 'vaciar sin { confirmar: true } se rechaza'); });
    }).then(function () {
      return A.guardarVarios('rama', [mat, niv]);
    }).then(function (r) {
      ok(r.ok && r.ids.length === 2, 'guardarVarios de ramas');
      return A.guardar('fuente', fue);
    }).then(function () {
      return A.guardarVarios('uc', [u1, u2, u3]);
    }).then(function (r) {
      ok(r.ok && r.avisos.length === 0, 'guarda unidades sin avisos');
      return A.guardar('relacion', rel);
    }).then(function () {
      return A.obtener('uc', u1.id);
    }).then(function (o) {
      ok(o && o.titulo === 'Uno' && o.id === u1.id, 'obtener devuelve lo guardado');
      o.titulo = 'Cambiado fuera';
      return A.obtener('uc', u1.id);
    }).then(function (o) {
      ok(o.titulo === 'Uno', 'cambiar el objeto obtenido no altera lo guardado');
      return A.obtener('uc', 'no_existe');
    }).then(function (o) {
      ok(o === null, 'obtener de un id inexistente devuelve null');
      return A.listar('uc', { campo: 'rama', valor: niv.id });
    }).then(function (l) {
      ok(l.length === 2, 'listar por índice (rama)');
      return A.listar('uc', { campo: 'proyecto', valor: 'pro_x' });
    }).then(function (l) {
      ok(l.length === 1 && l[0].id === u3.id, 'listar por proyecto');
      return A.listar('relacion', { campo: 'de', valor: u2.id });
    }).then(function (l) {
      ok(l.length === 1, 'listar relaciones por origen');
      return A.listar('rama', { campo: 'padre', valor: null });
    }).then(function (l) {
      ok(l.length === 1 && l[0].id === mat.id, 'listar ramas sin padre (materias)');
      var mala = E.crear('uc', { tipo: 'formula', titulo: 'Sin expresión', rama: niv.id });
      var buena = E.crear('uc', { tipo: 'concepto', titulo: 'Buena', rama: niv.id });
      return A.guardarVarios('uc', [buena, mala]).then(function () { ok(false, 'debería rechazar'); }, function (e) {
        ok(e.errores && e.errores.length === 1 && e.errores[0].indice === 1, 'rechaza la lista e indica qué elemento falla');
        return A.obtener('uc', buena.id).then(function (o) { ok(o === null, 'si uno falla, no se guarda ninguno'); });
      });
    }).then(function () {
      return A.guardar('pieza', {}).then(function () { ok(false, 'pieza no tiene almacén'); }, function () { ok(true, 'un tipo sin almacén se rechaza'); });
    }).then(function () {
      return A.guardar('uc', E.crear('uc', { tipo: 'concepto', titulo: 'Sin fuente', rama: niv.id, origen: 'biblioteca' }));
    }).then(function (r) {
      ok(r.ok && r.avisos.length === 1, 'guarda con avisos cuando el dato es válido pero incompleto');
      return A.contar('uc');
    }).then(function (n) {
      ok(n === 4, 'contar unidades (4)');
      return A.borrar('uc', u3.id);
    }).then(function () {
      return A.contar('uc');
    }).then(function (n) {
      ok(n === 3, 'borrar una unidad');
      ok(veces.guardado >= 5, 'emite «almacen:guardado»');
      var blob = new Blob(['hola imagen'], { type: 'image/png' });
      return A.guardarRecurso(blob, { nombre: 'foto.png', proyecto: 'pro_x' });
    }).then(function (r) {
      return A.obtenerRecurso(r.id).then(function (rec) {
        ok(rec && rec.mime === 'image/png' && rec.bytes === 11 && rec.blob && rec.blob.size === 11, 'guarda y recupera un recurso (Blob)');
        return A.guardarRecurso('no soy un blob').then(function () { ok(false, 'debería rechazar'); }, function () { ok(true, 'rechaza un recurso que no es un archivo'); });
      });
    }).then(function () {
      return A.exportar({ recursos: true });
    }).then(function (copia) {
      ok(copia.formato === 'edu-copia' && copia.datos.uc.length === 3 && copia.datos.rama.length === 2, 'exportar genera una copia completa');
      ok(copia.recursos.length === 1 && typeof copia.recursos[0].base64 === 'string' && !copia.recursos[0].blob, 'la copia lleva la imagen en base64 y sin Blob');
      var texto = JSON.stringify(copia);
      return A.vaciar({ confirmar: true }).then(function () { return A.contar('uc'); }).then(function (n) {
        ok(n === 0, 'vaciar deja el almacén a cero');
        return A.importar(JSON.parse(texto));
      });
    }).then(function (inf) {
      ok(inf.ok && inf.cuenta.uc === 3 && inf.recursos === 1, 'importar restaura datos y recursos');
      return A.listarRecursos().then(function (l) {
        return l[0].blob.text().then(function (t) { ok(t === 'hola imagen', 'la imagen restaurada es idéntica'); });
      });
    }).then(function () {
      return A.exportar().then(function (copia) {
        copia.datos.uc.push({ id: 'roto', tipo: 'inventado' });
        return A.importar(copia, { modo: 'reemplazar' }).then(function () { ok(false, 'debería rechazar'); }, function (e) {
          ok(e.errores && e.errores.length > 0, 'una copia con datos inválidos se rechaza entera');
          return A.contar('uc').then(function (n) { ok(n === 3, 'y no se ha tocado nada (ni en modo reemplazar)'); });
        });
      });
    }).then(function () {
      return A.importar({ formato: 'otra-cosa', datos: {} }).then(function () { ok(false, 'debería rechazar'); }, function () { ok(true, 'rechaza un archivo que no es una copia del sistema'); });
    }).then(function () {
      ok(A.pref('idioma', 'es') === true || A.pref('idioma') === 'es', 'guardar una preferencia');
      ok(A.pref('idioma') === 'es', 'leer una preferencia');
      A.pref('idioma', null);
      ok(A.pref('idioma') === null, 'borrar una preferencia');
      ok(A.pref('nunca_puesta') === null, 'preferencia inexistente → null');
      return A.vaciar({ confirmar: true });
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
