/* Birthday theme: candles on a cake, and a party with a noisemaker and confetti. */
function partyHat(g, dy, t) {
  const tilt = Math.round(3 * Math.sin(t * 2));
  g.fillTriangle(92 + tilt, 50 + dy, 148 + tilt, 50 + dy, 124 + tilt * 2, 2 + dy, Sim.hex('#4fb3ff'));
  for (let i = 0; i < 3; i++) {
    const y = 40 - i * 12 + dy, half = Math.round(24 - i * 7);
    g.fillRect(122 + tilt - half + i * 2, y, 2 * half - i * 3, 4, Sim.hex('#ffe14d'));
  }
  g.fillCircle(124 + tilt * 2, 3 + dy, 6, Sim.hex('#ff4f7a'));
  g.fillRoundRect(86 + tilt, 48 + dy, 68, 6, 3, Sim.hex('#ffe14d'));
}
const CONFETTI = ['#ff4f7a', '#ffe14d', '#4fb3ff', '#7bffb0', '#c57bff'].map(Sim.hex);
function confetti(g, t, n, bg) {
  for (let k = 0; k < n; k++) {
    const h = (Math.sin(k * 12.9898) * 43758.5453) % 1, h2 = (Math.sin(k * 78.233) * 43758.5453) % 1;
    const y = Math.round(((t * (60 + 50 * Math.abs(h2))) + Math.abs(h) * 260) % 260) - 10;
    const x = Math.round(Math.abs(h2) * 240 + 8 * Math.sin(t * 3 + k));
    const w = Math.max(1, Math.round(5 * Math.abs(Math.cos(t * 6 + k))));
    g.fillRect(x, y, w, 4, CONFETTI[k % CONFETTI.length]);
  }
}

Sim.register(FaceRig.animation({
  name: 'Birthday: cake', theme: 'birthday', fps: 20, duration: 4000,
  tracks: {
    headY: [[0, -8]],
    lookY: [[0, 9]],
    mouthWidth: [[0, 22]],
    squint: [[0, 0], [1600, 0], [1900, 1], [3500, 1], [3900, 0]],
    mouthCurve: [[0, 0.8], [1600, 1]],
    mouthOpen: [[0, 0], [1600, 0], [1900, 0.7], [3500, 0.7], [3900, 0]],
    blush: [[0, 0.4], [1900, 0.9]],
    sparkle: [[0, 0], [1700, 0], [2000, 1], [3400, 1], [3800, 0]],
  },
}, {
  over(g, c) {
    partyHat(g, c.dy, c.t);
    // cake
    const x0 = 82, y0 = 200;
    g.fillRoundRect(x0, y0, 76, 28, 6, Sim.hex('#f2c48d'));
    g.fillRoundRect(x0, y0, 76, 10, 5, Sim.hex('#ff8fb3'));
    for (let i = 0; i < 5; i++) g.fillCircle(x0 + 8 + i * 15, y0 + 10, 3, Sim.hex('#ff8fb3'));
    for (let i = 0; i < 3; i++) {
      const cx = x0 + 18 + i * 20;
      g.fillRect(cx - 2, y0 - 14, 5, 14, CONFETTI[i + 1]);
      const fl = Math.abs(Math.sin(c.t * 14 + i * 2));
      g.fillEllipse(cx, y0 - 20, 3, 5 + Math.round(2 * fl), Sim.hex('#ffb000'));
      g.fillEllipse(cx, y0 - 19, 2, 3, Sim.hex('#fff2a6'));
    }
  },
}));

Sim.register(FaceRig.animation({
  name: 'Birthday: party', theme: 'birthday', fps: 24, duration: 3000,
  tracks: {
    squint: [[0, 1]],
    blush: [[0, 1]],
    mouthCurve: [[0, 1]],
    mouthOpen: [[0, 0.2]],
    mouthWidth: [[0, 14]],
    bob: [[0, 0.6]],
  },
}, {
  under(g, c) { confetti(g, c.t, 36, c.bg); },
  over(g, c) {
    partyHat(g, c.dy, c.t);
    // noisemaker unrolls from the mouth and rolls back up
    const blow = Face.kf(c.t, [[0.2, 0], [0.5, 1], [1.2, 1], [1.5, 0], [1.7, 0], [2.0, 1], [2.6, 1], [2.9, 0]]);
    const mx = 132, my = 158 + c.dy, len = Math.round(18 + 66 * blow);
    g.fillRoundRect(mx - 6, my - 4, 12, 9, 3, Sim.hex('#ffe14d'));
    if (blow < 0.2) g.fillCircle(mx + 12, my, 8, Sim.hex('#ff4f7a'));
    else {
      g.fillRoundRect(mx + 4, my - 5, len, 10, 5, Sim.hex('#ff4f7a'));
      for (let i = 10; i < len; i += 12) g.fillRect(mx + 4 + i, my - 5, 4, 10, Sim.hex('#ffe14d'));
      g.fillTriangle(mx + 4 + len, my - 9, mx + 4 + len, my + 9, mx + 14 + len, my, Sim.hex('#ff4f7a'));
    }
  },
}));
