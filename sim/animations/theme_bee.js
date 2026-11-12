/* Bee theme (the antennae build): little bees buzzing around, and a flower blooming. */
function antennae(g, dy, t) {
  const stalk = Sim.hex('#8a8f9a'), tip = Sim.hex('#ffd23d'), band = Sim.hex('#2a2a32');
  g.drawArc(120, 112 + dy, 110, 101, 240, 360, band);
  g.drawArc(120, 112 + dy, 110, 101, 0, 120, band);
  for (const s of [-1, 1]) {
    const bob = Math.round(4 * Math.sin(t * 5 + s));
    let px = 120 + s * 16, py = 50 + dy;
    for (let i = 1; i <= 6; i++) {
      const x = 120 + s * (16 + i * 5), y = 50 + dy - Math.round(i * 4.5) + Math.round(bob * i / 6);
      g.drawLine(px, py, x, y, stalk); g.drawLine(px + 1, py, x + 1, y, stalk);
      px = x; py = y;
    }
    g.fillCircle(px, py, 6, tip);
    g.drawFastHLine(px - 5, py, 11, Sim.hex('#1a1a22'));
  }
}
function bee(g, x, y, t, dir) {
  const wing = Math.abs(Math.sin(t * 40));
  g.fillEllipse(x - 3, y - 7 - Math.round(2 * wing), 5, Math.max(2, Math.round(4 + 2 * wing)), Sim.hex('#e8f4ff'));
  g.fillEllipse(x + 3, y - 7 - Math.round(2 * wing), 5, Math.max(2, Math.round(4 + 2 * wing)), Sim.hex('#e8f4ff'));
  g.fillEllipse(x, y, 9, 6, Sim.hex('#ffd23d'));
  g.fillRect(x - 3, y - 6, 3, 12, Sim.hex('#1a1a22'));
  g.fillRect(x + 3, y - 6, 2, 12, Sim.hex('#1a1a22'));
  g.fillTriangle(x - dir * 9, y - 2, x - dir * 9, y + 2, x - dir * 13, y, Sim.hex('#1a1a22'));
  g.fillCircle(x + dir * 6, y - 1, 1, Sim.hex('#1a1a22'));
}

const BUZZ = FaceRig.normalize({
  name: 'Bee: buzz', theme: 'bee', fps: 24, duration: 4000,
  tracks: { mouthCurve: [[0, 0.8]], blush: [[0, 0.6]], open: [[0, 1], [2600, 1, 'linear'], [2680, 0, 'linear'], [2760, 1]] },
});
Sim.register({
  name: BUZZ.name, theme: BUZZ.theme, fps: BUZZ.fps, duration: BUZZ.duration,
  frame(g, f) {
    const t = f.t / 1000, a = f.p * Math.PI * 4;
    const bx = 120 + Math.round(96 * Math.cos(a)), by = 128 + Math.round(70 * Math.sin(a));
    const b2x = 120 + Math.round(80 * Math.cos(-a * 0.5 + 2)), b2y = 120 + Math.round(90 * Math.sin(-a * 0.5 + 2));
    const v = FaceRig.valuesAt(BUZZ, f.t);
    v.lookX = Math.max(-16, Math.min(16, Math.round((bx - 120) / 6)));      // the eyes follow the first bee
    v.lookY = Math.max(-12, Math.min(12, Math.round((by - 112) / 7)));
    FaceRig.draw(g, v, f.t, BUZZ, {
      over(g, c) {
        antennae(g, c.dy, t);
        bee(g, bx, by, t, -Math.sign(Math.sin(a)) || 1);
        bee(g, b2x, b2y, t + 0.3, Math.sign(Math.sin(-a * 0.5 + 2)) || 1);
      },
    }, f);
  },
});

Sim.register(FaceRig.animation({
  name: 'Bee: flower', theme: 'bee', fps: 20, duration: 4500,
  tracks: {
    lookX: [[0, 0], [600, 12]],
    lookY: [[0, 0], [600, 10]],
    squint: [[0, 0], [2000, 0], [2300, 1], [3900, 1], [4300, 0]],
    mouthCurve: [[0, 0.6], [2000, 0.6], [2200, 1]],
    mouthOpen: [[0, 0], [2000, 0], [2300, 0.5], [3900, 0.5], [4300, 0]],
    blush: [[0, 0], [2000, 0], [2400, 1], [4000, 1], [4400, 0]],
    hearts: [[0, 0], [2200, 0], [2600, 0.8], [3800, 0.8], [4300, 0]],
  },
}, {
  over(g, c) {
    antennae(g, c.dy, c.t);
    // flower at the bottom right grows and opens
    const grow = Face.kf(c.t, [[0.2, 0], [1.6, 1]]), bloom = Face.kf(c.t, [[1.2, 0], [2.1, 1]]);
    const fx = 176, base = 222, top = base - Math.round(46 * grow);
    g.fillRect(fx - 2, top, 4, base - top, Sim.hex('#3e9a3a'));
    if (grow > 0.5) g.fillEllipse(fx + 9, base - 18, 8, 4, Sim.hex('#3e9a3a'));
    const r = Math.round(3 + 9 * bloom);
    if (bloom > 0.02) {
      for (let k = 0; k < 6; k++) {
        const ang = k * Math.PI / 3 + c.t * 0.5;
        g.fillCircle(fx + Math.round(r * Math.cos(ang)), top + Math.round(r * Math.sin(ang)), Math.round(4 + 4 * bloom), Sim.hex('#ff7ab3'));
      }
    }
    g.fillCircle(fx, top, Math.round(3 + 4 * bloom), Sim.hex('#ffd23d'));
    if (bloom > 0.9) bee(g, fx - 28 + Math.round(6 * Math.sin(c.t * 3)), top - 22 + Math.round(4 * Math.cos(c.t * 4)), c.t, 1);
  },
}));

function hexagon(g, x, y, r, fill, line) {
  const pts = [];
  for (let k = 0; k < 6; k++) pts.push([x + Math.round(r * Math.cos(k * Math.PI / 3)), y + Math.round(r * Math.sin(k * Math.PI / 3))]);
  if (fill != null) for (let k = 0; k < 6; k++) g.fillTriangle(x, y, pts[k][0], pts[k][1], pts[(k + 1) % 6][0], pts[(k + 1) % 6][1], fill);
  for (let k = 0; k < 6; k++) g.drawLine(pts[k][0], pts[k][1], pts[(k + 1) % 6][0], pts[(k + 1) % 6][1], line);
}

Sim.register(FaceRig.animation({
  name: 'Bee: dance', theme: 'bee', fps: 24, duration: 4000,
  tracks: {
    headX: [[0, 0], [500, -10], [1000, 10], [1500, -10], [2000, 10], [2500, -10], [3000, 10], [3500, -10], [4000, 0]],
    headY: [[0, 0], [250, -5], [500, 0], [750, -5], [1000, 0], [1250, -5], [1500, 0], [1750, -5], [2000, 0], [2250, -5], [2500, 0], [2750, -5], [3000, 0], [3250, -5], [3500, 0], [3750, -5], [4000, 0]],
    squint: [[0, 0], [400, 1], [3600, 1], [4000, 0]],
    mouthCurve: [[0, 0.8], [400, 1]],
    mouthOpen: [[0, 0], [400, 0.55], [3600, 0.55], [4000, 0]],
    blush: [[0, 0.7]],
  },
}, {
  under(g, c) {
    // honeycomb along the bottom fills up cell by cell
    const cells = [[60, 200], [78, 210], [96, 200], [114, 210], [132, 200], [150, 210], [168, 200], [186, 210], [69, 220], [105, 220], [141, 220], [177, 220]];
    const filled = Math.floor((c.t / 4) * (cells.length + 2));
    cells.forEach(([x, y], k) => hexagon(g, x, y, 10, k < filled ? Sim.hex('#ffb000') : Sim.hex('#3a2a08'), Sim.hex('#b8860b')));
  },
  over(g, c) { antennae(g, c.dy, c.t); },
}));
