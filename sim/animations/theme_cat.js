/* Cat theme (the cat-ears build): purring with slit pupils, and chasing a ball of yarn. */
function catEars(g, dy, twitch, col, inner) {
  for (const s of [-1, 1]) {
    const bx = 120 + s * 66, tip = 120 + s * 84, tw = s < 0 ? twitch : -twitch;
    g.fillTriangle(bx - s * 26, 58 + dy, bx + s * 14, 62 + dy, tip + tw, 10 + dy, col);
    g.fillTriangle(bx - s * 14, 58 + dy, bx + s * 8, 60 + dy, tip + tw - s * 2, 24 + dy, inner);
  }
}
function whiskers(g, dy, col) {
  for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) {
    g.drawLine(120 + s * 20, 156 + dy + i * 8, 120 + s * 76, 148 + dy + i * 16, col);
  }
}

Sim.register({
  name: 'Cat: purr',
  theme: 'cat',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const purr = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / 2);
    const dy = Math.round(3 * Math.sin(t * 6) * purr);
    const twitch = Math.round(6 * Face.kf(t, [[1.2, 0], [1.3, 1], [1.4, 0], [2.6, 0], [2.7, 1], [2.8, 0]]));
    catEars(g, dy, twitch, Sim.hex('#f2b8c6'), Sim.hex('#ff8fa3'));
    // slit pupils: narrow when content, eyes half closed while purring
    const open = 0.55 + 0.45 * (1 - purr);
    for (const cx of [F.LX, F.RX]) {
      g.fillEllipse(cx, F.EY + dy, 32, Math.max(3, Math.round(40 * open)), Sim.hex('#ffd34d'));
      g.fillEllipse(cx + Math.round(3 * Math.sin(t)), F.EY + dy, Math.max(2, Math.round(6 - 3 * purr)), Math.max(2, Math.round(26 * open)), Sim.hex('#101018'));
    }
    // nose and w-mouth
    g.fillTriangle(112, 146 + dy, 128, 146 + dy, 120, 156 + dy, Sim.hex('#ff8fa3'));
    g.drawArc(110, 164 + dy, 11, 8, 20, 180, F.MOUTH); g.drawArc(130, 164 + dy, 11, 8, 180, 340, F.MOUTH);
    whiskers(g, dy, Sim.hex('#8a919c'));
    // purr marks
    if (purr > 0.6) for (let k = 0; k < 3; k++) g.drawArc(200, 60 + k * 2, 14 + k * 8, 12 + k * 8, 20, 90, Sim.lerp565(F.BG, Sim.hex('#ff8fa3'), (purr - 0.6) / 0.4));
  },
});

Sim.register({
  name: 'Cat: yarn',
  theme: 'cat',
  fps: 30,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    // yarn ball bounces along the bottom; the eyes follow it
    const bx = 120 + Math.round(90 * Math.sin(f.p * Math.PI * 2)), by = 206 - Math.round(26 * Math.abs(Math.sin(f.p * Math.PI * 6)));
    const lookX = Math.round((bx - 120) / 8), lookY = 8;
    catEars(g, 0, 0, Sim.hex('#f2b8c6'), Sim.hex('#ff8fa3'));
    for (const cx of [F.LX, F.RX]) {
      g.fillEllipse(cx, F.EY, 32, 40, Sim.hex('#ffd34d'));
      g.fillEllipse(cx + lookX, F.EY + lookY, 12, 20, Sim.hex('#101018'));
      g.fillCircle(cx + lookX + 4, F.EY + lookY - 8, 3, Sim.C.WHITE);
    }
    g.fillTriangle(112, 146, 128, 146, 120, 156, Sim.hex('#ff8fa3'));
    g.drawArc(110, 164, 11, 8, 20, 180, F.MOUTH); g.drawArc(130, 164, 11, 8, 180, 340, F.MOUTH);
    whiskers(g, 0, Sim.hex('#8a919c'));
    const red = Sim.hex('#e0304a');
    g.fillCircle(bx, by, 16, red);
    const rot = f.p * 720;
    for (let k = 0; k < 3; k++) g.drawArc(bx, by, 15, 12, (rot + k * 120) % 360, (rot + k * 120 + 70) % 360, Sim.hex('#ff8fa3'));
    g.drawLine(bx + 12, by + 10, 236, 216 + Math.round(6 * Math.sin(t * 5)), red);
  },
});
