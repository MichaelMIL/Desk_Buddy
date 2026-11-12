/* DJ groove: buddy wearing headphones bobs to a 120 BPM beat, ear-cup LEDs flash a new colour each beat,
   music notes float up out of the cups, and mid-loop the eyes close into blissful crescents with a bigger grin. */
Sim.register({
  name: 'DJ: groove',
  theme: 'dj',
  fps: 25,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);

    // beat: 120 BPM -> 2 beats/s, 8 beats per 4 s loop
    const beatF = t * 2;
    const beat = Math.floor(beatF) % 8;
    const ph = beatF - Math.floor(beatF);          // 0..1 within the beat
    const bp = (1 - ph) * (1 - ph);                // pulse, strongest on the beat

    // head motion: bob down on each beat, sway side to side over 2 s
    const dy = Math.round(5 * Math.abs(Math.sin(t * Math.PI * 2)) - 2);
    const dx = Math.round(5 * Math.sin(t * Math.PI));

    // bliss section: eyes closed into happy crescents
    const bliss = F.kf(t, [[1.8, 0], [2.05, 1], [3.2, 1], [3.45, 0]]);

    // ---- music notes (drawn first, behind face). Spawn each beat, alternate sides.
    for (let k = 0; k < 8; k++) {
      const age = (((t - k * 0.5) % 4) + 4) % 4;
      const life = 1.1;
      if (age >= life) continue;
      const u = age / life;
      const left = k % 2 === 0;
      let x = 40 + (80 - 40) * u + 4 * Math.sin(age * 9);
      const y = Math.round(76 + (36 - 76) * u);
      if (!left) x = 240 - x - 8;
      x = Math.round(x);
      const base = Sim.hsv((k * 45 + 200) % 360, 0.85, 1);
      const col = u < 0.6 ? base : Sim.lerp565(base, F.BG, (u - 0.6) / 0.4);
      g.fillEllipse(x, y, 5, 4, col);
      g.fillRect(x + 3, y - 15, 3, 15, col);
      g.fillRect(x + 3, y - 15, 9, 3, col);
      g.fillRect(x + 9, y - 13, 3, 4, col);
    }

    // ---- face
    const look = Math.round(6 * Math.sin(t * Math.PI));
    F.eyes(g, {
      open: 1 - 0.12 * bp * (1 - bliss),
      lookX: look,
      squint: bliss,
    }, dx, dy);

    F.blush(g, 0.35 + 0.5 * bliss, dx, dy);

    const gw = Math.round(22 + 6 * bliss + 2 * bp);
    const gh = Math.round(10 + 6 * bliss + 5 * bp);
    F.grin(g, 120 + dx, F.MY - 2 + dy, gw, gh);

    // ---- headphones (on top of everything, move with the head)
    const BAND = Sim.hex('#3a4256');
    const BAND_HI = Sim.hex('#5a6684');
    const CUP = Sim.hex('#262c3a');
    const hcx = 120 + dx, hcy = 112 + dy;
    g.drawArc(hcx, hcy, 106, 99, -67, 67, BAND);
    g.drawArc(hcx, hcy, 104, 101, -55, 55, BAND_HI);

    const hue = (beat * 45) % 360;
    const led = Sim.hsv(hue, 1, 0.35 + 0.65 * bp);
    const ledRing = Sim.hsv((hue + 180) % 360, 1, 0.3 + 0.4 * bp);
    for (const sx of [24, 216]) {
      const cx = sx + dx, cy = 112 + dy;
      g.fillRect(cx - 3, cy - 42, 7, 18, BAND);          // yoke from band to cup
      g.fillRoundRect(cx - 12, cy - 27, 24, 54, 9, CUP);
      g.fillRoundRect(cx - 12, cy - 27, 24, 54, 9, CUP);
      g.fillCircle(cx, cy, 9, ledRing);
      g.fillCircle(cx, cy, 6, led);
    }
  },
});
