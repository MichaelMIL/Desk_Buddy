/* Silly faces: blowing a raspberry, cross-eyed, googly eyes, squished on the glass. */

const TAU = Math.PI * 2;
const TONGUE = Sim.hex('#ff7aa0'), TONGUE_LINE = Sim.hex('#d64a78');
const label = (g, x, y, s, col, size = 22) =>
  g.text(x, y, s, col, { size, weight: '900', align: 'center', baseline: 'middle', crisp: true });

Sim.register({
  name: 'Silly: raspberry',
  fps: 24,
  duration: 3200,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const puff = F.kf(t, [[0.2, 0], [0.45, 1], [0.6, 1], [0.7, 0]]);
    const rasp = F.kf(t, [[0.6, 0], [0.72, 1], [2.3, 1], [2.5, 0]]);
    const v = rasp > 0.5 ? (f.i % 2 ? 2 : -2) : 0;

    F.eyes(g, { rx: Math.round(32 + 3 * puff), ry: Math.round(40 + 4 * puff), squint: 0.8 * rasp }, v, 0);
    F.blush(g, Math.max(puff, 0.5 * rasp), v, 0);
    if (puff > 0.3) {
      F.flat(g, 120, F.MY + 2, 10, 6);
      for (const s of [-1, 1]) g.drawArc(120 + s * 40, F.MY - 6, 16, 12, s > 0 ? 20 : 250, s > 0 ? 110 : 340, Sim.lerp565(F.BG, F.BLUSH, puff));
    } else if (rasp > 0.05) {
      F.oMouth(g, 120 + v, F.MY + 2, 24, 9);
      g.fillEllipse(120 + v, F.MY + 16, 13, Math.round(4 + 9 * rasp), TONGUE);
      g.fillRect(119 + v, F.MY + 10, 3, Math.round(10 * rasp), TONGUE_LINE);
      // spit flying out both ways
      for (let k = 0; k < 8; k++) {
        const u = (t * 2.4 + k / 8) % 1, dir = k % 2 ? 1 : -1, sp = 50 + 30 * ((k * 7) % 3) / 2;
        const x = Math.round(120 + dir * (20 + sp * u)), y = Math.round(F.MY + 6 - 34 * u + 70 * u * u);
        if (t > 0.7 && t < 2.4) g.fillCircle(x, y, 2 + (k % 2), Sim.lerp565(F.BG, Sim.hex('#aee8ff'), 1 - u * 0.6));
      }
      label(g, 120 + 2 * v, 40, 'PBBBT!', Sim.lerp565(F.BG, Sim.hex('#ff8fb0'), rasp), 28);
    } else F.smile(g, 120, F.MY, 22, 0.6, 6);
  },
});

Sim.register({
  name: 'Silly: cross-eyed',
  fps: 24,
  duration: 3600,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const cross = F.kf(t, [[0.4, 0], [0.8, 1], [2.8, 1], [3.2, 0]]);
    const tongue = F.kf(t, [[0.9, 0], [1.1, 1], [2.7, 1], [2.9, 0]]);
    const spinning = t > 1.4 && t < 2.6, th = (t - 1.4) / 1.2 * TAU * 2;
    const dx = Math.round(6 * Math.sin(TAU * 1.5 * t) * cross), dy = Math.round(-3 * cross);
    let lx = Math.round(15 * cross), rx = -lx, ly = 2, ry = 2;
    if (spinning) {
      lx = Math.round(10 * Math.sin(th)); ly = Math.round(-10 * Math.cos(th));
      rx = Math.round(-10 * Math.sin(th)); ry = Math.round(-10 * Math.cos(th));
    }
    F.eyes(g, { iris: 14, l: { lookX: lx, lookY: ly }, r: { lookX: rx, lookY: ry } }, dx, dy);
    F.smile(g, 120 + dx, F.MY + dy, 26, 0.5 + 0.4 * cross, 6);
    if (tongue > 0.05) {
      const tx = 134 + dx, ty = F.MY + dy + 10;
      g.fillEllipse(tx, ty + Math.round(4 * tongue), 10, Math.round(4 + 9 * tongue), TONGUE);
      g.fillRect(tx - 1, ty, 3, Math.round(10 * tongue), TONGUE_LINE);
    }
    if (spinning) {   // little stars circling the head
      for (let k = 0; k < 3; k++) {
        const a = th * 0.5 + k * TAU / 3, x = Math.round(120 + 54 * Math.cos(a)), y = Math.round(36 + 12 * Math.sin(a));
        g.fillRect(x - 5, y - 1, 11, 3, Sim.C.YELLOW); g.fillRect(x - 1, y - 5, 3, 11, Sim.C.YELLOW);
      }
    }
  },
});

/* Googly eyes: the pupils lag behind the head as it wobbles (a periodic,
 * hand-tuned "physics" so the loop is seamless). */
Sim.register({
  name: 'Silly: googly eyes',
  fps: 24,
  duration: 3000,

  frame(g, f) {
    const F = Face, t = f.t / 1000, w = TAU / 1.5;
    g.clear(F.BG);
    const hx = Math.round(16 * Math.sin(w * t)), hy = Math.round(5 * Math.sin(2 * w * t));
    const eye = (cx, R, pr, lag) => {
      const m = R - pr - 3;
      let px = m * (-0.9 * Math.sin(w * t - lag) + 0.22 * Math.sin(3 * w * t - 2 * lag));
      let py = m * (0.45 + 0.4 * Math.abs(Math.cos(w * t - lag)) - 0.2 * Math.sin(2 * w * t - lag));
      const d = Math.hypot(px, py);
      if (d > m) { px *= m / d; py *= m / d; }
      g.fillCircle(cx + hx, F.EY + hy, R + 3, Sim.hex('#8a929c'));
      g.fillCircle(cx + hx, F.EY + hy, R, F.SCLERA);
      g.fillCircle(cx + hx + Math.round(px), F.EY + hy + Math.round(py), pr, F.PUPIL);
    };
    eye(F.LX + 2, 40, 16, 0.9);
    eye(F.RX, 30, 12, 1.6);
    F.grin(g, 120 + Math.round(hx * 0.8), F.MY + hy + 2, 28, 20);
    g.fillEllipse(120 + Math.round(hx * 0.8) + 6, F.MY + hy + 16, 11, 6, TONGUE);
  },
});

Sim.register({
  name: 'Silly: squish',
  fps: 24,
  duration: 3600,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const near = F.kf(t, [[0.2, 0], [0.55, 1], [2.0, 1], [2.15, 0]]);
    const squish = F.kf(t, [[0.5, 0], [0.65, 1], [1.95, 1], [2.1, 0]]);
    const back = t > 2.1 && t < 2.5 ? Math.sin((t - 2.1) / 0.4 * Math.PI) : 0;   // springs back too far
    const fog = F.kf(t, [[2.1, 0], [2.25, 1], [2.9, 1], [3.4, 0]]);
    const wob = squish > 0.9 ? Math.round(2 * Math.sin(t * 20)) : 0;

    const spread = Math.round(10 * squish - 6 * back);
    const rx = Math.round(32 + 5 * near + 12 * squish - 6 * back), ry = Math.round(40 + 5 * near - 16 * squish - 6 * back);
    F.eye(g, F.LX - spread, F.EY + 4 * squish, { rx, ry, iris: 16, lookY: 2 });
    F.eye(g, F.RX + spread, F.EY + 4 * squish, { rx, ry, iris: 16, lookY: 2 });
    if (squish > 0.3) {
      g.fillRoundRect(120 - 44 - wob, F.MY + 2, 88 + 2 * wob, 14, 7, F.MOUTH);   // lips flattened on the glass
      g.fillRoundRect(120 - 36 - wob, F.MY + 6, 72 + 2 * wob, 6, 3, F.MOUTH_IN);
      F.blush(g, squish, 0, 4);
      Hands.capsule(g, 36, 70, 60, 46, 2, Sim.hex('#d8e4f0'));                  // glass shine
      Hands.capsule(g, 44, 84, 76, 52, 1, Sim.hex('#d8e4f0'));
    } else if (near > 0.3 && t < 1) F.oMouth(g, 120, F.MY + 4, 10, 10);
    else F.smile(g, 120, F.MY, 22, 0.6, 6);

    // a fogged-up patch is left on the glass, with a smiley drawn in it
    if (fog > 0.02) {
      g.fillEllipse(120, F.MY + 10, 48, 24, Sim.lerp565(F.BG, Sim.hex('#7d8da0'), 0.85 * fog));
      if (t > 2.4 && fog > 0.5) {
        const c = Sim.lerp565(F.BG, Sim.hex('#7d8da0'), 0.3 * fog);
        g.fillCircle(108, F.MY + 2, 3, c); g.fillCircle(132, F.MY + 2, 3, c);
        g.drawArc(120, F.MY + 4, 15, 12, 120, 240, c);
      }
    }
  },
});
