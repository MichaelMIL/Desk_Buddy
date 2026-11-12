/* Scientist theme, famous scientists. Each wears their own hair, beard or moustache instead of
 * the lab goggles: Einstein writes E=mc² and sticks his tongue out, an apple falls on Newton,
 * Marie Curie's radium glows, Tesla's coil throws lightning, finches land in front of Darwin,
 * and Galileo finds Jupiter's moons. Standard face, a little lower (like theme_scientist.js). */
const BASE = { headY: [[0, 8]], eyeSize: [[0, 0.9]], brows: [[0, 0]] };
const WHITE = Sim.hex('#eef0f4'), WHITE_SHADE = Sim.hex('#b9bdc6'), CHALK = Sim.hex('#f4f1e4');
const kf = (t, pts) => Face.kf(t, pts);
const clamp01 = x => Math.max(0, Math.min(1, x));
const fade = (a, b, k) => Sim.lerp565(a, b, clamp01(k));
const rnd = k => { const s = Math.sin(k * 12.9898) * 43758.5453; return s - Math.floor(s); };
function popIn(t, t0, t1) {
  const u = clamp01((t - t0) / (t1 - t0)), c = 2.4;
  return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
}
function rig(name, ms, tracks, hooks, adjust, fps = 20) {
  const s = FaceRig.normalize({ name, theme: 'scientist', fps, duration: ms, tracks: Object.assign({}, BASE, tracks) });
  Sim.register({
    name: s.name, theme: s.theme, fps: s.fps, duration: s.duration,
    frame(g, f) {
      const v = FaceRig.valuesAt(s, f.t);
      if (adjust) adjust(v, f.t / 1000);
      FaceRig.draw(g, v, f.t, s, hooks, f);
    },
  });
}
/* Hair as puffs: [x, y, r] each, a darker copy offset down-right first for some depth. */
function puffs(g, pts, col, shade, dx = 0, dy = 0, grow = 1) {
  for (const [x, y, r] of pts) g.fillCircle(Math.round(x + dx + 2), Math.round(y + dy + 2), Math.max(1, Math.round(r * grow)), shade);
  for (const [x, y, r] of pts) g.fillCircle(Math.round(x + dx), Math.round(y + dy), Math.max(1, Math.round(r * grow)), col);
}
/* Moustache: a wide puff under the nose with drooping ends. */
function moustache(g, dx, dy, col, w = 24, h = 7, droop = 6) {
  g.fillEllipse(120 + dx, 153 + dy, w, h, col);
  for (const s of [-1, 1]) g.fillCircle(120 + dx + s * (w - 3), 156 + dy, droop, col);
}
const thick = (g, x0, y0, x1, y1, r, col) => Hands.capsule(g, x0, y0, x1, y1, r, col);

// ---- Einstein: E=mc² on a chalkboard, then the tongue ------------------------------------
const EIN_HAIR = [[80, 40, 14], [101, 28, 15], [122, 24, 15], [143, 28, 15], [163, 40, 14],
                  [50, 58, 16], [190, 58, 16], [32, 82, 15], [208, 82, 15], [26, 106, 11], [214, 106, 11],
                  [64, 30, 9], [178, 30, 9], [38, 62, 10], [202, 62, 10]];
const BOARD = { x: 80, y: 192, w: 80, h: 30 }, BOARD_COL = Sim.hex('#24493a'), FRAME_COL = Sim.hex('#8b5a2b');
rig('Scientist: einstein', 5000, {
  lookX: [[0, 0], [400, -8], [2200, 8], [2400, 0]],
  lookY: [[0, 0], [300, 14], [2300, 14], [2500, 0]],
  lid: [[0, 0], [300, 0.2], [2300, 0.2], [2450, 0]],
  brows: [[0, 1]], browRaise: [[0, 4], [2700, 4], [2850, 14], [4000, 14], [4300, 4]],
  eyeSize: [[0, 0.9], [2700, 0.9], [2850, 1.02, 'pop'], [4000, 1.02], [4300, 0.9]],
  mouthCurve: [[0, 0.4], [300, 0.2], [2400, 0.2], [2600, 0.6], [2750, 0], [4050, 0], [4300, 0.4]],
  mouthOpen: [[0, 0], [2750, 0], [2850, 0.55, 'pop'], [4000, 0.55], [4200, 0]],
  mouthWidth: [[0, 18], [2750, 18], [2850, 16], [4000, 16], [4300, 18]],
  blush: [[0, 0], [2850, 0], [3000, 0.5], [4000, 0.5], [4300, 0]],
}, {
  under(g, c) { puffs(g, EIN_HAIR, WHITE, WHITE_SHADE, c.dx, c.dy, 1 + 0.12 * kf(c.t, [[2.75, 0], [2.9, 1], [4.0, 1], [4.3, 0]])); },
  over(g, c) {
    const t = c.t, b = BOARD;
    g.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6, FRAME_COL);
    g.fillRect(b.x, b.y, b.w, b.h, BOARD_COL);
    if (t > 0.4) {
      g.text(120, b.y + b.h / 2 + 1, 'E=mc²', CHALK, { size: 21, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
      const reveal = Math.round(b.x + 8 + (b.w - 12) * clamp01((t - 0.4) / 1.8));     // chalk writes left to right
      if (reveal < b.x + b.w) g.fillRect(reveal, b.y, b.x + b.w - reveal, b.h, BOARD_COL);
      const wipe = kf(t, [[4.25, 0], [4.75, 1]]);                                  // the eraser at the end
      if (wipe > 0) g.fillRect(b.x, b.y, Math.round(b.w * wipe), b.h, BOARD_COL);
      if (t < 2.25) g.fillRect(Math.min(reveal, b.x + b.w - 3), b.y + 6, 3, 4, CHALK);   // the chalk tip
    }
    moustache(g, c.dx, c.dy, WHITE, 27, 8, 6);
    if (c.v.mouthOpen > 0.3) {                                                     // the tongue
      const k = clamp01((c.v.mouthOpen - 0.3) / 0.25), x = 120 + c.dx, y = 180 + c.dy + Math.round(5 * k);
      g.fillEllipse(x, y, 9, Math.max(2, Math.round(9 * k)), Sim.hex('#ff7a9c'));
      g.drawFastVLine(x, y - 5, Math.max(1, Math.round(9 * k)), Sim.hex('#d9466e'));
    }
  },
}, (v, t) => { if (t > 0.4 && t < 2.3) v.lookX = Math.round(-8 + 16 * clamp01((t - 0.4) / 1.8)); });

// ---- Newton: an apple falls on his head ---------------------------------------------------
const WIG = Sim.hex('#e4e0d8'), WIG_SHADE = Sim.hex('#aaa397'), APPLE = Sim.hex('#e0322f');
const NEWTON_WIG = [];
for (let a = -64; a <= 64; a += 16) NEWTON_WIG.push([120 + 90 * Math.sin(a * Math.PI / 180), 122 - 90 * Math.cos(a * Math.PI / 180), 11]);
for (const s of [-1, 1]) for (let y = 92; y <= 196; y += 17) {
  NEWTON_WIG.push([120 + s * 90, y, 10]);
  NEWTON_WIG.push([120 + s * 74, y + 9, 9]);
}
function curls(g, pts, dx, dy) {
  puffs(g, pts, WIG, WIG_SHADE, dx, dy);
  for (const [x, y, r] of pts) g.drawCircle(Math.round(x + dx), Math.round(y + dy), Math.max(2, r - 4), WIG_SHADE);
}
function apple(g, x, y) {
  x = Math.round(x); y = Math.round(y);
  g.fillCircle(x - 3, y, 8, APPLE); g.fillCircle(x + 3, y, 8, APPLE);
  g.fillCircle(x - 4, y - 3, 2, Sim.hex('#ff9a8a'));
  thick(g, x, y - 7, x + 1, y - 12, 1, Sim.hex('#6b4423'));
  g.fillEllipse(x + 5, y - 11, 4, 2, Sim.hex('#4caf50'));
}
function applePos(t) {
  if (t < 1.1) { const u = clamp01((t - 0.5) / 0.6); return [120, -20 + 46 * u * u]; }          // falls onto the wig
  if (t < 1.9) { const s = (t - 1.1) / 0.8; return [120 + 52 * s, 26 - 60 * s + 234 * s * s]; }   // bounces off
  if (t < 4.4) return [172, 200];
  return [172 + 70 * (t - 4.4) / 0.6, 200];                                                         // rolls away
}
rig('Scientist: newton', 5000, {
  lookY: [[0, 0], [400, -12], [1050, -12], [1200, 4], [1900, 14], [2200, 6], [3000, 0]],
  lookX: [[0, 0], [1200, 0], [1900, 10], [2400, 4], [3000, 0]],
  open: [[0, 1], [1080, 1], [1130, 0.15], [1450, 0.15], [1550, 1]],
  shake: [[0, 0], [1100, 0], [1150, 0.8], [1500, 0]],
  eyeSize: [[0, 0.9], [1900, 0.9], [2050, 1.05, 'pop'], [2900, 1.05], [3100, 0.9]],
  iris: [[0, 16], [1900, 16], [2050, 11], [2900, 11], [3100, 16]],
  mouthCurve: [[0, 0.4], [1050, 0.4], [1150, -0.4], [1600, -0.4], [1900, 0], [2900, 0], [3050, 1], [4300, 1], [4700, 0.4]],
  mouthOpen: [[0, 0], [1900, 0], [2050, 0.6, 'pop'], [2900, 0.5], [3050, 0.6], [4300, 0.5], [4600, 0]],
  mouthWidth: [[0, 18], [1900, 18], [2050, 28], [4300, 28], [4600, 18]],
  squint: [[0, 0], [3000, 0], [3200, 1, 'pop'], [4300, 1], [4600, 0]],
  sparkle: [[0, 0], [3100, 0], [3300, 1], [4200, 1], [4500, 0]],
}, {
  under(g, c) { curls(g, NEWTON_WIG, c.dx, c.dy); },
  over(g, c) {
    const t = c.t, [ax, ay] = applePos(t);
    if (ay > -12 && ax < 240) apple(g, ax, ay);
    if (t > 1.1 && t < 1.6) {                                                      // the bonk
      const k = 1 - (t - 1.1) / 0.5;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + t * 6; g.fillCircle(Math.round(120 + 22 * Math.cos(a)), Math.round(22 + 8 * Math.sin(a)), 3, fade(c.bg, Sim.hex('#ffe45c'), k)); }
    }
    const word = kf(t, [[1.95, 0], [2.15, 1], [3.6, 1], [3.9, 0]]);
    if (word > 0.02) g.text(120, 14, 'gravity!', fade(c.bg, Sim.hex('#9fd3ff'), word), { size: 17, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
  },
});

// ---- Marie Curie: radium glows, two element tiles, two Nobel medals ------------------------
const BROWN_HAIR = Sim.hex('#4a3426'), BROWN_HI = Sim.hex('#6b4c37'), RADIUM = Sim.hex('#7dff7a'), GLASS = Sim.hex('#cfe9ff');
const GOLD = Sim.hex('#f2c14e'), GOLD_DARK = Sim.hex('#b8862b');
function curieHair(g, dx, dy) {
  const cx = 120 + dx, cy = 128 + dy;
  g.drawArc(cx, cy, 98, 80, 300, 360, BROWN_HAIR); g.drawArc(cx, cy, 98, 80, 0, 60, BROWN_HAIR);
  g.drawArc(cx, cy, 98, 86, 240, 300, BROWN_HAIR); g.drawArc(cx, cy, 98, 86, 60, 120, BROWN_HAIR);
  g.drawArc(cx, cy, 94, 91, 315, 360, BROWN_HI); g.drawArc(cx, cy, 94, 91, 0, 45, BROWN_HI);   // a shine
  g.fillCircle(cx, 26 + dy, 15, BROWN_HAIR);                                                  // the bun
  g.drawArc(cx, 26 + dy, 11, 8, 200, 340, BROWN_HI);
}
function tile(g, x, y, sym, num, k, bg) {
  if (k < 0.05) return;
  const w = Math.round(30 * k), h = Math.round(32 * k);
  g.fillRoundRect(x + 15 - (w >> 1), y + 16 - (h >> 1), w, h, 4, fade(bg, Sim.hex('#2a3b4f'), k));
  if (k < 0.9) return;
  g.drawRoundRect(x, y, 30, 32, 4, RADIUM);
  g.text(x + 15, y + 19, sym, Sim.C.WHITE, { size: 15, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
  g.text(x + 4, y + 7, String(num), RADIUM, { size: 10, baseline: 'middle', crisp: true });
}
function medal(g, x, y, k) {
  if (k < 0.05) return;
  const r = Math.max(2, Math.round(11 * k));
  g.fillTriangle(x - 7, y - 22, x - 1, y - 22, x - 4, y - r + 2, Sim.hex('#3a6fd8'));
  g.fillTriangle(x + 1, y - 22, x + 7, y - 22, x + 4, y - r + 2, Sim.hex('#d83a3a'));
  g.fillCircle(x, y, r, GOLD); g.drawCircle(x, y, Math.max(1, r - 3), GOLD_DARK);
}
const TUBE = { x: 150, y: 168 };
rig('Scientist: curie', 5200, {
  lookX: [[0, 9], [3000, 9], [3200, 0]], lookY: [[0, 13], [1800, 13], [2000, 8], [3000, 8], [3200, 0]],
  mouthCurve: [[0, 0.5]], mouthWidth: [[0, 16], [3200, 16], [3400, 26], [4600, 26], [4900, 16]],
  mouthOpen: [[0, 0], [3200, 0], [3400, 0.5, 'pop'], [4500, 0.45], [4800, 0]],
  blush: [[0, 0.3], [3300, 0.3], [3500, 0.7], [4600, 0.7], [4900, 0.3]],
  squint: [[0, 0], [3300, 0], [3500, 1, 'pop'], [4500, 1], [4800, 0]],
  eyeSize: [[0, 0.9], [1900, 0.9], [2050, 1.0], [3100, 1.0], [3300, 0.9]],
}, {
  under(g, c) {
    curieHair(g, c.dx, c.dy);
    const pulse = 0.5 + 0.5 * Math.sin(c.t * 4);                                     // the glow behind the tube
    for (let r = 30; r >= 12; r -= 6) g.fillCircle(TUBE.x + 8, TUBE.y + 30, r, fade(c.bg, RADIUM, (0.08 + 0.1 * pulse) * (36 - r) / 24));
  },
  over(g, c) {
    const t = c.t, x = TUBE.x, y = TUBE.y, pulse = 0.5 + 0.5 * Math.sin(t * 4);
    g.fillRoundRect(x + 2, y + 18, 13, 26, 6, fade(Sim.hex('#2fbf3a'), RADIUM, pulse));   // liquid
    g.drawRoundRect(x, y, 17, 46, 7, GLASS); g.drawRoundRect(x + 1, y, 15, 46, 6, GLASS);
    g.fillRect(x - 3, y - 2, 23, 3, GLASS);
    for (let k = 0; k < 3; k++) {                                                    // sparkles rising from it
      const u = (t * 0.7 + k / 3) % 1;
      g.fillCircle(x + 8 + Math.round(5 * Math.sin(k * 2 + u * 7)), y - 2 - Math.round(9 * u), 1, fade(c.bg, RADIUM, 1 - u));
    }
    const out = 1 - kf(t, [[4.6, 0], [5.0, 1]]);
    tile(g, 62, 182, 'Po', 84, popIn(t, 1.9, 2.2) * out, c.bg);
    tile(g, 96, 194, 'Ra', 88, popIn(t, 2.3, 2.6) * out, c.bg);
    medal(g, 46, 48, popIn(t, 3.2, 3.45) * out);
    medal(g, 194, 48, popIn(t, 3.45, 3.7) * out);
  },
}, (v, t) => { if (t > 1.9 && t < 3.0) { v.lookX = t < 2.3 ? -7 : -2; v.lookY = 15; } });

// ---- Tesla: the coil throws lightning, his hair stands on end ------------------------------
const DARK_HAIR = Sim.hex('#1f2228'), DARK_HI = Sim.hex('#3a3f48'), BOLT = Sim.hex('#b9e6ff'), COPPER = Sim.hex('#c87533');
function bolt(g, x0, y0, x1, y1, seed) {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
  let px = x0, py = y0;
  for (let k = 1; k <= 6; k++) {
    const u = k / 6, j = k < 6 ? (rnd(seed * 13 + k) - 0.5) * 18 : 0;
    const x = x0 + (x1 - x0) * u + nx * j, y = y0 + (y1 - y0) * u + ny * j;
    thick(g, Math.round(px), Math.round(py), Math.round(x), Math.round(y), 1, BOLT);
    g.drawLine(Math.round(px), Math.round(py), Math.round(x), Math.round(y), Sim.C.WHITE);
    px = x; py = y;
  }
}
rig('Scientist: tesla', 5000, {
  eyeSize: [[0, 0.9], [1000, 0.9], [2600, 1.0], [2700, 1.08, 'pop'], [3400, 1.08], [3600, 0.9]],
  iris: [[0, 16], [2600, 16], [2700, 11], [3400, 11], [3600, 16]],
  lookY: [[0, 10], [2500, 10], [2700, 0]],
  mouthCurve: [[0, 0.3], [2600, 0.3], [2700, 1], [4500, 1], [4800, 0.3]],
  mouthWidth: [[0, 16], [2600, 16], [2700, 20], [4400, 20], [4800, 16]],
  mouthOpen: [[0, 0], [2600, 0], [2700, 0.45, 'pop'], [3400, 0.4], [3600, 0]],
  squint: [[0, 0], [3600, 0], [3800, 1, 'pop'], [4500, 1], [4800, 0]],
  shake: [[0, 0], [2600, 0], [2650, 0.4], [3300, 0.4], [3400, 0]],
}, {
  under(g, c) {
    const cx = 120 + c.dx, cy = 44 + c.dy, up = kf(c.t, [[1.0, 0], [2.6, 0.5], [2.75, 1], [3.4, 1], [4.2, 0]]);
    for (let k = 0; k < 9; k++) {                                                    // hair standing up
      const a = (-80 + k * 20) * Math.PI / 180, bx = cx + 58 * Math.sin(a), by = cy + 4 - 22 * Math.cos(a);
      const len = 6 + 22 * up, tx = bx + Math.sin(a) * len, ty = by - Math.cos(a) * len;
      g.fillTriangle(Math.round(bx - 7 * Math.cos(a)), Math.round(by - 7 * Math.sin(a)), Math.round(bx + 7 * Math.cos(a)), Math.round(by + 7 * Math.sin(a)), Math.round(tx), Math.round(ty), DARK_HAIR);
    }
    g.fillEllipse(cx, cy, 62, 28, DARK_HAIR);
    g.drawArc(cx, cy + 24, 50, 47, 300, 330, DARK_HI);
    if (up < 0.3) g.fillRect(cx - 1, cy - 28, 2, 16, c.bg);                          // the middle parting
  },
  over(g, c) {
    const t = c.t;
    thick(g, 120 + c.dx, 151 + c.dy, 102 + c.dx, 156 + c.dy, 2, DARK_HAIR);           // thin moustache
    thick(g, 120 + c.dx, 151 + c.dy, 138 + c.dx, 156 + c.dy, 2, DARK_HAIR);
    g.fillRect(106, 216, 28, 6, Sim.hex('#3a3f48'));                                  // the coil
    for (let y = 194; y < 216; y += 3) g.fillRect(112, y, 16, 2, COPPER);
    g.fillEllipse(120, 189, 15, 5, Sim.hex('#c9d1db'));
    g.drawEllipse(120, 189, 15, 5, Sim.hex('#8a939e'));
    const f = c.f.i, peak = t > 2.6 && t < 3.4, build = t > 1.0 && t < 2.6;
    const n = peak ? 5 : build ? 2 : (f % 3 === 0 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const left = (k + f) % 2 === 0, a = (left ? 195 + 25 * rnd(f * 3 + k) : -15 - 25 * rnd(f * 5 + k)) * Math.PI / 180;
      const L = (peak ? 60 : 40) + 20 * rnd(f * 7 + k);
      bolt(g, left ? 106 : 134, 189, 120 + L * Math.cos(a), 189 + L * Math.sin(a), f * 11 + k);
    }
  },
});

// ---- Darwin: three finches with three kinds of beak ---------------------------------------
const BIRD = Sim.hex('#8a6a45'), BIRD_DARK = Sim.hex('#5e4630'), BEAK = Sim.hex('#e8a33c'), BRANCH = Sim.hex('#6b4a2e');
const FINCHES = [{ x: 78, y: 30, t0: 0.5, beak: [7, 6] }, { x: 120, y: 27, t0: 1.4, beak: [4, 8] }, { x: 162, y: 24, t0: 2.3, beak: [2, 11] }];
function finch(g, x, y, beak, flap) {
  x = Math.round(x); y = Math.round(y);
  g.fillTriangle(x - 8, y, x - 15, y - 3, x - 14, y + 4, BIRD_DARK);                // tail
  g.fillEllipse(x, y, 9, 6, BIRD);
  g.fillCircle(x + 6, y - 5, 5, BIRD);
  g.fillEllipse(x - 1, y - (flap ? 6 : 1), 6, flap ? 5 : 3, BIRD_DARK);              // wing
  const [bw, bl] = beak;                                                               // beak: base, length
  g.fillTriangle(x + 10, y - 5 - (bw >> 1), x + 10, y - 5 + (bw >> 1) + 1, x + 10 + bl, y - 4, BEAK);
  g.fillCircle(x + 7, y - 6, 1, Sim.C.BLACK);
  g.drawFastVLine(x - 2, y + 5, 3, BEAK); g.drawFastVLine(x + 2, y + 5, 3, BEAK);
}
const DARWIN_SIDES = [[38, 74, 13], [32, 98, 12], [36, 120, 11], [202, 74, 13], [208, 98, 12], [204, 120, 11]];
rig('Scientist: darwin', 5400, {
  brows: [[0, 1]], browRaise: [[0, 2], [3300, 2], [3450, 10], [4400, 10], [4700, 2]],
  mouthCurve: [[0, 0.4], [3300, 0.4], [3450, 1], [4500, 1], [4800, 0.4]],
  mouthWidth: [[0, 16], [3300, 16], [3450, 19], [4500, 19], [4800, 16]],
  squint: [[0, 0], [3300, 0], [3500, 1, 'pop'], [4400, 1], [4700, 0]],
  sparkle: [[0, 0], [3400, 0], [3600, 1], [4300, 1], [4600, 0]],
}, {
  under(g, c) {
    puffs(g, DARWIN_SIDES, WHITE, WHITE_SHADE, c.dx, c.dy);
    const bx = 120 + c.dx, by = c.dy;                                                   // the beard
    g.fillEllipse(bx, 206 + by, 56, 46, WHITE_SHADE);
    g.fillEllipse(bx, 202 + by, 54, 44, WHITE);
    g.fillEllipse(bx - 40, 170 + by, 20, 22, WHITE); g.fillEllipse(bx + 40, 170 + by, 20, 22, WHITE);
    for (const s of [-1, 0, 1]) g.drawLine(bx + s * 16, 196 + by, bx + s * 20, 226 + by, WHITE_SHADE);
  },
  over(g, c) {
    const t = c.t;
    moustache(g, c.dx, c.dy, WHITE, 22, 6, 5);
    thick(g, 44, 40, 196, 34, 3, BRANCH);                                              // the branch
    for (const [x, y] of [[60, 34], [104, 32], [186, 28]]) g.fillEllipse(x, y, 5, 2, Sim.hex('#5f9a4a'));
    const leave = kf(t, [[4.7, 0], [5.3, 1]]);
    for (const b of FINCHES) {
      if (t < b.t0) continue;
      const land = popIn(t, b.t0, b.t0 + 0.35), y = b.y - 40 * (1 - land) - 90 * leave, x = b.x + 30 * leave;
      finch(g, x, y, b.beak, (land < 0.95 || leave > 0) && ((c.f.i >> 1) % 2 === 0));
    }
  },
}, (v, t) => {
  const b = [...FINCHES].reverse().find(q => t >= q.t0);
  if (b && t < 3.3) { v.lookX = Math.round((b.x - 120) / 4); v.lookY = -12; }
});

// ---- Galileo: a telescope, and Jupiter's four moons in the eyepiece ------------------------
const GAL_HAIR = Sim.hex('#8a6a4f'), GAL_SHADE = Sim.hex('#5e4734'), BRASS = Sim.hex('#c9a227'), TUBE_COL = Sim.hex('#7a4a26');
const GAL_SIDES = [[38, 80, 12], [34, 102, 11], [202, 80, 12], [206, 102, 11]];
const VIEW = { x: 66, y: 50, r: 30 };
const MOONS = [[12, 2.6, 0.3], [16, 1.7, 2.0], [21, 1.1, 4.1], [26, 0.7, 1.2]];      // distance, speed, phase
rig('Scientist: galileo', 5200, {
  openL: [[0, 1], [900, 1], [1050, 0.15], [3700, 0.15], [3850, 1]],
  eyeSize: [[0, 0.9], [3800, 0.9], [3950, 1.05, 'pop'], [4300, 1.0], [4600, 0.9]],
  mouthCurve: [[0, 0.3], [3800, 0.3], [3950, 0], [4250, 1], [4800, 1], [5050, 0.3]],
  mouthOpen: [[0, 0], [3850, 0], [3950, 0.55, 'pop'], [4250, 0.3], [4600, 0]],
  mouthWidth: [[0, 16], [4200, 16], [4350, 19], [4800, 19], [5050, 16]],
  squint: [[0, 0], [4250, 0], [4400, 1, 'pop'], [4800, 1], [5050, 0]],
  sparkle: [[0, 0], [3900, 0], [4100, 1], [4700, 1], [5000, 0]],
  lookX: [[0, 0], [900, -10], [3700, -10], [3850, 0]], lookY: [[0, 0], [900, -10], [3700, -10], [3850, 0]],
}, {
  under(g, c) {
    puffs(g, GAL_SIDES, GAL_HAIR, GAL_SHADE, c.dx, c.dy);
    const bx = 120 + c.dx, by = c.dy;                                                   // pointed beard
    g.fillEllipse(bx, 184 + by, 34, 16, GAL_HAIR);
    g.fillTriangle(bx - 30, 186 + by, bx + 30, 186 + by, bx, 234 + by, GAL_HAIR);
    g.drawLine(bx, 196 + by, bx, 226 + by, GAL_SHADE);
  },
  over(g, c) {
    const t = c.t;
    moustache(g, c.dx, c.dy, GAL_HAIR, 22, 6, 5);
    const up = kf(t, [[0.3, 0], [0.9, 1], [3.7, 1], [4.2, 0]]);                        // the telescope comes up to his eye
    if (up > 0.02) {
      const ex = 176 + 50 * (1 - up), ey = 126 + 70 * (1 - up), ox = ex + 46, oy = ey - 72;
      thick(g, Math.round(ex), Math.round(ey), Math.round(ox), Math.round(oy), 8, TUBE_COL);
      for (const u of [0.15, 0.55, 0.95]) {
        const x = ex + (ox - ex) * u, y = ey + (oy - ey) * u;
        thick(g, Math.round(x - 6), Math.round(y - 4), Math.round(x + 6), Math.round(y + 4), 2, BRASS);
      }
      g.fillCircle(Math.round(ex), Math.round(ey), 6, BRASS);
    }
    const view = popIn(t, 1.0, 1.3) * (1 - kf(t, [[3.6, 0], [3.9, 1]]));               // what he sees
    if (view > 0.05) {
      const r = Math.round(VIEW.r * view);
      g.fillCircle(VIEW.x, VIEW.y, r + 3, BRASS);
      g.fillCircle(VIEW.x, VIEW.y, r, Sim.hex('#05070d'));
      if (view > 0.9) {
        g.fillCircle(VIEW.x, VIEW.y, 8, Sim.hex('#e0a46a'));
        g.drawFastHLine(VIEW.x - 7, VIEW.y - 2, 15, Sim.hex('#b0703c')); g.drawFastHLine(VIEW.x - 7, VIEW.y + 3, 15, Sim.hex('#b0703c'));
        for (const [d, w, ph] of MOONS) g.fillCircle(Math.round(VIEW.x + d * Math.sin(ph + t * w)), VIEW.y, 2, Sim.hex('#f2f4f8'));
      }
    }
  },
});
