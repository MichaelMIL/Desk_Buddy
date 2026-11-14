/* Spicy theme: cheeky, grown-up innuendo, nothing explicit. The eyebrow wiggle,
 * the eggplant and the peach, hot and bothered, a "do not disturb" sign that
 * rattles, and "wrap it up". theme 'spicy': on the device they are
 * spicy__<name> and only cycle while the 'spicy' theme is selected, so they stay
 * out of the normal cycle (an office desk); `play spicy__eyebrow_wiggle` shows
 * one any time. */

const HOT = Sim.hex('#ff2a5a');

function heart(g, x, y, s, col) {
  g.fillCircle(x - s, y, s, col);
  g.fillCircle(x + s, y, s, col);
  g.fillTriangle(x - 2 * s, y + Math.round(s * 0.3), x + 2 * s, y + Math.round(s * 0.3), x, y + Math.round(s * 2.6), col);
}

// 0..1 between t0 and t1 with an overshoot at the end (things that pop in)
function popIn(t, t0, t1) {
  const u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))), c = 2.4;
  return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
}

/* Smirk: flat on the left, curling up on the right. */
function smirk(g, cx, cy, amount) {
  const F = Face;
  g.fillRoundRect(cx - 24, cy - 3, 30, 6, 3, F.MOUTH);
  if (amount > 0.05) g.drawArc(cx + 4, cy + 3 - 18, 18, 12, Math.round(180 - 75 * amount), 180, F.MOUTH);
}

/* A sweat drop, point up, (x, y) the middle of its round end. */
function sweat(g, x, y, r, col) {
  g.fillCircle(x, y, r, col);
  g.fillTriangle(x - r, y - 1, x + r, y - 1, x, y - Math.round(r * 2.2), col);
  g.fillCircle(x - (r >> 1), y - (r >> 2), Math.max(1, r >> 2), Sim.C.WHITE);
}

/* Closed happy eye: a crescent line (for a blissful look). */
function bliss(g, cx, cy) {
  g.drawArc(cx, cy + 14, 26, 20, -60, 60, Face.SCLERA);
}

/* The eggplant, centred at (cx, cy), stem towards `deg` (0 = up, clockwise). */
function eggplant(g, cx, cy, deg) {
  const H = Hands, a = deg * Math.PI / 180, ux = Math.sin(a), uy = -Math.cos(a);
  const P = (k, side = 0) => [Math.round(cx + ux * k - uy * side), Math.round(cy + uy * k + ux * side)];
  const EDGE = Sim.hex('#3d1660'), BODY = Sim.hex('#7b3fb0'), SHINE = Sim.hex('#b27be0');
  const GREEN = Sim.hex('#55b33b'), DARKG = Sim.hex('#2f7a22');
  const [bx, by] = P(-10), [tx, ty] = P(12);
  g.fillCircle(bx, by, 17, EDGE); H.capsule(g, bx, by, tx, ty, 12, EDGE);
  g.fillCircle(bx, by, 14, BODY); H.capsule(g, bx, by, tx, ty, 9, BODY);
  const [s0x, s0y] = P(-14, -7), [s1x, s1y] = P(4, -5);
  H.capsule(g, s0x, s0y, s1x, s1y, 2, SHINE);
  // calyx: three leaves over the top, then the stem
  const [cxx, cyy] = P(17);
  for (const side of [-9, 0, 9]) {
    const [lx, ly] = P(11, side);
    H.capsule(g, cxx, cyy, lx, ly, 4, DARKG);
    H.capsule(g, cxx, cyy, lx, ly, 2, GREEN);
  }
  const [s2x, s2y] = P(19), [s3x, s3y] = P(29, 2);
  H.capsule(g, s2x, s2y, s3x, s3y, 3, DARKG);
}

/* The peach, centred at (cx, cy). */
function peach(g, cx, cy) {
  const H = Hands;
  const EDGE = Sim.hex('#b8461f'), BODY = Sim.hex('#ff9a5c'), LIGHT = Sim.hex('#ffc59a'), CLEFT = Sim.hex('#d9602e');
  const GREEN = Sim.hex('#55b33b'), DARKG = Sim.hex('#2f7a22');
  for (const [dx, dy] of [[-7, 0], [7, 0], [0, 4]]) g.fillCircle(cx + dx, cy + dy, 17, EDGE);
  for (const [dx, dy] of [[-7, 0], [7, 0], [0, 4]]) g.fillCircle(cx + dx, cy + dy, 14, BODY);
  g.fillCircle(cx - 11, cy - 3, 6, LIGHT);
  g.fillCircle(cx + 11, cy - 3, 4, LIGHT);
  H.capsule(g, cx, cy - 12, cx - 1, cy - 2, 1, CLEFT);   // the cleft
  H.capsule(g, cx - 1, cy - 2, cx + 1, cy + 8, 1, CLEFT);
  g.fillEllipse(cx - 9, cy - 17, 8, 4, DARKG);           // a leaf and a stub of stem
  g.fillEllipse(cx - 9, cy - 17, 6, 2, GREEN);
  H.capsule(g, cx, cy - 15, cx + 2, cy - 21, 2, DARKG);
}

Sim.register({
  name: 'Spicy: eyebrow wiggle',
  theme: 'spicy',
  fps: 24,
  duration: 3600,

  frame(g, f) {
    const F = Face, H = Hands, t = f.t / 1000;
    g.clear(F.BG);
    const smolder = F.kf(t, [[0.2, 0], [0.6, 1], [3.1, 1], [3.4, 0]]);
    // two quick waggles of the brows: up-down, up-down
    let w = 0;
    for (const t0 of [0.8, 1.9]) if (t > t0 && t < t0 + 0.6) w = Math.sin((t - t0) / 0.3 * 2 * Math.PI);
    const wink = F.kf(t, [[2.7, 0], [2.82, 1], [3.0, 1], [3.12, 0]]);
    const dy = Math.round(-3 * Math.max(0, w));

    F.eyes(g, { topLid: 0.45 * smolder, lookY: Math.round(2 * smolder), l: { open: 1 - 0.95 * wink } }, 0, dy);
    if (wink > 0.9) g.fillRoundRect(F.LX - 26, F.EY + dy - 2, 52, 5, 2, F.SCLERA);
    if (smolder > 0.05) {
      const raise = Math.round(4 * smolder + 11 * Math.max(0, w) - 3 * Math.max(0, -w));
      F.brow(g, F.LX, F.EY + dy - 32, raise, -5 * smolder);
      F.brow(g, F.RX, F.EY + dy - 32, raise, 5 * smolder);
    }
    if (smolder > 0.3) smirk(g, 120, F.MY + dy, smolder);
    else F.smile(g, 120, F.MY + dy, 22, 0.5, 6);
    F.blush(g, 0.6 * smolder + 0.4 * wink, 0, dy);

    if (t > 1.4 && t < 3.0) {
      const k = Math.min(popIn(t, 1.4, 1.6), F.kf(t, [[2.8, 1], [3.0, 0]]));
      H.bubble(g, 124, 204, Math.round(104 * k), Math.round(30 * k), k > 0.6 ? 'heyyy ;)' : '', { tx: 136, ty: 168, size: 20 });
    }
  },
});

Sim.register({
  name: 'Spicy: eggplant and peach',
  theme: 'spicy',
  fps: 20,
  duration: 4800,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    // the fruit come in from both sides, hop together, and leave again
    const inE = F.kf(t, [[0.3, 0], [1.0, 1], [3.9, 1], [4.5, 0]]);
    const inP = F.kf(t, [[1.0, 0], [1.7, 1], [3.9, 1], [4.5, 0]]);
    const close = F.kf(t, [[2.2, 0], [2.6, 1], [3.5, 1], [3.9, 0]]);
    const hopE = t > 0.3 && t < 1.0 ? Math.round(-8 * Math.abs(Math.sin((t - 0.3) / 0.35 * Math.PI))) : 0;
    const hopP = t > 1.0 && t < 1.7 ? Math.round(-8 * Math.abs(Math.sin((t - 1.0) / 0.35 * Math.PI))) : 0;
    const bump = t > 2.55 && t < 3.5 ? Math.round(3 * Math.sin((t - 2.55) * 2 * Math.PI * 4)) : 0;
    const ex = Math.round(-40 + 122 * inE + 20 * close) - Math.abs(bump);
    const px = Math.round(280 - 122 * inP - 20 * close) + Math.abs(bump);

    const look = F.kf(t, [[0.3, 0], [0.55, -14], [1.1, -14], [1.35, 14], [1.8, 14], [2.05, 0]]);
    const down = F.kf(t, [[1.9, 0], [2.15, 1], [3.6, 1], [3.9, 0]]);
    const shock = F.kf(t, [[2.45, 0], [2.6, 1], [3.6, 1], [3.9, 0]]);
    const after = F.kf(t, [[3.8, 0], [4.0, 1], [4.4, 1], [4.7, 0]]);
    const fruit = Math.max(inE, inP);
    const dy = Math.round(-12 * fruit);

    F.eyes(g, { lookX: Math.round(look), lookY: Math.round(10 * down), eyeSize: 1, open: 1, topLid: 0.35 * after }, 0, dy);
    if (shock > 0.05) {
      F.brow(g, F.LX, F.EY + dy - 32, Math.round(6 + 10 * shock), -6 * shock);
      F.brow(g, F.RX, F.EY + dy - 32, Math.round(6 + 10 * shock), 6 * shock);
    }
    F.blush(g, Math.max(shock, 0.5 * after), 0, dy);
    if (shock > 0.3) F.oMouth(g, 120, F.MY + dy, 9, Math.round(6 + 5 * shock));
    else if (after > 0.3) smirk(g, 120, F.MY + dy, after);
    else F.smile(g, 120, F.MY + dy, 22, 0.5, 6);
    if (shock > 0.5) sweat(g, 206, Math.round(80 + 18 * F.kf(t, [[2.7, 0], [3.6, 1]])) + dy, 6, Sim.C.SKYBLUE);

    if (inE > 0.01) eggplant(g, ex, 194 + hopE, 32);
    if (inP > 0.01) peach(g, px, 194 + hopP);

    // hearts burst where they meet
    for (const [k, vx, vy] of [[0, -34, -30], [1, 30, -36], [2, -12, -44], [3, 18, -22]]) {
      const u = (t - 2.6 - k * 0.12) / 0.9;
      if (u <= 0 || u >= 1) continue;
      const fade = Math.min(1, u * 5, (1 - u) * 2.5);
      heart(g, Math.round(120 + vx * u), Math.round(180 + vy * u), 3 + Math.round(3 * Math.min(1, u * 3)), Sim.lerp565(F.BG, HOT, fade));
    }
  },
});

Sim.register({
  name: 'Spicy: hot and bothered',
  theme: 'spicy',
  fps: 20,
  duration: 4000,

  frame(g, f) {
    const F = Face, H = Hands, t = f.t / 1000;
    const heat = F.kf(t, [[0.2, 0], [1.3, 1], [3.2, 1], [3.7, 0]]);
    // the room warms up: a dark red background, in a few steps (small export)
    F.background = Sim.lerp565(Sim.C.BLACK, Sim.hex('#4a0618'), Math.round(heat * 5) / 5);
    g.clear(F.background);

    const pant = heat > 0.6 ? Math.sin(t * 2 * Math.PI * 2.5) : 0;
    const dy = Math.round(2 * pant);
    F.eyes(g, { topLid: 0.4 * heat, lookY: Math.round(-5 * heat), lookX: Math.round(-4 * heat) }, 0, dy);
    if (heat > 0.05) {
      F.brow(g, F.LX, F.EY + dy - 32, Math.round(4 + 6 * heat), -10 * heat);
      F.brow(g, F.RX, F.EY + dy - 32, Math.round(4 + 6 * heat), 10 * heat);
    }
    F.blush(g, heat, 0, dy);
    if (heat > 0.6) F.oMouth(g, 120, F.MY + dy + 2, 10, Math.round(8 + 4 * pant));
    else if (heat > 0.2) F.flat(g, 120, F.MY + dy + 2, 16, 6);
    else F.smile(g, 120, F.MY + dy, 22, 0.5, 6);

    // steam puffs off the top of the head
    if (heat > 0.5) {
      for (let k = 0; k < 4; k++) {
        const u = ((t - 1.0) / 0.9 + k / 4) % 1;
        if (t < 1.0 + (k / 4) * 0.9 || t > 3.4) continue;
        const side = k % 2 ? 1 : -1;
        const x = 120 + side * Math.round(40 + 22 * u), y = Math.round(58 - 30 * u);
        g.fillCircle(x, y, Math.round(5 + 9 * u), Sim.lerp565(F.background, Sim.hex('#e8e8f0'), (1 - u) * 0.85));
      }
    }
    // sweat rolling down
    if (heat > 0.7) sweat(g, 204, Math.round(76 + 26 * ((t - 1.2) % 1.1) / 1.1) + dy, 6, Sim.C.SKYBLUE);
    // fanning itself
    const fan = F.kf(t, [[0.9, 0], [1.2, 1], [3.2, 1], [3.5, 0]]);
    if (fan > 0.01) {
      const ang = Math.round(-38 + 22 * Math.sin(t * 2 * Math.PI * 3));
      H.draw(g, H.OPEN, Math.round(232 - 30 * fan), Math.round(262 - 40 * fan), { scale: 0.7, angle: ang, cuff: true });
      if (fan > 0.9) H.motion(g, 172, 168, 14, 24, [-80, -50, -20], Sim.C.WHITE, 3);
    }
  },
});

Sim.register({
  name: 'Spicy: do not disturb',
  theme: 'spicy',
  fps: 20,
  duration: 5000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    // checking nobody's looking, then the sign comes down over the face
    const peek = F.kf(t, [[0.15, 0], [0.35, -14], [0.6, -14], [0.8, 14], [1.0, 14], [1.15, 0]]);
    const glow = F.kf(t, [[3.7, 0], [3.95, 1], [4.6, 1], [4.9, 0]]);
    const fly = F.kf(t, [[3.3, 0], [3.75, 1]]);
    if (glow > 0.5) { bliss(g, F.LX, F.EY); bliss(g, F.RX, F.EY); }   // eyes closed, blissful
    else F.eyes(g, { lookX: Math.round(peek), squint: 2 * glow }, 0, 0);
    F.blush(g, Math.max(glow, Math.abs(peek) / 28), 0, 0);
    if (glow > 0.3) F.grin(g, 120, F.MY - 4, Math.round(20 + 8 * glow), Math.round(10 + 6 * glow));
    else F.smile(g, 120, F.MY, 22, 0.5, 6);
    if (glow > 0.4) sweat(g, 198, 66 + Math.round(10 * F.kf(t, [[3.9, 0], [4.6, 1]])), 6, Sim.C.SKYBLUE);

    // the door hanger: drops, swings, rattles, then flies off
    if (t > 1.1 && fly < 1) {
      const drop = popIn(t, 1.1, 1.45);
      const swing = t < 2.2 ? Math.round(16 * Math.sin((t - 1.1) * 2 * Math.PI * 1.4) * Math.max(0, 1 - (t - 1.1) / 1.1)) : 0;
      const rattle = t > 1.9 && t < 3.3 ? Math.round(3 * Math.sin((t - 1.9) * 2 * Math.PI * 4)) : 0;
      const cx = 120 + swing + rattle, cy = Math.round(-60 + 172 * drop - 180 * fly) + (rattle ? (f.i % 2 ? 1 : -1) : 0);
      const RED = Sim.hex('#d81b3c'), DARK = Sim.hex('#7a0a1f');
      g.drawLine(120, -10, cx - 6, cy - 46, Sim.C.LIGHTGREY); g.drawLine(121, -10, cx + 6, cy - 46, Sim.C.LIGHTGREY);
      g.fillRoundRect(cx - 66, cy - 52, 132, 104, 16, DARK);
      g.fillRoundRect(cx - 62, cy - 48, 124, 96, 14, RED);
      g.fillCircle(cx, cy - 33, 10, DARK); g.fillCircle(cx, cy - 33, 8, F.BG);
      g.text(cx, cy - 2, 'DO NOT', Sim.C.WHITE, { size: 22, weight: '900', align: 'center', baseline: 'middle', crisp: true });
      g.text(cx, cy + 24, 'DISTURB', Sim.C.WHITE, { size: 22, weight: '900', align: 'center', baseline: 'middle', crisp: true });
      if (rattle) {
        Hands.motion(g, cx - 72, cy + 10, 6, 14, [-120, -90, -60], Sim.C.WHITE, 3);
        Hands.motion(g, cx + 72, cy + 10, 6, 14, [60, 90, 120], Sim.C.WHITE, 3);
      }
      // hearts sneak out from behind it
      for (let k = 0; k < 5; k++) {
        const u = (t - 2.0 - k * 0.25) / 0.9;
        if (u <= 0 || u >= 1 || t > 3.4) continue;
        const side = k % 2 ? 1 : -1;
        const hx = cx + side * Math.round(58 + 24 * u), hy = cy + 40 - Math.round(70 * u) - (k % 3) * 8;
        heart(g, hx, hy, 4 + (k % 2) * 2, Sim.lerp565(F.BG, HOT, Math.min(1, u * 5, (1 - u) * 2.5)));
      }
    }
  },
});

Sim.register({
  name: 'Spicy: wrap it up',
  theme: 'spicy',
  fps: 20,
  duration: 3600,

  frame(g, f) {
    const F = Face, H = Hands, t = f.t / 1000;
    g.clear(F.BG);
    const lean = F.kf(t, [[0.2, 0], [0.5, 1], [3.1, 1], [3.4, 0]]);
    const wink = F.kf(t, [[1.5, 0], [1.62, 1], [1.95, 1], [2.07, 0]]);
    const dx = Math.round(-16 * lean), dy = Math.round(-12 * lean);

    F.eyes(g, { lookX: Math.round(8 * lean), l: { open: 1 - 0.95 * wink } }, dx, dy);
    if (wink > 0.9) g.fillRoundRect(F.LX + dx - 26, F.EY + dy - 2, 52, 5, 2, F.SCLERA);
    F.smile(g, 120 + dx + Math.round(4 * wink), F.MY + dy, 24, 0.6 + 0.4 * wink, 6);
    F.blush(g, 0.4 * lean + 0.6 * wink, dx, dy);

    // the foil packet, crimped edges and the ring pressed into it
    const pk = t < 3.0 ? popIn(t, 0.6, 0.9) : 1 - F.kf(t, [[3.0, 0], [3.3, 1]]);
    if (pk > 0.02) {
      const s = Math.round(26 * pk), cx = 164, cy = 182 + Math.round(3 * Math.sin(t * 2 * Math.PI));
      const FOIL = Sim.hex('#2f9cf0'), DARK = Sim.hex('#1458a0'), LIGHT = Sim.hex('#9ad2ff');
      for (let k = -s; k < s; k += 6) {
        const e = 5;
        g.fillTriangle(cx + k, cy - s, cx + k + 6, cy - s, cx + k + 3, cy - s - e, FOIL);
        g.fillTriangle(cx + k, cy + s, cx + k + 6, cy + s, cx + k + 3, cy + s + e, FOIL);
        g.fillTriangle(cx - s, cy + k, cx - s, cy + k + 6, cx - s - e, cy + k + 3, FOIL);
        g.fillTriangle(cx + s, cy + k, cx + s, cy + k + 6, cx + s + e, cy + k + 3, FOIL);
      }
      g.fillRect(cx - s, cy - s, 2 * s, 2 * s, FOIL);
      if (s > 10) {
        g.drawRect(cx - s + 4, cy - s + 4, 2 * s - 8, 2 * s - 8, DARK);
        const r = Math.round(s * 0.62);
        g.fillCircle(cx, cy, r, DARK); g.fillCircle(cx, cy, r - 4, FOIL);
        g.drawArc(cx, cy, r, r - 3, 290, 350, LIGHT);
        H.capsule(g, cx - s + 8, cy - s + 14, cx - s + 14, cy - s + 8, 1, LIGHT);
      }
    }
    // thumbs up
    const th = t < 3.0 ? (t < 1.0 ? 0 : popIn(t, 1.0, 1.3)) : 1 - F.kf(t, [[3.0, 0], [3.3, 1]]);
    if (th > 0.01) H.draw(g, H.THUMB, 68, Math.round(296 - 62 * th), { scale: 0.75, angle: 8, cuff: true });
    // the message
    if (t > 1.2 && t < 3.2) {
      const k = Math.min(popIn(t, 1.2, 1.4), F.kf(t, [[3.0, 1], [3.2, 0]]));
      g.text(120, 40, 'WRAP IT UP!', Sim.lerp565(F.BG, Sim.C.GOLD, Math.min(1, k)), { size: Math.max(8, Math.round(20 * Math.min(1.15, k))), weight: '900', align: 'center', baseline: 'middle', crisp: true });
    }
  },
});
