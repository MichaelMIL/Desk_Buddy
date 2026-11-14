# desk_buddies

A desk companion: ESP32-S3 SuperMini driving a 1.28" round TFT (240x240,
GC9A01). `sim/` is a browser simulator for the screen; `hardware/` is the
PlatformIO firmware that plays what the simulator exports.

- Writing or changing an animation: read `sim/ANIMATIONS.md` first (API, face
  helpers, style rules, file layout). Put new animations in `sim/animations/`
  and add them to `sim/animations/index.js`.
- Verify: `sim/test/run_tests.sh` (format round trips across JS, Python, C)
  and `sim/test/smoke.sh` (headless Chrome renders and exports every
  animation, about a minute for ~150; needs Google Chrome and Node 22+; passes
  only when the report ends in `SMOKE OK`). `sim/test/sheet.html?anim=<name>` shows a
  contact sheet of one animation.
- Animation editor: `sim/editor.html` (visual keyframes via
  `sim/animations/face_rig.js`, or code). Editor-made files hold a `SPEC`;
  edit that, keep `FaceRig.animation(SPEC)`. Animation files each run in
  their own function scope, so share helpers through `window.*` only
  (library files: `face_lib.js`, `face_rig.js`, `claude_kit.js`,
  `hand_kit.js` for cartoon hands).
- Run the simulator: `./sim/serve.sh` (also enables saving from the chat
  panel and the "→ firmware" export). The panel's default backend runs the
  local `claude -p` CLI through `sim/serve.py` with `sim/ANIMATIONS.md` as
  the system prompt; `sim/test/chat_smoke.html` exercises that end to end.
- Getting animations onto the device: the sim's "→ board" button or
  `sim/test/push_all.sh <address>` upload to the running board over Wi-Fi,
  or with `usb` / `ble` as the address over USB serial / Bluetooth (stored on
  LittleFS, no reflash). `sim/test/export_all.sh` + `pio run -t
  upload` compiles them in instead (built-in fallback, limited space).
- Wiring and parts: `hardware/PINOUT.md` (every GPIO, parts list, battery and
  charger wiring); keep it in step when a pin or a part changes.
- Firmware: `cd hardware && pio run -t upload` over USB, or
  `hardware/ota.sh <address>` over Wi-Fi. The OTA app slots are 1 MB and the
  firmware is ~960 KB with Bluetooth, so watch the "Flash:" line when adding
  libraries; do not compile animations in (they live on LittleFS). It only
  fits because of the trims in `hardware/slim.py` and `platformio.ini` (table
  in `hardware/README.md`); among them printf is newlib-nano from the ROM, so
  no `%f` / `%ll` in printf formats. There are no web pages on the device:
  the HTTP API is documented in `hardware/API.md`, Bluetooth LE (pairing
  code on the screen, every console command, the upload protocol) in
  `hardware/BLE.md`. Two builds: `esp32s3_supermini` (Wi-Fi) and
  `esp32s3_supermini_ble` (`BUDDY_WIFI=0`: Bluetooth + USB only, 3.3 MB
  LittleFS; switching builds erases stored animations). Battery level:
  `hardware/src/battery.h` (100k/100k divider on GPIO 1; `bat`/`batLow` in
  the state JSON, which every client shows; `chg` from the charger's pads on
  GPIO 2/4); `battery_*` and `charging_*` animations are alerts the firmware
  plays itself, at random from pools by name prefix (`pool_of()` in
  `main.cpp`, mirrored by `alertPoolOf` in the app and `poolOf` in
  `sim/remote.html`; `alerts` command), and never cycles. `BUDDY_BATTERY=0` (the
  `*_nobat` envs) compiles it out; clients must treat missing `bat` as none. The DBA1 decoder's
  single source is `hardware/lib/dba_player/` (`lzma_dec.c` unpacks the DBAL
  container; `sim/lib/lzma.js` mirrors it). `sim/lib/dba.js` and
  `sim/tools/dba.py` must encode byte-identically (`run_tests.sh` checks). The ESP32 WebServer does not parse query
  arguments for raw-body (PUT) requests, so uploads carry the name in the
  `X-Anim-Name` header.
- Phone app: `app/` is a Flutter app (iOS, Android, macOS) that controls the
  buddy over Bluetooth LE with the `hardware/BLE.md` protocol; see
  `app/README.md`. Verify with `cd app && flutter analyze && flutter test`
  (a fake buddy in `test/fake_buddy.dart`, no hardware); the real board is
  exercised by `flutter test integration_test/device_test.dart -d macos`.
  It uses universal_ble, not flutter_blue_plus 2.x (license and build ping).
- 3D model: `3d/round_bot.scad`, STLs in `3d/stl/`. The assembly guide PDF is
  built from `3d/guide/assembly_guide.html` with `node 3d/guide/build_pdf.mjs`
  (headless Chrome); when you add a body, band or side piece, add it to the
  guide's tables and rebuild. OpenSCAD's CLI renders previews headless:
  `/Applications/OpenSCAD-2021.01.app/Contents/MacOS/OpenSCAD -o x.png -D 'part="assembly_claude"' ...`.
- Animation library: `~/.config/desk-buddy/library` (or `$DESK_BUDDY_LIBRARY`)
  holds a `.dbal` per animation; `sim/serve.py` saves every push there and
  `sim/test/library.sh [--app]` exports them all (`--app` also copies them into
  `app/assets/library`, not committed). Every app build (Xcode phases, Gradle)
  runs `app/tool/sync_library.sh`, which does that when `sim/` changed, so the
  app always carries every animation. The bridge, the menu bar app (through
  the daemon), the phone app and `sim/remote.html` upload a played animation
  from it when the buddy no longer has it, deleting the least recently played
  library-backed ones while the buddy answers "not enough space".
- Claude Code integration: `claude_integration/buddy_bridge.py` (hooks →
  local daemon → `play` over Bluetooth with bleak, or `POST /api/play` over
  Wi-Fi), docs in `claude_integration/README.md`,
  tests `python3 claude_integration/test_bridge.py`. Its `ACTIVITIES` table
  names `claude__<slug>` animations, so renaming a `Claude: …` animation
  means updating it there. Once installed, this repo's own Claude sessions
  drive the board too and hold its one Bluetooth link while busy; run
  `buddy_bridge.py pause` (or `hold <s>`) while testing on it. The macOS
  menu bar app `claude_integration/menubar/` (Swift; `swift test`,
  `build.sh --install`) reads the daemon's `GET /status`, so keep that
  snapshot's keys in step with `menubar/Sources/BuddyBarCore/Snapshot.swift`.
