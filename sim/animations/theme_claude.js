/* Claude theme: warm coral and cream on a dark background, with a hand-drawn spark.
 * Thinking it over, writing something down, saying hello, and a big spark of an idea. */
const CORAL = Sim.hex('#d97757'), CREAM = Sim.hex('#f0eee6'), INK = Sim.hex('#1f1e1d'), STONE = Sim.hex('#8c8a83');
const COLORS = { bg: '#1f1e1d', iris: '#d97757', mouth: '#d97757', blush: '#e8a088', sclera: '#f0eee6' };

/* Radial spark: tapered rays of slightly uneven length around a small core.
 * o: { vary (ray length variation, 0.3), width (ray base, fraction of r, 0.12), core (fraction of r, 0.2),
 *      inner (rays start at this fraction of r: a sunburst ring instead of a star, 0) } */
function spark(g, x, y, r, rot, col, rays = 12, o = {}) {
  const vary = o.vary ?? 0.3, wf = o.width ?? 0.12, core = o.core ?? 0.2, inner = (o.inner ?? 0) * r;
  for (let k = 0; k < rays; k++) {
    const a = rot + k * Math.PI * 2 / rays;
    const len = inner + (r - inner) * (1 - vary + vary * (((k * 7) % 5) / 4));
    const w = Math.max(1.5, r * wf);
    const ca = Math.cos(a), sa = Math.sin(a), bx = x + ca * inner, by = y + sa * inner;
    g.fillTriangle(Math.round(bx - sa * w), Math.round(by + ca * w), Math.round(bx + sa * w), Math.round(by - ca * w),
                   Math.round(x + ca * len), Math.round(y + sa * len), col);
  }
  if (!inner) g.fillCircle(x, y, Math.max(2, Math.round(r * core)), col);
}

Sim.register(FaceRig.animation({
  name: 'Claude: thinking', theme: 'claude', fps: 20, duration: 4500,
  colors: COLORS,
  tracks: {
    lookX: [[0, 0], [500, -9], [3000, -9], [3300, 0]],
    lookY: [[0, 0], [500, -10], [3000, -10], [3300, 0]],
    mouthCurve: [[0, 0.3], [500, 0], [3000, 0], [3300, 1]],
    mouthWidth: [[0, 20], [500, 10], [3000, 10], [3300, 30]],
    mouthOpen: [[0, 0], [3000, 0], [3300, 0.5], [4100, 0.5], [4400, 0]],
    squint: [[0, 0], [3000, 0], [3300, 1, 'pop'], [4100, 1], [4400, 0]],
    blush: [[0, 0], [3100, 0], [3300, 0.8], [4200, 0.8], [4400, 0]],
  },
}, {
  over(g, c) {
    const idea = Face.kf(c.t, [[3.0, 0], [3.25, 1, 'pop'], [4.0, 1], [4.4, 0]]);
    const pulse = 0.5 + 0.5 * Math.sin(c.t * 5);
    spark(g, 120, 36 + c.dy, Math.round(13 + 3 * pulse + 12 * idea), c.t * (0.9 + 2 * idea), CORAL);
    if (c.t < 3.0) {                                          // "…" while thinking
      for (let k = 0; k < 3; k++) {
        const on = Math.floor(c.t * 3) % 4 > k;
        g.fillCircle(156 + k * 12, 50 + c.dy, 3, on ? CREAM : Sim.lerp565(INK, STONE, 0.5));
      }
    }
  },
}));

const WRITE = FaceRig.normalize({
  name: 'Claude: writing', theme: 'claude', fps: 20, duration: 5000, colors: COLORS,
  tracks: {
    headY: [[0, -12]], lookY: [[0, 11]],
    mouthCurve: [[0, 0.5]], mouthWidth: [[0, 16]],
    open: [[0, 1], [3400, 1, 'linear'], [3480, 0.05, 'linear'], [3560, 1]],
  },
});
Sim.register({
  name: WRITE.name, theme: WRITE.theme, fps: WRITE.fps, duration: WRITE.duration,
  frame(g, f) {
    const t = f.t / 1000;
    // four lines get written, left to right; the cursor is where the eyes look
    const lines = [64, 80, 72, 52], perLine = 1.1;
    const li = Math.min(lines.length - 1, Math.floor(t / perLine)), u = Math.min(1, (t - li * perLine) / (perLine * 0.85));
    const done = t >= lines.length * perLine;
    const curX = 82 + Math.round(lines[li] * (done ? 1 : u)), curY = 188 + li * 9;
    const v = FaceRig.valuesAt(WRITE, f.t);
    v.lookX = done ? 0 : Math.round((curX - 120) / 4);
    FaceRig.draw(g, v, f.t, WRITE, {
      over(g, c) {
        g.fillRoundRect(72, 178, 96, 48, 6, CREAM);                         // the page
        for (let k = 0; k <= li; k++) {
          const w = k < li || done ? lines[k] : Math.round(lines[k] * u);
          if (w > 0) g.fillRect(82, 186 + k * 9, w, 3, k === 0 ? CORAL : STONE);
        }
        if (!done && (Math.floor(t * 4) % 2 === 0)) g.fillRect(curX + 2, curY - 3, 2, 8, INK);
        spark(g, 178, 30, 10, t * 1.5, CORAL);                               // still thinking while writing
      },
    }, f);
  },
});

Sim.register(FaceRig.animation({
  name: 'Claude: hello', theme: 'claude', fps: 24, duration: 4000,
  colors: COLORS,
  tracks: {
    headX: [[0, 0], [600, -6], [1000, 4], [1400, -4], [1800, 0]],
    squint: [[0, 0], [500, 0], [700, 1, 'pop'], [3000, 1], [3400, 0]],
    mouthCurve: [[0, 0.7], [600, 1]],
    mouthOpen: [[0, 0], [500, 0], [700, 0.75, 'pop'], [3000, 0.6], [3400, 0]],
    mouthWidth: [[0, 24], [700, 32], [3400, 24]],
    blush: [[0, 0], [550, 0], [700, 0.9], [3200, 0.9], [3350, 0]],
  },
}, {
  over(g, c) {
    // speech bubble pops in with a "Hi!"
    const pop = Face.kf(c.t, [[0.4, 0], [0.75, 1, 'pop'], [3.3, 1], [3.6, 0]]);
    if (pop > 0.03) {
      const w = Math.round(58 * pop), h = Math.round(34 * pop), bx = 178, by = 40;
      g.fillRoundRect(bx - (w >> 1), by - (h >> 1), w, h, Math.max(2, Math.round(12 * pop)), CREAM);
      g.fillTriangle(bx - 14, by + (h >> 1) - 2, bx - 2, by + (h >> 1) - 2, bx - 20, by + (h >> 1) + Math.round(12 * pop), CREAM);
      if (pop > 0.85) g.text(bx, by + 1, 'Hi!', INK, { size: 19, weight: 'bold', font: 'Arial, Helvetica, sans-serif', align: 'center', baseline: 'middle' });
    }
    // a small spark twinkles on the other side
    const tw = 0.5 + 0.5 * Math.sin(c.t * 4);
    spark(g, 50, 58, Math.round(12 + 4 * tw), -c.t, CORAL, 12);
  },
}));

Sim.register(FaceRig.animation({
  name: 'Claude: spark', theme: 'claude', fps: 24, duration: 4000,
  colors: COLORS,
  tracks: {
    eyeSize: [[0, 1], [700, 1.16], [1100, 1.16], [1400, 1]],
    iris: [[0, 16], [700, 12], [1100, 12], [1400, 16]],
    mouthCurve: [[0, 0.5], [600, 0], [1100, 0], [1400, 1]],
    mouthOpen: [[0, 0], [600, 0.6], [1100, 0.6], [1400, 0.7], [3300, 0.6], [3700, 0]],
    mouthWidth: [[0, 22], [600, 18], [1400, 32], [3700, 24]],
    squint: [[0, 0], [1200, 0], [1400, 1, 'pop'], [3300, 1], [3700, 0]],
    blush: [[0, 0], [1300, 0], [1500, 0.9], [3400, 0.9], [3800, 0]],
    sparkle: [[0, 0], [1400, 0], [1600, 1], [3200, 1], [3600, 0]],
  },
}, {
  under(g, c) {
    // the spark blooms behind the face, turns, and settles back
    const grow = Face.kf(c.t, [[0.2, 0], [1.2, 1, 'pop'], [3.0, 1], [3.8, 0]]);
    // a sunburst ring around the face: rays start outside the eyes and mouth
    if (grow > 0.03) {
      const r = Math.round(92 + 30 * grow);
      spark(g, 120, 118, r, c.t * 0.9, Sim.lerp565(c.bg, CORAL, 0.3 + 0.7 * grow), 18, { vary: 0.4, width: 0.05, inner: 80 / r });
    }
  },
}));
