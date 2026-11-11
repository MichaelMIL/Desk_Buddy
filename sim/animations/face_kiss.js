/* Blow a kiss: eyes squeeze shut, lips pucker and lean in, blush, then a few hearts puff out of the lips and float away before the face settles back to a smile. */
Sim.register({
  name: 'Face: kiss',
  fps: 30,
  duration: 3000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);

    const HEART = Sim.hex('#ff2f6d');
    const heart = (x, y, r, c) => {       // r = lobe radius; total width ~4r
      g.fillCircle(x - r, y - (r >> 1), r, c);
      g.fillCircle(x + r, y - (r >> 1), r, c);
      g.fillTriangle(x - 2 * r, y - (r >> 1), x + 2 * r, y - (r >> 1), x, y + Math.round(1.5 * r), c);
    };

    // 0 = relaxed smile, 1 = puckered kiss (eyes closed, head leans in)
    const kiss = F.kf(t, [[0.3, 0], [0.65, 1], [2.0, 1], [2.4, 0]]);
    const wob = Math.sin(t * Math.PI * 2 / 0.9);          // tiny sway while puckered
    const dx = Math.round(8 * kiss + 2 * wob * kiss);
    const dy = Math.round(3 * kiss);

    // eyes: squeeze shut, slight happy squint on the way
    const open = 1 - 0.93 * kiss;
    F.eyes(g, { open, lookX: 4 * kiss, lookY: 2 * kiss }, dx, dy);
    if (kiss > 0.85) {
      g.fillRoundRect(F.LX + dx - 26, F.EY + dy - 2, 52, 5, 2, F.SCLERA);
      g.fillRoundRect(F.RX + dx - 26, F.EY + dy - 2, 52, 5, 2, F.SCLERA);
    }

    F.blush(g, kiss, dx, dy);

    // mouth: smile shrinks into a pucker
    const mx = 120 + dx + Math.round(6 * kiss), my = F.MY + dy - 2;
    if (kiss < 0.5) {
      F.smile(g, 120 + dx, F.MY + dy, Math.round(28 * (1 - 1.4 * kiss)), 0.7, 6);
    } else {
      // puckered lips: small "o" with a little upper-lip dimple and highlight
      const pk = (kiss - 0.5) * 2;
      const rx = 5 + Math.round(4 * pk), ry = 4 + Math.round(4 * pk);
      F.oMouth(g, mx, my, rx, ry);
      g.fillCircle(mx - (rx >> 1), my - ry + 1, 3, F.MOUTH);
      g.fillCircle(mx + (rx >> 1), my - ry + 1, 3, F.MOUTH);
      g.fillCircle(mx - 2, my - 2, 2, Sim.C.WHITE);
    }

    // blown kisses: hearts puff out of the lips and float up-right
    const puffs = [[0.8, 62, -52], [1.15, 70, -30], [1.5, 55, -66]];
    for (const [t0, tx, ty] of puffs) {
      const ku = (t - t0) / 1.0;
      if (ku <= 0 || ku >= 1) continue;
      const ease = 1 - (1 - ku) * (1 - ku);
      const x = mx + Math.round(tx * ease);
      const y = my + Math.round(ty * ease) + Math.round(5 * Math.sin(ku * Math.PI * 3));
      const r = 3 + Math.round(7 * Math.min(1, ku * 3));
      const fade = Math.min(1, ku * 5, (1 - ku) * 2.5);
      heart(x, y, r, Sim.lerp565(F.BG, HEART, fade));
      if (fade > 0.6) g.fillCircle(x - r + 1, y - r + 1, Math.max(1, r >> 2), Sim.lerp565(F.BG, Sim.C.WHITE, fade));
    }
  },
});
