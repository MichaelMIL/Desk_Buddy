/* Dragon theme (the spikes build): breathing fire, and dozing with smoke rings. */
function spikes(g, dy, col) {
  const tips = [[70, 30], [94, 14], [120, 6], [146, 14], [170, 30]];
  for (const [x, y] of tips) g.fillTriangle(x - 12, y + 22 + dy, x + 12, y + 22 + dy, x, y + dy, col);
}
function nostrils(g, dx, dy) {
  g.fillEllipse(112 + dx, 146 + dy, 3, 2, Sim.hex('#1a2a1a'));
  g.fillEllipse(128 + dx, 146 + dy, 3, 2, Sim.hex('#1a2a1a'));
}

Sim.register(FaceRig.animation({
  name: 'Dragon: fire', theme: 'dragon', fps: 24, duration: 3600,
  colors: { bg: '#071a10', iris: '#ffb000' },
  tracks: {
    eyeSize: [[0, 1], [700, 1.15], [1000, 1]],
    pupil: [[0, 0.3]],
    squint: [[0, 0], [1000, 0], [1100, 0.7], [2600, 0.7], [2900, 0]],
    mouthCurve: [[0, 0.6], [700, 0], [2600, 0], [2900, 0.6]],
    mouthOpen: [[0, 0], [600, 0.2], [1000, 0.9, 'pop'], [2600, 0.9], [2900, 0]],
    mouthWidth: [[0, 24], [1000, 30]],
    headY: [[0, 0], [700, -4], [1000, 4], [2600, 4], [2900, 0]],
  },
}, {
  over(g, c) {
    spikes(g, c.dy, Sim.hex('#ff8a1a'));
    nostrils(g, c.dx, c.dy);
    const fire = Face.kf(c.t, [[1.0, 0], [1.15, 1], [2.5, 1], [2.75, 0]]);
    if (fire > 0.02) {
      const mx = 126 + c.dx, my = 168 + c.dy, ang = 0.45;      // a cone towards the lower right
      const ux = Math.cos(ang), uy = Math.sin(ang);
      for (let k = 0; k < 34; k++) {
        const u = ((c.t * 2.4) + k / 34) % 1;                  // each puff travels out from the mouth
        const along = 112 * u * fire, side = (-1 + 2 * ((k * 7) % 13) / 12) * 24 * u;
        const x = mx + Math.round(along * ux - side * uy), y = my + Math.round(along * uy + side * ux) + Math.round(3 * Math.sin(k + c.t * 20));
        const col = u < 0.25 ? Sim.hex('#fff2a6') : u < 0.5 ? Sim.hex('#ffd23d') : u < 0.75 ? Sim.hex('#ff8a1a') : Sim.hex('#ff3a1a');
        g.fillCircle(x, y, Math.round(3 + 9 * u), Sim.lerp565(c.bg, col, fire * (1 - u * 0.4)));
      }
    }
    // smoke after the blast
    const smoke = Face.kf(c.t, [[2.6, 0], [2.9, 1], [3.5, 0]]);
    if (smoke > 0.02) for (let k = 0; k < 3; k++) g.drawCircle(108 + k * 12, 132 - Math.round(20 * smoke) - k * 6 + c.dy, 4 + k * 2, Sim.lerp565(c.bg, Sim.hex('#9aa0aa'), smoke));
  },
}));

Sim.register(FaceRig.animation({
  name: 'Dragon: sleepy', theme: 'dragon', fps: 20, duration: 4800,
  colors: { bg: '#071a10', iris: '#ffb000' },
  tracks: {
    lid: [[0, 0.75], [2000, 0.9], [2600, 0.9], [2800, 0.55], [3300, 0.8], [4800, 0.75]],
    lookY: [[0, 8]],
    mouthCurve: [[0, 0.3]],
    mouthWidth: [[0, 18]],
    headY: [[0, 0], [2400, 6], [2700, -2], [3200, 2], [4800, 0]],
    zzz: [[0, 1]],
  },
}, {
  over(g, c) {
    spikes(g, c.dy, Sim.hex('#ff8a1a'));
    nostrils(g, c.dx, c.dy);
    // smoke rings drift up from the nostrils with each breath
    for (let k = 0; k < 3; k++) {
      const u = ((c.t / 2.4) + k / 3) % 1;
      const x = 120 + c.dx + Math.round(10 * Math.sin(u * 5 + k)), y = 140 + c.dy - Math.round(60 * u);
      g.drawCircle(x, y, Math.round(3 + 9 * u), Sim.lerp565(c.bg, Sim.hex('#9aa0aa'), 0.9 * (1 - u)));
    }
  },
}));

Sim.register(FaceRig.animation({
  name: 'Dragon: sneeze', theme: 'dragon', fps: 24, duration: 3600,
  colors: { bg: '#071a10', iris: '#ffb000' },
  tracks: {
    lid: [[0, 0], [400, 0.2], [900, 0.45], [1300, 0.7], [1450, 0]],             // ah… ah…
    squint: [[0, 0], [1400, 0], [1450, 1], [1800, 1], [2000, 0]],               // …CHOO
    headY: [[0, 0], [1300, -8], [1450, 10, 'pop'], [1900, 0]],
    mouthCurve: [[0, 0.6], [400, 0], [1450, 0], [2200, 0.6]],
    mouthOpen: [[0, 0], [500, 0.3], [1300, 0.6], [1450, 0.2], [1700, 0]],
    blush: [[0, 0], [2050, 0], [2150, 0.9], [3300, 0.9], [3400, 0]],
    lookX: [[0, 0], [2200, 0], [2500, -10], [3200, -10], [3500, 0]],             // looks away, embarrassed
  },
}, {
  over(g, c) {
    spikes(g, c.dy, Sim.hex('#ff8a1a'));
    nostrils(g, c.dx, c.dy);
    const burst = Face.kf(c.t, [[1.42, 0], [1.9, 1]]);                         // 0..1 as the burst spreads
    if (c.t > 1.42 && c.t < 1.9) {
      for (const nx of [112, 128]) for (let k = 0; k < 7; k++) {
        const a = Math.PI * (0.15 + 0.7 * k / 6) + (nx < 120 ? 0.3 : -0.3), d = 6 + Math.round(36 * burst);
        const col = burst < 0.5 ? (k % 2 ? Sim.hex('#fff2a6') : Sim.hex('#ffd23d')) : (k % 2 ? Sim.hex('#ffb000') : Sim.hex('#ff6a1a'));
        g.fillCircle(nx + c.dx + Math.round(d * Math.cos(a)), 148 + c.dy + Math.round(d * Math.sin(a)), Math.round(6 - 3 * burst), col);
      }
    }
    const smoke = Face.kf(c.t, [[1.9, 0], [2.2, 1], [3.0, 0]]);
    if (smoke > 0.02) for (let k = 0; k < 3; k++) g.drawCircle(104 + k * 16, 150 + c.dy - Math.round(14 * smoke) - k * 4, 5 + k * 2, Sim.lerp565(c.bg, Sim.hex('#9aa0aa'), smoke));
  },
}));
