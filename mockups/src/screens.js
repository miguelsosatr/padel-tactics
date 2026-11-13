import {
  C, createStage, addPlayer, addZone, floorArrow, bounceMark,
  arc, joinArcs, drawPath, animateBall, heightMarker, floatLabel,
} from './scene.js';

// Altura del golpe de saque: por debajo de la cintura (reglamento)
const SERVE_HIT = [2.3, 0.8, 7.5];

// ---------- Pantalla 2: ¿A dónde sacas? ----------
{
  const s = createStage(document.getElementById('stage-serve'), { cam: [3, 9.5, 16], target: [-0.6, 0, 0.6] });
  addPlayer(s, { x: 2.5, z: 7.8, color: C.user, text: 'Tú', you: true, pose: 'serve' });
  addPlayer(s, { x: -2.5, z: 2.8, color: C.partner, text: 'Compañero' });
  addPlayer(s, { x: -2.6, z: -8.7, color: C.rival, text: 'Resta', facing: 1 });
  addPlayer(s, { x: 2.5, z: -5.8, color: C.rival, text: 'Rival', facing: 1 });

  const zones = [
    { x: -0.75, text: 'A', color: 0xd7f548 },
    { x: -4.25, text: 'B', color: 0x7cc7ff },
    { x: -2.5, text: 'C', color: 0xc79bff },
  ];
  for (const z of zones) {
    addZone(s, { x: z.x, z: -5.9, w: 1.2, d: 1.6, color: z.color, text: z.text });
    drawPath(s, arc(SERVE_HIT, [z.x, 0, -5.9], 1.9), { color: z.color, opacity: 0.35, spacing: 0.45, shadow: false });
  }
}

// ---------- Pantalla 3: feedback "te quedaste atrás" ----------
{
  const s = createStage(document.getElementById('stage-feedback'), { cam: [5, 10.5, 16.5], target: [0, 0, 1.6] });
  addPlayer(s, { x: 2.5, z: 8.6, color: C.user, text: 'Tú', you: true });
  addPlayer(s, { x: 2.45, z: 3.0, color: C.good, text: 'Aquí deberías estar', ghost: true });
  floorArrow(s, [2.5, 7.9], [2.45, 3.7], C.good, 0.85);
  addPlayer(s, { x: -2.5, z: 2.8, color: C.partner, text: 'Compañero' });
  addPlayer(s, { x: -2.7, z: -8.5, color: C.rival, text: 'Resta', facing: 1, pose: 'lob' });
  addPlayer(s, { x: 2.5, z: -3.2, color: C.rival, text: 'Sube a la red', facing: 1 });
  floorArrow(s, [2.5, -5.9], [2.5, -3.9], C.rival, 0.8);

  const serve = arc(SERVE_HIT, [-4.2, 0, -5.9], 1.9);
  const toReceiver = arc([-4.2, 0, -5.9], [-2.9, 0.95, -8.2], 1.3, 20);
  const ret = arc([-2.9, 0.95, -8.2], [2.0, 0, 6.6], 1.45);
  const toYou = arc([2.0, 0, 6.6], [2.45, 0.45, 8.2], 0.7, 16);
  const pts = joinArcs(serve, toReceiver, ret, toYou);
  drawPath(s, pts, { spacing: 0.4 });
  bounceMark(s, -4.2, -5.9);
  bounceMark(s, 2.0, 6.6, C.bad);
  floatLabel(s, 'Resto cómodo a tus pies', [1.6, 1.3, 6.2], C.bad);
  animateBall(s, pts, { speed: 9 });
}

// ---------- Pantalla 4: feedback amarillo "Depende" (saque a la T contra el drive) ----------
{
  const s = createStage(document.getElementById('stage-depends'), { cam: [-0.2, 5.2, 2.6], target: [-1.6, 0.6, -6.8] });
  addPlayer(s, { x: 2.5, z: 7.8, color: C.user, text: 'Tú', you: true, pose: 'serve' });
  addPlayer(s, { x: -2.5, z: 2.8, color: C.partner, text: 'Compañero' });
  addPlayer(s, { x: -2.7, z: -8.4, color: C.rival, text: 'Rival de drive', facing: 1, pose: 'backhand' });
  addPlayer(s, { x: 2.5, z: -5.8, color: C.rival, text: 'Rival', facing: 1 });

  addZone(s, { x: -0.75, z: -5.9, w: 1.2, d: 1.6, color: C.ok, text: 'T' });
  // Alternativa más habitual (al vidrio), en tenue
  drawPath(s, arc(SERVE_HIT, [-4.25, 0, -5.9], 1.9), { color: 0x7cc7ff, opacity: 0.25, spacing: 0.45, shadow: false });

  const serve = arc(SERVE_HIT, [-0.75, 0, -5.9], 1.9);
  const toBackhand = arc([-0.75, 0, -5.9], [-1.9, 0.85, -8.2], 1.15, 20);
  const pts = joinArcs(serve, toBackhand);
  drawPath(s, pts, { spacing: 0.38 });
  bounceMark(s, -0.75, -5.9, C.ok);
  floatLabel(s, 'Le llega a su revés', [-1.2, 1.9, -8.0], C.ok);
  animateBall(s, pts, { speed: 8 });
}

// ---------- Pantalla 5: globo del rival, ¿qué golpe usas? ----------
{
  const s = createStage(document.getElementById('stage-lob'), { cam: [10.5, 3.4, 5.2], target: [0, 2.7, 3.6], fov: 44 });
  addPlayer(s, { x: 2.4, z: 5.8, color: C.user, text: 'Tú', you: true, pose: 'overhead' });
  floorArrow(s, [2.4, 2.9], [2.4, 5.1], C.user, 0.6);
  addPlayer(s, { x: -2.5, z: 3.0, color: C.partner, text: 'Compañero' });
  addPlayer(s, { x: -2.6, z: -8.5, color: C.rival, text: 'Rival', facing: 1, pose: 'lob' });
  addPlayer(s, { x: 2.5, z: -8.0, color: C.rival, text: 'Rival', facing: 1 });

  const lob = arc([-2.6, 0.9, -8.3], [2.3, 0, 8.4], 6.2, 70);
  const after = arc([2.3, 0, 8.4], [2.38, 1.7, 9.95], 2.1, 16);
  drawPath(s, lob, { spacing: 0.38 });
  drawPath(s, after, { opacity: 0.35, spacing: 0.3 });
  bounceMark(s, 2.3, 8.4);

  const peak = lob.reduce((a, b) => (b.y > a.y ? b : a));
  heightMarker(s, peak, `Altura máx. ${peak.y.toFixed(1)} m`, C.white);
  // Punto de impacto: donde la pelota pasa sobre la posición del jugador
  const hit = lob.reduce((a, b) => (Math.abs(b.z - 5.8) < Math.abs(a.z - 5.8) ? b : a));
  heightMarker(s, hit, `Le pegas a ${hit.y.toFixed(1)} m`, C.user);
  document.getElementById('lob-hit-height').textContent = `${hit.y.toFixed(1)} m`;
  animateBall(s, joinArcs(lob, after), { speed: 10 });
}
