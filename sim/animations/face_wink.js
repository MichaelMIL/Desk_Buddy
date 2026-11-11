/* Wink: the left eye snaps shut for a moment, the mouth pulls up on that side, a small head tilt and blush sell it. */
Sim.register({
  name: 'Face: wink',
  fps: 30,
  duration: 2400,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);

    // 0 = open, 1 = winking. Quick close, short hold, quick open; eases back to the start pose.
    const wink = F.kf(t, [[0.7, 0], [0.85, 1], [1.35, 1], [1.55, 0]]);
    // head dips a little and the look drifts toward the viewer's right while winking
    const dy = Math.round(-3 * wink);
    const dx = Math.round(2 * wink);

    F.eyes(g, {
      lookX: Math.round(4 * wink),
      lookY: Math.round(-2 * wink),
      iris: 17,
      l: { open: 1 - 0.95 * wink },
    }, dx, dy);
    // closed-eye line once the lid is nearly shut
    if (wink > 0.9) g.fillRoundRect(F.LX + dx - 28, F.EY + dy - 2, 56, 5, 2, F.SCLERA);

    // right brow lifts slightly for the cheeky look
    F.brow(g, F.RX + dx, F.EY - 32 + dy, Math.round(5 * wink), Math.round(-6 * wink), 5);

    // mouth: a smile whose left end rises further during the wink (asymmetric arc)
    const r = 28, thick = 6;
    const span = Math.round(46 + 14 * wink);
    const lift = Math.round(26 * wink);              // extra degrees on the left side
    const mx = 120 + dx + Math.round(4 * wink), my = F.MY + dy;
    g.drawArc(mx, my - r + 6, r, r - thick, 180 - span, 180 + span + lift, F.MOUTH);

    F.blush(g, wink, dx, dy);
  },
});
