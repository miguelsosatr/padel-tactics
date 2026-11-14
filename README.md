# Pádel Táctico

Juego educativo de táctica de pádel (web, mobile first). Cada golpe del punto es una decisión;
cada opción se califica como **Óptimo**, **Depende** (válida con condiciones) o **Error común**,
con su etiqueta de evidencia (Estudio, Federativo o Consenso de entrenadores + lógica).

Estado: **maqueta** para validar el diseño.

- `index.html`: portada.
- `mockups/jugar.html`: prototipo jugable (para celular). Empieza preguntando si eres derecho o zurdo y tu nivel, y ajusta los consejos. Rota tres puntos: saque desde la derecha, saque en australiana (con chiquita y bola dividida al centro) y resto (con víbora a la doble pared). Tras bandeja, víbora o remate, un zoom con reloj pregunta a qué hora le pegas a la pelota.
- `mockups/index.html`: todas las pantallas de diseño.
- `mockups/src/`: código fuente de las maquetas (Three.js). Después de editar, regenera con `node tools/build-mockup.mjs`.
- `docs/fuentes.md` y `docs/escenarios.md`: investigación y catálogo de escenarios tácticos.

Para verlo localmente: `node tools/serve.mjs` y abre http://localhost:5173/
