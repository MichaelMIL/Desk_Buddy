/* Unicorn theme (the horn build): a rainbow sweep with a glowing horn, and starry-eyed sparkles. */
function horn(g, dy, glow) {
  const base = Sim.hex('#f5e6ff');
  g.fillTriangle(104, 62 + dy, 136, 62 + dy, 120, 2 + dy, Sim.lerp565(base, Sim.C.WHITE, glow));
  for (let i = 1; i < 5; i++) g.drawLine(104 + i * 3, 62 + dy - i * 12, 136 - i * 3, 62 + dy - i * 12 - 4, Sim.hex('#d9a6ff'));
}
function mane(g, dy, t) {
  const cols = ['#ff7ab3', '#ffb86b', '#fff26b', '#7bffb0', '#7bc8ff', '#c57bff'].map(Sim.hex);
  for (let i = 0; i < 6; i++) {
    const s = i < 3 ? -1 : 1, k = i % 3;
    g.fillEllipse(120 + s * (74 + k * 10), 56 + dy + k * 26 + Math.round(4 * Math.sin(t * 2 + i)), 16, 12, cols[i]);
  }
}

Sim.register({
  name: 'Unicorn: rainbow',
  theme: 'unicorn',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(Sim.hex('#1e0f3a'));
    F.background = Sim.hex('#1e0f3a');
    // rainbow sweeps across the top
    const sweep = F.kf(t, [[0.3, 0], [1.8, 1], [3.6, 1], [4.0, 0]]);
    const cols = ['#ff4f6d', '#ff9f43', '#ffe14d', '#4dff88', '#4dc9ff', '#b56bff'].map(Sim.hex);
    cols.forEach((c, i) => { if (sweep > 0) g.drawArc(120, 150, 150 - i * 8, 143 - i * 8, 270, 270 + Math.round(180 * sweep), c); });
    const dy = Math.round(3 * Math.sin(t * 1.5));
    mane(g, dy, t);
    horn(g, dy, 0.5 + 0.5 * Math.sin(t * 4));
    const blink = F.kf(t, [[2.4, 1], [2.55, 0.05], [2.7, 1]]);
    F.eyes(g, { open: blink, iris: 17, lookX: Math.round(4 * Math.sin(t)) }, 0, dy + 6);
    F.smile(g, 120, F.MY + dy + 4, 26, 0.8, 6);
    F.blush(g, 0.9, 0, dy + 6);
  },
});

Sim.register({
  name: 'Unicorn: sparkle',
  theme: 'unicorn',
  fps: 24,
  duration: 3000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(Sim.hex('#1e0f3a'));
    F.background = Sim.hex('#1e0f3a');
    const ur = n => (Math.sin(n * 33.1) * 43758.5453) % 1;
    for (let k = 0; k < 12; k++) {
      const u = ((t / 1.5) + ur(k + 1)) % 1, s = Math.round(2 + 6 * Math.sin(u * Math.PI));
      const x = Math.round(ur(k + 5) * 240), y = Math.round(ur(k + 9) * 240);
      const c = Sim.lerp565(Sim.hex('#1e0f3a'), Sim.C.WHITE, Math.sin(u * Math.PI));
      g.drawFastHLine(x - s, y, 2 * s + 1, c); g.drawFastVLine(x, y - s, 2 * s + 1, c);
    }
    const dy = Math.round(2 * Math.sin(t * 2));
    mane(g, dy, t);
    horn(g, dy, 0.6);
    const star = F.kf(t, [[0.6, 0], [0.9, 1], [2.2, 1], [2.6, 0]]);
    F.eyes(g, { iris: 16, pupil: 0.4 }, 0, dy + 6);
    if (star > 0.3) for (const cx of [F.LX, F.RX]) {   // star-shaped pupils
      const r = Math.round(9 * star), c = Sim.C.YELLOW, cy = F.EY + dy + 6;
      g.fillTriangle(cx, cy - r, cx - r, cy + Math.round(r * 0.6), cx + r, cy + Math.round(r * 0.6), c);
      g.fillTriangle(cx, cy + r, cx - r, cy - Math.round(r * 0.6), cx + r, cy - Math.round(r * 0.6), c);
    }
    F.smile(g, 120, F.MY + dy + 4, 28, 1, 6);
    F.blush(g, 1, 0, dy + 6);
  },
});
