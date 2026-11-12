/* King theme (the crown build): regal and smug with sparkling gems, and a shower of coins. */
function crown(g, dy, t) {
  const gold = Sim.hex('#f0c419'), dark = Sim.hex('#b8860b');
  g.fillRect(60, 44 + dy, 120, 22, gold);
  for (let i = 0; i < 4; i++) g.fillTriangle(60 + i * 30, 46 + dy, 90 + i * 30, 46 + dy, 75 + i * 30, 10 + dy, gold);
  g.fillRect(60, 62 + dy, 120, 4, dark);
  const gems = [Sim.C.RED, Sim.C.GREEN, Sim.C.MAGENTA, Sim.C.BLUE];
  for (let i = 0; i < 4; i++) {
    const tw = 0.5 + 0.5 * Math.sin(t * 5 + i * 1.3);
    g.fillCircle(75 + i * 30, 54 + dy, 4, Sim.lerp565(gems[i], Sim.C.WHITE, tw * 0.6));
    if (tw > 0.9) { g.drawFastHLine(69 + i * 30, 54 + dy, 13, Sim.C.WHITE); g.drawFastVLine(75 + i * 30, 48 + dy, 13, Sim.C.WHITE); }
  }
}

Sim.register({
  name: 'King: royal',
  theme: 'king',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(Sim.hex('#1a0a2a'));
    F.background = Sim.hex('#1a0a2a');
    const dy = Math.round(2 * Math.sin(t * 1.5));
    const smug = F.kf(t, [[0.8, 0], [1.2, 1], [3.0, 1], [3.5, 0]]);
    F.eyes(g, { open: 1 - 0.4 * smug, lookX: Math.round(6 * smug), iris: 15 }, 0, dy + 8);
    F.brow(g, F.LX, F.EY + dy - 24, Math.round(2 + 10 * smug), -8 * smug);
    F.brow(g, F.RX, F.EY + dy - 24, 2, 4 * smug);
    // asymmetric smirk
    g.drawArc(128, F.MY + dy + 2, 24, 18, 180 - 50, 180 + 20 + Math.round(40 * smug), F.MOUTH);
    crown(g, dy, t);
    // royal robe with gold trim
    g.fillRoundRect(30, 200, 180, 50, 20, Sim.hex('#6a1a8a'));
    g.fillRect(30, 200, 180, 6, Sim.hex('#f0c419'));
    g.fillRoundRect(100, 200, 40, 50, 6, Sim.hex('#eef0f8'));
    for (let i = 0; i < 3; i++) g.fillCircle(120, 214 + i * 12, 3, Sim.hex('#f0c419'));
  },
});

Sim.register({
  name: 'King: coins',
  theme: 'king',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(Sim.hex('#1a0a2a'));
    F.background = Sim.hex('#1a0a2a');
    const kr = n => (Math.sin(n * 61.7) * 43758.5453) % 1;
    const gold = Sim.hex('#f0c419');
    // coins rain down behind the face
    for (let k = 0; k < 14; k++) {
      const u = ((t / (1.5 + kr(k + 9))) + kr(k + 1)) % 1;
      const x = Math.round(20 + 200 * kr(k + 3)), y = Math.round(-20 + 280 * u);
      const w = Math.max(2, Math.round(8 * Math.abs(Math.cos(t * 6 + k))));
      g.fillEllipse(x, y, w, 8, gold); if (w > 4) g.drawEllipse(x, y, w - 2, 5, Sim.hex('#b8860b'));
    }
    const dy = Math.round(3 * Math.sin(t * 2));
    const greedy = F.kf(t, [[0.6, 0], [0.9, 1], [3.2, 1], [3.6, 0]]);
    F.eyes(g, { iris: Math.round(16 + 4 * greedy), pupil: 0.3, lookY: Math.round(-2 * greedy) }, 0, dy + 8);
    if (greedy > 0.5) for (const cx of [F.LX, F.RX]) {   // $ signs in the eyes
      g.fillCircle(cx, F.EY + dy + 8, 7, gold);
      g.drawFastVLine(cx, F.EY + dy + 2, 13, Sim.hex('#1a0a2a')); g.drawArc(cx, F.EY + dy + 5, 4, 2, 90, 300, Sim.hex('#1a0a2a')); g.drawArc(cx, F.EY + dy + 11, 4, 2, 270, 480 - 360, Sim.hex('#1a0a2a'));
    }
    F.grin(g, 120, F.MY + dy, Math.round(20 + 14 * greedy), Math.round(4 + 14 * greedy));
    crown(g, dy, t);
  },
});

Sim.register(FaceRig.animation({
  name: 'King: cheers', theme: 'king', fps: 24, duration: 3600,
  colors: { bg: '#1a0a2a' },
  tracks: {
    headY: [[0, 8]],
    squint: [[0, 0], [900, 0], [1100, 1], [2600, 1], [2900, 0]],
    mouthCurve: [[0, 0.7], [900, 1]],
    mouthOpen: [[0, 0], [900, 0], [1100, 0.7], [2600, 0.7], [2900, 0]],
    mouthWidth: [[0, 26], [1100, 32], [2900, 26]],
    blush: [[0, 0], [1100, 0.8], [2900, 0]],
    sparkle: [[0, 0], [1200, 1], [2500, 1], [2800, 0]],
  },
}, {
  over(g, c) {
    crown(g, c.dy, c.t);
    // golden goblet raised for a toast
    const lift = Face.kf(c.t, [[0.4, 0], [1.0, 1, 'pop'], [2.6, 1], [3.1, 0]]);
    const gold = Sim.hex('#f0c419'), x = 204, y = 194 - Math.round(34 * lift);
    g.fillTriangle(x - 13, y - 18, x + 13, y - 18, x, y, gold);
    g.fillEllipse(x, y - 18, 13, 4, Sim.hex('#b8860b'));
    g.fillEllipse(x, y - 18, 10, 2, Sim.hex('#a0102a'));
    g.fillRect(x - 2, y, 4, 11, gold);
    g.fillEllipse(x, y + 12, 8, 3, gold);
    if (lift > 0.95 && c.t < 1.4) for (let k = 0; k < 4; k++) {
      const a = -Math.PI / 2 + (k - 1.5) * 0.5;
      g.drawLine(x + Math.round(18 * Math.cos(a)), y - 22 + Math.round(18 * Math.sin(a)), x + Math.round(26 * Math.cos(a)), y - 22 + Math.round(26 * Math.sin(a)), Sim.C.WHITE);
    }
  },
}));
