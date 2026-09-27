# Taller de Materiales — orientación para Claude Code

Sistema universal de generación de materiales educativos (primaria → universidad).
**Sin IA externa, sin APIs de IA, sin coste por generación.** Todo se genera con reglas,
datos y algoritmos locales. Proyecto de Fátima: la autoridad final sobre contenido,
metodología y diseño es suya.

## Cómo se ejecuta
Sin compilación, sin npm. Servir por HTTP y abrir `index.html`:

    python3 -m http.server 8000     →  http://localhost:8000/

Pruebas (Node, sin dependencias):

    node pruebas/ejecutar_todas.js  →  todas las pruebas y la prueba integral

## Arquitectura (cinco capas, un módulo por archivo)
| Capa | Módulos |
|---|---|
| Núcleo | `nucleo/edu_base.js` (registro, avisos, azar con semilla, puentes a heredados) · `edu_esquemas.js` (contratos de datos) · `edu_almacen.js` (IndexedDB; localStorage solo preferencias) |
| Conocimiento | `conocimiento/edu_biblioteca.js` (materia → nivel → tema → subtema; crece con `datos/biblioteca/*.json`) · `edu_importador.js` (apuntes de la usuaria → UC) |
| Datos | `datos/biblioteca/indice.json` (orden de carga; `catalogo_materias.json` primero: 41 materias × niveles, sin contenido) · paquetes de contenido por tema (pendientes de revisión) · `datos/paises/paises.json` (es, ve, us, ec, pe, co, mx: cursos por etapa, papel, números, moneda, norma contable) |
| Expansión | `expansion/edu_expansor.js` (UC → estructura educativa) · `edu_secuencia.js` (orden, módulos, objetivos) |
| Redacción | `redaccion/edu_lengua_es.js` (gramática, intercambiable por idioma) · `edu_redactor.js` (texto con trazabilidad) |
| Variación | `variacion/edu_variacion.js` (versiones con los mismos hechos) |
| Motores heredados | `heredados/*.js`: copias intactas de FATIMA PRO (láminas con 300 diseños, folleto, examen, voz, vídeo 3D, bandeja, doc-page). Certificado en `heredados/ORIGEN.md` |
| Adaptadores | `compat/edu_visual.js` (Motor Visual: estilo del diseño de FATIMA PRO + contenido solo de los datos, con `verificar()`) · `compat/edu_examen.js` (examen y corrección con `b6_examen`; opciones solo de los datos, con `verificar()`) |
| Salidas | `salidas/edu_exportar.js` (PDF, ZIP, descarga) · `salidas/edu_libro.js` (un modelo de lectura → libro PDF, EPUB 3 y HTML; textos solo de la redacción). Librerías locales en `vendor/` (jsPDF, JSZip, DejaVu Serif; ver `vendor/LEEME.md`) |
| Asistente | `conocimiento/edu_pegado.js` (texto pegado de internet → UC literales con fuente y dirección) · `proyecto/edu_proyecto.js` (tipos de trabajo, hojas 10–300, papel, plantilla; estimación honesta de hojas) · `redaccion/edu_documento.js` (texto de autor en su orden y literal, con auditoría propia; combinable con el banco) |
| Pantalla | `index.html` + `visor/edu_visor.js` + `visor/edu_visor_crear.js` (pestaña «Crear») + `visor/edu_visor_salidas.js` (Descargar / Vista previa) |

Orden de carga: el de los `<script>` de `index.html`. Cada módulo se registra con
`EDU.registrar(nombre, api, { requiere })` y se protege contra la doble carga.

## Reglas que no se rompen
1. **No inventar contenido.** Toda pieza con contenido declara su origen (`desde`). Lo que
   falta queda como pieza **pendiente**, nunca como texto de relleno.
2. **Hechos ≠ redacción.** Los hechos se copian literalmente (solo puede cambiar la
   mayúscula inicial). La redacción solo aporta marco: plantillas, artículos, conectores
   respaldados. Nunca conectores causales o temporales que los datos no digan.
3. **Auditorías obligatorias:** `EDU.expansor.auditar` (copias fieles), `EDU.redactor.auditar`
   (nada alterado, añadido ni eliminado), `EDU.variacion` (misma huella de hechos).
4. **Núcleo independiente de las materias.** Ningún módulo de código menciona una materia;
   las pruebas lo comprueban. Las materias son datos.
5. **Orden no fijado por los datos:** se conserva el orden estable y se marca como
   indeterminado. No se añaden reglas ni relaciones para decidirlo.
6. **Validación todo o nada** al guardar, importar paquetes o importar apuntes.
7. **Motores heredados de FATIMA PRO:** se usarán como copias intactas (sha256 en
   `ORIGEN.md`) a través de adaptadores; nunca se editan. `EDU.puente` ya declara sus globales.
8. **Firebase queda fuera** hasta que Fátima lo pida (fase posterior, proyecto nuevo).

## Estilo de trabajo
- JavaScript clásico en IIFE, sin `import`/`export`, sin TypeScript. Interfaz y comentarios en español.
- Ningún archivo de más de **800 líneas**. Cambios quirúrgicos: tocar solo lo pedido.
- Cada módulo nuevo lleva su `pruebas/prueba_*.js` y debe dejar `ejecutar_todas.js` en verde.
- Trabajo por módulos con revisión de Fátima entre uno y otro.

## Pendiente de decisión de Fátima
- Revisar el contenido de todos los paquetes (marcados como pendientes de revisión) y `datos/paises/paises.json`.
- Tabla de verbos por nivel y orden de fases (configurables, propuesta inicial).
- Léxico para nombres propios con artículo («la Revolución francesa», «el Antiguo Régimen»).

## Hoja de ruta pedida por Fátima (no perder)
Herramienta universal primaria → universidad que reutiliza los motores de los dos bloques de FATIMA PRO:
- **Un trabajo → todas las salidas:** libro/eBook (hecho: PDF, EPUB, HTML), examen (hecho), presentación PDF/PPTX,
  curso HTML/SCORM, guía paso a paso, vídeo explicativo animado con voz gratuita, ZIP (hecho).
- **Trabajos académicos con aspecto de libro profesional:** portada, índice paginado, introducción, desarrollo,
  conclusiones y bibliografía a partir de las fuentes.
- **Editor:** plantillas, colores, efectos y animaciones; subir imágenes, vídeos y audios.
- **Cerebro completo por áreas:** más paquetes de contenido por materia y nivel (tanda 1 hecha: biología, anatomía,
  contabilidad, química, física); contabilidad por país; motor de ejercicios contables y matemáticos con solucionario.
- **Países:** España, Venezuela, Estados Unidos, Ecuador, Perú, Colombia y México (nombres de cursos, formatos, normas).
- **Cerebros nuevos:** inglés + diccionario bilingüe; infantil (caligrafía, sopas de letras, crucigramas…).
- **Heredados por conectar:** `b6_cerebro.js` (técnicas de peluquería de Fátima) mediante adaptador, sin editarlo.
