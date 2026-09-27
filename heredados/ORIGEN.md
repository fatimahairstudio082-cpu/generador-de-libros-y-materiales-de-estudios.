# Origen de los motores heredados de FATIMA PRO

Copias **intactas, byte a byte,** de los motores de FATIMA PRO. **No se editan nunca.**
Se conectan al sistema a través de adaptadores (carpeta `compat/`). Si algún día hay que cambiar
un motor, se cambia en su repositorio original, se vuelve a copiar y se actualiza esta tabla.

- Repositorio de origen: `fatimahairstudio082-cpu/aprendizajefatima.fatimahairstudio082.com`
- Rama: `main` · commit `e3c1996dcf06125e919a5bb076ed7a1536f09bad`
- Copiado el 27-09-2026 · comprobación automática: `node pruebas/prueba_heredados.js`

| Archivo | Líneas | Global | Qué hace | Uso en este sistema | Dependencias / adaptador | sha256 |
|---|---|---|---|---|---|---|
| `b6_laminas_motor.js` | 2424 | `LAMINAS_MOTOR` | 77 estructuras visuales: mapas conceptuales, flujos, líneas de tiempo, pirámides, datos, comparaciones, fichas, carrusel, pósters y mandalas | Motor Visual (esquemas, fichas, presentación) | Ninguna obligatoria (usa FOLLETO_MOTOR si está) | `c2f0f7f3488862ff1a0c2adab0ed4c30f730cefcb6f890ede3c26beba61dd682` |
| `b6_laminas_disenos.js` | 1250 | `LAMINAS_DISENOS` | Temas y presets educativos de láminas | Motor Visual | LAMINAS_MOTOR | `dfa9595724c576fd76a4cac4a6269457f64832ea2f910ef56c27e8c776e51a1a` |
| `b6_folleto_motor.js` | 1049 | `FOLLETO_MOTOR` | Rejillas de página, temas de color, encaje de texto e imagen | Portadas, páginas con diseño, diapositivas | Ninguna | `1ff9681a890c15e87a85e0b0560ba3f5868d86a66415d26b88f591a68e71303a` |
| `b6_folleto_disenos.js` | 249 | `FOLLETO_DISENOS` | Presets de folleto | Portadas | FOLLETO_MOTOR | `569cce44bcf56bc0a3b40fe4bd0704ea0dcc887305166d661cfb388a48091dcc` |
| `b6_examen.js` | 354 | `EU_EXAMEN` | Hoja A4 de examen y hoja de corrección | Exámenes y solucionarios | Ninguna | `2dad83fbc96d8173d3aca7405dacc126f97c6e4c8af16d7b15e22e29fc765ebe` |
| `b6_voz.js` | 472 | `EU_VOZ, B6Voz` | Narración y grabación con la voz del navegador (gratis) | Lectura en voz alta, voz de los vídeos | localStorage (eu_voz_v1, eu_voz_audios_v1) | `2d44e94d5982747d57a48da3a5272fdbb5cbda04e077aedd78749cb8b642dfd8` |
| `b6_voz_video_gratis.js` | 365 | `B6_VOZ_GRATIS` | Captura de la voz gratuita del navegador en audio | Voz de los vídeos explicativos | speechSynthesis, MediaRecorder | `5e7c029a52ed1cf7647a5f5ea81f972ee364cdb76a57835ec607bd3fd9abe7b9` |
| `eu_video3d.js` | 729 | `EU_VIDEO` | Estudio de vídeo: entrada animada de cada cuadro (13 efectos 3D y planos) y grabación en el navegador | Vídeos explicativos animados descargables | window.EU, EU_PLAN, IDs de su pantalla → adaptador. Su botón «voz de estudio» llama a un servicio de pago (functions/tts): el adaptador lo deja DESACTIVADO | `b39fc70dc1f282cce9fbf26065e8b45119bf866007a6f16f821c84a872a0e3a1` |
| `b6_bandeja.js` | 169 | `B6Bandeja` | Bandeja de descargas y ZIP | Descargas conjuntas, EPUB | JSZip (CDN) | `a28d2f6236b5cc699453902ea423c54f0f33751cbbff7fead8ecdec513e81367` |
| `doc-page.js` | 779 | `<doc-page>` | Paginación de documentos imprimibles (A4 o carta) | Libros paginados | Ninguna | `f52ae9c02fca7ab44c37f3ff363194fdf81caa20ae63e2fe1f518ed21133185e` |

Motores de FATIMA PRO que **no** se copian (por ahora): `b6_volantes.js` (depende del cerebro de
folletos comerciales), `b6_guias_3d.js` y `b6_estudios.js` (específicos de peluquería; de `b6_guias_3d.js`
solo se reutilizará el patrón del cargador de Three.js), `motor_auto.html`, `motor_agente.html` y las
funciones `netlify/functions/*` (IA de pago, prohibida en este sistema).
