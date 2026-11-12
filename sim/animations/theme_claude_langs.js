/* Claude theme, part three: programming languages.
 * Python's indentation, a C++ template error wall, Go's goroutines and channels, Rust's borrow
 * checker, JavaScript's surprises, TypeScript's red squiggles, Java's long names (and coffee), a C
 * pointer that walks off the array, SQL's scariest statement, a bash pipeline, and a polyglot
 * finale. Shared drawing comes from claude_kit.js. */
const { CORAL, CREAM, INK, STONE, COLORS, TERM, EDGE, GREEN, RED, YELLOW, BLUE, MONO, CODE_FACE,
        terminal, check, label, codeBars, cliSpinner, miniBuddy } = ClaudeKit;

const TX = 62, TY = 152, TW = 116, TH = 68;                       // the terminal box under the face
const R1 = 172, R2 = 184, R3 = 196, R4 = 208;                      // its text rows
const fade = (a, b, x) => Sim.lerp565(a, b, Math.max(0, Math.min(1, x)));
const kf = (t, pts) => Face.kf(t, pts);
const between = (t, a, b) => t >= a && t < b;
const clamp01 = x => Math.max(0, Math.min(1, x));

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
/* A happy finish (squint, open smile, blush) from `from` to `to` ms appended to the earlier keys
 * in `pre`; the mouth eases back to its first value so the loop closes. */
function happyEnd(from, to, pre = {}) {
  const out = Object.assign({}, pre);
  const add = (k, d, keys) => {
    const own = pre[k] || [[0, d]];
    out[k] = own.concat([[from, own[own.length - 1][1]]], keys);
  };
  const c0 = pre.mouthCurve ? pre.mouthCurve[0][1] : 0.2, w0 = pre.mouthWidth ? pre.mouthWidth[0][1] : 12;
  add('squint', 0, [[from + 200, 1, 'pop'], [to, 1], [to + 300, 0]]);
  add('mouthCurve', 0.2, [[from + 150, 1], [to, 1], [to + 300, c0]]);
  add('mouthOpen', 0, [[from + 200, 0.55, 'pop'], [to, 0.5], [to + 300, 0]]);
  add('mouthWidth', 12, [[from + 200, 26], [to, 26], [to + 300, w0]]);
  add('blush', 0, [[from + 100, 0], [from + 250, 0.8], [to, 0.8], [to + 200, 0]]);
  return out;
}

const ADV = 0.602;                                                 // Menlo's advance width, in em
/* Monospaced coloured runs: parts = [[text, colour|null], ...]; n = characters shown (typing). Returns the end x. */
function code(g, x, y, parts, n = Infinity, size = 10) {
  let cx = x;
  for (const [s, col] of parts) {
    if (n <= 0) break;
    const part = s.slice(0, Math.max(0, n)); n -= s.length;
    if (col && part.trim()) g.text(Math.round(cx), y, part, col, { size, font: MONO, baseline: 'middle' });
    cx += part.length * ADV * size;
  }
  return Math.round(cx);
}
const len = parts => parts.reduce((a, [s]) => a + s.length, 0);
const typed = (t, t0, cps) => Math.max(0, Math.floor((t - t0) * cps));
function caret(g, x, y, t) { if (Math.floor(t * 3) % 2 === 0) g.fillRect(x + 1, y - 5, 5, 10, CORAL); }
function fileName(g, s) { g.text(TX + 34, TY + 7, s, STONE, { size: 10, font: MONO, baseline: 'middle' }); }
/* Look at the typing caret: lines = [[startSec, chars], ...] typed at cps from x0. */
function caretLook(t, lines, cps, x0 = 70) {
  let x = x0;
  for (const [t0, n] of lines) if (t >= t0) x = x0 + Math.min(n, (t - t0) * cps) * 6;
  return Math.round((x - 120) / 4);
}
/* The language's name in a pill above the face. */
function badge(g, s, bg, fg, x = 120, y = 30, size = 12) {
  const w = Math.round(s.length * ADV * size) + 14, h = size + 8;
  g.fillRoundRect(x - (w >> 1), y - (h >> 1), w, h, h >> 1, bg);
  g.text(x, y, s, fg, { size, font: MONO, weight: 'bold', align: 'center', baseline: 'middle' });
}
/* Clear the terminal over the last 0.3 s so the final frame matches the first (an empty terminal). */
function wipe(g, t, D) {
  const p = kf(t, [[D - 0.4, 0], [D - 0.1, 1]]);
  if (p > 0) g.fillRect(TX + 2, TY + 13, TW - 4, Math.round((TH - 16) * p), TERM);
}

// 1. Python: an IndentationError, fixed by sliding the line into place. A snake slithers past.
const PY_BLUE = Sim.hex('#3776ab'), PY_YELLOW = Sim.hex('#ffd43b');
function snake(g, hx, y, t) {
  const path = x => y + Math.round(5 * Math.sin(x * 0.09));        // the body follows the head's path
  for (let k = 16; k >= 1; k--) {
    const x = hx - k * 5, r = k > 11 ? Math.max(2, 5 - (k - 11)) : 5;
    g.fillCircle(x, path(x), r, k > 8 ? PY_YELLOW : PY_BLUE);
  }
  const hy = path(hx);
  g.fillEllipse(hx + 2, hy, 8, 6, PY_BLUE);
  g.fillCircle(hx + 4, hy - 2, 2, CREAM); g.drawPixel(hx + 5, hy - 2, INK);
  if (Math.floor(t * 2.5) % 2 === 0) {                               // tongue flick
    g.drawLine(hx + 10, hy + 1, hx + 15, hy + 1, RED);
    g.drawLine(hx + 15, hy + 1, hx + 18, hy - 1, RED); g.drawLine(hx + 15, hy + 1, hx + 18, hy + 3, RED);
  }
}
const PY1 = [['def ', CORAL], ['hi', BLUE], ['(n):', CREAM]];
const PY2 = [['    s = ', CREAM], ['"hey"', GREEN]];
const PY3 = [['  print', CREAM], ['(s)', STONE]];
const PY_T = [[0.2, len(PY1)], [0.95, len(PY2)], [1.95, len(PY3)]];
rig(spec('Claude: python', 5600, happyEnd(3800, 5000, {
  lookY: [[0, 11], [2600, 11], [2750, 15], [3500, 12]],
  eyeSize: [[0, 0.9], [2650, 0.9], [2800, 1.05, 'pop'], [3300, 0.9]],
  iris: [[0, 16], [2650, 16], [2800, 11], [3300, 16]],
  mouthCurve: [[0, 0.2], [2650, 0.2], [2800, 0], [3500, 0.2]],
  mouthOpen: [[0, 0], [2650, 0], [2800, 0.45, 'pop'], [3300, 0.1], [3600, 0]],
  mouthWidth: [[0, 12], [2650, 12], [2800, 14], [3500, 12]],
})), {
  over(g, c) {
    const t = c.t;
    snake(g, Math.round(22 + 266 * c.f.p), 30, t);
    terminal(g, TX, TY, TW, TH); fileName(g, 'main.py');
    const fix = kf(t, [[3.3, 0], [3.6, 1]]);
    if (between(t, 2.7, 3.6)) g.fillRect(TX + 3, R3 - 5, TW - 6, 11, fade(TERM, RED, 0.35 * (1 - fix)));
    const n = PY_T.map(([t0]) => typed(t, t0, 14));
    let x = code(g, 70, R1, PY1, n[0]), y = R1;
    if (n[1]) { x = code(g, 70, R2, PY2, n[1]); y = R2; }
    if (n[2]) { x = code(g, 70 + Math.round(12 * fix), R3, PY3, n[2]); y = R3; }
    if (t < 2.65) caret(g, x, y, t);
    if (between(t, 2.7, 3.6)) code(g, 70, R4, [['IndentationError', RED]]);
    else if (t >= 3.7) { check(g, 76, R4, 4, GREEN); code(g, 88, R4, [['hey', GREEN]]); }
    wipe(g, t, 5.6);
  },
}, (v, t) => { if (t < 2.65) v.lookX = caretLook(t, PY_T, 14); });

// 2. C++: one missing #include, a wall of template errors, a counter in the thousands.
const CPP_BLUE = Sim.hex('#00599c');
const WALL = [
  ['error: no match', RED], ['for operator<<', CREAM], ['std::vector<std::', STONE], [' map<std::string,', STONE],
  ['  std::pair<int,', STONE], ['   std::allocator', STONE], ['note: candidate', YELLOW], ['template<class T>', STONE],
  ['error: no type', RED], ['required from', YELLOW], ['  std::basic_str', STONE], ['error: expected', RED],
];
const wallLines = t => (t < 1.3 ? 0 : Math.floor(5 * (t - 1.3) + 4 * (t - 1.3) * (t - 1.3)));
rig(spec('Claude: cpp', 6000, happyEnd(4100, 5400, {
  lookY: [[0, 11], [1300, 11], [1500, 15], [3300, 15], [3500, 11]],
  eyeSize: [[0, 0.9], [1300, 0.9], [3000, 1.1], [3400, 0.9]],
  iris: [[0, 16], [1300, 16], [3000, 9], [3400, 16]],
  pupil: [[0, 0.5], [1300, 0.5], [3000, 0.3], [3400, 0.5]],
  shake: [[0, 0], [2300, 0], [3000, 0.25], [3300, 0]],
  mouthCurve: [[0, 0.2], [1300, 0.2], [2600, -0.6], [3400, -0.1], [3800, 0.2]],
  mouthOpen: [[0, 0], [1700, 0], [2600, 0.35], [3300, 0]],
  mouthWidth: [[0, 12], [2600, 16], [3400, 12]],
})), {
  over(g, c) {
    const t = c.t, n = wallLines(Math.min(t, 3.3));
    if (t < 1.3 || t >= 4.9) badge(g, 'C++', CPP_BLUE, CREAM);
    else if (t < 3.9) label(g, 120, 30, `${(n * 49).toLocaleString('en-US')} errors`, t < 3.3 ? RED : fade(INK, RED, 0.6), 14, 'center');
    else label(g, 120, 30, '0 errors', GREEN, 14, 'center');
    terminal(g, TX, TY, TW, TH); fileName(g, 'main.cpp');
    const x = code(g, 70, R1, [['$ ', CORAL], ['g++ main.cpp', CREAM]], typed(t, 0.2, 16));
    if (t < 1.2) caret(g, x, R1, t);
    if (between(t, 1.3, 3.3)) {
      for (let k = 0; k < 4; k++) {                                  // newest line at the bottom
        const i = n - 4 + k;
        if (i >= 0) code(g, 70, 182 + k * 10, [WALL[i % WALL.length]]);
      }
    } else if (between(t, 3.3, 4.0)) {
      cliSpinner(g, 80, R3 - 4, Math.floor(t * 8), CORAL); label(g, 94, R3 - 4, 'Fixing…', CORAL, 13);
    } else if (t >= 4.0) {
      code(g, 70, R2, [['+ #include <map>', GREEN]], typed(t, 4.0, 30));
      if (t > 4.6) { check(g, 76, R4 - 2, 4, GREEN); code(g, 88, R4 - 2, [['0 errors', GREEN]]); }
    }
    wipe(g, t, 6.0);
  },
}, null);

// 3. Go: `go work(ch)` sends three goroutines racing into a channel while a gopher peeks in.
const GO_CYAN = Sim.hex('#00add8'), GO_TAN = Sim.hex('#e8c9a0');
function gopher(g, x, y, look, blink) {
  g.fillCircle(x - 24, y - 14, 7, GO_CYAN); g.fillCircle(x + 24, y - 14, 7, GO_CYAN);
  g.fillEllipse(x, y, 28, 24, GO_CYAN);
  for (const s of [-1, 1]) {
    if (blink) g.fillRect(x + s * 12 - 6, y - 2, 12, 2, INK);
    else { g.fillCircle(x + s * 12, y - 3, 9, CREAM); g.fillCircle(x + s * 12 + look, y, 4, INK); }
  }
  g.fillEllipse(x, y + 12, 7, 5, GO_TAN);
  g.fillEllipse(x, y + 9, 3, 2, INK);
  g.fillRect(x - 3, y + 15, 6, 5, CREAM);
}
const RUN = [[1.2, 1.1], [1.4, 1.7], [1.6, 1.35]];                  // goroutines: [start, seconds to the channel]
const runX = (t, i) => 74 + Math.round(76 * clamp01((t - RUN[i][0]) / RUN[i][1]));
const arrived = t => RUN.filter(([s, d]) => t >= s + d).length;
rig(spec('Claude: go', 6000, happyEnd(3300, 4800, {
  lookY: [[0, 11], [1100, 11], [1300, 13], [3200, 13], [3400, 11]],
})), {
  over(g, c) {
    const t = c.t;
    const gy = Math.round(kf(t, [[0.3, -40], [0.8, 12], [5.2, 12], [5.7, -40]]));
    if (gy > -30) gopher(g, 120, gy, between(t, 1.2, 3.2) ? 2 : 0, (t % 2.4) > 2.25);
    terminal(g, TX, TY, TW, TH); fileName(g, 'main.go');
    const x = code(g, 70, R1, [['go ', CORAL], ['work', BLUE], ['(ch)', CREAM]], typed(t, 0.3, 14));
    if (t < 1.2) caret(g, x, R1, t);
    if (t < 1.0) return wipe(g, t, 6.0);
    code(g, 156, R1, [['ch', STONE]]);
    g.drawRoundRect(154, 180, 18, 34, 4, STONE);
    const inChan = arrived(t) - Math.floor(clamp01((t - 4.4) / 1.0) * 3);   // received with <-ch at the end
    for (let k = 0; k < inChan; k++) g.fillRoundRect(157, 205 - k * 10, 12, 7, 2, GO_CYAN);
    for (let i = 0; i < 3; i++) {
      const y = 186 + i * 10;
      for (let xx = 74; xx < 150; xx += 6) g.drawPixel(xx, y + 4, EDGE);
      if (between(t, RUN[i][0], RUN[i][0] + RUN[i][1])) miniBuddy(g, runX(t, i), y - (Math.floor(t * 14 + i * 3) % 2), 4, GO_CYAN, 1);
    }
    if (arrived(t) === 3 && t < 5.4) check(g, 146, R1, 4, GREEN);
    wipe(g, t, 6.0);
  },
}, (v, t) => {
  if (!between(t, 1.2, 3.2)) return;
  let lead = 74;
  for (let i = 0; i < 3; i++) if (between(t, RUN[i][0], RUN[i][0] + RUN[i][1])) lead = Math.max(lead, runX(t, i));
  v.lookX = Math.round((lead - 120) / 4);
});

// 4. Rust: the borrow checker says no, a crab snaps its claws, `.clone()` fixes it, the crab dances.
const CRAB = Sim.hex('#f2672a'), CRAB_DK = Sim.hex('#a3401a');
function crab(g, x, y, snap, happy, bg) {
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {                                    // legs
      const lx = x + s * (8 + k * 5);
      g.drawLine(lx, y + 6, lx + s * 5, y + 13, CRAB_DK); g.drawLine(lx + s, y + 6, lx + s * 6, y + 13, CRAB_DK);
    }
    const cx = x + s * 25, cy = y - 12;
    for (let d = -1; d <= 1; d++) g.drawLine(x + s * 15, y - 3 + d, cx, cy + d, CRAB);   // arm
    g.fillCircle(cx, cy, 6, CRAB);                                                       // claw with an opening notch
    const a = (s > 0 ? -60 : -120) * Math.PI / 180, h = 0.15 + 0.4 * snap;
    g.fillTriangle(cx, cy, cx + Math.round(9 * Math.cos(a - h)), cy + Math.round(9 * Math.sin(a - h)),
                   cx + Math.round(9 * Math.cos(a + h)), cy + Math.round(9 * Math.sin(a + h)), bg);
    g.drawLine(x + s * 6, y - 8, x + s * 7, y - 15, CRAB); g.drawLine(x + s * 5, y - 8, x + s * 6, y - 15, CRAB);   // eye stalks
    g.fillCircle(x + s * 7, y - 17, 3, CREAM); g.fillCircle(x + s * 7, y - 16, 1, INK);
  }
  g.fillEllipse(x, y, 18, 10, CRAB);
  if (happy) g.drawArc(x, y - 2, 6, 4, 120, 240, INK); else g.fillRect(x - 4, y + 2, 8, 2, INK);
}
rig(spec('Claude: rust', 6200, happyEnd(4200, 5500, {
  lookY: [[0, 11], [1700, 11], [1900, 13], [3300, 13], [3500, 11]],
  lid: [[0, 0], [1800, 0], [2000, 0.25], [3300, 0.25], [3500, 0]],
  mouthCurve: [[0, 0.2], [1800, 0.2], [2000, -0.6], [3300, -0.6], [3600, 0.1]],
  mouthWidth: [[0, 12], [1800, 12], [2000, 18], [3500, 12]],
  shake: [[0, 0], [1850, 0], [1950, 0.3], [2150, 0]],
})), {
  over(g, c) {
    const t = c.t, angry = between(t, 1.8, 3.3), dance = kf(t, [[4.1, 0], [4.3, 1], [5.5, 1], [5.8, 0]]);
    const snap = angry ? 0.5 + 0.5 * Math.sin(t * 22) : dance > 0 ? 0.5 + 0.5 * Math.sin(t * 10) * dance : 0.2;
    crab(g, 120 + Math.round(7 * dance * Math.sin(t * 8)), 36 - Math.round(3 * dance * Math.abs(Math.sin(t * 8))), snap, dance > 0.5, c.bg);
    terminal(g, TX, TY, TW, TH); fileName(g, 'main.rs');
    const x = code(g, 70, R1, [['$ ', CORAL], ['cargo build', CREAM]], typed(t, 0.2, 16));
    if (t < 1.1) caret(g, x, R1, t);
    const FIX = [['+ ', GREEN], ['v.clone()', GREEN]];
    if (between(t, 1.1, 1.8)) { cliSpinner(g, 76, R2, Math.floor(t * 8), CORAL); code(g, 88, R2, [['Compiling', CORAL]]); }
    else if (between(t, 1.8, 4.1)) {
      const fixing = t >= 3.3;
      code(g, 70, R2, [['error[E0502]', fixing ? STONE : RED]]);
      if (!fixing) { code(g, 70, R3, [['cannot borrow', CREAM]]); code(g, 70, R4, [['`v` as mutable', STONE]]); }
      else code(g, 70, R3, FIX, typed(t, 3.3, 14));
    } else if (t >= 4.1) {
      check(g, 76, R2, 4, GREEN); code(g, 88, R2, [['Finished', GREEN]]);
      code(g, 70, R3, FIX);
    }
    wipe(g, t, 6.2);
  },
}, null);

// 5. JavaScript: [] + {}, typeof null, NaN === NaN. Each answer makes less sense than the last.
const JS_YELLOW = Sim.hex('#f7df1e');
const JS_LINES = [
  [0.2, [['> ', CORAL], ['[] + {}', CREAM]]],
  [1.0, [["'[object Object]'", GREEN]]],
  [1.5, [['> ', CORAL], ['typeof null', CREAM]]],
  [2.6, [["'object'", GREEN]]],
  [3.0, [['> ', CORAL], ['NaN === NaN', CREAM]]],
  [4.1, [['false', YELLOW]]],
];
rig(spec('Claude: javascript', 6000, {
  lookY: [[0, 11]],
  brows: [[0, 0], [1000, 0], [1050, 1], [5300, 1], [5350, 0]],
  browRaise: [[0, 4], [1000, 4], [1200, 7], [2600, 7], [2800, 10], [4100, 10], [4300, 13], [4800, 6]],
  browTilt: [[0, -6], [2600, -6], [2800, -12], [4800, -4]],
  eyeSize: [[0, 0.9], [1000, 0.9], [1150, 1.0], [1500, 0.92], [2600, 0.92], [2750, 1.0], [3100, 0.94], [4100, 0.94], [4250, 1.02], [4700, 0.9]],
  openL: [[0, 1], [2700, 1], [2900, 0.75], [4100, 0.75], [4250, 1]],
  mouthCurve: [[0, 0.2], [1000, 0.2], [1200, 0], [2600, 0], [2800, -0.3], [4100, -0.3], [4300, 0], [4700, 0], [4900, 0.6], [5500, 0.6], [5900, 0.2]],
  mouthOpen: [[0, 0], [4100, 0], [4250, 0.5], [4600, 0]],
  mouthWidth: [[0, 12], [4250, 12], [4900, 18], [5500, 18], [5900, 12]],
  squint: [[0, 0], [4800, 0], [5000, 0.5], [5500, 0.5], [5800, 0]],
  blush: [[0, 0], [4800, 0], [5000, 0.5], [5500, 0.5], [5800, 0]],
}), {
  over(g, c) {
    const t = c.t;
    badge(g, between(t, 4.2, 5.2) ? 'wat' : 'JS', JS_YELLOW, INK);
    for (const [t0, x] of [[1.1, 26], [2.7, 214]]) {
      const p = kf(t, [[t0, 0], [t0 + 0.2, 1], [5.0, 1], [5.3, 0]]);
      if (p > 0.3) label(g, x, 92, '?', YELLOW, Math.round(24 * p), 'center');
    }
    terminal(g, TX, TY, TW, TH); fileName(g, 'node');
    const shown = JS_LINES.filter(([t0]) => t >= t0), first = Math.max(0, shown.length - 4);
    let x = 70, y = R1;
    shown.slice(first).forEach(([t0, parts], k) => {
      y = R1 + k * 12;
      x = code(g, 70, y, parts, parts[0][0] === '> ' ? 2 + typed(t, t0, 14) : Infinity);
    });
    if (shown.length && shown.length % 2 === 1) caret(g, x, y, t);     // waiting at an input line
    wipe(g, t, 6.0);
  },
}, (v, t) => {
  const input = JS_LINES.filter(([t0, p], i) => i % 2 === 0 && t >= t0).pop();
  if (input && t < input[0] + 1.0) v.lookX = Math.round((70 + Math.min(len(input[1]), 2 + (t - input[0]) * 14) * 6 - 120) / 4);
});

// 6. TypeScript: three red squiggles, three type annotations, zero errors.
const TS_BLUE = Sim.hex('#3178c6'), TYPE = Sim.hex('#4ec9b0');
const TS_ROWS = [
  { y: R1, pre: [['let ', CORAL], ['count', CREAM]], ann: ': number', post: [], at: 1.4, sq: [4, 9] },
  { y: R2, pre: [['(', STONE], ['name', CREAM]], ann: ': string', post: [[') =>', STONE]], at: 2.2, sq: [1, 5] },
  { y: R3, pre: [['let ', CORAL], ['done', CREAM]], ann: ': boolean', post: [], at: 3.0, sq: [4, 8] },
];
function squiggle(g, x0, x1, y, col) {
  for (let x = x0; x < x1; x += 2) {
    const up = ((x - x0) >> 1) % 2 === 0;
    g.drawLine(x, y + (up ? 0 : 2), x + 2, y + (up ? 2 : 0), col);
  }
}
rig(spec('Claude: typescript', 5800, happyEnd(4000, 5300, {
  lookY: [[0, 9], [2100, 9], [2300, 11], [2900, 11], [3100, 13], [3800, 13], [3950, 11]],
  lid: [[0, 0], [800, 0], [1000, 0.25], [3800, 0.25], [4000, 0]],
  brows: [[0, 0], [900, 0], [950, 1], [3800, 1], [3850, 0]], browTilt: [[0, 8]], browRaise: [[0, 4]],
  mouthCurve: [[0, 0.2], [900, 0.2], [1100, 0], [3800, 0], [3950, 0.2]],
})), {
  over(g, c) {
    const t = c.t;
    badge(g, 'TS', TS_BLUE, CREAM);
    terminal(g, TX, TY, TW, TH); fileName(g, 'app.ts');
    let fixed = 0;
    TS_ROWS.forEach((r, k) => {
      const n = typed(t, r.at, 12), done = n >= r.ann.length;
      if (done) fixed++;
      code(g, 70, r.y, r.pre.concat([[r.ann.slice(0, n), TYPE]], r.post), typed(t, 0.1 + 0.2 * k, 40) + Math.min(n, r.ann.length));
      if (!done && t >= 0.8) squiggle(g, 70 + Math.round(r.sq[0] * 6), 70 + Math.round(r.sq[1] * 6), r.y + 5, RED);
    });
    const left = 3 - fixed;
    if (t >= 0.8 && left > 0) code(g, 70, R4, [[`${left} error${left > 1 ? 's' : ''}`, RED]]);
    else if (t >= 0.8) { check(g, 76, R4, 4, GREEN); code(g, 88, R4, [['0 errors', GREEN]]); }
    wipe(g, t, 5.8);
  },
}, (v, t) => {
  const r = TS_ROWS.find(r => t < r.at + 0.8);
  if (r && t > 1.2) v.lookX = Math.round((70 + (len(r.pre) + Math.min(r.ann.length, Math.max(0, (t - r.at) * 12))) * 6 - 120) / 4);
});

// 7. Java: the class name gets longer and longer, eyelids get heavier, a sip of coffee, then `var`.
const JAVA_ORANGE = Sim.hex('#e76f00'), COFFEE = Sim.hex('#6f4e37');
function mug(g, x, y, t) {
  for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) {           // steam
    const u = (t * 0.9 + j / 4 + k * 0.13) % 1;
    g.fillRect(x - 6 + k * 6 + Math.round(2 * Math.sin(t * 5 + j * 1.7 + k)), y - 16 - Math.round(16 * u), 2, 2, fade(INK, STONE, 1 - u));
  }
  g.drawArc(x - 13, y + 1, 9, 5, 180, 360, CREAM);                   // handle on the left
  g.fillRoundRect(x - 13, y - 12, 26, 25, 5, CREAM);
  g.fillEllipse(x, y - 12, 13, 4, CREAM);
  g.fillEllipse(x, y - 12, 10, 2, COFFEE);
  g.fillRect(x - 13, y - 1, 26, 3, JAVA_ORANGE);
}
const LONG = [['AbstractSingletonProxyFactoryBean', BLUE], [' factory = ', CREAM], ['new ', CORAL], ['AbstractSingletonProxy', BLUE]];
const JV1 = [['class ', CORAL], ['Main', BLUE], [' {', STONE]], JV2 = [['  public static', CORAL]];
const JV_T = [[0.2, len(JV1)], [1.0, len(JV2)]];
rig(spec('Claude: java', 6000, happyEnd(4500, 5500, {
  lookY: [[0, 11], [3500, 11], [3700, 4], [4400, 4], [4600, 11]],
  lid: [[0, 0.15], [2100, 0.15], [3500, 0.6], [4300, 0.6], [4400, 0], [5600, 0], [5900, 0.15]],
  eyeSize: [[0, 0.9], [4300, 0.9], [4450, 1.08, 'pop'], [4900, 0.9]],
  sparkle: [[0, 0], [4350, 0], [4500, 1], [5300, 1], [5600, 0]],
  mouthCurve: [[0, 0.1], [2100, 0.1], [3400, -0.2], [4300, -0.2], [4400, 0.2]],
})), {
  over(g, c) {
    const t = c.t;
    badge(g, 'Java', JAVA_ORANGE, CREAM);
    terminal(g, TX, TY, TW, TH); fileName(g, 'Main.java');
    let x = code(g, 70, R1, JV1, typed(t, 0.2, 16)), y = R1;
    const n2 = typed(t, 1.0, 16);
    if (n2) { x = code(g, 70, R2, JV2, n2); y = R2; }
    if (between(t, 2.1, 4.4)) {                                      // the marquee: the caret stays near the right edge
      const n = typed(Math.min(t, 3.5), 2.1, 30), shift = Math.max(0, Math.round(n * 6 - 96));
      x = code(g, 70 - shift, R3, LONG, n); y = R3;
      g.fillRect(0, R3 - 6, TX, 13, c.bg); g.fillRect(TX + 1, R3 - 6, 7, 13, TERM); g.drawFastVLine(TX, R3 - 6, 13, EDGE);
    } else if (t >= 4.4) {
      x = code(g, 70, R3, [['var ', CORAL], ['f = ', CREAM], ['make', BLUE], ['();', STONE]], typed(t, 4.5, 24)); y = R3;
      if (t > 5.2) { check(g, 76, R4 + 2, 4, GREEN); code(g, 88, R4 + 2, [['compiled', GREEN]]); }
    }
    if (t < 3.5 || between(t, 4.4, 5.2)) caret(g, x, y, t);
    const s = kf(t, [[3.5, 0], [3.9, 1], [4.4, 1], [4.8, 0]]);         // the sip: mug to the mouth and back
    mug(g, Math.round(40 + 82 * s + c.dx * s), Math.round(162 - 12 * s), t);
    wipe(g, t, 6.0);
  },
}, (v, t) => {
  if (t < 2.1) v.lookX = caretLook(t, JV_T, 16);
  else if (t < 3.5) v.lookX = 11;
});

// 8. C: `for(;;) *p++ = 0;` walks the pointer off the end of the array. Segmentation fault.
const C_STEEL = Sim.hex('#a8b9cc');
const CELLS = ['7', '3', '9', '1'];
const cellX = k => 76 + k * 20;                                      // k = 4 is past the end of the array
const pIdx = t => (t < 3.6 ? Math.min(4, Math.max(0, Math.floor((t - 1.0) / 0.35))) : Math.min(3, Math.max(0, Math.floor((t - 4.4) / 0.12))));
rig(spec('Claude: c', 5800, happyEnd(4900, 5300, {
  lookY: [[0, 11], [900, 11], [1000, 13], [2600, 13], [2700, 6], [3400, 6], [3600, 11], [4300, 11], [4400, 13]],
  eyeSize: [[0, 0.9], [2550, 0.9], [2700, 1.12, 'pop'], [3400, 1.0], [3600, 0.9]],
  iris: [[0, 16], [2550, 16], [2700, 8], [3400, 12], [3600, 16]],
  pupil: [[0, 0.5], [2550, 0.5], [2700, 0.3], [3500, 0.5]],
  shake: [[0, 0], [2600, 0], [2650, 0.5], [3000, 0]],
  mouthCurve: [[0, 0.2], [2550, 0.2], [2700, -0.5], [3500, -0.5], [3700, 0.1]],
  mouthOpen: [[0, 0], [2550, 0], [2700, 0.6, 'pop'], [3100, 0.3], [3500, 0]],
  mouthWidth: [[0, 12], [2550, 12], [2700, 16], [3500, 12]],
  tears: [[0, 0], [2800, 0], [3000, 0.6], [3400, 0.6], [3600, 0]],
})), {
  over(g, c) {
    const t = c.t, crash = between(t, 2.6, 3.6);
    badge(g, 'C', C_STEEL, INK);
    terminal(g, TX, TY, TW, TH); fileName(g, 'main.c');
    if (crash) {
      const flash = 1 - clamp01((t - 2.6) / 0.4);
      if (flash > 0) g.fillRect(TX + 2, TY + 13, TW - 4, TH - 17, fade(TERM, RED, 0.45 * flash));
      code(g, 66, R2, [['Segmentation fault', RED]]);
      code(g, 66, R3, [['(core dumped)', STONE]]);
      return;
    }
    const after = t >= 3.6;
    const CODE = after ? [['for', CORAL], ['(i=0;', CREAM], ['i<4', GREEN], [';i++)', CREAM]] : [['for', CORAL], ['(;;) ', CREAM], ['*p++ = 0;', CREAM]];
    const x = code(g, 70, R1, CODE, after ? typed(t, 3.6, 24) : typed(t, 0.2, 22));
    if (t < 1.0 || between(t, 3.6, 4.35)) caret(g, x, R1, t);
    if (t < 0.9) return;
    const i = pIdx(t), walking = after ? t >= 4.4 : t >= 1.0;
    for (let k = 0; k < 4; k++) {
      const zero = walking && (after ? t >= 4.4 + 0.12 * k : t >= 1.15 + 0.35 * k);
      g.drawRect(cellX(k) - 9, 182, 18, 14, STONE);
      g.text(cellX(k), 189, zero ? '0' : CELLS[k], zero ? GREEN : CREAM, { size: 10, font: MONO, align: 'center', baseline: 'middle' });
    }
    const out = !after && i === 4;
    for (let xx = cellX(4) - 9; xx < cellX(4) + 9; xx += 3) { g.drawPixel(xx, 182, out ? RED : EDGE); g.drawPixel(xx, 195, out ? RED : EDGE); }
    for (let yy = 182; yy < 196; yy += 3) { g.drawPixel(cellX(4) - 9, yy, out ? RED : EDGE); g.drawPixel(cellX(4) + 8, yy, out ? RED : EDGE); }
    g.text(cellX(4), 189, '?', out ? RED : STONE, { size: 10, font: MONO, align: 'center', baseline: 'middle' });
    if (walking) {
      const px = cellX(i);
      g.fillTriangle(px, 197, px - 5, 203, px + 5, 203, CORAL);
      g.text(px, 210, 'p', CORAL, { size: 10, font: MONO, weight: 'bold', align: 'center', baseline: 'middle' });
    }
    if (t > 4.9) check(g, 156, 208, 4, GREEN);
    wipe(g, t, 5.8);
  },
}, (v, t) => { if (between(t, 1.0, 2.6) || between(t, 4.4, 4.9)) v.lookX = Math.round((cellX(pIdx(t)) - 120) / 4); });

// 9. SQL: a SELECT, then `DROP TABLE us…` gets typed, a long nervous pause, and backspaced.
const DB = Sim.hex('#336791'), DB_HI = Sim.hex('#5b8fc2'), SWEAT = Sim.hex('#58c8ff');
function dbIcon(g, x, y) {
  g.fillRect(x - 16, y - 9, 32, 20, DB);
  g.fillEllipse(x, y + 11, 16, 5, DB);
  for (const by of [y - 3, y + 4]) for (let dx = -16; dx <= 16; dx++) g.drawPixel(x + dx, by + Math.round(5 * Math.sqrt(1 - (dx / 16) * (dx / 16))), DB_HI);
  g.fillEllipse(x, y - 9, 16, 5, DB_HI);
}
const Q1 = [['SELECT ', CORAL], ['*', CREAM]], Q2 = [['FROM ', CORAL], ['users', BLUE], [';', STONE]];
const DROP = [['DROP TABLE ', RED], ['users;', BLUE]];
rig(spec('Claude: sql', 6400, happyEnd(4900, 5900, {
  lookY: [[0, 11], [3300, 11], [3450, -8], [3800, -8], [3950, 11]],
  eyeSize: [[0, 0.9], [2700, 0.9], [3900, 1.06], [4300, 1.06], [4700, 0.9]],
  iris: [[0, 16], [2700, 16], [3900, 10], [4300, 10], [4700, 16]],
  brows: [[0, 0], [2900, 0], [2950, 1], [4700, 1], [4750, 0]], browTilt: [[0, -12]], browRaise: [[0, 6], [3900, 10], [4600, 6]],
  mouthCurve: [[0, 0.2], [2700, 0.2], [3600, -0.4], [4300, -0.4], [4700, 0.2]],
  mouthOpen: [[0, 0], [3600, 0], [3900, 0.25], [4300, 0.25], [4600, 0]],
  mouthWidth: [[0, 12], [3600, 12], [3900, 10], [4400, 10], [4700, 12]],
})), {
  over(g, c) {
    const t = c.t, nervous = between(t, 2.6, 4.4);
    dbIcon(g, 120 + (nervous ? Math.round(1.5 * Math.sin(t * 40)) : 0), 30);
    const drop = kf(t, [[3.0, 0], [3.3, 1], [4.6, 1], [4.9, 0]]);    // a bead of sweat
    if (drop > 0.1) {
      const x = 204 + c.dx, y = 70 + c.dy + Math.round(10 * clamp01((t - 3.3) / 1.3)), r = Math.round(4 * drop);
      g.fillCircle(x, y, r, SWEAT); g.fillTriangle(x - r, y - 1, x + r, y - 1, x, y - Math.round(9 * drop), SWEAT);
    }
    terminal(g, TX, TY, TW, TH); fileName(g, 'query.sql');
    if (t < 2.5) {
      let x = code(g, 70, R1, Q1, typed(t, 0.2, 14)), y = R1;
      const n2 = typed(t, 0.85, 14);
      if (n2) { x = code(g, 70, R2, Q2, n2); y = R2; }
      if (t < 1.7) caret(g, x, y, t);
      [[1.8, [[22, CREAM], [30, GREEN], [18, YELLOW]]], [2.0, [[16, CREAM], [38, GREEN], [12, YELLOW]]]].forEach(([t0, row], k) => {
        if (t < t0) return;
        const yy = R3 + k * 11;
        codeBars(g, 72, yy, row);
        g.drawFastHLine(70, yy + 5, 100, EDGE);
      });
    } else {
      const n = Math.max(0, Math.min(13, typed(t, 2.6, 10)) - typed(t, 4.3, 26));   // 'DROP TABLE us', then backspace
      if (t < 4.85) caret(g, code(g, 70, R1, DROP, n), R1, t);
      else {
        const x = code(g, 70, R1, [['-- maybe not', STONE]], typed(t, 4.85, 20));
        if (t < 5.5) caret(g, x, R1, t);
      }
      if (t > 5.5) { check(g, 76, R3, 4, GREEN); code(g, 88, R3, [['users safe', GREEN]]); }
    }
    wipe(g, t, 6.4);
  },
}, (v, t) => { if (t < 1.7) v.lookX = caretLook(t, [[0.2, len(Q1)], [0.85, len(Q2)]], 14); });

// 10. bash: cat | grep | wc. Lines flow down the pipe, grep drops the misses, wc counts the rest.
const SH_GREEN = Sim.hex('#89e051');
function promptIcon(g, t) {
  g.fillRoundRect(100, 15, 40, 30, 6, TERM); g.drawRoundRect(100, 15, 40, 30, 6, EDGE);
  g.text(107, 30, '$', SH_GREEN, { size: 14, font: MONO, weight: 'bold', baseline: 'middle' });
  if (Math.floor(t * 2.5) % 2 === 0) g.fillRect(119, 35, 10, 3, SH_GREEN);
}
const STAGES = [['cat', 86], ['grep', 122], ['wc', 158]];
const MATCH = [1, 4, 6, 8];                                           // the lines grep keeps (of 10)
const blockX = (t, j) => 66 + 60 * (t - (1.3 + 0.2 * j));
rig(spec('Claude: bash', 5800, happyEnd(4500, 5200, { lookY: [[0, 11], [1200, 11], [1400, 13]] })), {
  over(g, c) {
    const t = c.t;
    promptIcon(g, t);
    terminal(g, TX, TY, TW, TH); fileName(g, 'bash');
    const CMD = [['$ ', CORAL], ['cat', CREAM], ['|', YELLOW], ['grep', CREAM], ['|', YELLOW], ['wc', CREAM]];
    const x = code(g, 70, R1, CMD, typed(t, 0.2, 14));
    if (t < 1.2) caret(g, x, R1, t);
    if (t < 1.15) return wipe(g, t, 5.8);
    g.fillRect(66, 191, 108, 3, EDGE);                                // the pipe
    for (let j = 0; j < 10; j++) {
      const bx = blockX(t, j), keep = MATCH.includes(j);
      if (bx < 66 || (keep && bx >= 158) || (!keep && bx > 150)) continue;
      if (bx < 122) g.fillRect(Math.round(bx) - 2, 190, 5, 5, CREAM);
      else if (keep) g.fillRect(Math.round(bx) - 2, 190, 5, 5, GREEN);
      else g.fillRect(Math.round(bx) - 2, 190 + Math.round(0.03 * (bx - 122) * (bx - 122)), 5, 5, fade(TERM, RED, 1 - (bx - 122) / 28));
    }
    for (const [s, sx] of STAGES) {
      const w = s.length * 6 + 10;
      g.fillRoundRect(sx - (w >> 1), 185, w, 15, 5, fade(TERM, CREAM, 0.12));
      g.drawRoundRect(sx - (w >> 1), 185, w, 15, 5, STONE);
      g.text(sx, 192, s, CREAM, { size: 10, font: MONO, align: 'center', baseline: 'middle' });
    }
    const count = MATCH.filter(j => blockX(t, j) >= 158).length;
    label(g, 76, R4 + 2, String(count), GREEN, 14, 'center');
    if (t > 4.5) check(g, 96, R4 + 2, 4, GREEN);
    wipe(g, t, 5.8);
  },
}, (v, t) => {
  if (!between(t, 1.3, 4.5)) return;
  const xs = [];
  for (let j = 0; j < 10; j++) { const bx = blockX(t, j); if (bx >= 66 && bx <= 158) xs.push(bx); }
  if (xs.length) v.lookX = Math.round((xs.reduce((a, b) => a + b, 0) / xs.length - 120) / 4);
});

// 11. polyglot: a ring of file extensions pops in around the buddy, one after another.
const LANGS = [['.java', '#e76f00', '#ffffff'], ['.cpp', '#00599c', '#ffffff'], ['.py', '#3776ab', '#ffd43b'], ['.js', '#f7df1e', '#1f1e1d'],
               ['.ts', '#3178c6', '#ffffff'], ['.sql', '#2a9d8f', '#ffffff'], ['.go', '#00add8', '#1f1e1d'], ['.rs', '#dea584', '#1f1e1d'],
               ['.c', '#a8b9cc', '#1f1e1d'], ['.sh', '#89e051', '#1f1e1d']].map(([s, bg, fg], k) => {
  const a = (-108 + 36 * k) * Math.PI / 180;
  return { s, bg: Sim.hex(bg), fg: Sim.hex(fg), x: Math.round(120 + 92 * Math.cos(a)), y: Math.round(120 + 92 * Math.sin(a)), t0: 0.4 + 0.3 * k, t1: 4.9 + 0.06 * k };
});
rig(spec('Claude: polyglot', 6000, happyEnd(3500, 4700, { mouthCurve: [[0, 0.5]], mouthWidth: [[0, 16]] }), { eyeSize: [[0, 0.68]], iris: [[0, 12]] }), {
  over(g, c) {
    for (const L of LANGS) {
      const p = kf(c.t, [[L.t0, 0], [L.t0 + 0.2, 1]]) * (1 - kf(c.t, [[L.t1, 0], [L.t1 + 0.2, 1]]));
      if (p < 0.05) continue;
      const w = Math.round((L.s.length * 6 + 10) * p), h = Math.max(2, Math.round(16 * p));
      g.fillRoundRect(L.x - (w >> 1), L.y - (h >> 1), w, h, h >> 1, L.bg);
      if (p > 0.9) g.text(L.x, L.y, L.s, L.fg, { size: 10, font: MONO, weight: 'bold', align: 'center', baseline: 'middle' });
    }
  },
}, (v, t) => {
  if (!between(t, 0.4, 3.5)) return;
  const L = LANGS[Math.min(LANGS.length - 1, Math.floor((t - 0.4) / 0.3))];
  v.lookX = Math.round((L.x - 120) / 10); v.lookY = Math.round((L.y - 112) / 11);
});
