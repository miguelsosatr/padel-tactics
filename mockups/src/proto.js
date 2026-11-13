// Prototipo jugable: un punto completo, decisión → animación → siguiente decisión,
// hasta ganar o perder el punto; después la transición al siguiente punto.
import {
  C, createStage, addPlayer, setPose, moveTo, placePlayer, createBall, flyBall, pathInfo,
  tweenCamera, wait, arc, joinArcs, drawPath, addZone, bounceMark, heightMarker, fxLayer,
  floorArrow, floatLabel,
} from './scene.js';

{
  const $ = (id) => document.getElementById(id);
  const sheet = $('proto-sheet');
  const backEl = $('proto-back');

  // m = 1: sacas desde la derecha (lado del drive); m = -1: desde la izquierda (lado del revés)
  const S = { m: 1, point: 1, score: [0, 0], scoreBefore: null, choices: [], stack: [], node: null, view: null, pending: null, busy: false };
  const X = (x) => x * S.m;

  // Cuando sacas desde el lado del revés (m = -1) juegan en formación australiana (escenario E1):
  // tú sacas cerca del centro, tu compañero espera en la red de ese mismo lado y tú cruzas
  // en diagonal a la red de tu lado (derecha). Después del saque tú siempre terminas a la
  // derecha (x > 0) y tu compañero a la izquierda (x < 0), así que esas coordenadas no usan X().
  const aus = () => S.m === -1;
  const serveSpot = () => (aus() ? [-0.6, 7.8] : [2.5, 7.8]);
  const partnerSpot = () => (aus() ? [-1.5, 2.8] : [-2.5, 2.8]);
  const serveHitPos = () => [serveSpot()[0] - 0.2 * S.m, 0.8, 7.5];
  const drawRun = () => {
    if (!aus()) return;
    floorArrow(fx, [serveSpot()[0] + 0.4, 7.2], [2.2, 3.7], C.user, 0.45);
    floatLabel(fx, 'Tu camino a la red', [1.1, 0.9, 5.4], C.user);
  };

  const CAM = {
    serve: () => [[X(3), 9.5, 16], [X(-0.6), 0, 0.6]],
    lob: () => [[10.5, 3.4, 5.2], [0, 2.7, 3.6]],
    wide: () => [[X(4.5), 13, 15.5], [0, 0, 0]],
  };

  const stage = createStage($('proto-stage'), { cam: CAM.serve()[0], target: CAM.serve()[1] });
  const fx = fxLayer(stage);
  const user = addPlayer(stage, { x: 2.5, z: 7.8, color: C.user, text: 'Tú', you: true, pose: 'serve' });
  const partner = addPlayer(stage, { x: -2.5, z: 2.8, color: C.partner, text: 'Compañero' });
  const rDrive = addPlayer(stage, { x: -2.6, z: -8.6, color: C.rival, text: 'Rival · drive', facing: 1 });
  const rReves = addPlayer(stage, { x: 2.5, z: -5.8, color: C.rival, text: 'Rival · revés', facing: 1 });
  const ball = createBall(stage);
  const rec = () => (S.m === 1 ? rDrive : rReves); // quien resta (en diagonal)
  const recP = () => (S.m === 1 ? rReves : rDrive);
  const choice = (node) => S.choices.find((c) => c.node === node)?.id;

  function startLayout() {
    placePlayer(user, serveSpot(), 'serve');
    placePlayer(partner, partnerSpot(), 'ready');
    placePlayer(rec(), [X(-2.6), -8.6], 'ready');
    placePlayer(recP(), [X(2.5), -5.8], 'ready');
    ball.show(false);
  }

  // ---------- Contenido: decisiones y feedback ----------

  const NODES = {
    speed: {
      kicker: 'Decisión · Saque', short: 'Tipo de saque',
      ctx: () => (S.m === 1
        ? 'Sacas desde la derecha (tu lado de drive) hacia el rival de drive.'
        : 'Ahora sacas desde el lado del revés, en formación australiana: tu compañero espera en la red de este lado y tú, al sacar, cruzas a la red de tu lado (derecha).'),
      q: '¿Cómo sacas?',
      opts: [
        { id: 'lento', t: 'Lento con efecto', d: 'Más control y colocación', s: 'Lento' },
        { id: 'rapido', t: 'Rápido y plano', d: 'Más velocidad, menos control', s: 'Rápido' },
      ],
      fx: () => drawRun(),
      fb: (id) => {
        if (aus()) {
          return id === 'lento'
            ? { r: 'g', ev: ['fed', 'study'], title: 'Saque con efecto, profundo y a velocidad media', body: 'En australiana tienes que cruzar en diagonal hasta la red de tu lado. Este saque te da el tiempo para llegar.', src: 'Guía de saque de la LTA; en australiana el sacador corre más metros y más rápido (Ramón-Llin et al., 2021).' }
            : { r: 'a', ev: ['study', 'cons'], title: 'Saque rápido y plano', body: 'Lo que ganas en velocidad lo pierdes en tiempo para cruzar a tu lado.', yes: ['Eres rápido de piernas y es tu primer saque.', 'El restador se incomoda con la velocidad.'], warn: ['El resto regresa antes de que llegues y el paralelo cae en el hueco que vas cubriendo.'], src: 'Contra la australiana los restadores juegan más paralelo (Cerrillo-Lafuente et al., 2025).' };
        }
        return id === 'lento'
          ? { r: 'g', ev: ['cons'], title: 'Saque lento con efecto', body: 'Es el saque que más se enseña: te da tiempo de subir a la red antes de que el rival reste y es más fácil de colocar.' }
          : { r: 'a', ev: ['cons'], title: 'Saque rápido y plano', body: 'Puede sorprender, pero la pelota regresa igual de rápido.', yes: ['Lo usas de sorpresa, de vez en cuando.'], warn: ['El resto te puede agarrar a media pista, antes de llegar a la red.', 'Plano y fuerte, es más fácil fallarlo.'] };
      },
      after: async () => 'dir',
    },

    dir: {
      kicker: 'Decisión · Saque', short: 'Dirección',
      q: '¿A dónde mandas el saque?',
      opts: [
        { id: 'T', t: 'A la T', d: 'Al centro, cerca de la línea de saque', s: 'A la T' },
        { id: 'vidrio', t: 'Al vidrio', d: 'Hacia la pared lateral del que resta', s: 'Al vidrio' },
        { id: 'cuerpo', t: 'Al cuerpo', d: 'Directo a donde está parado el que resta', s: 'Al cuerpo' },
      ],
      fx: () => {
        const z = [['T', -0.75, 0xd7f548], ['vidrio', -4.25, 0x7cc7ff], ['cuerpo', -2.4, 0xc79bff]];
        z.forEach(([, x, color], i) => {
          addZone(fx, { x: X(x), z: -5.9, w: 1.2, d: 1.6, color, text: 'ABC'[i] });
          drawPath(fx, arc(serveHitPos(), [X(x), 0, -5.9], 1.9), { color, opacity: 0.3, spacing: 0.45, shadow: false });
        });
        drawRun();
      },
      fb: (id) => {
        const study = 'En profesionales casi todos sacan al vidrio, pero la T se asoció con más puntos ganados (Mauro et al., 2025).';
        if (id === 'vidrio') {
          return { r: 'g', ev: ['study'], title: 'Saque al vidrio',
            body: S.m === 1
              ? 'Es el saque más usado: la pelota se abre hacia la pared lateral y obliga a restar con el vidrio.'
              : 'Es el saque más usado, y contra el de revés además le llega por su lado de revés.',
            src: 'Más del 78 % de los saques de hombres profesionales van al vidrio (Bueno-García et al., 2024).' };
        }
        if (id === 'T') {
          return S.m === 1
            ? { r: 'a', ev: ['study', 'cons'], title: 'Saque a la T contra el de drive', body: 'La T le queda a su revés. No es mala idea; depende del rival.', yes: ['Su revés es más débil que su derecha.', 'Lo alternas con el vidrio para que no se acomode.'], warn: ['Tiene buen revés y el saque te queda sin efecto.'], src: study }
            : { r: 'a', ev: ['study', 'cons'], title: 'Saque a la T contra el de revés', body: 'Contra un diestro que juega de revés, la T le queda a su derecha.', yes: ['Lo usas de sorpresa porque casi siempre le sacas al vidrio.'], warn: ['Tiene buena derecha: resta cómodo por el centro.'], src: study };
        }
        return { r: 'a', ev: ['cons'], title: 'Saque al cuerpo', body: 'Le quitas espacio para preparar el golpe.', yes: ['Lleva velocidad y le llega pegado al cuerpo.'], warn: ['Queda lento o corto: tiene tiempo de acomodarse.'] };
      },
      after: (id) => animServe(id),
    },

    move: {
      kicker: 'Decisión · Después de sacar', short: 'Después de sacar',
      ctx: () => 'La pelota va hacia el rival que resta.',
      fx: () => {
        drawPath(fx, S.servePath, { opacity: 0.35, spacing: 0.45 });
        bounceMark(fx, S.bounce[0], S.bounce[2]);
        drawRun();
      },
      q: '¿Qué haces tú?',
      get opts() {
        return [
          { id: 'red', t: aus() ? 'Cruzo a la red de mi lado' : 'Subo a la red', d: aus() ? 'En diagonal, hasta la derecha' : 'Junto a mi compañero', s: 'A la red' },
          { id: 'mitad', t: 'Me quedo a media pista', d: 'A ver qué hace el rival', s: 'Media pista' },
          { id: 'atras', t: 'Me quedo en el fondo', d: 'Espero el resto desde atrás', s: 'Atrás' },
        ];
      },
      fb: (id) => ({
        red: { r: 'g', ev: ['study'], title: aus() ? 'Cruzar a la red de tu lado' : 'Subir a la red', body: aus() ? 'En australiana cruzas en diagonal a la red de tu lado; tu compañero ya cubre el cruzado.' : 'Después de sacar, la idea es ganar la red junto a tu compañero.', src: 'Más del 80 % de los puntos en profesional se ganan desde la red (Courel-Ibáñez et al., 2015).' },
        mitad: { r: 'r', ev: ['cons'], title: 'Quedarte a media pista', body: aus() ? 'Te quedas a medio camino: el lado derecho queda abierto para un resto paralelo.' : 'Es la zona más difícil: no estás ni en la red ni atrás, y el rival puede tirarte la pelota a los pies.' },
        atras: { r: 'r', ev: aus() ? ['fed', 'study'] : ['cons'], title: 'Quedarte en el fondo', body: aus() ? 'En australiana tu lado queda vacío: el rival solo tiene que jugar paralelo.' : 'Le regalas la red a la pareja rival y dejas a tu compañero solo adelante.' },
      })[id],
      after: (id) => animMove(id),
    },

    lob: {
      kicker: 'Decisión · Te tiran un globo', short: 'Globo',
      ctx: () => 'Estás en la red y el rival te pasa un globo a media altura. Ya vas retrocediendo.',
      q: '¿Qué golpe usas?',
      opts: [
        { id: 'remate', t: 'Remate', d: 'Pegarle con todo para cerrar el punto', s: 'Remate' },
        { id: 'bandeja', t: 'Bandeja', d: 'Por arriba, controlado, sin mucha potencia', s: 'Bandeja' },
        { id: 'vibora', t: 'Víbora', d: 'Por arriba con efecto lateral, más agresiva', s: 'Víbora' },
        { id: 'botar', t: 'Dejarla botar', d: 'Ir atrás y jugarla después del vidrio', s: 'La dejo botar' },
      ],
      fx: () => {
        drawPath(fx, S.lob, { opacity: 0.35, spacing: 0.4 });
        heightMarker(fx, S.hitP, `Le pegas a ${S.hitP.y.toFixed(1)} m`, C.user);
      },
      fb: (id) => ({
        bandeja: { r: 'g', ev: ['study'], title: 'Bandeja', body: 'Golpe controlado que te deja seguir en la red.', src: 'La bandeja da continuidad al punto en ~90 % de los casos (Sánchez-Alcaraz et al., 2020).' },
        remate: { r: 'r', ev: ['study'], title: 'Remate fuerte desde media pista', body: 'Lejos de la red el remate pierde eficacia: la pelota regresa del vidrio y el rival defiende.', src: 'El remate pierde eficacia al alejarse de la red (Sánchez-Alcaraz et al., 2020).' },
        vibora: { r: 'a', ev: ['cons'], title: 'Víbora', body: 'Más agresiva que la bandeja, con efecto lateral.', yes: ['Dominas el golpe y la pelota te llega a buena altura.'], warn: ['Es más difícil: arriesgas un error no forzado.'] },
        botar: { r: 'a', ev: ['cons'], title: 'Dejarla botar', body: 'Válido cuando el globo te rebasa, pero pierdes la red.', yes: ['El globo es muy profundo y no llegas bien por arriba.'], warn: ['Le das la red a los rivales.'] },
      })[id],
      after: (id) => animLob(id),
    },
  };

  // ---------- Animaciones ----------

  function playing(text) {
    sheet.innerHTML = `<div class="kicker">▶ Jugando el punto</div><div class="q" style="font-size:16px;font-weight:650">${text}</div>
      <div class="btns"><div class="btn sec" data-act="skip">⏩ Saltar animación</div></div>`;
  }

  async function animServe(dir) {
    fx.clear();
    const fast = choice('speed') === 'rapido';
    const tx = { T: -0.75, vidrio: -4.25, cuerpo: -2.4 }[dir];
    const rp = rec().position;
    const hit = serveHitPos();
    const bounce = [X(tx), 0, -5.9];
    S.recHit = [(bounce[0] + rp.x) / 2, 0.9, rp.z + 0.4];
    const serveArc = arc(hit, bounce, fast ? 1.45 : 2.0);
    S.afterArc = arc(bounce, S.recHit, fast ? 1.4 : 1.1, 20);
    S.servePath = joinArcs(serveArc, S.afterArc);
    S.bounce = bounce;
    drawPath(fx, S.servePath, { opacity: 0.35, spacing: 0.45 });
    playing(fast ? 'Sacas rápido y plano…' : 'Sacas lento con efecto…');
    await tweenCamera(stage, ...CAM.serve(), 0.4);
    ball.set(serveArc[0]);
    ball.show(true);
    await Promise.all([setPose(stage, user, 'serveHit', 0.25), flyBall(stage, ball, serveArc, fast ? 0.55 : 1.0)]);
    bounceMark(fx, bounce[0], bounce[2]);
    await Promise.all([
      flyBall(stage, ball, S.afterArc, fast ? 0.15 : 0.3, 0, 0.5),
      moveTo(stage, rec(), [S.recHit[0], rp.z], 0.35),
      setPose(stage, user, 'ready', 0.3),
    ]);
    return 'move';
  }

  async function animMove(id) {
    const fast = choice('speed') === 'rapido';
    const finish = flyBall(stage, ball, S.afterArc, fast ? 0.15 : 0.35, 0.5, 1);

    if (id === 'red' && !fast) {
      playing(aus() ? 'Cruzas en diagonal a la red de tu lado mientras el rival resta…' : 'Subes a la red mientras el rival resta…');
      await Promise.all([moveTo(stage, user, [2.45, 3.0], aus() ? 1.3 : 1.1), finish.then(() => setPose(stage, rec(), 'lob', 0.25))]);
      const lob = arc(S.recHit, [2.3, 0, 8.4], 6.2, 70);
      let idx = 0;
      lob.forEach((p, i) => { if (i > 10 && Math.abs(p.z - 5.8) < Math.abs(lob[idx].z - 5.8)) idx = i; });
      const info = pathInfo(lob.slice(0, idx + 1));
      const frac = info.total / pathInfo(lob).total;
      S.lob = lob;
      S.hitP = lob[idx].clone();
      fx.clear();
      drawPath(fx, lob, { opacity: 0.35, spacing: 0.4 });
      playing('¡El rival te tira un globo!');
      await Promise.all([
        flyBall(stage, ball, lob, 1.7, 0, frac),
        tweenCamera(stage, ...CAM.lob(), 1.2),
        moveTo(stage, recP(), [X(2.5), -8.2], 1.2),
        (async () => { await wait(stage, 0.3); await moveTo(stage, user, [2.4, 5.8], 1.0); await setPose(stage, user, 'overhead', 0.3); })(),
      ]);
      return 'lob';
    }

    if (aus()) {
      // Australiana (escenario E1): todavía vas cruzando y el resto paralelo cae en el hueco de tu lado
      const stop = { red: [1.2, 5.4], mitad: [0.5, 6.1], atras: serveSpot() }[id];
      playing({
        red: 'Tu saque rápido regresó rápido: todavía vas cruzando…',
        mitad: 'Te detienes a medio camino de tu lado…',
        atras: 'Te quedas atrás y tu lado queda vacío…',
      }[id]);
      addZone(fx, { x: 2.7, z: 5.4, w: 2.2, d: 3.6, color: C.bad, text: 'Hueco' });
      await Promise.all([
        moveTo(stage, user, stop, fast ? 0.5 : 0.8),
        finish.then(() => setPose(stage, rec(), 'backhand', 0.2)),
        tweenCamera(stage, ...CAM.wide(), 0.8),
      ]);
      const pass = joinArcs(arc(S.recHit, [3.1, 0, 4.4], 1.35), arc([3.1, 0, 4.4], [3.6, 0.8, 9.95], 1.1, 18));
      drawPath(fx, pass, { color: C.bad, opacity: 0.6, spacing: 0.4 });
      floatLabel(fx, 'Resto paralelo', [3.0, 1.7, -2.0], C.bad);
      await Promise.all([
        flyBall(stage, ball, pass, 1.3),
        (async () => { await setPose(stage, user, 'volley', 0.2); await moveTo(stage, user, [stop[0] + 0.9, stop[1] - 0.2], 0.5); })(),
      ]);
      await wait(stage, 0.3);
      return {
        end: true, won: false,
        reason: {
          red: 'Formación australiana: con el saque rápido no alcanzaste a cruzar a tu lado y el resto paralelo cayó en el hueco que ibas cubriendo.',
          mitad: 'Te quedaste a medio camino: tu lado quedó abierto y el rival jugó paralelo al hueco.',
          atras: 'En australiana tienes que cruzar a tu lado: al quedarte atrás, el rival jugó paralelo al lado vacío.',
        }[id],
      };
    }

    if (id === 'atras') {
      playing('Te quedas en el fondo y los rivales aprovechan para subir…');
      await finish;
      setPose(stage, rec(), 'ready', 0.2);
      const ret = joinArcs(arc(S.recHit, [X(2.1), 0, 6.4], 1.4), arc([X(2.1), 0, 6.4], [X(2.45), 0.6, 8.3], 0.75, 16));
      drawPath(fx, ret, { opacity: 0.35, spacing: 0.4 });
      await Promise.all([
        flyBall(stage, ball, ret, 1.1),
        moveTo(stage, recP(), [X(2.4), -3.0], 1.1),
        moveTo(stage, rec(), [X(-2.4), -3.2], 1.2),
        tweenCamera(stage, ...CAM.wide(), 1.1),
      ]);
      await setPose(stage, user, 'volley', 0.15);
      const shot = arc([X(2.45), 0.6, 8.3], [X(2.2), 1.1, -2.7], 1.35);
      await flyBall(stage, ball, shot, 0.8);
      await setPose(stage, recP(), 'serveHit', 0.12);
      const win = joinArcs(arc([X(2.2), 1.1, -2.7], [X(-0.6), 0, 4.8], 1.2), arc([X(-0.6), 0, 4.8], [X(-0.9), 0.4, 9.9], 0.9, 16));
      await flyBall(stage, ball, win, 0.8);
      return { end: true, won: false, reason: 'Desde el fondo le diste la red a la pareja rival y terminaron el punto con volea.' };
    }

    // Media pista, o subir a la red después de un saque rápido: el resto te agarra a los pies
    playing(id === 'red'
      ? 'Tu saque rápido regresó rápido: no alcanzas a llegar a la red…'
      : 'Te quedas a media pista y el rival lo ve…');
    await Promise.all([moveTo(stage, user, [X(2.5), 5.3], id === 'red' ? 0.6 : 0.5), finish.then(() => setPose(stage, rec(), 'backhand', 0.2))]);
    const low = arc(S.recHit, [X(2.3), 0.15, 5.1], 1.25);
    drawPath(fx, low, { opacity: 0.35, spacing: 0.4 });
    await Promise.all([flyBall(stage, ball, low, 0.75), setPose(stage, user, 'volley', 0.4), tweenCamera(stage, [X(7), 4.5, 10], [0, 0.6, 2], 0.8)]);
    const fail = arc([X(2.3), 0.15, 5.1], [X(1.6), 0.4, 0.06], 0.75);
    await flyBall(stage, ball, fail, 0.6);
    await wait(stage, 0.3);
    return {
      end: true, won: false,
      reason: id === 'red'
        ? 'Con el saque rápido no te dio tiempo de llegar a tu lugar en la red: el resto te cayó a los pies y la volea se fue a la red.'
        : 'A media pista el resto te cayó a los pies y la volea se fue a la red.',
    };
  }

  async function animLob(id) {
    fx.clear();
    const h = S.hitP;
    const hp = [h.x, h.y, h.z];

    if (id === 'botar') {
      playing('La dejas pasar y la juegas después del vidrio…');
      const rest = joinArcs(arc(hp, [2.3, 0, 8.4], h.y + 0.1, 20), arc([2.3, 0, 8.4], [2.38, 1.7, 9.95], 2.1, 16), arc([2.38, 1.7, 9.95], [2.2, 1.0, 8.6], 1.8, 12));
      await Promise.all([setPose(stage, user, 'ready', 0.2), moveTo(stage, user, [2.3, 9.2], 0.9), flyBall(stage, ball, rest, 1.1), tweenCamera(stage, ...CAM.wide(), 1.1)]);
      await setPose(stage, user, 'lob', 0.15);
      const myLob = arc([2.2, 1.0, 8.6], [X(-1.0), 0, -8.2], 6.0, 60);
      drawPath(fx, myLob, { opacity: 0.3, spacing: 0.45 });
      await Promise.all([
        flyBall(stage, ball, myLob, 1.6, 0, 0.55),
        moveTo(stage, rec(), [X(-2.4), -3.0], 1.2),
        moveTo(stage, recP(), [X(2.4), -3.0], 1.2),
        moveTo(stage, partner, [-2.5, 7.6], 1.4),
      ]);
      await setPose(stage, rec(), 'overhead', 0.2);
      await setPose(stage, rec(), 'overheadHit', 0.15);
      const smash = arc([X(-1.0), 3.2, -3.3], [X(0.2), 0, 5.5], 3.3);
      await flyBall(stage, ball, joinArcs(smash, arc([X(0.2), 0, 5.5], [X(0.4), 1.2, 9.95], 1.6, 14)), 0.75);
      return { end: true, won: false, reason: 'Jugar desde atrás es válido, pero perdiste la red y los rivales terminaron el punto desde arriba.' };
    }

    if (id === 'remate') {
      playing('Rematas fuerte desde media pista…');
      await setPose(stage, user, 'overheadHit', 0.15);
      const smash = joinArcs(arc(hp, [X(-1.2), 0, -5.8], h.y + 0.1), arc([X(-1.2), 0, -5.8], [X(-1.4), 2.0, -9.95], 2.6, 20), arc([X(-1.4), 2.0, -9.95], [X(-1.6), 1.0, -8.1], 2.1, 14));
      drawPath(fx, smash, { opacity: 0.35, spacing: 0.4 });
      await Promise.all([flyBall(stage, ball, smash, 1.2), moveTo(stage, rec(), [X(-1.7), -8.4], 1.0), tweenCamera(stage, ...CAM.wide(), 1.1), moveTo(stage, user, [2.45, 4.4], 1.0)]);
      await setPose(stage, rec(), 'lob', 0.15);
      const pass = joinArcs(arc([X(-1.6), 1.0, -8.1], [1.0, 0, 6.8], 1.5), arc([1.0, 0, 6.8], [1.3, 0.5, 9.9], 0.9, 14));
      drawPath(fx, pass, { color: C.bad, opacity: 0.5, spacing: 0.4 });
      await flyBall(stage, ball, pass, 1.0);
      return { end: true, won: false, reason: 'El remate lejos de la red regresó del vidrio; el rival defendió y te pasó por el centro.' };
    }

    // Bandeja o víbora: mantienes la red y tu compañero cierra el punto
    const vib = id === 'vibora';
    playing(vib ? 'Juegas una víbora hacia el vidrio lateral…' : 'Juegas una bandeja controlada…');
    await setPose(stage, user, 'overheadHit', 0.2);
    const tgt = vib ? [X(-4.2), 0, -7.0] : [X(-3.0), 0, -7.6];
    const glass = vib ? [X(-4.95), 1.1, -8.0] : [X(-3.3), 1.2, -9.95];
    const shot = joinArcs(arc(hp, tgt, h.y + 0.2), arc(tgt, glass, 1.5, 14), arc(glass, [X(-2.9), 1.0, -8.7], 1.4, 12));
    drawPath(fx, shot, { opacity: 0.35, spacing: 0.4 });
    await Promise.all([
      flyBall(stage, ball, shot, vib ? 1.0 : 1.3),
      moveTo(stage, rec(), [X(-2.9), -9.1], 0.9),
      moveTo(stage, user, [2.45, 3.4], 1.2),
      tweenCamera(stage, ...CAM.wide(), 1.1),
    ]);
    await setPose(stage, rec(), 'backhand', 0.15);
    const weak = arc([X(-2.9), 1.0, -8.7], [-1.9, 1.2, 2.5], 2.4);
    drawPath(fx, weak, { opacity: 0.35, spacing: 0.4 });
    await Promise.all([flyBall(stage, ball, weak, 0.9), moveTo(stage, partner, [-2.0, 2.9], 0.6)]);
    await setPose(stage, partner, 'serveHit', 0.12);
    const winner = joinArcs(arc([-1.9, 1.2, 2.5], [X(0.2), 0, -6.4], 1.3), arc([X(0.2), 0, -6.4], [X(0.5), 0.5, -9.95], 0.9, 14));
    drawPath(fx, winner, { color: C.good, opacity: 0.6, spacing: 0.4 });
    await flyBall(stage, ball, winner, 0.7);
    return {
      end: true, won: true,
      reason: vib
        ? 'La víbora salió bien: el rival defendió como pudo y tu compañero cerró con volea.'
        : 'Tu bandeja te mantuvo en la red: el rival defendió como pudo y tu compañero cerró con volea.',
    };
  }

  // ---------- Flujo: decisiones, historial y pantallas ----------

  const PTS = ['0', '15', '30', '40'];
  const RATE = {
    g: '<span class="badge ok">✓ Óptimo</span>',
    a: '<span class="badge dep">◐ Depende</span>',
    r: '<span class="badge err">✕ Error común</span>',
  };
  const EV = { fed: '<span class="ev fed">FEDERATIVO</span>', study: '<span class="ev study">ESTUDIO</span>', cons: '<span class="ev cons">CONSENSO + LÓGICA</span>' };

  const formation = document.createElement('div');
  formation.className = 'hud tl';
  $('proto-stage').appendChild(formation);

  function header() {
    formation.textContent = aus() ? 'Formación australiana' : 'Formación convencional';
    $('proto-title').textContent = `Punto ${S.point} · Sacas tú`;
    $('proto-score').textContent = `${PTS[S.score[0]]} - ${PTS[S.score[1]]}`;
    const chips = S.choices.map((c, i) => `<span class="chip"><i class="dot ${c.r}"></i>${i + 1} · ${c.s}</span>`);
    if (S.view === 'question' || S.view === 'feedback') {
      chips.push(`<span class="chip now"><i class="dot n"></i>${S.choices.length + 1} · ${NODES[S.node].short}</span>`);
    }
    const trail = $('proto-trail');
    trail.innerHTML = chips.join('');
    trail.scrollLeft = trail.scrollWidth;
    backEl.classList.toggle('disabled', S.busy || (S.stack.length < 2 && S.view !== 'feedback' && S.view !== 'end'));
  }

  function snap() {
    const s = (p) => [[p.position.x, p.position.z], p.userData.pose];
    return {
      players: [user, partner, rDrive, rReves].map(s),
      ball: ball.mesh.visible ? ball.mesh.position.clone() : null,
      cam: [stage.camera.position.toArray(), stage.controls.target.toArray()],
      nChoices: S.choices.length,
    };
  }

  function restore(sn, key) {
    [user, partner, rDrive, rReves].forEach((p, i) => placePlayer(p, ...sn.players[i]));
    if (sn.ball) { ball.set(sn.ball); ball.show(true); } else ball.show(false);
    stage.camera.position.fromArray(sn.cam[0]);
    stage.controls.target.fromArray(sn.cam[1]);
    S.choices.length = sn.nChoices;
    fx.clear();
    NODES[key].fx?.();
  }

  function enterNode(key) {
    S.node = key;
    S.stack.push({ key, snap: snap() });
    fx.clear();
    NODES[key].fx?.();
    renderQuestion();
  }

  function renderQuestion() {
    const n = NODES[S.node];
    S.view = 'question';
    sheet.innerHTML = `<div class="kicker">${n.kicker}</div>${n.ctx ? `<div class="ctx">${n.ctx()}</div>` : ''}<div class="q">${n.q}</div>`
      + n.opts.map((o, i) => `<div class="opt" data-opt="${o.id}"><span class="key">${'ABCD'[i]}</span><div><div class="t">${o.t}</div><div class="d">${o.d}</div></div></div>`).join('');
    header();
  }

  function renderFeedback(id) {
    const f = NODES[S.node].fb(id);
    S.view = 'feedback';
    S.pending = id;
    const list = (items) => `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
    sheet.innerHTML = `<div>${RATE[f.r]}${f.ev.map((e) => EV[e]).join('')}</div>
      <div class="fb-title">${f.title}</div><p class="fb-body">${f.body}</p>
      ${f.yes ? `<div class="box yes"><div class="lbl">Funciona si</div>${list(f.yes)}</div>` : ''}
      ${f.warn ? `<div class="box warn"><div class="lbl">Cuidado si</div>${list(f.warn)}</div>` : ''}
      ${f.src ? `<div class="source">📊 ${f.src}</div>` : ''}
      <div class="btns"><div class="btn sec" data-act="change">↩ Cambiar respuesta</div><div class="btn pri" data-act="go">Seguir el punto →</div></div>`;
    header();
  }

  async function proceed() {
    const n = NODES[S.node];
    const id = S.pending;
    const opt = n.opts.find((o) => o.id === id);
    S.choices.push({ node: S.node, id, s: opt.s, r: n.fb(id).r, label: n.short });
    S.busy = true;
    S.view = 'playing';
    header();
    const next = await n.after(id);
    stage.skip = false;
    S.busy = false;
    if (next.end) showEnd(next);
    else enterNode(next);
  }

  function showEnd({ won, reason }) {
    reason = String(reason);
    S.view = 'end';
    S.scoreBefore = [...S.score];
    const w = won ? 0 : 1;
    const game = S.score[w] === 3; // de 40 a juego: el marcador vuelve a 0 - 0
    if (game) S.score = [0, 0];
    else S.score[w] += 1;
    if (game) reason += won ? ' ¡Juego para ustedes!' : ' Juego para los rivales.';
    const count = (r) => S.choices.filter((c) => c.r === r).length;
    const grad = won ? 'rgba(61,220,151,.25), rgba(61,220,151,.05)' : 'rgba(255,107,91,.25), rgba(255,107,91,.05)';
    const bdr = won ? 'rgba(61,220,151,.4)' : 'rgba(255,107,91,.35)';
    const colors = { g: 'var(--green)', a: 'var(--amber)', r: 'var(--coral)' };
    sheet.innerHTML = `<div class="result" style="background:linear-gradient(135deg, ${grad});border-color:${bdr}">
        <div class="big">${won ? '¡Ganaste el punto!' : 'Perdiste el punto'}</div><div class="sub" style="color:var(--text)">${reason}</div></div>
      <div class="stats">
        <div class="stat"><div class="n" style="color:var(--green)">${count('g')}</div><div class="l">Óptimas</div></div>
        <div class="stat"><div class="n" style="color:var(--amber)">${count('a')}</div><div class="l">Depende</div></div>
        <div class="stat"><div class="n" style="color:var(--coral)">${count('r')}</div><div class="l">Error común</div></div>
      </div>
      ${S.choices.map((c, i) => `<div class="tl-row"><span class="tl-n" style="background:${colors[c.r]}">${i + 1}</span><div><div class="k">${c.label}</div><div class="v">${c.s}</div></div></div>`).join('')}
      <div class="btns"><div class="btn sec" data-act="repeat">↻ Repetir punto</div><div class="btn pri" data-act="next">Siguiente punto →</div></div>`;
    header();
  }

  async function nextPoint() {
    S.busy = true;
    S.m *= -1;
    S.point += 1;
    S.choices = [];
    S.stack = [];
    S.view = 'playing';
    playing(`Punto ${S.point}: ahora sacas desde el ${S.m === 1 ? 'lado derecho (drive)' : 'lado del revés'}…`);
    header();
    fx.clear();
    ball.show(false);
    await Promise.all([
      moveTo(stage, user, serveSpot(), 1.4),
      moveTo(stage, partner, partnerSpot(), 1.4),
      moveTo(stage, rec(), [X(-2.6), -8.6], 1.4),
      moveTo(stage, recP(), [X(2.5), -5.8], 1.4),
      tweenCamera(stage, ...CAM.serve(), 1.4),
    ]);
    await Promise.all([setPose(stage, user, 'serve'), setPose(stage, partner, 'ready'), setPose(stage, rec(), 'ready'), setPose(stage, recP(), 'ready')]);
    stage.skip = false;
    S.busy = false;
    enterNode('speed');
  }

  function repeatPoint() {
    S.score = S.scoreBefore;
    const first = S.stack[0];
    S.stack = [first];
    restore(first.snap, first.key);
    S.node = first.key;
    renderQuestion();
  }

  sheet.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-opt]');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (opt && !S.busy) return renderFeedback(opt.dataset.opt);
    if (act === 'skip') stage.skip = true;
    if (S.busy) return;
    if (act === 'change') renderQuestion();
    if (act === 'go') proceed();
    if (act === 'next') nextPoint();
    if (act === 'repeat') repeatPoint();
  });

  backEl.addEventListener('click', () => {
    if (S.busy) return;
    if (S.view === 'feedback') return renderQuestion();
    if (S.view === 'end') {
      S.score = S.scoreBefore;
      const top = S.stack[S.stack.length - 1];
      restore(top.snap, top.key);
      S.node = top.key;
      return renderQuestion();
    }
    if (S.stack.length < 2) return;
    S.stack.pop();
    const prev = S.stack[S.stack.length - 1];
    restore(prev.snap, prev.key);
    S.node = prev.key;
    renderQuestion();
  });

  window.__proto = { stage, S }; // para depurar desde la consola
  startLayout();
  enterNode('speed');
}
