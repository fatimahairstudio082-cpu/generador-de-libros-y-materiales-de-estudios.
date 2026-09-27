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
| Expansión | `expansion/edu_expansor.js` (UC → estructura educativa) · `edu_secuencia.js` (orden, módulos, objetivos) |
| Redacción | `redaccion/edu_lengua_es.js` (gramática, intercambiable por idioma) · `edu_redactor.js` (texto con trazabilidad) |
| Variación | `variacion/edu_variacion.js` (versiones con los mismos hechos) |
| Motores heredados | `heredados/*.js`: copias intactas de FATIMA PRO (láminas con 300 diseños, folleto, examen, voz, vídeo 3D, bandeja, doc-page). Certificado en `heredados/ORIGEN.md` |
| Adaptadores | `compat/edu_visual.js` (Motor Visual: estilo del diseño de FATIMA PRO + contenido solo de los datos, con `verificar()`) |
| Pantalla | `index.html` + `visor/edu_visor.js` |

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
- Revisar el contenido de los tres paquetes de prueba (marcados como pendientes de revisión).
- Tabla de verbos por nivel y orden de fases (configurables, propuesta inicial).
- Léxico para nombres propios con artículo («la Revolución francesa», «el Antiguo Régimen»).
