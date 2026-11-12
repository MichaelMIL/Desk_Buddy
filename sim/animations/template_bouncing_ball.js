/* Ball bouncing inside the round display, leaving a short trail. */
Sim.register({
  name: 'Template: bouncing ball',
  theme: 'template',   // plays only while the template theme is selected, not in every theme's cycle
  fps: 40,
  frames: 160,

  setup(g, state) {
    state.x = 120; state.y = 80; state.vx = 3.1; state.vy = 0;
    state.trail = [];
  },

  frame(g, f) {
    const s = f.state, R = 10, lim = 120 - R - 2;
    s.vy += 0.35;
    s.x += s.vx; s.y += s.vy;
    // bounce off the circular edge
    const dx = s.x - 120, dy = s.y - 120, d = Math.hypot(dx, dy);
    if (d > lim) {
      const nx = dx / d, ny = dy / d;
      const dot = s.vx * nx + s.vy * ny;
      s.vx -= 2 * dot * nx; s.vy -= 2 * dot * ny;
      s.vx *= 0.98; s.vy *= 0.9;
      s.x = 120 + nx * lim; s.y = 120 + ny * lim;
    }
    s.trail.push([s.x | 0, s.y | 0]);
    if (s.trail.length > 12) s.trail.shift();

    g.clear(Sim.hex('#101828'));
    g.drawCircle(120, 120, 118, Sim.hex('#334'));
    s.trail.forEach(([x, y], i) => g.fillCircle(x, y, 2 + (i * R) / 12 | 0, Sim.lerp565(Sim.hex('#101828'), Sim.C.ORANGE, i / 12)));
    g.fillCircle(s.x | 0, s.y | 0, R, Sim.C.ORANGE);
    g.fillCircle((s.x | 0) - 3, (s.y | 0) - 3, 3, Sim.C.YELLOW);
  },
});
