/* Hacker theme (the hoodie build): code rain inside the hood, breaking in at the terminal, and
 * two "ACCESS DENIED"s before the third try gets in. Standard face with green eyes, under a hood. */
const GREEN = Sim.hex('#39ff7a'), GREEN_DIM = Sim.hex('#14803c'), GREEN_HI = Sim.hex('#d2ffe0');
const HOOD = Sim.hex('#262a31'), HOOD_RIM = Sim.hex('#3a3f4a'), HOOD_SEAM = Sim.hex('#1a1d22'), CORD = Sim.hex('#9aa0aa');
const RED = Sim.hex('#ff3b3b'), TERM = Sim.hex('#04120a'), BLACK = Sim.C.BLACK;
const COLORS = { bg: '#000000', iris: '#39ff7a', mouth: '#39ff7a', blush: '#1f7a45', sclera: '#e8fff0' };
const MONO = 'Menlo, Monaco, Consolas, monospace';
const BASE = { eyeSize: [[0, 0.86]], headY: [[0, 2]] };
const OX = 120, OY = 130, ORX = 86, ORY = 98;                       // the hood's face opening
const kf = (t, pts) => Face.kf(t, pts);
const hash = n => { const x = Math.sin(n * 91.3458) * 47453.5453; return x - Math.floor(x); };
const GLYPHS = '01<>/{}$#%&*+=?';

/* Code rain inside the opening: columns of glyphs falling one or two screens per loop (so the
 * loop is seamless), brightest at the head. `loop` is the animation's duration in seconds. */
function rain(g, t, level, dx, dy, loop, every = 1) {
  for (let k = 0; k < 13; k += every) {                             // every = 2: half the columns (smaller export)
    const x = 42 + k * 13, speed = 260 * (hash(k + 1) > 0.5 ? 2 : 1) / loop, y0 = Math.round((t * speed + hash(k + 7) * 260) % 260) - 10;
    for (let j = 0; j < 7; j++) {
      const y = y0 - j * 11, u = (x - OX - dx) / ORX, v = (y - OY - dy) / ORY;
      if (y < 0 || u * u + v * v > 0.92) continue;
      const ch = GLYPHS[Math.floor(hash(k * 31 + Math.floor((t * speed) / 11) * 7 + j * 3) * GLYPHS.length)];
      const col = j === 0 ? Sim.lerp565(BLACK, GREEN_HI, level) : Sim.lerp565(BLACK, GREEN, level * 0.55 * (1 - j / 7));
      g.text(x, y, ch, col, { size: 10, font: MONO, align: 'center', baseline: 'middle', crisp: true });
    }
  }
}
/* The hood: cloth everywhere outside the face opening, a rim that is thicker at the top, and
 * seams. Drawn row by row over the face, so it also trims the rig's eyelid band. */
const half = (y, cy, rx, ry) => { const v = (y - cy) / ry; return Math.abs(v) > 1 ? -1 : Math.round(rx * Math.sqrt(1 - v * v)); };
function hline(g, x0, x1, y, col) { if (x1 >= x0) g.drawFastHLine(x0, y, x1 - x0 + 1, col); }
function hood(g, dx, dy) {
  const cx = OX + dx, cy = OY + dy;
  for (let y = 0; y < 240; y++) {
    const out = half(y, cy - 4, ORX + 8, ORY + 8), inn = half(y, cy, ORX, ORY);
    if (out < 0) { hline(g, 0, 239, y, HOOD); continue; }
    hline(g, 0, cx - out - 1, y, HOOD); hline(g, cx + out + 1, 239, y, HOOD);
    if (inn < 0) hline(g, cx - out, cx + out, y, HOOD_RIM);
    else { hline(g, cx - out, cx - inn - 1, y, HOOD_RIM); hline(g, cx + inn + 1, cx + out, y, HOOD_RIM); }
  }
  g.drawEllipse(120, 118, 112, 118, HOOD_SEAM);
  g.drawEllipse(120, 118, 111, 117, HOOD_SEAM);
}
function cords(g, dx, dy) {
  for (const s of [-1, 1]) {
    const x = 120 + s * 22 + dx;
    g.fillRect(x - 1, 196 + dy, 3, 26, CORD);
    g.fillRoundRect(x - 3, 218 + dy, 7, 9, 3, Sim.hex('#d0d4da'));
  }
}
function terminal(g, y = 176) {
  g.fillRoundRect(48, y, 144, 52, 7, TERM);
  g.drawRoundRect(48, y, 144, 52, 7, GREEN_DIM);
}
function mono(g, x, y, s, col, size = 11) { g.text(x, y, s, col, { size, font: MONO, baseline: 'middle', crisp: true }); }
function banner(g, text, col, k) {                                   // inverse box across the terminal
  if (k <= 0.02) return;
  const w = Math.round(136 * k);
  g.fillRoundRect(120 - (w >> 1), 181, w, 40, 5, col);
  if (k > 0.9) g.text(120, 201, text, BLACK, { size: 14, weight: 'bold', font: MONO, align: 'center', baseline: 'middle', crisp: true });
}
/* Text typed one character every `rate` seconds from `t0`, with a block cursor while typing. */
function typed(g, x, y, s, t, t0, rate, col, cursor = true) {
  if (t < t0) return;
  const n = Math.min(s.length, Math.floor((t - t0) / rate));
  mono(g, x, y, s.slice(0, n), col);
  if (cursor && n < s.length && Math.floor(t * 6) % 2 === 0) g.fillRect(x + n * 7 + 1, y - 5, 6, 10, GREEN);
}
function rig(name, ms, tracks, hooks, adjust, fps = 15) {
  const s = FaceRig.normalize({ name, theme: 'hacker', fps, duration: ms, colors: COLORS, tracks: Object.assign({}, BASE, tracks) });
  Sim.register({
    name: s.name, theme: s.theme, fps: s.fps, duration: s.duration,
    frame(g, f) {
      const v = FaceRig.valuesAt(s, f.t);
      if (adjust) adjust(v, f.t / 1000, f);
      FaceRig.draw(g, v, f.t, s, hooks, f);
    },
  });
}
const SMUG = (from, to) => ({
  squint: [[0, 0], [from, 0], [from + 200, 0.8, 'pop'], [to, 0.8], [to + 300, 0]],
  mouthCurve: [[0, 0], [from, 0], [from + 150, 0.8], [to, 0.8], [to + 300, 0]],
  mouthWidth: [[0, 12], [from, 12], [from + 200, 22], [to, 22], [to + 300, 12]],
});

// 1. Matrix: code rain all around the face, a cool side-eye, and a glitch now and then.
rig('Hacker: matrix', 4000, {
  lid: [[0, 0.45]], lookX: [[0, -12], [700, -12], [1100, 12], [2300, 12], [2700, -12]],
  mouthCurve: [[0, 0.25]], mouthWidth: [[0, 14]],
  shake: [[0, 0], [1600, 0], [1650, 0.8], [1800, 0], [3300, 0], [3350, 0.6], [3450, 0]],
}, {
  under(g, c) { rain(g, c.t, 1, c.dx, c.dy, 4); },
  over(g, c) {
    hood(g, c.dx, c.dy);
    cords(g, c.dx, c.dy);
    if ((c.t > 1.62 && c.t < 1.8) || (c.t > 3.32 && c.t < 3.45)) {      // glitch bars
      for (let k = 0; k < 4; k++) g.fillRect(30 + ((c.f.i * 13 + k * 29) % 50), 40 + ((c.f.i * 37 + k * 53) % 160), 120, 2 + (k % 2), k % 2 ? GREEN : GREEN_DIM);
    }
  },
}, (v, t) => { if ((t > 1.62 && t < 1.8) || (t > 3.32 && t < 3.45)) v.iris = 10; });

// 2. Typing: ssh, a password, a progress bar, ACCESS GRANTED, and a smirk.
const SSH = '$ ssh root@mainframe', PASS = 'password: ********';
rig('Hacker: typing', 6000, Object.assign({
  lid: [[0, 0.35], [4000, 0.35], [4100, 0]], lookY: [[0, 11], [4000, 11], [4200, 4], [5500, 4], [5800, 11]],
  brows: [[0, 1], [4000, 1], [4100, 0], [5500, 0], [5800, 1]], browTilt: [[0, 6]], browRaise: [[0, 0]],
  mouthWidth: [[0, 12]], mouthCurve: [[0, 0]],
}, SMUG(4100, 5400)), {
  under(g, c) { rain(g, c.t, 0.35, c.dx, c.dy, 6, 2); },
  over(g, c) {
    const t = c.t, clear = kf(t, [[5.5, 0], [5.7, 1]]);
    hood(g, c.dx, c.dy);
    cords(g, c.dx, c.dy);
    terminal(g);
    if (clear < 1) {
      const col = Sim.lerp565(GREEN, TERM, clear);
      typed(g, 56, 188, SSH, t, 0.3, 0.06, col);
      typed(g, 56, 202, PASS, t, 1.8, 0.045, col);
      if (t > 2.8) {
        const p = kf(t, [[2.8, 0], [3.8, 1]]), n = Math.round(10 * p);
        mono(g, 56, 216, '[' + '#'.repeat(n) + '.'.repeat(10 - n) + '] ' + Math.round(100 * p) + '%', col);
      }
      banner(g, 'ACCESS GRANTED', GREEN, kf(t, [[3.95, 0], [4.15, 1], [5.4, 1], [5.55, 0]]));
    } else if (Math.floor(t * 4) % 2 === 0) mono(g, 56, 188, '$', GREEN), g.fillRect(66, 183, 6, 10, GREEN);
  },
}, (v, t, f) => { if (t < 3.9) v.lookX = ((f.i * 7) % 5) * 3 - 6; });   // eyes skitter along the keystrokes

// 3. Denied: wrong twice (red, cross face), right the third time (green, smug).
const TRIES = [0.2, 2.2, 4.2];
rig('Hacker: denied', 6600, Object.assign({
  lid: [[0, 0.3]], lookY: [[0, 10]], mouthWidth: [[0, 12]],
  brows: [[0, 1], [5000, 1], [5100, 0], [6100, 0], [6400, 1]],
  browTilt: [[0, 4], [1100, 4], [1250, 16], [1900, 16], [2100, 4], [3100, 4], [3250, 20], [3900, 20], [4100, 4]],
  mouthCurve: [[0, 0], [1100, 0], [1250, -0.7], [1900, -0.7], [2100, 0], [3100, 0], [3250, -0.9], [3900, -0.9], [4100, 0], [5000, 0]],
  shake: [[0, 0], [1100, 0], [1150, 0.6], [1400, 0], [3100, 0], [3150, 0.9], [3450, 0]],
}, SMUG(5100, 6100)), {
  under(g, c) { rain(g, c.t, 0.3, c.dx, c.dy, 6.6, 2); },
  over(g, c) {
    const t = c.t;
    hood(g, c.dx, c.dy);
    cords(g, c.dx, c.dy);
    terminal(g);
    const k = TRIES.filter(s => t >= s).length - 1, s = TRIES[k];
    typed(g, 56, 188, '$ login root', t, s, 0.04, GREEN, false);
    typed(g, 56, 202, 'password: ' + '*'.repeat(6 + k), t, s + 0.5, 0.05, GREEN);
    if (k < 2) {
      const show = kf(t, [[s + 0.9, 0], [s + 1.0, 1], [s + 1.7, 1], [s + 1.85, 0]]);
      if (Math.floor((t - s) * 8) % 2 === 0 || t > s + 1.4) banner(g, 'ACCESS DENIED', RED, show);
    } else banner(g, 'ACCESS GRANTED', GREEN, kf(t, [[s + 0.9, 0], [s + 1.05, 1], [6.1, 1], [6.3, 0]]));
  },
});
