/* St Patrick's lucky clover: shamrocks drift down behind the buddy (in its leprechaun hat) while a golden four-leaf
   clover floats down; the buddy tracks it, gasps when it lands, then beams and bounces as the clover glows and
   sparkles before fading away. 4 s seamless loop. */
Sim.register({
  name: 'StPatricks: lucky clover',
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
    const LEAF = Sim.hex('#22b04e'), LEAF_D = Sim.hex('#0d5a26'), LEAF_BG = Sim.hex('#0b4a20');
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    // shamrock: 3 or 4 round leaves around (x, y), s = leaf offset/size
    const shamrock = (x, y, s, col, four, stemCol) => {
      const r = Math.max(2, Math.round(s * 0.55)), o = Math.max(2, Math.round(s * 0.6));
      for (let w = -1; w <= 1; w++) g.drawLine(x + w, y, x + w + Math.round(s * 0.4), y + Math.round(s * 1.1), stemCol);
      const angs = four ? [45, 135, 225, 315] : [-90, 30, 150];
      for (const a of angs) {
        const rad = a * Math.PI / 180;
        g.fillCircle(x + Math.round(Math.cos(rad) * o), y + Math.round(Math.sin(rad) * o), r, col);
      }
      g.fillCircle(x, y, Math.max(1, r >> 1), col);
    };

    // ---- timing
    const fall = F.kf(t, [[0.2, 0], [1.6, 1]]);
    const surprise = F.kf(t, [[1.55, 0], [1.65, 1], [1.9, 1], [2.0, 0]]);
    const joy = F.kf(t, [[1.9, 0], [2.1, 1], [3.3, 1], [3.7, 0]]);
    const vanish = F.kf(t, [[3.3, 0], [3.7, 1]]);
    const endLook = F.kf(t, [[3.5, 0], [3.95, 1]]);
    const blink = F.kf(t, [[0.9, 0], [0.98, 1], [1.06, 0]]);
    const pulse = joy * (0.5 + 0.5 * Math.sin(t * TAU * 3));

    const dy = Math.round(-4 * joy * Math.abs(Math.sin(t * TAU * 2)));
    const dx = Math.round(2 * Math.sin(f.p * TAU));

    // clover path: swings side to side while falling, settles at the bottom centre
    const cx = 120 + Math.round(34 * Math.sin(fall * Math.PI * 2.5) * (1 - fall));
    const cy = Math.round(-20 + 215 * fall);

    // ---- background shamrocks (cyclic in f.p -> seamless)
    for (let k = 0; k < 8; k++) {
      const cycles = 1 + (k % 2);
      const phase = (k * 0.37) % 1;
      const y = Math.round(((phase + f.p * cycles) % 1) * 270 - 15);
      const x = 30 + (k * 53) % 180 + Math.round(8 * Math.sin(f.p * TAU * cycles + k));
      shamrock(x, y, 6 + (k % 3), LEAF_BG, false, LEAF_BG);
    }

    // ---- face
    const trackX = clamp((cx - 120) / 5, -8, 8);
    const trackY = clamp((cy - 112) / 6, -10, 12);
    const lookX = Math.round(trackX * (1 - endLook));
    const lookY = Math.round(trackY + (-10 - trackY) * endLook);
    F.eyes(g, {
      lookX, lookY,
      open: (1 + 0.1 * surprise) * (1 - 0.95 * blink),
      squint: 0.85 * joy,
    }, dx, dy);
    F.blush(g, 0.25 + 0.7 * joy, dx, dy);

    if (surprise > 0.5) F.oMouth(g, 120 + dx, F.MY + dy, 10, 12);
    else if (joy > 0.3) F.grin(g, 120 + dx, F.MY - 4 + dy, Math.round(18 + 8 * joy), Math.round(8 + 7 * joy));
    else F.smile(g, 120 + dx, F.MY + dy, 22, 0.5, 5);

    // ---- leprechaun top hat
    const HAT = Sim.hex('#138a3d'), HAT_D = Sim.hex('#0c5e29'), HAT_T = Sim.hex('#1fb04f'), BAND = Sim.hex('#1c1c1c');
    const hx = 120 + dx, hy = dy;
    g.fillEllipse(hx, 64 + hy, 60, 6, HAT_D);
    g.fillTriangle(hx - 40, 24 + hy, hx + 40, 24 + hy, hx + 34, 60 + hy, HAT);
    g.fillTriangle(hx - 40, 24 + hy, hx - 34, 60 + hy, hx + 34, 60 + hy, HAT);
    g.fillEllipse(hx, 24 + hy, 40, 5, HAT_T);
    g.fillRect(hx - 36, 47 + hy, 73, 10, BAND);
    g.fillRect(hx - 9, 46 + hy, 19, 12, GOLD);
    g.fillRect(hx - 5, 49 + hy, 11, 6, BAND);

    // ---- the golden four-leaf clover
    const s = Math.round((13 + 6 * pulse) * (1 - vanish));
    if (s >= 3 && cy > -30) {
      shamrock(cx, cy, s + 2, GOLD_D, true, GOLD_D);       // golden rim
      shamrock(cx, cy, s, LEAF, true, LEAF_D);
      if (s > 8) g.fillCircle(cx - 2, cy - 2, 2, GOLD_L);  // glint
    }

    // ---- sparkles around the landed clover
    if (joy > 0.05 && vanish < 1) {
      const spots = [[-40, -6], [40, -10], [-30, 14], [32, 14], [-54, 6], [55, 2]];
      for (let j = 0; j < spots.length; j++) {
        const tw = joy * (1 - vanish) * (0.5 + 0.5 * Math.sin(t * TAU * 4 + j * 1.7));
        const len = Math.round(6 * tw);
        if (len < 2) continue;
        const x = 120 + spots[j][0], y = 195 + spots[j][1];
        g.fillRect(x - len, y - 1, 2 * len + 1, 3, GOLD_L);
        g.fillRect(x - 1, y - len, 3, 2 * len + 1, GOLD_L);
      }
    }

    F.IRIS = savedIris;
  },
});
