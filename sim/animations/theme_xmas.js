/* Christmas theme: the buddy in a Santa hat with falling snow, and a ring of blinking lights. */
const xr = (n => (Math.sin(n * 78.233) * 43758.5453) % 1);

Sim.register({
  name: 'Christmas: santa',
  theme: 'xmas',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(Sim.hex('#0b1a2e'));
    F.background = Sim.hex('#0b1a2e');
    // snow (persistent positions, falling with a sway)
    for (let k = 0; k < 40; k++) {
      const speed = 25 + 30 * xr(k + 7);
      const y = Math.round((xr(k + 1) * 240 + t * speed) % 250) - 5;
      const x = Math.round(xr(k + 3) * 240 + 6 * Math.sin(t * 1.5 + k));
      g.fillCircle(x, y, k % 5 === 0 ? 2 : 1, Sim.C.WHITE);
    }
    const blink = F.kf(t, [[1.8, 1], [1.95, 0.05], [2.1, 1]]);
    const dy = Math.round(4 * Math.sin(t * Math.PI));
    F.eyes(g, { open: blink, lookX: Math.round(3 * Math.sin(t)) , iris: 16 }, 0, dy + 6);
    F.smile(g, 120, F.MY + dy + 6, 30, 0.9, 6);
    F.blush(g, 0.8, 0, dy + 6);
    // hat: red cone with white brim and pompom, bobbing with the head
    const hy = 16 + dy;
    g.fillTriangle(48, hy + 48, 176, hy + 48, 140, hy - 4, Sim.hex('#d8202a'));
    g.fillRoundRect(40, hy + 40, 150, 18, 9, Sim.C.WHITE);
    g.fillCircle(146 + Math.round(3 * Math.sin(t * 2)), hy + 2, 10, Sim.C.WHITE);
  },
});

Sim.register({
  name: 'Christmas: lights',
  theme: 'xmas',
  fps: 12,
  frames: 48,

  setup(g) {
    g.clear(Sim.hex('#0b1a2e'));
    // a small tree in the middle
    const green = Sim.hex('#1f7a3a');
    g.fillTriangle(120, 48, 70, 110, 170, 110, green);
    g.fillTriangle(120, 72, 60, 146, 180, 146, green);
    g.fillTriangle(120, 100, 48, 182, 192, 182, green);
    g.fillRect(110, 182, 20, 18, Sim.hex('#6b3e1f'));
    g.fillCircle(120, 46, 7, Sim.C.YELLOW);
  },

  frame(g, f) {
    const cols = [Sim.C.RED, Sim.C.YELLOW, Sim.C.CYAN, Sim.C.MAGENTA, Sim.C.GREEN];
    // 24 bulbs around the rim, chasing
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = Math.round(120 + 106 * Math.sin(a)), y = Math.round(120 - 106 * Math.cos(a));
      const on = (i + f.i) % 4 === 0;
      const c = cols[i % cols.length];
      g.fillCircle(x, y, 5, on ? c : Sim.lerp565(c, Sim.C.BLACK, 0.7));
    }
    // baubles on the tree twinkle
    const spots = [[100, 100], [140, 128], [96, 160], [150, 168], [120, 140], [80, 176], [162, 108]];
    spots.forEach(([x, y], k) => g.fillCircle(x, y, 5, cols[(k + (f.i >> 2)) % cols.length]));
  },
});

Sim.register({
  name: 'Christmas: snowman',
  theme: 'xmas',
  fps: 20,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000, bg = Sim.hex('#0b1a2e');
    g.clear(bg);
    for (let k = 0; k < 30; k++) {
      const y = Math.round((xr(k + 1) * 240 + t * (20 + 25 * xr(k + 7))) % 250) - 5;
      g.fillCircle(Math.round(xr(k + 3) * 240 + 5 * Math.sin(t + k)), y, 1, Sim.C.WHITE);
    }
    // snowman: head is the face, body below, scarf, carrot nose, twig arms
    const dy = Math.round(3 * Math.sin(t * 2));
    g.fillCircle(120, 215, 70, Sim.hex('#eef4ff'));
    g.fillCircle(120, 118 + dy, 66, Sim.hex('#eef4ff'));
    g.fillRoundRect(68, 162 + dy, 104, 14, 7, Sim.hex('#d8202a'));
    g.fillRoundRect(140, 170 + dy, 16, 36, 6, Sim.hex('#d8202a'));
    const blink = F.kf(t, [[2.0, 1], [2.12, 0.05], [2.3, 1]]);
    for (const cx of [98, 142]) { g.fillCircle(cx, 104 + dy, 7, Sim.hex('#1a1a22')); if (blink < 0.3) g.fillRect(cx - 8, 97 + dy, 16, 14, Sim.hex('#eef4ff')); }
    g.fillTriangle(120, 112 + dy, 120, 124 + dy, 150, 120 + dy, Sim.C.ORANGE);
    for (let i = 0; i < 5; i++) g.fillCircle(100 + i * 10, 140 + dy + Math.abs(i - 2) * -2, 3, Sim.hex('#1a1a22'));
    const wave = Math.round(8 * Math.sin(t * 3));
    g.drawLine(60, 200, 20, 170 - wave, Sim.hex('#6b3e1f')); g.drawLine(60, 201, 20, 171 - wave, Sim.hex('#6b3e1f'));
    g.drawLine(180, 200, 220, 175, Sim.hex('#6b3e1f')); g.drawLine(180, 201, 220, 176, Sim.hex('#6b3e1f'));
    // top hat
    g.fillRect(84, 54 + dy, 72, 8, Sim.hex('#1a1a22'));
    g.fillRect(96, 20 + dy, 48, 36, Sim.hex('#1a1a22'));
    g.fillRect(96, 46 + dy, 48, 6, Sim.hex('#d8202a'));
  },
});
