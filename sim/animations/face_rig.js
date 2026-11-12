/*
 * face_rig.js - keyframed face animations, the format the animation editor
 * (sim/editor.html) reads and writes. Exposes window.FaceRig.
 *
 * A rig animation is a SPEC: name/theme/fps/duration/colors plus one keyframe
 * track per parameter. Files made by the editor look like
 *
 *   const SPEC = { name: 'Face: giggle', fps: 30, duration: 3000, colors: {...},
 *                  tracks: { squint: [[0, 0], [400, 1, 'pop']], ... } };
 *   Sim.register(FaceRig.animation(SPEC));
 *
 * A keyframe is [timeMs, value, ease?] where ease (for the segment that starts
 * at this key) is 'smooth' (default), 'linear', 'step' or 'pop' (overshoot).
 * Parameters without keys keep their default value.
 *
 * Code animations can reuse the rig for the face and add their own drawing:
 *   Sim.register(FaceRig.animation(SPEC, {
 *     under(g, c) { ... },   // after the background is cleared, before the face
 *     over(g, c) { ... },    // after the face and effects
 *   }));
 * c = { v (parameter values), t (seconds), f (frame info), dx, dy (head offset), bg }.
 * Animations with hooks open as code in the editor (the hooks are code).
 */
window.FaceRig = (() => {
  const P = (key, label, group, min, max, step, def, hint) => ({ key, label, group, min, max, step, def, hint });
  const PARAMS = [
    P('open', 'Eyes open', 'Eyes', 0, 1, 0.01, 1, 'both eyes; 0 = closed'),
    P('openL', 'Left eye open', 'Eyes', 0, 1, 0.01, 1, 'for winks'),
    P('openR', 'Right eye open', 'Eyes', 0, 1, 0.01, 1, 'for winks'),
    P('squint', 'Happy squint', 'Eyes', 0, 1, 0.01, 0, 'crescent eyes'),
    P('lid', 'Heavy lids', 'Eyes', 0, 0.9, 0.01, 0, 'sleepy / annoyed'),
    P('lookX', 'Look left/right', 'Eyes', -20, 20, 1, 0),
    P('lookY', 'Look up/down', 'Eyes', -15, 15, 1, 0),
    P('eyeSize', 'Eye size', 'Eyes', 0.6, 1.4, 0.01, 1),
    P('iris', 'Iris size', 'Eyes', 6, 24, 1, 16),
    P('pupil', 'Pupil size', 'Eyes', 0.2, 0.8, 0.01, 0.5),
    P('brows', 'Brows', 'Brows', 0, 1, 1, 0, '0 = hidden, 1 = shown'),
    P('browRaise', 'Brow height', 'Brows', -10, 30, 1, 8),
    P('browTilt', 'Brow tilt', 'Brows', -20, 20, 1, 0, '+ angry, - worried'),
    P('mouthCurve', 'Smile / frown', 'Mouth', -1, 1, 0.01, 0.6, '+ smile, 0 flat, - frown'),
    P('mouthOpen', 'Mouth open', 'Mouth', 0, 1, 0.01, 0, 'grin when smiling, "o" otherwise'),
    P('mouthWidth', 'Mouth width', 'Mouth', 8, 44, 1, 26),
    P('blush', 'Blush', 'Face', 0, 1, 0.01, 0),
    P('headX', 'Move left/right', 'Face', -24, 24, 1, 0),
    P('headY', 'Move up/down', 'Face', -24, 24, 1, 0),
    P('bob', 'Bounce', 'Face', 0, 1, 0.01, 0, 'continuous hop'),
    P('shake', 'Shake', 'Face', 0, 1, 0.01, 0, 'continuous jitter'),
    P('sparkle', 'Sparkles', 'Effects', 0, 1, 0.01, 0),
    P('hearts', 'Hearts', 'Effects', 0, 1, 0.01, 0),
    P('zzz', 'Z z z', 'Effects', 0, 1, 0.01, 0),
    P('tears', 'Tears', 'Effects', 0, 1, 0.01, 0),
    P('exclaim', 'Exclamation', 'Effects', 0, 1, 0.01, 0),
  ];
  const BY_KEY = Object.fromEntries(PARAMS.map(p => [p.key, p]));
  const FACE_KEYS = PARAMS.filter(p => !['headX', 'headY', 'bob', 'shake'].includes(p.key)).map(p => p.key);
  const DEFAULTS = Object.fromEntries(PARAMS.map(p => [p.key, p.def]));

  /* Poses set every face and effect parameter (head motion is left alone). */
  const POSES = {
    neutral: {},
    happy: { squint: 1, mouthCurve: 1, mouthOpen: 0.8, mouthWidth: 36, blush: 0.8 },
    sad: { lid: 0.35, lookY: 8, brows: 1, browRaise: 12, browTilt: -14, mouthCurve: -0.8, mouthWidth: 22, tears: 0.6 },
    angry: { lid: 0.3, brows: 1, browRaise: 0, browTilt: 16, mouthCurve: -0.6, mouthWidth: 26 },
    surprised: { eyeSize: 1.2, iris: 11, pupil: 0.3, brows: 1, browRaise: 26, mouthCurve: 0, mouthOpen: 0.8, mouthWidth: 20, exclaim: 1 },
    sleepy: { lid: 0.7, lookY: 8, mouthCurve: 0, mouthWidth: 12, zzz: 1 },
    wink: { openL: 0, mouthCurve: 1, lookX: 4, blush: 0.6 },
    love: { squint: 0.3, mouthCurve: 1, mouthOpen: 0.5, mouthWidth: 32, blush: 1, hearts: 1 },
    blink: { open: 0 },
  };
  function pose(name) {
    const out = {};
    for (const k of FACE_KEYS) out[k] = BY_KEY[k].def;
    return Object.assign(out, POSES[name] || {});
  }

  const COLORS = { bg: '#000000', iris: '#2a6cff', mouth: '#ff4f7a', blush: '#ff8fa3' };

  /** Fill in missing fields; returns a new SPEC object. */
  function normalize(spec) {
    const s = JSON.parse(JSON.stringify(spec || {}));
    s.name = s.name || 'Face: untitled';
    s.fps = Math.max(1, Math.min(60, Math.round(s.fps || 30)));
    s.duration = Math.max(100, Math.round(s.duration || 3000));
    s.colors = Object.assign({}, COLORS, s.colors || {});
    s.tracks = s.tracks || {};
    for (const k of Object.keys(s.tracks)) {
      if (!BY_KEY[k] || !Array.isArray(s.tracks[k]) || !s.tracks[k].length) { delete s.tracks[k]; continue; }
      s.tracks[k].sort((a, b) => a[0] - b[0]);
    }
    return s;
  }

  function ease(kind, u) {
    switch (kind) {
      case 'linear': return u;
      case 'step': return 0;
      case 'pop': { const c = 1.70158 * 1.4; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); }  // ease-out-back
      default: return u * u * (3 - 2 * u);
    }
  }

  /** Value of one track at time t (ms). */
  function trackValue(track, t, def) {
    if (!track || !track.length) return def;
    if (t <= track[0][0]) return track[0][1];
    for (let i = 1; i < track.length; i++) {
      if (t < track[i][0]) {
        const a = track[i - 1], b = track[i];
        const u = (t - a[0]) / Math.max(1, b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * ease(a[2], u);
      }
    }
    return track[track.length - 1][1];
  }

  function valuesAt(spec, t) {
    const v = {};
    for (const p of PARAMS) v[p.key] = trackValue(spec.tracks[p.key], t, p.def);
    return v;
  }

  // ---- drawing -----------------------------------------------------------------

  const clamp01 = x => Math.max(0, Math.min(1, x));
  const hash = n => { const x = Math.sin(n * 91.3458) * 47453.5453; return x - Math.floor(x); };

  function heart(g, x, y, s, col) {
    g.fillCircle(x - s, y, s, col);
    g.fillCircle(x + s, y, s, col);
    g.fillTriangle(x - 2 * s, y + 1, x + 2 * s, y + 1, x, y + 3 * s, col);
  }

  function draw(g, v, tms, spec, hooks, f) {
    const F = window.Face, t = tms / 1000;
    const bg = Sim.hex(spec.colors.bg), mouth = Sim.hex(spec.colors.mouth);
    const keep = { IRIS: F.IRIS, MOUTH: F.MOUTH, MOUTH_IN: F.MOUTH_IN, BLUSH: F.BLUSH };
    F.IRIS = Sim.hex(spec.colors.iris);
    F.MOUTH = mouth;
    F.MOUTH_IN = Sim.lerp565(mouth, Sim.C.BLACK, 0.55);
    F.BLUSH = Sim.hex(spec.colors.blush);
    F.background = bg;
    g.clear(bg);
    try {
      const dx = Math.round(v.headX + v.shake * 5 * Math.sin(t * 45));
      const dy = Math.round(v.headY - v.bob * 10 * Math.abs(Math.sin(t * Math.PI * 2)));
      const rx = Math.round(32 * v.eyeSize), ry = Math.round(40 * v.eyeSize);
      const hc = hooks ? { v, t, f, dx, dy, bg } : null;
      if (hooks && hooks.under) hooks.under(g, hc);

      // eyes
      for (const [cx, own] of [[F.LX, v.openL], [F.RX, v.openR]]) {
        const open = clamp01(v.open * own);
        if (open < 0.12 && v.squint < 0.5) {
          g.fillRoundRect(cx + dx - rx + 4, F.EY + dy - 2, 2 * rx - 8, 5, 2, F.SCLERA);   // closed eye
        } else {
          F.eye(g, cx + dx, F.EY + dy, {
            rx, ry, open: Math.max(0.12, open), lookX: v.lookX, lookY: v.lookY,
            iris: Math.round(v.iris * v.eyeSize), pupil: v.pupil, squint: v.squint, topLid: v.lid,
          });
        }
      }

      // brows (mirrored tilt: + angry, - worried)
      if (v.brows >= 0.5) {
        const by = F.EY + dy - Math.round(32 * v.eyeSize);
        F.brow(g, F.LX + dx, by, Math.round(v.browRaise), v.browTilt);
        F.brow(g, F.RX + dx, by, Math.round(v.browRaise), -v.browTilt);
      }

      // mouth
      const mx = 120 + dx, my = F.MY + dy, w = Math.round(v.mouthWidth);
      if (v.mouthOpen > 0.06) {
        if (v.mouthCurve > 0.15) F.grin(g, mx, my - 4, w, Math.max(4, Math.round(26 * v.mouthOpen)));
        else F.oMouth(g, mx, my + 4, Math.max(4, Math.round(w * 0.45 * (0.6 + 0.6 * v.mouthOpen))), Math.max(4, Math.round(4 + 16 * v.mouthOpen)));
      } else if (Math.abs(v.mouthCurve) < 0.1) {
        F.flat(g, mx, my + 2, Math.max(4, Math.round(w * 0.75)), 4);
      } else {
        F.smile(g, mx, my, w, v.mouthCurve, 6);
      }

      F.blush(g, v.blush, dx, dy);

      // effects (fade in with their value)
      const fade = (col, a) => Sim.lerp565(bg, col, clamp01(a));
      if (v.sparkle > 0.02) {
        const s = ((t * 6) | 0) % 2;
        for (const [x, y] of [[34, 64], [206, 60], [196, 196]]) {
          const l = 5 + 2 * s, c = fade(Sim.C.YELLOW, v.sparkle);
          g.fillRect(x - l, y - 1, 2 * l + 1, 3, c);
          g.fillRect(x - 1, y - l, 3, 2 * l + 1, c);
        }
      }
      if (v.hearts > 0.02) {
        for (let k = 0; k < 4; k++) {
          const u = (t / 2.2 + k / 4) % 1;
          const x = Math.round(40 + 160 * hash(k + 1) + 8 * Math.sin(u * 7 + k)), y = Math.round(214 - 190 * u);
          const a = v.hearts * (u < 0.15 ? u / 0.15 : u > 0.8 ? (1 - u) / 0.2 : 1);
          heart(g, x, y, 4 + (k % 2) * 2, fade(Sim.hex('#ff4f7a'), a));
        }
      }
      if (v.zzz > 0.02) {
        for (let k = 0; k < 3; k++) {
          const u = ((t / 2.4) + k / 3) % 1;
          const size = Math.round(14 + 14 * u);
          const x = 150 + Math.round(45 * u + 6 * Math.sin(u * 8)), y = 95 - Math.round(70 * u);
          const a = v.zzz * (u < 0.15 ? u / 0.15 : u > 0.8 ? (1 - u) / 0.2 : 1);
          g.text(x, y, 'z', fade(Sim.hex('#9fd3ff'), a), { size, weight: 'bold', align: 'center', baseline: 'middle', crisp: true });
        }
      }
      if (v.tears > 0.02) {
        for (const [cx, side] of [[F.LX, -1], [F.RX, 1]]) {
          const u = (t / 1.2 + (side > 0 ? 0.5 : 0)) % 1;
          const x = cx + dx + side * Math.round(rx * 0.6), y = F.EY + dy + Math.round(ry * 0.7) + Math.round(50 * u);
          const c = fade(Sim.hex('#58c8ff'), v.tears * (1 - u));
          g.fillCircle(x, y, 4, c);
          g.fillTriangle(x - 4, y - 1, x + 4, y - 1, x, y - 9, c);
        }
      }
      if (v.exclaim > 0.02) {
        const c = fade(Sim.C.YELLOW, v.exclaim), bx = 168 + dx, by = 22 + dy;
        g.fillRoundRect(bx - 3, by, 7, 20, 3, c);
        g.fillCircle(bx, by + 28, 4, c);
      }
      if (hooks && hooks.over) hooks.over(g, hc);
    } finally {
      Object.assign(F, keep);
    }
  }

  /** Turn a SPEC (plus optional under/over drawing hooks) into an animation for Sim.register(). */
  function animation(spec, hooks) {
    const s = normalize(spec);
    const def = {
      name: s.name, fps: s.fps, duration: s.duration, loop: s.loop !== false,
      frame(g, f) { draw(g, valuesAt(s, f.t), f.t, s, hooks, f); },
    };
    if (!hooks) def.rig = s;   // lets the editor recognise and reopen it visually
    if (s.theme) def.theme = s.theme;
    if (s.category) def.category = s.category;
    return def;
  }

  /** Source code of an animation file for a SPEC (what the editor saves). */
  function toCode(spec) {
    const s = normalize(spec);
    const out = { name: s.name };
    if (s.theme) out.theme = s.theme;
    if (s.category) out.category = s.category;
    Object.assign(out, { fps: s.fps, duration: s.duration });
    if (s.loop === false) out.loop = false;
    out.colors = s.colors;
    const tracks = PARAMS.filter(p => s.tracks[p.key]).map(p =>
      `    ${p.key}: [${s.tracks[p.key].map(k => '[' + k.map(x => typeof x === 'number' ? +x.toFixed(3) : JSON.stringify(x)).join(', ') + ']').join(', ')}],`);
    const head = JSON.stringify(out, null, 2).replace(/\n}$/, ',');
    return `/* ${s.name} - made with the animation editor (sim/editor.html).
 * Open it there to keep editing; the SPEC below is the source of truth. */
const SPEC = ${head}
  tracks: {
${tracks.join('\n')}
  },
};

Sim.register(FaceRig.animation(SPEC));
`;
  }

  return { PARAMS, BY_KEY, DEFAULTS, FACE_KEYS, POSES, COLORS, pose, normalize, trackValue, valuesAt, draw, animation, toCode };
})();
