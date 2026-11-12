/* Claude theme, part four: making things that are not code.
 * 3D modeling (a wireframe of the buddy itself, extruded, rendered and turned) and designing
 * (a painter in a beret, dipping into a palette and painting a page layout onto a canvas).
 * Shared drawing comes from claude_kit.js. */
const { CORAL, CREAM, INK, STONE, COLORS, TERM, EDGE, GREEN, RED, YELLOW, BLUE, CODE_FACE,
        spark, mono, check } = ClaudeKit;

const kf = (t, pts) => Face.kf(t, pts);
const fade = (a, b, x) => Sim.lerp565(a, b, Math.max(0, Math.min(1, x)));
const R = Math.round;

function spec(name, ms, tracks, base = CODE_FACE, fps = 20) {
  return FaceRig.normalize({ name, theme: 'claude', fps, duration: ms, colors: COLORS, tracks: Object.assign({}, base, tracks) });
}
/* Register a rig face with drawing hooks; adjust(v, t, f) may tweak the face values per frame. */
function rig(s, hooks, adjust) {
  Sim.register({
    name: s.name, theme: s.theme, fps: s.fps, duration: s.duration,
    frame(g, f) {
      const v = FaceRig.valuesAt(s, f.t);
      if (adjust) adjust(v, f.t / 1000, f);
      FaceRig.draw(g, v, f.t, s, hooks, f);
    },
  });
}
const HAPPY_END = (from, to = from + 1200) => ({
  squint: [[0, 0], [from, 0], [from + 200, 1, 'pop'], [to, 1], [to + 300, 0]],
  mouthCurve: [[0, 0.2], [from, 0.2], [from + 150, 1], [to, 1], [to + 300, 0.2]],
  mouthOpen: [[0, 0], [from, 0], [from + 200, 0.55, 'pop'], [to, 0.5], [to + 300, 0]],
  mouthWidth: [[0, 12], [from, 12], [from + 200, 26], [to, 26], [to + 300, 12]],
  blush: [[0, 0], [from + 100, 0], [from + 250, 0.8], [to, 0.8], [to + 200, 0]],
});

// ---- 1. 3D modeling -------------------------------------------------------------------------
// The buddy's round body (a disc standing on its edge, screen to the front) in a viewport:
// the front face is extruded, the wireframe turns, then it renders solid and turns once more.
const VX = 58, VY = 152, VW = 124, VH = 68, MX = 120, MY = 192, MR = 22, TILT = 0.38, N = 16;

function project(x, y, z, th) {                                     // turn about y, tilt about x, orthographic
  const x1 = x * Math.cos(th) + z * Math.sin(th), z1 = -x * Math.sin(th) + z * Math.cos(th);
  const y2 = y * Math.cos(TILT) - z1 * Math.sin(TILT), z2 = y * Math.sin(TILT) + z1 * Math.cos(TILT);
  return [MX + x1, MY + y2, z2];
}
function ring(z, th, r = MR) {
  const pts = [];
  for (let j = 0; j < N; j++) { const a = j * 2 * Math.PI / N; pts.push(project(r * Math.cos(a), r * Math.sin(a), z, th)); }
  return pts;
}
function fan(g, pts, col) {                                         // a convex polygon from triangles
  for (let j = 1; j < pts.length - 1; j++) g.fillTriangle(R(pts[0][0]), R(pts[0][1]), R(pts[j][0]), R(pts[j][1]), R(pts[j + 1][0]), R(pts[j + 1][1]), col);
}
function wireframe(g, th, depth, k, selected) {                    // k: 1 = full colour .. 0 = gone
  if (k <= 0.02) return;
  const front = ring(depth / 2, th), back = ring(-depth / 2, th), edge = fade(TERM, CREAM, 0.75 * k), dot = fade(TERM, CORAL, k);
  const sel = fade(TERM, YELLOW, k);
  for (let j = 0; j < N; j++) {
    const a = front[j], b = front[(j + 1) % N], c = back[j], d = back[(j + 1) % N];
    g.drawLine(R(c[0]), R(c[1]), R(d[0]), R(d[1]), edge);
    if (j % 2 === 0) g.drawLine(R(a[0]), R(a[1]), R(c[0]), R(c[1]), edge);
    g.drawLine(R(a[0]), R(a[1]), R(b[0]), R(b[1]), selected ? sel : edge);
    if (selected) g.drawLine(R(a[0]), R(a[1] + 1), R(b[0]), R(b[1] + 1), sel);
  }
  for (const p of front.concat(back)) g.fillRect(R(p[0]) - 1, R(p[1]) - 1, 2, 2, dot);
}
function solid(g, th, depth, k) {                                   // painter's algorithm: side band, then the visible cap
  if (k <= 0.02) return;
  const front = ring(depth / 2, th), back = ring(-depth / 2, th);
  const body = fade(TERM, CORAL, k), shade = fade(TERM, Sim.lerp565(CORAL, Sim.C.BLACK, 0.6), k), screen = fade(TERM, INK, k), eye = fade(TERM, CREAM, k);
  for (let j = 0; j < N; j++) {
    const a = (j + 0.5) * 2 * Math.PI / N, nz = project(Math.cos(a), Math.sin(a), 0, th)[2] - project(0, 0, 0, th)[2];
    if (nz <= 0) continue;
    const p = front[j], q = front[(j + 1) % N], r = back[(j + 1) % N], s = back[j];
    const lit = fade(shade, body, 0.35 + 0.65 * nz);
    g.fillTriangle(R(p[0]), R(p[1]), R(q[0]), R(q[1]), R(r[0]), R(r[1]), lit);
    g.fillTriangle(R(p[0]), R(p[1]), R(r[0]), R(r[1]), R(s[0]), R(s[1]), lit);
  }
  const facing = project(0, 0, 1, th)[2] - project(0, 0, 0, th)[2] > 0;
  const z = (facing ? 1 : -1) * depth / 2;
  fan(g, facing ? front : back, body);
  if (!facing) return;
  fan(g, ring(z, th, MR * 0.72), screen);                           // the round screen, with the buddy's eyes
  for (const ex of [-0.3, 0.3]) { const e = project(MR * ex, -MR * 0.08, z, th); g.fillRect(R(e[0]) - 1, R(e[1]) - 2, 3, 4, eye); }
}
function gizmo(g, th) {                                             // x/y/z axes in the viewport corner
  const o = [72, 210], axes = [[[1, 0, 0], RED], [[0, -1, 0], GREEN], [[0, 0, 1], BLUE]];
  for (const [[x, y, z], col] of axes) {
    const p = project(x * 9, y * 9, z * 9, th), q = project(0, 0, 0, th);
    g.drawLine(o[0], o[1], R(o[0] + p[0] - q[0]), R(o[1] + p[1] - q[1]), col);
  }
}

const ANGLE = t => 2 * Math.PI * (t - 4.2) / 6;                     // one turn per loop, screen to the front while rendered
const DEPTH = t => 4 + 10 * kf(t, [[0.7, 0], [1.6, 1], [5.3, 1], [5.9, 0]]);
const RENDER = t => kf(t, [[2.5, 0], [3.0, 1], [5.2, 1], [5.6, 0]]);

rig(spec('Claude: 3D modeling', 6000, Object.assign({
  lookY: [[0, 12]], lid: [[0, 0.12]], brows: [[0, 1], [3200, 1], [3300, 0]], browRaise: [[0, 4]], browTilt: [[0, -4]],
}, HAPPY_END(3300, 4800))), {
  over(g, c) {
    const t = c.t, th = ANGLE(t), r = RENDER(t), depth = DEPTH(t);
    g.fillRoundRect(VX, VY, VW, VH, 7, TERM);
    g.drawRoundRect(VX, VY, VW, VH, 7, EDGE);
    mono(g, VX + 8, VY + 10, 'round_bot.scad', CREAM, 10);
    for (let k = 0; k < 4; k++) g.drawFastHLine(VX + 12 + k * 6, MY + 20 + k * 3, VW - 24 - k * 12, fade(TERM, EDGE, 1 - k * 0.2));   // floor
    g.fillEllipse(MX, MY + 22, 18, 3, fade(TERM, EDGE, 0.6));
    solid(g, th, depth, r);
    wireframe(g, th, depth, 1 - r, t > 0.6 && t < 1.8);
    if (t > 0.6 && t < 1.8) {                                       // the extrude handle, dragged out of the face
      const tip = project(0, 0, depth / 2 + 10, th), base = project(0, 0, depth / 2, th);
      g.drawLine(R(base[0]), R(base[1]), R(tip[0]), R(tip[1]), BLUE);
      g.fillCircle(R(tip[0]), R(tip[1]), 3, BLUE);
    }
    gizmo(g, th);
    if (t > 3.0 && t < 5.4) check(g, VX + VW - 12, VY + 10, 4, GREEN);
    else if (t > 2.4 && t < 3.0) spark(g, VX + VW - 12, VY + 10, 5, t * 6, CORAL, 8, { vary: 0.1 });
  },
}, (v, t) => { v.lookX = R(10 * Math.sin(ANGLE(t))); });

// ---- 2. Designing --------------------------------------------------------------------------
// A painter: beret on, palette to the left, a canvas on an easel. The brush dips into a colour,
// paints one part of a page layout (header, picture, text, button), and goes back for the next.
const CANVAS = Sim.hex('#f7f3ea'), WOOD = Sim.hex('#b9834f'), WOOD_DARK = Sim.hex('#7a5230'), BERET = Sim.hex('#a3432a');
const CX0 = 72, CY0 = 154, CW = 96, CH = 54;
const TEXT_GREY = Sim.hex('#6f6c66');
const ART = [
  { col: BLUE, blob: [30, 186],
    path: u => [78 + 84 * u, 162],
    draw: (g, u, col) => g.fillRect(78, 158, R(84 * u), 9, col) },
  { col: YELLOW, blob: [40, 181],
    path: u => [99 + 13 * Math.sin(2 * Math.PI * u), 186 - 13 * Math.cos(2 * Math.PI * u)],
    draw: (g, u, col) => { if (u > 0.01) g.drawArc(99, 186, 14, 0, 0, R(360 * u), col); } },
  { col: TEXT_GREY, blob: [51, 186],
    path: u => u < 0.55 ? [120 + 40 * u / 0.55, 178] : [120 + 30 * (u - 0.55) / 0.45, 186],
    draw: (g, u, col) => { g.fillRect(120, 176, R(40 * Math.min(1, u / 0.55)), 4, col); if (u > 0.55) g.fillRect(120, 184, R(30 * (u - 0.55) / 0.45), 4, col); } },
  { col: CORAL, blob: [34, 195],
    path: u => [120 + 38 * u, 198],
    draw: (g, u, col) => { if (u > 0.05) g.fillRoundRect(120, 194, Math.max(9, R(38 * u)), 9, 4, col); } },
];
const REST = [58, 206], STEP_S = 1.25, START = 0.25;
const lerp2 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
const ease = u => u * u * (3 - 2 * u);
/* Progress of each part (0..1) and where the brush is, with the colour on its bristles. */
function studio(t) {
  const prog = ART.map((a, i) => Math.max(0, Math.min(1, (t - (START + i * STEP_S + 0.65)) / 0.6)));
  let at = REST, col = null;
  for (let i = 0; i < ART.length; i++) {
    const s = START + i * STEP_S, from = i ? ART[i - 1].path(1) : REST, a = ART[i];
    if (t < s) break;
    if (t < s + 0.3) { at = lerp2(from, a.blob, ease((t - s) / 0.3)); col = i ? ART[i - 1].col : null; break; }
    if (t < s + 0.4) { at = [a.blob[0], a.blob[1] + R(2 * Math.sin((t - s - 0.3) * 30))]; col = a.col; break; }
    if (t < s + 0.65) { at = lerp2(a.blob, a.path(0), ease((t - s - 0.4) / 0.25)); col = a.col; break; }
    if (t < s + 1.25) { at = a.path(prog[i]); col = a.col; break; }
    at = a.path(1); col = a.col;
  }
  const end = START + ART.length * STEP_S;
  if (t >= end) { at = lerp2(ART[ART.length - 1].path(1), REST, ease(Math.min(1, (t - end) / 0.4))); col = t < end + 0.4 ? CORAL : null; }
  return { prog, at, col };
}
function brush(g, x, y, col) {                                     // held from below right, bristles up at the tip
  const hx = x + 22, hy = y + 30, len = Math.hypot(22, 30), nx = -30 / len * 2, ny = 22 / len * 2;
  g.fillTriangle(R(x + 6 + nx), R(y + 8 + ny), R(hx + nx), R(hy + ny), R(hx - nx), R(hy - ny), WOOD);
  g.fillTriangle(R(x + 6 + nx), R(y + 8 + ny), R(x + 6 - nx), R(y + 8 - ny), R(hx - nx), R(hy - ny), WOOD);
  g.fillCircle(R(hx), R(hy), 3, BERET);
  g.fillRect(R(x + 3), R(y + 4), 5, 5, Sim.hex('#c9ccd2'));        // ferrule
  g.fillTriangle(R(x - 1), R(y - 1), R(x + 4), R(y + 2), R(x + 1), R(y + 6), col || Sim.hex('#e9dcc6'));
  g.fillCircle(R(x + 2), R(y + 3), 3, col || Sim.hex('#e9dcc6'));
}
function beret(g, dx, dy) {
  const cx = 116 + dx, cy = 56 + dy;
  g.fillEllipse(cx, cy, 60, 13, Sim.lerp565(BERET, Sim.C.BLACK, 0.25));
  g.fillEllipse(cx - 6, cy - 5, 54, 14, BERET);
  g.fillEllipse(cx - 18, cy - 9, 22, 5, Sim.lerp565(BERET, CORAL, 0.6));   // sheen
  g.fillRoundRect(cx - 9, cy - 24, 5, 8, 2, BERET);                         // the little stalk
}
function palette(g) {
  g.fillEllipse(40, 189, 24, 16, WOOD);
  g.fillCircle(52, 198, 4, Sim.hex(COLORS.bg));                             // thumb hole
  for (const a of ART) g.fillCircle(a.blob[0], a.blob[1], 4, a.col);
}

rig(spec('Claude: designing', 7000, Object.assign({
  lid: [[0, 0.1]], brows: [[0, 0]],                                 // the beret sits where the brows would
}, HAPPY_END(5400, 6400), {
  mouthCurve: [[0, 0.45], [5400, 0.45], [5550, 1], [6400, 1], [6700, 0.45]], mouthWidth: [[0, 15], [5400, 15], [5600, 26], [6400, 26], [6700, 15]],
})), {
  over(g, c) {
    const t = c.t, { prog, at, col } = studio(t), clean = kf(t, [[6.4, 0], [6.85, 1]]);
    g.drawLine(100, CY0 + CH, 86, 238, WOOD_DARK); g.drawLine(101, CY0 + CH, 87, 238, WOOD_DARK);   // easel legs
    g.drawLine(140, CY0 + CH, 154, 238, WOOD_DARK); g.drawLine(139, CY0 + CH, 153, 238, WOOD_DARK);
    g.fillRect(CX0 - 4, CY0 - 3, CW + 8, CH + 6, WOOD_DARK);                                          // frame
    g.fillRect(CX0, CY0, CW, CH, CANVAS);
    g.fillRect(CX0 - 8, CY0 + CH + 2, CW + 16, 5, WOOD);                                               // ledge
    ART.forEach((a, i) => { if (prog[i] > 0) a.draw(g, prog[i], fade(a.col, CANVAS, clean)); });
    palette(g);
    brush(g, R(at[0]), R(at[1]), col);
    beret(g, c.dx, c.dy);
    if (t > 5.5 && t < 6.4) spark(g, 176, 150, 7, t * 5, CORAL, 8, { vary: 0.15 });
  },
}, (v, t) => {
  const { at } = studio(t);
  if (t < 5.4) { v.lookX = R(Math.max(-16, Math.min(16, (at[0] - 120) / 4))); v.lookY = R(Math.max(0, Math.min(15, (at[1] - 100) / 5))); }
});
