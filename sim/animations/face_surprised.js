/* Surprised: calm, then eyes pop wide with tiny pupils, brows shoot up, "O" mouth, a shake. */
Sim.register({
  name: 'Face: surprised',
  fps: 30,
  duration: 2800,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);

    const pop = F.kf(t, [[0.35, 0], [0.5, 1], [2.0, 1], [2.35, 0]]);   // 0 calm .. 1 surprised
    const shake = t > 0.45 && t < 1.0 ? Math.round(4 * Math.sin((t - 0.45) * 60) * (1 - (t - 0.45) / 0.55)) : 0;
    const dx = shake;
    const dy = Math.round(-6 * pop);

    // eyes grow, irises shrink, pupils pinpoint
    F.eyes(g, {
      rx: Math.round(32 + 6 * pop), ry: Math.round(40 + 8 * pop),
      iris: Math.round(16 - 6 * pop), pupil: 0.5 - 0.2 * pop,
      lookY: Math.round(3 * (1 - pop)),
    }, dx, dy);

    // eyebrows rise and spread
    const raise = Math.round(8 + 22 * pop);
    F.brow(g, F.LX + dx, F.EY + dy - 32, raise, -6 * pop);
    F.brow(g, F.RX + dx, F.EY + dy - 32, raise, 6 * pop);

    // mouth: flat line opens into an "O"
    if (pop < 0.2) F.flat(g, 120 + dx, F.MY + dy + 2, Math.round(18 - 40 * pop), 4);
    else F.oMouth(g, 120 + dx, F.MY + dy + 6, Math.round(6 + 10 * pop), Math.round(6 + 14 * pop));

    // "!" above the head while surprised
    if (pop > 0.6) {
      const a = Math.min(1, (pop - 0.6) / 0.4), col = Sim.lerp565(F.BG, Sim.C.YELLOW, a);
      const bx = 120 + dx + 48, by = 28 + dy;
      g.fillRoundRect(bx - 3, by, 7, 18, 3, col);
      g.fillCircle(bx, by + 26, 4, col);
    }
  },
});
