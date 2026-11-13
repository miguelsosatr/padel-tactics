// Genera páginas autocontenidas (funcionan también abriéndolas con doble clic, file://):
//   mockups/index.html  → todas las maquetas + prototipo   (desde src/index.html)
//   mockups/jugar.html  → solo el prototipo, a pantalla completa para celular (desde src/jugar.html)
// Uso: node tools/build-mockup.mjs
import fs from 'node:fs';

const src = (f) => fs.readFileSync(new URL(`../mockups/src/${f}`, import.meta.url), 'utf8');
const out = (f, s) => fs.writeFileSync(new URL(`../mockups/${f}`, import.meta.url), s);
const strip = (code) => code.replace(/^import \{[\s\S]*?\} from '\.\/scene\.js';\n/m, '');
const module = (...parts) => `<script type="module">\n${parts.join('\n')}\n</script>`;

const scene = src('scene.js').replace(/^export /gm, '');
const screens = strip(src('screens.js'));
const proto = strip(src('proto.js'));

// 1) Todas las maquetas
const tag = '<script type="module" src="./screens.js"></script>';
const protoTag = '<script type="module" src="./proto.js"></script>';
const html = src('index.html');
if (!html.includes(tag)) throw new Error('No encontré la etiqueta del script en src/index.html');
out('index.html', html.replace(protoTag, '').replace(tag, () => module(scene, screens, proto)));

// 2) Prototipo para celular: reutiliza los estilos de src/index.html
const styles = html.match(/<style>[\s\S]*?<\/style>/)[0];
const jugar = src('jugar.html')
  .replace('<!-- STYLES -->', () => styles)
  .replace('<!-- SCRIPT -->', () => module(scene, proto));
out('jugar.html', jugar);

console.log('mockups/index.html y mockups/jugar.html generados');
