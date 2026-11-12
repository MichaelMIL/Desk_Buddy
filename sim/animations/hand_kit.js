/*
 * hand_kit.js - cartoon hands for gesture animations (wave, knock, stop, the
 * finger). Exposes window.Hands. Loaded after face_lib.js (see index.js).
 *
 *   Hands.draw(g, Hands.OPEN, x, y, { scale: 0.8, angle: -20, flip: true, cuff: true });
 *
 * (x, y) is the wrist; the hand points up (angle 0), `angle` turns it clockwise
 * in degrees around the wrist, `flip` mirrors it into a left hand. A pose is a
 * list of capsules (thick lines with round ends) [ax, ay, bx, by, radius, layer]
 * in a hand about 100 px tall. Each layer draws its outlines, then its fills,
 * so parts of one layer merge into one shape and a later layer sits on top
 * with an outline (folded fingers over a fist). Layer 'cover' is fill only,
 * drawn last (hides outline arcs where fingers join the palm); 'nail' and
 * 'line' are details. Integer primitives only, so it matches the device.
 */
window.Hands = (() => {
  const SKIN = Sim.hex('#ffc83d'), EDGE = Sim.hex('#9a5b12'), NAIL = Sim.hex('#ffe7a3'), CUFF = Sim.C.WHITE;

  /** Filled capsule from (x0, y0) to (x1, y1), radius r. */
  function capsule(g, x0, y0, x1, y1, r, col) {
    r = Math.max(1, Math.round(r));
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    g.fillCircle(x0, y0, r, col);
    if (x0 === x1 && y0 === y1) return;
    g.fillCircle(x1, y1, r, col);
    const len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len * r, ny = (x1 - x0) / len * r;
    const a = [Math.round(x0 + nx), Math.round(y0 + ny)], b = [Math.round(x1 + nx), Math.round(y1 + ny)];
    const c = [Math.round(x1 - nx), Math.round(y1 - ny)], d = [Math.round(x0 - nx), Math.round(y0 - ny)];
    g.fillTriangle(a[0], a[1], b[0], b[1], c[0], c[1], col);
    g.fillTriangle(a[0], a[1], c[0], c[1], d[0], d[1], col);
  }

  // ---- poses (right hand, wrist at 0,0, fingers up) ------------------------
  const PALM = [[-10, -30, 10, -30, 22, 0], [-8, -14, 8, -14, 18, 0]];

  /** Open hand, fingers spread: waving, stretching. */
  const OPEN = [
    ...PALM,
    [-15, -46, -25, -76, 8, 0], [-4, -50, -7, -88, 8, 0], [8, -48, 11, -82, 8, 0], [19, -42, 27, -66, 7, 0],
    [-22, -22, -42, -44, 8, 0],
  ];

  /** Flat palm, fingers together: "stop", "talk to the hand". */
  const FLAT = [
    ...PALM,
    [-15, -50, -16, -80, 7, 1], [9, -50, 10, -81, 7, 1],
    [-3, -52, -3, -88, 7, 2], [20, -44, 21, -70, 6, 2], [-24, -24, -42, -46, 8, 2],
    [-10, -30, 10, -30, 22, 'cover'], [-8, -14, 8, -14, 18, 'cover'],
  ];

  /** Fist seen from the front (knocking). */
  const FIST = [
    [-14, -24, 14, -24, 20, 0], [-12, -10, 12, -10, 16, 0],
    [-21, -44, -21, -32, 8, 1], [7, -46, 7, -32, 8, 1],
    [-7, -46, -7, -32, 8, 2], [21, -42, 21, -30, 8, 2],
    [-28, -20, 2, -26, 8, 3],
  ];

  /** The middle finger, back of the hand. */
  const MIDDLE = [
    [-14, -24, 14, -24, 20, 0], [-12, -10, 12, -10, 16, 0], [0, -40, 0, -96, 9, 0],
    [-27, -40, -17, -45, 9, 1], [17, -45, 27, -40, 9, 1],
    [33, -33, 36, -26, 7, 2], [-34, -30, -31, -12, 8, 2],
    [0, -96, 0, -91, 5, 'nail'],
    [-4, -66, 4, -66, 1, 'line'], [-4, -61, 4, -61, 1, 'line'],
  ];

  /** Thumbs up (for "good job", "done"). */
  const THUMB = [
    [-12, -22, 12, -22, 20, 0], [-10, -8, 10, -8, 16, 0], [-18, -40, -22, -74, 9, 0],
    [4, -42, 22, -40, 8, 1], [6, -28, 24, -26, 8, 2], [6, -14, 22, -12, 7, 1],
    [-20, -74, -21, -70, 5, 'nail'],
  ];

  /**
   * Draw a pose. o: scale (1 = about 100 px tall), angle (degrees, clockwise),
   * flip (mirror: left hand), cuff (white glove cuff at the wrist), skin, edge.
   */
  function draw(g, pose, x, y, o = {}) {
    const s = o.scale ?? 1, a = (o.angle ?? 0) * Math.PI / 180, fl = o.flip ? -1 : 1;
    const ca = Math.cos(a), sa = Math.sin(a);
    const P = (px, py) => { px *= fl * s; py *= s; return [x + px * ca - py * sa, y + px * sa + py * ca]; };
    const skin = o.skin ?? SKIN, edge = o.edge ?? EDGE, e = Math.max(2, Math.round(3 * s));
    const cap = (p, r, col) => { const [ax, ay] = P(p[0], p[1]), [bx, by] = P(p[2], p[3]); capsule(g, ax, ay, bx, by, r, col); };

    if (o.cuff) {
      const c = [-17, 4, 17, 4];
      cap(c, 9 * s + e, edge);
      cap(c, 9 * s, CUFF);
    }
    const layers = [...new Set(pose.map(p => p[5]).filter(l => typeof l === 'number'))].sort((p, q) => p - q);
    for (const l of layers) {
      const parts = pose.filter(p => p[5] === l);
      for (const p of parts) cap(p, p[4] * s + e, edge);
      for (const p of parts) cap(p, p[4] * s, skin);
    }
    for (const p of pose) if (p[5] === 'cover') cap(p, p[4] * s, skin);
    for (const p of pose) if (p[5] === 'nail') { cap(p, p[4] * s + 2, edge); cap(p, p[4] * s, NAIL); }
    for (const p of pose) if (p[5] === 'line') cap(p, Math.max(1, s), edge);
  }

  /** Motion lines: short strokes fanning out from (x, y). */
  function motion(g, x, y, r0, r1, degs, col, w = 3) {
    for (const d of degs) {
      const a = d * Math.PI / 180, sx = Math.sin(a), cy = -Math.cos(a);
      capsule(g, x + sx * r0, y + cy * r0, x + sx * r1, y + cy * r1, w >> 1 || 1, col);
    }
  }

  /** Speech bubble with centred text; tail points at (tx, ty). */
  function bubble(g, cx, cy, w, h, text, o = {}) {
    const fill = o.fill ?? Sim.C.WHITE, ink = o.ink ?? Sim.C.BLACK;
    cx = Math.round(cx); cy = Math.round(cy);
    if (o.tx != null) g.fillTriangle(cx - 8, cy + (h >> 1) - 2, cx + 8, cy + (h >> 1) - 2, Math.round(o.tx), Math.round(o.ty), fill);
    g.fillRoundRect(cx - (w >> 1), cy - (h >> 1), w, h, Math.min(14, h >> 1), fill);
    g.text(cx, cy + 1, text, ink, { size: o.size ?? 20, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
  }

  /** Small deterministic pseudo-random number in 0..1 for an integer seed. */
  const rnd = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

  return { SKIN, EDGE, NAIL, OPEN, FLAT, FIST, MIDDLE, THUMB, capsule, draw, motion, bubble, rnd };
})();
