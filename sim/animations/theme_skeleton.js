/* Skeleton theme (the bones build): a chattering, rattling skull, and a spooky one with glowing green eyes. */
const BONE = Sim.hex('#ece6d2'), SHADE = Sim.hex('#b9b097'), HOLE = Sim.hex('#14121a');

/* The whole screen is the skull. o: { dx, dy, jaw (px open), lookX, lookY, pupil (colour), glow (0..1), bone } */
function skull(g, o) {
  const dx = o.dx || 0, dy = o.dy || 0, bone = o.bone || BONE, jaw = Math.round(o.jaw || 0);
  g.fillEllipse(120 + dx, 98 + dy, 94, 80, bone);                       // cranium
  g.fillRoundRect(66 + dx, 128 + dy, 108, 56, 16, bone);                // cheeks
  g.drawLine(170 + dx, 34 + dy, 160 + dx, 46 + dy, SHADE);              // a little crack
  g.drawLine(160 + dx, 46 + dy, 166 + dx, 56 + dy, SHADE);
  // eye sockets with pupils
  for (const cx of [80, 160]) {
    g.fillEllipse(cx + dx, 100 + dy, 27, 30, HOLE);
    const px = cx + dx + Math.round(o.lookX || 0), py = 102 + dy + Math.round(o.lookY || 0);
    if (o.glow > 0) {
      g.fillCircle(px, py, Math.round(7 + 6 * o.glow), Sim.lerp565(HOLE, o.pupil, 0.35));
      g.fillCircle(px, py, Math.round(5 + 3 * o.glow), Sim.lerp565(HOLE, o.pupil, 0.7));
    }
    g.fillCircle(px, py, 4, o.pupil || BONE);
  }
  // nose
  g.fillTriangle(120 + dx, 128 + dy, 109 + dx, 150 + dy, 131 + dx, 150 + dy, HOLE);
  g.drawFastVLine(120 + dx, 138 + dy, 12, bone);
  // mouth: hole, upper teeth, lower teeth on the jaw
  g.fillRect(78 + dx, 164 + dy, 85, 26 + jaw, HOLE);
  for (let i = 0; i < 6; i++) g.fillRoundRect(80 + dx + i * 14, 164 + dy, 11, 11, 2, bone);
  g.fillRoundRect(70 + dx, 186 + dy + jaw, 101, 28, 12, bone);
  for (let i = 0; i < 6; i++) g.fillRoundRect(80 + dx + i * 14, 177 + dy + jaw, 11, 12, 2, bone);
}

Sim.register({
  name: 'Skeleton: rattle',
  theme: 'skeleton',
  fps: 24,
  duration: 3600,

  frame(g, f) {
    const t = f.t / 1000;
    g.clear(Sim.hex('#101018'));
    const rattle = Face.kf(t, [[0.3, 0], [0.45, 1], [1.5, 1], [1.7, 0], [2.2, 0], [2.35, 1], [3.1, 1], [3.3, 0]]);
    const dx = Math.round(4 * Math.sin(t * 42) * rattle);
    const dy = Math.round(-3 * Math.abs(Math.sin(t * 21)) * rattle);
    const jaw = Math.round(2 + 9 * Math.abs(Math.sin(t * 24)) * rattle);
    skull(g, { dx, dy, jaw, lookX: Math.round(6 * Math.sin(t * 1.7)), lookY: Math.round(2 * Math.cos(t * 2.1)), pupil: Sim.C.WHITE });
    // little motion marks while rattling
    if (rattle > 0.5) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      g.drawLine(120 + s * (100 + k * 4), 70 + k * 30, 120 + s * (108 + k * 4), 64 + k * 30, Sim.lerp565(Sim.hex('#101018'), BONE, 0.6));
    }
  },
});

Sim.register({
  name: 'Skeleton: spooky',
  theme: 'skeleton',
  fps: 20,
  duration: 4000,

  frame(g, f) {
    const t = f.t / 1000, bg = Sim.hex('#050a08');
    g.clear(bg);
    const glow = 0.5 + 0.5 * Math.sin(t * Math.PI);                 // 2 s pulse
    const ooo = Face.kf(t, [[1.2, 0], [1.6, 1], [2.6, 1], [3.0, 0]]);
    const fade = 0.8 + 0.2 * Math.sin(t * Math.PI / 2);             // ghostly breathing
    const sway = Math.round(5 * Math.sin(t * Math.PI / 2));
    skull(g, {
      dx: sway, dy: Math.round(3 * Math.sin(t * Math.PI)), jaw: Math.round(14 * ooo),
      lookX: Math.round(7 * Math.sin(t * Math.PI / 2)), lookY: 2,
      pupil: Sim.hex('#5dff8a'), glow, bone: Sim.lerp565(bg, BONE, fade),
    });
    // green wisps rising at the sides
    for (let k = 0; k < 6; k++) {
      const u = ((t / 2) + k / 6) % 1, side = k % 2 ? 1 : -1;
      const x = 120 + side * (96 + Math.round(8 * Math.sin(u * 9 + k))), y = 200 - Math.round(150 * u);
      g.fillCircle(x, y, 3 + (k % 3), Sim.lerp565(bg, Sim.hex('#5dff8a'), 0.7 * Math.sin(u * Math.PI)));
    }
  },
});
