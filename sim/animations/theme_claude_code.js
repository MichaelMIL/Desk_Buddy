/* Claude theme, part two: everyday Claude Code moments.
 * Reading, grep, editing a diff, a todo list, a permission prompt, a failing build, a merge
 * conflict, code review, CI, subagents, compacting, a rubber duck, an infinite loop, a git
 * graph, plan mode, and done. Shared drawing comes from claude_kit.js. */
const { CORAL, CREAM, INK, STONE, COLORS, TERM, GREEN, RED, YELLOW, BLUE, MONO, CODE_FACE,
        spark, terminal, mono, check, cross, label, codeBars, cliSpinner, miniBuddy } = ClaudeKit;

const TX = 62, TY = 152, TW = 116, TH = 68;                       // the terminal box under the face
const LINES = [
  [[18, CORAL], [30, BLUE], [6, STONE], [14, CREAM], [6, STONE]],
  [[10, null], [22, CORAL], [26, CREAM], [8, STONE]],
  [[10, null], [16, CREAM], [8, STONE], [34, GREEN], [6, STONE]],
  [[10, null], [26, CORAL], [12, YELLOW], [6, STONE]],
  [[6, STONE]],
  [[18, CORAL], [24, BLUE], [6, STONE], [22, CREAM]],
  [[10, null], [14, CREAM], [8, STONE], [28, BLUE], [6, STONE]],
  [[10, null], [26, CORAL], [30, CREAM], [6, STONE]],
];
const dim = toks => toks.map(([w, c]) => [w, c ? STONE : null]);
const tint = (toks, col) => toks.map(([w, c]) => [w, c ? col : null]);
const fade = (a, b, x) => Sim.lerp565(a, b, Math.max(0, Math.min(1, x)));
const kf = (t, pts) => Face.kf(t, pts);
const between = (t, a, b) => t >= a && t < b;

function spec(name, ms, tracks, base = CODE_FACE, fps = 20) {
  return FaceRig.normalize({ name, theme: 'claude', fps, duration: ms, colors: COLORS, tracks: Object.assign({}, base, tracks) });
}
/* Register a rig face with drawing hooks; adjust(v, t, f) may tweak the face values per frame. */
function rig(s, hooks, adjust) {
  Sim.register({
    name: s.name, theme: s.theme, fps: s.fps, duration: s.duration,
    frame(g, f) {
      const v = FaceRig.valuesAt(s, f.t);
      if (adjust) adjust(v, f.t / 1000, f);
      FaceRig.draw(g, v, f.t, s, hooks, f);
    },
  });
}
const HAPPY_END = (from, to = from + 1200) => ({
  squint: [[0, 0], [from, 0], [from + 200, 1, 'pop'], [to, 1], [to + 300, 0]],
  mouthCurve: [[0, 0.2], [from, 0.2], [from + 150, 1]],
  mouthOpen: [[0, 0], [from, 0], [from + 200, 0.55, 'pop'], [to, 0.5], [to + 300, 0]],
  mouthWidth: [[0, 12], [from, 12], [from + 200, 26]],
  blush: [[0, 0], [from + 100, 0], [from + 250, 0.8], [to, 0.8], [to + 200, 0]],
});

// 1. reading a file
rig(spec('Claude: reading', 5000, {
  lookY: [[0, 12]], lid: [[0, 0.15]], mouthCurve: [[0, 0.3]], mouthWidth: [[0, 12]],
  open: [[0, 1], [2600, 1, 'linear'], [2680, 0, 'linear'], [2760, 1]],
}), {
  over(g, c) {
    terminal(g, TX, TY, TW, TH);
    mono(g, 70, 172, 'Read', CORAL, 11, 'bold'); mono(g, 104, 172, 'app.ts', CREAM, 11);
    const scroll = c.t * 18, first = Math.floor(scroll / 8), off = scroll % 8;
    for (let k = 0; k < 5; k++) {
      const y = 188 + k * 8 - Math.round(off);
      if (y >= 182 && y <= 214) codeBars(g, 72, y, LINES[(first + k) % LINES.length]);
    }
    g.text(172, 172, 'L' + Math.min(240, 12 + Math.floor(c.t * 46)), STONE, { size: 10, font: MONO, align: 'right', baseline: 'middle' });
  },
}, (v, t) => { v.lookX = Math.round(10 * Math.sin(t * 7)); });

// 2. grep
rig(spec('Claude: searching', 5000, Object.assign({
  lookY: [[0, 11]], brows: [[0, 1], [3500, 1], [3600, 0]], browRaise: [[0, 6]], browTilt: [[0, -4]],
}, HAPPY_END(3600, 4500))), {
  over(g, c) {
    terminal(g, TX, TY, TW, TH);
    mono(g, 70, 172, 'Grep', CORAL, 11, 'bold'); mono(g, 104, 172, '"useState"', GREEN, 10);
    const found = [c.t > 1.3, c.t > 2.7];
    const row = c.t < 3.4 ? Math.floor((c.t * 2.5) % 5) : -1;
    for (let k = 0; k < 5; k++) {
      const y = 184 + k * 8, hit = (k === 1 && found[0]) || (k === 3 && found[1]);
      if (k === row) g.fillRect(64, y - 4, 112, 8, fade(TERM, YELLOW, 0.22));
      if (hit) g.fillRect(64, y - 4, 3, 8, YELLOW);
      codeBars(g, 72, y, hit ? LINES[k + 1] : dim(LINES[k + 1]));
    }
    const n = found.filter(Boolean).length;
    g.text(172, 159, `${n} match${n === 1 ? '' : 'es'}`, n ? YELLOW : STONE, { size: 10, font: MONO, align: 'right', baseline: 'middle' });   // in the title bar
  },
}, (v, t) => { if (t < 3.4) v.lookY = 8 + Math.floor((t * 2.5) % 5) * 2; });

// 3. editing: a diff
rig(spec('Claude: editing', 5200, Object.assign({
  lookY: [[0, 11]], lid: [[0, 0.2], [3300, 0.2], [3400, 0]],
}, HAPPY_END(3400, 4600))), {
  over(g, c) {
    terminal(g, TX, TY, TW, TH);
    mono(g, 70, 172, 'Edit', CORAL, 11, 'bold'); mono(g, 104, 172, 'app.ts', CREAM, 11);
    codeBars(g, 80, 184, dim(LINES[1]));
    const del = kf(c.t, [[0.8, 0], [1.3, 1]]), add = kf(c.t, [[1.6, 0], [3.0, 1]]);
    if (del > 0) g.fillRect(64, 188, 112, 8, fade(TERM, RED, 0.3 * del));
    mono(g, 68, 192, '-', RED, 11, 'bold'); codeBars(g, 80, 192, tint(LINES[2], RED));
    if (add > 0) { g.fillRect(64, 196, 112, 8, fade(TERM, GREEN, 0.3)); mono(g, 68, 200, '+', GREEN, 11, 'bold'); codeBars(g, 80, 200, tint(LINES[3], GREEN), Math.round(90 * add)); }
    codeBars(g, 80, 208, dim(LINES[5]));
    if (c.t > 3.2) check(g, 166, 172, 5, GREEN); else if (c.t > 0.6) cliSpinner(g, 166, 172, Math.floor(c.t * 8), CORAL);
  },
}, (v, t) => { const add = kf(t, [[1.6, 0], [3.0, 1]]); if (t < 3.3) v.lookX = t < 1.6 ? -6 : Math.round(-8 + 18 * add); });

// 4. a todo list
rig(spec('Claude: todo list', 6400, Object.assign({ lookY: [[0, 11]] }, HAPPY_END(5300, 6000))), {
  over(g, c) {
    terminal(g, TX, TY, TW, TH);
    mono(g, 70, 172, 'Todos', CORAL, 11, 'bold');
    const widths = [[60, 18], [46, 30], [70, 12], [52, 24]];
    for (let k = 0; k < 4; k++) {
      const y = 184 + k * 9, start = 0.4 + k * 1.2, state = c.t < start ? 0 : c.t < start + 1.2 ? 1 : 2;
      if (state === 0) g.drawRect(68, y - 3, 7, 7, STONE);
      else if (state === 1) spark(g, 71, y, 5, c.t * 4, CORAL, 6, { vary: 0.1, width: 0.2 });
      else check(g, 72, y, 3, GREEN);
      const col = state === 2 ? STONE : state === 1 ? CREAM : Sim.lerp565(TERM, CREAM, 0.6);
      codeBars(g, 82, y, [[widths[k][0], col], [widths[k][1], col]]);
      if (state === 2) g.drawFastHLine(80, y + 1, widths[k][0] + widths[k][1] + 6, STONE);
    }
    g.text(172, 172, `${Math.max(0, Math.min(4, Math.floor((c.t - 0.4) / 1.2)))}/4`, STONE, { size: 10, font: MONO, align: 'right', baseline: 'middle' });
  },
}, (v, t) => { if (t < 5.2) v.lookY = 8 + Math.min(3, Math.floor(Math.max(0, t - 0.4) / 1.2)) * 2; });

// 5. a permission prompt
rig(spec('Claude: permission', 5200, {
  eyeSize: [[0, 0.95], [2700, 0.95], [2900, 0.9]], iris: [[0, 18], [2700, 18], [2900, 16]], pupil: [[0, 0.6], [2700, 0.6], [2900, 0.5]],
  lookY: [[0, -3], [2700, -3], [2900, 10]],
  brows: [[0, 1], [2700, 1], [2800, 0]], browRaise: [[0, 12]], browTilt: [[0, -10]],
  blush: [[0, 0.5], [2800, 0.9], [4600, 0.9], [4800, 0]],
  mouthCurve: [[0, 0.3], [2700, 0.3], [2850, 1]], mouthWidth: [[0, 10], [2800, 24]],
  squint: [[0, 0], [2700, 0], [2900, 1, 'pop'], [3700, 1], [4000, 0]],
}), {
  over(g, c) {
    if (c.t < 3.1) {
      const pop = kf(c.t, [[0.2, 0], [0.5, 1, 'pop']]);
      if (pop <= 0.02) return;
      const w = Math.round(124 * pop), h = Math.round(58 * pop);
      g.fillRoundRect(120 - (w >> 1), 156, w, h, 8, CREAM);
      if (pop < 0.95) return;
      mono(g, 66, 170, 'Run', INK, 11, 'bold'); mono(g, 92, 170, 'npm install?', INK, 11);
      const pressed = c.t > 2.6;
      g.fillRoundRect(70, 186, 44, 18, 9, pressed ? GREEN : Sim.lerp565(CREAM, GREEN, 0.35));
      g.drawRoundRect(70, 186, 44, 18, 9, Sim.hex('#3c7d4a'));
      label(g, 92, 195, 'Yes', INK, 12, 'center');
      g.drawRoundRect(126, 186, 44, 18, 9, STONE);
      label(g, 148, 195, 'No', STONE, 12, 'center');
      if (!pressed && Math.floor(c.t * 2) % 2 === 0) g.drawRoundRect(68, 184, 48, 22, 11, CORAL);   // blinking focus
    } else {
      terminal(g, TX, TY, TW, TH);
      cliSpinner(g, 80, 186, Math.floor(c.t * 8), CORAL);
      label(g, 94, 186, 'Installing…', CORAL, 13);
      const p = Math.min(1, (c.t - 3.1) / 1.8);
      g.fillRect(72, 204, Math.round(96 * p), 3, GREEN);
    }
  },
}, null);

// 6. the build breaks, then gets fixed
rig(spec('Claude: build failed', 6600, {
  lookY: [[0, 11], [2000, 11], [2200, -2], [3000, 4], [3600, 11]],
  eyeSize: [[0, 0.9], [2000, 0.9], [2150, 1.05], [2900, 0.9]], iris: [[0, 16], [2000, 16], [2150, 10], [2900, 16]],
  mouthCurve: [[0, 0.3], [2000, 0.3], [2150, 0], [2900, -0.7], [3500, -0.7], [3700, 0], [5100, 0], [5250, 1]],
  mouthOpen: [[0, 0], [2000, 0], [2150, 0.6], [2800, 0.6], [2950, 0], [5100, 0], [5300, 0.55, 'pop'], [6200, 0.5], [6500, 0]],
  mouthWidth: [[0, 14], [5100, 14], [5300, 26]],
  tears: [[0, 0], [2900, 0], [3100, 0.6], [3500, 0.6], [3600, 0]],
  brows: [[0, 0], [3500, 0], [3600, 1], [5100, 1], [5200, 0]], browTilt: [[0, 12]], browRaise: [[0, 2]],
  lid: [[0, 0], [3500, 0], [3600, 0.25], [5100, 0.25], [5200, 0]],
  squint: [[0, 0], [5100, 0], [5300, 1, 'pop'], [6200, 1], [6500, 0]],
  sparkle: [[0, 0], [5200, 0], [5400, 1], [6100, 1], [6400, 0]],
}), {
  over(g, c) {
    terminal(g, TX, TY, TW, TH);
    const cmd = '$ npm run build', n = Math.max(0, Math.min(cmd.length, Math.floor((c.t - 0.2) / 0.07)));
    mono(g, 70, 172, cmd.slice(0, n), CREAM, 10);
    if (n) mono(g, 70, 172, '$', CORAL, 10);
    if (between(c.t, 1.4, 2.0)) cliSpinner(g, 80, 190, Math.floor(c.t * 8), CORAL);
    else if (between(c.t, 2.0, 3.6)) {
      cross(g, 78, 188, 4, RED); label(g, 90, 188, '3 errors', RED, 12);
      codeBars(g, 72, 200, tint(LINES[2], RED)); codeBars(g, 72, 208, tint(LINES[7], RED));
    } else if (between(c.t, 3.6, 5.1)) {
      cliSpinner(g, 80, 190, Math.floor(c.t * 8), CORAL); label(g, 94, 190, 'Fixing…', CORAL, 13);
    } else if (c.t >= 5.1) {
      check(g, 78, 190, 5, GREEN); label(g, 90, 190, 'Build passed', GREEN, 12);
    }
  },
}, null);

// 7. a merge conflict
rig(spec('Claude: merge conflict', 5600, Object.assign({
  brows: [[0, 1], [3300, 1], [3400, 0]], browRaise: [[0, 10]], browTilt: [[0, -8]],
  lookY: [[0, 6], [700, 13], [1300, 6], [1900, 13], [2500, 6], [3300, 10]],
}, HAPPY_END(3700, 5000))), {
  over(g, c) {
    terminal(g, TX, TY, TW, TH);
    const m = kf(c.t, [[3.1, 0], [3.6, 1]]);                       // markers fade, halves slide together
    if (m < 1) {
      const fa = 1 - m;
      g.text(70, 172 + Math.round(18 * m), '<<<<<<< HEAD', fade(TERM, RED, fa), { size: 10, font: MONO, baseline: 'middle' });
      g.text(70, 190, '=======', fade(TERM, STONE, fa), { size: 10, font: MONO, baseline: 'middle' });
      g.text(70, 208 - Math.round(18 * m), '>>>>>>> main', fade(TERM, BLUE, fa), { size: 10, font: MONO, baseline: 'middle' });
      codeBars(g, 72, 181 + Math.round(9 * m), tint(LINES[1], CORAL));
      codeBars(g, 72, 199 - Math.round(9 * m), tint(LINES[3], BLUE));
      if (c.t < 3.1) label(g, 200, 44, '?', CORAL, 24, 'center');
    } else {
      codeBars(g, 72, 190, LINES[5]);
      check(g, 78, 206, 4, GREEN); label(g, 88, 206, 'resolved', GREEN, 11);
    }
  },
}, null);

// 8. code review
rig(spec('Claude: code review', 5400, Object.assign({
  lookY: [[0, 9], [800, 11], [1600, 13], [2400, 15]],
}, HAPPY_END(3200, 4800), { headY: [[0, -18], [3200, -18], [3400, -14], [3600, -18], [3800, -14], [4000, -18]] })), {
  over(g, c) {
    terminal(g, TX, TY, TW, TH);
    mono(g, 70, 172, 'PR #42', CORAL, 11, 'bold');
    for (let k = 0; k < 4; k++) codeBars(g, 72, 184 + k * 8, k === 1 ? tint(LINES[2], GREEN) : LINES[k + 3]);
    for (const [t0, y] of [[1.0, 184], [2.0, 200]]) {
      const p = kf(c.t, [[t0, 0], [t0 + 0.25, 1, 'pop']]);
      if (p > 0.05 && c.t < 3.1) {
        g.fillRoundRect(146, y - 6, Math.round(28 * p), 12, 4, CREAM);
        if (p > 0.9) for (let d = 0; d < 3; d++) g.fillCircle(153 + d * 7, y, 1, INK);
      }
    }
    const a = kf(c.t, [[3.0, 0], [3.3, 1, 'pop']]);
    if (a > 0.05) {
      g.fillRoundRect(80, 182, 80, 26, 8, fade(TERM, GREEN, 0.3 * a));
      g.drawRoundRect(80, 182, 80, 26, 8, GREEN);
      check(g, 94, 195, 5, GREEN); label(g, 104, 195, 'Approved', GREEN, 12);
    }
  },
}, null);

// 9. CI pipeline
rig(spec('Claude: ci pipeline', 6000, Object.assign({ lookY: [[0, 10]] }, HAPPY_END(4700, 5600))), {
  over(g, c) {
    const xs = [74, 120, 166], names = ['build', 'test', 'deploy'];
    for (let i = 0; i < 3; i++) {
      const start = 0.6 + i * 1.4, done = c.t >= start + 1.2, active = between(c.t, start, start + 1.2);
      if (i < 2) {
        const p = Math.max(0, Math.min(1, (c.t - start - 1.2) / 0.3));
        g.fillRect(xs[i] + 12, 185, 22, 3, STONE);
        if (p > 0) g.fillRect(xs[i] + 12, 185, Math.round(22 * p), 3, GREEN);
      }
      if (done) { g.fillCircle(xs[i], 186, 12, GREEN); check(g, xs[i], 186, 5, INK); }
      else if (active) { g.drawCircle(xs[i], 186, 12, CORAL); spark(g, xs[i], 186, 8, c.t * 4, CORAL, 8, { vary: 0.1, width: 0.12 }); }
      else { g.drawCircle(xs[i], 186, 12, STONE); g.drawCircle(xs[i], 186, 11, STONE); }
      g.text(xs[i], 208, names[i], done ? GREEN : STONE, { size: 10, font: MONO, align: 'center', baseline: 'middle' });
    }
  },
}, (v, t) => { if (t < 4.7) v.lookX = Math.round((([74, 120, 166][Math.min(2, Math.floor(Math.max(0, t - 0.6) / 1.4))]) - 120) / 4); });

// 10. subagents
const SPOTS = [[46, 176], [120, 212], [194, 176]];
rig(spec('Claude: subagents', 6400, Object.assign({
  headY: [[0, -14]], lookY: [[0, 8]],
}, HAPPY_END(5000, 6000)), {}), {
  over(g, c) {
    const out = kf(c.t, [[0.5, 0], [1.2, 1, 'pop']]), back = kf(c.t, [[4.3, 0], [5.0, 1]]);
    SPOTS.forEach(([tx, ty], i) => {
      const k = back > 0 ? 1 - back : out, x = Math.round(120 + (tx - 120) * k), y = Math.round(150 + (ty - 150) * k);
      if (k < 0.05) return;
      const working = between(c.t, 1.2, 3.2 + i * 0.35), done = c.t >= 3.2 + i * 0.35 && back === 0;
      if (working) for (let d = 1; d < 6; d++) g.fillCircle(Math.round(120 + (x - 120) * d / 6), Math.round(150 + (y - 150) * d / 6), 1, STONE);
      miniBuddy(g, x, y, Math.round(11 * Math.min(1, 0.4 + k)), CORAL, working ? Math.round(2 * Math.sin(c.t * 6 + i)) : 0, done);
      if (working) spark(g, x + 10, y - 12, 4, c.t * 5 + i, CREAM, 6, { vary: 0.1, width: 0.2 });
      if (done) check(g, x + 11, y - 12, 3, GREEN);
    });
  },
}, (v, t) => {
  if (t > 1.2 && t < 4.3) { const i = Math.floor(t * 1.2) % 3; v.lookX = Math.round((SPOTS[i][0] - 120) / 5); v.lookY = Math.round((SPOTS[i][1] - 98) / 7); }
});

// 11. compacting the context
rig(spec('Claude: compacting', 5600, Object.assign({
  lookY: [[0, 10]],
  lid: [[0, 0.3], [3000, 0.3], [3200, 0]], brows: [[0, 1], [3000, 1], [3100, 0]], browTilt: [[0, -10]], browRaise: [[0, 8]],
  mouthCurve: [[0, -0.2]],
}, HAPPY_END(3300, 4900))), {
  over(g, c) {
    const appear = Math.min(6, Math.floor(c.t / 0.15) + 1), sq = kf(c.t, [[1.5, 0], [2.9, 1]]);
    if (c.t < 3.0) {
      for (let k = 0; k < appear; k++) {
        const left = k % 2 === 0, w = left ? 70 : 62, x0 = left ? 66 : 110, y0 = 160 + k * 10;
        const y = Math.round(y0 + (186 - y0) * sq), h = Math.max(2, Math.round(8 * (1 - sq)));
        const x = Math.round(x0 + (70 - x0) * sq), ww = Math.round(w + (100 - w) * sq);
        g.fillRoundRect(x, y - (h >> 1), ww, h, Math.min(4, h >> 1), left ? Sim.lerp565(INK, CREAM, 0.8) : Sim.lerp565(INK, CORAL, 0.7));
      }
      const pct = Math.round(92 - 80 * sq);
      g.text(178, 152, `${pct}%`, pct > 50 ? RED : GREEN, { size: 10, font: MONO, align: 'right', baseline: 'middle' });
    } else {
      const p = kf(c.t, [[3.0, 0], [3.3, 1, 'pop']]);
      g.fillRoundRect(120 - Math.round(52 * p), 178, Math.round(104 * p), 16, 8, CORAL);
      if (p > 0.9) g.text(120, 186, 'summary', INK, { size: 10, font: MONO, weight: 'bold', align: 'center', baseline: 'middle' });
      if (c.t > 3.4) { check(g, 96, 206, 4, GREEN); label(g, 106, 206, 'compacted', GREEN, 11); }
    }
  },
}, null);

// 12. rubber duck debugging
rig(spec('Claude: rubber duck', 5600, {
  lookX: [[0, 10], [3000, 10], [3200, 0], [4600, 0], [4900, 10]], lookY: [[0, 8], [3000, 8], [3200, -6], [3800, 0]],
  mouthCurve: [[0, 0], [3000, 0], [3300, 1]],
  mouthOpen: [[0, 0], [300, 0.35], [550, 0.1], [800, 0.4], [1050, 0.1], [1300, 0.35], [1550, 0.1], [1800, 0.4], [2050, 0.1], [2300, 0.35], [2600, 0], [3100, 0], [3300, 0.6, 'pop'], [4600, 0.5], [5000, 0]],
  mouthWidth: [[0, 14], [3100, 14], [3300, 28]],
  eyeSize: [[0, 1], [3000, 1], [3150, 1.12], [3500, 1]],
  squint: [[0, 0], [3400, 0], [3600, 1], [4700, 1], [5000, 0]],
  blush: [[0, 0], [3400, 0], [3600, 0.8], [4800, 0.8], [5000, 0]],
}, {}), {
  over(g, c) {
    const bob = Math.round(2 * Math.sin(c.t * 3)), x = 188, y = 200 + bob, yel = Sim.hex('#ffd23d');
    g.fillEllipse(x, y + 6, 22, 13, yel);
    g.fillCircle(x + 8, y - 10, 10, yel);
    g.fillTriangle(x - 1, y - 12, x - 1, y - 6, x - 10, y - 9, Sim.hex('#ff8a1a'));
    g.fillCircle(x + 5, y - 13, 2, INK);
    g.drawArc(x + 6, y + 4, 12, 9, 200, 300, Sim.hex('#e0b020'));
    if (c.t < 2.6) for (let k = 0; k < 3; k++) {
      const u = ((c.t * 1.5) + k / 3) % 1;
      g.drawArc(140, 168, 10 + Math.round(18 * u), 8 + Math.round(18 * u), 50, 100, fade(INK, CREAM, 1 - u));
    }
    const idea = kf(c.t, [[3.0, 0], [3.2, 1, 'pop'], [4.4, 1], [4.8, 0]]);
    if (idea > 0.03) spark(g, 120, 30, Math.round(16 * idea), c.t * 2, CORAL);
    if (between(c.t, 3.6, 4.6)) label(g, 196, 172, 'quack', CREAM, 11, 'center');
  },
}, null);

// 13. an infinite loop
rig(spec('Claude: infinite loop', 4600, {
  iris: [[0, 6], [2900, 6], [3100, 16]], pupil: [[0, 0.3], [2900, 0.3], [3100, 0.5]],
  shake: [[0, 0.15], [2800, 0.4], [2900, 0]],
  mouthCurve: [[0, -0.3], [2800, -0.3], [3100, 0.8]], mouthOpen: [[0, 0.3], [2800, 0.3], [3000, 0]],
  mouthWidth: [[0, 14], [3000, 22]],
  blush: [[0, 0], [3000, 0], [3200, 0.7], [4300, 0.7], [4500, 0]],
}, {}), {
  over(g, c) {
    const run = c.t < 2.9, speed = 2 + 10 * Math.min(1, c.t / 2.9);
    const rot = run ? (c.t * c.t * 3 + c.t * speed) : 0;
    if (run) {
      for (const cx of [Face.LX + c.dx, Face.RX + c.dx]) {                 // dizzy spiral eyes
        let px = cx, py = Face.EY + c.dy;
        for (let k = 1; k < 40; k++) {
          const a = k * 0.45 + rot, r = k * 0.62;
          const x = cx + Math.round(r * Math.cos(a)), y = Face.EY + c.dy + Math.round(r * Math.sin(a));
          g.drawLine(px, py, x, y, INK); px = x; py = y;
        }
      }
      const a0 = ((rot * 30) % 360 + 360) % 360, a1 = (a0 + 290) % 360;     // the loop arrow around the face
      if (a0 < a1) g.drawArc(120, 120, 112, 106, a0, a1, CORAL);
      else { g.drawArc(120, 120, 112, 106, a0, 360, CORAL); g.drawArc(120, 120, 112, 106, 0, a1, CORAL); }
      const ar = (a1 - 90) * Math.PI / 180, hx = 120 + Math.round(109 * Math.cos(ar)), hy = 120 + Math.round(109 * Math.sin(ar));
      const ta = ar + Math.PI / 2;
      g.fillTriangle(hx - Math.round(8 * Math.cos(ar)), hy - Math.round(8 * Math.sin(ar)), hx + Math.round(8 * Math.cos(ar)), hy + Math.round(8 * Math.sin(ar)),
                     hx + Math.round(12 * Math.cos(ta)), hy + Math.round(12 * Math.sin(ta)), CORAL);
    } else {
      label(g, 120, 200, 'break;', CORAL, 18, 'center');
    }
  },
}, null);

// 14. a git graph
rig(spec('Claude: git graph', 6000, Object.assign({ lookY: [[0, 10]] }, HAPPY_END(4300, 5400))), {
  over(g, c) {
    const appear = (t0) => kf(c.t, [[t0, 0], [t0 + 0.25, 1, 'pop']]);
    g.fillRect(46, 185, 150, 3, STONE);                                     // main
    const fork = kf(c.t, [[1.0, 0], [1.4, 1]]), join = kf(c.t, [[3.4, 0], [3.8, 1]]);
    if (fork > 0) g.drawLine(92, 186, 92 + Math.round(16 * fork), 186 - Math.round(18 * fork), CORAL);
    if (fork >= 1) { const run = kf(c.t, [[1.4, 0], [3.4, 1]]); g.fillRect(108, 167, Math.round(54 * run), 3, CORAL); }
    if (join > 0) g.drawLine(162, 168, 162 + Math.round(14 * join), 168 + Math.round(18 * join), CORAL);
    const dots = [[56, 186, 0.3, BLUE], [80, 186, 0.7, BLUE], [114, 168, 1.6, CORAL], [136, 168, 2.2, CORAL], [124, 186, 2.6, BLUE], [156, 168, 3.0, CORAL]];
    for (const [x, y, t0, col] of dots) { const p = appear(t0); if (p > 0.05) g.fillCircle(x, y, Math.round(5 * p), col); }
    const mp = appear(3.9);
    if (mp > 0.05) { g.fillCircle(178, 186, Math.round(7 * mp), GREEN); g.drawCircle(178, 186, Math.round(10 * mp), GREEN); }
    if (c.t > 4.1) { check(g, 98, 206, 4, GREEN); label(g, 108, 206, 'merged', GREEN, 11); }
    if (c.t > 0.2) { g.text(46, 196, 'main', STONE, { size: 10, font: MONO, baseline: 'middle' }); }
    if (fork >= 1) g.text(112, 157, 'feature', CORAL, { size: 10, font: MONO, baseline: 'middle' });
  },
}, (v, t) => {
  const order = [[0.3, 56, 186], [0.7, 80, 186], [1.6, 114, 168], [2.2, 136, 168], [2.6, 124, 186], [3.0, 156, 168], [3.9, 178, 186]];
  let cur = order[0]; for (const o of order) if (t >= o[0]) cur = o;
  if (t < 4.3) { v.lookX = Math.round((cur[1] - 120) / 4); v.lookY = Math.round((cur[2] - 98) / 7); }
});

// 15. plan mode
rig(spec('Claude: plan mode', 5800, Object.assign({
  lookY: [[0, 11]], lid: [[0, 0.12]], brows: [[0, 1], [3500, 1], [3600, 0]], browRaise: [[0, 8]],
}, HAPPY_END(3700, 5100))), {
  over(g, c) {
    const BP = Sim.hex('#12304f'), GRID = Sim.hex('#1c4570');
    g.fillRoundRect(60, 152, 120, 66, 6, BP);
    for (let x = 68; x < 178; x += 10) g.drawFastVLine(x, 154, 62, GRID);
    for (let y = 160; y < 216; y += 10) g.drawFastHLine(62, y, 116, GRID);
    mono(g, 68, 164, 'Plan', CREAM, 11, 'bold');
    const rows = [[44, 26], [60, 18], [36, 30]];
    rows.forEach(([a, b], k) => {
      const t0 = 0.6 + k * 0.9, p = Math.max(0, Math.min(1, (c.t - t0) / 0.7));
      if (p <= 0) return;
      const y = 180 + k * 13;
      g.text(68, y, `${k + 1}.`, CORAL, { size: 10, font: MONO, weight: 'bold', baseline: 'middle' });
      codeBars(g, 84, y, [[a, c.t > 3.6 ? GREEN : CREAM], [b, c.t > 3.6 ? GREEN : Sim.lerp565(BP, CREAM, 0.6)]], Math.round((a + b + 4) * p));
    });
    if (c.t > 3.5) { check(g, 168, 164, 5, GREEN); }
  },
}, (v, t) => { if (t < 3.5) v.lookY = 9 + Math.min(2, Math.floor(Math.max(0, t - 0.6) / 0.9)) * 2; });

// 16. done
const CONF = [CORAL, CREAM, GREEN, YELLOW, BLUE];
rig(spec('Claude: done', 4600, Object.assign({
  headY: [[0, -12]], eyeSize: [[0, 0.95]],
  bob: [[0, 0], [400, 0.6], [3800, 0.6], [4300, 0]],
  sparkle: [[0, 0], [500, 1], [3900, 1], [4300, 0]],
}, HAPPY_END(300, 3900)), {}), {
  under(g, c) {
    for (let k = 0; k < 30; k++) {
      const h = Math.abs((Math.sin(k * 12.9898) * 43758.5453) % 1), h2 = Math.abs((Math.sin(k * 78.233) * 43758.5453) % 1);
      const y = Math.round(((c.t * (50 + 40 * h2)) + h * 260) % 260) - 10, x = Math.round(h2 * 240 + 6 * Math.sin(c.t * 3 + k));
      g.fillRect(x, y, Math.max(1, Math.round(5 * Math.abs(Math.cos(c.t * 6 + k)))), 4, CONF[k % CONF.length]);
    }
  },
  over(g, c) {
    const p = kf(c.t, [[0.2, 0], [0.6, 1, 'pop']]);
    if (p > 0.05) { g.fillCircle(82, 192, Math.round(15 * p), GREEN); if (p > 0.6) check(g, 82, 192, 7, INK); }
    if (c.t > 0.7) {
      label(g, 104, 184, 'Done', GREEN, 17);
      g.text(104, 202, '3 files', STONE, { size: 10, font: MONO, baseline: 'middle' });
      g.text(150, 202, '+42', GREEN, { size: 10, font: MONO, weight: 'bold', baseline: 'middle' });
      g.text(150, 214, '-7', RED, { size: 10, font: MONO, weight: 'bold', baseline: 'middle' });
    }
  },
}, null);
