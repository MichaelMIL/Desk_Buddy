/* Devil theme (the horns build): a shifty, mischievous smirk with a wagging tail, and flames. */
function horns(g, dy, col) {
  for (const s of [-1, 1]) {
    const bx = 120 + s * 50;
    g.fillTriangle(bx - 15, 64 + dy, bx + 15, 64 + dy, bx + s * 16, 24 + dy, col);
    g.fillTriangle(bx - 5, 62 + dy, bx + 10 * s, 52 + dy, bx + s * 16, 24 + dy, Sim.lerp565(col, Sim.C.WHITE, 0.25));
  }
}

Sim.register(FaceRig.animation({
  name: 'Devil: mischief', theme: 'devil', fps: 24, duration: 4000,
  colors: { bg: '#1a0608', mouth: '#ff4f4f' },
  tracks: {
    lid: [[0, 0.3]],
    brows: [[0, 1]],
    browTilt: [[0, 12]],
    browRaise: [[0, 4]],
    lookX: [[0, 0], [500, 14, 'pop'], [1500, 14], [1800, -14, 'pop'], [2900, -14], [3300, 0]],
    mouthCurve: [[0, 0.9]],
    mouthWidth: [[0, 22], [1000, 30], [3000, 30], [3600, 22]],
    headX: [[0, 0], [500, 4], [1500, 4], [1800, -4], [2900, -4], [3300, 0]],
  },
}, {
  over(g, c) {
    horns(g, c.dy, Sim.hex('#b3121e'));
    // tail curling up on the lower right, wagging
    const wag = Math.sin(c.t * 4);
    let px = 150, py = 236;
    const red = Sim.hex('#b3121e');
    for (let i = 1; i <= 12; i++) {
      const u = i / 12, x = 150 + Math.round(52 * u + 12 * wag * u * u), y = 236 - Math.round(70 * u * u);
      g.drawLine(px, py, x, y, red); g.drawLine(px + 1, py, x + 1, y, red); g.drawLine(px, py + 1, x, y + 1, red);
      px = x; py = y;
    }
    g.fillTriangle(px - 8, py + 4, px + 8, py + 4, px + Math.round(4 * wag), py - 12, red);
  },
}));

Sim.register(FaceRig.animation({
  name: 'Devil: flames', theme: 'devil', fps: 24, duration: 3000,
  colors: { bg: '#1a0608', mouth: '#ff4f4f' },
  tracks: {
    brows: [[0, 1]],
    browTilt: [[0, 16]],
    browRaise: [[0, 0]],
    lid: [[0, 0.25]],
    mouthCurve: [[0, 1]],
    mouthOpen: [[0, 0.3], [1000, 0.8, 'pop'], [2200, 0.8], [2700, 0.3]],
    mouthWidth: [[0, 30], [1000, 38], [2200, 38], [2700, 30]],
    shake: [[0, 0], [1000, 0], [1100, 0.5], [2100, 0.5], [2200, 0]],
  },
}, {
  under(g, c) {
    // the background glows with the flames
    const glow = 0.5 + 0.5 * Math.sin(c.t * 9);
    g.fillCircle(120, 300, 150, Sim.lerp565(c.bg, Sim.hex('#5a1408'), 0.6 + 0.4 * glow));
  },
  over(g, c) {
    horns(g, c.dy, Sim.hex('#b3121e'));
    const cols = [Sim.hex('#ff2a1a'), Sim.hex('#ff8a1a'), Sim.hex('#ffd23d')];
    for (let layer = 0; layer < 3; layer++) {
      for (let k = 0; k < 9; k++) {
        const x = 40 + k * 20 + (layer % 2) * 10, h = 22 + layer * -5 + Math.round(16 * Math.abs(Math.sin(c.t * (5 + k * 0.7) + k * 2 + layer)));
        g.fillTriangle(x - 12 + layer * 3, 236, x + 12 - layer * 3, 236, x, 236 - h - (2 - layer) * 10, cols[layer]);
      }
    }
  },
}));
