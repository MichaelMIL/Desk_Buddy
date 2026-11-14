# Writing animations for the desk buddy screen

This is the reference for anyone (human or Claude) writing animations for the
desk buddy. The simulator's built-in chat sends this file to Claude as its
instructions; Claude Code sessions should read it before touching
`sim/animations/`.

## The screen

- 1.28" round TFT, **240×240 pixels**, driver GC9A01, colours are **RGB565**.
- Only a **circle of radius 120 centred at (120, 120)** is visible. The corners
  of the square framebuffer exist but are hidden behind the bezel. Keep
  important content inside radius ~110.
- Origin (0, 0) is top-left, x grows right, y grows down. Integer pixels.
- Black background looks best: the panel is "normally black" and the bezel is
  black, so a black background makes the face float.
- The real device plays exported frames, so **everything must be
  deterministic**: no `Math.random()` without a seeded source, no `Date.now()`.
  Frame `i` must always look the same.

## Files

```
sim/animations/index.js     manifest: window.ANIMATION_FILES = ['face_lib.js', 'my_anim.js', ...]
sim/animations/face_lib.js  shared face helpers (window.Face), loaded first
sim/animations/*.js         one animation per file, each calls Sim.register({...})
```

To add an animation: create `sim/animations/<snake_name>.js`, append its
filename to `ANIMATION_FILES` in `index.js`, press `R` in the simulator.
The chat panel and `serve.py` do this automatically when you click Save.

## Animation contract

```js
Sim.register({
  name: 'Face: wink',      // unique, shown in the list. Face animations use the "Face: " prefix
  fps: 30,                 // 10..40 is sensible; lower fps = smaller export
  duration: 2500,          // ms per loop  (or frames: 75)
  loop: true,              // default; false = play once on the device
  theme: 'xmas',           // optional: themed animation, only cycled when this theme is selected on the device
  category: 'Faces',       // optional: group in the simulator's list (default: the name prefix before ":",
                           // "Face" -> "Faces", else the theme, else "Other")

  setup(g, state) {        // optional, runs once before frame 0. May be async.
    state.seed = 1;        // put anything you need across frames in `state`
  },

  frame(g, f) {            // called once per frame, in order, starting at 0
    g.clear(Sim.C.BLACK);
    // ... draw ...
    // return 400;         // optional: hold this frame for 400 ms instead of 1000/fps
  },
});
```

`f` (frame info): `i` frame index, `n` total frames, `t` ms since loop start,
`dt` ms per frame, `p` progress 0..1 (`i / n`), `fps`, `state`.

The framebuffer **persists between frames** exactly like the hardware. If you
do not `g.clear()`, the previous frame stays and you only draw on top. That is
also how to get small exports: only the pixels that changed are stored.

Playback is sequential and scrubbing re-runs frames 0..k, so `frame` must not
depend on wall-clock time, only on `f`.

### Themes

An animation with `theme: 'halloween'` (lower-case, letters/digits) is stored
on the device as `halloween__<name>` and plays only while that theme is
selected on the device (`theme <name>` over Bluetooth or serial, MQTT, or the API; common animations, without a theme,
play in every theme). Name themed animations `'Halloween: pumpkin'`: the
theme prefix is dropped from the board name. Existing themes: the build variants `dj`,
`cat`, `bear`, `bunny`, `king`, `unicorn`, `skeleton`, `gamer`, `bee`,
`devil`, `dragon`, `robot`, `builder` (hard hat), `hacker` (hood), `scientist`
(goggles, wild hair) and the seasons/occasions `halloween`, `xmas`,
`space`, `ocean`, `birthday`, `valentine`, `summer`, and `claude` (see `theme_*.js`),
`rude` (the finger, a fart, an eye roll, talk to the hand: `rude.js`, kept out of the
normal cycle), plus
`template` for the bare template build: the generic demos (eyes, bouncing ball, spinner,
clock, confetti) that used to play in every theme (`template_*.js`). A new theme name creates a new
theme automatically. Build-variant animations keep the standard face and add
the accessory (headphones, ears, crown, horn, hard hat, hood, goggles) plus a matching behaviour.

Common (theme-less) groups besides the `Face:` ones: `Eat:` (`eat.js`),
`Attention:` (`attention.js`), `Notify:` (`notify.js`, meant to be played on
an event), `Break:` (`break.js`, taking a break from work) and `Silly:`
(`silly.js`). `Battery:` (`battery.js`) animations are alerts: the firmware
plays `battery_low` by itself when the battery runs low and never puts a
`battery_*` animation in the cycle, so keep them short (a few seconds; it
plays twice) and small.

## Drawing API (`g`)

All coordinates are integers (use `Math.round`/`| 0`); colours are RGB565 numbers.

| Call | Notes |
|---|---|
| `g.clear(c)` | fill the whole buffer |
| `g.drawPixel(x, y, c)` / `g.getPixel(x, y)` | |
| `g.drawLine(x0, y0, x1, y1, c)` | Bresenham, 1 px |
| `g.drawFastHLine(x, y, w, c)` / `g.drawFastVLine(x, y, h, c)` | |
| `g.drawRect(x, y, w, h, c)` / `g.fillRect(x, y, w, h, c)` | |
| `g.drawRoundRect(x, y, w, h, r, c)` / `g.fillRoundRect(x, y, w, h, r, c)` | |
| `g.drawCircle(cx, cy, r, c)` / `g.fillCircle(cx, cy, r, c)` | |
| `g.drawEllipse(cx, cy, rx, ry, c)` / `g.fillEllipse(cx, cy, rx, ry, c)` | rx, ry ≥ 2 |
| `g.drawTriangle(...)` / `g.fillTriangle(x0, y0, x1, y1, x2, y2, c)` | |
| `g.drawArc(cx, cy, rOuter, rInner, startDeg, endDeg, c)` | filled ring segment. 0° = 12 o'clock, clockwise. `rInner = 0` gives a pie slice. Thick strokes for smiles, spinners, eyebrows. |
| `g.drawBitmap(x, y, bits, w, h, c[, bg])` | 1 bit per pixel, MSB first, rows padded to bytes (Adafruit GFX layout) |
| `g.drawRGB565(x, y, w, h, pixels[, transparentColour])` | `Uint16Array` sprite |
| `g.text(x, y, str, c, opts)` | browser font. opts: `size` px (default 16), `font` CSS family, `weight`, `align` left/center/right, `baseline` top/middle/bottom, `bg`, `crisp: true` for no anti-aliasing |
| `g.draw2d(ctx => { ... })` | full Canvas 2D (anti-aliased), result composited and quantised to RGB565. Use for smooth curves and gradients; costs more export bytes |
| `g.drawImage(img, x, y, {w, h})` | `img` from `await Sim.loadImage('animations/sprites/foo.png')` in `setup` (needs the http server, not file://) |
| `g.isVisible(x, y)` | inside the round active area? |
| `g.snapshot()` / `g.restore(px)` | copy / restore the whole buffer (`Uint16Array`) |

Colours: `Sim.C.BLACK`, `WHITE`, `RED`, `GREEN`, `BLUE`, `CYAN`, `MAGENTA`,
`YELLOW`, `ORANGE`, `PINK`, `PURPLE`, `NAVY`, `DARKGREEN`, `DARKCYAN`,
`MAROON`, `OLIVE`, `LIGHTGREY`, `DARKGREY`, `GREENYELLOW`, `BROWN`, `GOLD`,
`SILVER`, `SKYBLUE`, `VIOLET`; `Sim.hex('#ff8800')`; `Sim.color565(r, g, b)`;
`Sim.hsv(hueDeg, sat01, val01)`; `Sim.lerp565(a, b, t)` for fades (fade to the
background colour instead of using alpha).

## Face helpers (`Face`, from face_lib.js)

The buddy's face is two big eyes and a mouth. Use these so all face
animations share one look.

Layout constants: `Face.LX = 70`, `Face.RX = 170` (eye centres),
`Face.EY = 112` (eye row), `Face.MY = 160` (mouth row). Colours: `Face.BG`,
`Face.SCLERA`, `Face.IRIS`, `Face.PUPIL`, `Face.MOUTH`, `Face.MOUTH_IN`,
`Face.BLUSH`, `Face.BROW`.

| Helper | What it draws |
|---|---|
| `Face.kf(t, [[t0, v0], [t1, v1], ...])` | keyframe value at time `t` (seconds), smoothstep between keys, clamped outside. The main tool for timing. |
| `Face.eye(g, cx, cy, opts)` | one eye. opts: `rx` (32), `ry` (40), `open` 0..1 vertical squash, `lookX`, `lookY` iris offset, `iris` radius (16), `pupil` fraction of iris (0.5), `topLid` 0..1 covered from above (sleepy; ≥ 0.95 draws a closed-eye line), `squint` 0..1 crescent "happy" eye, `sclera` colour |
| `Face.eyes(g, opts, dx, dy)` | both eyes with the same opts shifted by (dx, dy); per-eye overrides via `opts.l` / `opts.r` (e.g. a wink: `{ l: { open: 0.05 } }`) |
| `Face.brow(g, cx, cy, raise, tiltDeg, thickness)` | eyebrow arc above an eye; pass `cx = Face.LX`, `cy = Face.EY - 32` |
| `Face.smile(g, cx, cy, halfWidth, curve, thick)` | curve > 0 smile, < 0 frown |
| `Face.flat(g, cx, cy, halfWidth, thick)` | neutral mouth |
| `Face.grin(g, cx, cy, halfWidth, depth)` | open grin, flat top, round bottom |
| `Face.oMouth(g, cx, cy, rx, ry)` | open "o" mouth |
| `Face.blush(g, amount, dx, dy)` | cheeks, amount 0..1 |
| `Face.background = colour` | set at the start of `frame()` when the background is not black: lids, the grin's top edge and blush blend against it (reset automatically before each frame) |

Existing face animations to learn from: `face_happy.js`, `face_sleepy.js`,
`face_surprised.js`. A typical structure: compute a few 0..1 "amounts" with
`Face.kf`, derive positions/sizes from them, clear, draw eyes, brows, mouth,
extras. Movement of the whole face (bob, shake, nod) is a `dx`/`dy` passed to
the helpers.

## Keyframed faces (FaceRig, made by the editor)

Files written by the visual editor (`sim/editor.html`) look like this and
reopen in it:

```js
const SPEC = {
  name: 'Face: giggle', fps: 30, duration: 3000,
  colors: { bg: '#000000', iris: '#2a6cff', mouth: '#ff4f7a', blush: '#ff8fa3' },
  tracks: {
    squint: [[0, 0], [300, 1, 'pop'], [2400, 1], [2800, 0]],   // [timeMs, value, ease?]
    mouthOpen: [[0, 0], [300, 0.9, 'pop'], [2800, 0]],
  },
};
Sim.register(FaceRig.animation(SPEC));
```

`colors` may also set `sclera` (the eye whites). Parameters (unlisted ones keep their default): `open`, `openL`, `openR`,
`squint`, `lid` (0..0.9), `lookX` (-20..20), `lookY` (-15..15), `eyeSize`
(0.6..1.4), `iris` (6..24), `pupil` (0.2..0.8), `brows` (0/1), `browRaise`
(-10..30), `browTilt` (-20..20, + angry), `mouthCurve` (-1..1),
`mouthOpen` (0..1), `mouthWidth` (8..44), `blush`, `headX`, `headY`
(-24..24), `bob`, `shake`, and effects `sparkle`, `hearts`, `zzz`, `tears`,
`exclaim` (0..1). Ease is `smooth` (default), `linear`, `pop` or `step`.
When asked to tweak such a file, edit the SPEC and keep the
`FaceRig.animation(SPEC)` call so it stays editable in the editor.

The rig also works as a face engine for code animations that add their own
drawing (accessories, props, backgrounds):

```js
Sim.register(FaceRig.animation({ name: 'Devil: wink', theme: 'devil', fps: 24, duration: 3000,
  tracks: { openL: [[0, 1], [1000, 0], [1400, 1]], mouthCurve: [[0, 0.9]] } }, {
  under(g, c) { /* after the background, before the face */ },
  over(g, c) { /* on top: horns, hats, props. c = { v, t, f, dx, dy, bg } */ },
}));
```

For the Claude theme, `animations/claude_kit.js` (window.ClaudeKit) has the
shared pieces: the colours, `spark`, `terminal`, `mono`, `label`, `check`,
`cross`, `codeBars` (syntax-coloured code lines), `cliSpinner` (the CLI's
· ✢ ✳ ✶ ✻ ✽ spinner) and `miniBuddy`; see `theme_claude_code.js`.

For hands, `animations/hand_kit.js` (window.Hands) draws cartoon hands:
`Hands.draw(g, Hands.OPEN, x, y, { scale, angle, flip, cuff })` with the wrist
at (x, y) and the poses `OPEN` (wave), `FLAT` (stop), `FIST` (knock), `THUMB`
and `MIDDLE`; plus `capsule` (a thick line with round ends), `motion` (motion
lines), `bubble` (speech bubble) and `rnd` (seeded random). See `attention.js`.

Or call `FaceRig.draw(g, values, f.t, spec, hooks, f)` from your own
`frame()` with values from `FaceRig.valuesAt(spec, f.t)` that you adjust
(e.g. make the eyes follow something). Many `theme_*.js` files do this.



- Clear with black unless the design needs otherwise. Use saturated colours;
  the panel is bright (400 nits) and small (3.2 cm).
- Make loops seamless: the last frame should flow into frame 0 (ease back to
  the starting pose, or design the motion as a cycle with `f.p`).
- Ease everything. `Face.kf` smoothsteps between keys; for cycles use
  `Math.sin(f.p * 2 * Math.PI)`.
- Hold expressive poses for a moment (300–800 ms) so they read; transitions of
  150–300 ms feel snappy and alive.
- Keep strokes ≥ 3 px; 1 px lines are hard to see at 0.135 mm per pixel.
- Size budget: the exporter stores only the changed areas of each frame, so
  redrawing a small region is cheap (two small changes far apart cost about
  what each costs alone) and a full-screen `draw2d` redraw is ~30–60 KB per
  frame before compression. A face animation of 2–4 s at 20–30 fps is
  typically 4–12 KB compressed. Press "Estimate size" in the simulator.
- Prefer the integer primitives over `draw2d`/`text` where you can: they are
  deterministic across browsers and match what the microcontroller draws.
- Never draw anything that must be read outside radius ~110 from the centre.

## Checklist before saying an animation is done

1. It is registered with a unique `name` and loads without errors (the log in
   the simulator is empty).
2. Frame 0 and the last frame connect smoothly.
3. Nothing important is outside the round area.
4. Export size is reasonable (`Estimate size`).
5. If it is a face, it uses `Face.*` helpers and the standard eye positions.

## Complete example

```js
/* Wink: the left eye closes briefly, mouth pulls up on that side. */
Sim.register({
  name: 'Face: wink',
  fps: 30,
  duration: 2400,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    g.clear(F.BG);

    const wink = F.kf(t, [[0.8, 0], [0.95, 1], [1.35, 1], [1.5, 0]]);   // 0 open .. 1 closed
    const dy = Math.round(-3 * wink);

    F.eyes(g, { lookX: Math.round(4 * wink), l: { open: 1 - 0.95 * wink } }, 0, dy);
    if (wink > 0.9) g.fillRoundRect(F.LX - 28, F.EY + dy - 2, 56, 5, 2, F.SCLERA); // closed-eye line

    F.smile(g, 120 + Math.round(6 * wink), F.MY + dy, 28, 0.6 + 0.4 * wink, 6);
    F.blush(g, wink, 0, dy);
  },
});
```

## How Claude should answer in the simulator chat

- Reply with **one** fenced code block tagged `js` containing the complete
  animation file (a single `Sim.register({...})` call, with a comment line at
  the top describing it). Everything outside the block is a short note.
- When asked to change an animation, return the **whole updated file**, same
  `name`, not a diff.
- Keep the `name` unique and descriptive; face animations start with `Face: `.
- Don't invent API calls that are not in this document. If something is
  impossible with this API, say so and offer the closest alternative.
- If an error message is reported back, fix the cause and return the full file
  again.
