/* Bluetooth alerts, played by the firmware itself and never cycled:
 * - `Confused:` (confused_*): two Bluetooth devices sent commands within a few seconds of
 *   each other (hardware/src/ble.cpp, app_confused in main.cpp); then it follows the later one.
 * - `Connected:` (connected_*): a paired device connected that had been away for 10 minutes
 *   or more (app_connected).
 * A random one from each pool. Loops play twice, so `Confused: two remotes` loops seamlessly;
 * `Connected: hello` tells its story once (loop: false). */

const PHONE_EDGE = Sim.hex('#9aa3ad'), PHONE_BODY = Sim.hex('#2b3138');
const SCREEN_A = Sim.hex('#64d2ff'), SCREEN_B = Sim.hex('#ff9f0a'), QMARK = Sim.hex('#ffd60a');
const BT_BLUE = Sim.hex('#0a84ff'), CHECK = Sim.hex('#30d158'), WHITE = Sim.hex('#ffffff');
const LEFT = [86, 34], RIGHT = [154, 34];   // the two phones, above the brows

/* A phone 22 x 32 px centred at (cx, cy); its screen lit in `col` while it sends. */
function phone(g, cx, cy, col, lit) {
  g.fillRoundRect(cx - 11, cy - 16, 22, 32, 5, PHONE_EDGE);
  g.fillRoundRect(cx - 9, cy - 14, 18, 28, 4, PHONE_BODY);
  g.fillRoundRect(cx - 7, cy - 11, 14, 19, 2, Sim.lerp565(Sim.lerp565(Face.BG, col, 0.3), col, lit));
  g.fillRoundRect(cx - 3, cy + 10, 6, 2, 1, PHONE_EDGE);
}

/* Three signal arcs travelling out of (cx, cy) towards `dir` (degrees, 0 = up, clockwise). */
function waves(g, cx, cy, dir, t, col, amount) {
  if (amount <= 0) return;
  for (let k = 0; k < 3; k++) {
    const u = (t * 1.6 + k / 3) % 1;
    const r = Math.round(20 + 18 * u);
    g.drawArc(cx, cy, r, r - 3, dir - 35, dir + 35, Sim.lerp565(Face.BG, col, amount * (1 - u)));
  }
}

/* A wavy mouth `amp` px high (0: a straight line, like Face.flat). */
function squiggle(g, cx, cy, half, amp, phase) {
  let px = 0, py = 0;
  for (let i = 0; i <= 12; i++) {
    const x = Math.round(cx - half + (2 * half * i) / 12), y = Math.round(cy + amp * Math.sin(i * 1.3 + phase));
    if (i) Hands.capsule(g, px, py, x, y, 2, Face.MOUTH);
    px = x; py = y;
  }
}

Sim.register({
  name: 'Confused: two remotes',
  fps: 15,
  duration: 3200,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);

    // who is talking: the left phone, then the right one, then both at once
    const litA = F.kf(t, [[0.15, 0], [0.3, 1], [0.85, 1], [1.0, 0.25], [1.4, 0.25], [1.5, 1], [2.4, 1], [2.7, 0]]);
    const litB = F.kf(t, [[0.75, 0], [0.9, 1], [1.4, 1], [1.5, 1], [2.4, 1], [2.7, 0]]);
    phone(g, LEFT[0], LEFT[1], SCREEN_A, litA);
    phone(g, RIGHT[0], RIGHT[1], SCREEN_B, litB);
    waves(g, LEFT[0], LEFT[1], 140, t, SCREEN_A, litA);
    waves(g, RIGHT[0], RIGHT[1], 220, t, SCREEN_B, litB);

    // the eyes follow each phone, dart between them, then roll in opposite directions
    let lx = F.kf(t, [[0.3, 0], [0.45, -12], [0.85, -12], [1.0, 12]]), ly = F.kf(t, [[0.3, 0], [0.45, -10]]);
    let rx = lx, ry = ly;
    if (t >= 1.4 && t < 1.9) { lx = rx = Math.floor((t - 1.4) / 0.125) % 2 ? 12 : -12; }
    const roll = F.kf(t, [[1.85, 0], [2.0, 1], [2.5, 1], [2.8, 0]]);
    if (t >= 1.9) {
      const a = (t - 1.9) * Math.PI * 3, back = F.kf(t, [[2.5, 1], [2.9, 0]]);
      lx = Math.round((roll * 10 * Math.cos(a) + (1 - roll) * 12) * back);
      ly = Math.round((roll * 10 * Math.sin(a) - (1 - roll) * 10) * back);
      rx = Math.round((roll * 10 * Math.cos(a + Math.PI) + (1 - roll) * 12) * back);
      ry = Math.round((roll * -10 * Math.sin(a) - (1 - roll) * 10) * back);
    }
    const dx = Math.round(F.kf(t, [[1.85, 0], [2.05, -6], [2.5, -6], [2.8, 0]]));
    F.eyes(g, { rx: 30, ry: 36, iris: 14, l: { lookX: lx, lookY: ly }, r: { lookX: rx, lookY: ry } }, dx, 0);

    // one brow up, the other down
    const puzzled = F.kf(t, [[1.4, 0], [1.6, 1], [2.5, 1], [2.85, 0]]);
    F.brow(g, F.LX - 2 + dx, F.EY - 18, Math.round(6 * puzzled), Math.round(-14 * puzzled), 5);
    F.brow(g, F.RX + 2 + dx, F.EY - 18, Math.round(-2 * puzzled), Math.round(16 * puzzled), 5);

    // the mouth goes wavy
    const amp = F.kf(t, [[1.5, 0], [1.9, 5], [2.5, 5], [2.9, 0]]);
    squiggle(g, 120 + dx, F.MY, 22, amp, t * 9);

    // and a question mark pops up between the phones
    const q = F.kf(t, [[1.85, 0], [2.0, 1], [2.55, 1], [2.75, 0]]);
    if (q > 0.05) {
      const bob = Math.round(2 * Math.sin(t * 10));
      g.text(120, 34 + bob, '?', Sim.lerp565(F.BG, QMARK, q), { size: Math.round(14 + 22 * q), weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
    }
  },
});

/* The Bluetooth rune, 16 px tall, centred at (cx, cy). */
function btRune(g, cx, cy, col) {
  const P = [[0, -8], [0, 8], [5, -4], [-5, 4], [5, 4], [-5, -4]].map(([x, y]) => [cx + x, cy + y]);
  const seg = (a, b) => Hands.capsule(g, a[0], a[1], b[0], b[1], 1, col);
  seg(P[0], P[1]); seg(P[0], P[2]); seg(P[2], P[3]); seg(P[1], P[4]); seg(P[4], P[5]);
}

Sim.register({
  name: 'Connected: hello',
  fps: 15,
  duration: 2600,
  loop: false,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);

    // a phone drops in at the top (a little bounce), says hello over Bluetooth, gets a check
    const py = Math.round(F.kf(t, [[0, -24], [0.35, 38], [0.45, 31], [0.55, 34]]));
    const ok = F.kf(t, [[1.2, 0], [1.35, 1]]);
    phone(g, 120, py, ok > 0.5 ? CHECK : BT_BLUE, 1);
    if (ok < 0.5) btRune(g, 120, py - 1, WHITE);
    else {
      Hands.capsule(g, 115, py - 1, 119, py + 3, 1, WHITE);
      Hands.capsule(g, 119, py + 3, 126, py - 5, 1, WHITE);
    }
    waves(g, 120, py, 180, t, SCREEN_A, F.kf(t, [[0.5, 0], [0.6, 1], [1.2, 1], [1.4, 0]]));

    // the buddy looks up at it, then beams
    const happy = F.kf(t, [[1.25, 0], [1.45, 1]]);
    const look = F.kf(t, [[0.25, 0], [0.45, 1], [1.2, 1], [1.4, 0]]);
    const hop = Math.round(-6 * Math.sin(Math.PI * F.kf(t, [[1.3, 0], [1.6, 1]])));
    F.eyes(g, { rx: 30, ry: 36, iris: 14, lookY: Math.round(-10 * look), squint: 0.9 * happy }, 0, hop);
    F.brow(g, F.LX - 2, F.EY - 18 + hop, Math.round(4 * happy + 2 * look), 0, 5);
    F.brow(g, F.RX + 2, F.EY - 18 + hop, Math.round(4 * happy + 2 * look), 0, 5);
    if (happy > 0.5) F.grin(g, 120, F.MY - 2 + hop, 24, Math.round(10 + 6 * happy));
    else if (look > 0.3) F.oMouth(g, 120, F.MY + hop, 7, 8);
    else F.flat(g, 120, F.MY, 18, 4);
    F.blush(g, happy * 0.8, 0, hop);
  },
});
