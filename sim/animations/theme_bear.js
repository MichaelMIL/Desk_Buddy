/* Bear theme (the round-ears build): licking honey, and a big roar. */
function bearEars(g, dy, col, inner) {
  for (const s of [-1, 1]) { g.fillCircle(120 + s * 72, 46 + dy, 24, col); g.fillCircle(120 + s * 72, 46 + dy, 13, inner); }
}

Sim.register({
  name: 'Bear: honey',
  theme: 'bear',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const brown = Sim.hex('#8b5a2b'), light = Sim.hex('#c9955a');
    const dy = Math.round(3 * Math.sin(t * 2));
    bearEars(g, dy, brown, light);
    const sq = F.kf(t, [[1.2, 0], [1.5, 1], [3.0, 1], [3.4, 0]]);   // happy squint while licking
    F.eyes(g, { squint: sq, iris: 15, rx: 28, ry: 34 }, 0, dy - 4);
    g.fillEllipse(120, 152 + dy, 30, 22, light);
    g.fillEllipse(120, 142 + dy, 10, 7, Sim.hex('#101018'));
    // tongue licks in a circle
    const lick = F.kf(t, [[1.3, 0], [1.6, 1], [2.9, 1], [3.3, 0]]);
    if (lick > 0.05) {
      const a = t * 6, tx = 120 + Math.round(10 * Math.cos(a) * lick), ty = 160 + dy + Math.round(8 * Math.sin(a) * lick);
      g.fillEllipse(tx, ty, Math.round(7 * lick) + 1, Math.round(10 * lick) + 1, F.MOUTH);
    } else g.drawArc(120, 158 + dy, 12, 9, 110, 250, Sim.hex('#101018'));
    // honey pot on the side with drips
    const gold = Sim.hex('#ffb400');
    g.fillRoundRect(170, 180, 50, 44, 10, Sim.hex('#d9a066'));
    g.fillRect(166, 176, 58, 10, Sim.hex('#b8824a'));
    g.fillEllipse(195, 178, 24, 6, gold);
    for (let k = 0; k < 2; k++) {
      const u = ((t / 1.6) + k / 2) % 1;
      g.fillEllipse(180 + k * 28, 184 + Math.round(26 * u), 3, 5, gold);
    }
    g.fillEllipse(96, 162 + dy, 5, 3, gold);   // honey on the cheek
  },
});

Sim.register({
  name: 'Bear: roar',
  theme: 'bear',
  fps: 24,
  duration: 3500,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const brown = Sim.hex('#8b5a2b'), light = Sim.hex('#c9955a');
    const roar = F.kf(t, [[0.8, 0], [1.0, 1], [2.2, 1], [2.5, 0]]);
    const shake = roar > 0.9 ? Math.round(3 * Math.sin(t * 50)) : 0;
    const dy = Math.round(-4 * roar);
    bearEars(g, dy, brown, light);
    F.eyes(g, { iris: 14, rx: 28, ry: Math.round(34 - 8 * roar), lookY: 2 }, shake, dy - 4);
    F.brow(g, F.LX + shake, F.EY + dy - 30, Math.round(4 - 6 * roar), 14 * roar);
    F.brow(g, F.RX + shake, F.EY + dy - 30, Math.round(4 - 6 * roar), -14 * roar);
    g.fillEllipse(120 + shake, 150 + dy, 32, 24, light);
    g.fillEllipse(120 + shake, 140 + dy, 10, 7, Sim.hex('#101018'));
    const mh = Math.round(4 + 26 * roar);
    g.fillEllipse(120 + shake, 170 + dy, Math.round(14 + 12 * roar), mh, Sim.hex('#101018'));
    if (roar > 0.5) {
      g.fillEllipse(120 + shake, 176 + dy, 10, Math.round(mh / 2), F.MOUTH);
      for (const s of [-1, 1]) g.fillTriangle(120 + shake + s * 14, 158 + dy, 120 + shake + s * 8, 158 + dy, 120 + shake + s * 11, 168 + dy, Sim.C.WHITE);
      // sound lines
      for (let k = 0; k < 3; k++) for (const s of [-1, 1]) g.drawLine(120 + s * (60 + k * 14), 150 + k * 14, 120 + s * (80 + k * 14), 140 + k * 16, Sim.lerp565(F.BG, Sim.C.WHITE, roar));
    }
  },
});

Sim.register(FaceRig.animation({
  name: 'Bear: snooze', theme: 'bear', fps: 20, duration: 4000,
  tracks: {
    open: [[0, 0]], eyeSize: [[0, 0.88]],
    mouthCurve: [[0, 0.3]], mouthWidth: [[0, 12]],
    zzz: [[0, 1]],
    headY: [[0, 0], [2000, 4], [4000, 0]],
  },
}, {
  under(g, c) {
    g.fillEllipse(120 + c.dx, 154 + c.dy, 30, 22, Sim.hex('#c9955a'));     // muzzle
    g.fillEllipse(120 + c.dx, 142 + c.dy, 10, 7, Sim.hex('#101018'));      // nose
  },
  over(g, c) {
    bearEars(g, c.dy, Sim.hex('#8b5a2b'), Sim.hex('#c9955a'));
    // a bubble grows with each breath, then pops
    const u = (c.t % 2) / 2, x = 138 + c.dx, y = 146 + c.dy;
    if (u < 0.9) {
      const r = Math.round(3 + 15 * u);
      g.drawCircle(x + Math.round(r * 0.7), y + Math.round(r * 0.2), r, Sim.hex('#9fd3ff'));
      g.drawPixel(x + Math.round(r * 0.5), y - Math.round(r * 0.4), Sim.C.WHITE);
    } else {
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        g.drawLine(x + 12 + Math.round(8 * Math.cos(a)), y + Math.round(8 * Math.sin(a)), x + 12 + Math.round(14 * Math.cos(a)), y + Math.round(14 * Math.sin(a)), Sim.hex('#9fd3ff'));
      }
    }
  },
}));
