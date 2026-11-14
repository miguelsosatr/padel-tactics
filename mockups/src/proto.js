// Prototipo jugable: puntos completos, decisión → animación → siguiente decisión,
// hasta ganar o perder el punto; después la transición al siguiente punto.
// Antes de empezar se pregunta la mano (derecho o zurdo) y el nivel, y los consejos se ajustan.
// Los puntos rotan:
//   1) sacas desde la derecha (formación convencional),
//   2) sacas desde el revés en australiana (punto largo: chiquita y bola dividida al centro),
//   3) restas: defiendes el saque y el rival te mete una víbora a la doble pared.
// Cuando eliges bandeja, víbora o remate hay un paso extra: zoom a la pelota con un reloj
// para decidir a qué hora le pegas.
import {
  C, createStage, addPlayer, setPose, moveTo, placePlayer, createBall, flyBall, pathInfo,
  tweenCamera, wait, arc, joinArcs, drawPath, addZone, bounceMark, heightMarker, fxLayer,
  floorArrow, floatLabel,
} from './scene.js';

{
  const $ = (id) => document.getElementById(id);
  const sheet = $('proto-sheet');
  const backEl = $('proto-back');
  const stageEl = $('proto-stage');

  const KINDS = ['saque', 'australiana', 'resto'];
  // m = 1: sacas desde la derecha (lado del drive); m = -1: desde la izquierda (lado del revés)
  const S = {
    hand: null, level: null, kind: 'saque', m: 1, point: 1, score: [0, 0], scoreBefore: null,
    choices: [], stack: [], node: null, view: null, pending: null, busy: false, draft: null, saved: null,
  };
  const X = (x) => x * S.m;
  const aus = () => S.kind === 'australiana';
  const isResto = () => S.kind === 'resto';
  const zurdo = () => S.hand === 'L';
  const hand = (derecho, izq) => (zurdo() ? izq : derecho);
  const LEVELS = { basico: 'Básico', intermedio: 'Intermedio', avanzado: 'Avanzado' };
  const lv = (basico, intermedio, avanzado) => ({ basico, intermedio, avanzado })[S.level];
  const at = (pts, f) => pathInfo(pts).at(f).toArray();

  function setKind() {
    S.kind = KINDS[(S.point - 1) % KINDS.length];
    S.m = aus() ? -1 : 1;
  }

  // En australiana (escenario E1) tú sacas cerca del centro, tu compañero espera en la red de ese
  // mismo lado y tú cruzas en diagonal a la red de tu lado (derecha). Después del saque tú siempre
  // terminas a la derecha (x > 0) y tu compañero a la izquierda (x < 0): esas coordenadas no usan X().
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
    net: () => [[6.5, 6.5, 12.5], [0.6, 0.4, 0.5]],
    ret: () => [[4.5, 6.2, 17.5], [0.5, 0.3, 0.5]],
    corner: () => [[1.0, 6.2, 14.6], [2.9, 0.5, 7.4]],
  };

  const stage = createStage(stageEl, { cam: CAM.serve()[0], target: CAM.serve()[1] });
  const fx = fxLayer(stage);
  const user = addPlayer(stage, { x: 2.5, z: 7.8, color: C.user, text: 'Tú', you: true, pose: 'serve' });
  const partner = addPlayer(stage, { x: -2.5, z: 2.8, color: C.partner, text: 'Compañero' });
  const rDrive = addPlayer(stage, { x: -2.6, z: -8.6, color: C.rival, text: 'Rival · drive', facing: 1 });
  const rReves = addPlayer(stage, { x: 2.5, z: -5.8, color: C.rival, text: 'Rival · revés', facing: 1 });
  const ball = createBall(stage);
  const rec = () => (S.m === 1 ? rDrive : rReves); // quien resta tu saque (en diagonal)
  const recP = () => (S.m === 1 ? rReves : rDrive);
  const choice = (node) => S.choices.find((c) => c.node === node)?.id;

  // Zurdo: el cuerpo del jugador se refleja (la pala pasa a la mano izquierda)
  const applyHand = () => { user.userData.body.root.parent.scale.x = zurdo() ? -1 : 1; };

  function layout() {
    if (isResto()) {
      return [[user, [2.8, 8.9], 'ready'], [partner, [-2.4, 6.2], 'ready'], [rDrive, [-2.5, -7.8], 'serve'], [rReves, [2.5, -2.8], 'ready']];
    }
    return [[user, serveSpot(), 'serve'], [partner, partnerSpot(), 'ready'], [rec(), [X(-2.6), -8.6], 'ready'], [recP(), [X(2.5), -5.8], 'ready']];
  }

  function placeAll() {
    layout().forEach(([p, pos, pose]) => placePlayer(p, pos, pose));
    ball.show(false);
  }

  // ---------- Reloj: a qué hora le pegas a la pelota (vista desde atrás) ----------

  const HR = { 12: '12:00', '2-3': '2:00–3:00', '4-5': '4:00–5:00', '7-8': '7:00–8:00', '9-10': '9:00–10:00' };
  const SHOT = { bandeja: 'bandeja', vibora: 'víbora', remate: 'remate' };
  const ART = { bandeja: 'una bandeja', vibora: 'una víbora', remate: 'un remate' };
  // Hora correcta para cada golpe: los zurdos le pegan del otro lado de la pelota
  const clockFor = (shot) => (shot === 'remate' ? '12' : shot === 'vibora' ? hand('2-3', '9-10') : hand('4-5', '7-8'));
  // Qué golpe sale de verdad según la hora que eliges
  const clockShot = (id) => (id === '12' ? 'remate' : ({ R: { '2-3': 'vibora', '4-5': 'bandeja' }, L: { '9-10': 'vibora', '7-8': 'bandeja' } })[S.hand][id] || 'falla');

  // ---------- Contenido: decisiones y feedback ----------

  const NODES = {
    speed: {
      kicker: 'Decisión · Saque', short: 'Tipo de saque',
      ctx: () => (aus()
        ? 'Ahora sacas desde el lado del revés, en formación australiana: tu compañero espera en la red de este lado y tú, al sacar, cruzas a la red de tu lado (derecha).'
        : 'Sacas desde la derecha (tu lado de drive) hacia el rival de drive.'),
      q: '¿Cómo sacas?',
      opts: [
        { id: 'lento', t: 'Lento con efecto', d: 'Más control y colocación', s: 'Lento' },
        { id: 'rapido', t: 'Rápido y plano', d: 'Más velocidad, menos control', s: 'Rápido' },
      ],
      fx: () => drawRun(),
      fb: (id) => {
        if (aus()) {
          return id === 'lento'
            ? { r: 'g', ev: ['fed', 'study'], title: 'Saque con efecto, profundo y a velocidad media', body: 'En australiana tienes que cruzar en diagonal hasta la red de tu lado. Este saque te da el tiempo para llegar.', src: 'Guía de saque de la LTA; en australiana el sacador corre más metros y más rápido (Ramón-Llin et al., 2021).',
              tip: lv('En principiantes, el sacador en australiana llega más lejos de la red que en niveles altos (Ramón-Llin et al., 2021): este saque es obligatorio para llegar a tiempo.', 'Busca que bote profundo y se abra al vidrio: cada décima que tarde el resto es un paso más hacia tu lado.', 'Puedes variar la dirección, pero no la velocidad: en australiana el tiempo para cruzar manda.') }
            : { r: 'a', ev: ['study', 'cons'], title: 'Saque rápido y plano', body: 'Lo que ganas en velocidad lo pierdes en tiempo para cruzar a tu lado.', yes: ['Eres rápido de piernas y es tu primer saque.', 'El restador se incomoda con la velocidad.'], warn: ['El resto regresa antes de que llegues y el paralelo cae en el hueco que vas cubriendo.'], src: 'Contra la australiana los restadores juegan más paralelo (Cerrillo-Lafuente et al., 2025).',
              tip: lv('En tu nivel, con este saque casi nunca llegas a tu lado a tiempo: mejor lento y profundo.', 'Solo como sorpresa en el primer saque, y si eres rápido de piernas.', 'Como sorpresa puede servir, pero en australiana el riesgo es doble: fallas o no llegas.') };
        }
        return id === 'lento'
          ? { r: 'g', ev: ['cons'], title: 'Saque lento con efecto', body: 'Es el saque que más se enseña: te da tiempo de subir a la red antes de que el rival reste y es más fácil de colocar.',
            tip: lv('En tu nivel lo más importante es meter el saque y llegar a la red: este es tu saque.', 'Busca que bote profundo y que se abra hacia el vidrio.', 'Varía el efecto y la dirección para que el restador no se acomode.') }
          : { r: 'a', ev: ['cons'], title: 'Saque rápido y plano', body: 'Puede sorprender, pero la pelota regresa igual de rápido.', yes: ['Lo usas de sorpresa, de vez en cuando.'], warn: ['El resto te puede agarrar a media pista, antes de llegar a la red.', 'Plano y fuerte, es más fácil fallarlo.'],
            tip: lv('Todavía no: primero asegura meterlo. Un saque rápido fallado es un punto regalado.', 'Úsalo de sorpresa en el primer saque, nunca en el segundo.', 'Como sorpresa en el primer saque puede darte un punto fácil, siempre que después llegues a la red.') };
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
            src: 'Más del 78 % de los saques de hombres profesionales van al vidrio (Bueno-García et al., 2024).',
            tip: lv('Según la LTA, el saque al vidrio funciona en todos los niveles: quédate con este.', 'Alterna de vez en cuando con la T para que no se acomode.', 'Mezcla vidrio, T y cuerpo según lo que le cueste al restador.') };
        }
        if (id === 'T') {
          const tip = lv('Primero domina el saque al vidrio; la T guárdala para cuando lo tengas seguro.', 'Úsala para variar: si siempre sacas igual, el restador se acomoda.', 'Bien usada, la T es un arma: la red es más baja en el centro y obliga a restar sin ángulo.');
          return S.m === 1
            ? { r: 'a', ev: ['study', 'cons'], title: 'Saque a la T contra el de drive', body: 'La T le queda a su revés. No es mala idea; depende del rival.', yes: ['Su revés es más débil que su derecha.', 'Lo alternas con el vidrio para que no se acomode.'], warn: ['Tiene buen revés y el saque te queda sin efecto.'], src: study, tip }
            : { r: 'a', ev: ['study', 'cons'], title: 'Saque a la T contra el de revés', body: 'Contra un diestro que juega de revés, la T le queda a su derecha.', yes: ['Lo usas de sorpresa porque casi siempre le sacas al vidrio.'], warn: ['Tiene buena derecha: resta cómodo por el centro.'], src: study, tip };
        }
        return { r: 'a', ev: ['cons'], title: 'Saque al cuerpo', body: 'Le quitas espacio para preparar el golpe.', yes: ['Lleva velocidad y le llega pegado al cuerpo.'], warn: ['Queda lento o corto: tiene tiempo de acomodarse.'],
          tip: lv('Es difícil de colocar bien: en tu nivel el vidrio es más seguro.', 'Funciona como variante contra restadores que se acomodan lejos del vidrio.', 'Al cuerpo y con velocidad es de los saques más incómodos de restar.') };
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
        red: { r: 'g', ev: ['study'], title: aus() ? 'Cruzar a la red de tu lado' : 'Subir a la red', body: aus() ? 'En australiana cruzas en diagonal a la red de tu lado; tu compañero ya cubre el cruzado.' : 'Después de sacar, la idea es ganar la red junto a tu compañero.', src: 'Más del 80 % de los puntos en profesional se ganan desde la red (Courel-Ibáñez et al., 2015).',
          tip: lv('Sacar y subir es el hábito más importante que puedes formar.', 'Sube en línea recta y frena (split step) justo cuando el rival le pega.', 'Lee el resto mientras subes: si viene bajo, frena antes; si viene globo, prepárate para ir atrás.') },
        mitad: { r: 'r', ev: ['cons'], title: 'Quedarte a media pista', body: aus() ? 'Te quedas a medio camino: el lado derecho queda abierto para un resto paralelo.' : 'Es la zona más difícil: no estás ni en la red ni atrás, y el rival puede tirarte la pelota a los pies.',
          tip: lv('Regla fácil: o estás en la red o estás atrás; en medio te tiran a los pies.', 'Si no te da tiempo de llegar, frena con los pies abiertos y sigue subiendo en la siguiente pelota.', 'Solo vale como paso de transición, nunca para quedarte.') },
        atras: { r: 'r', ev: aus() ? ['fed', 'study'] : ['cons'], title: 'Quedarte en el fondo', body: aus() ? 'En australiana tu lado queda vacío: el rival solo tiene que jugar paralelo.' : 'Le regalas la red a la pareja rival y dejas a tu compañero solo adelante.',
          tip: lv('Aunque te sientas más cómodo atrás, el saque es tu oportunidad de ganar la red.', 'Desde el fondo dependes de los errores del rival.', 'Contra rivales de tu nivel, regalar la red con el saque es perder la ventaja de sacar.') },
      })[id],
      after: (id) => animMove(id),
    },

    chiquita: {
      kicker: 'Decisión · Te juegan una chiquita', short: 'Chiquita',
      ctx: () => `Llegaste a la red, pero el rival no te tiró globo: te jugó una chiquita, suave y baja, a los pies. ${hand('Te llega por el lado de tu revés.', 'Como zurdo, te llega por el lado de tu derecha.')}`,
      q: '¿Qué volea juegas?',
      opts: [
        { id: 'bloqueo', t: 'Volea de bloqueo, profunda', d: 'Al centro, con margen sobre la red', s: 'Bloqueo profundo' },
        { id: 'fuerte', t: 'Volea fuerte hacia abajo', d: 'Para ganar el punto ya', s: 'Volea fuerte' },
        { id: 'dejada', t: 'Dejada corta', d: 'Que caiga cerca de la red', s: 'Dejada' },
        { id: 'atras', t: 'Retrocedo y la dejo botar', d: 'Para jugarla con más tiempo', s: 'La dejo botar' },
      ],
      fx: () => {
        drawPath(fx, S.chiq, { opacity: 0.4, spacing: 0.35 });
        heightMarker(fx, S.chiqHit, `Te llega a ${S.chiqHit.y.toFixed(1)} m · la red mide 0.88`, C.bad);
      },
      fb: (id) => ({
        bloqueo: { r: 'g', ev: ['fed', 'cons'], title: 'Volea de bloqueo, profunda al centro',
          body: `La pelota viene por debajo de la red: solo puedes mandarla hacia arriba. Lo inteligente es mandarla profunda y conservar la red. ${hand('Te llega de revés: pala firme delante del cuerpo y sin swing.', 'Te llega de derecha, pero aun así: bloquea sin swing, la fuerza la pone la pelota.')}`,
          src: 'La volea de bloqueo es para defender y la de empuje manda la pelota profunda (LTA Padel). El centro es la zona segura.',
          tip: lv('Flexiona las piernas para bajar a la pelota, no la pala: así no se te va a la red.', 'Apunta a 1 m por encima de la red y profundo: ganas tiempo para cerrarte.', 'Si el rival viene subiendo, una volea a sus pies es todavía mejor que al centro.') },
        fuerte: { r: 'r', ev: ['study'], title: 'Volea fuerte hacia abajo',
          body: 'Desde abajo no hay ángulo para pegar hacia abajo, y la pelota termina en la red.',
          src: 'En profesional, cerca de la mitad de los errores terminan en la red (Ramírez Ortega et al., 2025).',
          tip: lv('Una pelota por debajo de la red nunca se ataca: se defiende.', 'Espera la siguiente: la que te llegue por arriba de la red es la de atacar.', 'Ni en tu nivel hay ángulo: guarda la potencia para la pelota alta.') },
        dejada: { r: 'a', ev: ['cons'], title: 'Dejada corta',
          body: 'Puede sorprender, pero el que te tiró la chiquita normalmente viene subiendo.',
          yes: ['Los dos rivales están muy atrás y la pelota te llega sin peso.'], warn: ['El rival viene subiendo: llega y te pasa o te juega otra chiquita.'],
          tip: lv('Es de los golpes más finos: déjala para más adelante.', 'Úsala solo si ves a los dos rivales en el fondo.', 'Bien disfrazada es un arma, pero contra un rival que sube es un regalo.') },
        atras: { r: 'r', ev: ['cons', 'study'], title: 'Retroceder y dejarla botar',
          body: 'Al retroceder le entregas la red al rival, que es justo lo que buscaba con la chiquita.',
          tip: lv('Ya llegaste a la red: no la regales por una pelota incómoda.', 'Mejor una volea defensiva que perder la posición.', 'La chiquita busca justo eso: que des un paso atrás.') },
      })[id],
      after: (id) => animChiq(id),
    },

    dividida: {
      kicker: 'Decisión · Bola dividida', short: 'Bola al centro',
      ctx: () => 'Tu volea fue profunda. El rival contesta con una pelota media por el centro, justo entre tú y tu compañero (él es diestro).',
      q: '¿Quién la toma?',
      opts: [
        { id: 'mia', t: 'La tomo yo', d: 'Y aviso “¡mía!”', s: '¡Mía!' },
        { id: 'tuya', t: 'La toma mi compañero', d: 'Le aviso “¡tuya!” y me cierro', s: '¡Tuya!' },
        { id: 'dos', t: 'Vamos los dos por ella', d: 'Sin decir nada, el que llegue', s: 'Los dos' },
      ],
      fx: () => {
        drawPath(fx, S.div, { opacity: 0.4, spacing: 0.4 });
        addZone(fx, { x: 0.15, z: 3.1, w: 1.6, d: 1.2, color: 0xffc542, text: '?' });
      },
      fb: (id) => {
        const src = 'La LTA recomienda avisar siempre con “mía” o “tuya”. Que la tome quien la tiene de derecha es una convención extendida entre entrenadores.';
        if (id === 'dos') {
          return { r: 'r', ev: ['fed', 'cons'], title: 'Nadie avisa y van los dos', body: 'Sin comunicación, el centro (la zona más segura para el rival) se vuelve un punto regalado: o chocan, o la dejan pasar.', src,
            tip: lv('Acostúmbrate a gritar “mía” o “tuya” en cada pelota al centro, aunque parezca obvia.', 'Hablen antes del partido quién toma las del centro.', 'Además de avisar, el que no golpea se cierra para cubrir el hueco.') };
        }
        if (!zurdo()) {
          return id === 'tuya'
            ? { r: 'g', ev: ['fed', 'cons'], title: '“¡Tuya!”: la toma tu compañero', body: 'Los dos son diestros: el centro le queda de derecha a tu compañero (lado izquierdo) y a ti de revés. Él la toma y tú te cierras un poco al centro para cubrir.', src,
              tip: lv('Regla fácil entre dos diestros: la del centro es del jugador de la izquierda.', 'Avisar no es solo decir “tuya”: también es cerrarte para cubrir el hueco que deja.', 'Si tu compañero está abierto hacia su pared, ese día la del centro es tuya: avísalo.') }
            : { r: 'a', ev: ['cons'], title: '“¡Mía!”: la tomas tú', body: 'Puede salir, pero el centro te queda de revés y a tu compañero de derecha.', yes: ['Tu compañero está fuera de posición, abierto hacia su pared.', 'Llegas claramente antes y lo avisas fuerte.'], warn: ['Sin aviso, pueden ir los dos.'], src,
              tip: lv('La volea de revés es la que más errores provoca: si tu compañero llega de derecha, déjasela.', 'Tómala solo si llegas claramente antes.', 'Válido si llegas antes, pero no lo conviertas en costumbre.') };
        }
        return id === 'tuya'
          ? { r: 'g', ev: ['fed', 'cons'], title: '“¡Tuya!”: la toma tu compañero', body: 'Como zurdo en el lado derecho, la tienes de derecha… igual que tu compañero. Cuando los dos tienen la derecha al centro hay que acordarlo antes. Un criterio común: la toma quien la ve venir en diagonal desde el rival que golpea; aquí, tu compañero.',
            src: 'Las parejas con un zurdo cambian su forma de jugar (Ramón-Llin et al., 2021). La LTA recomienda avisar siempre con “mía” o “tuya”.',
            tip: lv('Con un zurdo en la pareja, el centro es la pelota más peligrosa: avisen siempre.', 'Acuérdenlo antes del partido y no lo cambien a mitad del punto.', 'Tener dos derechas al centro es una ventaja si está acordado: aprovéchenla.') }
          : { r: 'a', ev: ['cons'], title: '“¡Mía!”: la tomas tú', body: 'Válido: como zurdo en el lado derecho, la tienes de derecha. Lo importante es que lo hayan acordado.', yes: ['Así lo acordaron con tu compañero.', 'Llegas antes y lo avisas fuerte.'], warn: ['Si no lo acordaron, tu compañero también irá: los dos la tienen de derecha.'], src,
            tip: lv('Si no lo hablaron, aquí es donde chocan las palas: avisen siempre.', 'Acuérdenlo antes del partido.', 'Si es lo acordado, adelante: con tu derecha al centro puedes definir.') };
      },
      after: (id) => animDiv(id),
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
        bandeja: { r: 'g', ev: ['study'], title: 'Bandeja', body: 'Golpe controlado que te deja seguir en la red.', src: 'La bandeja da continuidad al punto en ~90 % de los casos (Sánchez-Alcaraz et al., 2020).',
          tip: lv('Es EL golpe por arriba que tienes que dominar primero.', 'Búscale profundidad: que bote cerca del fondo y no regrese alta.', 'Úsala para mantener la red y mézclala con víboras para que no te lean.') },
        remate: { r: 'r', ev: ['study'], title: 'Remate fuerte desde media pista',
          body: `Lejos de la red el remate pierde eficacia: la pelota regresa del vidrio y el rival defiende.${zurdo() ? ' Los zurdos profesionales ganan más puntos con el remate que los diestros, pero desde media pista sigue sin convenir.' : ''}`,
          src: zurdo() ? 'El remate pierde eficacia al alejarse de la red (Sánchez-Alcaraz et al., 2020). Zurdos y remate: Courel-Ibáñez y Sánchez-Alcaraz, 2018.' : 'El remate pierde eficacia al alejarse de la red (Sánchez-Alcaraz et al., 2020).',
          tip: lv('Rematar fuerte desde aquí casi siempre te deja fuera de posición.', 'Guarda el remate para los globos cortos, cerca de la red.', 'Desde aquí solo tendría sentido un remate para sacarla por 3 o por 4, y es otro golpe.') },
        vibora: lv(
          { r: 'r', ev: ['cons'], title: 'Víbora en nivel básico', body: 'Es más agresiva que la bandeja, con efecto lateral, pero mucho más difícil: en tu nivel, lo más probable es un error no forzado.', tip: 'Primero domina la bandeja; la víbora llega después.' },
          { r: 'a', ev: ['cons'], title: 'Víbora', body: 'Más agresiva que la bandeja, con efecto lateral.', yes: ['Dominas el golpe y la pelota te llega a buena altura.'], warn: ['Es más difícil: arriesgas un error no forzado.'], tip: 'Úsala cuando la pelota te llegue cómoda; si dudas, bandeja.' },
          { r: 'g', ev: ['cons'], title: 'Víbora', body: 'En tu nivel, la víbora presiona más que la bandeja y te mantiene en la red, sobre todo si la mandas al vidrio lateral.', tip: 'Apunta al vidrio lateral del rival: después de la pared la pelota sale baja y rápida.' },
        ),
        botar: { r: 'a', ev: ['cons'], title: 'Dejarla botar', body: 'Válido cuando el globo te rebasa, pero pierdes la red.', yes: ['El globo es muy profundo y no llegas bien por arriba.'], warn: ['Le das la red a los rivales.'],
          tip: lv('Si no llegas cómodo por arriba, es mejor dejarla que fallar.', 'Si la dejas botar, contesta con un globo para volver a subir.', 'Este globo te llega a buena altura: en tu nivel, mejor jugarlo por arriba.') },
      })[id],
      after: (id) => (id === 'botar' ? animLob('botar') : zoomBall()),
    },

    reloj: {
      kicker: 'Decisión · Dónde le pegas', short: 'Reloj',
      ctx: () => `Vas a pegar ${ART[choice('lob')]}. Imagina la pelota como un reloj, vista desde atrás (como la ves tú). Eres ${hand('derecho', 'zurdo')}.`,
      q: '¿A qué hora le pegas?',
      get opts() {
        const o = {
          12: { id: '12', t: 'A las 12:00', d: 'Arriba, por detrás de la pelota' },
          '2-3': { id: '2-3', t: 'Entre las 2:00 y las 3:00', d: 'Por el lado derecho' },
          '4-5': { id: '4-5', t: 'Entre las 4:00 y las 5:00', d: 'Por la derecha y por abajo' },
          '7-8': { id: '7-8', t: 'Entre las 7:00 y las 8:00', d: 'Por la izquierda y por abajo' },
          '9-10': { id: '9-10', t: 'Entre las 9:00 y las 10:00', d: 'Por el lado izquierdo' },
        };
        return (zurdo() ? ['12', '9-10', '7-8', '4-5'] : ['12', '2-3', '4-5', '7-8']).map((k) => ({ ...o[k], s: HR[k] }));
      },
      fb: (id) => {
        const shot = choice('lob');
        const want = clockFor(shot);
        const got = clockShot(id);
        const side = hand('la derecha', 'la izquierda');
        const tip = lv(
          `Empieza por la bandeja a las ${HR[clockFor('bandeja')]}: es la más segura.`,
          `Practica pasar de ${HR[clockFor('bandeja')]} (bandeja) a ${HR[clockFor('vibora')]} (víbora) con el mismo gesto.`,
          `Con el mismo gesto, cambiar de ${HR[clockFor('bandeja')]} a ${HR[clockFor('vibora')]} en el último momento hace que el rival no sepa si viene bandeja o víbora.`,
        );
        const ev = ['cons'];
        if (id === want) {
          return {
            r: 'g', ev, tip,
            title: `${HR[id]}: ${shot === 'remate' ? 'así se pega el remate plano' : `así se pega la ${SHOT[shot]}`}`,
            body: {
              bandeja: `Para un ${hand('derecho', 'zurdo')}, la bandeja se pega por ${side} y por abajo de la pelota: el corte la frena, bota bajo y te da tiempo de volver a la red.`,
              vibora: `La víbora se pega más de lado, por ${side} de la pelota: le metes efecto lateral y sale más rápida y baja después del vidrio.`,
              remate: 'El remate plano se pega arriba y por detrás de la pelota, con toda la fuerza. Ojo: desde media pista sigue sin convenir, la pelota regresa del vidrio.',
            }[shot],
          };
        }
        if (got === 'falla') {
          return { r: 'r', ev, tip, title: 'Lado equivocado de la pelota',
            body: `A las ${HR[id]} es el lado contrario para un ${hand('derecho', 'zurdo')}: ahí le pegan los ${hand('zurdos', 'derechos')}. Con tu ${hand('derecha', 'izquierda')} tendrías que hacer un gesto forzado y la pelota sale desviada. Para ${ART[shot]}, a las ${HR[want]}.` };
        }
        if (got === 'remate') {
          return { r: 'r', ev, tip, title: 'A las 12:00 es remate plano',
            body: `Pegarle arriba y por detrás es un golpe plano: pierdes el corte y el control que buscabas con la ${SHOT[shot]}. Para la ${SHOT[shot]}, a las ${HR[want]}.` };
        }
        if (shot === 'remate') {
          return { r: 'a', ev, tip, title: `Eso ya no es remate: es una ${SHOT[got]}`,
            body: `Al pegarle ${got === 'bandeja' ? 'por abajo' : 'de lado'} cortas la pelota y sale una ${SHOT[got]}. Para un remate plano sería a las 12:00.`,
            yes: ['Desde media pista, de hecho, es mejor idea que el remate.'], warn: ['Si de verdad querías rematar, la pelota sale sin la potencia que esperabas.'] };
        }
        return got === 'vibora'
          ? { r: 'a', ev, tip, title: 'Eso ya es una víbora', body: `Más de lado le metes efecto lateral: es más agresiva que la bandeja y con más riesgo. La bandeja va más abajo: a las ${HR[want]}.`, yes: ['Quieres presionar y la pelota te llega cómoda.'], warn: ['Si querías asegurar, te estás complicando.'] }
          : { r: 'a', ev, tip, title: 'Eso es más bandeja', body: `Más abajo de la pelota cortas más y le quitas velocidad: más control y menos efecto lateral. Para la víbora, pégale más de lado: a las ${HR[want]}.`, yes: ['Prefieres asegurar y seguir en la red.'], warn: ['Pierdes el efecto que hace incómoda a la víbora.'] };
      },
      after: (id) => animLob(clockShot(id)),
    },

    resto: {
      kicker: 'Decisión · Resto', short: 'Resto',
      ctx: () => `El rival te mete un primer saque rápido y cortado al vidrio, y sube a la red. ${hand('Después del vidrio lateral te llega por tu derecha.', 'Como zurdo, después del vidrio lateral te llega por tu revés.')}`,
      q: '¿Qué resto haces?',
      opts: [
        { id: 'globo', t: 'Globo profundo', d: 'Cruzado o al centro, que bote pasada la línea de saque', s: 'Globo' },
        { id: 'plano', t: 'Plano, bajo y cruzado', d: 'A los pies del sacador que sube', s: 'Plano a los pies' },
        { id: 'paralelo', t: 'Paralelo fuerte', d: 'Buscando el ganador', s: 'Paralelo fuerte' },
        { id: 'adelante', t: 'Me adelanto', d: 'Para pegarle antes de que llegue al vidrio', s: 'Me adelanto' },
      ],
      fx: () => {
        drawPath(fx, joinArcs(S.srvA, S.srvB), { opacity: 0.35, spacing: 0.4 });
        bounceMark(fx, S.srvA[S.srvA.length - 1].x, S.srvA[S.srvA.length - 1].z);
        floatLabel(fx, 'Vidrio lateral', [4.6, 2.0, 7.4], C.white);
      },
      fb: (id) => ({
        globo: { r: 'g', ev: ['study', 'fed'], title: 'Globo profundo',
          body: `Ante un saque rápido y al vidrio, el globo es el resto con más margen: aleja al sacador de la red y te da tiempo.${zurdo() ? ' De revés y saliendo del vidrio, además, es el golpe más seguro: en profesionales, los zurdos fallan más con los golpes de pared.' : ''}`,
          src: zurdo() ? 'Restar con globo reduce los puntos del sacador (Bueno-García et al., 2024). Zurdos y pared: Courel-Ibáñez y Sánchez-Alcaraz, 2018.' : 'Restar con globo reduce los puntos que gana el sacador (Bueno-García et al., 2024; Escudero-Tena et al., 2024).',
          tip: lv('Alto y profundo, que bote pasada la línea de saque; la dirección es lo de menos.', 'Busca el centro o el cruzado: el centro genera dudas sobre quién la toma.', 'Úsalo para quitarle la red, y mézclalo con restos bajos cuando el saque te deje.') },
        plano: { r: 'a', ev: ['study', 'cons'], title: 'Resto plano, bajo y cruzado',
          body: 'Si sale bajo, el sacador tiene que volear desde abajo, desde media pista.',
          yes: ['Controlas bien el golpe.', 'El sacador sube lento y tiene que volear desde media pista.'], warn: ['El saque te sacó de posición: si sale alto, es una volea fácil.', 'El resto bajo te deja menos tiempo para reaccionar.'],
          src: 'En hombres profesionales casi la mitad de los restos son planos (Bueno-García et al., 2024).',
          tip: lv('Contra un saque rápido todavía es arriesgado: el globo te da más margen.', 'Funciona si el saque no te sacó de la pista.', 'En tu nivel es un resto válido, sobre todo si el sacador sube lento.') },
        paralelo: { r: 'r', ev: ['study', 'fed'], title: 'Paralelo fuerte buscando ganar',
          body: 'Es el golpe con menos margen (la red es más alta en los lados y la línea más corta) contra el saque más difícil.',
          src: 'En sub-18, el resto ganador es ~1 % y el error ~9 % (Cerrillo-Lafuente et al., 2025).',
          tip: lv('El resto no es para ganar el punto: es para que siga y ustedes puedan subir.', 'El paralelo es un golpe de sorpresa, nunca contra el saque difícil.', 'Ni en tu nivel compensa contra un saque rápido al vidrio.') },
        adelante: { r: 'r', ev: ['cons', 'fed'], title: 'Adelantarte para pegarle antes del vidrio',
          body: 'Te quitas a ti mismo el tiempo que te da el vidrio. Contra un saque rápido y profundo, se recibe atrás y se deja salir la pelota de la pared.',
          src: 'Una pelota rápida te da más tiempo si la dejas salir de la pared (LTA Padel).',
          tip: lv('El vidrio es tu amigo: deja que la pelota pegue y salga.', 'Colócate un paso más atrás en el resto contra sacadores rápidos.', 'Contra un saque lento sí se avanza; contra uno rápido, no.') },
      })[id],
      after: (id) => animResto(id),
    },

    doble: {
      kicker: 'Decisión · Víbora a la doble pared', short: 'Doble pared',
      ctx: () => 'El rival te pegó una víbora a tu esquina: va a pegar primero en el vidrio lateral y después en el de fondo.',
      q: '¿Hacia dónde te mueves para esperarla?',
      opts: [
        { id: 'esquina', t: 'Me meto a la esquina', d: 'Voy a donde pega la pelota (zona A)', s: 'A la esquina' },
        { id: 'centro', t: 'Salgo de la esquina, hacia el centro', d: 'Un paso por delante del vidrio de fondo (zona B)', s: 'Fuera de la esquina' },
        { id: 'red', t: 'Me voy hacia adelante', d: 'Hacia la red, la espero ahí (zona C)', s: 'Hacia adelante' },
        { id: 'antes', t: 'Le pego antes del vidrio', d: 'Justo después del bote', s: 'Antes del vidrio' },
      ],
      fx: () => {
        const v = S.vib;
        drawPath(fx, v.a1, { opacity: 0.35, spacing: 0.4 });
        drawPath(fx, v.a2, { opacity: 0.6, spacing: 0.22, shadow: false });
        bounceMark(fx, v.B[0], v.B[2]);
        floatLabel(fx, '① lateral', [4.9, 2.1, 8.0], C.white);
        floatLabel(fx, '② fondo', [4.3, 0.35, 9.95], C.white);
        addZone(fx, { x: 4.15, z: 9.3, w: 1.3, d: 1.1, color: 0xff6b5b, text: 'A' });
        addZone(fx, { x: 1.7, z: 8.4, w: 1.5, d: 1.2, color: 0xd7f548, text: 'B' });
        addZone(fx, { x: 1.9, z: 5.4, w: 1.5, d: 1.2, color: 0xc79bff, text: 'C' });
      },
      fb: (id) => ({
        centro: { r: 'g', ev: ['fed', 'cons'], title: 'Salir de la esquina, hacia el centro',
          body: `Al pegar en el lateral, la pelota cambia de dirección hacia el fondo; al pegar en el fondo, sale hacia el centro de la pista. Si la esperas fuera de la esquina, un paso por delante del vidrio de fondo, la pelota viene hacia ti y tienes espacio para pegarle. ${hand('Además te sale por tu derecha.', 'Como zurdo, te sale por tu revés: sepárate un poco más del vidrio lateral para que no te coma.')}`,
          src: 'Jugar con el vidrio es lo más difícil de aprender; la clave es esperar de lado, con la pala arriba (LTA Padel). La trayectoria de los rebotes es geometría.',
          tip: lv('Regla fácil: en la doble pared nunca te metas a la esquina; espera fuera y deja que la pelota venga.', 'Lee el primer vidrio: cuanto más cerca del fondo pegue, más hacia el centro saldrá.', 'Con víbora la pelota sale baja y rápida: flexiona y prepara la pala antes de que pegue en el segundo vidrio.') },
        esquina: { r: 'r', ev: ['cons'], title: 'Meterte a la esquina',
          body: 'La pelota sale de la esquina hacia el centro: si te metes ahí, te queda encima o a la espalda y no tienes espacio para pegarle.',
          tip: lv('Ir a donde pega la pelota es el error más típico con las paredes: espera a donde va a salir.', 'Piensa en la salida del segundo vidrio, no en el bote.', 'En la doble pared, el espacio lo es todo: deja la esquina libre.') },
        red: { r: 'r', ev: ['cons'], title: 'Irte hacia adelante',
          body: 'Después de dos vidrios la pelota pierde velocidad y sale poco: no llega tan adelante. Te quedas lejos y se muere atrás.',
          tip: lv('Después de dos paredes la pelota sale lenta: espérala cerca del fondo.', 'Primero defiende la pelota; ya subirás con un globo.', 'Solo te irías adelante si la víbora pegara muy alta en el lateral, y aquí pegó baja.') },
        antes: lv(
          { r: 'r', ev: ['cons', 'fed'], title: 'Pegarle antes del vidrio', body: 'Con el efecto de la víbora la pelota viene baja y rápida: pegarle antes del vidrio te deja sin tiempo.', tip: 'Deja que la pelota pegue en el vidrio: te da tiempo.' },
          { r: 'r', ev: ['cons', 'fed'], title: 'Pegarle antes del vidrio', body: 'Con el efecto de la víbora la pelota viene baja y rápida: pegarle antes del vidrio te deja sin tiempo.', tip: 'Trabaja la salida de doble pared: es más segura que anticipar.' },
          { r: 'a', ev: ['cons'], title: 'Pegarle antes del vidrio', body: 'En tu nivel es una opción, pero la víbora viene baja, rápida y con efecto.', yes: ['Llegas cómodo y la pelota no trae mucho efecto.'], warn: ['Viene rápida y baja: el golpe sale defensivo y alto, y el rival remata.'], tip: 'Contra una víbora bien pegada, la doble pared es más segura que anticipar.' },
        ),
      })[id],
      after: (id) => animDoble(id),
    },

    salida: {
      kicker: 'Decisión · Después de la doble pared', short: 'Salida de pared',
      ctx: () => 'Te colocaste bien: la pelota salió de la doble pared hacia el centro, a media altura. Los dos rivales están en la red.',
      q: '¿Qué juegas?',
      opts: [
        { id: 'globo', t: 'Globo profundo', d: 'Por encima de los dos, al centro', s: 'Globo' },
        { id: 'bajada', t: 'Golpe plano y fuerte', d: 'Directo hacia la red rival', s: 'Plano fuerte' },
        { id: 'chiquita', t: 'Chiquita', d: 'Suave y baja, a los pies del rival', s: 'Chiquita' },
      ],
      fx: () => {
        const v = S.vib;
        drawPath(fx, joinArcs(v.a2, v.tail), { color: C.good, opacity: 0.45, spacing: 0.3 });
      },
      fb: (id) => ({
        globo: { r: 'g', ev: ['study', 'fed'], title: 'Globo profundo',
          body: 'Con los dos rivales en la red y tú atrás, el globo es la forma de recuperar la red: los saca de su posición y te da tiempo para subir.',
          src: 'En hombres profesionales, los globos al centro tendieron a superar más a los rivales (Villar-León et al., 2024).',
          tip: lv('Alto y profundo: si se queda corto, es remate para ellos.', 'Al centro genera dudas sobre quién la toma.', 'Si los pasa, sube con tu compañero: es tu momento de ganar la red.') },
        bajada: { r: 'r', ev: ['cons', 'study'], title: 'Golpe plano y fuerte',
          body: 'Desde el fondo contra dos jugadores en la red, un golpe fuerte es una volea fácil para ellos.',
          tip: lv('Desde atrás no se gana el punto: se busca volver a la red.', 'La potencia contra dos en la red casi siempre regresa más rápido.', 'Solo con un hueco muy claro; aquí no lo hay.') },
        chiquita: { r: 'a', ev: ['study', 'fed'], title: 'Chiquita',
          body: 'Busca que el rival volee hacia arriba para que tú puedas atacar.',
          yes: ['Los rivales están algo lejos de la red y tu pelota sale baja.'], warn: ['Si sale alta, es una volea ganadora para el rival.'],
          src: 'En jugadores avanzados, la chiquita se asoció con terminar el punto, para bien o para mal (Muñoz et al., 2017).',
          tip: lv('Es un golpe fino: primero domina el globo.', 'Saliendo de dos paredes es difícil controlarla: el globo es más seguro.', 'En tu nivel es un arma para recuperar la red, si la bajas a los pies.') },
      })[id],
      after: (id) => animSalida(id),
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

  // Globo del rival por tu lado; te deja listo para pegarle por arriba (nodo 'lob')
  async function throwLob(from, text, mover = recP()) {
    const lob = arc(from, [2.3, 0, 8.4], 6.2, 70);
    let idx = 0;
    lob.forEach((p, i) => { if (i > 10 && Math.abs(p.z - 5.8) < Math.abs(lob[idx].z - 5.8)) idx = i; });
    const frac = pathInfo(lob.slice(0, idx + 1)).total / pathInfo(lob).total;
    S.lob = lob;
    S.hitP = lob[idx].clone();
    fx.clear();
    drawPath(fx, lob, { opacity: 0.35, spacing: 0.4 });
    playing(text);
    await Promise.all([
      flyBall(stage, ball, lob, 1.7, 0, frac),
      tweenCamera(stage, ...CAM.lob(), 1.2),
      mover ? moveTo(stage, mover, [X(2.5), -8.2], 1.2) : null,
      moveTo(stage, partner, [-2.0, 3.0], 0.8),
      (async () => { await wait(stage, 0.3); await moveTo(stage, user, [2.4, 5.8], 1.0); await setPose(stage, user, 'overhead', 0.3); })(),
    ]);
    return 'lob';
  }

  // Pelota floja hacia arriba y remate del rival de la red: punto perdido
  async function weakAndSmash(from, reason) {
    const pop = arc(from, [1.3, 0, -3.8], 4.0);
    const p = at(pop, 0.75);
    drawPath(fx, pop, { color: C.bad, opacity: 0.5, spacing: 0.4 });
    await Promise.all([
      flyBall(stage, ball, pop, 1.1, 0, 0.75),
      moveTo(stage, rReves, [p[0] - 0.3, p[2] - 0.3], 0.9),
      setPose(stage, rReves, 'overhead', 0.4),
      tweenCamera(stage, ...CAM.wide(), 1.0),
    ]);
    await setPose(stage, rReves, 'overheadHit', 0.15);
    const smash = joinArcs(arc(p, [-0.6, 0, 5.6], p[1] + 0.1), arc([-0.6, 0, 5.6], [-0.9, 1.4, 9.95], 1.8, 14));
    await flyBall(stage, ball, smash, 0.7);
    return { end: true, won: false, reason };
  }

  async function animMove(id) {
    const fast = choice('speed') === 'rapido';
    const finish = flyBall(stage, ball, S.afterArc, fast ? 0.15 : 0.35, 0.5, 1);

    if (id === 'red' && !fast) {
      playing(aus() ? 'Cruzas en diagonal a la red de tu lado mientras el rival resta…' : 'Subes a la red mientras el rival resta…');
      await Promise.all([moveTo(stage, user, [2.45, 3.0], aus() ? 1.3 : 1.1), finish.then(() => setPose(stage, rec(), aus() ? 'backhand' : 'lob', 0.25))]);
      return aus() ? animChiquita() : throwLob(S.recHit, '¡El rival te tira un globo!');
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

  // ---- Punto 2 (australiana): chiquita y bola dividida ----

  async function animChiquita() {
    const chiq = arc(S.recHit, [2.0, 0.22, 3.25], 1.25, 40);
    S.chiq = chiq;
    S.chiqHit = pathInfo(chiq).at(0.9);
    fx.clear();
    drawPath(fx, chiq, { opacity: 0.4, spacing: 0.35 });
    playing('El rival no te tira globo: te juega una chiquita a los pies…');
    await Promise.all([
      flyBall(stage, ball, chiq, 1.3, 0, 0.9),
      moveTo(stage, rec(), [2.6, -6.0], 1.2),
      tweenCamera(stage, ...CAM.net(), 1.1),
      (async () => { await wait(stage, 0.5); await setPose(stage, user, 'volley', 0.4); })(),
    ]);
    return 'chiquita';
  }

  async function animChiq(id) {
    fx.clear();
    const hp = S.chiqHit.toArray();

    if (id === 'bloqueo') {
      playing('Bloqueas la volea, profunda al centro…');
      const deep = joinArcs(arc(hp, [0.8, 0, -7.8], 1.7), arc([0.8, 0, -7.8], [1.6, 0.95, -8.4], 1.2, 14));
      drawPath(fx, deep, { opacity: 0.35, spacing: 0.4 });
      await Promise.all([
        flyBall(stage, ball, deep, 1.3),
        moveTo(stage, rec(), [1.9, -8.7], 1.1),
        (async () => { await wait(stage, 0.2); await setPose(stage, user, 'ready', 0.3); })(),
        moveTo(stage, partner, [-2.0, 3.0], 0.8),
      ]);
      await setPose(stage, rec(), 'backhand', 0.15);
      const mid = arc([1.6, 0.95, -8.4], [0.15, 1.15, 3.1], 1.75);
      S.div = mid;
      S.divHit = pathInfo(mid).at(0.82);
      drawPath(fx, mid, { opacity: 0.4, spacing: 0.4 });
      playing('El rival juega una pelota por el centro, justo entre los dos…');
      await Promise.all([flyBall(stage, ball, mid, 1.2, 0, 0.82), tweenCamera(stage, ...CAM.net(), 0.8)]);
      return 'dividida';
    }

    if (id === 'fuerte') {
      playing('Le pegas fuerte hacia abajo…');
      await setPose(stage, user, 'serveHit', 0.12);
      await flyBall(stage, ball, arc(hp, [1.7, 0.45, 0.02], 0.6), 0.45);
      floatLabel(fx, 'A la red', [1.7, 1.5, 0.3], C.bad);
      await wait(stage, 0.4);
      return { end: true, won: false, reason: 'La pelota venía por debajo de la red: al pegarle fuerte hacia abajo se fue a la red.' };
    }

    if (id === 'dejada') {
      playing('Juegas una dejada corta…');
      await setPose(stage, user, 'serveHit', 0.15);
      const drop = joinArcs(arc(hp, [2.2, 0, -1.6], 1.2), arc([2.2, 0, -1.6], [2.3, 0.5, -2.3], 0.6, 12));
      await Promise.all([flyBall(stage, ball, drop, 1.0), moveTo(stage, rec(), [2.7, -2.6], 1.0), tweenCamera(stage, ...CAM.wide(), 1.0)]);
      await setPose(stage, rec(), 'backhand', 0.12);
      const pass = joinArcs(arc([2.3, 0.5, -2.3], [3.9, 0, 5.8], 1.3), arc([3.9, 0, 5.8], [4.3, 0.9, 9.95], 1.0, 14));
      drawPath(fx, pass, { color: C.bad, opacity: 0.6, spacing: 0.4 });
      await Promise.all([flyBall(stage, ball, pass, 0.9), moveTo(stage, user, [3.0, 3.4], 0.6)]);
      return { end: true, won: false, reason: 'La dejada quedó a su alcance: el rival venía subiendo, llegó y te pasó por tu lado.' };
    }

    // Retroceder y dejarla botar
    playing('Retrocedes para dejarla botar… y el rival sube a la red.');
    const bounce = joinArcs(arc(hp, [2.0, 0, 3.6], 0.3, 10), arc([2.0, 0, 3.6], [2.3, 0.55, 5.3], 0.8, 14));
    await Promise.all([
      flyBall(stage, ball, bounce, 0.8),
      moveTo(stage, user, [2.7, 5.7], 0.8),
      moveTo(stage, rec(), [2.4, -2.6], 1.0),
      moveTo(stage, recP(), [-2.4, -3.0], 1.0),
      tweenCamera(stage, ...CAM.wide(), 1.0),
    ]);
    await setPose(stage, user, 'lob', 0.15);
    const up = arc([2.3, 0.55, 5.3], [2.3, 1.3, -2.4], 1.8);
    await flyBall(stage, ball, up, 0.8);
    await setPose(stage, rec(), 'serveHit', 0.12);
    const win = joinArcs(arc([2.3, 1.3, -2.4], [0.3, 0, 5.0], 1.3), arc([0.3, 0, 5.0], [0.1, 0.6, 9.95], 0.9, 14));
    await flyBall(stage, ball, win, 0.75);
    return { end: true, won: false, reason: 'Al retroceder le diste la red al rival: subió y te ganó el punto con volea.' };
  }

  async function animDiv(id) {
    fx.clear();
    if (id === 'dos') {
      playing('Nadie avisa y los dos van por ella…');
      await Promise.all([
        moveTo(stage, user, [0.7, 3.0], 0.45),
        moveTo(stage, partner, [-0.4, 3.0], 0.45),
        flyBall(stage, ball, S.div, 0.35, 0.82, 0.95),
      ]);
      floatLabel(fx, '¡Choque!', [0.2, 2.4, 3.0], C.bad);
      await Promise.all([setPose(stage, user, 'volley', 0.15), setPose(stage, partner, 'volley', 0.15)]);
      const p = at(S.div, 0.95);
      const pass = joinArcs(arc(p, [0.1, 0, 6.6], 1.2), arc([0.1, 0, 6.6], [0.05, 0.9, 9.95], 1.1, 14));
      drawPath(fx, pass, { color: C.bad, opacity: 0.6, spacing: 0.4 });
      await flyBall(stage, ball, pass, 0.9);
      return { end: true, won: false, reason: 'Ninguno avisó: fueron los dos, se estorbaron y la pelota pasó por el centro.' };
    }

    const mine = id === 'mia';
    const hitter = mine ? user : partner;
    playing(mine ? 'Gritas “¡mía!” y la juegas tú…' : 'Gritas “¡tuya!” y tu compañero la juega de derecha…');
    floatLabel(fx, mine ? '¡Mía!' : '¡Tuya!', [1.9, 2.7, 3.2], C.user);
    await Promise.all([
      moveTo(stage, hitter, mine ? [0.75, 3.05] : [-0.45, 3.05], 0.45),
      moveTo(stage, mine ? partner : user, mine ? [-1.6, 3.0] : [1.7, 3.0], 0.45),
      flyBall(stage, ball, S.div, 0.35, 0.82, 0.97),
    ]);
    await setPose(stage, hitter, 'serveHit', 0.15);
    const p = at(S.div, 0.97);
    const deep = joinArcs(arc(p, [-2.1, 0, -7.9], 1.6), arc([-2.1, 0, -7.9], [-2.35, 1.0, -8.8], 1.2, 14));
    drawPath(fx, deep, { opacity: 0.35, spacing: 0.4 });
    await Promise.all([flyBall(stage, ball, deep, 1.0), moveTo(stage, recP(), [-2.0, -9.1], 0.9), setPose(stage, hitter, 'ready', 0.4)]);
    await setPose(stage, recP(), 'lob', 0.15);
    return throwLob([-2.35, 1.0, -8.8], 'El rival se defiende con un globo por tu lado…', null);
  }

  // ---- Golpe por arriba: zoom al reloj y resultado ----

  async function zoomBall() {
    fx.clear();
    playing('Zoom a la pelota…');
    const h = S.hitP;
    await Promise.all([
      setPose(stage, user, 'overhead', 0.2),
      tweenCamera(stage, [h.x + 0.1, h.y + 0.14, h.z + 0.85], [h.x, h.y, h.z], 1.1),
    ]);
    return 'reloj';
  }

  async function animLob(id) {
    fx.clear();
    const h = S.hitP;
    const hp = [h.x, h.y, h.z];
    const meant = choice('lob');
    const hour = choice('reloj');
    const pre = hour && id !== meant && id !== 'falla' ? `Le pegaste a las ${HR[hour]}: en lugar de ${ART[meant]}, salió ${ART[id]}. ` : '';

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

    if (id === 'falla') {
      playing('Le pegas del lado equivocado de la pelota…');
      await setPose(stage, user, 'overheadHit', 0.15);
      const out = arc(hp, [-5.0, 2.3, -3.6], h.y + 0.6);
      drawPath(fx, out, { color: C.bad, opacity: 0.5, spacing: 0.4 });
      await Promise.all([flyBall(stage, ball, out, 1.0), tweenCamera(stage, ...CAM.wide(), 1.0)]);
      floatLabel(fx, 'Directo a la reja', [-4.2, 3.0, -3.6], C.bad);
      await wait(stage, 0.4);
      return { end: true, won: false, reason: `A las ${HR[hour]} es el lado contrario de la pelota para un ${hand('derecho', 'zurdo')}: el golpe salió forzado y la pelota pegó directo en la reja.` };
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
      return { end: true, won: false, reason: `${pre}El remate lejos de la red regresó del vidrio; el rival defendió y te pasó por el centro.` };
    }

    const vib = id === 'vibora';
    if (vib && S.level === 'basico') {
      playing('Intentas una víbora…');
      await setPose(stage, user, 'overheadHit', 0.15);
      await Promise.all([flyBall(stage, ball, arc(hp, [1.0, 0.5, 0.02], h.y + 0.05), 0.7), tweenCamera(stage, ...CAM.wide(), 1.0)]);
      floatLabel(fx, 'A la red', [1.0, 1.6, 0.3], C.bad);
      await wait(stage, 0.4);
      return { end: true, won: false, reason: `${pre}En nivel básico la víbora todavía es un golpe de mucho riesgo: se fue a la red. La bandeja te habría mantenido en el punto.` };
    }

    // Bandeja o víbora: mantienes la red y tu compañero cierra el punto
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
      reason: pre + (vib
        ? 'La víbora salió bien: el rival defendió como pudo y tu compañero cerró con volea.'
        : 'Tu bandeja te mantuvo en la red: el rival defendió como pudo y tu compañero cerró con volea.'),
    };
  }

  // ---- Punto 3: restas (defiendes el saque) ----

  async function introResto() {
    const hit = [-2.7, 0.8, -7.5];
    const bounce = [3.6, 0, 5.4];
    const glass = [4.95, 1.05, 7.4];
    S.retHit = [3.7, 0.95, 8.6];
    S.srvA = arc(hit, bounce, 1.45);
    S.srvB = joinArcs(arc(bounce, glass, 1.15, 16), arc(glass, S.retHit, 1.15, 14));
    fx.clear();
    playing('El rival te saca rápido y cortado, al vidrio…');
    await tweenCamera(stage, ...CAM.ret(), 0.3);
    ball.set(S.srvA[0]);
    ball.show(true);
    await Promise.all([
      (async () => { await setPose(stage, rDrive, 'serveHit', 0.25); await moveTo(stage, rDrive, [-2.3, -5.6], 0.7); await setPose(stage, rDrive, 'ready', 0.2); })(),
      flyBall(stage, ball, S.srvA, 0.65),
    ]);
  }

  async function animResto(id) {
    fx.clear();
    const hp = S.retHit;

    if (id === 'adelante') {
      playing('Te adelantas para pegarle antes de que llegue al vidrio…');
      const meet = at(S.srvB, 0.3);
      await Promise.all([
        moveTo(stage, user, [meet[0] - 0.7, meet[2] + 0.2], 0.35),
        flyBall(stage, ball, S.srvB, 0.25, 0, 0.3),
        setPose(stage, user, 'volley', 0.2),
      ]);
      floatLabel(fx, '¡Sin tiempo!', [meet[0] - 0.5, 2.2, meet[2]], C.bad);
      return weakAndSmash(meet, 'Al adelantarte te quitaste el tiempo que da el vidrio: la pelota te llegó encima, la devolviste alta y el rival remató.');
    }

    // La pelota termina de salir del vidrio lateral
    playing('Dejas que la pelota salga del vidrio…');
    await Promise.all([flyBall(stage, ball, S.srvB, 0.5), moveTo(stage, user, [3.0, 9.0], 0.45), setPose(stage, user, id === 'globo' ? 'lob' : 'ready', 0.35)]);

    if (id === 'paralelo') {
      playing('Paralelo fuerte…');
      await setPose(stage, user, 'serveHit', 0.15);
      const line = arc(hp, [3.2, 1.05, -2.3], 1.5);
      drawPath(fx, line, { opacity: 0.4, spacing: 0.4 });
      await Promise.all([flyBall(stage, ball, line, 0.55), moveTo(stage, rReves, [3.0, -2.5], 0.45), tweenCamera(stage, ...CAM.wide(), 0.8)]);
      await setPose(stage, rReves, 'serveHit', 0.12);
      const win = joinArcs(arc([3.2, 1.05, -2.3], [0.2, 0, 5.4], 1.3), arc([0.2, 0, 5.4], [0.0, 0.9, 9.95], 1.1, 14));
      drawPath(fx, win, { color: C.bad, opacity: 0.6, spacing: 0.4 });
      await Promise.all([flyBall(stage, ball, win, 0.75), moveTo(stage, partner, [-1.4, 6.0], 0.6)]);
      return { end: true, won: false, reason: 'El paralelo fuerte le llegó al jugador de la red, que voleó al hueco entre ustedes. Era el golpe con menos margen contra el saque más difícil.' };
    }

    let from = hp;
    if (id === 'plano') {
      playing('Restas plano y bajo, a los pies del sacador…');
      await setPose(stage, user, 'serveHit', 0.15);
      const low = arc(hp, [-2.0, 0.35, -4.9], 1.2);
      drawPath(fx, low, { opacity: 0.35, spacing: 0.4 });
      await Promise.all([
        flyBall(stage, ball, low, 0.8),
        moveTo(stage, rDrive, [-1.7, -5.0], 0.5),
        (async () => { await wait(stage, 0.3); await setPose(stage, rDrive, 'volley', 0.3); })(),
        tweenCamera(stage, ...CAM.wide(), 0.9),
      ]);
      playing('Volea desde abajo, profunda… y le contestas con un globo.');
      from = [2.8, 0.95, 8.5];
      const back = joinArcs(arc([-2.0, 0.35, -4.9], [2.6, 0, 7.4], 2.3), arc([2.6, 0, 7.4], from, 1.2, 14));
      await Promise.all([flyBall(stage, ball, back, 1.1), setPose(stage, user, 'lob', 0.3), moveTo(stage, user, [2.4, 9.0], 0.6), moveTo(stage, partner, [-2.6, 8.4], 1.0)]);
    }

    // Globo: el sacador tiene que retroceder y contesta con una víbora a tu esquina
    playing(id === 'globo' ? 'Globo profundo: el sacador tiene que retroceder…' : 'Tu globo lo obliga a retroceder…');
    await setPose(stage, user, 'serveHit', 0.15);
    const lob = arc(from, [-2.4, 0, -9.0], 6.4, 70);
    let idx = 0;
    lob.forEach((p, i) => { if (i > 10 && Math.abs(p.z + 7.1) < Math.abs(lob[idx].z + 7.1)) idx = i; });
    const frac = pathInfo(lob.slice(0, idx + 1)).total / pathInfo(lob).total;
    const V = lob[idx];
    drawPath(fx, lob, { opacity: 0.3, spacing: 0.45 });
    await Promise.all([
      flyBall(stage, ball, lob, 1.6, 0, frac),
      (async () => { await moveTo(stage, rDrive, [V.x + 0.3, V.z - 0.3], 1.1); await setPose(stage, rDrive, 'overhead', 0.3); })(),
      (async () => { await wait(stage, 0.2); await setPose(stage, user, 'ready', 0.3); await moveTo(stage, user, [2.3, 7.3], 0.6); })(),
      moveTo(stage, partner, [-2.6, 8.4], 1.0),
      tweenCamera(stage, ...CAM.ret(), 1.2),
    ]);
    return animVibora(V);
  }

  async function animVibora(V) {
    const vp = [V.x, V.y, V.z];
    const B = [3.4, 0, 7.3];
    const G1 = [4.95, 0.95, 8.75];
    const G2 = [4.15, 0.8, 9.95];
    const E = [2.3, 0.75, 8.4];
    const a1 = arc(vp, B, vp[1] + 0.15);
    const a2 = arc(B, G1, 1.0, 14);
    const tail = joinArcs(arc(G1, G2, 0.95, 10), arc(G2, E, 0.95, 14));
    S.vib = { a1, a2, tail, B, G1, G2, E };
    fx.clear();
    await setPose(stage, rDrive, 'overheadHit', 0.15);
    playing('¡El rival te pega una víbora a tu esquina!');
    drawPath(fx, a1, { opacity: 0.35, spacing: 0.4 });
    await Promise.all([
      flyBall(stage, ball, a1, 0.85),
      tweenCamera(stage, ...CAM.corner(), 0.9),
      moveTo(stage, rReves, [2.2, -2.4], 0.6),
    ]);
    return 'doble';
  }

  async function animDoble(id) {
    const v = S.vib;
    fx.clear();
    const full = joinArcs(v.a2, v.tail);

    if (id === 'centro') {
      playing('Sales de la esquina y dejas que la pelota venga hacia ti…');
      drawPath(fx, full, { color: C.good, opacity: 0.45, spacing: 0.3 });
      floatLabel(fx, '①', [5.0, 1.6, 8.75], C.white);
      floatLabel(fx, '②', [4.15, 1.5, 9.95], C.white);
      await Promise.all([
        moveTo(stage, user, [1.6, 8.5], 0.6),
        flyBall(stage, ball, full, 1.2),
        moveTo(stage, rDrive, [-2.3, -3.0], 1.0),
      ]);
      await tweenCamera(stage, ...CAM.ret(), 0.9);
      return 'salida';
    }

    if (id === 'esquina') {
      playing('Te metes a la esquina…');
      const jam = joinArcs(v.a2, arc(v.G1, v.G2, 0.95, 10), arc(v.G2, [3.75, 0.95, 9.15], 0.95, 8));
      drawPath(fx, jam, { color: C.bad, opacity: 0.5, spacing: 0.3 });
      await Promise.all([moveTo(stage, user, [4.0, 9.2], 0.5), flyBall(stage, ball, jam, 0.9)]);
      floatLabel(fx, '¡Te quedó encima!', [3.4, 2.5, 9.0], C.bad);
      await setPose(stage, user, 'backhand', 0.15);
      return weakAndSmash([3.75, 0.95, 9.15], 'Te metiste a la esquina: la pelota salió del segundo vidrio hacia donde estabas, te quedó encima y la devolviste alta. El rival remató.');
    }

    if (id === 'red') {
      playing('Te vas hacia adelante…');
      const die = joinArcs(full, arc(v.E, [1.5, 0, 7.5], 0.8, 10), arc([1.5, 0, 7.5], [1.1, 0, 7.0], 0.25, 8));
      drawPath(fx, die, { color: C.bad, opacity: 0.5, spacing: 0.3 });
      await Promise.all([moveTo(stage, user, [1.9, 5.4], 0.7), flyBall(stage, ball, die, 1.6), tweenCamera(stage, ...CAM.ret(), 1.2)]);
      floatLabel(fx, 'Se murió atrás', [1.3, 1.1, 7.3], C.bad);
      await wait(stage, 0.4);
      return { end: true, won: false, reason: 'Después de dos vidrios la pelota perdió velocidad y salió poco: te fuiste demasiado adelante y se murió atrás de ti.' };
    }

    // Pegarle antes del vidrio
    playing('Intentas pegarle justo después del bote…');
    const meet = at(v.a2, 0.35);
    await Promise.all([moveTo(stage, user, [meet[0] - 0.6, meet[2] - 0.2], 0.35), flyBall(stage, ball, v.a2, 0.25, 0, 0.35), setPose(stage, user, 'volley', 0.2)]);
    return weakAndSmash(meet, 'La víbora venía baja y con efecto: al pegarle antes del vidrio te quedaste sin tiempo, la pelota salió alta y el rival remató.');
  }

  async function animSalida(id) {
    fx.clear();
    const E = S.vib.E;

    if (id === 'globo') {
      playing('Globo profundo por encima de los dos…');
      await setPose(stage, user, 'lob', 0.15);
      const lob = joinArcs(arc(E, [-0.6, 0, -9.0], 6.8, 60), arc([-0.6, 0, -9.0], [-0.8, 1.0, -9.6], 1.4, 10));
      drawPath(fx, lob, { opacity: 0.35, spacing: 0.45 });
      await Promise.all([
        flyBall(stage, ball, lob, 1.8),
        moveTo(stage, rDrive, [-1.1, -9.3], 1.6),
        moveTo(stage, rReves, [1.4, -8.8], 1.6),
        (async () => { await wait(stage, 0.4); await setPose(stage, user, 'ready', 0.2); await moveTo(stage, user, [2.3, 3.2], 1.3); })(),
        moveTo(stage, partner, [-2.0, 3.1], 1.5),
        tweenCamera(stage, ...CAM.wide(), 1.4),
      ]);
      await setPose(stage, rDrive, 'lob', 0.15);
      const weak = arc([-0.8, 1.0, -9.6], [-1.8, 1.4, 3.0], 3.2);
      drawPath(fx, weak, { opacity: 0.35, spacing: 0.4 });
      await Promise.all([flyBall(stage, ball, weak, 1.1), setPose(stage, partner, 'overhead', 0.4)]);
      await setPose(stage, partner, 'overheadHit', 0.12);
      const win = joinArcs(arc([-1.8, 1.4, 3.0], [0.6, 0, -5.5], 1.6), arc([0.6, 0, -5.5], [0.9, 0.7, -9.95], 1.0, 14));
      drawPath(fx, win, { color: C.good, opacity: 0.6, spacing: 0.4 });
      await flyBall(stage, ball, win, 0.7);
      return { end: true, won: true, reason: 'Defendiste bien la doble pared y tu globo los pasó: los dos rivales corrieron atrás, ustedes ganaron la red y tu compañero cerró el punto.' };
    }

    if (id === 'bajada') {
      playing('Le pegas plano y fuerte hacia la red…');
      await setPose(stage, user, 'serveHit', 0.15);
      const flat = arc(E, [2.2, 1.2, -2.5], 1.5);
      await Promise.all([flyBall(stage, ball, flat, 0.6), tweenCamera(stage, ...CAM.wide(), 0.8)]);
      await setPose(stage, rReves, 'serveHit', 0.12);
      const win = joinArcs(arc([2.2, 1.2, -2.5], [-0.8, 0, 6.3], 1.3), arc([-0.8, 0, 6.3], [-1.0, 0.6, 9.95], 0.9, 14));
      drawPath(fx, win, { color: C.bad, opacity: 0.6, spacing: 0.4 });
      await flyBall(stage, ball, win, 0.75);
      return { end: true, won: false, reason: 'Desde el fondo contra dos en la red, el golpe fuerte fue una volea fácil: la mandaron al hueco entre ustedes.' };
    }

    // Chiquita: en nivel avanzado sale a los pies; en los demás, un poco alta
    const good = S.level === 'avanzado';
    playing('Juegas una chiquita…');
    await setPose(stage, user, 'serveHit', 0.15);
    const end = good ? [-2.0, 0.3, -2.9] : [-2.0, 0.95, -2.9];
    await Promise.all([flyBall(stage, ball, arc(E, end, good ? 1.15 : 1.4), 1.0), moveTo(stage, rDrive, [-1.7, -3.1], 0.6), tweenCamera(stage, ...CAM.wide(), 0.9)]);
    await setPose(stage, rDrive, 'volley', 0.12);
    if (!good) {
      const win = joinArcs(arc(end, [0.6, 0, 7.6], 1.3), arc([0.6, 0, 7.6], [0.7, 0.5, 9.95], 0.8, 12));
      drawPath(fx, win, { color: C.bad, opacity: 0.6, spacing: 0.4 });
      await flyBall(stage, ball, win, 0.8);
      return { end: true, won: false, reason: `Saliendo de dos paredes es difícil controlarla: la chiquita salió un poco alta y el rival voleó a tus pies. ${S.level === 'basico' ? 'En tu nivel, el globo es la salida más segura.' : 'El globo era la opción con más margen.'}` };
    }
    const up = arc(end, [1.3, 1.2, 4.2], 2.3);
    drawPath(fx, up, { opacity: 0.35, spacing: 0.4 });
    await Promise.all([flyBall(stage, ball, up, 1.0), moveTo(stage, user, [1.7, 4.4], 1.0), moveTo(stage, partner, [-2.0, 4.5], 1.0)]);
    await setPose(stage, user, 'serveHit', 0.12);
    const win = joinArcs(arc([1.3, 1.2, 4.2], [-0.6, 0, -6.0], 1.4), arc([-0.6, 0, -6.0], [-0.8, 0.6, -9.95], 0.9, 14));
    drawPath(fx, win, { color: C.good, opacity: 0.6, spacing: 0.4 });
    await flyBall(stage, ball, win, 0.7);
    return { end: true, won: true, reason: 'Tu chiquita le cayó a los pies: voleó hacia arriba, subiste y definiste. En tu nivel, un arma para recuperar la red.' };
  }

  // ---------- Flujo: perfil, decisiones, historial y pantallas ----------

  const PTS = ['0', '15', '30', '40'];
  const RATE = {
    g: '<span class="badge ok">✓ Óptimo</span>',
    a: '<span class="badge dep">◐ Depende</span>',
    r: '<span class="badge err">✕ Error común</span>',
  };
  const EV = { fed: '<span class="ev fed">FEDERATIVO</span>', study: '<span class="ev study">ESTUDIO</span>', cons: '<span class="ev cons">CONSENSO + LÓGICA</span>' };

  const formation = document.createElement('div');
  formation.className = 'hud tl';
  stageEl.appendChild(formation);
  const prof = document.createElement('div');
  prof.className = 'hud tr prof';
  stageEl.appendChild(prof);
  const clockEl = document.createElement('div');
  clockEl.className = 'clock';
  stageEl.appendChild(clockEl);

  // Reloj sobre la pelota: horas alrededor y, en el feedback, la zona elegida y la correcta
  function drawClock() {
    const on = S.node === 'reloj' && (S.view === 'question' || S.view === 'feedback');
    clockEl.classList.toggle('on', on);
    if (!on) return;
    const P = (h, r) => { const a = (h * Math.PI) / 6; return [(r * Math.sin(a)).toFixed(1), (-r * Math.cos(a)).toFixed(1)]; };
    const span = (id) => (id === '12' ? [-0.5, 0.5] : id.split('-').map(Number));
    const sector = (id, color, op, dashed) => {
      const [a, b] = span(id);
      const [x1, y1] = P(a, 56);
      const [x2, y2] = P(b, 56);
      const [mx, my] = P((a + b) / 2, 41);
      return `<path d="M0 0 L${x1} ${y1} A56 56 0 0 1 ${x2} ${y2} Z" fill="${color}" fill-opacity="${op}" stroke="${color}" stroke-width="2.5"${dashed ? ' stroke-dasharray="5 4"' : ''}/>`
        + `<circle cx="${mx}" cy="${my}" r="6.5" fill="${color}" stroke="#08111f" stroke-width="2"/>`;
    };
    let marks = '';
    if (S.view === 'feedback') {
      const pick = S.pending;
      const ok = clockFor(choice('lob'));
      const col = { g: '#3ddc97', a: '#ffc542', r: '#ff6b5b' }[NODES.reloj.fb(pick).r];
      if (pick !== ok) marks += sector(ok, '#3ddc97', 0.15, true);
      marks += sector(pick, col, 0.45);
    }
    const ticks = Array.from({ length: 60 }, (_, i) => {
      const big = i % 5 === 0;
      const [x1, y1] = P(i / 5, big ? 64 : 69);
      const [x2, y2] = P(i / 5, 74);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-opacity="${big ? 0.9 : 0.35}" stroke-width="${big ? 2.2 : 1}"/>`;
    }).join('');
    const nums = Array.from({ length: 12 }, (_, i) => {
      const [x, y] = P(i + 1, 87);
      return `<text x="${x}" y="${y}" fill="#fff" font-size="13" font-weight="800" text-anchor="middle" dominant-baseline="central">${i + 1}</text>`;
    }).join('');
    clockEl.innerHTML = `<svg viewBox="-100 -100 200 200" aria-label="Pelota con reloj">
      <defs><radialGradient id="pb" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#f6ff9a"/><stop offset=".6" stop-color="#dcef3c"/><stop offset="1" stop-color="#a3b81a"/></radialGradient></defs>
      <circle r="78" fill="rgba(7,15,28,.6)" stroke="rgba(255,255,255,.55)" stroke-width="1.5"/>
      ${ticks}
      <circle r="56" fill="url(#pb)"/>
      <path d="M-38 -41 C-12 -16 -12 16 -38 41 M38 -41 C12 -16 12 16 38 41" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M0 -56 V56 M-56 0 H56" stroke="#08111f" stroke-opacity=".18" stroke-width="1"/>
      ${marks}
      ${nums}
    </svg><div class="cap">Vista desde atrás de la pelota, como la ves tú · ${hand('derecho', 'zurdo')}</div>`;
  }

  function header() {
    formation.textContent = isResto() ? 'Restas · formación convencional' : aus() ? 'Formación australiana' : 'Formación convencional';
    prof.style.display = S.hand ? '' : 'none';
    prof.textContent = S.hand ? `${hand('Derecho', 'Zurdo')} · ${LEVELS[S.level]} ✎` : '';
    $('proto-title').textContent = `Punto ${S.point} · ${isResto() ? 'Restas tú' : 'Sacas tú'}`;
    $('proto-score').textContent = `${PTS[S.score[0]]} - ${PTS[S.score[1]]}`;
    const chips = S.choices.map((c, i) => `<span class="chip"><i class="dot ${c.r}"></i>${i + 1} · ${c.s}</span>`);
    if (S.view === 'question' || S.view === 'feedback') {
      chips.push(`<span class="chip now"><i class="dot n"></i>${S.choices.length + 1} · ${NODES[S.node].short}</span>`);
    }
    const trail = $('proto-trail');
    trail.innerHTML = chips.join('');
    trail.scrollLeft = trail.scrollWidth;
    backEl.classList.toggle('disabled', S.busy || S.view === 'profile' || (S.stack.length < 2 && S.view !== 'feedback' && S.view !== 'end'));
    drawClock();
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
      ${f.yes?.length ? `<div class="box yes"><div class="lbl">Funciona si</div>${list(f.yes)}</div>` : ''}
      ${f.warn?.length ? `<div class="box warn"><div class="lbl">Cuidado si</div>${list(f.warn)}</div>` : ''}
      ${f.tip ? `<div class="box tip"><div class="lbl">Para tu nivel · ${LEVELS[S.level]}</div>${f.tip}</div>` : ''}
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

  // Arranca el punto actual: en el resto primero se ve el saque del rival
  async function beginPoint() {
    if (isResto()) {
      S.busy = true;
      S.view = 'playing';
      header();
      await introResto();
    }
    stage.skip = false;
    S.busy = false;
    enterNode(isResto() ? 'resto' : 'speed');
  }

  async function nextPoint() {
    S.busy = true;
    S.point += 1;
    setKind();
    S.choices = [];
    S.stack = [];
    S.view = 'playing';
    playing({
      saque: `Punto ${S.point}: sacas desde el lado derecho (drive)…`,
      australiana: `Punto ${S.point}: ahora sacas desde el lado del revés…`,
      resto: `Punto ${S.point}: ahora te toca restar. Saca el rival…`,
    }[S.kind]);
    header();
    fx.clear();
    ball.show(false);
    const lay = layout();
    await Promise.all([...lay.map(([p, pos]) => moveTo(stage, p, pos, 1.4)), tweenCamera(stage, ...(isResto() ? CAM.ret() : CAM.serve()), 1.4)]);
    await Promise.all(lay.map(([p, , pose]) => setPose(stage, p, pose)));
    stage.skip = false;
    await beginPoint();
  }

  function repeatPoint() {
    S.score = S.scoreBefore;
    const first = S.stack[0];
    S.stack = [first];
    restore(first.snap, first.key);
    S.node = first.key;
    renderQuestion();
  }

  // ---- Perfil: derecho o zurdo, y nivel ----

  function openProfile() {
    if (S.busy || S.view === 'profile') return;
    S.saved = { html: sheet.innerHTML, view: S.view };
    S.draft = { hand: S.hand, level: S.level };
    renderProfile();
  }

  function renderProfile() {
    S.view = 'profile';
    const d = S.draft;
    const first = !S.hand;
    const pick = (attr, v, t, desc) => `<div class="opt${d[attr] === v ? ' sel' : ''}" data-${attr}="${v}"><div><div class="t">${t}</div><div class="d">${desc}</div></div></div>`;
    sheet.innerHTML = `<div class="kicker">${first ? 'Antes de empezar' : 'Tu perfil'}</div>
      <div class="q">${first ? 'Cuéntanos cómo juegas' : 'Cambia tu perfil'}</div>
      <div class="ctx">Ajustamos los consejos a tu mano y a tu nivel.${first ? '' : ' Al guardar, el punto vuelve a empezar.'}</div>
      <div class="plbl">¿Eres derecho o zurdo?</div>
      <div class="pick-row">${pick('hand', 'R', 'Derecho', 'Juego con la derecha')}${pick('hand', 'L', 'Zurdo', 'Juego con la izquierda')}</div>
      <div class="plbl">¿Cuál es tu nivel?</div>
      ${pick('level', 'basico', 'Básico', 'Estoy aprendiendo: me cuesta mantener el peloteo')}
      ${pick('level', 'intermedio', 'Intermedio', 'Peloteo bien, subo a la red y ya juego bandeja')}
      ${pick('level', 'avanzado', 'Avanzado', 'Juego víbora, salidas de pared y compito')}
      <div class="btns">${first ? '' : '<div class="btn sec" data-act="cancel">Cancelar</div>'}<div class="btn pri${d.hand && d.level ? '' : ' disabled'}" data-act="save">${first ? 'Empezar →' : 'Guardar'}</div></div>`;
    header();
  }

  function saveProfile() {
    const { hand: h, level } = S.draft;
    if (!h || !level) return;
    const first = !S.hand;
    S.hand = h;
    S.level = level;
    applyHand();
    if (first || !S.stack.length) return beginPoint();
    if (S.saved.view === 'end') S.score = S.scoreBefore;
    const top = S.stack[0];
    S.stack = [top];
    restore(top.snap, top.key);
    S.node = top.key;
    renderQuestion();
  }

  function cancelProfile() {
    sheet.innerHTML = S.saved.html;
    S.view = S.saved.view;
    header();
  }

  prof.addEventListener('click', openProfile);

  sheet.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (S.view === 'profile') {
      const hd = e.target.closest('[data-hand]');
      const lvl = e.target.closest('[data-level]');
      if (hd) { S.draft.hand = hd.dataset.hand; renderProfile(); }
      if (lvl) { S.draft.level = lvl.dataset.level; renderProfile(); }
      if (act === 'save') saveProfile();
      if (act === 'cancel') cancelProfile();
      return;
    }
    const opt = e.target.closest('[data-opt]');
    if (opt && !S.busy) return renderFeedback(opt.dataset.opt);
    if (act === 'skip') stage.skip = true;
    if (S.busy) return;
    if (act === 'change') renderQuestion();
    if (act === 'go') proceed();
    if (act === 'next') nextPoint();
    if (act === 'repeat') repeatPoint();
  });

  backEl.addEventListener('click', () => {
    if (S.busy || S.view === 'profile') return;
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
  setKind();
  placeAll();
  S.draft = { hand: null, level: null };
  renderProfile();
}
