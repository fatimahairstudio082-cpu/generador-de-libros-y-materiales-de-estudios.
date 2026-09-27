/* edu_lengua_es.js — paquete de lengua: español.
   Módulo 10 de la fase 1. Requiere edu_base.js.

   Solo gramática: no contiene hechos de ninguna materia. El redactor lo
   usa para escribir bien lo que ya está en los datos. Es intercambiable:
   otro idioma sería otro paquete con la misma interfaz (EDU.lenguas.xx).

     Sustantivos   genero(palabra) · numero(palabra) · pluralizar(palabra)
     Sintagmas     analizar(titulo) · sintagma(titulo, {articulo, inicio}) · articulo(g, n, tipo, palabra)
     Enlaces       contraer(texto) · unirLista(items, 'y'|'o')
     Adjetivos     concordar(adjetivo, genero, numero)
     Verbos        conjugar(infinitivo, tiempo, persona, numero)
     Discurso      conector(tipo, nivel, i) · conectores(tipo, nivel)
     Oraciones     plantillasRelacion(tipo) · oracion(plantilla, huecos)
     Texto         capitalizar · minusculaInicial · puntuar · acentuar
     Léxico        ponerGenero(palabra, 'm'|'f') · ponerPropio(nombre)

   Cuando no se puede saber algo con seguridad (el género de una palabra
   que no sigue ninguna regla) se devuelve seguro:false en vez de adivinar. */
(function (raiz) {
  'use strict';
  var EDU = raiz.EDU;
  if (!EDU || !EDU._base) { if (raiz.console) raiz.console.error('[lengua_es] Falta edu_base.js'); return; }
  EDU.lenguas = EDU.lenguas || {};
  if (EDU.lenguas.es) return;

  /* ───────────────────────── Letras y acentos ───────────────────────── */

  var VOCALES = 'aeiouáéíóúü';
  var FUERTES = 'aeoáéó';
  var CON_TILDE = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u' };
  var PONER_TILDE = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };

  function esVocal(c) { return VOCALES.indexOf(c) >= 0; }
  function quitarTildes(s) { return s.replace(/[áéíóú]/g, function (c) { return CON_TILDE[c]; }); }
  function minus(s) { return String(s || '').toLowerCase(); }

  /* Núcleos silábicos de una palabra: [{ ini, fin }] (índices de sus vocales).
     Diptongo: débil átona + otra vocal, o dos débiles. Hiato: dos fuertes o
     débil con tilde. La «u» de que/qui/gue/gui no cuenta. */
  function nucleos(palabra) {
    var p = minus(palabra), res = [], i = 0;
    while (i < p.length) {
      var c = p.charAt(i);
      var muda = c === 'u' && i > 0 && (p.charAt(i - 1) === 'q' || p.charAt(i - 1) === 'g') && 'eéií'.indexOf(p.charAt(i + 1)) >= 0 && p.charAt(i + 1) !== '';
      if (!esVocal(c) || muda) { i++; continue; }
      var ini = i, fin = i;
      while (fin + 1 < p.length && esVocal(p.charAt(fin + 1))) {
        var a = p.charAt(fin), b = p.charAt(fin + 1);
        var hiato = (FUERTES.indexOf(a) >= 0 && FUERTES.indexOf(b) >= 0) || a === 'í' || a === 'ú' || b === 'í' || b === 'ú';
        if (hiato) break;
        fin++;
      }
      res.push({ ini: ini, fin: fin });
      i = fin + 1;
    }
    return res;
  }

  // Índice (en la cadena) de la vocal tónica.
  function tonica(palabra) {
    var p = minus(palabra), ns = nucleos(p);
    if (!ns.length) return -1;
    for (var t = 0; t < p.length; t++) if (CON_TILDE[p.charAt(t)]) return t;
    var fin = p.charAt(p.length - 1);
    var k = (esVocal(fin) || fin === 'n' || fin === 's') && ns.length > 1 ? ns.length - 2 : ns.length - 1;
    return vocalDelNucleo(p, ns[k]);
  }

  function vocalDelNucleo(p, n) {
    for (var i = n.ini; i <= n.fin; i++) if (FUERTES.indexOf(p.charAt(i)) >= 0) return i;
    return n.fin;   // «ui», «iu»: la segunda
  }

  /* Pone o quita la tilde según las reglas generales, sabiendo qué vocal es tónica.
     Se usa al cambiar la palabra (plural, femenino) para que la tilde siga las reglas. */
  function acentuar(palabra, indiceTonica) {
    var base = quitarTildes(palabra), p = minus(base), ns = nucleos(p);
    var k = -1;
    ns.forEach(function (n, j) { if (indiceTonica >= n.ini && indiceTonica <= n.fin) k = j; });
    if (k < 0) return base;
    var desdeFinal = ns.length - 1 - k, fin = p.charAt(p.length - 1);
    var terminaVNS = esVocal(fin) || fin === 'n' || fin === 's';
    var v = p.charAt(indiceTonica);
    var debil = v === 'i' || v === 'u';
    var hiato = debil && ((indiceTonica > 0 && FUERTES.indexOf(p.charAt(indiceTonica - 1)) >= 0) || FUERTES.indexOf(p.charAt(indiceTonica + 1)) >= 0);
    var tilde = hiato || (desdeFinal === 0 && terminaVNS && ns.length > 1) || (desdeFinal === 1 && !terminaVNS) || desdeFinal >= 2;
    if (!tilde) return base;
    return base.slice(0, indiceTonica) + (base.charAt(indiceTonica) === v ? PONER_TILDE[v] : PONER_TILDE[v].toUpperCase()) + base.slice(indiceTonica + 1);
  }

  /* ───────────────────────── Léxico ───────────────────────── */

  // Excepciones a las reglas de género (ampliables con ponerGenero).
  var GENERO = {};
  ('dia mapa problema sistema tema esquema programa clima idioma planeta cometa poema drama dilema teorema sintoma ' +
   'fantasma sofa tranvia aroma diagrama lema enigma prisma dogma panorama telegrama crucigrama pijama mediodia ' +
   'analisis enfasis parentesis oasis apocalipsis tipo estado avion camion gorrion sarampion ' +
   'plasma citoplasma cromosoma ribosoma genoma diafragma corazon pulmon electron proton neutron tendon ' +
   'balance debe haber capilar adn metal gas').split(' ').forEach(function (p) { GENERO[p] = 'm'; });
  ('mano foto moto radio nube parte noche gente calle llave clase fuente muerte suerte sangre leche carne base fase ' +
   'especie serie superficie torre madre nieve fiebre sede mente corriente hambre catastrofe flor labor luz voz cruz ' +
   'paz nariz raiz vez red pared sal miel piel carcel sed ley col imagen razon crisis tesis sintesis hipotesis ' +
   'dosis metamorfosis mitosis meiosis fotosintesis tos lente frase cumbre costumbre legumbre ' +
   'faringe laringe pelvis corteza').split(' ').forEach(function (p) { GENERO[p] = 'f'; });

  // Femeninos que empiezan por «a» tónica: llevan «el» y «un» en singular.
  var A_TONICA = {};
  'agua aguila aula area arma alma hambre hacha hada ala alga ancla arpa asa habla algebra ave acta alba aura haba'.split(' ').forEach(function (p) { A_TONICA[p] = true; });

  // Plurales que no siguen la regla general.
  var PLURAL = { 'carácter': 'caracteres', 'régimen': 'regímenes', 'espécimen': 'especímenes' };
  var INVARIABLES_S = { lunes: 1, martes: 1, miercoles: 1, jueves: 1, viernes: 1, crisis: 1, tesis: 1, analisis: 1, sintesis: 1, virus: 1, torax: 1, dosis: 1, hipotesis: 1, parentesis: 1 };

  var PROPIOS = {};

  // Sustantivos terminados en -ar/-er/-ir que NO son infinitivos.
  var NO_INFINITIVO = {};
  ('lugar mar hogar collar altar azar pilar par militar polar solar radar bar poder deber placer mujer taller alfiler ' +
  'cancer caracter cadaver esfinter elixir nadir tapir faquir emir visir zafir primer tercer cualquier haber').split(' ').forEach(function (p) { NO_INFINITIVO[p] = true; });

  function esInfinitivo(palabra) {
    var k = clave(palabra);
    // Un infinitivo es agudo sin tilde: «líder», «cráter» no lo son.
    return k.length >= 4 && /(ar|er|ir)$/.test(k) && !/[áéíóú]/.test(minus(palabra)) && !NO_INFINITIVO[k] && !GENERO[k];
  }

  function clave(p) { return quitarTildes(minus(p)).trim(); }

  function ponerGenero(palabra, g) {
    if (g !== 'm' && g !== 'f') throw new Error('Género no válido: «' + g + '» (usa «m» o «f»)');
    GENERO[clave(palabra)] = g;
    return true;
  }

  function ponerPropio(nombre) { PROPIOS[clave(nombre)] = true; return true; }

  /* ───────────────────────── Sustantivos ───────────────────────── */

  // { genero:'m'|'f', seguro } — seguro:false cuando ninguna regla fiable lo decide.
  function genero(palabra) {
    var k = clave(palabra);
    if (GENERO[k]) return { genero: GENERO[k], seguro: true };
    if (/(ion|dad|tad|tud|umbre|itis|ie)$/.test(k)) return { genero: 'f', seguro: true };
    if (/(aje|or)$/.test(k)) return { genero: 'm', seguro: true };
    if (/(ista|ante|ente)$/.test(k)) return { genero: 'm', seguro: false };   // pueden ser de los dos
    if (/(ez|eza)$/.test(k)) return { genero: 'f', seguro: false };
    if (/o$/.test(k)) return { genero: 'm', seguro: true };
    if (/a$/.test(k)) return { genero: 'f', seguro: true };
    if (/(os|es)$/.test(k) && k.length > 3) return genero(singularAprox(k));
    if (/as$/.test(k)) return { genero: 'f', seguro: true };
    return { genero: 'm', seguro: false };
  }

  // Solo para deducir el género de un plural: quita -s / -es.
  function singularAprox(k) {
    if (/ces$/.test(k)) return k.slice(0, -3) + 'z';
    if (/(ones|ores|ades|udes)$/.test(k)) return k.slice(0, -2);
    return k.slice(0, -1);
  }

  function numero(palabra) {
    var k = clave(palabra);
    if (INVARIABLES_S[k] || /(is|us)$/.test(k) || k.length <= 3) return { numero: 'sg', seguro: !/s$/.test(k) || !!INVARIABLES_S[k] || /(is|us)$/.test(k) };
    return /s$/.test(k) ? { numero: 'pl', seguro: true } : { numero: 'sg', seguro: true };
  }

  function mismaMayuscula(modelo, texto) {
    return modelo.charAt(0) !== modelo.charAt(0).toLowerCase() ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
  }

  function pluralizar(palabra) {
    var w = String(palabra || ''), m = minus(w);
    if (!w) return w;
    if (PLURAL[m]) return mismaMayuscula(w, PLURAL[m]);
    var t = tonica(m), ns = nucleos(m), fin = m.charAt(m.length - 1);
    var aguda = ns.length && t >= ns[ns.length - 1].ini;
    if (INVARIABLES_S[clave(m)] || ((fin === 's' || fin === 'x') && !aguda && ns.length > 1)) return w;
    var r;
    if (fin === 'z') r = m.slice(0, -1) + 'ces';
    else if ('aeiouáéó'.indexOf(fin) >= 0) r = m + 's';
    else if (fin === 'í' || fin === 'ú') r = m + 'es';
    else if (fin === 'y' && m.length > 1 && esVocal(m.charAt(m.length - 2))) r = m + 'es';
    else r = m + 'es';
    if (r.length > m.length + 1 || fin === 'z') r = acentuar(r, t);
    return mismaMayuscula(w, r);
  }

  /* ───────────────────────── Sintagmas nominales ───────────────────────── */

  var DETERMINANTES = { el: ['m', 'sg', 'def'], la: ['f', 'sg', 'def'], los: ['m', 'pl', 'def'], las: ['f', 'pl', 'def'], un: ['m', 'sg', 'ind'], una: ['f', 'sg', 'ind'], unos: ['m', 'pl', 'ind'], unas: ['f', 'pl', 'ind'] };
  var ENLACES = { de: 1, del: 1, la: 1, las: 1, los: 1, el: 1, y: 1, e: 1, o: 1, u: 1, en: 1, a: 1, al: 1 };

  function empiezaMayuscula(p) { var c = p.charAt(0); return c !== c.toLowerCase(); }
  function esRomano(p) { return /^[IVXLCDM]+$/.test(p); }

  /* Descompone un título: determinante inicial, núcleo (primera palabra; el
     español pone el núcleo delante), resto, y si es un nombre propio.
     Nombre propio: palabras significativas en mayúscula SIN enlaces entre
     ellas («Carlos III», «Isaac Newton»); o «El/La» + una palabra en
     mayúscula («El Prado»). «Puerta de la Ciudad» no es propio. */
  function analizar(titulo) {
    var t = String(titulo || '').trim().replace(/\s+/g, ' '), palabras = t.split(' ');
    var det = null;
    if (palabras.length > 1 && DETERMINANTES[minus(palabras[0])]) det = palabras.shift();
    var nucleo = palabras[0] || '', resto = palabras.slice(1).join(' ');
    var propio = !!PROPIOS[clave(t)] || !!PROPIOS[clave(palabras.join(' '))];
    if (!propio && det && palabras.length === 1 && empiezaMayuscula(nucleo)) propio = true;
    if (!propio && !det && palabras.length >= 2) {
      propio = palabras.every(function (p) { return !ENLACES[minus(p)] && (empiezaMayuscula(p) || esRomano(p)); });
    }
    var infinitivo = !det && !propio && esInfinitivo(nucleo);
    return { titulo: t, determinante: det, nucleo: nucleo, resto: resto, propio: propio, infinitivo: infinitivo };
  }

  function articulo(g, n, tipo, palabraSiguiente) {
    tipo = tipo || 'definido';
    var k = clave(palabraSiguiente || '');
    if (g === 'f' && n === 'sg' && A_TONICA[k]) return tipo === 'definido' ? 'el' : 'un';
    var T = { definido: { m: { sg: 'el', pl: 'los' }, f: { sg: 'la', pl: 'las' } }, indefinido: { m: { sg: 'un', pl: 'unos' }, f: { sg: 'una', pl: 'unas' } } };
    return T[tipo][g][n];
  }

  function minusculaInicial(texto, propio) {
    var s = String(texto || '');
    if (propio || !s) return s;
    var primera = s.split(' ')[0];
    if (primera.length > 1 && primera === primera.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(primera)) return s;   // siglas: ADN
    return s.charAt(0).toLowerCase() + s.slice(1);
  }

  function capitalizar(texto) { var s = String(texto || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  /* Sintagma listo para ir en una oración.
     opciones.articulo: 'definido' (defecto) | 'indefinido' | 'ninguno'
     opciones.inicio: true si abre la oración (mayúscula inicial).
     → { texto, genero, numero, propio, seguro } */
  function sintagma(titulo, opciones) {
    opciones = opciones || {};
    var a = analizar(titulo), tipo = opciones.articulo || 'definido', texto, g, n, seguro = true;
    if (a.determinante) {
      var d = DETERMINANTES[minus(a.determinante)];
      g = d[0]; n = d[1];
      var cuerpo = a.propio ? [a.nucleo, a.resto].join(' ').trim() : minusculaInicial([a.nucleo, a.resto].join(' ').trim());
      texto = (tipo === 'ninguno' ? '' : minus(a.determinante) + ' ') + cuerpo;
    } else if (a.infinitivo) {
      // «Leer mapas…»: un infinitivo funciona como sustantivo masculino singular, sin artículo.
      g = 'm'; n = 'sg';
      texto = minusculaInicial(a.titulo);
    } else if (a.propio) {
      var gp = genero(a.nucleo);
      g = gp.genero; n = 'sg'; seguro = gp.seguro;
      texto = a.titulo;
    } else {
      var gg = genero(a.nucleo), nn = numero(a.nucleo);
      g = gg.genero; n = nn.numero; seguro = gg.seguro && nn.seguro;
      var base = minusculaInicial(a.titulo);
      texto = tipo === 'ninguno' ? base : articulo(g, n, tipo, a.nucleo) + ' ' + base;
    }
    texto = texto.trim();
    if (opciones.inicio) texto = capitalizar(texto);
    return { texto: texto, genero: g, numero: n, propio: a.propio, seguro: seguro };
  }

  // «de el» → «del», «a el» → «al» (solo el artículo en minúscula).
  var CONTRACCION = { de: 'del', De: 'Del', a: 'al', A: 'Al' };
  function contraer(texto) {
    return String(texto || '').replace(/(^|[^A-Za-zÁÉÍÓÚáéíóúÑñ])(de|De|a|A) el(?![A-Za-zÁÉÍÓÚáéíóúÑñ])/g, function (_, antes, p) { return antes + CONTRACCION[p]; });
  }

  // ['a','b','c'] → «a, b y c». «y» → «e» ante i-/hi- (no hie-/hia-); «o» → «u» ante o-/ho-.
  function unirLista(items, conj) {
    var l = (items || []).filter(function (x) { return x !== undefined && x !== null && String(x).trim(); }).map(String);
    if (!l.length) return '';
    if (l.length === 1) return l[0];
    var ultimo = l[l.length - 1], k = clave(ultimo);
    var c = conj === 'o' ? (/^h?o/.test(k) ? 'u' : 'o') : (/^h?i/.test(k) && !/^hi[aeou]/.test(k) ? 'e' : 'y');
    return l.slice(0, -1).join(', ') + ' ' + c + ' ' + ultimo;
  }

  /* ───────────────────────── Adjetivos ───────────────────────── */

  var INVARIABLES_GENERO = { mejor: 1, peor: 1, mayor: 1, menor: 1, superior: 1, inferior: 1, exterior: 1, interior: 1, anterior: 1, posterior: 1, ulterior: 1 };

  // adjetivo en masculino singular → forma concordada.
  function concordar(adjetivo, g, n) {
    var a = String(adjetivo || ''), k = clave(a), f = a;
    if (g === 'f') {
      if (/o$/.test(a)) f = a.slice(0, -1) + 'a';
      else if (/(or)$/.test(k) && !INVARIABLES_GENERO[k]) f = a + 'a';
      else if (/(án|ín|ón|és)$/.test(a)) f = quitarTildes(a) + 'a';
    }
    return n === 'pl' ? pluralizar(f) : f;
  }

  /* ───────────────────────── Verbos ───────────────────────── */

  var TERMINACIONES = {
    presente: { ar: ['o', 'as', 'a', 'amos', 'áis', 'an'], er: ['o', 'es', 'e', 'emos', 'éis', 'en'], ir: ['o', 'es', 'e', 'imos', 'ís', 'en'] },
    preterito: { ar: ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'], er: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'], ir: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'] },
    imperfecto: { ar: ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'], er: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'], ir: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'] },
    futuro: { todos: ['é', 'ás', 'á', 'emos', 'éis', 'án'] }
  };

  // Formas completas de los irregulares más usados (1s 2s 3s 1p 2p 3p).
  var IRREGULARES = {
    ser: { presente: 'soy eres es somos sois son', preterito: 'fui fuiste fue fuimos fuisteis fueron', imperfecto: 'era eras era éramos erais eran' },
    estar: { presente: 'estoy estás está estamos estáis están', preterito: 'estuve estuviste estuvo estuvimos estuvisteis estuvieron' },
    haber: { presente: 'he has ha hemos habéis han', preterito: 'hube hubiste hubo hubimos hubisteis hubieron' },
    tener: { presente: 'tengo tienes tiene tenemos tenéis tienen', preterito: 'tuve tuviste tuvo tuvimos tuvisteis tuvieron' },
    ir: { presente: 'voy vas va vamos vais van', preterito: 'fui fuiste fue fuimos fuisteis fueron', imperfecto: 'iba ibas iba íbamos ibais iban' },
    hacer: { presente: 'hago haces hace hacemos hacéis hacen', preterito: 'hice hiciste hizo hicimos hicisteis hicieron' },
    poder: { presente: 'puedo puedes puede podemos podéis pueden', preterito: 'pude pudiste pudo pudimos pudisteis pudieron' },
    decir: { presente: 'digo dices dice decimos decís dicen', preterito: 'dije dijiste dijo dijimos dijisteis dijeron' },
    dar: { presente: 'doy das da damos dais dan', preterito: 'di diste dio dimos disteis dieron' },
    ver: { presente: 'veo ves ve vemos veis ven', preterito: 'vi viste vio vimos visteis vieron', imperfecto: 'veía veías veía veíamos veíais veían' },
    poner: { presente: 'pongo pones pone ponemos ponéis ponen', preterito: 'puse pusiste puso pusimos pusisteis pusieron' },
    venir: { presente: 'vengo vienes viene venimos venís vienen', preterito: 'vine viniste vino vinimos vinisteis vinieron' },
    saber: { presente: 'sé sabes sabe sabemos sabéis saben', preterito: 'supe supiste supo supimos supisteis supieron' },
    querer: { presente: 'quiero quieres quiere queremos queréis quieren', preterito: 'quise quisiste quiso quisimos quisisteis quisieron' },
    producir: { presente: 'produzco produces produce producimos producís producen', preterito: 'produje produjiste produjo produjimos produjisteis produjeron' },
    conocer: { presente: 'conozco conoces conoce conocemos conocéis conocen' },
    pertenecer: { presente: 'pertenezco perteneces pertenece pertenecemos pertenecéis pertenecen' },
    aparecer: { presente: 'aparezco apareces aparece aparecemos aparecéis aparecen' }
  };
  var FUTURO_RAIZ = { tener: 'tendr', poder: 'podr', hacer: 'har', decir: 'dir', poner: 'pondr', venir: 'vendr', saber: 'sabr', querer: 'querr', haber: 'habr', salir: 'saldr', valer: 'valdr', caber: 'cabr' };

  // Cambios de raíz en presente (todas menos nosotros/vosotros).
  var DIPTONGA = {};
  ('comenzar:ie empezar:ie entender:ie pensar:ie cerrar:ie sentir:ie preferir:ie perder:ie encender:ie despertar:ie ' +
  'mover:ue volver:ue encontrar:ue contar:ue dormir:ue morir:ue resolver:ue recordar:ue devolver:ue ' +
  'pedir:i medir:i repetir:i servir:i seguir:i elegir:i requerir:ie').split(' ').forEach(function (x) { var p = x.split(':'); DIPTONGA[p[0]] = p[1]; });

  function cambiarRaiz(raizV, cambio) {
    var de = cambio === 'ue' ? 'o' : 'e', i = raizV.lastIndexOf(de);
    return i < 0 ? raizV : raizV.slice(0, i) + cambio + raizV.slice(i + 1);
  }

  /* conjugar('formar', 'presente', 3, 'sg') → «forma».
     tiempo: presente | preterito | imperfecto | futuro. Pronominales: «formarse» → «se forma». */
  function conjugar(infinitivo, tiempo, persona, num) {
    tiempo = tiempo || 'presente';
    var inf = minus(String(infinitivo || '').trim()), pron = '';
    var idx = (persona || 3) - 1 + (num === 'pl' ? 3 : 0);
    if (/se$/.test(inf) && inf.length > 4) { inf = inf.slice(0, -2); pron = ['me', 'te', 'se', 'nos', 'os', 'se'][idx] + ' '; }
    var forma;
    var irr = IRREGULARES[inf];
    if (irr && irr[tiempo]) forma = irr[tiempo].split(' ')[idx];
    else if (tiempo === 'futuro') forma = (FUTURO_RAIZ[inf] || inf) + TERMINACIONES.futuro.todos[idx];
    else {
      var grupo = inf.slice(-2), r = inf.slice(0, -2);
      if (!TERMINACIONES[tiempo] || !TERMINACIONES[tiempo][grupo]) throw new Error('No se puede conjugar «' + infinitivo + '» en ' + tiempo);
      var term = TERMINACIONES[tiempo][grupo][idx];
      if (tiempo === 'presente' && DIPTONGA[inf] && idx !== 3 && idx !== 4) r = cambiarRaiz(r, DIPTONGA[inf]);
      if (tiempo === 'preterito' && DIPTONGA[inf] === 'i' && (idx === 2 || idx === 5)) r = cambiarRaiz(r, 'i');
      if (tiempo === 'presente' && /uir$/.test(inf) && idx !== 3 && idx !== 4) r = r + 'y';               // construye
      if (tiempo === 'preterito' && idx === 0 && grupo === 'ar') r = r.replace(/c$/, 'qu').replace(/g$/, 'gu').replace(/z$/, 'c');
      if (tiempo === 'preterito' && (idx === 2 || idx === 5) && grupo !== 'ar' && /[aeou]$/.test(r)) term = term.replace(/^i/, 'y');  // leyó, construyó
      forma = r + term;
    }
    return pron + forma;
  }

  /* ───────────────────────── Conectores ───────────────────────── */

  // Registro sencillo (infantil, primaria) y formal (el resto). Van al inicio de la oración, seguidos de coma.
  var CONECTORES = {
    causa: { sencillo: ['Por eso', 'Por esta razón', 'Así que'], formal: ['Por ello', 'Por tanto', 'En consecuencia', 'De ahí que'] },
    contraste: { sencillo: ['Pero', 'En cambio', 'Sin embargo'], formal: ['Sin embargo', 'No obstante', 'Por el contrario', 'En cambio'] },
    adicion: { sencillo: ['Además', 'También'], formal: ['Además', 'Asimismo', 'Por otra parte', 'Del mismo modo'] },
    secuencia_inicio: { sencillo: ['Primero', 'Al principio'], formal: ['En primer lugar', 'Inicialmente'] },
    secuencia: { sencillo: ['Después', 'Luego', 'A continuación'], formal: ['A continuación', 'Posteriormente', 'Seguidamente', 'Más tarde'] },
    secuencia_fin: { sencillo: ['Al final', 'Por último'], formal: ['Finalmente', 'Por último', 'En último lugar'] },
    ejemplo: { sencillo: ['Por ejemplo'], formal: ['Por ejemplo', 'Así', 'A modo de ejemplo'] },
    aclaracion: { sencillo: ['Es decir', 'O sea'], formal: ['Es decir', 'Dicho de otro modo', 'Esto es'] },
    resumen: { sencillo: ['En resumen', 'Para terminar'], formal: ['En resumen', 'En síntesis', 'En conclusión'] }
  };
  var REGISTRO = { infantil: 'sencillo', primaria: 'sencillo' };

  function conectores(tipo, nivel) {
    var c = CONECTORES[tipo];
    if (!c) throw new Error('Tipo de conector desconocido: «' + tipo + '»');
    return c[REGISTRO[nivel] || 'formal'].slice();
  }
  function conector(tipo, nivel, i) { var l = conectores(tipo, nivel); return l[((i || 0) % l.length + l.length) % l.length]; }

  /* ───────────────────────── Oraciones de relación ─────────────────────────
     Plantillas para EXPRESAR una relación que existe en los datos; no añaden
     información. s: quién es el sujeto ('de' o 'a'); v: verbo (se conjuga en
     3.ª persona con el número del sujeto); c: complemento con huecos:
       {de} {a}    sintagma con artículo      {a0} {de0}  sin artículo (en minúscula)
       @palabra    se concuerda con el sujeto (relacionado → relacionada…) */
  var RELACION = {
    es_un: [{ s: 'de', v: 'ser', c: 'un tipo de {a0}' }, { s: 'de', v: 'ser', c: 'una clase de {a0}' }],
    parte_de: [{ s: 'de', v: 'formar', c: 'parte de {a}' }, { s: 'a', v: 'incluir', c: '{de}' }],
    causa: [{ s: 'de', v: 'provocar', c: '{a}' }, { s: 'de', v: 'ser', c: 'una de las causas de {a}' }],
    antes_de: [{ s: 'de', v: 'tener', c: 'lugar antes de {a}' }, { s: 'a', v: 'tener', c: 'lugar después de {de}' }],
    requiere: [{ s: 'de', v: 'requerir', c: 'conocer {a}' }, { s: null, v: null, c: 'Para comprender {de} hay que conocer {a}' }],
    define: [{ s: 'de', v: 'definir', c: '{a}' }],
    ejemplo_de: [{ s: 'de', v: 'ser', c: 'un ejemplo de {a0}' }],
    propiedad_de: [{ s: 'de', v: 'ser', c: 'una característica de {a}' }],
    contrasta_con: [{ s: 'de', v: 'contrastar', c: 'con {a}' }, { s: 'de', v: 'diferenciarse', c: 'de {a}' }],
    relacionado: [{ s: 'de', v: 'estar', c: '@relacionado con {a}' }]
  };

  function plantillasRelacion(tipo) {
    if (!RELACION[tipo]) throw new Error('No hay plantillas para la relación «' + tipo + '»');
    return EDU.clonar(RELACION[tipo]);
  }

  /* Realiza una plantilla con dos títulos: huecos = { de: 'título', a: 'título' }.
     → { texto, seguro }  (seguro:false si algún género no era seguro). */
  function oracion(plantilla, huecos, opciones) {
    opciones = opciones || {};
    var tiempo = opciones.tiempo || 'presente';
    var sint = {
      de: sintagma(huecos.de), a: sintagma(huecos.a),
      de0: sintagma(huecos.de, { articulo: 'ninguno' }), a0: sintagma(huecos.a, { articulo: 'ninguno' })
    };
    var seguro = sint.de.seguro && sint.a.seguro;
    var suj = plantilla.s ? sint[plantilla.s] : null;
    var c = plantilla.c.replace(/\{(de0|a0|de|a)\}/g, function (_, k) { return sint[k].texto; });
    if (suj) c = c.replace(/@(\S+)/g, function (_, adj) { return concordar(adj, suj.genero, suj.numero); });
    var partes = suj ? [suj.texto, conjugar(plantilla.v, tiempo, 3, suj.numero), c] : [c];
    return { texto: puntuar(capitalizar(contraer(partes.join(' ').replace(/\s+/g, ' ').trim()))), seguro: seguro };
  }

  function puntuar(texto) {
    var s = String(texto || '').trim();
    return !s || /[.!?…:]$/.test(s) ? s : s + '.';
  }

  EDU.lenguas.es = {
    idioma: 'es',
    nombre: 'Español',
    genero: genero,
    numero: numero,
    pluralizar: pluralizar,
    analizar: analizar,
    sintagma: sintagma,
    articulo: articulo,
    contraer: contraer,
    unirLista: unirLista,
    concordar: concordar,
    conjugar: conjugar,
    conector: conector,
    conectores: conectores,
    tiposConector: function () { return Object.keys(CONECTORES); },
    plantillasRelacion: plantillasRelacion,
    oracion: oracion,
    capitalizar: capitalizar,
    minusculaInicial: minusculaInicial,
    puntuar: puntuar,
    acentuar: acentuar,
    tonica: tonica,
    ponerGenero: ponerGenero,
    ponerPropio: ponerPropio
  };

  EDU.registrar('lengua_es', EDU.lenguas.es, { requiere: ['base'], version: '0.1.0' });
})(typeof window !== 'undefined' ? window : globalThis);
