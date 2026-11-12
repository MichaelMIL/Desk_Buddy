/* Taking a break from work: coffee, a big stretch, the break alarm, a glass of
 * water, a slow breathing exercise. */

const TAU = Math.PI * 2;
function popIn(t, t0, t1) {
  const u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))), c = 2.4;
  return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
}
const label = (g, x, y, s, col, size = 20) =>
  g.text(x, y, s, col, { size, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });

/* Closed, relaxed eyes: a gentle downward curve. */
function restEyes(g, dy) {
  for (const cx of [Face.LX, Face.RX]) g.drawArc(cx, Face.EY + dy - 14, 26, 21, 120, 240, Face.SCLERA);
}

Sim.register({
  name: 'Break: coffee',
  fps: 20,
  duration: 4000,

  frame(g, f) {
    const F = Face, H = Hands, t = f.t / 1000;
    g.clear(F.BG);
    const lift = F.kf(t, [[1.0, 0], [1.4, 1], [2.4, 1], [2.8, 0]]);
    const sip = F.kf(t, [[1.3, 0], [1.5, 1], [2.3, 1], [2.5, 0]]);
    const ahh = F.kf(t, [[2.7, 0], [2.9, 1], [3.5, 1], [3.8, 0]]);
    const mx = Math.round(174 - 26 * lift), my = Math.round(200 - 30 * lift);

    if (sip > 0.5) restEyes(g, 0);
    else F.eyes(g, { lookX: Math.round(8 * (1 - lift) * (1 - ahh)), lookY: Math.round(8 * (1 - lift) * (1 - ahh)), squint: ahh }, 0, 0);
    F.blush(g, Math.max(sip, ahh), 0, 0);
    if (sip > 0.5) F.oMouth(g, 118, F.MY + 2, 6, 5);
    else F.smile(g, 120, F.MY, 22 + Math.round(4 * ahh), 0.5 + 0.5 * ahh, 6);

    // the mug
    const mug = Sim.hex('#2bb3a3'), rim = Sim.hex('#1d7f74');
    g.drawArc(mx + 21, my + 2, 13, 7, 20, 160, mug);                 // handle
    g.fillRoundRect(mx - 21, my - 21, 42, 44, 7, mug);
    g.fillRect(mx - 21, my - 21, 42, 5, rim);
    g.fillEllipse(mx, my - 19, 17, 3, Sim.hex('#5a3418'));
    g.fillRoundRect(mx - 9, my - 4, 18, 14, 3, Sim.hex('#f2f6f8'));    // a little heart label
    g.fillCircle(mx - 3, my + 1, 3, Sim.hex('#ff4f7a')); g.fillCircle(mx + 3, my + 1, 3, Sim.hex('#ff4f7a'));
    g.fillTriangle(mx - 6, my + 2, mx + 6, my + 2, mx, my + 8, Sim.hex('#ff4f7a'));
    // steam while it rests
    if (lift < 0.2) {
      for (let k = 0; k < 3; k++) {
        const u = (t / 1.5 + k / 3) % 1, c = Sim.lerp565(F.BG, Sim.hex('#c8d2dc'), Math.sin(u * Math.PI) * 0.9);
        for (let s = 0; s < 2; s++) g.fillRect(mx - 10 + k * 10 + Math.round(3 * Math.sin(u * 9 + s)), my - 28 - Math.round(12 * u) - s * 6, 3, 5, c);
      }
    }
    if (ahh > 0.05) label(g, 120, 44, 'ahh~', Sim.lerp565(F.BG, Sim.hex('#ffcf7a'), ahh), 26);
  },
});

Sim.register({
  name: 'Break: stretch',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const F = Face, H = Hands, t = f.t / 1000;
    g.clear(F.BG);
    const up = F.kf(t, [[0.1, 0], [0.6, 1], [2.2, 1], [2.7, 0]]);
    const yawn = F.kf(t, [[0.5, 0], [0.95, 1], [1.9, 1], [2.25, 0]]);
    const relax = F.kf(t, [[2.6, 0], [2.8, 1], [3.5, 1], [3.85, 0]]);
    const wig = up > 0.9 ? 6 * Math.sin(TAU * 3 * t) : 0;
    const dy = Math.round(8 * up);

    if (up > 0.4) {
      // squeezed shut: > <
      for (const [cx, s] of [[F.LX, 1], [F.RX, -1]]) {
        H.capsule(g, cx - 14 * s, F.EY + dy - 14, cx + 14 * s, F.EY + dy, 3, F.SCLERA);
        H.capsule(g, cx + 14 * s, F.EY + dy, cx - 14 * s, F.EY + dy + 14, 3, F.SCLERA);
      }
      if (yawn > 0.5) g.fillCircle(F.LX - 30, F.EY + dy + 18 + Math.round(6 * (yawn - 0.5)), 4, Sim.hex('#8fd8ff'));
    } else F.eyes(g, { topLid: 0.45 * relax }, 0, dy);
    if (yawn > 0.05) F.oMouth(g, 120, F.MY + dy + 8, Math.round(10 + 6 * yawn), Math.round(6 + 18 * yawn));
    else F.smile(g, 120, F.MY + dy, 22, 0.5 + 0.4 * relax, 6);
    F.blush(g, relax * 0.7, 0, dy);

    if (up > 0.01) {
      const wy = Math.round(320 - 222 * up), s = 0.6;
      H.draw(g, H.OPEN, 50, wy, { scale: s, angle: Math.round(-18 + wig), flip: true, cuff: true });
      H.draw(g, H.OPEN, 190, wy, { scale: s, angle: Math.round(18 - wig), cuff: true });
    }
    if (relax > 0.05) label(g, 120, 214, 'mmmh', Sim.lerp565(F.BG, Sim.hex('#ffcf7a'), relax), 22);
  },
});

Sim.register({
  name: 'Break: time for a break',
  fps: 20,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const ring = F.kf(t, [[0.1, 0], [0.25, 1], [1.9, 1], [2.1, 0]]);
    const jx = ring > 0.5 ? (f.i % 2 ? 3 : -3) : 0;
    const cx = 120 + jx, cy = 46;
    // alarm clock
    const red = Sim.hex('#ff4040'), gold = Sim.hex('#ffc21a');
    for (const s of [-1, 1]) { g.fillCircle(cx + s * 20, cy - 22, 9, gold); g.fillRect(cx + s * 22 - 2, cy + 22, 4, 8, red); }
    g.fillCircle(cx, cy, 27, red);
    g.fillCircle(cx, cy, 21, Sim.C.WHITE);
    Hands.capsule(g, cx, cy, cx, cy - 15, 2, Sim.C.BLACK);
    Hands.capsule(g, cx, cy, cx + 10, cy + 5, 2, Sim.C.BLACK);
    g.fillCircle(cx, cy, 3, red);
    if (ring > 0.5 && (f.i >> 1) % 2) for (const s of [-1, 1]) for (const r of [38, 47]) g.drawArc(120, cy, r, r - 3, s > 0 ? 55 : 275, s > 0 ? 85 : 305, Sim.C.WHITE);

    const dy = 18 + Math.round(-8 * Math.abs(Math.sin(TAU * 2 * t)) * ring);
    F.eyes(g, { rx: 33, ry: 42, iris: 15, lookY: Math.round(-8 * ring) }, 0, dy);
    if (ring > 0.3) F.grin(g, 120, F.MY + dy - 4, 24, 16);
    else F.smile(g, 120, F.MY + dy, 26, 1, 6);
    const k = t < 3.6 ? popIn(t, 0.3, 0.55) : 1 - F.kf(t, [[3.6, 0], [3.85, 1]]);
    if (k > 0.05) label(g, 120, 212, 'BREAK TIME!', Sim.lerp565(F.BG, Sim.hex('#7cf0a8'), Math.min(1, k)), Math.max(8, Math.round(20 * Math.min(1.1, k))));
  },
});

Sim.register({
  name: 'Break: water',
  fps: 20,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const sip = F.kf(t, [[0.6, 0], [0.8, 1], [2.5, 1], [2.7, 0]]);
    const away = F.kf(t, [[2.8, 0], [3.1, 1]]) - F.kf(t, [[3.2, 0], [3.6, 1]]);   // empty glass out, full one in
    const fresh = F.kf(t, [[2.6, 0], [2.8, 1], [3.7, 1], [3.95, 0]]);
    const level0 = t < 3.15 ? Math.round(F.kf(t, [[0.8, 170], [2.5, 196]])) : 170;
    const oy = Math.round(90 * away);
    const gx = 166, top = 160 + oy, bot = 216 + oy, level = level0 + oy, glass = Sim.hex('#b8d8ff'), water = Sim.hex('#3aa0ff');

    if (sip > 0.5) restEyes(g, 0);
    else F.eyes(g, { lookX: Math.round(8 * away), lookY: Math.round(12 * away), squint: fresh * (1 - away) }, 0, 0);
    F.blush(g, Math.max(sip * 0.7, fresh), 0, 0);
    if (sip > 0.5) F.oMouth(g, 128, F.MY + 2, 6, 5);
    else F.smile(g, 120, F.MY, 22 + Math.round(4 * fresh), 0.5 + 0.5 * fresh, 6);

    // water and bubbles, then the glass outline
    g.fillRect(gx - 17, level, 34, bot - level, water);
    for (let k = 0; k < 3; k++) {
      const u = (t / 1.3 + k / 3) % 1, y = Math.round(bot - 6 - (bot - level - 10) * u);
      if (y > level + 3) g.fillCircle(gx - 9 + k * 9, y, 2, Sim.hex('#bfe4ff'));
    }
    g.fillRect(gx - 20, top, 3, bot - top, glass); g.fillRect(gx + 17, top, 3, bot - top, glass); g.fillRect(gx - 20, bot, 40, 3, glass);
    // straw: down into the glass, bent to the mouth while sipping
    const straw = sip > 0.5 ? [132, F.MY + 2] : [150, 140 + oy];
    Hands.capsule(g, gx + 4, bot - 8, gx + 4, 146 + oy, 3, Sim.hex('#ff5a5a'));
    Hands.capsule(g, gx + 4, 146 + oy, straw[0], straw[1], 3, Sim.hex('#ff5a5a'));
    if (sip > 0.5 && ((t * 2) | 0) % 2) label(g, 64, 200, 'glug', Sim.hex('#8fd8ff'), 18);
    if (fresh > 0.5 && away < 0.1) {
      const s = ((t * 6) | 0) % 2;
      for (const [x, y] of [[36, 70], [204, 66]]) { const l = 5 + 2 * s; g.fillRect(x - l, y - 1, 2 * l + 1, 3, Sim.C.SKYBLUE); g.fillRect(x - 1, y - l, 3, 2 * l + 1, Sim.C.SKYBLUE); }
    }
  },
});

/* Breathing exercise: 4 s in, 4 s out. A slow ring around the face, eyes closed. */
Sim.register({
  name: 'Break: breathe',
  fps: 12,
  duration: 8000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const b = 0.5 - 0.5 * Math.cos(TAU * t / 8);           // 0 -> 1 (in) -> 0 (out)
    const r = Math.round(104 + 14 * b), dy = Math.round(-4 * b);
    g.drawArc(120, 120, r, r - 5, 0, 360, Sim.hex('#3fd0c0'));
    restEyes(g, dy);
    F.smile(g, 120, F.MY + dy, 18, 0.4, 5);
    F.blush(g, 0.35, 0, dy);
    const inhale = t < 4, u = (t % 4) / 4, k = Math.min(1, u / 0.15, (1 - u) / 0.15);
    label(g, 120, 196 - Math.round(4 * b), inhale ? 'breathe in' : 'breathe out', Sim.lerp565(F.BG, Sim.hex('#9fe8de'), k), 18);
  },
});
