# desk_buddies

A desk companion: ESP32-S3 SuperMini driving a 1.28" round TFT (240x240,
GC9A01). `sim/` is a browser simulator for the screen; `hardware/` is the
PlatformIO firmware that plays what the simulator exports.

- Writing or changing an animation: read `sim/ANIMATIONS.md` first (API, face
  helpers, style rules, file layout). Put new animations in `sim/animations/`
  and add them to `sim/animations/index.js`.
- Verify: `sim/test/run_tests.sh` (format round trips across JS, Python, C)
  and `sim/test/smoke.sh` (headless Chrome renders and exports every
  animation; needs Google Chrome). `sim/test/sheet.html?anim=<name>` shows a
  contact sheet of one animation.
- Animation editor: `sim/editor.html` (visual keyframes via
  `sim/animations/face_rig.js`, or code). Editor-made files hold a `SPEC`;
  edit that, keep `FaceRig.animation(SPEC)`. Animation files each run in
  their own function scope, so share helpers through `window.*` only
  (library files: `face_lib.js`, `face_rig.js`, `claude_kit.js`).
- Run the simulator: `./sim/serve.sh` (also enables saving from the chat
  panel and the "→ firmware" export). The panel's default backend runs the
  local `claude -p` CLI through `sim/serve.py` with `sim/ANIMATIONS.md` as
  the system prompt; `sim/test/chat_smoke.html` exercises that end to end.
- Getting animations onto the device: the sim's "→ board" button or
  `sim/test/push_all.sh <address>` upload to the running board over Wi-Fi
  (stored on LittleFS, no reflash). `sim/test/export_all.sh` + `pio run -t
  upload` compiles them in instead (built-in fallback, limited space).
- Firmware: `cd hardware && pio run -t upload` over USB, or
  `hardware/ota.sh <address>` over Wi-Fi. The OTA app slots are 1 MB and the
  firmware is ~935 KB with Bluetooth, so watch the "Flash:" line when adding
  libraries; do not compile animations in (they live on LittleFS). It only
  fits because of the trims in `hardware/slim.py` and `platformio.ini` (table
  in `hardware/README.md`); among them printf is newlib-nano from the ROM, so
  no `%f` / `%ll` in printf formats. Web pages live in `hardware/web/` (gzipped
  into the firmware at build time). The DBA1 decoder's single source is
  `hardware/lib/dba_player/`. The ESP32 WebServer does not parse query
  arguments for raw-body (PUT) requests, so uploads carry the name in the
  `X-Anim-Name` header.
