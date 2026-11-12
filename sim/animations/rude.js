/* Rude theme: the finger, a fart, an eye roll, talk to the hand.
 * theme 'rude': on the device they are rude__<name> and only cycle while the
 * 'rude' theme is selected; `play rude__middle_finger` shows one any time. */

// 0..1 between t0 and t1 with an overshoot at the end (things that pop in)
function popIn(t, t0, t1) {
  const u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))), c = 2.4;
  return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
}

/* Smirk: flat on the left, curling up on the right. */
function smirk(g, cx, cy, amount) {
  const F = Face;
  g.fillRoundRect(cx - 24, cy - 3, 30, 6, 3, F.MOUTH);
  if (amount > 0.05) g.drawArc(cx + 4, cy + 3 - 18, 18, 12, Math.round(180 - 75 * amount), 180, F.MOUTH);
}

Sim.register({
  name: 'Rude: middle finger',
  theme: 'rude',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const F = Face, H = Hands, t = f.t / 1000;
    g.clear(F.BG);
    const smug = F.kf(t, [[0.3, 0], [0.7, 1], [3.0, 1], [3.3, 0]]);
    const hand = t < 2.9 ? (t < 0.75 ? 0 : popIn(t, 0.75, 1.1)) : 1 - F.kf(t, [[2.9, 0], [3.2, 1]]);
    const innocent = F.kf(t, [[3.2, 0], [3.4, 1], [3.75, 1], [3.95, 0]]);
    const pump = t > 1.9 && t < 2.4 ? Math.round(-6 * Math.sin((t - 1.9) / 0.5 * Math.PI * 2)) : 0;
    const dx = Math.round(-20 * smug), dy = Math.round(-10 * smug);

    F.eyes(g, { topLid: 0.42 * smug, lookX: Math.round(5 * smug), squint: innocent, l: { topLid: 0.3 * smug } }, dx, dy);
    if (smug > 0.05) {
      F.brow(g, F.LX + dx, F.EY + dy - 32, Math.round(4 + 8 * smug), -6 * smug);     // one brow up
      F.brow(g, F.RX + dx, F.EY + dy - 32, Math.round(4 - 8 * smug), -10 * smug);    // the other down
    }
    if (innocent > 0.05) {
      F.smile(g, 120 + dx, F.MY + dy, 20, 0.8, 6);
      F.blush(g, innocent, dx, dy);
      const halo = Sim.lerp565(F.BG, Sim.C.GOLD, innocent);
      g.drawEllipse(120, 30, 30, 8, halo); g.drawEllipse(120, 30, 29, 7, halo); g.drawEllipse(120, 30, 28, 6, halo);
    } else if (smug > 0.3) smirk(g, 120 + dx, F.MY + dy, smug);
    else F.smile(g, 120 + dx, F.MY + dy, 22, 0.5, 6);

    if (hand > 0.01) {
      const wy = Math.round(400 - 144 * hand) + pump;
      H.draw(g, H.MIDDLE, 158, wy, { scale: 1.3, angle: -6, cuff: true });
      if (t > 1.05 && t < 1.6) H.motion(g, 146, wy - 140, 18, 30, [-70, -35, 35, 70], Sim.C.WHITE, 4);
    }
  },
});

Sim.register({
  name: 'Rude: fart',
  theme: 'rude',
  fps: 20,
  duration: 4000,

  frame(g, f) {
    const F = Face, H = Hands, t = f.t / 1000;
    g.clear(F.BG);
    const strain = F.kf(t, [[0.15, 0], [0.45, 1], [0.85, 1], [1.0, 0]]);
    const relief = F.kf(t, [[1.0, 0], [1.25, 1], [2.4, 1], [2.6, 0]]);
    const whistle = F.kf(t, [[2.5, 0], [2.7, 1], [3.5, 1], [3.7, 0]]);
    const toot = t > 0.95 && t < 1.5;
    const sx = toot ? (f.i % 2 ? 3 : -3) : (strain > 0.5 ? (f.i % 2 ? 1 : -1) : 0);
    const look = whistle * F.kf(t, [[2.6, 0], [2.85, -12], [3.15, -12], [3.35, 12], [3.6, 12], [3.75, 0]]);

    // the cloud, under the face
    const life = F.kf(t, [[0.95, 0], [1.4, 1], [3.0, 1], [3.8, 0]]);
    if (life > 0.01) {
      const green = Sim.hex('#8fc43a');
      for (let k = 0; k < 6; k++) {
        const grow = F.kf(t, [[0.95 + k * 0.05, 0], [1.6 + k * 0.08, 1]]);
        const x = Math.round(48 + k * 29 + 3 * Math.sin(t * 2 + k)), y = Math.round(236 - 34 * grow - 4 * Math.sin(t * 1.5 + k * 2));
        g.fillCircle(x, y, Math.round(4 + (16 + (k % 3) * 4) * grow), Sim.lerp565(F.BG, green, life * (0.55 + 0.15 * (k % 2))));
      }
      // stink lines rising
      for (let k = 0; k < 3; k++) {
        const u = ((t - 1.2) / 1.2 + k / 3) % 1;
        if (t < 1.2 || t > 3.4) continue;
        const x0 = 64 + k * 56, y0 = 196 - Math.round(60 * u);
        for (let s = 0; s < 6; s++) g.fillRect(x0 + Math.round(5 * Math.sin((y0 + s * 5) * 0.25 + k)), y0 + s * 5, 3, 4, Sim.lerp565(F.BG, green, life * (1 - u)));
      }
    }

    F.eyes(g, {
      open: 1 - 0.85 * strain, topLid: 0.38 * relief, squint: 0, lookX: look,
    }, sx, 0);
    if (strain > 0.05) {
      F.brow(g, F.LX + sx, F.EY - 30, 2, 14 * strain);
      F.brow(g, F.RX + sx, F.EY - 30, 2, -14 * strain);
    }
    F.blush(g, Math.max(strain, 0.6 * relief), sx, 0);
    if (strain > 0.4) F.flat(g, 120 + sx, F.MY + 2, 14, 6);
    else if (whistle > 0.3) {
      F.oMouth(g, 120 + Math.round(look * 0.6), F.MY + 2, 6, 6);
      const u = ((t - 2.6) / 1.1) % 1;   // a note floating up
      const nx = 176 + Math.round(u * 24 + 4 * Math.sin(u * 9)), ny = 196 - Math.round(56 * u), nc = Sim.lerp565(F.BG, Sim.C.SKYBLUE, whistle * (1 - u));
      g.fillEllipse(nx, ny, 5, 4, nc); g.fillRect(nx + 3, ny - 18, 3, 18, nc); g.fillRect(nx + 3, ny - 18, 9, 3, nc);
    } else if (relief > 0.2) smirk(g, 120 + sx, F.MY, relief);
    else F.smile(g, 120 + sx, F.MY, 22, 0.5, 6);

    if (t > 0.95 && t < 2.1) {
      const k = popIn(t, 0.95, 1.15), size = Math.round(30 * k);
      g.text(120 + sx * 2, 208, 'PFFRT!', Sim.hex('#c6f04a'), { size: Math.max(8, size), weight: '900', align: 'center', baseline: 'middle', crisp: true });
    }
  },
});

Sim.register({
  name: 'Rude: eye roll',
  theme: 'rude',
  fps: 24,
  duration: 3200,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);
    const bored = F.kf(t, [[0.3, 0], [0.6, 1], [2.7, 1], [3.0, 0]]);
    const roll = F.kf(t, [[0.7, 0], [1.7, 1]]) * (t < 2.6 ? 1 : 0);   // half a turn, left -> up -> right
    const a = Math.PI * roll, rolling = t > 0.7 && t < 1.85;
    const lookX = rolling ? Math.round(-15 * Math.cos(a)) : Math.round(F.kf(t, [[1.85, 15], [2.3, 0]])) * (t < 2.6 ? 1 : 0);
    const lookY = rolling ? Math.round(-16 * Math.sin(a)) : 0;
    const sigh = F.kf(t, [[1.8, 0], [2.05, 1], [2.5, 1], [2.8, 0]]);
    const dy = Math.round(6 * sigh);

    F.eyes(g, { topLid: 0.4 * bored, lookX, lookY }, 0, dy);
    F.brow(g, F.LX, F.EY + dy - 32, Math.round(2 + 6 * bored), -4 * bored);
    F.brow(g, F.RX, F.EY + dy - 32, Math.round(2 + 6 * bored), 4 * bored);
    if (sigh > 0.3 && t < 2.3) F.oMouth(g, 120, F.MY + dy + 2, 9, Math.round(4 + 5 * sigh));
    else if (bored > 0.3) F.flat(g, 120, F.MY + dy + 2, 18, 5);
    else F.smile(g, 120, F.MY + dy, 22, 0.5, 6);
    if (t > 1.9 && t < 2.9) {
      const k = F.kf(t, [[1.9, 0], [2.1, 1], [2.7, 1], [2.9, 0]]);
      g.text(176, 196, 'ugh.', Sim.lerp565(F.BG, Sim.hex('#a8b0bc'), k), { size: 24, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
    }
  },
});

Sim.register({
  name: 'Rude: talk to the hand',
  theme: 'rude',
  fps: 24,
  duration: 3600,

  frame(g, f) {
    const F = Face, H = Hands, t = f.t / 1000;
    g.clear(F.BG);
    const away = F.kf(t, [[0.2, 0], [0.55, 1], [2.9, 1], [3.3, 0]]);
    const hand = t < 2.8 ? (t < 0.6 ? 0 : popIn(t, 0.6, 0.95)) : 1 - F.kf(t, [[2.8, 0], [3.15, 1]]);
    const hit = t > 0.9 && t < 1.15 ? (f.i % 2 ? 3 : -3) : 0;
    const dx = Math.round(-18 * away) + hit, dy = Math.round(-6 * away);

    F.eyes(g, { topLid: 0.5 * away, lookX: Math.round(-14 * away), lookY: Math.round(-4 * away) }, dx, dy);
    if (away > 0.05) {
      F.brow(g, F.LX + dx, F.EY + dy - 32, Math.round(6 + 8 * away), 0);
      F.brow(g, F.RX + dx, F.EY + dy - 32, Math.round(6 + 8 * away), 0);
    }
    if (away > 0.3) smirk(g, 112 + dx, F.MY + dy, away);
    else F.smile(g, 120 + dx, F.MY + dy, 22, 0.5, 6);

    if (hand > 0.01) {
      const s = 0.65 + 0.55 * hand;
      H.draw(g, H.FLAT, Math.round(262 - 84 * hand), Math.round(250 - 18 * hand), { scale: s, angle: Math.round(-30 + 18 * hand), cuff: true });
    }
    if (t > 1.1 && t < 2.8) {
      const k = popIn(t, 1.1, 1.3);
      H.bubble(g, 82, 44, Math.round(84 * k), Math.round(34 * k), k > 0.6 ? 'NOPE.' : '', { tx: 86, ty: 70, size: 20 });
    }
  },
});
