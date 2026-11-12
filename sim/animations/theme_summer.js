/* Summer theme: sunglasses drop in under the sun, and a melting ice cream. */
function sun(g, t, x, y) {
  const yel = Sim.hex('#ffd23d');
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + t * 0.6;
    const r1 = 26, r2 = 36 + Math.round(3 * Math.sin(t * 4 + k));
    g.drawLine(x + Math.round(r1 * Math.cos(a)), y + Math.round(r1 * Math.sin(a)), x + Math.round(r2 * Math.cos(a)), y + Math.round(r2 * Math.sin(a)), yel);
    g.drawLine(x + 1 + Math.round(r1 * Math.cos(a)), y + Math.round(r1 * Math.sin(a)), x + 1 + Math.round(r2 * Math.cos(a)), y + Math.round(r2 * Math.sin(a)), yel);
  }
  g.fillCircle(x, y, 20, yel);
}

Sim.register(FaceRig.animation({
  name: 'Summer: shades', theme: 'summer', fps: 24, duration: 4000,
  colors: { bg: '#0e2f4a' },
  tracks: {
    mouthCurve: [[0, 0.6], [1300, 0.6], [1500, 0.8]],
    mouthWidth: [[0, 26], [1500, 22]],
    headX: [[0, 0], [1500, 0], [1700, 3], [3600, 3], [3900, 0]],
    headY: [[0, 0], [1500, 0], [1700, 2]],
  },
}, {
  under(g, c) { sun(g, c.t, 194, 46); },
  over(g, c) {
    // sunglasses slide down onto the eyes, stay, then lift off
    const drop = Face.kf(c.t, [[0.4, 0], [1.2, 1, 'pop'], [3.4, 1], [3.9, 0]]);
    const y = Math.round(-40 + (112 + 40) * drop) + c.dy, x = c.dx;
    if (drop > 0.01) {
      const lens = Sim.hex('#101018');
      g.fillRoundRect(30 + x, y - 26, 80, 52, 18, lens);
      g.fillRoundRect(130 + x, y - 26, 80, 52, 18, lens);
      g.fillRect(108 + x, y - 18, 24, 6, lens);
      g.fillRect(4 + x, y - 22, 28, 5, lens);
      g.fillRect(208 + x, y - 22, 28, 5, lens);
      for (const lx of [44, 144]) g.drawLine(lx + x, y - 12, lx + 14 + x, y - 20, Sim.hex('#58c8ff'));
    }
    // cool smirk sparkle on the glasses
    if (drop > 0.95 && (c.t % 1.6) < 0.25) {
      const s = 6, sx = 192 + x, sy = y - 26;
      g.drawFastHLine(sx - s, sy, 2 * s + 1, Sim.C.WHITE); g.drawFastVLine(sx, sy - s, 2 * s + 1, Sim.C.WHITE);
    }
  },
}));

Sim.register(FaceRig.animation({
  name: 'Summer: ice cream', theme: 'summer', fps: 20, duration: 4500,
  colors: { bg: '#0e2f4a' },
  tracks: {
    lookX: [[0, 10]],
    lookY: [[0, 9]],
    squint: [[0, 0], [800, 0], [1000, 0.8], [3800, 0.8], [4200, 0]],
    mouthCurve: [[0, 0.9]],
    blush: [[0, 0.5], [1000, 0.9]],
  },
}, {
  over(g, c) {
    sun(g, c.t, 46, 46);
    // tongue licks towards the cone
    const lick = Face.kf(c.t, [[0.8, 0], [1.0, 1], [1.4, 0], [1.9, 0], [2.1, 1], [2.5, 0], [3.0, 0], [3.2, 1], [3.6, 0]]);
    if (lick > 0.05) g.fillEllipse(140 + c.dx + Math.round(12 * lick), 168 + c.dy, Math.round(5 + 4 * lick), Math.round(4 + 5 * lick), Sim.hex('#ff4f7a'));
    // cone with two scoops, melting drips
    const cx = 178, cy = 184, melt = (c.t / 4.5);
    g.fillTriangle(cx - 12, cy + 6, cx + 12, cy + 6, cx, cy + 34, Sim.hex('#d9a066'));
    for (let i = -1; i <= 1; i++) g.drawLine(cx - 8 + i * 6, cy + 8, cx + 2 + i * 6, cy + 22, Sim.hex('#b8824a'));
    g.fillCircle(cx, cy, 13, Sim.hex('#ffb3c6'));
    g.fillCircle(cx + 2, cy - 15, 11, Sim.hex('#fff2d6'));
    for (let k = 0; k < 2; k++) {
      const len = Math.round(4 + 12 * ((melt + k * 0.4) % 1));
      g.fillRoundRect(cx - 9 + k * 13, cy + 6, 4, len, 2, Sim.hex('#ffb3c6'));
    }
  },
}));

function beachBall(g, x, y, r, rot) {
  const cols = ['#ff3a3a', '#ffffff', '#2a6cff', '#ffffff', '#ffd23d', '#ffffff'].map(Sim.hex);
  for (let k = 0; k < 6; k++) {
    const a0 = ((rot + k * 60) % 360 + 360) % 360, a1 = (a0 + 60) % 360;
    if (a0 < a1) g.drawArc(x, y, r, 0, a0, a1, cols[k]);
    else { g.drawArc(x, y, r, 0, a0, 360, cols[k]); g.drawArc(x, y, r, 0, 0, a1, cols[k]); }
  }
  g.fillCircle(x, y, 3, Sim.C.WHITE);
}

const BALL = FaceRig.normalize({
  name: 'Summer: beach ball', theme: 'summer', fps: 24, duration: 4000,
  colors: { bg: '#0e2f4a' },
  tracks: {
    mouthCurve: [[0, 0.9]], mouthOpen: [[0, 0.3]], blush: [[0, 0.5]],
    squint: [[0, 0], [3000, 0], [3200, 0.8], [3800, 0.8], [4000, 0]],
  },
});
Sim.register({
  name: BALL.name, theme: BALL.theme, fps: BALL.fps, duration: BALL.duration,
  frame(g, f) {
    const t = f.t / 1000;
    const bx = 120 + Math.round(70 * Math.sin(f.p * Math.PI * 2)), by = 204 - Math.round(64 * Math.abs(Math.sin(f.p * Math.PI * 3)));
    const v = FaceRig.valuesAt(BALL, f.t);
    v.lookX = Math.max(-14, Math.min(14, Math.round((bx - 120) / 5)));          // watching the ball
    v.lookY = Math.max(-10, Math.min(12, Math.round((by - 112) / 7)));
    FaceRig.draw(g, v, f.t, BALL, {
      under(g, c) {
        for (let x = 0; x < 240; x += 4) {
          const h = 222 + Math.round(4 * Math.sin(x / 14 + t * 3));
          g.fillRect(x, h, 4, 240 - h, Sim.hex('#1f78b4'));
          g.fillRect(x, h, 4, 2, Sim.hex('#9fd3ff'));
        }
      },
      over(g, c) { beachBall(g, bx, by, 16, Math.round(t * 240 * Math.sign(Math.cos(f.p * Math.PI * 2)))); },
    }, f);
  },
});
