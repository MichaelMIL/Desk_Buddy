/* Confetti loop: a shower of coloured paper pieces drifts and tumbles down the screen; seamless cycle. */
Sim.register({
  name: 'Confetti loop',
  fps: 25,
  duration: 3000,
  loop: true,

  setup(g, state) {
    // seeded LCG so every piece is deterministic
    let s = 12345;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const cols = [Sim.C.RED, Sim.C.YELLOW, Sim.C.GREEN, Sim.C.CYAN, Sim.C.MAGENTA,
                  Sim.C.ORANGE, Sim.C.PINK, Sim.hex('#44aaff'), Sim.C.GOLD, Sim.C.VIOLET];
    state.pieces = [];
    for (let i = 0; i < 46; i++) {
      state.pieces.push({
        x: 10 + rnd() * 220,          // base x
        phase: rnd(),                 // vertical phase 0..1
        laps: 1 + (rnd() < 0.35 ? 1 : 0), // screen heights per loop (integer -> seamless)
        sway: 8 + rnd() * 14,         // horizontal sway amplitude
        swayN: 1 + ((rnd() * 2) | 0), // sway cycles per loop (integer -> seamless)
        swayPh: rnd(),
        spinN: 2 + ((rnd() * 4) | 0), // tumble cycles per loop
        spinPh: rnd(),
        w: 5 + ((rnd() * 4) | 0),
        h: 3 + ((rnd() * 2) | 0),
        round: rnd() < 0.25,          // some are little dots
        col: cols[(rnd() * cols.length) | 0],
      });
    }
  },

  frame(g, f) {
    g.clear(Sim.C.BLACK);
    const p = f.p, TAU = Math.PI * 2;
    const span = 280; // travel from y = -20 to y = 260

    for (const c of f.state.pieces) {
      const v = (c.phase + p * c.laps) % 1;
      const y = Math.round(-20 + v * span);
      const x = Math.round(c.x + c.sway * Math.sin(TAU * (p * c.swayN + c.swayPh)));
      if (y < -8 || y > 248) continue;

      if (c.round) {
        g.fillCircle(x, y, 2 + (c.h >> 1), c.col);
        continue;
      }

      // tumble: width collapses as the piece turns edge-on, with a slight tilt
      const a = TAU * (p * c.spinN + c.spinPh);
      const hw = Math.max(1, Math.round(c.w * Math.abs(Math.cos(a))));
      const tilt = Math.round(c.h * Math.sin(a) * 0.9);
      const hh = c.h;
      // draw as two triangles (a thin parallelogram) so it looks rotated
      const x0 = x - hw, x1 = x + hw;
      g.fillTriangle(x0, y - hh + tilt, x1, y - hh - tilt, x1, y + hh - tilt, c.col);
      g.fillTriangle(x0, y - hh + tilt, x1, y + hh - tilt, x0, y + hh + tilt, c.col);
    }
  },
});
