# Desk Buddy

A little desk companion with a round face. The face is a 1.28" round TFT
(240×240, GC9A01) driven by an ESP32‑S3 SuperMini; the animations are drawn
in a browser simulator (or asked from Claude in plain words), pushed to the
buddy over Wi‑Fi, Bluetooth or USB, and stored on it. A phone app, Home
Assistant or the simulator picks what plays, and it can follow along with
Claude Code while you work. The body is a snap‑together 3D print with
swappable accessories, and every theme has its own build.

<p align="center">
  <img src="3d/images/c_themes_front.png" alt="RoundBot body variants" width="900">
</p>
<p align="center">
  <img src="3d/images/c_themes_lap.png" alt="Theme builds holding something on their lap: Claude, gamer, robot, halloween, xmas, ocean, birthday, valentine, summer, stpatricks" width="900">
</p>

<p align="center">
  <img src="docs/images/faces.png" alt="Faces" width="430">
  <img src="docs/images/build_themes.png" alt="Animations for the build variants" width="430">
</p>
<p align="center">
  <img src="docs/images/themes.png" alt="Seasonal themes" width="430">
</p>
<p align="center">
  <img src="docs/images/claude_theme.png" alt="Claude theme: thinking, writing, hello, spark, pondering, coding, tests pass, debugging, ship it" width="700">
</p>
<p align="center">
  <img src="docs/images/claude_code.png" alt="More Claude Code moments: reading, searching, editing, todo list, permission, build failed, merge conflict, code review, CI pipeline, subagents, compacting, rubber duck, infinite loop, git graph, plan mode, done" width="880">
</p>
<p align="center">
  <img src="docs/images/claude_langs.png" alt="Claude and programming languages: Python, C++, Go, Rust, JavaScript, TypeScript, Java, C, SQL, bash, polyglot" width="820">
</p>
<p align="center">
  <img src="docs/images/more_themes.png" alt="More themes: skeleton, gamer, bee, devil, dragon, robot, birthday, valentine, summer" width="880">
</p>

## What's in the box

| Part | Folder | What it does |
|---|---|---|
| Simulator | [`sim/`](sim/README.md) | Pixel‑exact simulator of the screen in the browser, an animation API, a chat panel that gets Claude to write animations, one‑click push to the buddy |
| Firmware | [`hardware/`](hardware/README.md) | PlatformIO project: Bluetooth LE control with pairing, Wi‑Fi, MQTT + Home Assistant, an HTTP API, animation storage, OTA updates, themes, brightness; a build without Wi‑Fi for more animation storage |
| Phone app | [`app/`](app/README.md) | Flutter app for iOS and Android (also macOS): finds the buddy, pairs, and works as a remote over Bluetooth |
| Claude Code | [`claude_integration/`](claude_integration/README.md) | Hooks that show what Claude Code is doing on the buddy, over Bluetooth or Wi‑Fi: reading, editing a Python or Rust file, running tests, waiting for your permission, done; a macOS menu bar app that shows the bridge's state |
| Enclosure | [`3d/`](3d/README.md) | OpenSCAD model of the RoundBot with ready STLs: the core parts, a body and band for each theme, ear cups, an assembly guide |
| Screen docs | [`docs/`](docs/README.md) | The display module's spec sheets and pinout |

## How a face gets from an idea to the desk

1. **Make it**: describe it in the simulator's chat ("a sleepy face that nods
   off and jolts awake"), pose it on a timeline in the animation editor, or
   write it in a few lines of JavaScript against a small drawing API. It
   plays in the simulator immediately.
2. **Push it**: the simulator compresses it and uploads it over Wi‑Fi,
   Bluetooth or USB. The
   buddy shows a loading ring, stores it on its flash file system, and
   starts playing it. No reflash, and it survives reboots and updates.
3. **Pick what plays** over Bluetooth (a phone app or the simulator's remote
   page), Home Assistant, MQTT or the serial console: a single face, or
   cycling through them, with themes.

<p align="center">
  <img src="docs/images/simulator.png" alt="The simulator" width="900">
</p>

<p align="center">
  <img src="docs/images/editor.png" alt="The animation editor" width="900">
</p>

The animation editor (`sim/editor.html`) poses the face with sliders and
keyframes (eyes, lids, brows, mouth, blush, head motion, sparkles, hearts,
tears…), with one‑click expressions and undo, or edits any animation as code
with a live preview. Saving updates the simulator; one click pushes to the
buddy.

The simulator renders into a real 240×240 RGB565 framebuffer with the same
integer rasterisers the microcontroller libraries use, so what you see is
what the panel draws. The right‑hand panel talks to Claude (through your
Claude Code login, or an API key), auto‑saves every working result as a file
and can push it straight to the board.

## Controlling the buddy

- Bluetooth: pair a phone or computer with the 6‑digit code the buddy shows
  on its screen. Then the phone app ([`app/`](app/README.md)), the
  simulator's remote page (`sim/remote.html`) or any BLE UART app controls
  everything, uploads included ([BLE.md](hardware/BLE.md)). The buddy takes
  one connection at a time.
- First boot (Wi‑Fi build): send `wifi <ssid> <password>` over Bluetooth or
  USB serial, or post it to the setup access point `DeskBuddy-xxxxxx`.
- On your network: an HTTP API at `http://desk-buddy.local/` (name
  configurable) for scripts, uploads and firmware updates
  ([API.md](hardware/API.md)). There are no web pages on the device.
- MQTT: `deskbuddy/<id>/set` picks a face, with retained state,
  availability, screen, brightness and theme topics. Home Assistant
  discovery exposes a Face select, a Theme select, a Screen switch and a
  Brightness number.
- Themes: animations tagged with a theme only play while that theme is
  selected; the common faces always do. There is a theme per build variant
  (`dj`, `cat`, `bear`, `bunny`, `king`, `unicorn`, `skeleton`, `gamer`,
  `bee`, `devil`, `dragon`, `robot`, `builder`, `hacker`, `scientist`, and `template` for
  the bare build, which holds the generic demos: eyes, a bouncing ball, a
  spinner, a clock, confetti) and seasonal or occasion ones
  (`halloween`, `xmas`, `space`, `ocean`, `birthday`, `valentine`,
  `summer`, `stpatricks`), a `rude` theme (the middle finger, a fart, an
  eye roll, talk to the hand) that stays out of the normal cycle, plus a `claude` theme in Claude's coral and
  cream, most of it about coding with Claude Code (36 animations): the CLI
  spinner "Pondering…", reading and grepping files, a diff being edited, a
  todo list ticking off, a permission prompt, a build that breaks and gets
  fixed, a merge conflict, code review, CI going green, subagents fanning
  out, context compacting, rubber‑duck debugging, an infinite loop, a git
  graph, plan mode, `npm test`, `git push`, and "Done". Eleven more are about
  programming languages: Python's indentation, a C++ template error wall, Go
  goroutines racing into a channel, Rust's borrow checker, JavaScript's
  `[] + {}`, TypeScript's red squiggles, Java's long class names (and
  coffee), a C segfault, a very nervous `DROP TABLE`, a bash pipeline, and a
  polyglot ring of file extensions. Every theme has at least three
  animations; the simulator has 110 in all.

## Claude Code on the buddy

With the hooks in [`claude_integration/`](claude_integration/README.md)
installed, the buddy plays the `claude` theme along with your Claude Code
sessions: it reads while Claude reads, types while Claude edits (in the
file's language when that animation is on the buddy: Python, C, C++, Go,
Rust, JavaScript, TypeScript, Java, SQL, bash), watches CI while tests run,
holds up a prompt when Claude needs your permission, and says "Done" when the
turn ends. It talks to the buddy over Bluetooth LE or Wi‑Fi, and there is
nothing to flash. Over Wi‑Fi it needs only Python 3; over Bluetooth it also
needs `bleak` (`python3 -m pip install bleak`).

```sh
sim/test/push_all.sh ble '^Claude'                                  # the animations, once
python3 claude_integration/buddy_bridge.py install --host ble       # or --host 192.168.50.99 for Wi‑Fi
python3 claude_integration/buddy_bridge.py demo                     # every activity, 5 s each
```

The first Bluetooth connection pairs with the code on the buddy's screen.
The bridge lets go of the link 20 s after its last command, so the phone
app and uploads can still connect. On macOS, the Buddy Bridge menu bar app
(`claude_integration/menubar/build.sh --install`) shows what the buddy is
showing and for which session, with buddy controls (face, next,
brightness, screen, theme), a Manual mode in which Claude Code leaves the
animation to you, and "leave the buddy alone for 2 min".

The 3D model has a matching Claude build: a coral body with an open laptop
on its lap and the spark on its back, a band with the spark, and ear cups
with the spark engraved (`body_claude`, `band_claude`, `cup_claude_left` /
`cup_claude_right` in `3d/round_bot.scad`; `assembly_claude` previews it).
The other themes have builds too, see [The body](#the-body).

## Hardware

| Display pin | ESP32‑S3 SuperMini |
|---|---|
| VCC | 3V3 |
| GND | GND |
| SCL | GPIO 12 |
| SDA | GPIO 11 |
| DC | GPIO 9 |
| CS | GPIO 10 |
| RST | GPIO 8 |

## The body

<p align="center">
  <img src="3d/images/c_x_dj.png" alt="Exploded view" width="300">
  <img src="3d/images/c_skeleton.png" alt="Front and back" width="520">
</p>

Every printed part comes from one OpenSCAD file,
[`3d/round_bot.scad`](3d/round_bot.scad): set `part` to a name and export
it, or print the ready STLs in `3d/stl/` (`core/`, `bodies/`,
`accessories/`). A buddy is the core (`head_shell`, `head_cap`, `neck_key`,
`base`, `usb_cover`), one body, and either two `plug`s or a band with a pair
of ear cups. The first lineup at the top of this page mixes `body_bare`,
`body_skeleton`, `body_hoodie`, `body_cat` and `body_astro` with the bands
`plain`, `cat`, `bug`, `bear`, `bunny`, `devil`, `crown`, `dino` and
`unicorn`. The theme builds in the second lineup hold something on their
lap and wear a band with a topper:

| Theme | On its lap | Band |
|---|---|---|
| `claude` | an open laptop, with the spark on its back | spark |
| `gamer` | a game controller, in a hoodie | plain, with `cup_mic` as a headset |
| `robot` | a chest panel with a grille and buttons | antenna |
| `halloween` | a jack‑o'‑lantern | witch hat |
| `xmas` | a present with a bow | reindeer antlers |
| `ocean` | a life ring | shark fin |
| `birthday` | a cake with a candle | party hat |
| `valentine` | a big heart | heart |
| `summer` | a beach ball | sun hat |
| `stpatricks` | a pot of gold | shamrock |

The parts are `body_<theme>` and `band_<theme>`, and `assembly_<theme>`
shows a coloured preview of the whole build. The bands click into the
plain `cup_left` and `cup_right`; Claude has its own cups with the spark
engraved (`cup_claude_left`, `cup_claude_right`).

Nothing is glued or screwed: a wedge key locks the head onto the neck, the
back cap snaps in, side pieces twist‑lock into the head on a sprung peg,
the band's ends hook into a slot on top of each cup (push an end in toward
the head to unhook it), the ESP32 slides into a cradle on the base plate
from the back, the plate snaps into the body, and the USB cover clicks into
its notch from outside. The bodies need supports; the bands print flat on
their back face. [`3d/RoundBot_v8_Assembly_Guide.pdf`](3d/RoundBot_v8_Assembly_Guide.pdf)
walks through the build, band hook, ESP32 cradle and USB cover included, and
lists every body and accessory with what to print for each theme. Its
source is `3d/guide/assembly_guide.html` (`node 3d/guide/build_pdf.mjs`
rebuilds the PDF).

## Quick start

```sh
# simulator (http://localhost:8080)
./sim/serve.sh

# firmware: first flash over USB, later updates over Wi-Fi
cd hardware && pio run -t upload                              # Wi-Fi build, USB
hardware/ota.sh 192.168.50.99                                 # Wi-Fi build, OTA
cd hardware && pio run -e esp32s3_supermini_ble -t upload     # build without Wi-Fi (USB only)

# push every animation to the buddy: an address, or usb / ble
sim/test/push_all.sh 192.168.50.99
sim/test/push_all.sh ble '^Claude'        # only names matching a regex

# phone app (a real phone: Bluetooth does not work in the simulators)
cd app && flutter run
```

Writing animations: read [`sim/ANIMATIONS.md`](sim/ANIMATIONS.md) (it is
also what Claude is given). Tests: `sim/test/run_tests.sh` checks the
animation format across the JavaScript, Python and C implementations;
`sim/test/smoke.sh` renders every animation in headless Chrome. The app has
`flutter analyze && flutter test` (against a fake buddy) and a device test;
the Claude Code bridge has `python3 claude_integration/test_bridge.py`, and
its menu bar app `cd claude_integration/menubar && swift test`.

## Under the hood

- **Animation format**: the changed rectangles of each frame (several small
  ones when the changes are far apart), run‑length encoded RGB565, the whole
  stream LZMA‑compressed. A three‑second face is 4–12 KB; all of the
  simulator's animations together come to 1.4 MB and fit on the Wi‑Fi build,
  and the build without Wi‑Fi has room for about twice that.
- **Firmware**: a render task on one core, networking on the other, so a
  slow upload or a Wi‑Fi scan never stalls the face. On the 4 MB flash the
  Wi‑Fi build has two 1 MB OTA slots and 1.9 MB of animation storage; the
  build without Wi‑Fi has one 640 KB app slot and 3.3 MB of storage
  ([two builds](hardware/README.md#two-builds)). Bluetooth fits next
  to Wi‑Fi only because of a set of size trims, listed in the firmware
  README.
- **Decoder**: plain C with a single row‑push callback
  (`hardware/lib/dba_player/`), checked on the host against the JavaScript
  and Python encoders.
