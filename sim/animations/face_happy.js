/* Happy: eyes squish into smiling crescents, big grin, blush, gentle bounce. */
Sim.register({
  name: 'Face: happy',
  fps: 30,
  duration: 3000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);

    // bounce while squinting
    const squint = F.kf(t, [[0.3, 0], [0.6, 1], [2.3, 1], [2.7, 0]]);
    const bob = Math.round(-5 * Math.abs(Math.sin(t * Math.PI * 2 / 0.75)) * squint);
    const dy = bob;

    F.eyes(g, { squint, lookY: 4 * (1 - squint), iris: 17 }, 0, dy);
    F.blush(g, squint, 0, dy);

    // closed smile widens, then opens into a grin once the eyes are squinting
    const width = Math.round(26 + 14 * squint);
    if (squint < 0.5) F.smile(g, 120, F.MY + dy, width, 0.6 + 0.8 * squint, 6);
    else F.grin(g, 120, F.MY + dy - 4, width, Math.round(4 + 22 * (squint - 0.5) * 2));

    // small sparkles when fully squinting
    if (squint > 0.95) {
      const s = ((t * 6) | 0) % 2;
      for (const [x, y] of [[34, 66], [206, 62]]) {
        const l = 5 + 2 * s;
        g.fillRect(x - l, y - 1, 2 * l + 1, 3, Sim.C.YELLOW);
        g.fillRect(x - 1, y - l, 3, 2 * l + 1, Sim.C.YELLOW);
      }
    }
  },
});
