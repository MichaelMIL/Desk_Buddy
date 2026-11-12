/* Gamer theme (the headset-with-mic build): a level-up celebration, and full focus mode. */
function headset(g, dy, t, led) {
  const band = Sim.hex('#1e5cff'), cup = Sim.hex('#1a1d26');
  g.drawArc(120, 112 + dy, 110, 100, 240, 360, band);
  g.drawArc(120, 112 + dy, 110, 100, 0, 120, band);
  g.fillRoundRect(2, 88 + dy, 26, 56, 10, cup);
  g.fillRoundRect(212, 88 + dy, 26, 56, 10, cup);
  // mic boom from the left cup towards the mouth
  const mic = Sim.hex('#9aa0aa');
  for (let i = 0; i <= 10; i++) {
    const u = i / 10, x = Math.round(16 + 64 * u), y = Math.round(140 + 30 * Math.sin(u * Math.PI / 2) + dy);
    g.fillCircle(x, y, 2, mic);
  }
  g.fillRoundRect(76, 164 + dy, 16, 11, 5, Sim.hex('#22252e'));
  const c = Sim.lerp565(cup, Sim.hex('#58c8ff'), led);
  g.drawArc(15, 116 + dy, 9, 6, 0, 360, c);
  g.drawArc(225, 116 + dy, 9, 6, 0, 360, c);
}

Sim.register(FaceRig.animation({
  name: 'Gamer: level up', theme: 'gamer', fps: 24, duration: 4000,
  tracks: {
    lid: [[0, 0.35], [1400, 0.35], [1550, 0]],
    lookX: [[0, -6], [500, 6], [1000, -6], [1400, 0]],
    squint: [[0, 0], [1500, 0], [1650, 1, 'pop'], [3400, 1], [3800, 0]],
    mouthCurve: [[0, 0], [1500, 0], [1600, 1]],
    mouthOpen: [[0, 0], [1500, 0], [1650, 0.9, 'pop'], [3400, 0.8], [3800, 0]],
    mouthWidth: [[0, 14], [1500, 14], [1650, 34], [3800, 26]],
    bob: [[0, 0], [1500, 0], [1600, 0.8], [3300, 0.8], [3600, 0]],
    sparkle: [[0, 0], [1550, 0], [1700, 1], [3300, 1], [3600, 0]],
  },
}, {
  over(g, c) {
    headset(g, c.dy, c.t, 0.5 + 0.5 * Math.sin(c.t * 6));
    const show = Face.kf(c.t, [[1.5, 0], [1.65, 1], [3.4, 1], [3.7, 0]]);
    if (show > 0.02) {
      const col = Sim.lerp565(c.bg, Sim.C.YELLOW, show), y = 206 - Math.round(6 * Math.abs(Math.sin(c.t * 8)) * show);
      g.text(120, y, 'LEVEL UP!', col, { size: 19, weight: 'bold', font: 'Arial, Helvetica, sans-serif', align: 'center', baseline: 'middle' });
    }
  },
}));

Sim.register(FaceRig.animation({
  name: 'Gamer: focus', theme: 'gamer', fps: 24, duration: 3000,
  tracks: {
    lid: [[0, 0.42]],
    brows: [[0, 1]],
    browTilt: [[0, 10]],
    browRaise: [[0, 2]],
    lookX: [[0, -12, 'step'], [400, 10, 'step'], [700, -4, 'step'], [1000, 12, 'step'], [1500, -10, 'step'], [1900, 6, 'step'], [2300, -12, 'step'], [2700, 0]],
    lookY: [[0, 6]],
    mouthCurve: [[0, 0]],
    mouthWidth: [[0, 12]],
    shake: [[0, 0], [2200, 0], [2300, 0.4], [2600, 0.4], [2700, 0]],
  },
}, {
  over(g, c) {
    headset(g, c.dy, c.t, (c.t * 4 | 0) % 2);
    // sweat drop sliding down
    const u = (c.t / 1.5) % 1, x = 196 + c.dx, y = 62 + Math.round(30 * u) + c.dy, col = Sim.lerp565(c.bg, Sim.hex('#58c8ff'), 1 - u * 0.6);
    g.fillCircle(x, y, 5, col);
    g.fillTriangle(x - 5, y - 1, x + 5, y - 1, x, y - 11, col);
  },
}));

Sim.register(FaceRig.animation({
  name: 'Gamer: game over', theme: 'gamer', fps: 24, duration: 4000,
  tracks: {
    eyeSize: [[0, 1.15], [600, 1.15], [900, 1]], iris: [[0, 11], [900, 16]], pupil: [[0, 0.3], [900, 0.5]],
    brows: [[0, 1]], browRaise: [[0, 22], [900, 12]], browTilt: [[0, 0], [900, -14]],
    mouthCurve: [[0, 0], [800, 0], [1100, -0.8]], mouthOpen: [[0, 0.6], [800, 0.6], [1000, 0]], mouthWidth: [[0, 18], [1100, 22]],
    lid: [[0, 0], [900, 0], [1200, 0.35]], lookY: [[0, 0], [1000, 8]],
    tears: [[0, 0], [1300, 0], [1600, 0.8]],
  },
}, {
  over(g, c) {
    headset(g, c.dy, c.t, 0);
    const blink = ((c.t * 3) | 0) % 2 === 0;
    if (c.t > 0.3 && (blink || c.t > 2.5)) g.text(120, 206, 'GAME OVER', Sim.hex('#ff3a3a'), { size: 19, weight: 'bold', font: 'Arial, Helvetica, sans-serif', align: 'center', baseline: 'middle' });
  },
}));
