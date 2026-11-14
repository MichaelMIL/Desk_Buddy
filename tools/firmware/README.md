# Firmware builder

Builds the desk buddy firmware (`hardware/`) with the settings you pick, and
optionally flashes it.

```sh
python3 tools/fw_builder/fw_builder.py          # opens the GUI in your browser
```

Needs Python 3 and PlatformIO (`pio`, see `hardware/README.md`); nothing else.
The page shows each setting with what it does, the PlatformIO environment and
flags it turns into, the output file name and any warnings. **Build** compiles
and copies the firmware to `tools/fw_builder/out/<name>.bin`. You can also
flash it over USB (pick the port) or send it to a running Wi-Fi build over the
network (`PUT /api/update`, as `hardware/ota.sh` does). The log streams in,
and the flash and RAM use are shown as bars (the Wi-Fi build's app slot is
1 MB; watch it when adding features).

The server binds 127.0.0.1 only, on a free port. Its API needs the random
token in the address it opens, so other web pages cannot start builds or
uploads. Stop it with Ctrl-C.

## Settings

| Setting | Default | Off / on |
|---|---|---|
| Wi-Fi | on | off: the `esp32s3_supermini_ble` environment (Bluetooth + USB, 3.3 MB for animations) |
| Bluetooth | on | off: `-DBUDDY_BLE=0` |
| USB serial only | off | on: Wi-Fi and Bluetooth off, whatever they are set to (the GUI greys them out) |
| Battery level | on | off: `-DBUDDY_BATTERY=0` |

Switching between a Wi-Fi and a no-Wi-Fi build changes the partition table,
which erases the animations stored on the buddy. Push them again afterwards
(`sim/test/push_all.sh usb`).

Output names list what is in the image, e.g.
`desk-buddy-2026.11.14d-wifi-ble-bat.bin` or
`desk-buddy-2026.11.14d-serial-nobat.bin`.

## Command line

The same, without the browser (for scripts):

```sh
python3 tools/fw_builder/fw_builder.py --list                        # settings and defaults
python3 tools/fw_builder/fw_builder.py --plan serial=on battery=off  # what a build would do
python3 tools/fw_builder/fw_builder.py --build wifi=off --upload usb # build, flash over USB
python3 tools/fw_builder/fw_builder.py --build --upload ota:desk-buddy.local[@password]
```

## How it builds

It runs `pio run -e <env>` in `hardware/`. `<env>` is `base_env` from
`options.json`, unless a setting picks another one. The extra `-D` flags go in
`PLATFORMIO_BUILD_FLAGS`, and the build directory is `hardware/.pio/fw_builder`.
So it never touches `platformio.ini`, and it does not force a full rebuild of
the normal `pio run` builds (PlatformIO still recompiles when the flags
change).

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
python3 tools/fw_builder/test_fw_builder.py
```

These check the settings-to-build logic and that `options.json` only names
environments that exist in `platformio.ini`. They do not need PlatformIO.
