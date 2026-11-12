/* Eating: a cookie in three bites, slurping noodles, hungry for a burger. */

const TAU = Math.PI * 2;
const rnd = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

Sim.register({
  name: 'Eat: cookie',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const dough = Sim.hex('#d68f40'), chip = Sim.hex('#4a2810'), rim = Sim.hex('#a8652a');
    const BITES = [0.85, 1.75, 2.65];
    const bites = BITES.filter(b => t >= b).length;
    const chewing = BITES.some(b => t > b && t < b + 0.65);
    const opening = BITES.some(b => t > b - 0.25 && t < b);
    const yum = F.kf(t, [[3.25, 0], [3.45, 1], [3.75, 1], [3.95, 0]]);
    const chew = chewing ? Math.sin(t * TAU * 5) : 0;
    const dy = Math.round(2 * chew);

    // the cookie, behind the mouth; bites are background-coloured circles
    if (bites < 3) {
      const cx = Math.round(F.kf(t, [[0, 300], [0.5, 158]])), cy = 180;
      g.fillCircle(cx, cy, 35, rim);
      g.fillCircle(cx, cy, 32, dough);
      for (const [x, y] of [[-14, -14], [9, -19], [17, 5], [-4, 7], [-19, 14], [5, 23], [22, -6], [-24, -2]]) g.fillCircle(cx + x, cy + y, 4, chip);
      const cuts = [[[-36, -9, 17], [-34, 13, 14]], [[-13, -11, 18], [-11, 16, 15], [-24, 0, 17]]];
      for (let k = 0; k < bites; k++) for (const [x, y, r] of cuts[k]) g.fillCircle(cx + x, cy + y, r, F.BG);
    }
    // crumbs from each bite
    for (let k = 0; k < bites; k++) {
      const u = t - BITES[k];
      if (u > 1.0) continue;
      for (let j = 0; j < 5; j++) {
        const s = k * 10 + j, x = Math.round(136 + 30 * (rnd(s) - 0.5) + 30 * u * (rnd(s + 5) - 0.3)), y = Math.round(180 + 40 * u + 90 * u * u);
        if (y < 232) g.fillRect(x, y, 3 + (j % 2), 3, j % 3 ? Sim.hex('#d68f40') : Sim.hex('#4a2810'));
      }
    }

    const look = bites < 3 ? F.kf(t, [[0, 0], [0.4, 1]]) : 1 - F.kf(t, [[2.75, 0], [3.1, 1]]);
    const sq = Math.max(chewing ? 0.6 : 0, yum);
    F.eyes(g, { lookX: Math.round(10 * look), lookY: Math.round(10 * look), squint: sq }, 0, dy);
    F.blush(g, Math.max(chewing ? 0.6 : 0, yum), 0, dy);
    if (opening) F.oMouth(g, 128, F.MY + 6, 16, 14);
    else if (chewing) {
      if (chew > 0) F.smile(g, 116 + Math.round(4 * chew), F.MY + dy, 18, 0.5, 6);          // munch munch
      else F.flat(g, 116 + Math.round(4 * chew), F.MY + dy + 2, 16, 6);
      const b = BITES.find(b => t > b && t < b + 0.65), u = (t - b) / 0.65;
      g.text(190, 60 - Math.round(16 * u), 'nom', Sim.lerp565(F.BG, Sim.hex('#ffb347'), Math.sin(u * Math.PI)), { size: 20, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
    } else if (yum > 0.05) {
      F.smile(g, 120, F.MY, 26, 1, 6);
      const lx = 120 + Math.round(16 * Math.sin((t - 3.3) * 6));
      g.fillEllipse(lx, F.MY + 10, 7, 6, Sim.hex('#ff7aa0'));                               // licks the lips
    } else F.smile(g, 120, F.MY, 22, 0.5, 6);
  },
});

Sim.register({
  name: 'Eat: noodles',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const yellow = Sim.hex('#ffd75e'), bowl = Sim.hex('#d8362f'), band = Sim.C.WHITE;
    const lift = F.kf(t, [[0.4, 0], [0.8, 1]]);
    const slurp = t > 0.8 && t < 3.6;
    const tail = F.kf(t, [[3.1, 0], [3.5, 1]]);             // the last bit goes in
    const happy = F.kf(t, [[0.7, 0], [0.9, 1], [3.5, 1], [3.9, 0]]);
    const shake = slurp && t < 3.1 ? (f.i % 2 ? 1 : -1) : 0;

    // steam
    for (let k = 0; k < 2; k++) {
      const u = (t / 2 + k / 2) % 1, x0 = k ? 194 : 46;
      const c = Sim.lerp565(F.BG, Sim.hex('#c0ccd8'), 0.9 * Math.sin(u * Math.PI));
      for (let s = 0; s < 4; s++) g.fillRect(x0 + Math.round(4 * Math.sin(s * 0.9 + u * 8)), 194 - Math.round(26 * u) - s * 6, 3, 5, c);
    }

    const top = F.MY + 8, bot = Math.round(204 - (204 - top) * tail);
    F.eyes(g, { squint: happy, lookY: Math.round(10 * (1 - lift)) }, shake, 0);
    F.blush(g, happy, shake, 0);
    if (slurp) F.oMouth(g, 120 + shake, top, 12, 11);
    else if (happy > 0.3) F.smile(g, 120, F.MY, 24, 0.9, 6);
    else F.smile(g, 120, F.MY, 22, 0.5, 6);

    // noodles: three wavy strands, the waves run upward while slurping
    if (lift > 0.02 && tail < 0.98) {
      const yTop = Math.round(204 - (204 - top) * lift), ph = slurp ? t * 14 : 0;
      for (let k = 0; k < 3; k++) {
        for (let y = yTop + 6; y < bot; y += 2) {
          const x = 120 + (k - 1) * 6 + Math.round(4 * Math.sin(y * 0.28 + ph + k * 2) * Math.min(1, (y - yTop) / 12));
          g.fillRect(x - 2, y, 4, 2, k === 1 ? Sim.hex('#ffe58a') : yellow);
        }
      }
    }
    // the bowl and its noodle mound
    g.fillEllipse(120, 204, 54, 9, yellow);
    for (let y = 0; y <= 34; y++) {
      const hw = Math.round(62 * Math.sqrt(1 - (y / 36) * (y / 36)));
      g.drawFastHLine(120 - hw, 206 + y, 2 * hw + 1, y > 8 && y < 13 ? band : bowl);
    }
    // chopsticks resting on the rim
    Hands.capsule(g, 214, 150, 150, 202, 2, Sim.hex('#c08a4a'));
    Hands.capsule(g, 220, 158, 158, 206, 2, Sim.hex('#c08a4a'));

    if (t > 1.0 && t < 3.1) {
      const k = F.kf(t, [[1.0, 0], [1.2, 1]]), w = Math.round(2 * Math.sin(t * 30));
      g.text(120 + w, 34, 'SLURRRP', Sim.lerp565(F.BG, Sim.hex('#ffb347'), k), { size: 22, weight: '900', align: 'center', baseline: 'middle', crisp: true });
    }
  },
});

Sim.register({
  name: 'Eat: hungry',
  fps: 20,
  duration: 4000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    // a burger floats across the top, the eyes follow it
    const bx = Math.round(120 + 46 * Math.sin(TAU * t / 4)), by = Math.round(40 + 4 * Math.sin(TAU * t / 2));
    const bun = Sim.hex('#e0913a');
    for (let y = -14; y <= 0; y++) { const hw = Math.round(26 * Math.sqrt(1 - (y / 15) * (y / 15))); g.drawFastHLine(bx - hw, by + y, 2 * hw + 1, bun); }
    for (const [x, y] of [[-10, -8], [2, -11], [12, -6]]) g.fillEllipse(bx + x, by + y, 2, 1 + 1, Sim.hex('#fff1c8'));
    g.fillRoundRect(bx - 28, by + 1, 56, 5, 2, Sim.hex('#5cc14a'));
    g.fillRect(bx - 25, by + 5, 50, 3, Sim.hex('#ffd23f'));
    g.fillTriangle(bx + 6, by + 7, bx + 14, by + 7, bx + 10, by + 13, Sim.hex('#ffd23f'));
    g.fillRoundRect(bx - 26, by + 8, 52, 8, 3, Sim.hex('#6b3a1e'));
    g.fillRoundRect(bx - 25, by + 16, 50, 7, 3, bun);

    const lookX = Math.round(12 * Math.sin(TAU * t / 4)), lick = F.kf(t, [[0.4, 0], [0.6, 1], [1.2, 1], [1.4, 0]]);
    const growl = t > 1.8 && t < 2.8;
    F.eyes(g, { lookX, lookY: -12, iris: 20, pupil: 0.62 });
    for (const cx of [F.LX, F.RX]) g.fillCircle(cx + lookX - 7, F.EY - 13 + 8, 3, Sim.C.WHITE);   // extra shine
    F.oMouth(g, 120, F.MY + 4, 13, 9);
    if (lick > 0.05) g.fillEllipse(120 + Math.round(10 * Math.sin((t - 0.4) * 9)), F.MY - 2, 7, Math.round(2 + 4 * lick), Sim.hex('#ff7aa0'));
    // drool from the corner
    const u = (t / 2) % 1, dc = Sim.hex('#8fd8ff');
    if (u < 0.75) g.fillEllipse(132, F.MY + 12 + Math.round(10 * u), 3, Math.round(3 + 6 * u), dc);
    else g.fillEllipse(132, F.MY + 22 + Math.round(160 * (u - 0.75)), 3, 5, dc);
    if (growl) {
      const w = f.i % 2 ? 2 : -2;
      g.text(120 + w, 210, 'grrrumble', Sim.hex('#ffb347'), { size: 18, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
    }
  },
});
