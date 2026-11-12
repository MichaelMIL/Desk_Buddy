/* Valentine theme: a pounding heart with heart-shaped pupils, and cupid's arrow. */
function heart(g, x, y, s, col) {
  g.fillCircle(x - s, y, s, col);
  g.fillCircle(x + s, y, s, col);
  g.fillTriangle(x - 2 * s, y + Math.round(s * 0.3), x + 2 * s, y + Math.round(s * 0.3), x, y + Math.round(s * 2.6), col);
}

Sim.register(FaceRig.animation({
  name: 'Valentine: heartbeat', theme: 'valentine', fps: 24, duration: 3000,
  colors: { bg: '#200814' },
  tracks: { blush: [[0, 1]], mouthCurve: [[0, 1]], mouthOpen: [[0, 0.3]], mouthWidth: [[0, 24]], iris: [[0, 6]] },
}, {
  under(g, c) {
    const beat = Math.pow(Math.abs(Math.sin(c.t * Math.PI * 1.2)), 8);   // lub-dub
    heart(g, 120, 76, Math.round(46 + 8 * beat), Sim.lerp565(c.bg, Sim.hex('#ff4f7a'), 0.35 + 0.25 * beat));
  },
  over(g, c) {
    const beat = Math.pow(Math.abs(Math.sin(c.t * Math.PI * 1.2)), 8);
    for (const cx of [Face.LX, Face.RX]) heart(g, cx + c.dx, 104 + c.dy, Math.round(8 + 4 * beat), Sim.hex('#ff2a5a'));
  },
}));

Sim.register(FaceRig.animation({
  name: 'Valentine: cupid', theme: 'valentine', fps: 24, duration: 4000,
  colors: { bg: '#200814' },
  tracks: {
    lookX: [[0, -12], [1100, 10], [1300, 0]],
    lookY: [[0, -6], [1300, -8], [1700, 0]],
    eyeSize: [[0, 1], [1100, 1], [1250, 1.18], [1700, 1]],
    exclaim: [[0, 0], [1150, 0], [1250, 1], [1700, 1], [1900, 0]],
    mouthCurve: [[0, 0.6], [1150, 0], [1700, 0], [1900, 1]],
    mouthOpen: [[0, 0], [1150, 0], [1250, 0.6], [1700, 0.6], [1900, 0.4]],
    squint: [[0, 0], [1800, 0], [2000, 0.6], [3600, 0.6], [3900, 0]],
    blush: [[0, 0], [1700, 0], [2100, 1]],
    hearts: [[0, 0], [1800, 0], [2200, 1], [3600, 1], [3900, 0]],
  },
}, {
  over(g, c) {
    const fly = Face.kf(c.t, [[0.2, 0], [1.2, 1]]);
    const hit = c.t > 1.2;
    const hx = 120, hy = 22;
    if (c.t < 3.6) heart(g, hx, hy + (hit ? Math.round(2 * Math.sin(c.t * 20)) : 0), 10, Sim.hex('#ff2a5a'));
    // arrow flies in from the left and sticks through the heart
    const ax = hit ? hx + 16 : Math.round(-30 + (hx + 46) * fly), ay = hy + 6;
    if (c.t < 3.6) {
      g.fillRect(ax - 52, ay - 1, 48, 3, Sim.hex('#d9a066'));
      g.fillTriangle(ax - 4, ay - 6, ax - 4, ay + 7, ax + 8, ay, Sim.hex('#cfd8e3'));
      g.fillTriangle(ax - 52, ay, ax - 60, ay - 7, ax - 46, ay, Sim.hex('#ff8fb3'));
      g.fillTriangle(ax - 52, ay + 1, ax - 60, ay + 8, ax - 46, ay + 1, Sim.hex('#ff8fb3'));
    }
  },
}));

Sim.register(FaceRig.animation({
  name: 'Valentine: kiss', theme: 'valentine', fps: 24, duration: 3600,
  colors: { bg: '#200814' },
  tracks: {
    openL: [[0, 1], [700, 1], [850, 0], [1900, 0], [2050, 1]],                   // wink…
    mouthCurve: [[0, 0.6], [600, 0], [1700, 0], [2000, 0.9]],
    mouthOpen: [[0, 0], [600, 0.15], [1700, 0.15], [1900, 0]],                    // …pucker…
    mouthWidth: [[0, 26], [600, 10], [1700, 10], [2000, 26]],
    blush: [[0, 0.4], [900, 1]],
  },
}, {
  over(g, c) {
    // …and a heart floats off the lips
    const u = Face.kf(c.t, [[1.0, 0], [2.6, 1]]);
    if (c.t > 1.0 && c.t < 2.8) {
      const x = 128 + Math.round(70 * u), y = 160 - Math.round(110 * u) + Math.round(6 * Math.sin(u * 12));
      heart(g, x, y, 4 + Math.round(8 * u), Sim.lerp565(c.bg, Sim.hex('#ff2a5a'), 1 - 0.3 * u));
    }
    if (c.t > 0.95 && c.t < 1.25) for (const s of [-1, 1]) g.drawLine(120 + s * 14, 160 + c.dy, 120 + s * 22, 156 + c.dy, Sim.hex('#ff8fb3'));
  },
}));
