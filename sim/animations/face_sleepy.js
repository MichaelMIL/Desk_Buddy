/* Sleepy: heavy lids, nodding off and snapping back up, a yawn, floating z's. */
Sim.register({
  name: 'Face: sleepy',
  fps: 20,
  duration: 7000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);

    // lids drift heavier, close while nodding off, snap open, then sag again
    const lid = F.kf(t, [
      [0, 0.45], [1.2, 0.6], [2.4, 0.75], [3.0, 0.98],   // slowly closing
      [3.45, 0.98], [3.6, 0.1], [4.0, 0.35],             // jolt awake
      [4.6, 0.45], [5.0, 0.7], [5.6, 0.7], [6.4, 0.5], [7, 0.45],
    ]);
    const drop = F.kf(t, [[0, 2], [1.2, 6], [3.0, 16], [3.45, 18], [3.6, -2], [4.0, 0], [7, 2]]);
    const dy = Math.round(drop);
    const lookY = F.kf(t, [[0, 6], [3, 10], [3.6, 0], [4.2, 4], [7, 6]]);

    F.eyes(g, { topLid: lid, lookY, iris: 15, pupil: 0.55, open: 0.95 }, 0, dy);

    // yawn from 4.6 s to 5.6 s, otherwise a small sleepy mouth
    const yawn = F.kf(t, [[4.6, 0], [4.9, 1], [5.3, 1], [5.6, 0]]);
    if (yawn > 0.05) F.oMouth(g, 120, F.MY + dy + 4, Math.round(8 + 6 * yawn), Math.round(4 + 12 * yawn));
    else F.flat(g, 120, F.MY + dy + 2, 10, 4);

    // z z Z drifting up to the right, each on its own 2.4 s cycle
    for (let k = 0; k < 3; k++) {
      const u = ((t / 2.4) + k / 3) % 1;
      const size = Math.round(14 + 14 * u);
      const x = 150 + Math.round(45 * u + 6 * Math.sin(u * 8)), y = 95 - Math.round(70 * u);
      const col = Sim.lerp565(F.BG, Sim.hex('#9fd3ff'), u < 0.15 ? u / 0.15 : (u > 0.8 ? (1 - u) / 0.2 : 1));
      g.text(x, y, 'z', col, { size, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
    }
  },
});
