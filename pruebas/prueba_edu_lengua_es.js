/* Pruebas de redaccion/edu_lengua_es.js.
   Se ejecutan con:  node pruebas/prueba_edu_lengua_es.js */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function leer(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }
var codigo = leer('redaccion/edu_lengua_es.js');
var ctx = { console: { info: function () { }, warn: function () { }, error: function () { } }, crypto: require('crypto').webcrypto, structuredClone: structuredClone };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(leer('nucleo/edu_base.js'), ctx);
vm.runInContext(codigo, ctx);
vm.runInContext(codigo, ctx);
var EDU = ctx.EDU, L = EDU.lenguas.es;

var fallos = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallos++; console.log('  ✗ ' + nombre); } else console.log('  ✓ ' + nombre);
}
function igual(obtenido, esperado, nombre) { ok(obtenido === esperado, nombre + ': «' + obtenido + '»' + (obtenido === esperado ? '' : ' (esperado «' + esperado + '»)')); }

console.log('edu_lengua_es.js');
ok(codigo.split('\n').length <= 800, 'no supera 800 líneas (' + codigo.split('\n').length + ')');
ok(EDU.modulos().filter(function (m) { return m.nombre === 'lengua_es'; }).length === 1 && EDU.hay('lengua_es'), 'se registra una vez como «lengua_es» en EDU.lenguas.es');
ok(!/matem|fraccion|ciencias|historia|revoluc|bastilla|evapora/i.test(codigo), 'el paquete no contiene contenidos de ninguna materia');

console.log(' · Acentuación y plurales');
[['casa', 'casas'], ['árbol', 'árboles'], ['canción', 'canciones'], ['examen', 'exámenes'], ['país', 'países'], ['raíz', 'raíces'],
 ['lápiz', 'lápices'], ['luz', 'luces'], ['autobús', 'autobuses'], ['sofá', 'sofás'], ['rubí', 'rubíes'], ['ley', 'leyes'],
 ['crisis', 'crisis'], ['lunes', 'lunes'], ['tórax', 'tórax'], ['mes', 'meses'], ['sol', 'soles'], ['carácter', 'caracteres'],
 ['régimen', 'regímenes'], ['Fracción', 'Fracciones'], ['Estado', 'Estados'], ['joven', 'jóvenes'], ['origen', 'orígenes'], ['virus', 'virus']
].forEach(function (c) { igual(L.pluralizar(c[0]), c[1], 'plural de «' + c[0] + '»'); });
igual(L.acentuar('camion', 4), 'camión', 'acentuar aguda en -n');
igual(L.acentuar('arbol', 0), 'árbol', 'acentuar llana en consonante');

console.log(' · Género y número');
[['Evaporación', 'f', true], ['Ciclo', 'm', true], ['Energía', 'f', true], ['Numerador', 'm', true], ['Sociedad', 'f', true],
 ['Reunión', 'f', true], ['avión', 'm', true], ['mapa', 'm', true], ['día', 'm', true], ['mano', 'f', true], ['nube', 'f', true],
 ['Estados', 'm', true], ['Temperaturas', 'f', true], ['crisis', 'f', true], ['análisis', 'm', true], ['Golpe', 'm', false], ['paisaje', 'm', true]
].forEach(function (c) { var g = L.genero(c[0]); ok(g.genero === c[1] && g.seguro === c[2], 'género de «' + c[0] + '»: ' + g.genero + (g.seguro ? '' : ' (no seguro)')); });
ok(L.numero('Estados').numero === 'pl' && L.numero('crisis').numero === 'sg' && L.numero('Ciclo').numero === 'sg', 'número: Estados (pl), crisis (sg), Ciclo (sg)');
ok(L.ponerGenero('golpe', 'm') && L.genero('Golpe').seguro, 'ponerGenero añade una excepción y la vuelve segura');
ok((function () { try { L.ponerGenero('x', 'n'); return false; } catch (e) { return true; } })(), 'ponerGenero rechaza un género no válido');

console.log(' · Sintagmas con los títulos reales de los paquetes');
[['Ciclo del agua', 'el ciclo del agua'], ['Evaporación', 'la evaporación'], ['Estados del agua', 'los estados del agua'],
 ['Energía del Sol', 'la energía del Sol'], ['Temperaturas de cambio del agua', 'las temperaturas de cambio del agua'],
 ['La lluvia', 'la lluvia'], ['Un charco que se seca', 'un charco que se seca'], ['Gotas en un vaso frío', 'las gotas en un vaso frío'],
 ['Observar la evaporación', 'observar la evaporación'], ['Fracción propia', 'la fracción propia'], ['Numerador', 'el numerador'],
 ['Sumar fracciones con igual denominador', 'sumar fracciones con igual denominador'], ['Toma de la Bastilla', 'la toma de la Bastilla'],
 ['Revolución francesa', 'la Revolución francesa'.replace('R', 'r')], ['Luis XVI', 'Luis XVI'], ['Napoleón Bonaparte', 'Napoleón Bonaparte'],
 ['Maximilien Robespierre', 'Maximilien Robespierre'], ['El Terror', 'el Terror'], ['El Directorio', 'el Directorio'],
 ['Tercer estado', 'el tercer estado'], ['Declaración de los Derechos del Hombre y del Ciudadano', 'la declaración de los Derechos del Hombre y del Ciudadano'],
 ['Agua', 'el agua'], ['Aguas', 'las aguas'], ['ADN', 'el ADN']
].forEach(function (c) { igual(L.sintagma(c[0]).texto, c[1], 'sintagma «' + c[0] + '»'); });
igual(L.sintagma('Evaporación', { articulo: 'indefinido' }).texto, 'una evaporación', 'artículo indefinido');
igual(L.sintagma('Agua', { articulo: 'indefinido' }).texto, 'un agua', '«un» ante a tónica');
igual(L.sintagma('Ciclo del agua', { inicio: true }).texto, 'El ciclo del agua', 'mayúscula al abrir oración');
igual(L.sintagma('Ciclo del agua', { articulo: 'ninguno' }).texto, 'ciclo del agua', 'sin artículo');
ok(L.analizar('Luis XVI').propio && !L.analizar('Toma de la Bastilla').propio && !L.analizar('Energía del Sol').propio, 'propios: «Luis XVI» sí; «Toma de la Bastilla» y «Energía del Sol» no');
ok(L.analizar('Observar la evaporación').infinitivo && !L.analizar('Tercer estado').infinitivo && !L.analizar('Líder').infinitivo && !L.analizar('Lugar').infinitivo, 'infinitivos: «Observar» sí; «Tercer», «Líder», «Lugar» no');
ok(L.sintagma('Ciclo del agua').seguro === true && L.sintagma('Cauce del río').seguro === false, 'el sintagma informa si el género era seguro («cauce»: no seguro)');
ok(L.ponerPropio('Revolución francesa') && L.sintagma('Revolución francesa').texto === 'Revolución francesa', 'ponerPropio: se respeta la mayúscula y no lleva artículo');

console.log(' · Contracciones y listas');
igual(L.contraer('parte de el ciclo y va a el mar'), 'parte del ciclo y va al mar', 'contraer de el / a el');
igual(L.contraer('para el ciclo; De el mar; A el fin'), 'para el ciclo; Del mar; Al fin', 'contraer respeta «para el» y las mayúsculas');
igual(L.contraer('viaje a El Salvador'), 'viaje a El Salvador', 'no contrae ante un nombre propio con «El»');
igual(L.unirLista(['agua', 'aire', 'hielo']), 'agua, aire y hielo', 'lista con «y»');
igual(L.unirLista(['padres', 'hijos']), 'padres e hijos', '«y» → «e» ante hi-');
igual(L.unirLista(['agua', 'hierro']), 'agua y hierro', 'hie- mantiene «y»');
igual(L.unirLista(['siete', 'ocho'], 'o'), 'siete u ocho', '«o» → «u» ante o-');
igual(L.unirLista(['uno']), 'uno', 'lista de un elemento');

console.log(' · Concordancia');
igual(L.concordar('relacionado', 'f', 'pl'), 'relacionadas', 'relacionado → f pl');
igual(L.concordar('francés', 'f', 'sg'), 'francesa', 'francés → francesa');
igual(L.concordar('trabajador', 'f', 'pl'), 'trabajadoras', 'trabajador → trabajadoras');
igual(L.concordar('mayor', 'f', 'sg'), 'mayor', 'mayor no cambia de género');
igual(L.concordar('importante', 'f', 'pl'), 'importantes', 'importante → importantes');
igual(L.concordar('común', 'm', 'pl'), 'comunes', 'común → comunes (pierde la tilde)');

console.log(' · Verbos');
[['formar', 'presente', 3, 'sg', 'forma'], ['formar', 'presente', 3, 'pl', 'forman'], ['ser', 'presente', 3, 'pl', 'son'],
 ['estar', 'presente', 3, 'sg', 'está'], ['tener', 'presente', 3, 'pl', 'tienen'], ['incluir', 'presente', 3, 'sg', 'incluye'],
 ['incluir', 'presente', 1, 'pl', 'incluimos'], ['requerir', 'presente', 3, 'sg', 'requiere'], ['poder', 'presente', 3, 'sg', 'puede'],
 ['volver', 'presente', 3, 'sg', 'vuelve'], ['pedir', 'presente', 3, 'sg', 'pide'], ['pedir', 'preterito', 3, 'sg', 'pidió'],
 ['comer', 'imperfecto', 3, 'pl', 'comían'], ['vivir', 'futuro', 1, 'sg', 'viviré'], ['tener', 'futuro', 3, 'sg', 'tendrá'],
 ['buscar', 'preterito', 1, 'sg', 'busqué'], ['empezar', 'preterito', 1, 'sg', 'empecé'], ['leer', 'preterito', 3, 'sg', 'leyó'],
 ['construir', 'preterito', 3, 'pl', 'construyeron'], ['ser', 'preterito', 3, 'sg', 'fue'], ['formarse', 'presente', 3, 'sg', 'se forma'],
 ['diferenciarse', 'presente', 3, 'pl', 'se diferencian'], ['producir', 'presente', 1, 'sg', 'produzco']
].forEach(function (c) { igual(L.conjugar(c[0], c[1], c[2], c[3]), c[4], c[0] + ' · ' + c[1] + ' ' + c[2] + c[3]); });

console.log(' · Conectores');
ok(L.conector('causa', 'primaria', 0) === 'Por eso' && L.conector('causa', 'universidad', 0) === 'Por ello', 'registro sencillo en primaria y formal en universidad');
ok(L.conector('secuencia', 'secundaria', 5) === L.conectores('secuencia', 'secundaria')[5 % 4], 'el índice da la vuelta (para la variación)');
ok(L.tiposConector().length === 9, '9 tipos de conector');
ok((function () { try { L.conector('inventado'); return false; } catch (e) { return true; } })(), 'tipo de conector desconocido → error');

console.log(' · Oraciones de relación (solo expresan la relación dada)');
function frase(tipo, i, de, a) { return L.oracion(L.plantillasRelacion(tipo)[i], { de: de, a: a }).texto; }
igual(frase('parte_de', 0, 'Evaporación', 'Ciclo del agua'), 'La evaporación forma parte del ciclo del agua.', 'parte_de');
igual(frase('parte_de', 0, 'Estados del agua', 'Ciclo del agua'), 'Los estados del agua forman parte del ciclo del agua.', 'parte_de concuerda en plural');
igual(frase('parte_de', 1, 'Evaporación', 'Ciclo del agua'), 'El ciclo del agua incluye la evaporación.', 'parte_de (voz inversa)');
igual(frase('es_un', 0, 'Fracción propia', 'Fracción'), 'La fracción propia es un tipo de fracción.', 'es_un');
igual(frase('causa', 0, 'Energía del Sol', 'Evaporación'), 'La energía del Sol provoca la evaporación.', 'causa');
igual(frase('antes_de', 0, 'Toma de la Bastilla', 'Proclamación de la República'), 'La toma de la Bastilla tiene lugar antes de la proclamación de la República.', 'antes_de');
igual(frase('requiere', 1, 'Ciclo del agua', 'Estados del agua'), 'Para comprender el ciclo del agua hay que conocer los estados del agua.', 'requiere (impersonal)');
igual(frase('ejemplo_de', 0, 'La lluvia', 'Precipitación'), 'La lluvia es un ejemplo de precipitación.', 'ejemplo_de');
igual(frase('relacionado', 0, 'Composición de las nubes', 'Condensación'), 'La composición de las nubes está relacionada con la condensación.', 'relacionado concuerda el participio');
igual(frase('contrasta_con', 1, 'Evaporación', 'Condensación'), 'La evaporación se diferencia de la condensación.', 'contrasta_con (pronominal)');
igual(frase('relacionado', 0, 'Luis XVI', 'Reunión de los Estados Generales'), 'Luis XVI está relacionado con la reunión de los Estados Generales.', 'nombre propio como sujeto');
ok(Object.keys({ es_un: 1, parte_de: 1, causa: 1, antes_de: 1, requiere: 1, define: 1, ejemplo_de: 1, propiedad_de: 1, contrasta_con: 1, relacionado: 1 }).every(function (t) { return L.plantillasRelacion(t).length >= 1; }), 'hay plantillas para las 10 relaciones del catálogo');
var inc = L.oracion(L.plantillasRelacion('relacionado')[0], { de: 'Cauce del río', a: 'Ciclo del agua' });
ok(inc.seguro === false, 'la oración avisa (seguro:false) si un género no era seguro');
ok(/cauce del río/i.test(inc.texto) && /ciclo del agua/.test(inc.texto), 'y aun así solo usa los títulos recibidos: «' + inc.texto + '»');

console.log(' · Texto');
igual(L.puntuar('Hola'), 'Hola.', 'puntuar añade punto');
igual(L.puntuar('¿Qué es?'), '¿Qué es?', 'puntuar respeta la interrogación');
igual(L.minusculaInicial('Ciclo del agua'), 'ciclo del agua', 'minúscula inicial');
igual(L.capitalizar('evaporación'), 'Evaporación', 'capitalizar');

ok(EDU.incidencias('error').length === 0, 'sin errores internos');
console.log('\n' + (total - fallos) + '/' + total + ' pruebas correctas');
process.exit(fallos ? 1 : 0);
