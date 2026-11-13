// Utilidades 3D ligeras para las maquetas (Three.js, sin modelos externos).
// Ejes: x = ancho (-5..5), y = altura, z = largo (-10..10). Red en z = 0.
// El equipo del usuario está en z > 0 (cerca de la cámara).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const C = {
  user: 0xd7f548,
  partner: 0x38d6b0,
  rival: 0xff6b5b,
  ball: 0xeaff4a,
  good: 0x3ddc97,
  ok: 0xffc542,
  bad: 0xff6b5b,
  white: 0xffffff,
};

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export function createStage(el, { cam, target, fov = 38 }) {
  const w = el.clientWidth;
  const h = el.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070f1c);

  const camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, 200);
  camera.position.set(...cam);

  // En celular el alto cambia (barra del navegador, girar la pantalla): ajusta el lienzo.
  new ResizeObserver(() => {
    const nw = el.clientWidth;
    const nh = el.clientHeight;
    if (!nw || !nh) return;
    renderer.setSize(nw, nh);
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
  }).observe(el);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...target);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = 1.45;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2a44, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(6, 14, 8);
  scene.add(sun);

  buildCourt(scene);

  const tickers = new Set();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    for (const f of tickers) f(t);
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    scene, camera, controls, skip: false,
    // Registra una función por cuadro; regresa una función para quitarla.
    tick: (f) => (tickers.add(f), () => tickers.delete(f)),
  };
}

// ---------- Animación (tweens) ----------

export const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const lerp = (a, b, k) => a + (b - a) * k;

// Interpola de 0 a 1 en `dur` segundos. Si stage.skip está activo, salta al final.
export function tween(stage, dur, fn, ease = (k) => k) {
  return new Promise((resolve) => {
    if (dur <= 0 || stage.skip) {
      fn(1);
      return resolve();
    }
    const t0 = performance.now();
    const rm = stage.tick(() => {
      const k = stage.skip ? 1 : Math.min(1, (performance.now() - t0) / (dur * 1000));
      fn(ease(k));
      if (k >= 1) {
        rm();
        resolve();
      }
    });
  });
}

export const wait = (stage, s) => tween(stage, s, () => {});

export function tweenCamera(stage, pos, target, dur = 1) {
  const p0 = stage.camera.position.clone();
  const t0 = stage.controls.target.clone();
  const p1 = new THREE.Vector3(...pos);
  const t1 = new THREE.Vector3(...target);
  return tween(stage, dur, (k) => {
    stage.camera.position.lerpVectors(p0, p1, k);
    stage.controls.target.lerpVectors(t0, t1, k);
  }, easeInOut);
}

// ---------- Pista ----------

function flat(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

function box(scene, w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}

function meshTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(180,195,215,0.55)';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(32, 32);
  g.moveTo(32, 0); g.lineTo(0, 32);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const glassMat = new THREE.MeshBasicMaterial({
  color: 0x9fd8ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false,
});
const glassEdge = new THREE.LineBasicMaterial({ color: 0xa9dcff, transparent: true, opacity: 0.7 });
const meshEdge = new THREE.LineBasicMaterial({ color: 0x6b7a90, transparent: true, opacity: 0.55 });
let meshTex;

// Pared entre los puntos a=[x,z] y b=[x,z], de altura y0 a y1.
function wall(scene, a, b, y0, y1, glass) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const geo = new THREE.PlaneGeometry(len, y1 - y0);
  let mat = glassMat;
  if (!glass) {
    meshTex ??= meshTexture();
    const tex = meshTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(len / 0.35, (y1 - y0) / 0.35);
    mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    });
  }
  const m = new THREE.Mesh(geo, mat);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), glass ? glassEdge : meshEdge);
  const rotY = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  for (const o of [m, e]) {
    o.position.set((a[0] + b[0]) / 2, (y0 + y1) / 2, (a[1] + b[1]) / 2);
    o.rotation.y = rotY;
    scene.add(o);
  }
}

function buildCourt(scene) {
  scene.add(flat(new THREE.PlaneGeometry(16, 26), new THREE.MeshLambertMaterial({ color: 0x10294c }), 0, -0.02, 0));
  scene.add(flat(new THREE.PlaneGeometry(10, 20), new THREE.MeshLambertMaterial({ color: 0x2a6fd0 }), 0, 0, 0));

  const line = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const z of [6.95, -6.95]) box(scene, 10, 0.004, 0.05, 0, 0.003, z, line);
  box(scene, 0.05, 0.004, 14.3, 0, 0.003, 0, line);

  // Red
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 0.88),
    new THREE.MeshBasicMaterial({ color: 0x05080f, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  net.position.set(0, 0.44, 0);
  scene.add(net);
  box(scene, 10, 0.05, 0.03, 0, 0.88, 0, new THREE.MeshBasicMaterial({ color: 0xf2f5fa }));
  const post = new THREE.MeshLambertMaterial({ color: 0x1b2433 });
  for (const x of [-5.05, 5.05]) box(scene, 0.08, 0.92, 0.08, x, 0.46, 0, post);

  // Paredes de fondo: vidrio 3 m + reja 1 m
  for (const z of [10, -10]) {
    wall(scene, [-5, z], [5, z], 0, 3, true);
    wall(scene, [-5, z], [5, z], 3, 4, false);
  }
  // Laterales: 2 m de vidrio a 3 m, 2 m de vidrio a 2 m, el resto reja
  for (const x of [5, -5]) {
    for (const s of [1, -1]) {
      wall(scene, [x, 10 * s], [x, 8 * s], 0, 3, true);
      wall(scene, [x, 10 * s], [x, 8 * s], 3, 4, false);
      wall(scene, [x, 8 * s], [x, 6 * s], 0, 2, true);
      wall(scene, [x, 8 * s], [x, 6 * s], 2, 3, false);
    }
    wall(scene, [x, 6], [x, -6], 0, 3, false);
  }
}

// ---------- Etiquetas ----------

export function label(text, { bg = '#0f1d33', fg = '#ffffff', border = null, size = 0.42 } = {}) {
  const fs = 44;
  const pad = 20;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `700 ${fs}px system-ui, "Segoe UI", sans-serif`;
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width + pad * 2);
  c.height = Math.ceil(fs + pad * 1.3);
  g.font = font;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(3, 3, c.width - 6, c.height - 6, c.height / 2 - 3);
  g.fill();
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = 4;
    g.stroke();
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  s.scale.set((size * c.width) / c.height, size, 1);
  return s;
}

// ---------- Jugadores ----------

// Cuerpo articulado simple: cada articulación es un Group que se rota.
// El cuerpo se construye mirando hacia -z (hacia la red desde nuestro lado);
// su derecha es +x. Rotación x positiva = llevar la extremidad hacia adelante.
function limb(len, r, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - 2 * r, 4, 10), mat);
  m.position.y = -len / 2;
  return m;
}

function joint(parent, x, y, z) {
  const j = new THREE.Group();
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

function buildBody(color, op) {
  const shirt = new THREE.MeshLambertMaterial({ color, ...op });
  const skin = new THREE.MeshLambertMaterial({ color: 0xf1c9a5, ...op });
  const shorts = new THREE.MeshLambertMaterial({ color: 0x1b2433, ...op });
  const shoe = new THREE.MeshLambertMaterial({ color: 0xf4f6fa, ...op });
  const dark = new THREE.MeshLambertMaterial({ color: 0x141b26, ...op });

  const root = new THREE.Group();
  const hips = joint(root, 0, 0.95, 0);
  const j = {};

  // Torso y cabeza
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.36, 4, 12), shirt);
  torso.position.y = 0.3;
  torso.scale.set(1.15, 1, 0.75);
  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.2, 14), shorts);
  pelvis.position.y = 0.02;
  hips.add(torso, pelvis);
  j.hips = hips;
  const neck = joint(hips, 0, 0.62, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 14), skin);
  head.position.y = 0.12;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), shirt);
  cap.position.y = 0.13;
  neck.add(head, cap);

  // Piernas
  for (const side of ['L', 'R']) {
    const sx = side === 'R' ? 0.1 : -0.1;
    const thigh = joint(hips, sx, -0.02, 0);
    thigh.add(limb(0.44, 0.075, shorts));
    const knee = joint(thigh, 0, -0.44, 0);
    knee.add(limb(0.44, 0.06, skin));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), shoe);
    foot.position.set(0, -0.46, -0.06);
    knee.add(foot);
    j['thigh' + side] = thigh;
    j['knee' + side] = knee;
  }

  // Brazos
  for (const side of ['L', 'R']) {
    const sx = side === 'R' ? 0.23 : -0.23;
    const shoulder = joint(hips, sx, 0.5, 0);
    shoulder.add(limb(0.3, 0.05, shirt));
    const elbow = joint(shoulder, 0, -0.3, 0);
    elbow.add(limb(0.27, 0.045, skin));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin);
    hand.position.y = -0.28;
    elbow.add(hand);
    j['shoulder' + side] = shoulder;
    j['elbow' + side] = elbow;
    if (side === 'R') {
      // Pala: mango en la mano y la cara siguiendo la línea del antebrazo
      const racket = joint(elbow, 0, -0.29, 0);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.16, 8), dark);
      handle.position.y = -0.06;
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.035, 22), dark);
      face.rotation.x = Math.PI / 2;
      face.scale.set(1, 1, 1.12);
      face.position.y = -0.3;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 28), shirt);
      rim.position.y = -0.3;
      racket.add(handle, face, rim);
      j.racket = racket;
    }
  }
  return { root, j };
}

// Posturas: valores de rotación por articulación [x, y, z].
const POSES = {
  // Posición de espera: rodillas flexionadas, pala al frente a la altura del pecho
  ready: {
    drop: 0.1,
    thighL: [0.45, 0, -0.18], kneeL: [-0.75, 0, 0],
    thighR: [0.45, 0, 0.18], kneeR: [-0.75, 0, 0],
    hips: [0.2, 0, 0],
    shoulderR: [0.75, 0, 0.25], elbowR: [1.1, 0, 0], racket: [0.4, 0, 0],
    shoulderL: [0.7, 0, -0.25], elbowL: [1.2, 0, 0],
  },
  // Saque: pelota en la mano izquierda, pala atrás por debajo de la cintura
  serve: {
    drop: 0.04,
    thighL: [0.35, 0, -0.05], kneeL: [-0.3, 0, 0],
    thighR: [-0.25, 0, 0.08], kneeR: [-0.35, 0, 0],
    hips: [0.12, 0.35, 0],
    shoulderR: [-0.6, 0, 0.3], elbowR: [0.5, 0, 0], racket: [0.3, 0, 0],
    shoulderL: [0.9, 0, -0.15], elbowL: [0.3, 0, 0],
  },
  // Revés: perfilado con el hombro derecho hacia la red, pala preparada del lado izquierdo
  backhand: {
    drop: 0.12,
    rotY: 0.9,
    thighL: [0.2, 0, -0.2], kneeL: [-0.6, 0, 0],
    thighR: [0.55, 0, 0.1], kneeR: [-0.8, 0, 0],
    hips: [0.25, 0, 0],
    shoulderR: [0.55, 0, -1.05], elbowR: [0.7, 0, 0], racket: [0.4, 0, 0],
    shoulderL: [0.45, 0, -0.35], elbowL: [0.9, 0, 0],
  },
  // Golpe por arriba (bandeja / remate): perfilado, brazo izquierdo apunta a la pelota
  overhead: {
    drop: 0.03,
    rotY: -1.0,
    thighL: [0.35, 0, -0.1], kneeL: [-0.25, 0, 0],
    thighR: [-0.35, 0, 0.1], kneeR: [-0.4, 0, 0],
    hips: [-0.05, 0, 0],
    shoulderR: [2.5, 0, 0.55], elbowR: [1.6, 0, 0], racket: [0.5, 0, 0],
    shoulderL: [2.7, 0, -0.2], elbowL: [0.15, 0, 0],
  },
  // Globo / golpe bajo: pala abajo terminando hacia arriba
  lob: {
    drop: 0.12,
    thighL: [0.55, 0, -0.15], kneeL: [-0.9, 0, 0],
    thighR: [0.1, 0, 0.2], kneeR: [-0.7, 0, 0],
    hips: [0.25, -0.3, 0],
    shoulderR: [1.6, 0, 0.35], elbowR: [0.25, 0, 0], racket: [-0.3, 0, 0],
    shoulderL: [0.4, 0, -0.5], elbowL: [0.6, 0, 0],
  },
  // Final del saque: la pala terminó adelante
  serveHit: {
    drop: 0.05,
    thighL: [0.4, 0, -0.05], kneeL: [-0.35, 0, 0],
    thighR: [-0.15, 0, 0.08], kneeR: [-0.5, 0, 0],
    hips: [0.2, -0.25, 0],
    shoulderR: [1.35, 0, 0.1], elbowR: [0.5, 0, 0], racket: [0.3, 0, 0],
    shoulderL: [0.5, 0, -0.3], elbowL: [0.6, 0, 0],
  },
  // Final de bandeja / remate: el brazo bajó hacia adelante
  overheadHit: {
    drop: 0.05,
    rotY: -0.35,
    thighL: [0.4, 0, -0.1], kneeL: [-0.3, 0, 0],
    thighR: [-0.3, 0, 0.1], kneeR: [-0.45, 0, 0],
    hips: [0.15, 0, 0],
    shoulderR: [1.5, 0, -0.2], elbowR: [0.35, 0, 0], racket: [0.2, 0, 0],
    shoulderL: [0.6, 0, -0.4], elbowL: [0.9, 0, 0],
  },
  // Volea baja: muy flexionado, pala abajo al frente
  volley: {
    drop: 0.28,
    thighL: [0.9, 0, -0.2], kneeL: [-1.4, 0, 0],
    thighR: [0.3, 0, 0.25], kneeR: [-1.3, 0, 0],
    hips: [0.45, 0, 0],
    shoulderR: [0.6, 0, 0.35], elbowR: [0.2, 0, 0], racket: [-0.2, 0, 0],
    shoulderL: [0.5, 0, -0.4], elbowL: [1.0, 0, 0],
  },
};

const JOINTS = ['hips', 'thighL', 'kneeL', 'thighR', 'kneeR', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'racket'];
const LABEL_Y = (pose) => (pose === 'overhead' ? 2.75 : 2.3);

function applyPose(body, name) {
  const p = POSES[name] || POSES.ready;
  body.root.position.y = -(p.drop || 0);
  body.root.rotation.y = p.rotY || 0;
  for (const k of JOINTS) {
    const v = p[k] || [0, 0, 0];
    body.j[k].rotation.set(v[0], v[1], v[2]);
  }
}

// Cambia de postura con transición suave.
export function setPose(stage, player, name, dur = 0.25) {
  const { body, label: l } = player.userData;
  const p = POSES[name] || POSES.ready;
  const from = JOINTS.map((k) => [body.j[k].rotation.x, body.j[k].rotation.y, body.j[k].rotation.z]);
  const to = JOINTS.map((k) => p[k] || [0, 0, 0]);
  const y0 = body.root.position.y;
  const r0 = body.root.rotation.y;
  const ly0 = l ? l.position.y : 0;
  player.userData.pose = name;
  return tween(stage, dur, (k) => {
    JOINTS.forEach((key, i) => body.j[key].rotation.set(
      lerp(from[i][0], to[i][0], k), lerp(from[i][1], to[i][1], k), lerp(from[i][2], to[i][2], k),
    ));
    body.root.position.y = lerp(y0, -(p.drop || 0), k);
    body.root.rotation.y = lerp(r0, p.rotY || 0, k);
    if (l) l.position.y = lerp(ly0, LABEL_Y(name), k);
  }, easeInOut);
}

// Desplaza al jugador corriendo (las piernas se mueven) y termina en su postura actual.
export function moveTo(stage, player, [x, z], dur) {
  const { body } = player.userData;
  const x0 = player.position.x;
  const z0 = player.position.z;
  const dist = Math.hypot(x - x0, z - z0);
  if (dist < 0.01) return Promise.resolve();
  const steps = Math.max(2, Math.round(dist / 0.7));
  return tween(stage, dur, (k) => {
    player.position.set(lerp(x0, x, k), 0, lerp(z0, z, k));
    const s = Math.sin(k * steps * Math.PI) * (k < 1 ? 0.55 : 0);
    const p = POSES[player.userData.pose] || POSES.ready;
    body.j.thighL.rotation.x = (p.thighL?.[0] || 0) + s;
    body.j.thighR.rotation.x = (p.thighR?.[0] || 0) - s;
  }, easeInOut);
}

// Coloca a un jugador al instante (para regresar a una decisión anterior).
export function placePlayer(player, [x, z], pose) {
  player.position.set(x, 0, z);
  player.userData.pose = pose;
  applyPose(player.userData.body, pose);
  if (player.userData.label) player.userData.label.position.y = LABEL_Y(pose);
}

// Capa de efectos temporales (trayectorias, zonas, marcas) que se puede borrar de golpe.
// Se usa como si fuera un "stage": las funciones de dibujo solo usan .scene y .tick.
export function fxLayer(stage) {
  const group = new THREE.Group();
  stage.scene.add(group);
  return {
    scene: group,
    tick: stage.tick,
    clear() {
      for (const c of [...group.children]) group.remove(c);
    },
  };
}

// ---------- Pelota en juego ----------

export function createBall(stage) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 20, 14),
    new THREE.MeshStandardMaterial({ color: C.ball, emissive: C.ball, emissiveIntensity: 0.45 }),
  );
  const shadow = flat(new THREE.CircleGeometry(0.12, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }), 0, 0.016, 0);
  stage.scene.add(mesh, shadow);
  const ball = {
    mesh,
    set(p) {
      mesh.position.copy(p);
      shadow.position.set(p.x, 0.016, p.z);
    },
    show(v) {
      mesh.visible = shadow.visible = v;
    },
  };
  ball.show(false);
  return ball;
}

export function pathInfo(pts) {
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = dist[dist.length - 1];
  const at = (f) => {
    const d = Math.max(0, Math.min(1, f)) * total;
    let i = 1;
    while (i < dist.length - 1 && dist[i] < d) i++;
    const k = (d - dist[i - 1]) / (dist[i] - dist[i - 1] || 1);
    return pts[i - 1].clone().lerp(pts[i], k);
  };
  return { total, at };
}

// Mueve la pelota por la trayectoria, de la fracción `from` a `to`, en `dur` segundos.
export function flyBall(stage, ball, pts, dur, from = 0, to = 1) {
  const info = pathInfo(pts);
  ball.show(true);
  return tween(stage, dur, (k) => ball.set(info.at(lerp(from, to, k))));
}

export function addPlayer(stage, { x, z, color, text, you = false, ghost = false, facing = -1, pose = 'ready' }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const op = ghost ? { transparent: true, opacity: 0.35, depthWrite: false } : {};
  const body = buildBody(color, op);
  applyPose(body, pose);
  // Los rivales miran hacia +z
  const facer = new THREE.Group();
  facer.rotation.y = facing === 1 ? Math.PI : 0;
  facer.add(body.root);
  const shadow = flat(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: ghost ? 0.12 : 0.3, depthWrite: false }), 0, 0.006, 0);
  g.add(shadow, facer);

  if (you && !ghost) {
    const ring = flat(new THREE.RingGeometry(0.5, 0.62, 48), new THREE.MeshBasicMaterial({ color: C.user, transparent: true, side: THREE.DoubleSide }), 0, 0.012, 0);
    g.add(ring);
    stage.tick((t) => {
      const k = 1 + 0.12 * Math.sin(t * 4);
      ring.scale.set(k, k, 1);
      ring.material.opacity = 0.65 + 0.35 * Math.sin(t * 4);
    });
  }
  if (text) {
    const l = label(text, { bg: ghost ? 'rgba(15,29,51,.75)' : '#0f1d33', fg: hex(color), border: hex(color), size: 0.55 });
    l.position.set(0, LABEL_Y(pose), 0);
    g.add(l);
    g.userData.label = l;
  }
  g.userData.body = body;
  g.userData.pose = pose;
  stage.scene.add(g);
  return g;
}

// ---------- Zonas, flechas y marcas ----------

export function addZone(stage, { x, z, w, d, color, text }) {
  const geo = new THREE.PlaneGeometry(w, d);
  const fill = flat(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }), x, 0.01, z);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color }));
  edge.rotation.x = -Math.PI / 2;
  edge.position.set(x, 0.012, z);
  stage.scene.add(fill, edge);
  const rm = stage.tick((t) => {
    if (!fill.parent) return rm(); // la zona se borró (efectos temporales)
    fill.material.opacity = 0.22 + 0.12 * Math.sin(t * 3 + x);
  });
  if (text) {
    const l = label(text, { bg: hex(color), fg: '#08111f', size: 0.7 });
    l.position.set(x, 0.6, z);
    stage.scene.add(l);
  }
}

export function floorArrow(stage, from, to, color, opacity = 0.9) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const L = Math.hypot(dx, dz);
  const head = Math.min(0.55, L * 0.4);
  const s = new THREE.Shape();
  s.moveTo(0, -0.09);
  s.lineTo(L - head, -0.09);
  s.lineTo(L - head, -0.28);
  s.lineTo(L, 0);
  s.lineTo(L - head, 0.28);
  s.lineTo(L - head, 0.09);
  s.lineTo(0, 0.09);
  s.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  g.position.set(from[0], 0.015, from[1]);
  g.rotation.y = Math.atan2(-dz, dx);
  stage.scene.add(g);
}

export function bounceMark(stage, x, z, color = C.ball) {
  const r = flat(new THREE.RingGeometry(0.14, 0.24, 32), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }), x, 0.014, z);
  stage.scene.add(r);
}

// ---------- Trayectorias ----------

// Parábola aproximada entre p0 y p1 (cada uno [x, y, z]) con altura máxima ~apex.
export function arc(p0, p1, apex, n = 48) {
  const c = 2 * apex - 0.5 * (p0[1] + p1[1]);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push(new THREE.Vector3(
      p0[0] + (p1[0] - p0[0]) * t,
      u * u * p0[1] + 2 * t * u * c + t * t * p1[1],
      p0[2] + (p1[2] - p0[2]) * t,
    ));
  }
  return pts;
}

export function joinArcs(...arcs) {
  return arcs.reduce((all, a, i) => all.concat(i === 0 ? a : a.slice(1)), []);
}

const dotGeo = new THREE.SphereGeometry(0.05, 10, 8);

export function drawPath(stage, pts, { color = C.ball, opacity = 1, spacing = 0.32, shadow = true } = {}) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
  let acc = spacing;
  for (let i = 1; i < pts.length; i++) {
    acc += pts[i].distanceTo(pts[i - 1]);
    if (acc >= spacing) {
      acc = 0;
      const d = new THREE.Mesh(dotGeo, mat);
      d.position.copy(pts[i]);
      stage.scene.add(d);
    }
  }
  if (shadow) {
    const sp = pts.map((p) => new THREE.Vector3(p.x, 0.013, p.z));
    const l = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(sp),
      new THREE.LineDashedMaterial({ color: 0x000000, transparent: true, opacity: 0.45 * opacity, dashSize: 0.22, gapSize: 0.16 }),
    );
    l.computeLineDistances();
    stage.scene.add(l);
  }
}

export function animateBall(stage, pts, { speed = 8, pause = 0.9 } = {}) {
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = dist[dist.length - 1];
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 20, 14),
    new THREE.MeshStandardMaterial({ color: C.ball, emissive: C.ball, emissiveIntensity: 0.45 }),
  );
  const sh = flat(new THREE.CircleGeometry(0.12, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }), 0, 0.016, 0);
  stage.scene.add(ball, sh);
  stage.tick((t) => {
    const d = Math.min((t * speed) % (total + pause * speed), total);
    let i = 1;
    while (i < dist.length - 1 && dist[i] < d) i++;
    const k = (d - dist[i - 1]) / (dist[i] - dist[i - 1] || 1);
    ball.position.lerpVectors(pts[i - 1], pts[i], k);
    sh.position.set(ball.position.x, 0.016, ball.position.z);
  });
}

// Línea vertical punteada del piso a un punto, con la altura escrita.
export function heightMarker(stage, p, text, color = C.white) {
  const l = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x, 0, p.z), p.clone()]),
    new THREE.LineDashedMaterial({ color, dashSize: 0.12, gapSize: 0.08 }),
  );
  l.computeLineDistances();
  const tag = label(text, { bg: '#0f1d33', fg: hex(color), border: hex(color), size: 0.55 });
  tag.position.set(p.x, p.y + 0.5, p.z);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), new THREE.MeshBasicMaterial({ color }));
  dot.position.copy(p);
  stage.scene.add(l, tag, dot);
}

export function floatLabel(stage, text, [x, y, z], color = C.white) {
  const l = label(text, { bg: '#0f1d33', fg: hex(color), border: hex(color), size: 0.5 });
  l.position.set(x, y, z);
  stage.scene.add(l);
}
