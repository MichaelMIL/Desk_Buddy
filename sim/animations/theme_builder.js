/* Builder theme (the hard-hat build): hammering a nail home, laying a brick wall, and
 * tightening a bolt with a wrench. Standard face, a little lower, under a yellow hard hat. */
const HAT = Sim.hex('#f7c600'), HAT_DARK = Sim.hex('#b88f00'), HAT_HI = Sim.hex('#ffe46b');
const WOOD = Sim.hex('#b9783f'), WOOD_DARK = Sim.hex('#7d4a20'), STEEL = Sim.hex('#aab3bd'), STEEL_DARK = Sim.hex('#5f6873');
const BRICK = Sim.hex('#c4502e'), BRICK_HI = Sim.hex('#de7552'), BRICK_DARK = Sim.hex('#8a321c'), MORTAR = Sim.hex('#5a4f45');
const SPARK = Sim.hex('#ffe066');
const COLORS = { bg: '#14161b', iris: '#3d7bff', mouth: '#ff6a3d', blush: '#ff9a7a' };
const BASE = { headY: [[0, 6]], eyeSize: [[0, 0.9]], brows: [[0, 0]] };   // room for the hat; it hides the brows
const kf = (t, pts) => Face.kf(t, pts);

/* Upper half of an ellipse, row by row (fillEllipse would cover the eyes). */
function dome(g, cx, cy, rx, ry, col) {
  for (let y = -ry; y <= 0; y++) {
    const w = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
    g.drawFastHLine(cx - w, cy + y, 2 * w + 1, col);
  }
}
function hardHat(g, dx, dy) {
  const cx = 120 + dx, cy = 70 + dy;
  dome(g, cx, cy, 58, 44, HAT);
  dome(g, cx - 10, cy - 8, 30, 28, HAT_HI);                         // shine on the left
  dome(g, cx - 10, cy - 8, 24, 22, HAT);
  g.fillRect(cx - 7, cy - 43, 14, 43, HAT_DARK);                    // the ridge
  g.fillRect(cx - 4, cy - 43, 8, 43, HAT);
  g.fillRoundRect(cx - 74, cy - 4, 148, 11, 5, HAT);                // brim
  g.drawFastHLine(cx - 70, cy + 6, 140, HAT_DARK);
}
/* A filled quadrilateral (two triangles), points as [x, y]. */
function quad(g, a, b, c, d, col) {
  const r = Math.round;
  g.fillTriangle(r(a[0]), r(a[1]), r(b[0]), r(b[1]), r(c[0]), r(c[1]), col);
  g.fillTriangle(r(a[0]), r(a[1]), r(c[0]), r(c[1]), r(d[0]), r(d[1]), col);
}
/* A bar from p to q, w px wide. */
function bar(g, p, q, w, col) {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, nx = -(q[1] - p[1]) / len * w / 2, ny = (q[0] - p[0]) / len * w / 2;
  quad(g, [p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny], col);
}
function sparks(g, x, y, k, col) {                                  // a burst of 6 short rays, k 0..1
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI * (0.1 + 0.8 * i / 5), r0 = 6 + 8 * k, r1 = r0 + 7;
    bar(g, [x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r1, y + Math.sin(a) * r1], 3, col);
  }
}
function rig(name, ms, tracks, hooks, adjust, fps = 20) {
  const s = FaceRig.normalize({ name, theme: 'builder', fps, duration: ms, colors: COLORS, tracks: Object.assign({}, BASE, tracks) });
  Sim.register({
    name: s.name, theme: s.theme, fps: s.fps, duration: s.duration,
    frame(g, f) {
      const v = FaceRig.valuesAt(s, f.t);
      if (adjust) adjust(v, f.t / 1000);
      FaceRig.draw(g, v, f.t, s, hooks, f);
    },
  });
}
const PROUD = (from, to) => ({                                      // squint, grin and blush between from and to (ms)
  squint: [[0, 0], [from, 0], [from + 200, 1, 'pop'], [to, 1], [to + 300, 0]],
  mouthCurve: [[0, 0], [from, 0], [from + 150, 1], [to, 1], [to + 300, 0]],
  mouthOpen: [[0, 0], [from, 0], [from + 200, 0.6, 'pop'], [to, 0.5], [to + 300, 0]],
  mouthWidth: [[0, 10], [from, 10], [from + 200, 26], [to, 26], [to + 300, 10]],
  blush: [[0, 0], [from + 100, 0], [from + 300, 0.7], [to, 0.7], [to + 300, 0]],
  sparkle: [[0, 0], [from + 100, 0], [from + 250, 1], [to, 1], [to + 200, 0]],
});

// 1. Hammer: three blows drive the nail home, then the plank slides on to the next nail.
const HITS = [0.7, 1.5, 2.3], NAIL = [18, 12, 6, 0], STEP = 70, L = 66;
const nailHeight = t => NAIL[HITS.filter(h => t >= h).length];
const shiftAt = t => STEP * kf(t, [[3.1, 0], [3.8, 1]]);
function raiseAt(t) {                                               // 0 = on the nail .. 1 = raised; rests at 0.25
  let from = 0.25;
  for (const h of HITS) {
    if (t < h - 0.15) return from + (1 - from) * kf(t, [[h - 0.7, 0], [h - 0.15, 1]]);   // lift
    if (t < h) return 1 - (t - (h - 0.15)) / 0.15;                                       // strike
    from = 0;
  }
  return kf(t, [[2.3, 0], [2.9, 0.25]]);
}
/* Height of the nail under the hammer: the struck one, then the next one sliding in. */
const underHammer = t => t < 3.1 ? nailHeight(t) : NAIL[0] * kf(t, [[3.1, 0], [3.8, 1]]);
rig('Builder: hammer', 4000, Object.assign({
  lookX: [[0, 9]], lookY: [[0, 12]], lid: [[0, 0.2], [2400, 0.2], [2500, 0], [3700, 0], [3950, 0.2]],
  open: [[0, 1], [680, 1], [720, 0.4], [820, 1], [1480, 1], [1520, 0.4], [1620, 1], [2280, 1], [2320, 0.4], [2420, 1]],
  shake: [[0, 0], [690, 0], [700, 0.5], [800, 0], [1490, 0], [1500, 0.5], [1600, 0], [2290, 0], [2300, 0.6], [2420, 0]],
}, PROUD(2500, 3300)), {
  over(g, c) {
    const t = c.t, shift = shiftAt(t), PY = 204;
    g.fillRect(0, PY, 240, 16, WOOD);                               // the plank and its grain
    g.drawFastHLine(0, PY, 240, Sim.lerp565(WOOD, Sim.C.WHITE, 0.25));
    for (let k = -1; k < 5; k++) {
      const x = Math.round(k * STEP + 12 - shift);
      g.fillRect(x, PY + 5, 22, 2, WOOD_DARK); g.fillRect(x + 34, PY + 10, 18, 2, WOOD_DARK);
    }
    for (let i = -2; i <= 1; i++) {                                 // nails: done ones flush, the next one sticking out
      const x = Math.round(150 + i * STEP - shift), h = i < 0 ? 0 : i === 0 ? nailHeight(t) : NAIL[0];
      if (h) g.fillRect(x - 1, PY - h, 3, h, STEEL);
      g.fillRect(x - 6, PY - h - 3, 13, 3, h ? STEEL : STEEL_DARK);
    }
    const top = PY - underHammer(t) - 3;                            // the hammer pivots at the hand, off to the right
    const a = raiseAt(t) * 0.9, px = 150 + L, py = top - 15;
    const u = [-Math.cos(a), -Math.sin(a)], n = [-u[1], u[0]], H = [px + u[0] * L, py + u[1] * L];
    bar(g, [px + 20, py + 8], H, 7, WOOD);
    quad(g, [H[0] + 15 * n[0] + 8 * u[0], H[1] + 15 * n[1] + 8 * u[1]], [H[0] + 15 * n[0] - 8 * u[0], H[1] + 15 * n[1] - 8 * u[1]],
            [H[0] - 15 * n[0] - 8 * u[0], H[1] - 15 * n[1] - 8 * u[1]], [H[0] - 15 * n[0] + 8 * u[0], H[1] - 15 * n[1] + 8 * u[1]], STEEL_DARK);
    bar(g, [H[0] - 15 * n[0] - 4 * u[0], H[1] - 15 * n[1] - 4 * u[1]], [H[0] - 15 * n[0] + 4 * u[0], H[1] - 15 * n[1] + 4 * u[1]], 4, STEEL);
    for (const h of HITS) if (t >= h && t < h + 0.2) sparks(g, 150, PY - nailHeight(t) - 3, (t - h) / 0.2, SPARK);
    hardHat(g, c.dx, c.dy);
  },
}, (v, t) => { if (t > 3.1) v.lookX = Math.round(9 - 10 * kf(t, [[3.1, 1], [3.5, 0], [3.8, 1]])); });

// 2. Bricks: eleven bricks fly in from alternate sides and build a wall, which sinks away at the end.
const ROWS = [{ y: 206, xs: [56, 88, 120, 152] }, { y: 192, xs: [72, 104, 136] }, { y: 178, xs: [64, 96, 128, 160] }];
const BRICKS = ROWS.flatMap((r, j) => r.xs.map(x => ({ x, y: r.y, row: j }))).map((b, i) => Object.assign(b, { t0: 0.3 + i * 0.3, side: i % 2 ? 1 : -1 }));
const sinkAt = t => Math.round(70 * kf(t, [[4.5, 0], [4.95, 1]]));
function flying(t) { return BRICKS.find(b => t >= b.t0 && t < b.t0 + 0.3); }
function brickPos(b, t) {                                           // an arc from the side, landing with a small bounce
  const u = Math.min(1, (t - b.t0) / 0.25), sx = b.side < 0 ? -30 : 270;
  const x = sx + (b.x - sx) * u, y = 176 + (b.y - 176) * u - 22 * Math.sin(Math.PI * u);     // low, under the eyes
  const land = t - b.t0 - 0.25, bounce = land > 0 && land < 0.08 ? -Math.round(3 * Math.sin(land / 0.08 * Math.PI)) : 0;
  return [Math.round(x), Math.round(y) + bounce];
}
function brick(g, x, y, col = BRICK) {
  g.fillRect(x, y, 30, 12, col);
  g.drawFastHLine(x, y, 30, col === BRICK ? BRICK_HI : col);
  g.drawFastHLine(x, y + 11, 30, BRICK_DARK);
}
rig('Builder: bricks', 5000, Object.assign({
  lid: [[0, 0.1]], mouthWidth: [[0, 10]], mouthCurve: [[0, 0.3]],
}, PROUD(3800, 4500)), {
  over(g, c) {
    const t = c.t, sink = sinkAt(t);
    const placed = BRICKS.filter(b => t >= b.t0 + 0.25);
    for (const r of [0, 1, 2]) {                                    // mortar behind every row that has a brick
      const row = placed.filter(b => b.row === r);
      if (row.length) g.fillRect(Math.min(...row.map(b => b.x)) - 2, ROWS[r].y - 2 + sink, Math.max(...row.map(b => b.x)) - Math.min(...row.map(b => b.x)) + 34, 16, MORTAR);
    }
    for (const b of placed) brick(g, b.x, b.y + sink);
    const fly = flying(t);
    if (fly && t < fly.t0 + 0.25) { const [x, y] = brickPos(fly, t); brick(g, x, y); }
    hardHat(g, c.dx, c.dy);
  },
}, (v, t) => {
  const fly = flying(t);
  if (fly && t < 3.7) {                                             // watch the brick in flight
    const [x, y] = brickPos(fly, Math.min(t, fly.t0 + 0.25));
    v.lookX = Math.round(Math.max(-16, Math.min(16, (x - 120) / 6)));
    v.lookY = Math.round(Math.max(-6, Math.min(14, (y - 120) / 5)));
  }
});

// 3. Fix it: three ratchet strokes tighten a bolt, then "FIXED IT!".
const NX = 96, NY = 200;
function nut(g, x, y, r, rot, fadeOut = 0, bg = 0) {
  const steel = Sim.lerp565(STEEL, bg, fadeOut), hole = Sim.lerp565(STEEL_DARK, bg, fadeOut);
  const pts = [];
  for (let k = 0; k < 6; k++) pts.push([x + r * Math.cos(rot + k * Math.PI / 3), y + r * Math.sin(rot + k * Math.PI / 3)]);
  for (let k = 0; k < 6; k++) g.fillTriangle(x, y, Math.round(pts[k][0]), Math.round(pts[k][1]), Math.round(pts[(k + 1) % 6][0]), Math.round(pts[(k + 1) % 6][1]), steel);
  g.fillCircle(x, y, Math.round(r * 0.45), hole);
}
function strokeAt(t) {                                              // wrench angle (deg from 12 o'clock) and nut turns done
  const S = [0.4, 1.1, 1.8];
  let w = 70, turns = 0;
  for (const s of S) {
    if (t >= s + 0.55) { turns++; continue; }
    if (t >= s) return { w: t < s + 0.4 ? 70 + 60 * kf(t, [[s, 0], [s + 0.4, 1]]) : 130 - 60 * kf(t, [[s + 0.4, 0], [s + 0.55, 1]]), turns: turns + Math.min(1, (t - s) / 0.4) };
    break;
  }
  if (t >= 2.6) w = 70 - 140 * kf(t, [[2.6, 0], [2.9, 1], [4.0, 1], [4.4, 0]]);
  return { w, turns };
}
rig('Builder: fix it', 4500, Object.assign({
  lookX: [[0, -6], [2600, -6], [2900, 0]], lookY: [[0, 12], [2600, 12], [2900, 0], [4100, 0], [4400, 12]],
  lid: [[0, 0.3], [2600, 0.3], [2700, 0], [4100, 0], [4400, 0.3]],
  mouthWidth: [[0, 12]], mouthCurve: [[0, -0.1]],
  shake: [[0, 0], [450, 0], [500, 0.3], [800, 0.3], [850, 0], [1150, 0], [1200, 0.3], [1500, 0.3], [1550, 0], [1850, 0], [1900, 0.3], [2200, 0.3], [2250, 0]],
}, PROUD(2800, 3900)), {
  over(g, c) {
    const t = c.t, { w, turns } = strokeAt(t), show = kf(t, [[2.75, 0], [2.95, 1], [3.9, 1], [4.15, 0]]);
    if (show < 1) {
      const gone = Math.min(1, show * 2.5);                         // tools fade out before the text is readable
      const a = (w - 90) * Math.PI / 180, dir = [Math.cos(a), Math.sin(a)], tool = Sim.lerp565(STEEL_DARK, c.bg, gone);
      nut(g, NX, NY, 16, turns * Math.PI / 3, gone, c.bg);
      if (w > -40) {                                                // the open-end wrench, jaws around the nut
        bar(g, [NX + dir[0] * 24, NY + dir[1] * 24], [NX + dir[0] * 88, NY + dir[1] * 88], 14, tool);
        g.drawArc(NX, NY, 26, 18, w + 50, w + 310, tool);
        g.fillCircle(Math.round(NX + dir[0] * 88), Math.round(NY + dir[1] * 88), 8, tool);
      }
    }
    if (show > 0.02) {
      const col = Sim.lerp565(c.bg, HAT, show), y = 200 - Math.round(4 * Math.abs(Math.sin(t * 7)) * show);
      g.text(120, y, 'FIXED IT!', col, { size: 22, weight: 'bold', font: 'Arial, Helvetica, sans-serif', align: 'center', baseline: 'middle' });
    }
    hardHat(g, c.dx, c.dy);
  },
});
