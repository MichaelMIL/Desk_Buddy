/* Notifications: a ringing bell with a badge, a letter arriving, a pulsing alert.
 * Meant to be played on an event (`play notify_bell` over Bluetooth, MQTT or the API). */

const TAU = Math.PI * 2;
function popIn(t, t0, t1) {
  const u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))), c = 2.4;
  return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
}

function badge(g, x, y, k, label = '1') {
  if (k <= 0.05) return;
  const r = Math.max(2, Math.round(12 * k));
  g.fillCircle(x, y, r + 2, Sim.C.BLACK);
  g.fillCircle(x, y, r, Sim.hex('#ff3b30'));
  if (k > 0.7) g.text(x, y + 1, label, Sim.C.WHITE, { size: 17, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
}

Sim.register({
  name: 'Notify: bell',
  fps: 24,
  duration: 3000,

  frame(g, f) {
    const F = Face, H = Hands, t = f.t / 1000;
    g.clear(F.BG);
    const env = F.kf(t, [[0, 0], [0.15, 1], [2.1, 1], [2.5, 0]]);
    const ang = 26 * Math.sin(TAU * 2.5 * t) * env;
    const calm = F.kf(t, [[2.3, 0], [2.6, 1], [2.85, 1], [3.0, 0]]);

    // the bell swings from a pivot at the top
    const px = 120, py = 16, a = ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const P = (x, y) => [Math.round(px + x * ca - y * sa), Math.round(py + x * sa + y * ca)];
    const gold = Sim.hex('#ffc21a'), deep = Sim.hex('#d98a00'), shine = Sim.hex('#fff2a8');
    const cl = (ang * -0.7) * Math.PI / 180;   // the clapper lags behind
    const [kx, ky] = P(Math.round(58 * Math.sin(cl)), Math.round(58 * Math.cos(cl)) + 2);
    g.fillCircle(kx, ky, 7, deep);
    const k = P(0, 6), d = P(0, 25), t1 = P(-18, 25), t2 = P(18, 25), b1 = P(-31, 52), b2 = P(31, 52);
    g.fillCircle(k[0], k[1], 5, deep);
    g.fillCircle(d[0], d[1], 18, gold);
    g.fillTriangle(t1[0], t1[1], t2[0], t2[1], b2[0], b2[1], gold);
    g.fillTriangle(t1[0], t1[1], b2[0], b2[1], b1[0], b1[1], gold);
    const r1 = P(-33, 55), r2 = P(33, 55);
    H.capsule(g, r1[0], r1[1], r2[0], r2[1], 5, deep);
    const s1 = P(-9, 20), s2 = P(-17, 46);
    H.capsule(g, s1[0], s1[1], s2[0], s2[1], 3, shine);
    // ring lines on both sides while it swings
    if (env > 0.3) {
      const on = Math.abs(Math.sin(TAU * 2.5 * t)) > 0.5;
      const c = Sim.lerp565(F.BG, Sim.C.WHITE, env);
      if (on) for (const s of [-1, 1]) for (const r of [54, 64]) g.drawArc(120, 44, r, r - 3, s > 0 ? 60 : 270, s > 0 ? 90 : 300, c);
    }
    badge(g, 152, 22, t < 2.6 ? popIn(t, 0.1, 0.3) : 1 - F.kf(t, [[2.6, 0], [2.8, 1]]));

    const dy = 18;
    F.eyes(g, { lookY: Math.round(-12 * (1 - calm)), lookX: Math.round(ang / 4), iris: 15, squint: calm }, 0, dy);
    if (calm > 0.3) F.smile(g, 120, F.MY + dy - 4, 24, 0.9, 6);
    else F.oMouth(g, 120, F.MY + dy, 9, Math.round(7 + 3 * env));
  },
});

/* Envelope centred at (x, y), w x h; flap 0 closed .. 1 open; the letter is pulled up by `up` px. */
function envelope(g, x, y, w, h, flap, up) {
  const L = x - (w >> 1), T = y - (h >> 1), R = L + w, B = T + h;
  const body = Sim.hex('#e9eef5'), fold = Sim.hex('#c3cddb'), line = Sim.hex('#9aa8bb');
  if (flap > 0.5) g.fillTriangle(L, T, R, T, x, T - Math.round(h * 0.6 * (flap - 0.5) * 2), fold);   // open flap behind
  if (up > 0) {
    g.fillRect(L + 6, T + 4 - up, w - 12, h - 8, Sim.C.WHITE);
    for (let k = 0; k < 3; k++) g.fillRect(L + 14, T + 12 - up + k * 9, w - 28 - (k === 2 ? 18 : 0), 3, Sim.hex('#7d8ca3'));
  }
  g.fillRect(L, T, w, h, body);
  Hands.capsule(g, L + 2, B - 2, x, y + 4, 1, line);
  Hands.capsule(g, R - 2, B - 2, x, y + 4, 1, line);
  if (flap <= 0.5) {
    const tip = T + Math.round(h * 0.62 * (1 - flap * 2));
    g.fillTriangle(L, T, R, T, x, tip, fold);
    if (flap < 0.1) g.fillCircle(x, tip - 4, 5, Sim.hex('#ff4f7a'));   // seal
  }
}

Sim.register({
  name: 'Notify: message',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const fly = F.kf(t, [[0, 0], [0.6, 1]]), drop = F.kf(t, [[3.5, 0], [3.95, 1]]);
    const land = t > 0.6 && t < 0.8 ? Math.round(-6 * Math.sin((t - 0.6) / 0.2 * Math.PI)) : 0;
    const ex = Math.round(250 - 130 * fly), ey = Math.round(30 + 168 * fly + 120 * drop) + land, s = 0.5 + 0.5 * fly;
    const flap = F.kf(t, [[0.9, 0], [1.2, 1], [3.4, 1], [3.55, 0]]);
    const up = Math.round(36 * F.kf(t, [[1.2, 0], [1.6, 1], [3.2, 1], [3.45, 0]]));
    const happy = F.kf(t, [[3.0, 0], [3.2, 1], [3.6, 1], [3.9, 0]]);
    // reading: three lines, left to right
    const reading = t > 1.65 && t < 3.0, line = Math.min(2, Math.floor((t - 1.65) / 0.45)), u = ((t - 1.65) % 0.45) / 0.45;
    const lookX = reading ? Math.round(-10 + 20 * u) : Math.round((ex - 120) / 10);
    const lookY = reading ? 8 + 3 * line : Math.round(12 * fly * (1 - happy));

    F.eyes(g, { lookX, lookY, squint: happy, iris: 15 }, 0, -6);
    F.blush(g, happy, 0, -6);
    if (happy > 0.2) F.smile(g, 120, F.MY - 12, 24, 1, 6);
    else F.oMouth(g, 120, F.MY - 8, 7, 6);
    envelope(g, ex, ey, Math.round(84 * s), Math.round(54 * s), flap, up);
    badge(g, ex + Math.round(40 * s), ey - Math.round(26 * s), t < 3.3 ? popIn(t, 0.65, 0.85) : 1 - F.kf(t, [[3.3, 0], [3.45, 1]]));
  },
});

/* Alert: the rim pulses twice a loop and the face jumps; the rig's "!" stays on. */
Sim.register(FaceRig.animation({
  name: 'Notify: alert', fps: 20, duration: 2000,
  tracks: {
    eyeSize: [[0, 1.12]], iris: [[0, 12]], pupil: [[0, 0.35]],
    brows: [[0, 1]], browRaise: [[0, 22]],
    mouthCurve: [[0, 0]], mouthOpen: [[0, 0.55]], mouthWidth: [[0, 20]],
    exclaim: [[0, 1]],
    headY: [[0, 0], [100, -9], [350, 0], [1000, 0], [1100, -9], [1350, 0]],
  },
}, {
  under(g, c) {
    const u = (c.t % 1) / 1, orange = Sim.hex('#ff8a00');
    g.drawArc(120, 120, 120, 110, 0, 360, Sim.lerp565(c.bg, orange, 1 - 0.7 * u));
    if (u < 0.7) {
      const r = Math.round(60 + 50 * (u / 0.7));
      g.drawArc(120, 120, r, r - 4, 0, 360, Sim.lerp565(c.bg, orange, 1 - u / 0.7));
    }
  },
}));
