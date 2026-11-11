/* Loading spinner: only a thin ring changes each frame, so it exports small. */
Sim.register({
  name: 'Spinner',
  fps: 30,
  frames: 30,

  setup(g) {
    g.clear(Sim.C.BLACK);
    g.text(120, 150, 'loading', Sim.C.LIGHTGREY, { size: 18, align: 'center' });
  },

  frame(g, f) {
    const a = f.p * 360;
    g.drawArc(120, 110, 30, 24, 0, 360, Sim.hex('#222'));
    g.drawArc(120, 110, 30, 24, a, a + 90, Sim.C.CYAN);
  },
});
