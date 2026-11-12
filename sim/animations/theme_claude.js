/* Claude theme: warm coral and cream on a dark background, with a hand-drawn spark.
 * Thinking it over, writing something down, saying hello, and a big spark of an idea. */
const { CORAL, CREAM, INK, STONE, COLORS, TERM, EDGE, GREEN, RED, YELLOW, BLUE, MONO, CODE_FACE,
        spark, terminal, mono, check, cliSpinner } = ClaudeKit;

Sim.register(FaceRig.animation({
  name: 'Claude: thinking', theme: 'claude', fps: 20, duration: 4500,
  colors: COLORS,
  tracks: {
    lookX: [[0, 0], [500, -9], [3000, -9], [3300, 0]],
    lookY: [[0, 0], [500, -10], [3000, -10], [3300, 0]],
    mouthCurve: [[0, 0.3], [500, 0], [3000, 0], [3300, 1]],
    mouthWidth: [[0, 20], [500, 10], [3000, 10], [3300, 30]],
    mouthOpen: [[0, 0], [3000, 0], [3300, 0.5], [4100, 0.5], [4400, 0]],
    squint: [[0, 0], [3000, 0], [3300, 1, 'pop'], [4100, 1], [4400, 0]],
    blush: [[0, 0], [3100, 0], [3300, 0.8], [4200, 0.8], [4400, 0]],
  },
}, {
  over(g, c) {
    const idea = Face.kf(c.t, [[3.0, 0], [3.25, 1, 'pop'], [4.0, 1], [4.4, 0]]);
    const pulse = 0.5 + 0.5 * Math.sin(c.t * 5);
    spark(g, 120, 36 + c.dy, Math.round(13 + 3 * pulse + 12 * idea), c.t * (0.9 + 2 * idea), CORAL);
    if (c.t < 3.0) {                                          // "…" while thinking
      for (let k = 0; k < 3; k++) {
        const on = Math.floor(c.t * 3) % 4 > k;
        g.fillCircle(156 + k * 12, 50 + c.dy, 3, on ? CREAM : Sim.lerp565(INK, STONE, 0.5));
      }
    }
  },
}));

const WRITE = FaceRig.normalize({
  name: 'Claude: writing', theme: 'claude', fps: 20, duration: 5000, colors: COLORS,
  tracks: {
    headY: [[0, -12]], lookY: [[0, 11]],
    mouthCurve: [[0, 0.5]], mouthWidth: [[0, 16]],
    open: [[0, 1], [3400, 1, 'linear'], [3480, 0.05, 'linear'], [3560, 1]],
  },
});
Sim.register({
  name: WRITE.name, theme: WRITE.theme, fps: WRITE.fps, duration: WRITE.duration,
  frame(g, f) {
    const t = f.t / 1000;
    // four lines get written, left to right; the cursor is where the eyes look
    const lines = [64, 80, 72, 52], perLine = 1.1;
    const li = Math.min(lines.length - 1, Math.floor(t / perLine)), u = Math.min(1, (t - li * perLine) / (perLine * 0.85));
    const done = t >= lines.length * perLine;
    const curX = 82 + Math.round(lines[li] * (done ? 1 : u)), curY = 188 + li * 9;
    const v = FaceRig.valuesAt(WRITE, f.t);
    v.lookX = done ? 0 : Math.round((curX - 120) / 4);
    FaceRig.draw(g, v, f.t, WRITE, {
      over(g, c) {
        g.fillRoundRect(72, 178, 96, 48, 6, CREAM);                         // the page
        for (let k = 0; k <= li; k++) {
          const w = k < li || done ? lines[k] : Math.round(lines[k] * u);
          if (w > 0) g.fillRect(82, 186 + k * 9, w, 3, k === 0 ? CORAL : STONE);
        }
        if (!done && (Math.floor(t * 4) % 2 === 0)) g.fillRect(curX + 2, curY - 3, 2, 8, INK);
        spark(g, 178, 30, 10, t * 1.5, CORAL);                               // still thinking while writing
      },
    }, f);
  },
});

Sim.register(FaceRig.animation({
  name: 'Claude: hello', theme: 'claude', fps: 24, duration: 4000,
  colors: COLORS,
  tracks: {
    headX: [[0, 0], [600, -6], [1000, 4], [1400, -4], [1800, 0]],
    squint: [[0, 0], [500, 0], [700, 1, 'pop'], [3000, 1], [3400, 0]],
    mouthCurve: [[0, 0.7], [600, 1]],
    mouthOpen: [[0, 0], [500, 0], [700, 0.75, 'pop'], [3000, 0.6], [3400, 0]],
    mouthWidth: [[0, 24], [700, 32], [3400, 24]],
    blush: [[0, 0], [550, 0], [700, 0.9], [3200, 0.9], [3350, 0]],
  },
}, {
  over(g, c) {
    // speech bubble pops in with a "Hi!"
    const pop = Face.kf(c.t, [[0.4, 0], [0.75, 1, 'pop'], [3.3, 1], [3.6, 0]]);
    if (pop > 0.03) {
      const w = Math.round(58 * pop), h = Math.round(34 * pop), bx = 178, by = 40;
      g.fillRoundRect(bx - (w >> 1), by - (h >> 1), w, h, Math.max(2, Math.round(12 * pop)), CREAM);
      g.fillTriangle(bx - 14, by + (h >> 1) - 2, bx - 2, by + (h >> 1) - 2, bx - 20, by + (h >> 1) + Math.round(12 * pop), CREAM);
      if (pop > 0.85) g.text(bx, by + 1, 'Hi!', INK, { size: 19, weight: 'bold', font: 'Arial, Helvetica, sans-serif', align: 'center', baseline: 'middle' });
    }
    // a small spark twinkles on the other side
    const tw = 0.5 + 0.5 * Math.sin(c.t * 4);
    spark(g, 50, 58, Math.round(12 + 4 * tw), -c.t, CORAL, 12);
  },
}));

Sim.register(FaceRig.animation({
  name: 'Claude: spark', theme: 'claude', fps: 24, duration: 4000,
  colors: COLORS,
  tracks: {
    eyeSize: [[0, 1], [700, 1.16], [1100, 1.16], [1400, 1]],
    iris: [[0, 16], [700, 12], [1100, 12], [1400, 16]],
    mouthCurve: [[0, 0.5], [600, 0], [1100, 0], [1400, 1]],
    mouthOpen: [[0, 0], [600, 0.6], [1100, 0.6], [1400, 0.7], [3300, 0.6], [3700, 0]],
    mouthWidth: [[0, 22], [600, 18], [1400, 32], [3700, 24]],
    squint: [[0, 0], [1200, 0], [1400, 1, 'pop'], [3300, 1], [3700, 0]],
    blush: [[0, 0], [1300, 0], [1500, 0.9], [3400, 0.9], [3800, 0]],
    sparkle: [[0, 0], [1400, 0], [1600, 1], [3200, 1], [3600, 0]],
  },
}, {
  under(g, c) {
    // the spark blooms behind the face, turns, and settles back
    const grow = Face.kf(c.t, [[0.2, 0], [1.2, 1, 'pop'], [3.0, 1], [3.8, 0]]);
    // a sunburst ring around the face: rays start outside the eyes and mouth
    if (grow > 0.03) {
      const r = Math.round(92 + 30 * grow);
      spark(g, 120, 118, r, c.t * 0.9, Sim.lerp565(c.bg, CORAL, 0.3 + 0.7 * grow), 18, { vary: 0.4, width: 0.05, inner: 80 / r });
    }
  },
}));

/* ---- Claude Code: the terminal side ------------------------------------------------------ */

Sim.register(FaceRig.animation({
  name: 'Claude: pondering', theme: 'claude', fps: 20, duration: 6000,
  colors: COLORS,
  tracks: {
    headY: [[0, -8]],
    lookX: [[0, 6], [1500, -6], [3000, 8], [4500, -4], [6000, 6]],
    lookY: [[0, -9]],
    lid: [[0, 0.15]],
    mouthCurve: [[0, 0.15]], mouthWidth: [[0, 10]],
    open: [[0, 1], [2400, 1, 'linear'], [2480, 0, 'linear'], [2560, 1]],
  },
}, {
  over(g, c) {
    const words = ['Pondering…', 'Noodling…', 'Brewing…', 'Crafting…'];
    const w = words[Math.floor(c.t / 1.5) % words.length];
    cliSpinner(g, 50, 192, Math.floor(c.t * 8), CORAL);
    g.text(66, 192, w, CORAL, { size: 17, weight: 'bold', font: 'Arial, Helvetica, sans-serif', baseline: 'middle' });
    const secs = Math.floor(c.t) + 3, tok = (1.2 + c.t * 0.35).toFixed(1);
    mono(g, 66, 212, `(${secs}s · ↑ ${tok}k tokens)`, STONE, 10);
  },
}));

/* Syntax-highlighted code as coloured token bars: [width, colour] per token. */
const CODE = [
  [[18, CORAL], [30, BLUE], [6, STONE], [14, CREAM], [6, STONE]],
  [[10, null], [22, CORAL], [26, CREAM], [8, STONE]],
  [[10, null], [16, CREAM], [8, STONE], [34, GREEN], [6, STONE]],
  [[10, null], [26, CORAL], [12, YELLOW], [6, STONE]],
  [[6, STONE]],
  [[18, CORAL], [24, BLUE], [6, STONE], [22, CREAM]],
  [[10, null], [26, CORAL], [30, CREAM], [6, STONE]],
];

const CODING = FaceRig.normalize({
  name: 'Claude: coding', theme: 'claude', fps: 20, duration: 6400, colors: COLORS,
  tracks: Object.assign({}, CODE_FACE, {
    lid: [[0, 0.2], [5600, 0.2], [5800, 0]],
    mouthCurve: [[0, 0.1], [5600, 0.1], [5800, 0.9]], mouthWidth: [[0, 10], [5600, 10], [5800, 22]],
    blush: [[0, 0], [5650, 0], [5800, 0.7]],
    open: [[0, 1], [3000, 1, 'linear'], [3080, 0, 'linear'], [3160, 1]],
  }),
});
Sim.register({
  name: CODING.name, theme: CODING.theme, fps: CODING.fps, duration: CODING.duration,
  frame(g, f) {
    const t = f.t / 1000, perLine = 0.75;
    const typed = Math.min(CODE.length, t / perLine);                    // lines typed so far (fractional)
    const li = Math.min(CODE.length - 1, Math.floor(typed)), u = typed - li;
    const x0 = 72, y0 = 168, lh = 8, maxLines = 6, first = Math.max(0, li - maxLines + 1);
    let curX = x0, curY = y0 + (li - first) * lh;
    const lineWidth = toks => toks.reduce((a, [w]) => a + w + 2, 0);
    if (typed < CODE.length) curX = x0 + Math.round(lineWidth(CODE[li]) * u);
    else curX = x0 + lineWidth(CODE[CODE.length - 1]);
    const v = FaceRig.valuesAt(CODING, f.t);
    v.lookX = Math.round((curX - 120) / 4);
    v.lookY = 12;
    FaceRig.draw(g, v, f.t, CODING, {
      over(g, c) {
        terminal(g, 62, 152, 116, 68);
        for (let k = first; k <= li; k++) {
          let x = x0;
          const limit = k < li || typed >= CODE.length ? Infinity : Math.round(lineWidth(CODE[k]) * u);
          for (const [w, col] of CODE[k]) {
            const vis = Math.max(0, Math.min(w, limit - (x - x0)));
            if (col && vis > 0) g.fillRect(x, y0 + (k - first) * lh - 1, vis, 3, col);
            x += w + 2;
          }
        }
        if (Math.floor(t * 3) % 2 === 0) g.fillRect(curX + 1, curY - 3, 4, 7, CREAM);
        if (typed < CODE.length) cliSpinner(g, 166, 160, Math.floor(t * 8), CORAL);
        else check(g, 166, 160, 5, GREEN);
      },
    }, f);
  },
});

const TESTS = FaceRig.normalize({
  name: 'Claude: tests pass', theme: 'claude', fps: 20, duration: 5200, colors: COLORS,
  tracks: Object.assign({}, CODE_FACE, {
    lookY: [[0, 12]],
    lid: [[0, 0.25], [3000, 0.25], [3150, 0]],
    brows: [[0, 1]], browRaise: [[0, 4], [3000, 4], [3150, 14]], browTilt: [[0, -6], [3000, -6], [3150, 0]],
    mouthCurve: [[0, 0], [3000, 0], [3150, 1]], mouthWidth: [[0, 10], [3000, 10], [3200, 24]],
    mouthOpen: [[0, 0], [3000, 0], [3200, 0.55, 'pop'], [4800, 0.55], [5100, 0]],
    squint: [[0, 0], [3000, 0], [3200, 1, 'pop'], [4800, 1], [5100, 0]],
    blush: [[0, 0], [3100, 0], [3250, 0.8], [4800, 0.8], [5000, 0]],
    sparkle: [[0, 0], [3150, 0], [3300, 1], [4600, 1], [4900, 0]],
  }),
});
Sim.register({
  name: TESTS.name, theme: TESTS.theme, fps: TESTS.fps, duration: TESTS.duration,
  frame(g, f) {
    const t = f.t / 1000;
    const dots = Math.max(0, Math.min(16, Math.floor((t - 1.0) / 0.12)));
    const v = FaceRig.valuesAt(TESTS, f.t);
    if (t < 3.0) v.lookX = dots ? Math.round((76 + dots * 6 - 120) / 4) : -8;      // watching the dots
    FaceRig.draw(g, v, f.t, TESTS, {
      over(g, c) {
        terminal(g, 62, 152, 116, 68);
        const cmd = '$ npm test', n = Math.max(0, Math.min(cmd.length, Math.floor(t / 0.08)));
        mono(g, 70, 172, cmd.slice(0, n), CREAM);
        if (n > 0) mono(g, 70, 172, '$', CORAL);
        for (let k = 0; k < dots; k++) g.fillCircle(76 + k * 6, 188, 2, GREEN);
        if (t >= 3.0) {
          check(g, 78, 204, 5, GREEN);
          mono(g, 90, 205, '42 passed', GREEN, 12, 'bold');
        } else if (t > 1.0) cliSpinner(g, 166, 160, Math.floor(t * 8), CORAL);
      },
    }, f);
  },
});

/* A bug crawling along the bottom. */
function bug(g, x, y, t, squash) {
  const body = Sim.hex('#c0392b');
  if (squash > 0) { g.fillEllipse(x, y + 3, Math.round(10 + 6 * squash), Math.max(2, Math.round(7 * (1 - squash))), Sim.lerp565(body, INK, 0.3)); return; }
  for (let k = -1; k <= 1; k++) for (const s of [-1, 1]) {
    const wig = Math.round(2 * Math.sin(t * 20 + k * 2 + s));
    g.drawLine(x + k * 5, y, x + k * 5 + wig, y + s * 10, Sim.hex('#8a3a2a'));
  }
  g.fillEllipse(x, y, 10, 7, body);
  g.drawFastVLine(x, y - 7, 14, Sim.hex('#5a1a12'));
  g.fillCircle(x + 10, y, 4, Sim.hex('#5a1a12'));
  g.drawLine(x + 12, y - 2, x + 18, y - 8, Sim.hex('#5a1a12'));
  g.drawLine(x + 12, y + 2, x + 18, y + 8, Sim.hex('#5a1a12'));
}

const DEBUG = FaceRig.normalize({
  name: 'Claude: debugging', theme: 'claude', fps: 24, duration: 5000, colors: COLORS,
  tracks: {
    headY: [[0, -10]],
    brows: [[0, 1], [3300, 1], [3400, 0]], browTilt: [[0, 8]], browRaise: [[0, 4]],
    lid: [[0, 0.3], [3200, 0.3], [3350, 0]],
    mouthCurve: [[0, 0], [3200, 0], [3400, 1]], mouthWidth: [[0, 10], [3200, 10], [3400, 26]],
    mouthOpen: [[0, 0], [3300, 0], [3450, 0.5], [4700, 0.5], [4950, 0]],
    squint: [[0, 0], [3300, 0], [3450, 1, 'pop'], [4700, 1], [4950, 0]],
    blush: [[0, 0], [3350, 0], [3500, 0.8], [4800, 0.8], [4950, 0]],
  },
});
Sim.register({
  name: DEBUG.name, theme: DEBUG.theme, fps: DEBUG.fps, duration: DEBUG.duration,
  frame(g, f) {
    const t = f.t / 1000;
    const caught = t >= 3.0;
    const bx = caught ? 132 : 52 + Math.round(80 * Face.kf(t, [[0, 0], [3.0, 1]])) + Math.round(16 * Math.sin(t * 2.2)), by = 198 + Math.round(4 * Math.sin(t * 5));
    const lens = Face.kf(t, [[0, 0], [2.9, 1]]);
    const mx = caught ? bx : Math.round(bx - 26 + 26 * lens), my = by - 6;
    const v = FaceRig.valuesAt(DEBUG, f.t);
    if (!caught) { v.lookX = Math.round((bx - 120) / 5); v.lookY = 12; }
    FaceRig.draw(g, v, f.t, DEBUG, {
      over(g, c) {
        const squash = Face.kf(t, [[3.0, 0], [3.15, 1]]);
        if (t < 3.6) bug(g, bx, by, t, squash);
        if (t >= 3.4) {
          const pop = Face.kf(t, [[3.4, 0], [3.6, 1, 'pop']]);
          check(g, 132, 196, Math.round(9 * pop), GREEN);
          if (pop > 0.9) g.text(150, 196, 'fixed', GREEN, { size: 14, weight: 'bold', font: 'Arial, Helvetica, sans-serif', baseline: 'middle' });
        }
        if (t < 3.3) {                                                         // magnifying glass
          g.drawCircle(mx, my, 15, CREAM); g.drawCircle(mx, my, 16, CREAM);
          for (let d = -1; d <= 1; d++) g.drawLine(mx + 11 + d, my + 11, mx + 24 + d, my + 24, Sim.hex('#b0896a'));
        }
      },
    }, f);
  },
});

Sim.register(FaceRig.animation({
  name: 'Claude: ship it', theme: 'claude', fps: 20, duration: 5600,
  colors: COLORS,
  tracks: Object.assign({}, CODE_FACE, {
    lookY: [[0, 12], [2600, 12], [2900, -12], [3700, -12], [4100, 0]],
    lookX: [[0, -4], [2600, 2], [2900, 10], [3700, 10], [4100, 0]],
    mouthCurve: [[0, 0.4], [2500, 0.4], [2700, 1]], mouthWidth: [[0, 16], [2700, 26]],
    mouthOpen: [[0, 0], [2600, 0], [2800, 0.6, 'pop'], [4900, 0.5], [5300, 0]],
    squint: [[0, 0], [3700, 0], [3900, 1], [5000, 1], [5300, 0]],
    blush: [[0, 0], [2700, 0], [2850, 0.8], [5100, 0.8], [5300, 0]],
    sparkle: [[0, 0], [3800, 0], [4000, 1], [5000, 1], [5300, 0]],
  }),
}, {
  over(g, c) {
    terminal(g, 62, 152, 116, 68);
    const t = c.t, cmd = '$ git push', n = Math.max(0, Math.min(cmd.length, Math.floor((t - 0.2) / 0.09)));
    mono(g, 70, 172, cmd.slice(0, n), CREAM);
    if (n > 0) mono(g, 70, 172, '$', CORAL);
    if (t > 1.3) {                                                            // upload progress
      const p = Math.min(1, (t - 1.3) / 1.1);
      g.drawRect(70, 184, 64, 7, STONE);
      g.fillRect(72, 186, Math.round(60 * p), 3, CORAL);
      mono(g, 140, 188, Math.round(p * 100) + '%', STONE, 9);
    }
    if (t > 2.5) { check(g, 76, 205, 5, GREEN); mono(g, 88, 206, 'main → origin', GREEN, 11, 'bold'); }
    // and off it goes
    const fly = Face.kf(t, [[2.6, 0], [3.8, 1]]);
    if (t > 2.6 && t < 3.9) {
      const rx = 196 + Math.round(16 * fly), ry = 148 - Math.round(104 * fly);     // up the right side, clear of the eye
      const fl = 5 + Math.round(4 * Math.abs(Math.sin(t * 30)));
      g.fillTriangle(rx - 4, ry + 9, rx + 4, ry + 9, rx, ry + 9 + fl + 4, YELLOW);
      g.fillTriangle(rx - 8, ry + 8, rx - 3, ry + 2, rx - 3, ry + 9, CORAL);
      g.fillTriangle(rx + 8, ry + 8, rx + 3, ry + 2, rx + 3, ry + 9, CORAL);
      g.fillRoundRect(rx - 4, ry - 8, 9, 18, 4, CREAM);
      g.fillTriangle(rx - 4, ry - 6, rx + 4, ry - 6, rx, ry - 14, CORAL);
      g.fillCircle(rx, ry - 1, 2, BLUE);
    }
  },
}));
