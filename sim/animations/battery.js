/* Battery and charging alerts, never part of the cycle. The firmware plays a random one
 * from a pool picked by board-name prefix (hardware/src/main.cpp, pool_of; hardware/README.md
 * "Battery and charging animations"), so a new one joins its pool by its name alone:
 *   battery_critical*   at 5% and below
 *   battery_*           low battery, every few minutes
 *   charging_plugged*   once when charging starts
 *   charging_full*      once when charged
 *   charging_*          every so often while it charges
 * Alerts play twice (once with loop: false), so keep them a few seconds long. */

const TAU = Math.PI * 2;
const RED = Sim.hex('#ff3b30'), DIM_RED = Sim.lerp565(Face.BG, RED, 0.3), YELLOW = Sim.hex('#ffd60a');
const EDGE = Sim.hex('#cfd6df'), TEARS = Sim.hex('#7fd4ff'), TONGUE = Sim.hex('#ff8fb1');
const CABLE = Sim.hex('#6b7480'), PLUG = Sim.hex('#eef1f4'), PLUG_EDGE = Sim.hex('#9aa3ad'), METAL = Sim.hex('#c0c8d0'), SLOT = Sim.hex('#4a525c');
const GREEN = Sim.hex('#30d158'), CYAN = Sim.hex('#64d2ff'), TRACK = Sim.hex('#1e242b'), STRAW = Sim.hex('#eef1f4');
const BIG = { weight: 'bold', align: 'center', baseline: 'middle', crisp: true };

/* Battery icon centred at (cx, cy): outline and nub in `edge`, and a fill of `level` (0..1) in `col`. */
function battery(g, cx, cy, level, col, edge = EDGE) {
  const w = 64, h = 30, L = cx - (w >> 1) - 3, T = cy - (h >> 1);
  g.fillRoundRect(L, T, w, h, 7, edge);
  g.fillRoundRect(L + 4, T + 4, w - 8, h - 8, 4, Face.BG);
  g.fillRoundRect(L + w + 1, cy - 6, 6, 12, 2, edge);
  const fw = Math.round((w - 14) * level);
  if (fw > 0) g.fillRoundRect(L + 7, T + 7, Math.max(4, fw), h - 14, 2, col);
}

/* Filled quadrilateral, corners in order. */
function quad(g, p, col) {
  g.fillTriangle(p[0][0], p[0][1], p[1][0], p[1][1], p[2][0], p[2][1], col);
  g.fillTriangle(p[0][0], p[0][1], p[2][0], p[2][1], p[3][0], p[3][1], col);
}

/* Lightning bolt `h` px tall centred at (cx, cy), with a 2 px outline. */
const BOLT = [[[0.14, -0.5], [-0.26, 0.08], [0.06, 0.08]], [[-0.06, -0.08], [0.26, -0.08], [-0.14, 0.5]]];
function bolt(g, cx, cy, h, col = YELLOW, edge = Sim.hex('#b35c00')) {
  const tri = (t, ox, oy, c) => {
    const P = t.map(([x, y]) => [Math.round(cx + x * h + ox), Math.round(cy + y * h + oy)]);
    g.fillTriangle(P[0][0], P[0][1], P[1][0], P[1][1], P[2][0], P[2][1], c);
  };
  for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) for (const t of BOLT) tri(t, ox, oy, edge);
  for (const t of BOLT) tri(t, 0, 0, col);
}

/* USB-C plug hanging from (px, py) on a cable `len` px long, swung `a` radians (0 = straight
 * down), `s` times its 32 x 56 px size, with a lightning bolt on the housing. */
function plug(g, px, py, len, a, s = 1) {
  const ux = Math.cos(a), uy = -Math.sin(a), vx = Math.sin(a), vy = Math.cos(a);   // across / down the plug
  const ox = px + vx * len, oy = py + vy * len;
  const P = (x, y) => [Math.round(ox + s * (x * ux + y * vx)), Math.round(oy + s * (x * uy + y * vy))];
  const box = (x0, y0, x1, y1, col) => quad(g, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], col);
  Hands.capsule(g, px, py, ox, oy, Math.round(3 * s), CABLE);
  box(-7, -2, 7, 12, CABLE);          // strain relief
  box(-16, 10, 16, 42, PLUG_EDGE);    // housing
  box(-13, 13, 13, 39, PLUG);
  box(-10, 42, 10, 56, METAL);        // the USB-C tip and its slot
  box(-6, 46, 6, 52, SLOT);
  const tri = (t, dx, dy, c) => {
    const Q = t.map(([x, y]) => P(18 * x, 26 + 18 * y));
    g.fillTriangle(Q[0][0] + dx, Q[0][1] + dy, Q[1][0] + dx, Q[1][1] + dy, Q[2][0] + dx, Q[2][1] + dy, c);
  };
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) for (const t of BOLT) tri(t, dx, dy, Sim.hex('#b35c00'));
  for (const t of BOLT) tri(t, 0, 0, YELLOW);
}

/* Second highlight low on the iris: pleading "puppy" eyes. Same options as Face.eye. */
function gloss(g, cx, cy, o) {
  const ir = o.iris ?? 16;
  g.fillCircle(cx + Math.round(o.lookX ?? 0) - (ir >> 1), cy + Math.round(o.lookY ?? 0) + (ir >> 1) - 1, (ir >> 3) + 1, Face.SCLERA);
}

/* Tear drop, round end at (x, y), point up. */
function tear(g, x, y, r) {
  g.fillCircle(x, y, r, TEARS);
  g.fillTriangle(x - r, y - 1, x + r, y - 1, x, y - 2 * r - 2, TEARS);
}

/* Four-pointed star. */
function star(g, x, y, r, col) {
  const q = Math.max(2, Math.round(r * 0.32));
  g.fillTriangle(x - q, y, x + q, y, x, y - r, col);
  g.fillTriangle(x - q, y, x + q, y, x, y + r, col);
  g.fillTriangle(x, y - q, x, y + q, x - r, y, col);
  g.fillTriangle(x, y - q, x, y + q, x + r, y, col);
}

Sim.register({
  name: 'Battery: low',
  fps: 12,
  duration: 3000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    // nodding off, jolted awake, drooping again
    const lid = F.kf(t, [[0, 0.45], [1.5, 0.8], [1.62, 0.84], [1.7, 0.05], [2.1, 0.05], [3.0, 0.45]]);
    const dy = Math.round(F.kf(t, [[0, 4], [1.6, 12], [1.7, -3], [2.1, 0], [3.0, 4]]));
    const awake = t > 1.65 && t < 2.2;

    const red = RED;
    const blink = Math.floor(t * 4) % 2 === 0;   // the last bit of charge flashes twice a second
    battery(g, 120, 40, 0.12, blink ? red : Sim.lerp565(F.BG, red, 0.35));

    F.eyes(g, { topLid: lid, iris: 14, lookY: awake ? 0 : 7, ry: 38 }, 0, dy);
    F.brow(g, F.LX - 2, F.EY + dy - 14, awake ? 10 : 0, -12);
    F.brow(g, F.RX + 2, F.EY + dy - 14, awake ? 10 : 0, 12);
    if (awake) F.oMouth(g, 120, F.MY + dy + 2, 7, 8);
    else F.smile(g, 120, F.MY + dy + 4, 22, -0.5, 5);

    // "z" drifting up while the eyes are nearly shut
    if (t > 0.7 && t < 1.65) {
      const u = (t - 0.7) / 0.95;
      const c = Sim.lerp565(F.BG, Sim.hex('#9fb4d0'), Math.min(1, 3 * (1 - u)));
      g.text(Math.round(208 + 6 * u + 3 * Math.sin(u * TAU)), Math.round(106 - 44 * u), 'z', c, { size: Math.round(14 + 8 * u), weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
    }
  },
});

/* A USB-C plug dangles on its cable; puppy eyes follow it, "plug me in!" pulses. */
Sim.register({
  name: 'Battery: plug me',
  fps: 15,
  duration: 3000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const a = 0.15 * Math.sin(f.p * TAU);                     // the plug's swing
    const blink = F.kf(t, [[1.9, 1], [1.97, 0.1], [2.1, 1]]);
    const eye = { iris: 19, lookX: Math.round(60 * Math.sin(a)), lookY: -12, open: blink };
    F.eyes(g, eye);
    if (blink > 0.95) { gloss(g, F.LX, F.EY, eye); gloss(g, F.RX, F.EY, eye); }
    F.brow(g, F.LX - 2, F.EY - 16, 6, -16);
    F.brow(g, F.RX + 2, F.EY - 16, 6, 16);
    F.smile(g, 120, F.MY + 4 + (f.i & 1), 18, -0.7, 6);       // trembling pout
    plug(g, 120, -50, 46, a, 1.45);
    const pulse = 0.5 + 0.5 * Math.sin(f.p * TAU * 3);
    g.text(120, 204, 'plug me in!', Sim.lerp565(Sim.C.WHITE, YELLOW, pulse), { ...BIG, size: 22 });
  },
});

/* Hands pressed together, big wet eyes: "please?" ... "pleeease!" */
Sim.register({
  name: 'Battery: please',
  fps: 15,
  duration: 3200,

  frame(g, f) {
    const F = Face, t = f.t / 1000, dy = -6;
    g.clear(F.BG);
    const up = F.kf(t, [[0, 0], [0.4, 1], [2.8, 1], [3.2, 0]]);   // hands come up, plead, go down
    const rub = up > 0.99 ? Math.round(3 * Math.sin((t - 0.4) * TAU * 3)) : 0;
    const blink = F.kf(t, [[1.15, 1], [1.22, 0.1], [1.35, 1]]);
    const eye = { iris: 19, lookY: -3, open: blink };
    F.eyes(g, eye, 0, dy);
    if (blink > 0.95) { gloss(g, F.LX, F.EY + dy, eye); gloss(g, F.RX, F.EY + dy, eye); }
    F.brow(g, F.LX - 2, F.EY + dy - 16, 6, -18);
    F.brow(g, F.RX + 2, F.EY + dy - 16, 6, 18);
    F.smile(g, 120, F.MY + dy + 2, 17, -0.6, 6);

    if (t > 1.8 && t < 2.9) {                                    // a tear rolls down the left cheek
      const u = (t - 1.8) / 1.1;
      tear(g, F.LX + 14, Math.round(F.EY + dy + 42 + 34 * u * u), Math.round(3 + 2 * Math.min(1, u * 3)));
    }
    const hy = Math.round(238 + 60 * (1 - up)) + rub;
    Hands.draw(g, Hands.FLAT, 104, hy, { scale: 0.72, angle: 12 });
    Hands.draw(g, Hands.FLAT, 136, hy, { scale: 0.72, angle: -12, flip: true });

    if (t > 0.5 && t < 1.6) Hands.bubble(g, 120, 30, 96, 28, 'please?', { tx: 120, ty: 58, size: 19 });
    else if (t > 1.7 && t < 2.8) Hands.bubble(g, 120, 30, 108, 28, 'pleeease!', { tx: 120, ty: 58, size: 19 });
  },
});

/* The eyes blink S-O-S in Morse code (shut = signal) and the letters appear as they go. */
const SOS = [[0, 120], [240, 360], [480, 600], [960, 1320], [1440, 1800], [1920, 2280], [2640, 2760], [2880, 3000], [3120, 3240]];
const SOS_LETTERS = [['S', 90, 0, 600], ['O', 120, 960, 2280], ['S', 150, 2640, 3240]];   // letter, x, from, to (ms)
Sim.register({
  name: 'Battery: sos',
  fps: 25,
  duration: 4000,

  frame(g, f) {
    const F = Face, ms = f.t - 200;
    g.clear(F.BG);
    const on = SOS.some(([a, b]) => ms >= a && ms < b);
    battery(g, 120, 40, 0.06, RED);
    F.eyes(g, on ? { topLid: 1 } : { lookY: 2 });
    F.brow(g, F.LX - 2, F.EY - 14, 4, -12);
    F.brow(g, F.RX + 2, F.EY - 14, 4, 12);
    F.oMouth(g, 120, F.MY + 4, 6, 7);
    const fade = F.kf(f.t / 1000, [[3.5, 1], [3.9, 0]]);
    for (const [ch, x, from, to] of SOS_LETTERS) {
      if (ms < from || fade <= 0) continue;
      const lit = on && ms < to ? 1 : 0.55;
      g.text(x, 200, ch, Sim.lerp565(F.BG, RED, lit * fade), { ...BIG, size: 28 });
    }
  },
});

/* A lightning bolt floats past: eyes lock on, mouth waters, chomp, miss. Tummy rumbles. */
Sim.register({
  name: 'Battery: hungry',
  fps: 15,
  duration: 3600,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const bx = Math.round(262 - (t - 0.25) / 2.35 * 284), by = Math.round(46 + 8 * Math.sin(t * 6));
    const w = F.kf(t, [[0.2, 0], [0.4, 1], [2.4, 1], [2.7, 0]]);   // how hard it stares at the bolt
    const track = Math.max(-14, Math.min(14, (bx - 120) / 5));
    const dy = -Math.round(8 * F.kf(t, [[1.3, 0], [1.36, 1], [1.6, 0]]));   // the chomp jump
    const keen = F.kf(t, [[0.4, 0], [0.6, 1], [1.6, 1], [1.9, 0]]);
    F.eyes(g, { lookX: Math.round(w * track), lookY: Math.round(8 - 18 * w), iris: 16 + Math.round(3 * keen) }, 0, dy);
    F.brow(g, F.LX - 2, F.EY + dy - 14, 2 + 8 * keen, -12 * (1 - keen));
    F.brow(g, F.RX + 2, F.EY + dy - 14, 2 + 8 * keen, 12 * (1 - keen));

    const my = F.MY + dy;
    if (t < 0.55 || t >= 2.5) F.smile(g, 120, my + 4, 18, -0.6, 5);
    else if (t < 1.32) {                                          // wide open, tongue out, drooling
      const h = Math.round(22 * F.kf(t, [[0.55, 0.3], [0.8, 1]]));
      F.grin(g, 120, my - 6, 24, h);
      if (h > 12) g.fillEllipse(120, my - 6 + h - 7, 12, 4, TONGUE);
      const d = Math.round(14 * F.kf(t, [[0.8, 0], [1.3, 1]]));
      if (d > 1) { g.fillRoundRect(136, my - 4, 3, d, 1, TEARS); g.fillCircle(137, my - 3 + d, 3, TEARS); }
    } else if (t < 1.6) F.flat(g, 120, my, 20, 5);               // chomp!
    else F.oMouth(g, 120, my + 2, 8, 9);                          // ...missed

    const rumble = F.kf(t, [[2.7, 0], [2.85, 1], [3.25, 1], [3.45, 0]]);
    if (rumble > 0) g.text(120 + (f.i & 1 ? 2 : -2), 204, 'grrr...', Sim.lerp565(F.BG, PLUG_EDGE, rumble), { ...BIG, size: 20 });
    if (t > 0.25 && t < 2.6) bolt(g, bx, by, 40);
  },
});

/* Spiral eye: the white with a spiral of iris colour turned by `phase`. */
function spiralEye(g, cx, cy, phase) {
  g.fillEllipse(cx, cy, 32, 40, Face.SCLERA);
  let px = cx, py = cy;
  for (let k = 1; k <= 28; k++) {
    const th = k * 0.36, r = th * 2.6;
    const x = cx + r * Math.cos(th + phase), y = cy + 1.15 * r * Math.sin(th + phase);
    Hands.capsule(g, px, py, x, y, 2, Face.IRIS);
    px = x; py = y;
  }
}

/* Dizzy (spiral eyes, stars), X eyes, drops out of sight; a dead battery blinks; back up, tired. */
Sim.register({
  name: 'Battery: faint',
  fps: 15,
  duration: 3600,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    let dx = 0, dy = 0;
    if (t >= 0.5 && t < 1.6) { const w = (t - 0.5) * 9; dx = Math.round(7 * Math.sin(w)); dy = Math.round(4 * Math.cos(w) - 4); }
    else if (t >= 1.85 && t < 2.25) { const u = (t - 1.85) / 0.4; dy = Math.round(200 * u * u); }
    else if (t >= 2.25 && t < 2.85) dy = 999;
    else if (t >= 2.85) dy = Math.round(200 * (1 - F.kf(t, [[2.85, 0], [3.35, 1]])) - (t > 3.35 ? 6 * Math.sin(Math.PI * (t - 3.35) / 0.25) : 0));

    if (dy > 240) {
      if (t >= 2.3 && t < 2.85) {                                 // dead battery, blinking
        const c = Math.floor((t - 2.3) * 6) % 2 === 0 ? RED : DIM_RED;
        battery(g, 120, 120, 0, c, c);
        g.fillRoundRect(117, 110, 6, 13, 2, c);
        g.fillRect(117, 126, 6, 5, c);
      }
    } else if (t >= 0.5 && t < 1.6) {                             // dizzy
      spiralEye(g, F.LX + dx, F.EY + dy, -t * 9);
      spiralEye(g, F.RX + dx, F.EY + dy, -t * 9 + 2);
      for (let k = 0; k < 5; k++) {                               // wobbly mouth
        const y = (k & 1 ? -4 : 4), y2 = (k & 1 ? 4 : -4);
        Hands.capsule(g, 102 + 9 * k + dx, F.MY + 4 + y + dy, 111 + 9 * k + dx, F.MY + 4 + y2 + dy, 2, F.MOUTH);
      }
      for (let k = 0; k < 3; k++) {
        const ang = t * 5 + k * TAU / 3;
        star(g, Math.round(120 + dx + 62 * Math.cos(ang)), Math.round(50 + dy + 10 * Math.sin(ang)), 9, YELLOW);
      }
    } else if (t >= 1.6 && t < 2.85) {                            // X eyes, falling
      for (const cx of [F.LX, F.RX]) {
        Hands.capsule(g, cx - 16, F.EY + dy - 16, cx + 16, F.EY + dy + 16, 4, F.SCLERA);
        Hands.capsule(g, cx - 16, F.EY + dy + 16, cx + 16, F.EY + dy - 16, 4, F.SCLERA);
      }
      F.oMouth(g, 120, F.MY + dy + 4, 7, 9);
    } else {                                                      // tired
      F.eyes(g, { topLid: 0.4, lookY: 6, iris: 14 }, 0, dy);
      F.flat(g, 120, F.MY + dy + 4, 16, 5);
    }
  },
});

/* Last gasp: drained face flickers, the picture collapses like an old TV switching off,
 * an empty battery blinks, then the face sputters back on. Played at 5% and below. */
Sim.register({
  name: 'Battery: critical',
  fps: 20,
  duration: 3200,

  frame(g, f) {
    const F = Face, ms = f.t, t = ms / 1000;
    g.clear(F.BG);
    const between = (a, b) => ms >= a && ms < b;
    const faceOn = (ms < 900 && !between(700, 750)) || between(2600, 2650) || between(2750, 2800) || ms >= 2900;
    if (faceOn) {
      const dx = between(450, 500) ? 10 : 0;                      // a glitch
      battery(g, 120, 38, 0.03, Math.floor(t * 4) % 2 === 0 ? RED : DIM_RED);
      F.eyes(g, { topLid: 0.55, lookY: 6, iris: 14 }, dx, 4);
      F.smile(g, 120 + dx, F.MY + 8, 16, -0.5, 5);
      if (dx) { g.fillRect(0, 104, 240, 8, F.BG); g.fillRect(0, 150, 240, 4, F.BG); }
    } else if (between(900, 1600)) {                              // switching off
      const h = Math.round(F.kf(t, [[0.9, 100], [1.12, 4]]));
      const w = Math.round(F.kf(t, [[1.12, 210], [1.34, 6]]));
      const c = Sim.lerp565(Sim.hex('#e6f8ff'), F.BG, F.kf(t, [[1.34, 0], [1.6, 1]]));
      g.fillRoundRect(120 - (w >> 1), 120 - (h >> 1), w, h, Math.max(1, Math.min(4, w >> 1, h >> 1)), c);
    } else if (between(1750, 2600)) {                             // empty battery, blinking
      const c = Math.floor((t - 1.75) * 4) % 2 === 0 ? RED : DIM_RED;
      battery(g, 120, 120, 0, c, c);
      g.fillRoundRect(117, 110, 6, 13, 2, c);
      g.fillRect(117, 126, 6, 5, c);
    }
  },
});

// ---- charging ---------------------------------------------------------------------

/* Tired, a plug comes up from below and clicks in: zap! ...ahh. Plays once. */
Sim.register({
  name: 'Charging: plugged in',
  fps: 15,
  duration: 3400,
  loop: false,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const len = F.kf(t, [[0.4, -40], [0.85, 37], [0.9, 41], [1.0, 37]]);   // up, click
    const zap = t >= 0.9 && t < 1.35, relief = F.kf(t, [[1.3, 0], [1.5, 1], [2.5, 1], [2.8, 0]]);
    const sh = zap ? (f.i & 1 ? 3 : -3) : 0;
    if (t < 0.9) {                                               // tired, watching it come
      F.eyes(g, { topLid: 0.5, iris: 14, lookY: 8 + Math.round(4 * F.kf(t, [[0.4, 0], [0.8, 1]])) });
      F.smile(g, 120, F.MY + 6, 16, -0.5, 5);
    } else if (zap) {
      F.eyes(g, { ry: 44, iris: 11 }, sh, -4);
      F.brow(g, F.LX - 2 + sh, F.EY - 22, 10, 0);
      F.brow(g, F.RX + 2 + sh, F.EY - 22, 10, 0);
      F.oMouth(g, 120 + sh, F.MY + 2, 12, 14);
    } else if (relief > 0.5) {                                   // ahh...
      F.eyes(g, { squint: 1 });
      F.smile(g, 120, F.MY, 28, 0.9, 6);
      F.blush(g, relief);
    } else {
      const eye = { iris: 18 };
      F.eyes(g, eye);
      gloss(g, F.LX, F.EY, eye); gloss(g, F.RX, F.EY, eye);
      F.smile(g, 120, F.MY, 26, 0.8, 6);
      F.blush(g, relief);
    }
    if (relief > 0) g.text(120, 44, 'ahh...', Sim.lerp565(F.BG, Sim.C.WHITE, relief), { ...BIG, size: 22 });
    plug(g, 120, 300, len, Math.PI, 1.2);                        // tip up, at y 196 once in
    if (t >= 0.85 && t < 1.2) {                                  // spark where it connects
      const u = (t - 0.85) / 0.35, c = Sim.lerp565(YELLOW, F.BG, u);
      star(g, 120, 192, Math.round(10 + 14 * (1 - u)), c);
      Hands.motion(g, 120, 192, 18 + 10 * u, 30 + 10 * u, [-70, -40, 40, 70], c, 4);
    }
  },
});

/* A ring round the edge of the screen fills red to green; the eyes follow its head.
 * Each 6° segment keeps its colour, so a frame only adds the new bit (small export). */
Sim.register({
  name: 'Charging: power up',
  fps: 15,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const fr = F.kf(t, [[0.2, 0], [3.2, 1], [3.6, 1], [3.95, 0]]), deg = Math.round(360 * fr);   // fill, then unwind
    const flash = t >= 3.2 && t < 3.34;
    g.drawArc(120, 120, 116, 106, 0, 360, TRACK);
    for (let d = 0; d < deg; d += 6) g.drawArc(120, 120, 116, 106, d, Math.min(deg, d + 6), flash ? Sim.C.WHITE : Sim.hsv(d / 3, 1, 1));
    const a = deg * Math.PI / 180, head = !flash && deg > 2 && deg < 360;
    if (head) g.fillCircle(Math.round(120 + 111 * Math.sin(a)), Math.round(120 - 111 * Math.cos(a)), 7, Sim.C.WHITE);

    if (t >= 3.2 && t < 3.6) {
      F.eyes(g, { squint: 1 });
      F.grin(g, 120, F.MY - 4, 28, 20);
      F.blush(g, 1);
    } else {
      F.eyes(g, { lookX: Math.round(12 * Math.sin(a)), lookY: Math.round(-12 * Math.cos(a)) });
      F.smile(g, 120, F.MY, Math.round(20 + 8 * fr), 0.3 + 0.6 * fr, 6);
    }
    bolt(g, 120, 200, 24 + Math.round(4 * Math.sin(t * TAU * 2)));
  },
});

/* Sipping power through a straw from a battery juice box: gulps, puffed cheeks. */
Sim.register({
  name: 'Charging: sip',
  fps: 15,
  duration: 3600,

  frame(g, f) {
    const F = Face, t = f.t / 1000, dy = -14;
    g.clear(F.BG);
    const ph = (t / 0.9) % 1;                                    // four gulps a loop
    const puff = F.kf(ph, [[0.45, 0], [0.6, 1], [0.85, 0]]);
    F.eyes(g, { squint: 0.75 + 0.25 * puff }, 0, dy);
    F.blush(g, 0.7 + 0.3 * puff, 0, dy);
    F.oMouth(g, 121, F.MY + dy, 8 + Math.round(2 * puff), 7);

    const bx = 146, by = 150, bw = 38, bh = 56, lvl = 34;       // the juice box
    g.fillRoundRect(bx + 13, by - 6, 12, 8, 2, EDGE);
    g.fillRoundRect(bx, by, bw, bh, 6, EDGE);
    g.fillRoundRect(bx + 3, by + 3, bw - 6, bh - 6, 4, F.BG);
    g.fillRoundRect(bx + 5, by + bh - 5 - lvl, bw - 10, lvl, 2, GREEN);
    for (let j = 0; j < 3; j++) {                                // bubbles
      const y = Math.round(by + bh - 9 - ((t * 24 + j * 9) % (lvl - 8)));
      g.fillCircle(bx + 11 + 8 * j, y, 2, Sim.hex('#a8f0bd'));
    }
    Hands.capsule(g, 165, 184, 165, 140, 3, STRAW);              // the straw
    Hands.capsule(g, 165, 140, 131, 146, 3, STRAW);
    if (ph < 0.6) {                                              // a gulp going up it
      const d = ph / 0.6 * 78;
      const [x, y] = d < 44 ? [165, 184 - d] : [165 - (d - 44), 140 + (d - 44) * 6 / 34];
      g.fillCircle(Math.round(x), Math.round(y), 2, GREEN);
    }
  },
});

/* Recharging: eyes closed, slow breaths, the battery's bars chase, bolts drift up. */
Sim.register({
  name: 'Charging: relax',
  fps: 12,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const dy = Math.round(3 * Math.sin(f.p * TAU));
    F.eyes(g, { topLid: 1 }, 0, dy + 4);
    F.smile(g, 120, F.MY + dy + 2, 22, 0.6, 5);
    F.blush(g, 0.5, 0, dy + 4);
    battery(g, 120, 40, 0, GREEN);
    const bars = Math.min(4, Math.floor((t % 1) * 5));           // one more bar every 0.2 s, then none
    for (let b = 0; b < bars; b++) g.fillRoundRect(92 + 13 * b, 32, 10, 16, 2, GREEN);
    for (let j = 0; j < 4; j++) {                                // bolts drifting up the sides
      const u = (f.p * 2 + j / 4) % 1, k = Math.sin(Math.PI * u);
      const x = (j & 1 ? 212 : 28) + Math.round(4 * Math.sin(u * TAU));
      bolt(g, x, Math.round(178 - 110 * u), 16, Sim.lerp565(F.BG, YELLOW, k), Sim.lerp565(F.BG, Sim.hex('#b35c00'), k));
    }
  },
});

/* An electric arc along the edge of the screen from angle a0, span degrees long. */
function crackle(g, a0, span, seed) {
  const pts = [];
  for (let d = 0; d <= span; d += 9) {
    const a = (a0 + d) * Math.PI / 180, r = 104 + 16 * (Hands.rnd(seed + d) - 0.5);
    pts.push([120 + r * Math.sin(a), 120 - r * Math.cos(a)]);
  }
  for (const [w, c] of [[2, CYAN], [1, Sim.C.WHITE]])
    for (let i = 1; i < pts.length; i++) Hands.capsule(g, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w, c);
}

/* Full of power: two bursts of crackling arcs, bolts in the eyes, a buzzing grin. */
Sim.register({
  name: 'Charging: zap',
  fps: 15,
  duration: 3000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const burst = (t >= 0.3 && t < 1.0) || (t >= 1.6 && t < 2.3);
    const amp = F.kf(t, [[0.2, 0], [0.35, 1], [0.95, 1], [1.2, 0], [1.5, 0], [1.65, 1], [2.25, 1], [2.5, 0]]);
    const dx = burst ? (f.i & 1 ? 2 : -2) : 0;
    F.eyes(g, { ry: 40 + Math.round(4 * amp), iris: 16 - Math.round(3 * amp) }, dx, 0);
    if (burst) { bolt(g, F.LX + dx, F.EY, 22); bolt(g, F.RX + dx, F.EY, 22); }
    F.brow(g, F.LX - 2 + dx, F.EY - 14, 2 + 10 * amp, 0);
    F.brow(g, F.RX + 2 + dx, F.EY - 14, 2 + 10 * amp, 0);
    if (amp > 0.5) F.grin(g, 120 + dx, F.MY - 4, 26, 18);
    else F.smile(g, 120, F.MY, 22, 0.7, 6);
    if (burst) {
      const seed = f.i >> 1;                                     // new arcs every other frame
      for (let k = 0; k < 3; k++) crackle(g, 360 * Hands.rnd(seed * 7 + k), 40 + 50 * Hands.rnd(seed * 7 + k + 3), seed * 31 + k * 5);
    }
  },
});

/* The last bar fills, a flash, hands up, sparkles, "100%". Plays once. */
const FULL_STARS = [[70, 30], [172, 26], [60, 62], [182, 64], [120, 10]];
Sim.register({
  name: 'Charging: full',
  fps: 15,
  duration: 3200,
  loop: false,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const yay = F.kf(t, [[0.75, 0], [0.95, 1]]), flash = t >= 0.75 && t < 0.95;
    battery(g, 120, 44, F.kf(t, [[0, 0.8], [0.7, 1]]), GREEN, flash ? Sim.C.WHITE : yay > 0.5 ? GREEN : EDGE);
    if (yay < 0.5) {
      F.eyes(g, { lookY: -10, iris: 17 });
      F.smile(g, 120, F.MY, 22, 0.5, 6);
    } else {
      F.eyes(g, { squint: 1 });
      F.grin(g, 120, F.MY - 6, 30, 22);
      F.blush(g, 1);
    }
    if (yay > 0) {
      const w = 14 * Math.sin((t - 0.75) * TAU * 2.5), hy = Math.round(250 - 60 * yay);
      Hands.draw(g, Hands.OPEN, 44, hy, { scale: 0.62, angle: -25 + w, flip: true });
      Hands.draw(g, Hands.OPEN, 196, hy, { scale: 0.62, angle: 25 - w });
      g.text(120, 206, '100%', Sim.lerp565(F.BG, GREEN, yay), { ...BIG, size: 26 });
      FULL_STARS.forEach(([x, y], k) => {
        const r = Math.round(8 * Math.sin(Math.PI * (((t - 0.75) * 1.6 + k / 5) % 1)));
        if (r >= 2) star(g, x, y, r, YELLOW);
      });
    }
  },
});
