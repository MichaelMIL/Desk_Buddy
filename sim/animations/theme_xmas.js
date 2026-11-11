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
    const hy = 30 + dy;
    g.fillTriangle(48, hy + 48, 176, hy + 48, 150, hy - 10, Sim.hex('#d8202a'));
    g.fillRoundRect(40, hy + 40, 150, 18, 9, Sim.C.WHITE);
    g.fillCircle(154 + Math.round(3 * Math.sin(t * 2)), hy - 10, 11, Sim.C.WHITE);
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
