/* Bunny theme (the long-ears build): a nose twitch and hop, and munching a carrot. */
function bunnyEars(g, dy, lean, col, inner) {
  for (const s of [-1, 1]) {
    const bx = 120 + s * 34, tx = bx + s * lean;
    g.fillTriangle(bx - 15, 66 + dy, bx + 15, 66 + dy, tx, 14 + dy, col);
    g.fillTriangle(bx - 7, 62 + dy, bx + 7, 62 + dy, tx, 28 + dy, inner);
  }
}
function bunnyFace(g, dy, F, opts) {
  F.eyes(g, { iris: 15, ...opts }, 0, dy);
  g.fillEllipse(120, 150 + dy, 8, 6, Sim.hex('#ff8fa3'));
  g.drawArc(112, 160 + dy, 9, 6, 20, 180, Sim.hex('#8a919c')); g.drawArc(128, 160 + dy, 9, 6, 180, 340, Sim.hex('#8a919c'));
  g.fillRect(113, 164 + dy, 6, 10, Sim.C.WHITE); g.fillRect(121, 164 + dy, 6, 10, Sim.C.WHITE);
}

Sim.register({
  name: 'Bunny: hop',
  theme: 'bunny',
  fps: 30,
  duration: 3000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const hop = Math.abs(Math.sin(f.p * Math.PI * 3));
    const dy = Math.round(-22 * hop);
    const lean = Math.round(12 * (hop - 0.5));
    bunnyEars(g, dy, lean, Sim.hex('#e8e8f0'), Sim.hex('#ffb3c6'));
    const tw = Math.round(2 * Math.sin(t * 30));   // nose twitch
    bunnyFace(g, dy, F, { lookY: Math.round(-3 * hop), open: 1 - 0.3 * hop });
    g.fillEllipse(120 + tw, 150 + dy, 8, 6, Sim.hex('#ff8fa3'));
    // ground shadow
    g.fillEllipse(120, 230, Math.round(50 - 20 * hop), 5, Sim.hex('#2a2e35'));
  },
});

Sim.register({
  name: 'Bunny: carrot',
  theme: 'bunny',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    bunnyEars(g, 0, 0, Sim.hex('#e8e8f0'), Sim.hex('#ffb3c6'));
    const chew = Math.abs(Math.sin(t * 8));
    const sq = F.kf(t, [[0.5, 0], [0.8, 1], [3.2, 1], [3.6, 0]]);
    bunnyFace(g, 0, F, { squint: sq, lookY: 6 });
    // cheeks puff while chewing
    g.fillEllipse(F.LX - 14, 166, 12 + Math.round(4 * chew), 10, Sim.hex('#ffb3c6'));
    g.fillEllipse(F.RX + 14, 166, 12 + Math.round(4 * chew), 10, Sim.hex('#ffb3c6'));
    // carrot gets shorter over the loop
    const len = Math.round(64 - 46 * f.p);
    const cx = 134, cy = 178;
    g.fillTriangle(cx, cy - 10, cx, cy + 10, cx + len, cy + 2, Sim.C.ORANGE);
    for (let i = 1; i < 4; i++) g.drawLine(cx + i * 14, cy - 8 + i, cx + i * 14, cy + 8 - i, Sim.hex('#d96a10'));
    for (let k = -1; k <= 1; k++) g.fillTriangle(cx + len, cy + 2, cx + len + 14, cy - 6 + k * 10, cx + len + 4, cy + 2 + k * 4, Sim.hex('#3e9a3a'));
    // crumbs
    if (chew > 0.8) for (let k = 0; k < 3; k++) g.drawPixel(136 + k * 5, 186 + k * 3, Sim.C.ORANGE);
  },
});

/* One ear at an angle (0 = straight up, + leans right). */
function ear(g, bx, by, ang, len, col, inner) {
  const s = Math.sin(ang), c = Math.cos(ang);
  const tx = bx + Math.round(len * s), ty = by - Math.round(len * c);
  const px = Math.round(15 * c), py = Math.round(15 * s);
  g.fillTriangle(bx - px, by - py, bx + px, by + py, tx, ty, col);
  const ix = Math.round(7 * c), iy = Math.round(7 * s), bx2 = bx + Math.round(4 * s), by2 = by - Math.round(4 * c);
  g.fillTriangle(bx2 - ix, by2 - iy, bx2 + ix, by2 + iy, bx + Math.round((len - 14) * s), by - Math.round((len - 14) * c), inner);
}

Sim.register({
  name: 'Bunny: curious',
  theme: 'bunny',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const white = Sim.hex('#e8e8f0'), pink = Sim.hex('#ffb3c6');
    const flop = F.kf(t, [[0.3, 0], [0.7, 1, 'pop'], [1.8, 1], [2.2, 0]]);       // left ear flops over
    const perk = F.kf(t, [[2.4, 0], [2.6, 1], [3.4, 1], [3.7, 0]]);             // right ear perks up
    ear(g, 86, 66, -0.25 - 0.95 * flop, 52, white, pink);
    ear(g, 154, 66, 0.25 - 0.22 * perk, 52 + Math.round(6 * perk), white, pink);
    const lookX = Math.round(F.kf(t, [[0, 0], [0.8, -12], [1.8, -12], [2.4, 12], [3.4, 12], [3.9, 0]]));
    const lookY = Math.round(F.kf(t, [[0, 0], [0.8, -6], [1.8, -6], [2.4, 0]]));
    bunnyFace(g, 0, F, { lookX, lookY });
    const tw = Math.round(2 * Math.sin(t * 34));                                // sniffing
    g.fillEllipse(120 + tw, 150, 8, 6, Sim.hex('#ff8fa3'));
    if (t > 0.9 && t < 2.1) g.text(lookX < 0 ? 44 : 196, 52, '?', Sim.hex('#ffe14d'), { size: 26, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
  },
});
