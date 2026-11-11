/* DJ theme (the headphones build): nodding to the beat with an equaliser, and scratching a record. */
function headphones(g, dy, col) {
  g.drawArc(120, 112 + dy, 110, 100, 240, 480 - 360, col);
  g.drawArc(120, 112 + dy, 110, 100, 240, 360, col); g.drawArc(120, 112 + dy, 110, 100, 0, 120, col);
  g.fillRoundRect(2, 92 + dy, 24, 50, 9, col); g.fillRoundRect(214, 92 + dy, 24, 50, 9, col);
}

Sim.register({
  name: 'DJ: beats',
  theme: 'dj',
  fps: 30,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const beat = Math.pow(Math.abs(Math.sin(t * Math.PI * 2)), 6);   // 120 bpm thump
    const dy = Math.round(-6 * beat);
    // equaliser bars along the bottom
    for (let i = 0; i < 12; i++) {
      const h = Math.round(8 + 30 * Math.abs(Math.sin(t * (3 + i * 0.7) + i)) * (0.5 + beat));
      g.fillRect(36 + i * 14, 236 - h, 10, h, Sim.hsv(200 + i * 12, 0.9, 1));
    }
    const sq = F.kf(t, [[0.9, 0], [1.0, 1], [1.4, 1], [1.5, 0]]);
    F.eyes(g, { squint: sq, lookX: Math.round(6 * Math.sin(t * Math.PI)), iris: 16 }, 0, dy);
    F.smile(g, 120, F.MY + dy, 28, 0.9, 6);
    headphones(g, dy, Sim.hex('#222'));
    g.fillCircle(14, 117 + dy, 5, Sim.lerp565(Sim.hex('#222'), Sim.C.CYAN, beat));
    g.fillCircle(226, 117 + dy, 5, Sim.lerp565(Sim.hex('#222'), Sim.C.CYAN, beat));
  },
});

Sim.register({
  name: 'DJ: scratch',
  theme: 'dj',
  fps: 30,
  duration: 3000,

  frame(g, f) {
    const t = f.t / 1000;
    g.clear(Sim.hex('#101014'));
    // record spins, scratched back and forth at times
    const scratch = Face.kf(t, [[1.0, 0], [1.1, -1], [1.25, 1], [1.4, -0.5], [1.5, 0]]);
    const ang = t * 180 + 60 * scratch;
    g.fillCircle(120, 120, 100, Sim.hex('#1a1a1e'));
    for (let r = 40; r < 96; r += 8) g.drawCircle(120, 120, r, Sim.hex('#2a2a30'));
    g.fillCircle(120, 120, 34, Sim.hex('#e0b02a'));
    g.fillCircle(120, 120, 4, Sim.hex('#101014'));
    // a bright sheen rotating with the record
    g.drawArc(120, 120, 98, 36, ang % 360, (ang + 25) % 360, Sim.hex('#3a3a44'));
    g.drawArc(120, 120, 98, 36, (ang + 180) % 360, (ang + 205) % 360, Sim.hex('#3a3a44'));
    // label face
    const look = Math.round(4 * scratch);
    g.fillCircle(110 + look, 114, 5, Sim.hex('#101014')); g.fillCircle(130 + look, 114, 5, Sim.hex('#101014'));
    g.drawArc(120, 124, 12, 9, 110, 250, Sim.hex('#101014'));
    // tone arm
    g.fillRoundRect(196, 20, 12, 12, 6, Sim.hex('#9aa0aa'));
    const ax = 150 + Math.round(6 * scratch), ay = 90;
    g.drawLine(202, 26, ax, ay, Sim.hex('#9aa0aa')); g.drawLine(203, 26, ax + 1, ay, Sim.hex('#9aa0aa')); g.drawLine(202, 27, ax, ay + 1, Sim.hex('#9aa0aa'));
    g.fillRoundRect(ax - 6, ay - 2, 12, 8, 3, Sim.hex('#c0c6d0'));
    // wub rings when scratching
    if (Math.abs(scratch) > 0.3) for (let k = 0; k < 3; k++) g.drawCircle(120, 120, 104 + k * 6, Sim.lerp565(Sim.hex('#101014'), Sim.C.CYAN, Math.abs(scratch) * (1 - k / 3)));
  },
});
