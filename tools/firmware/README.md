# Desk Buddy firmware: build and flash

Builds the desk buddy firmware (`hardware/`) with the settings you pick, and
flashes it from the browser.

```sh
python3 tools/firmware/firmware.py          # opens it in your browser
```

Needs Python 3, and PlatformIO (`pio`, see `hardware/README.md`) for
building. The page has two tabs:

- **Build**: each setting with what it does, the PlatformIO environment and
  flags it turns into, the output names and any warnings. **Build** compiles
  and saves the result in `tools/firmware/out/`, with live log and flash and
  RAM bars (the Wi-Fi build's app slot is 1 MB, so watch it when adding
  features). Afterwards it can flash over USB with PlatformIO, send the
  update to a running Wi-Fi build (`PUT /api/update`, as `hardware/ota.sh`
  does), or hand the build to the Flash tab.
- **Flash**: a web flasher. It writes a build to the buddy from the browser
  over USB (below).
- **Wiring**: what to connect to what for the selected settings: a diagram,
  a connection table with a check after each stage, and the parts list. It
  changes with the toggles (below).

The server binds 127.0.0.1 only, on a free port. Its API and the files in
`out/` need the random token in the address it opens, so other web pages
cannot start builds or uploads. Stop it with Ctrl-C.

## Settings

| Setting | Default | Off / on |
|---|---|---|
| Wi-Fi | on | off: the `esp32s3_supermini_ble` environment (Bluetooth + USB, 3.3 MB for animations) |
| Bluetooth | on | off: `-DBUDDY_BLE=0` |
| USB serial only | off | on: Wi-Fi and Bluetooth off, whatever they are set to (the GUI greys them out) |
| Battery level | on | off: `-DBUDDY_BATTERY=0` (and Charging status off) |
| Charging status | on | off: `-DBAT_CHRG_PIN=-1 -DBAT_STDBY_PIN=-1`, no wires to the charger's CHRG / STDBY pads |

Switching between a Wi-Fi and a no-Wi-Fi build changes the partition table,
which erases the animations stored on the buddy. Push them again afterwards
(`sim/test/push_all.sh usb`).

## Output files

Each build writes three files to `tools/firmware/out/` (not in git):

| File | |
|---|---|
| `deskbuddy_<settings>_<version>_factory.bin` | the full image from address 0x0: bootloader, partition table, `boot_app0` and the app. The Flash tab writes this, and it is the file to share for flashing a new board |
| `deskbuddy_<settings>_<version>.bin` | the app alone, for updates over Wi-Fi |
| `deskbuddy_<settings>_<version>.json` | the settings, environment, flags and sizes |

`<settings>` lists what is in it: `wifi` or `nowifi`, `ble` or `noble` (or
just `serial` for USB serial only), then `bat` or `nobat`, and `nochg` without
the charging status wires. For example
`deskbuddy_wifi_ble_bat_2026.11.14d_factory.bin` or
`deskbuddy_serial_nobat_2026.11.14d.bin`. The full image is the same as
`esptool merge_bin` of the parts PlatformIO flashes, at the offsets it
reports (`pio project metadata`).

## Flash tab (web flasher)

Works in Chrome or Edge on a computer (Web Serial), with the buddy plugged in
over USB-C:

1. Pick a build: the list shows `out/`, newest first. Or choose a
   `…_factory.bin` file; the plain `.bin` is refused, since it is the app alone.
   The page reads the image's partition table and shows the layout.
2. **Connect** and pick the port. The picker lists only Espressif USB devices
   (the SuperMini's own USB) unless "Show every serial port" is on. The page
   shows the chip and the partition table on the board, and warns when
   flashing changes it (Wi-Fi ↔ no Wi-Fi: the animations are erased).
3. **Flash**. It writes with esptool-js, then restarts the buddy.

**Keep settings** (on by default) skips the image's settings partition
(`nvs`, found in its partition table), so Wi-Fi, name, theme and Bluetooth
pairings stay. A merged image would otherwise overwrite them with blank
bytes. **Erase everything first** wipes the whole chip: settings, pairings
and animations.

If the port is busy, close anything else using it (a serial monitor,
`push_all.sh usb`, a PlatformIO upload). If the board does not answer, hold
BOOT, tap RESET, release BOOT, and connect again.

esptool-js (Espressif, Apache-2.0) is loaded from
`https://unpkg.com/esptool-js@0.7.0/bundle.js` when you click Connect. The
page also works on its own: open `flash.html` (with `style.css` next to it)
from any https or localhost address, choose a file, and flash.

## Wiring tab

Shows the same settings as the Build tab (they are shared) and draws the
circuit for them: the display on the SuperMini, and with the battery level
the LiPo, the TP4056 charger, the 1N5817, the divider, and (with charging
status) the two BAT54s to the charger's pads. Below it are the connections,
one by one, with a check after each stage, and the parts list. The circuit
is the one in `hardware/PINOUT.md`.

The pin numbers are not typed into the page. `POST /api/wiring` resolves the
macros the build would see: the `#ifndef X / #define X n` defaults in
`hardware/src/*.h`, then the environment's `build_flags` in `platformio.ini`
(following `extends`), then the settings' `-D` flags. So a setting that moves a
pin (e.g. `-DBAT_PIN=5`) or turns one off (`-1`) shows up in the diagram.
Wi-Fi and Bluetooth change nothing there (they are inside the SuperMini).

## Command line

The same, without the browser (for scripts):

```sh
python3 tools/firmware/firmware.py --list                        # settings and defaults
python3 tools/firmware/firmware.py --plan serial=on battery=off  # what a build would do
python3 tools/firmware/firmware.py --build wifi=off --upload usb # build, flash over USB (PlatformIO)
python3 tools/firmware/firmware.py --build --upload ota:desk-buddy.local[@password]
```

## How it builds

It runs `pio run -e <env>` in `hardware/`. `<env>` is `base_env` from
`options.json`, unless a setting picks another one. The extra `-D` flags go in
`PLATFORMIO_BUILD_FLAGS`, and the build directory is
`hardware/.pio/firmware_tool`. So it never touches `platformio.ini`, and the
normal `pio run` builds are not rebuilt because of it. PlatformIO still
rebuilds when the flags change. Then it asks `pio project metadata` (same
flags and directory) where the bootloader, partition table and `boot_app0`
go, and assembles the full image.

## Adding a setting

Add it to `options.json`; the GUI and the command line pick it up (restart
the server). Each entry in `options`:

| Key | |
|---|---|
| `id` | name on the command line (`id=value`), letters and digits |
| `label`, `help` | shown in the GUI |
| `type` | `bool`, `choice` or `number` |
| `default` | the value when nothing is chosen (also what the plain `pio run` builds do) |
| `requires` | optional: a macro the firmware must mention (e.g. `BUDDY_BLE`); until `hardware/src` has it the setting is locked at its default and marked "needs firmware support" |
| `upload_note` | optional: shown before flashing |
| `on` / `off` (bool) | what each value does, see below |
| `choices` (choice) | `[{ "value", "label", ...what it does }]` |
| `flag`, `min`, `max`, `slug` (number) | e.g. `"flag": "-DSPI_MHZ={value}"`; the flag is added only when the value is not the default (always with `"always": true`) |

What a value does (all optional):

| Key | |
|---|---|
| `env` | use this `[env:…]` from `platformio.ini` as the base (two settings asking for different ones is an error) |
| `flags` | list of compiler flags, e.g. `["-DBUDDY_BATTERY=0"]` (`{value}` is replaced) |
| `forces` | other settings to override, e.g. `{"wifi": false, "ble": false}` |
| `slug` | part of the output file name |

`warnings` is a list of `{ "when": { id: value, ... }, "text" }`, shown when
every listed setting has that value (after `forces`).

A new firmware option usually needs a macro in `hardware/src/config.h`
(`#ifndef BUDDY_X / #define BUDDY_X 1`, like `BUDDY_WIFI`), code behind
`#if BUDDY_X`, and an entry here with `"requires": "BUDDY_X"`.

## Tests

```sh
python3 tools/firmware/test_firmware.py
```

These check the settings-to-build logic, the full image, and that
`options.json` only names environments that exist in `platformio.ini`. They
do not need PlatformIO. The Flash page's image checks are exposed as
`window.flasher` for testing in a browser.
