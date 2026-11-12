/* Scientist theme (the lab build): goggles up on the forehead and wild white hair.
 * Eureka (thinking in formulas until a light bulb goes on), an experiment that
 * goes poof, and an atom spinning in front of an amazed face. */
const STRAP = Sim.hex('#2f3640'), FRAME = Sim.hex('#6b7682'), LENS = Sim.hex('#8fdcff'), HAIR = Sim.hex('#eceff4');
const BASE = { headY: [[0, 8]], eyeSize: [[0, 0.9]], brows: [[0, 0]] };   // room for the goggles; they hide the brows
const kf = (t, pts) => Face.kf(t, pts);
const lerp = (a, b, k) => a + (b - a) * k;
function popIn(t, t0, t1) {
  const u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))), c = 2.4;
  return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
}

/* Wild hair: puffs on both sides, `fluff` > 1 after an explosion. */
function hair(g, dy, fluff = 1) {
  for (const s of [-1, 1]) {
    for (const [x, y, r] of [[92, -52, 11], [100, -34, 12], [104, -14, 10], [80, -66, 9]]) {
      g.fillCircle(120 + s * x, 112 + dy + y, Math.round(r * fluff), HAIR);
    }
  }
}

/* Goggles: k = 0 up on the forehead, 1 down over the eyes. */
function goggles(g, dx, dy, k) {
  const ey = Face.EY + dy;
  const cy = Math.round(lerp(ey - 56, ey, k)), r = Math.round(lerp(17, 41, k));
  const lx = Math.round(lerp(84, Face.LX, k)) + dx, rx = Math.round(lerp(156, Face.RX, k)) + dx;
  g.fillRect(0, cy - 4, lx - r, 8, STRAP);                       // strap, outside the lenses only
  g.fillRect(rx + r, cy - 4, 240 - rx - r, 8, STRAP);
  if (rx - lx > 2 * r + 4) g.fillRect(lx + r, cy - 3, rx - lx - 2 * r, 6, FRAME);   // bridge
  for (const cx of [lx, rx]) {
    if (k < 0.5) g.fillCircle(cx, cy, r, LENS);
    g.drawArc(cx, cy, r + 4, r, 0, 360, FRAME);
    g.drawArc(cx, cy, r - 3, r - 6, 300, 345, Sim.C.WHITE);       // glint
  }
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

rig('Scientist: eureka', 4000, {
  lookX: [[0, 0], [300, 10], [1900, 10], [2000, 0]],
  lookY: [[0, 0], [300, -8], [1900, -8], [2000, 0]],
  lid: [[0, 0], [300, 0.25], [1900, 0.25], [2000, 0]],
  mouthCurve: [[0, 0.5], [300, 0], [1900, 0], [2000, 1], [3600, 1], [3900, 0.5]],
  mouthWidth: [[0, 22], [300, 8], [1900, 8], [2050, 30, 'pop'], [3600, 30], [3900, 22]],
  mouthOpen: [[0, 0], [1950, 0], [2050, 0.8, 'pop'], [3500, 0.7], [3800, 0]],
  eyeSize: [[0, 0.9], [1950, 0.9], [2100, 1.05, 'pop'], [3500, 1.05], [3800, 0.9]],
  sparkle: [[0, 0], [2000, 0], [2200, 1], [3400, 1], [3700, 0]],
  headX: [[0, 0], [500, -3], [1000, 3], [1500, -3], [1900, 0]],
  bob: [[0, 0], [2000, 0], [2100, 0.5], [3400, 0.5], [3700, 0]],
}, {
  over(g, c) {
    const t = c.t;
    hair(g, c.dy);
    goggles(g, c.dx, c.dy, 0);
    const notes = [['E=mc²', 0.3, 0.9], ['πr²', 0.9, 1.4], ['?', 1.4, 1.95]];
    for (const [s, a, b] of notes) {
      if (t < a || t > b) continue;
      const k = Math.min(1, (t - a) / 0.12, (b - t) / 0.12);
      g.text(120, 24 - Math.round(4 * (t - a) / (b - a)), s, Sim.lerp565(c.bg, Sim.hex('#9fd3ff'), k), { size: s === '?' ? 26 : 20, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
    }
    // the light bulb
    if (t > 1.95 && t < 3.9) {
      const k = t < 3.6 ? popIn(t, 1.95, 2.2) : 1 - kf(t, [[3.6, 0], [3.9, 1]]), r = Math.max(2, Math.round(13 * k));
      const lit = Sim.lerp565(c.bg, Sim.hex('#ffe45c'), Math.min(1, k));
      g.fillCircle(120, 18, r, lit);
      g.fillRect(120 - Math.round(6 * k), 18 + r - 2, Math.round(12 * k) + 1, Math.round(8 * k), Sim.hex('#9aa3ad'));
      if (k > 0.9 && ((t * 8) | 0) % 2) for (const a of [-80, -50, 50, 80]) {
        const s = Math.sin(a * Math.PI / 180), q = -Math.cos(a * Math.PI / 180);
        Hands.capsule(g, 120 + s * 19, 18 + q * 19, 120 + s * 27, 18 + q * 27, 1, Sim.hex('#ffe45c'));
      }
    }
  },
});

rig('Scientist: experiment', 4500, {
  lookX: [[0, 0], [700, 12], [2500, 12], [2600, 0]],
  lookY: [[0, 0], [700, 12], [2500, 12], [2600, 0]],
  lid: [[0, 0], [700, 0.3], [2500, 0.3], [2600, 0]],
  mouthCurve: [[0, 0.5], [700, 0.1], [2500, 0.1], [2600, 0], [3300, 0], [3400, 1], [4100, 1], [4400, 0.5]],
  mouthWidth: [[0, 22], [700, 12], [2500, 12], [2650, 14], [3300, 14], [3400, 30], [4100, 30], [4400, 22]],
  mouthOpen: [[0, 0], [2550, 0], [2650, 0.8, 'pop'], [3300, 0.6], [3400, 0.7], [4100, 0.6], [4400, 0]],
  eyeSize: [[0, 0.9], [2550, 0.9], [2650, 1.05, 'pop'], [3300, 1.05], [3400, 0.9]],
  iris: [[0, 16], [2550, 16], [2650, 10], [3300, 10], [3400, 16]],
  squint: [[0, 0], [3300, 0], [3450, 1, 'pop'], [4100, 1], [4400, 0]],
  shake: [[0, 0], [2550, 0], [2600, 1], [2900, 0]],
}, {
  over(g, c) {
    const t = c.t, fx = 160;
    const poof = kf(t, [[2.55, 0], [2.75, 1], [3.3, 1], [4.0, 0]]);
    hair(g, c.dy, 1 + 0.3 * kf(t, [[2.55, 0], [2.7, 1], [3.6, 1], [4.3, 0]]));
    goggles(g, c.dx, c.dy, kf(t, [[0.2, 0], [0.6, 1], [3.9, 1], [4.3, 0]]));

    // the flask: glass outline, coloured liquid, bubbles
    const glass = Sim.hex('#cfe9ff');
    const mix = kf(t, [[1.0, 0], [2.3, 1], [3.9, 1], [4.4, 0]]);
    const liquid = Sim.lerp565(Sim.hex('#4cd964'), Sim.hex('#b04cff'), mix);
    const hw = y => Math.round(6 + 18 * (y - 186) / 34);
    for (let y = 199; y <= 218; y++) g.drawFastHLine(fx - hw(y) + 3, y, 2 * hw(y) - 5, liquid);
    for (let y = 186; y <= 220; y++) { g.fillRect(fx - hw(y), y, 3, 1, glass); g.fillRect(fx + hw(y) - 2, y, 3, 1, glass); }
    g.fillRect(fx - hw(220), 220, 2 * hw(220) + 1, 3, glass);
    g.fillRect(fx - 7, 168, 3, 18, glass); g.fillRect(fx + 5, 168, 3, 18, glass);
    g.fillRect(fx - 10, 165, 21, 3, glass);
    if (t < 2.6 || t > 3.9) {
      const fast = t > 1.6 && t < 2.6 ? 2 : 1;
      for (let k = 0; k < 4; k++) {
        const u = (t * 0.9 * fast + k / 4) % 1, y = Math.round(212 - 64 * u);
        const x = fx + Math.round((y > 186 ? hw(y) - 8 : 2) * Math.sin(k * 2.1 + u * 6));
        g.fillCircle(x, y, 2 + (k % 2), Sim.lerp565(Sim.C.BLACK, liquid, y < 168 ? 1 - (168 - y) / 22 : 1));
      }
    }
    // poof
    if (poof > 0.02) {
      const grey = Sim.lerp565(c.bg, Sim.hex('#9aa3ad'), poof);
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI * (0.15 + 0.7 * k / 6), d = 10 + 34 * kf(t, [[2.55, 0], [2.9, 1]]);
        g.fillCircle(fx + Math.round(Math.cos(a) * d), 150 + Math.round(Math.sin(a) * d * 0.7), Math.round(8 + 10 * poof) - (k % 2) * 3, grey);
      }
      if (t < 3.2) g.text(196, 92, 'POOF!', Sim.lerp565(c.bg, Sim.hex('#ffb347'), poof), { size: 20, weight: '900', align: 'center', baseline: 'middle', crisp: true });
    }
  },
});

/* The atom: three tilted orbits, electrons going round twice a loop; the eyes follow one. */
const ORBITS = [0, 60, 120].map(d => d * Math.PI / 180);
const ATOM = { x: 120, y: 198, rx: 42, ry: 13 };
function electron(k, t) {
  const a = Math.PI * 2 * (2 * t / 3) + k * 2.1, p = ORBITS[k];
  const ex = ATOM.rx * Math.cos(a), ey = ATOM.ry * Math.sin(a);
  return [ATOM.x + ex * Math.cos(p) - ey * Math.sin(p), ATOM.y + ex * Math.sin(p) + ey * Math.cos(p)];
}
rig('Scientist: atom', 3000, {
  headY: [[0, -10]], eyeSize: [[0, 0.85]],
  mouthCurve: [[0, 0.3]], mouthWidth: [[0, 14]],
  mouthOpen: [[0, 0.35], [1500, 0.5], [3000, 0.35]],
  sparkle: [[0, 0.6]], blush: [[0, 0.3]],
  open: [[0, 1], [1800, 1], [1880, 0], [1960, 1]],
}, {
  over(g, c) {
    hair(g, c.dy);
    goggles(g, c.dx, c.dy, 0);
    const dot = Sim.hex('#7fa8d0');
    for (const p of ORBITS) for (let d = 0; d < 360; d += 10) {
      const a = d * Math.PI / 180, ex = ATOM.rx * Math.cos(a), ey = ATOM.ry * Math.sin(a);
      g.fillRect(Math.round(ATOM.x + ex * Math.cos(p) - ey * Math.sin(p)), Math.round(ATOM.y + ex * Math.sin(p) + ey * Math.cos(p)), 2, 2, dot);
    }
    for (const [x, y, col] of [[-3, -3, '#ff5a5a'], [4, -2, '#5a8cff'], [-2, 4, '#5a8cff'], [4, 4, '#ff5a5a']]) g.fillCircle(ATOM.x + x, ATOM.y + y, 5, Sim.hex(col));
    for (let k = 0; k < 3; k++) { const [x, y] = electron(k, c.t); g.fillCircle(Math.round(x), Math.round(y), 5, Sim.hex('#5ff0ff')); }
  },
}, (v, t) => {   // eyes follow the first electron
  const [x, y] = electron(0, t);
  v.lookX = Math.round((x - ATOM.x) / ATOM.rx * 9);
  v.lookY = Math.round(8 + (y - ATOM.y) / 38 * 4);
});
