# Pádel Táctico

Juego educativo de táctica de pádel (web, mobile first). Cada golpe del punto es una decisión;
cada opción se califica como **Óptimo**, **Depende** (válida con condiciones) o **Error común**,
con su etiqueta de evidencia (Estudio, Federativo o Consenso de entrenadores + lógica).

Estado: **maqueta** para validar el diseño.

- `index.html`: portada.
- `mockups/jugar.html`: prototipo jugable de un punto completo (para celular).
- `mockups/index.html`: todas las pantallas de diseño.
- `mockups/src/`: código fuente de las maquetas (Three.js). Después de editar, regenera con `node tools/build-mockup.mjs`.
- `docs/fuentes.md` y `docs/escenarios.md`: investigación y catálogo de escenarios tácticos.

Para verlo localmente: `node tools/serve.mjs` y abre http://localhost:5173/
