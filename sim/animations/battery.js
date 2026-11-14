/* Battery alerts. The firmware plays `battery_low` by itself when the battery runs
 * low (hardware/src/battery.h); `battery_*` animations are never part of the cycle. */

const TAU = Math.PI * 2;

/* Battery icon centred at (cx, cy): outline, nub, and a fill of `level` (0..1) in `col`. */
function battery(g, cx, cy, level, col) {
  const w = 64, h = 30, L = cx - (w >> 1) - 3, T = cy - (h >> 1);
  const edge = Sim.hex('#cfd6df');
  g.fillRoundRect(L, T, w, h, 7, edge);
  g.fillRoundRect(L + 4, T + 4, w - 8, h - 8, 4, Face.BG);
  g.fillRoundRect(L + w + 1, cy - 6, 6, 12, 2, edge);
  const fw = Math.round((w - 14) * level);
  if (fw > 0) g.fillRoundRect(L + 7, T + 7, Math.max(4, fw), h - 14, 2, col);
}

Sim.register({
  name: 'Battery: low',
  fps: 12,
  duration: 3000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    // nodding off, jolted awake, drooping again
    const lid = F.kf(t, [[0, 0.45], [1.5, 0.8], [1.62, 0.84], [1.7, 0.05], [2.1, 0.05], [3.0, 0.45]]);
    const dy = Math.round(F.kf(t, [[0, 4], [1.6, 12], [1.7, -3], [2.1, 0], [3.0, 4]]));
    const awake = t > 1.65 && t < 2.2;

    const red = Sim.hex('#ff3b30');
    const blink = Math.floor(t * 4) % 2 === 0;   // the last bit of charge flashes twice a second
    battery(g, 120, 40, 0.12, blink ? red : Sim.lerp565(F.BG, red, 0.35));

    F.eyes(g, { topLid: lid, iris: 14, lookY: awake ? 0 : 7, ry: 38 }, 0, dy);
    F.brow(g, F.LX - 2, F.EY + dy - 14, awake ? 10 : 0, -12);
    F.brow(g, F.RX + 2, F.EY + dy - 14, awake ? 10 : 0, 12);
    if (awake) F.oMouth(g, 120, F.MY + dy + 2, 7, 8);
    else F.smile(g, 120, F.MY + dy + 4, 22, -0.5, 5);

    // "z" drifting up while the eyes are nearly shut
    if (t > 0.7 && t < 1.65) {
      const u = (t - 0.7) / 0.95;
      const c = Sim.lerp565(F.BG, Sim.hex('#9fb4d0'), Math.min(1, 3 * (1 - u)));
      g.text(Math.round(208 + 6 * u + 3 * Math.sin(u * TAU)), Math.round(106 - 44 * u), 'z', c, { size: Math.round(14 + 8 * u), weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
    }
  },
});
