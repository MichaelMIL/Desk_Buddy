/* Two cartoon eyes that look around and blink. */
Sim.register({
  name: 'Eyes',
  fps: 30,
  duration: 4000,

  frame(g, f) {
    const C = Sim.C;
    const t = f.t / 1000;
    g.clear(C.BLACK);

    // gaze wanders between a few targets
    const targets = [[0, 0], [14, -4], [-14, 6], [0, 10], [0, 0]];
    const seg = f.p * (targets.length - 1);
    const k = Math.min(targets.length - 2, Math.floor(seg));
    const u = seg - k, e = u * u * (3 - 2 * u); // smoothstep
    const gx = Math.round(targets[k][0] + (targets[k + 1][0] - targets[k][0]) * e);
    const gy = Math.round(targets[k][1] + (targets[k + 1][1] - targets[k][1]) * e);

    // blink: a quick close/open around 2.6 s
    let lid = 1;
    const b = (t - 2.6) / 0.25;
    if (b >= 0 && b <= 1) lid = Math.abs(1 - 2 * b);
    const eyeH = Math.max(2, Math.round(44 * lid));

    for (const cx of [70, 170]) {
      g.fillEllipse(cx, 118, 36, eyeH, C.WHITE);
      if (lid > 0.25) {
        g.fillCircle(cx + gx, 118 + Math.round(gy * lid), Math.round(16 * Math.min(1, lid + 0.3)), Sim.hex('#2a6cff'));
        g.fillCircle(cx + gx, 118 + Math.round(gy * lid), Math.round(8 * Math.min(1, lid + 0.3)), C.BLACK);
        g.fillCircle(cx + gx + 5, 112 + Math.round(gy * lid), 3, C.WHITE);
      }
    }

    // smile
    g.drawArc(120, 150, 34, 29, 110, 250, Sim.hex('#ff4f7a'));
  },
});
