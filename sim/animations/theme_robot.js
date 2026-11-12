/* Robot theme (the antenna build): a boot-up sequence, and computing with LED eyes and a talking mouth. */
const CYAN = Sim.hex('#58e8ff'), DIM = Sim.hex('#0b2a33'), BG = Sim.hex('#05080c');

function antenna(g, on) {
  g.fillRect(118, 6, 4, 22, Sim.hex('#9aa0aa'));
  g.fillCircle(120, 6, 6, on ? Sim.C.RED : Sim.hex('#4a1010'));
  g.fillRoundRect(104, 26, 32, 8, 3, Sim.hex('#6c727c'));
}

/* LED dot-matrix eye: cols x rows of 5 px dots, only cells inside the shape light up. */
function ledEye(g, cx, cy, shape, look, col = CYAN, dim = DIM) {
  const cols = 9, rows = 7, s = 6;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = cx - (cols * s) / 2 + i * s, y = cy - (rows * s) / 2 + j * s;
    const u = (i - (cols - 1) / 2) / ((cols - 1) / 2), v = (j - (rows - 1) / 2) / ((rows - 1) / 2);
    let on;
    if (shape === 'happy') on = Math.abs(v + 0.35 - 1.05 * Math.abs(u)) < 0.42;                         // ^ chevron
    else if (shape === 'closed') on = Math.abs(v - 0.1) < 0.2;
    else if (shape === 'x') on = Math.abs(u - v) < 0.32 || Math.abs(u + v) < 0.32;
    else on = u * u + v * v < 0.95;                                                                      // round
    const pupil = shape === 'round' && Math.abs(u - look / 4) < 0.3 && Math.abs(v) < 0.4;
    g.fillRect(x, y, 5, 5, on ? (pupil ? Sim.C.WHITE : col) : dim);
  }
}

Sim.register({
  name: 'Robot: boot',
  theme: 'robot',
  fps: 20,
  duration: 5000,

  frame(g, f) {
    const t = f.t / 1000;
    g.clear(BG);
    antenna(g, (t * 3 | 0) % 2 === 0);
    if (t < 1.0) {                                             // scan line sweeps down
      const y = 40 + Math.round(180 * t);
      g.fillRect(20, y, 200, 3, CYAN);
      g.fillRect(20, y - 6, 200, 2, Sim.lerp565(BG, CYAN, 0.4));
    } else if (t < 2.6) {                                      // booting text + progress bar
      const p = Math.min(1, (t - 1.0) / 1.4);
      g.text(120, 104, 'BOOTING', CYAN, { size: 18, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
      g.drawRect(56, 126, 128, 14, CYAN);
      g.fillRect(59, 129, Math.round(122 * p), 8, CYAN);
      g.text(120, 158, Math.round(p * 100) + ' %', Sim.lerp565(BG, CYAN, 0.8), { size: 16, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
    } else {                                                   // awake: blink, then happy
      const shape = t < 3.0 ? 'closed' : t < 3.6 ? 'round' : t < 3.75 ? 'closed' : t < 4.0 ? 'round' : 'happy';
      ledEye(g, 76, 110, shape, Math.round(4 * Math.sin(t * 4)));
      ledEye(g, 164, 110, shape, Math.round(4 * Math.sin(t * 4)));
      const smile = t > 4.0;
      for (let i = 0; i < 9; i++) {
        const x = 96 + i * 6, y = 168 + (smile ? Math.round(6 - 0.3 * (i - 4) * (i - 4)) : 0);
        g.fillRect(x, y, 5, 5, CYAN);
      }
    }
  },
});

Sim.register({
  name: 'Robot: compute',
  theme: 'robot',
  fps: 20,
  duration: 4000,

  frame(g, f) {
    const t = f.t / 1000;
    g.clear(BG);
    // binary rain at the edges
    for (let k = 0; k < 14; k++) {
      const col = k < 7 ? 26 + k * 6 : 214 - (k - 7) * 6, speed = 40 + (k * 13) % 30;
      for (let r = 0; r < 4; r++) {
        const y = Math.round((t * speed + r * 60 + k * 17) % 240);
        const bit = ((k * 7 + r * 3 + (t * 4 | 0)) % 3) ? '1' : '0';
        if (Math.hypot(col - 120, y - 120) < 112) g.text(col, y, bit, Sim.lerp565(BG, Sim.hex('#1f9b5a'), 0.8), { size: 9, align: 'center', baseline: 'middle', crisp: true });
      }
    }
    antenna(g, (t * 6 | 0) % 2 === 0);
    const look = Math.round(4 * Math.sin(t * Math.PI));
    const blink = (t % 2.0) > 1.85;
    ledEye(g, 76, 108, blink ? 'closed' : 'round', look);
    ledEye(g, 164, 108, blink ? 'closed' : 'round', look);
    // talking mouth: LED bars
    for (let i = 0; i < 9; i++) {
      const h = 1 + Math.round(3 * Math.abs(Math.sin(t * 9 + i * 0.9)) * Math.abs(Math.sin(t * 2)));
      for (let j = -h; j <= h; j++) g.fillRect(96 + i * 6, 170 + j * 6, 5, 5, j === 0 ? CYAN : Sim.lerp565(BG, CYAN, 0.7));
    }
  },
});

Sim.register({
  name: 'Robot: error',
  theme: 'robot',
  fps: 20,
  duration: 4000,

  frame(g, f) {
    const t = f.t / 1000, RED = Sim.hex('#ff3a3a'), RDIM = Sim.hex('#330b0b');
    g.clear(BG);
    if (t < 0.8) {                                                 // fine…
      antenna(g, true);
      ledEye(g, 76, 108, 'round', 0); ledEye(g, 164, 108, 'round', 0);
      for (let i = 0; i < 9; i++) g.fillRect(96 + i * 6, 170, 5, 5, CYAN);
    } else if (t < 2.6) {                                          // …until it is not
      const jit = (f.i % 3) - 1;
      // glitch bars
      for (let k = 0; k < 4; k++) {
        const y = ((f.i * 37 + k * 61) % 190) + 25;
        g.fillRect(30 + ((f.i * 13 + k * 29) % 40), y, 140, 2 + (k % 3), Sim.lerp565(BG, k % 2 ? RED : CYAN, 0.5));
      }
      antenna(g, (f.i % 2) === 0);
      if (f.i % 2 === 0) for (let k = 0; k < 4; k++) g.drawLine(120, 6, 120 + Math.round(14 * Math.cos(k * 1.6 + t)), 6 + Math.round(14 * Math.sin(k * 1.6 + t)), Sim.hex('#ffe066'));
      ledEye(g, 76 + jit * 3, 108, 'x', 0, RED, RDIM); ledEye(g, 164 - jit * 3, 108, 'x', 0, RED, RDIM);
      if ((t * 4 | 0) % 2 === 0) g.text(120, 172, 'ERROR', RED, { size: 20, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
    } else if (t < 3.2) {                                          // reboot
      antenna(g, false);
      ledEye(g, 76, 108, 'closed', 0); ledEye(g, 164, 108, 'closed', 0);
      const dots = 1 + ((t * 6 | 0) % 3);
      for (let i = 0; i < dots; i++) g.fillRect(108 + i * 10, 170, 5, 5, CYAN);
    } else {                                                       // back to happy
      antenna(g, true);
      ledEye(g, 76, 108, 'happy', 0); ledEye(g, 164, 108, 'happy', 0);
      for (let i = 0; i < 9; i++) g.fillRect(96 + i * 6, 168 + Math.round(6 - 0.3 * (i - 4) * (i - 4)), 5, 5, CYAN);
    }
  },
});
