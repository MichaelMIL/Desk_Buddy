/* In love: irises melt into pulsing hearts, huge grin, blush, gentle sway, little hearts float up on both sides, then eyes close and the buddy blows a kiss (puckered lips, heart puffs out and floats away). */
Sim.register({
  name: 'Face: in love',
  fps: 30,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);

    const HEART = Sim.hex('#ff2f6d');
    const heart = (x, y, r, c) => {       // r = lobe radius; total width ~4r
      g.fillCircle(x - r, y - (r >> 1), r, c);
      g.fillCircle(x + r, y - (r >> 1), r, c);
      g.fillTriangle(x - 2 * r, y - (r >> 1), x + 2 * r, y - (r >> 1), x, y + Math.round(1.5 * r), c);
    };

    // 0 = normal, 1 = smitten
    const love = F.kf(t, [[0.2, 0], [0.6, 1], [3.3, 1], [3.7, 0]]);
    // 0 = grin, 1 = puckered kiss (eyes closed, head leans in)
    const kiss = F.kf(t, [[1.3, 0], [1.6, 1], [2.4, 1], [2.7, 0]]);
    const hs = Math.max(0, (love - 0.4) / 0.6);             // heart-eye scale 0..1
    const beat = 1 + 0.14 * Math.max(0, Math.sin(t * Math.PI * 2 / 0.7)) * hs;
    const dx = Math.round(3 * Math.sin(t * Math.PI * 2 / 1.6) * love + 7 * kiss);
    const dy = Math.round(-3 * Math.abs(Math.sin(t * Math.PI * 2 / 0.8)) * love + 2 * kiss);

    // eyes: iris shrinks away as the hearts grow over it; squeeze shut for the kiss
    const open = (1 - 0.1 * hs) * (1 - 0.93 * kiss);
    F.eyes(g, { iris: Math.round(16 * (1 - hs)) + 2, lookY: 3 * (1 - love), open }, dx, dy);
    if (kiss > 0.85) {
      g.fillRoundRect(F.LX + dx - 26, F.EY + dy - 2, 52, 5, 2, F.SCLERA);
      g.fillRoundRect(F.RX + dx - 26, F.EY + dy - 2, 52, 5, 2, F.SCLERA);
    }
    const hr = Math.round(11 * hs * beat * (1 - kiss));
    if (hs > 0 && hr >= 3) {
      heart(F.LX + dx, F.EY + dy, hr, HEART);
      heart(F.RX + dx, F.EY + dy, hr, HEART);
      // tiny highlight
      g.fillCircle(F.LX + dx - hr + 2, F.EY + dy - hr + 1, Math.max(1, hr >> 2), Sim.C.WHITE);
      g.fillCircle(F.RX + dx - hr + 2, F.EY + dy - hr + 1, Math.max(1, hr >> 2), Sim.C.WHITE);
    }

    F.blush(g, Math.min(1, love + 0.3 * kiss), dx, dy);

    // mouth: smile widens into an open grin, which shrinks into a pucker for the kiss
    const w = Math.round((24 + 16 * love) * (1 - 0.8 * kiss));
    const mx = 120 + dx + Math.round(5 * kiss), my = F.MY + dy - 4;
    if (love < 0.5) {
      F.smile(g, 120 + dx, F.MY + dy, w, 0.5 + love, 6);
    } else if (kiss < 0.5) {
      F.grin(g, mx, my, w, Math.round((4 + 18 * (love - 0.5) * 2) * (1 - 1.2 * kiss)));
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
    for (const t0 of [1.75, 2.1]) {
      const ku = (t - t0) / 0.9;
      if (ku <= 0 || ku >= 1) continue;
      const ease = 1 - (1 - ku) * (1 - ku);
      const x = mx + Math.round(62 * ease);
      const y = my - Math.round(52 * ease) + Math.round(5 * Math.sin(ku * Math.PI * 3));
      const r = 3 + Math.round(7 * Math.min(1, ku * 3));
      const fade = Math.min(1, ku * 5, (1 - ku) * 2.5);
      heart(x, y, r, Sim.lerp565(F.BG, HEART, fade));
      if (fade > 0.6) g.fillCircle(x - r + 1, y - r + 1, Math.max(1, r >> 2), Sim.lerp565(F.BG, Sim.C.WHITE, fade));
    }

    // floating hearts on both sides
    if (love > 0.7) {
      const vis = (love - 0.7) / 0.3;
      const spots = [[40, 0.0, 1], [200, 0.5, -1], [48, 0.25, -1], [192, 0.8, 1]];
      for (const [bx, ph, side] of spots) {
        const u = (t / 1.4 + ph) % 1;                       // 0 bottom .. 1 top
        const y = Math.round(150 - 100 * u);
        const x = bx + Math.round(6 * side * Math.sin(u * Math.PI * 3));
        const fade = Math.min(1, u * 4, (1 - u) * 3) * vis;
        if (fade <= 0.05) continue;
        heart(x, y, 3 + Math.round(2 * u), Sim.lerp565(F.BG, HEART, fade));
      }
    }
  },
});
