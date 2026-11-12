/* St Patrick's lucky hat: buddy in a leprechaun top hat with green eyes watches shamrocks tumble down,
   then grins with crescent eyes while gold sparkles twinkle around; ends with a blink. Seamless 4 s loop. */
Sim.register({
  name: 'StPatricks: lucky hat',
  theme: 'stpatricks',
  category: "St. Patrick's",
  fps: 25,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000, TAU = Math.PI * 2;
    const savedIris = F.IRIS;
    F.IRIS = Sim.hex('#1fae4b');           // lucky green eyes (restored at the end of the frame)
    g.clear(F.BG);

    const LEAF = Sim.hex('#2ad15f'), LEAF_D = Sim.hex('#159a40'), STEM = Sim.hex('#0f7a32');
    const GOLD = Sim.hex('#ffd23a');

    // ---- falling shamrocks (behind the face). One full fall and spin per loop -> seamless.
    const clovers = [
      { x: 34, off: 0.00, s: 9, spin: 1 },
      { x: 204, off: 0.35, s: 11, spin: -1 },
      { x: 62, off: 0.62, s: 8, spin: -1 },
      { x: 180, off: 0.82, s: 8, spin: 1 },
      { x: 120, off: 0.18, s: 10, spin: 1 },
    ];
    for (const c of clovers) {
      const q = (f.p + c.off) % 1;
      const cy = Math.round(q * 290 - 25);
      const cx = Math.round(c.x + 9 * Math.sin(TAU * 2 * (f.p + c.off)));
      const a = (c.spin * 360 * f.p + c.off * 360) * Math.PI / 180;
      // stem
      const sl = c.s * 1.5;
      const ex = Math.round(cx + Math.cos(a + Math.PI / 2) * sl), ey = Math.round(cy + Math.sin(a + Math.PI / 2) * sl);
      for (let o = -1; o <= 1; o++) { g.drawLine(cx + o, cy, ex + o, ey, STEM); g.drawLine(cx, cy + o, ex, ey + o, STEM); }
      // three round leaves
      const lr = Math.max(2, Math.round(c.s * 0.62));
      for (let k = 0; k < 3; k++) {
        const la = a - Math.PI / 2 + k * TAU / 3;
        g.fillCircle(Math.round(cx + Math.cos(la) * c.s * 0.62), Math.round(cy + Math.sin(la) * c.s * 0.62), lr, LEAF);
      }
      g.fillCircle(cx, cy, Math.max(1, Math.round(c.s * 0.25)), LEAF_D);
    }

    // ---- timing
    const happy = F.kf(t, [[1.4, 0], [1.65, 1], [2.7, 1], [2.95, 0]]);
    const blink = F.kf(t, [[3.35, 0], [3.45, 1], [3.55, 0]]);
    const dx = Math.round(3 * Math.sin(f.p * TAU));
    const dy = Math.round(2 * Math.sin(f.p * TAU * 2));

    // ---- face
    const lookX = Math.round(8 * Math.sin(f.p * TAU) * (1 - happy));
    const lookY = Math.round(-7 * (1 - happy));
    F.eyes(g, { lookX, lookY, squint: happy, open: 1 - 0.95 * blink }, dx, dy);
    F.blush(g, 0.3 + 0.6 * happy, dx, dy);

    if (happy > 0.3) F.grin(g, 120 + dx, F.MY - 2 + dy, Math.round(20 + 6 * happy), Math.round(8 + 8 * happy));
    else F.smile(g, 120 + dx, F.MY + dy, 22, 0.5, 5);

    // ---- leprechaun top hat (moves with the head)
    const HAT = Sim.hex('#138a3d'), HAT_D = Sim.hex('#0c5e29'), HAT_T = Sim.hex('#1fb04f'), BAND = Sim.hex('#1c1c1c');
    const hx = 120 + dx, hy = dy;
    g.fillEllipse(hx, 64 + hy, 60, 6, HAT_D);                                   // brim
    g.fillTriangle(hx - 40, 24 + hy, hx + 40, 24 + hy, hx + 34, 60 + hy, HAT);  // crown (flares upward)
    g.fillTriangle(hx - 40, 24 + hy, hx - 34, 60 + hy, hx + 34, 60 + hy, HAT);
    g.fillEllipse(hx, 24 + hy, 40, 5, HAT_T);                                   // top
    g.fillRect(hx - 36, 47 + hy, 73, 10, BAND);                                 // band
    g.fillRect(hx - 9, 46 + hy, 19, 12, GOLD);                                  // buckle
    g.fillRect(hx - 5, 49 + hy, 11, 6, BAND);

    // ---- gold sparkles while grinning
    if (happy > 0.05) {
      const spots = [[48, 54], [192, 50], [40, 168], [200, 170]];
      spots.forEach(([sx, sy], k) => {
        const tw = 0.5 + 0.5 * Math.sin(t * TAU * 3 + k * 1.7);
        const s = Math.round(happy * (3 + 4 * tw));
        if (s < 1) return;
        const x = sx + dx, y = sy + dy;
        g.fillRect(x - s, y - 1, 2 * s + 1, 3, GOLD);
        g.fillRect(x - 1, y - s, 3, 2 * s + 1, GOLD);
      });
    }

    F.IRIS = savedIris;
  },
});
