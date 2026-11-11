/* Space theme: the buddy in a helmet among twinkling stars, and a rocket flying by. */
const sr = (n => (Math.sin(n * 91.17) * 43758.5453) % 1);

function stars(g, t, n, bg) {
  for (let k = 0; k < n; k++) {
    const x = Math.round(sr(k + 1) * 240), y = Math.round(sr(k + 100) * 240);
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (1 + sr(k + 200)) * 2 + k));
    const c = Sim.lerp565(bg, Sim.C.WHITE, tw);
    g.drawPixel(x, y, c);
    if (k % 7 === 0) { g.drawPixel(x + 1, y, c); g.drawPixel(x, y + 1, c); }
  }
}

Sim.register({
  name: 'Space: astronaut',
  theme: 'space',
  fps: 24,
  duration: 5000,

  frame(g, f) {
    const F = Face, t = f.t / 1000, bg = Sim.hex('#050816');
    g.clear(bg);
    stars(g, t, 50, bg);
    // slow drift of the whole buddy
    const dx = Math.round(6 * Math.sin(t * Math.PI * 2 / 5)), dy = Math.round(5 * Math.cos(t * Math.PI * 2 / 5));
    // helmet
    g.fillCircle(120 + dx, 120 + dy, 104, Sim.hex('#c9d4e8'));
    g.fillCircle(120 + dx, 120 + dy, 94, Sim.hex('#0d1326'));
    const blink = F.kf(t, [[2.2, 1], [2.35, 0.05], [2.5, 1], [3.9, 1], [4.0, 0.05], [4.1, 1]]);
    F.eyes(g, { open: blink, lookX: Math.round(5 * Math.sin(t * 1.3)), lookY: Math.round(2 * Math.cos(t)), iris: 16 }, dx, dy + 4);
    F.smile(g, 120 + dx, F.MY + dy, 26, 0.8, 6);
    // visor reflection
    g.drawArc(120 + dx, 120 + dy, 90, 84, 300, 350, Sim.hex('#9fb8e8'));
    g.drawArc(120 + dx, 120 + dy, 78, 75, 305, 325, Sim.hex('#9fb8e8'));
  },
});

Sim.register({
  name: 'Space: rocket',
  theme: 'space',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const t = f.t / 1000, bg = Sim.hex('#050816');
    g.clear(bg);
    stars(g, t, 40, bg);
    // a planet with a ring
    g.fillCircle(176, 70, 26, Sim.hex('#d9833b'));
    g.fillEllipse(176, 70, 42, 9, Sim.lerp565(bg, Sim.hex('#f0d9b5'), 0.8));
    g.fillCircle(176, 70, 26, Sim.hex('#d9833b'));
    g.fillEllipse(176, 76, 42, 4, Sim.hex('#f0d9b5'));
    // rocket flies from bottom-left to top-right and loops
    const p = f.p;
    const rx = Math.round(-40 + 320 * p), ry = Math.round(250 - 300 * p + 10 * Math.sin(t * 6));
    const ang = -Math.PI / 4; // 45 degrees up-right
    const c = Math.cos(ang), s = Math.sin(ang);
    const P = (x, y) => [Math.round(rx + x * c - y * s), Math.round(ry + x * s + y * c)];
    const body = Sim.hex('#e8eef8'), nose = Sim.hex('#ff4f4f');
    // flame (flickers)
    const fl = 18 + Math.round(8 * Math.abs(Math.sin(t * 25)));
    let [a1, b1] = P(-30, -8), [a2, b2] = P(-30, 8), [a3, b3] = P(-30 - fl, 0);
    g.fillTriangle(a1, b1, a2, b2, a3, b3, Sim.C.ORANGE);
    [a1, b1] = P(-30, -4); [a2, b2] = P(-30, 4); [a3, b3] = P(-30 - (fl >> 1), 0);
    g.fillTriangle(a1, b1, a2, b2, a3, b3, Sim.C.YELLOW);
    // fins, body, nose, window
    [a1, b1] = P(-30, -8); [a2, b2] = P(-32, -22); [a3, b3] = P(-12, -8);
    g.fillTriangle(a1, b1, a2, b2, a3, b3, nose);
    [a1, b1] = P(-30, 8); [a2, b2] = P(-32, 22); [a3, b3] = P(-12, 8);
    g.fillTriangle(a1, b1, a2, b2, a3, b3, nose);
    for (let i = -30; i <= 14; i++) { const [x, y] = P(i, 0); g.fillCircle(x, y, 9, body); }
    [a1, b1] = P(14, -9); [a2, b2] = P(14, 9); [a3, b3] = P(34, 0);
    g.fillTriangle(a1, b1, a2, b2, a3, b3, nose);
    const [wx, wy] = P(-2, 0);
    g.fillCircle(wx, wy, 5, Sim.hex('#58c8ff'));
    g.drawCircle(wx, wy, 6, Sim.hex('#6c7a90'));
    // smoke puffs behind
    for (let k = 1; k <= 4; k++) {
      const u = (p * 4 + k / 4) % 1;
      const [sx, sy] = P(-40 - k * 14, 6 * Math.sin(k * 2 + t * 3));
      g.fillCircle(sx, sy, 3 + k, Sim.lerp565(bg, Sim.hex('#8892a6'), 1 - u * 0.6));
    }
  },
});
