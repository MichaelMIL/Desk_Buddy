# Desk Buddy TFT simulator

Simulates the 1.28" round TFT (240×240, GC9A01 driver, 4‑wire SPI, RGB565)
on the PC so animations can be designed here and then played on the real
screen.

```
sim/
  index.html          the simulator (open in a browser)
  serve.sh / serve.py local server with save/export endpoints for the UI
  ANIMATIONS.md       how to write animations (also Claude's instructions)
  lib/gfx.js          240x240 RGB565 framebuffer + GFX-style drawing API
  lib/dba.js          DBA1 animation encoder/decoder (export)
  lib/app.js          UI: playback, scrubbing, export
  lib/chat.js         "Ask Claude" panel (Anthropic SDK in the browser)
  lib/board.js        shared: board names, rendering to DBAZ, push with progress
  editor.html, lib/editor.js   the animation editor (visual keyframes + code)
  remote.html         Bluetooth LE remote for the real buddy (Web Bluetooth, Chrome/Edge)
  animations/         your animations (one .js file each) + index.js manifest
  animations/face_lib.js  shared helpers for the buddy's face (eyes, mouth, brows)
  animations/face_rig.js  keyframed faces (the visual editor's format)
  tools/dba.py        PNG/GIF <-> DBA converter (Pillow)
  tools/gen_registry.py  regenerates hardware/src/animations/animations.h
  player/             symlinks to the C decoder in ../hardware/lib + Arduino example + host test
  test/               cross-checks of the JS, Python and C implementations
```

## Run the simulator

```sh
./sim/serve.sh            # http://localhost:8080, press R to reload animations
```

Opening `sim/index.html` straight from disk also works for everything except
`Sim.loadImage()` / `g.drawImage()` (browsers block pixel reads from `file://`).

The Bluetooth remote is at http://localhost:8080/remote.html (Web Bluetooth
needs Chrome or Edge and localhost or https, so open it through `serve.sh`).
It lists the faces on the device and sets face, screen, brightness and theme;
the protocol is in `hardware/BLE.md`.

Keys: `Space` play/pause, `←` `→` step one frame, `R` reload animation files.
Hover the screen to read a pixel's coordinates and RGB565 value. Pixels outside
the circle are drawn by the panel driver but are not visible on the glass.

## Animation editor

`editor.html` (the "Animation editor" link in the simulator's header, or the
**Edit** button next to the current animation) edits animations in two ways:

- **Face (visual)**: pose the buddy's face on a timeline, no code. Every face
  part is a slider (eyes open, per-eye wink, happy squint, heavy lids, look
  direction, eye/iris/pupil size, brows, smile/frown, mouth open/width,
  blush, head move, bounce, shake) plus effects (sparkles, hearts, z's,
  tears, exclamation). Moving a slider sets a keyframe at the playhead; the
  pose buttons (happy, sad, angry, surprised, sleepy, wink, love, blink)
  key a whole expression at once. Keys are diamonds on the timeline: drag to
  retime, click to edit value, time and easing (smooth, linear, pop
  overshoot, hold), Delete to remove. Undo/redo, colours, theme, length and
  frame rate are in the side panel.
- **Code**: any animation file in an editor with syntax highlighting and a
  live preview; syntax and runtime errors show under the code. Files with
  several animations get a picker for which one to preview.

**Save** writes `animations/<name>.js` (and adds it to `index.js`); an open
simulator tab reloads and selects it by itself. **→ board** renders,
compresses and uploads with a progress bar. Faces made visually are stored as
a keyframe `SPEC` handled by `animations/face_rig.js`, so they reopen in the
visual editor; "Edit as code" shows the generated file. Keys: `Space`
play/pause, `←` `→` frame, `Home` start, `⌘Z` / `⇧⌘Z` undo/redo, `⌘S` save.



The right-hand panel is a chat connected to Claude. With `./serve.sh` running
and the Claude Code CLI installed, the default backend is **Claude Code**:
`serve.py` runs `claude -p` with the guide as system prompt, so generation
uses your Claude Code login (no API key, no tools, no MCP servers; follow-ups
resume the same CLI session). The other backend is **API key** (kept in your
browser's localStorage) which calls the API directly from the browser.
Describe an animation and the reply is loaded into the simulator immediately
and starts playing. Say what to change and Claude returns the whole updated
file. With `./serve.sh` running, every working result is **auto-saved** to
`animations/<name>.js` and added to `index.js` (iterations on the same name
overwrite the file); tick **push to board** to also upload it to the address
entered under Export. Without the server, **Save** downloads the file instead. Runtime errors in generated code are caught by a dry run
and can be sent back with one click. The instructions Claude receives are
`ANIMATIONS.md` plus `face_lib.js`, and the selected animation's source when
"include current" is ticked. Refusal fallbacks are enabled on the request
(`fallbacks: "default"`), so a declined request is retried on a fallback model
server-side.

`ANIMATIONS.md` is also the guide for Claude Code or any other assistant that
edits `sim/animations/` directly.

## Writing an animation

Copy `animations/template.js`, add the file name to `animations/index.js`,
press `R`.

```js
Sim.register({
  name: 'Blink',
  fps: 30,
  duration: 2000,        // ms per loop, or frames: 60
  setup(g, state) {},    // optional, runs once (may be async, e.g. to load images)
  frame(g, f) {          // f = { i, n, t, dt, p, fps, state }
    g.clear(Sim.C.BLACK);
    g.fillCircle(120, 120, 40 + 20 * Math.sin(f.p * 2 * Math.PI), Sim.C.CYAN);
    // return 500;       // optional: hold this frame for 500 ms
  },
});
```

The framebuffer persists between frames exactly like the real display, so
only redraw what changes (it also makes the exported file smaller).

`theme: 'halloween'` marks a themed animation: on the device it is stored as
`halloween__<name>` and plays only while that theme is selected (common
animations play in every theme). The shipped themes are in
`animations/theme_*.js`: one per build variant (dj, cat, bear, bunny, king,
unicorn, skeleton, gamer, bee, devil, dragon, robot), seasonal or occasion
ones (halloween, xmas, space, ocean, birthday, valentine, summer), and claude.

Drawing API on `g` (integer pixels, colours are RGB565 numbers, same
algorithms as Adafruit_GFX / TFT_eSPI so a C++ port looks identical):

| call | notes |
|---|---|
| `clear(c)`, `drawPixel`, `getPixel` | |
| `drawLine`, `drawRect`, `fillRect`, `drawRoundRect`, `fillRoundRect` | |
| `drawCircle`, `fillCircle`, `drawEllipse`, `fillEllipse` | |
| `drawTriangle`, `fillTriangle` | |
| `drawArc(cx, cy, rOuter, rInner, startDeg, endDeg, c)` | 0° = 12 o'clock, clockwise |
| `drawBitmap(x, y, bits, w, h, c[, bg])` | 1‑bpp, MSB first |
| `drawRGB565(x, y, w, h, pixels[, transparentColour])` | |
| `text(x, y, str, c, {size, font, weight, align, baseline, bg, crisp})` | browser font engine |
| `draw2d(ctx => {...})` | full Canvas 2D, anti‑aliased, quantised to RGB565 |
| `drawImage(img, x, y, {w, h})` | `img` from `await Sim.loadImage(url)` in `setup` |
| `isVisible(x, y)` | inside the round active area? |

Colours: `Sim.C.RED` (TFT_eSPI names), `Sim.hex('#ff8800')`,
`Sim.color565(r, g, b)`, `Sim.hsv(h, s, v)`, `Sim.lerp565(a, b, t)`.

## Getting it onto the real screen

The firmware lives in `../hardware/` (PlatformIO, ESP32-S3 SuperMini); see its
README for wiring, first flash and Wi-Fi setup.

With `./serve.sh` running, type the buddy's address next to **→ board**
(`192.168.50.99` or `desk-buddy.local` over Wi-Fi, `usb` for USB serial, `ble`
for Bluetooth, which needs the buddy paired) and press it. The animation is rendered, diffed frame-to-frame, RLE-compressed and
uploaded to the device's flash file system, where it stays across reboots and
firmware updates; with "play" ticked it starts right away. `test/push_all.sh
<address>` pushes every animation. **Estimate size** shows the size first;
**C header (.h)** / **.dba binary** download the same data instead (a `.dba`
can be pushed later with `tools/dba.py push`). Only the changed area of each
frame is stored, run-length encoded, and the whole stream is then deflated
(`DBAZ` container, done in the browser with `CompressionStream`), which cuts
the faces to roughly a fifth: a 3 s face is 10–25 KB. **Estimate size** shows
both the compressed and the uncompressed size.

**→ firmware** instead compiles the animation into the firmware
(`hardware/src/animations/`), for a built-in fallback; that needs
`cd hardware && pio run -t upload` (or `hardware/ota.sh <address>`).

Other boards: the decoder is `hardware/lib/dba_player/` (plain C, one
row-push callback, works with any display library; `player/` symlinks to it),
and `player/examples/PlayAnim/PlayAnim.ino` is a plain Arduino/TFT_eSPI sketch.

The same drawing API names exist in TFT_eSPI, so an animation can also be
ported by hand to C++ instead of exporting frames when flash is tight.

## Converting PNG / GIF made elsewhere

```sh
pip install pillow
python3 sim/tools/dba.py encode frames/*.png -o anim_wave.h --fps 25
python3 sim/tools/dba.py encode wave.gif -o wave.dba        # keeps GIF timing
python3 sim/tools/dba.py gif anim.dba -o preview.gif         # preview an export
python3 sim/tools/dba.py decode anim.dba -o frames_out/      # back to PNGs
python3 sim/tools/dba.py info anim.dba                       # per-frame sizes
```

Images that are not 240×240 are resized to fit; transparency is flattened on
black.

## DBA1 format

Files and uploads are normally the `DBAZ` container: `"DBAZ"`, u32 original
size, u32 compressed size, then a zlib stream of the DBA1 bytes below.
`tools/dba.py encode --raw` writes plain DBA1; every reader accepts both.

Little‑endian. File header: `"DBA1"`, u16 width, u16 height, u16 frameCount,
u16 flags (bit 0 = loop), u32 reserved. Each frame: u16 x, y, w, h (dirty
rectangle; frame 0 is full screen; w = h = 0 means "nothing changed, just
wait"), u16 delayMs, u16 reserved, u32 dataLen, then an RLE stream of the
rectangle's pixels: token byte `t`; `t & 0x80` → run of `(t & 0x7f) + 1`
copies of the following u16, otherwise `t + 1` literal u16 values follow.
The full description is at the top of `lib/dba.js`.

## Tests

```sh
sim/test/run_tests.sh   # JS encoder == Python encoder byte-for-byte, Python and C decoders round-trip, PNG round-trip
sim/test/smoke.sh       # headless Chrome: loads the UI, renders and exports every animation
sim/test/sheet.html     # contact sheet of one animation: ?anim=Face:%20happy&n=12
sim/test/push_all.sh <address>  # uploads every animation to a running board (address, usb or ble) (drives Chrome via test/headless.mjs)
sim/test/export_all.sh  # compiles every animation into hardware/src/animations/ (built-in fallback)
sim/test/chat_smoke.html  # with ./serve.sh: one real generation through the Claude Code backend, then Save
```
