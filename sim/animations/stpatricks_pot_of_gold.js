/* St Patrick's pot of gold: buddy in its leprechaun hat gazes at a pot of gold; coins burst out spinning in arcs,
   the buddy gasps, its eyes pop into shamrock-stamped gold coins and it bounces with a grin, then settles. 4 s loop. */
Sim.register({
  name: 'StPatricks: pot of gold',
  theme: 'stpatricks',
  category: "St. Patrick's",
  fps: 25,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000, TAU = Math.PI * 2;
    const savedIris = F.IRIS;
    F.IRIS = Sim.hex('#1fae4b');           // lucky green eyes (restored at the end of the frame)
    g.clear(F.BG);

    const GOLD = Sim.hex('#ffd23a'), GOLD_D = Sim.hex('#c98a12'), GOLD_L = Sim.hex('#fff2a8');
    const LEAF = Sim.hex('#1f9e45');

    // ---- timing
    const surprise = F.kf(t, [[0.85, 0], [1.0, 1], [1.25, 1], [1.35, 0]]);
    const coinEye = F.kf(t, [[1.3, 0], [1.45, 1.15], [1.55, 1], [2.7, 1], [2.9, 0]]);
    const excite = Math.min(1, coinEye);
    const blink = F.kf(t, [[0.4, 0], [0.48, 1], [0.56, 0]]);
    const dy = Math.round(-4 * excite * Math.abs(Math.sin(t * TAU * 2)));
    const dx = Math.round(2 * Math.sin(f.p * TAU));

    // ---- face
    const lookY = Math.round(9 * (1 - excite) - 4 * surprise);
    const lookX = Math.round(3 * Math.sin(f.p * TAU * 2) * (1 - excite));
    F.eyes(g, { lookX, lookY, open: (1 - 0.3 * excite) * (1 - 0.95 * blink) + 0.12 * surprise * 0 }, dx, dy);
    F.blush(g, 0.25 + 0.65 * excite, dx, dy);

    if (surprise > 0.5) F.oMouth(g, 120 + dx, F.MY + dy, 10, 12);
    else if (excite > 0.3) F.grin(g, 120 + dx, F.MY - 2 + dy, Math.round(20 + 6 * excite), Math.round(8 + 8 * excite));
    else F.smile(g, 120 + dx, F.MY + dy, 22, 0.5, 5);

    // ---- leprechaun top hat (same as 'lucky hat')
    const HAT = Sim.hex('#138a3d'), HAT_D = Sim.hex('#0c5e29'), HAT_T = Sim.hex('#1fb04f'), BAND = Sim.hex('#1c1c1c');
    const hx = 120 + dx, hy = dy;
    g.fillEllipse(hx, 64 + hy, 60, 6, HAT_D);
    g.fillTriangle(hx - 40, 24 + hy, hx + 40, 24 + hy, hx + 34, 60 + hy, HAT);
    g.fillTriangle(hx - 40, 24 + hy, hx - 34, 60 + hy, hx + 34, 60 + hy, HAT);
    g.fillEllipse(hx, 24 + hy, 40, 5, HAT_T);
    g.fillRect(hx - 36, 47 + hy, 73, 10, BAND);
    g.fillRect(hx - 9, 46 + hy, 19, 12, GOLD);
    g.fillRect(hx - 5, 49 + hy, 11, 6, BAND);

    // ---- coin eyes
    if (coinEye > 0.05) {
      const r = Math.round(30 * coinEye);
      if (r >= 4) {
        for (const ex of [F.LX, F.RX]) {
          const cx = ex + dx, cy = F.EY + dy;
          g.fillCircle(cx, cy, r, GOLD_D);
          g.fillCircle(cx, cy, r - 3, GOLD);
          if (r > 14) {
            g.drawArc(cx, cy, r - 7, r - 10, 0, 360, GOLD_D);
            const lr = Math.round(r * 0.17), lo = Math.round(r * 0.17);
            g.fillCircle(cx, cy - lo, lr, LEAF);                       // tiny shamrock stamp
            g.fillCircle(cx - lo, cy + Math.round(lo * 0.6), lr, LEAF);
            g.fillCircle(cx + lo, cy + Math.round(lo * 0.6), lr, LEAF);
            g.fillRect(cx - 1, cy + lo, 3, Math.round(r * 0.3), LEAF);
          }
          g.fillCircle(cx + Math.round(r * 0.45), cy - Math.round(r * 0.45), Math.max(1, r >> 3), GOLD_L);
        }
      }
    }

    // ---- coins flying out of the pot (all land off-screen before the loop ends)
    for (let k = 0; k < 10; k++) {
      const launch = 0.95 + k * 0.17, T = 0.95;
      const age = t - launch;
      if (age < 0 || age > 1.4) continue;
      const u = age / T;
      const dir = k % 2 === 0 ? -1 : 1;
      const spread = 30 + (k * 37) % 50;
      const H = 95 + (k * 29) % 40;
      const x = Math.round(120 + dir * 8 + dir * spread * u);
      const y = Math.round(192 - 4 * H * u * (1 - u));
      const w = Math.abs(Math.cos(age * 14 + k));
      const rx = Math.max(2, Math.round(7 * w));
      g.fillEllipse(x, y, rx, 7, GOLD_D);
      if (rx > 3) g.fillEllipse(x, y, rx - 2, 5, GOLD);
      if (rx > 4) g.fillCircle(x + 2, y - 2, 1, GOLD_L);
    }

    // ---- pot of gold at the bottom
    const POT = Sim.hex('#30353e'), POT_L = Sim.hex('#4c535f');
    const heap = Math.round(2 * Math.sin(t * TAU * 4) * excite);
    g.fillEllipse(120, 194 - heap, 30, 9, GOLD);
    g.fillCircle(104, 191 - heap, 5, GOLD_D); g.fillCircle(104, 191 - heap, 3, GOLD);
    g.fillCircle(134, 189 - heap, 5, GOLD_D); g.fillCircle(134, 189 - heap, 3, GOLD);
    g.fillCircle(119, 187 - heap, 4, GOLD_L);
    g.fillEllipse(120, 216, 40, 20, POT);
    g.fillRoundRect(80, 195, 81, 8, 4, POT_L);
    g.fillRect(98, 212, 44, 3, POT_L);

    F.IRIS = savedIris;
  },
});
