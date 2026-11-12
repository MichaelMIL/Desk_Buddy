/* Wants your attention: waving "HEY!", puppy eyes, knocking on the glass. */

const TAU = Math.PI * 2;
function popIn(t, t0, t1) {
  const u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))), c = 2.4;
  return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
}

Sim.register({
  name: 'Attention: hey',
  fps: 20,
  duration: 3600,

  frame(g, f) {
    const F = Face, H = Hands, t = f.t / 1000;
    g.clear(F.BG);
    const excite = F.kf(t, [[0.15, 0], [0.4, 1], [2.9, 1], [3.3, 0]]);
    const hand = t < 2.8 ? (t < 0.2 ? 0 : popIn(t, 0.2, 0.55)) : 1 - F.kf(t, [[2.8, 0], [3.2, 1]]);
    const dx = Math.round(-10 * excite), dy = Math.round(-12 * Math.abs(Math.sin(TAU * 1.6 * t)) * excite);

    F.eyes(g, { rx: 33, ry: Math.round(40 + 5 * excite), iris: 15, pupil: 0.45 }, dx, dy);
    F.brow(g, F.LX + dx, F.EY + dy - 32, Math.round(4 + 12 * excite), 0);
    F.brow(g, F.RX + dx, F.EY + dy - 32, Math.round(4 + 12 * excite), 0);
    if (excite > 0.3) F.grin(g, 120 + dx, F.MY + dy - 2, 26, Math.round(6 + 16 * excite));
    else F.smile(g, 120 + dx, F.MY + dy, 22, 0.5, 6);

    if (hand > 0.01) {
      const wave = 24 * Math.sin(TAU * 2.2 * (t - 0.3)) * Math.min(1, excite);
      H.draw(g, H.OPEN, 194, Math.round(330 - 112 * hand), { scale: 0.85, angle: Math.round(-12 + wave), cuff: true });
    }
    if (t > 0.45 && t < 2.9) {
      const k = popIn(t, 0.45, 0.65);
      H.bubble(g, 98, 38, Math.round(92 * k), Math.round(38 * k), k > 0.6 ? 'HEY!' : '', { tx: 108, ty: 66, size: 26 });
    }
  },
});

/* Puppy eyes: the rig draws the face, the hook adds the extra shine and "pls?". */
Sim.register(FaceRig.animation({
  name: 'Attention: puppy eyes', fps: 20, duration: 4000,
  tracks: {
    eyeSize: [[0, 1], [500, 1.22, 'pop'], [3500, 1.22], [3900, 1]],
    iris: [[0, 16], [500, 22], [3500, 22], [3900, 16]],
    pupil: [[0, 0.5], [500, 0.66], [3500, 0.66], [3900, 0.5]],
    brows: [[0, 1]],
    browRaise: [[0, 8], [500, 14], [3500, 14], [3900, 8]],
    browTilt: [[0, 0], [500, -14], [3500, -14], [3900, 0]],
    mouthCurve: [[0, 0.5], [500, -0.4], [3500, -0.4], [3900, 0.5]],
    mouthWidth: [[0, 22], [500, 10], [3500, 10], [3900, 22]],
    blush: [[0, 0], [600, 0.5], [3400, 0.5], [3900, 0]],
    headX: [[0, 0], [1000, -5], [2000, 0], [3000, 5], [4000, 0]],
    headY: [[0, 0], [500, 4], [3500, 4], [3900, 0]],
    open: [[0, 1], [2200, 1], [2280, 0.1], [2360, 1], [2440, 0.1], [2520, 1]],
  },
}, {
  over(g, c) {
    const F = Face, v = c.v;
    if (v.eyeSize < 1.05 || v.open < 0.5) return;
    const ir = Math.round(v.iris * v.eyeSize), tw = (c.f.i >> 1) % 2;
    for (const cx of [F.LX, F.RX]) {
      const px = cx + c.dx + Math.round(v.lookX), py = F.EY + c.dy + Math.round(v.lookY);
      g.fillCircle(px - Math.round(ir / 3), py + Math.round(ir / 3), 4, F.SCLERA);
      g.fillCircle(px + Math.round(ir / 3), py + Math.round(ir / 2) - 2, 2 + tw, F.SCLERA);
    }
    const k = F.kf(c.t, [[1.0, 0], [1.4, 1], [3.3, 1], [3.6, 0]]);
    if (k > 0.02) g.text(120, 210, 'pls?', Sim.lerp565(c.bg, Sim.hex('#ff8fb0'), k), { size: 22, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
  },
}));

Sim.register({
  name: 'Attention: knock knock',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const F = Face, H = Hands, t = f.t / 1000;
    const KNOCKS = [0.7, 0.95, 1.9, 2.15];
    const near = KNOCKS.map(k => Math.max(0, 1 - Math.abs(t - k) / 0.1));
    const bump = Math.max(...near), hitting = KNOCKS.findIndex(k => t >= k && t < k + 0.12);
    const shake = hitting >= 0 ? (f.i % 2 ? 3 : -3) : 0;
    const hand = F.kf(t, [[0.2, 0], [0.5, 1], [2.45, 1], [2.75, 0]]);
    const lean = F.kf(t, [[2.6, 0], [2.9, 1], [3.5, 1], [3.85, 0]]);
    g.clear(F.BG);

    F.eyes(g, { rx: Math.round(32 + 6 * lean), ry: Math.round(40 + 7 * lean), iris: Math.round(16 + 3 * lean), lookX: 0 }, shake, Math.round(-4 * lean));
    F.brow(g, F.LX + shake, F.EY - 32 - Math.round(4 * lean), Math.round(10 + 6 * lean), -4);
    F.brow(g, F.RX + shake, F.EY - 32 - Math.round(4 * lean), Math.round(10 + 6 * lean), 4);
    if (lean > 0.3) F.grin(g, 120, F.MY + 2, 20, 12);
    else F.oMouth(g, 120 + shake, F.MY + 4, 8, Math.round(6 + 4 * bump));

    if (hand > 0.01) {
      const s = 1.5 + 0.35 * bump, wy = Math.round(360 - 98 * hand);
      H.draw(g, H.FIST, 164 + shake, wy, { scale: s, angle: -10, cuff: true });
      if (hitting >= 0) H.motion(g, 156, 202, 48, 62, [-110, -85, -60], Sim.C.WHITE, 4);
    }
    // "KNOCK" for each knock, stacked
    for (let k = 0; k < KNOCKS.length; k++) {
      const u = t - KNOCKS[k];
      if (u < 0 || u > 0.5) continue;
      const col = Sim.lerp565(F.BG, Sim.hex('#ffd23f'), Math.min(1, u / 0.05, (0.5 - u) / 0.1));
      g.text(k % 2 ? 168 : 72, 46, 'KNOCK', col, { size: 24, weight: '900', align: 'center', baseline: 'middle', crisp: true });
    }
    if (lean > 0.3) Hands.bubble(g, 70, 42, 84, 30, 'hello?', { tx: 84, ty: 64, size: 18 });
  },
});
