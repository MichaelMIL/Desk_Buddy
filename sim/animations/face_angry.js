/* Angry: brows slam down and slant inward, eyes narrow under heavy lids, a frown,
   red cheeks and a throbbing vein mark; the face trembles, then lets it go. */
Sim.register({
  name: 'Face: angry',
  fps: 30,
  duration: 3000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);

    // 0 calm .. 1 furious; rises quickly, holds, relaxes slowly back to frame 0 pose
    const anger = F.kf(t, [[0.25, 0], [0.5, 1], [2.0, 1], [2.55, 0]]);
    // trembling bursts while angry (deterministic sine wobble)
    const shakeAmt = F.kf(t, [[0.75, 0], [0.85, 1], [1.4, 1], [1.5, 0], [1.6, 1], [1.95, 1], [2.1, 0]]);
    const dx = Math.round(3 * Math.sin(t * Math.PI * 2 * 13) * shakeAmt);
    const dy = Math.round(2 * anger + 1 * Math.sin(t * Math.PI * 2 * 7) * shakeAmt);

    // red cheeks (own colour, not the pink blush)
    if (anger > 0.05) {
      const col = Sim.lerp565(F.BG, Sim.hex('#d8202a'), 0.7 * anger);
      g.fillEllipse(F.LX - 18 + dx, F.EY + 40 + dy, 14, 7, col);
      g.fillEllipse(F.RX + 18 + dx, F.EY + 40 + dy, 14, 7, col);
    }

    // eyes: narrowed by a heavy top lid, pupils converge toward the middle
    const lid = 0.38 * anger;
    const look = Math.round(3 * anger);
    F.eyes(g, { topLid: lid, iris: 15, pupil: 0.55, l: { lookX: look }, r: { lookX: -look } }, dx, dy);

    // brows: pushed down and slanted toward the centre
    const raise = Math.round(4 - 20 * anger);
    const tilt = Math.round(24 * anger);
    F.brow(g, F.LX + dx, F.EY - 32 + dy, raise, tilt, 6);
    F.brow(g, F.RX + dx, F.EY - 32 + dy, raise, -tilt, 6);

    // mouth: flat when calm, deep frown when angry
    if (anger < 0.1) F.flat(g, 120 + dx, F.MY + dy, 22, 5);
    else F.smile(g, 120 + dx, F.MY + 4 + dy, Math.round(22 + 6 * anger), -anger, 6);

    // throbbing anger vein mark, top right
    if (anger > 0.9) {
      const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 3);
      const r = 11 + Math.round(3 * pulse), cx = 196 + dx, cy = 58 + dy;
      const col = Sim.lerp565(Sim.hex('#ff2a3a'), Sim.C.WHITE, 0.3 * pulse);
      for (let k = 0; k < 4; k++) {
        const a = k * 90 + 45;
        g.drawArc(cx, cy, r, r - 4, a - 32, a + 32, col);
      }
    }
  },
});
