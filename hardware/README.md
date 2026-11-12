# Desk buddy firmware (ESP32-S3 SuperMini + 1.28" GC9A01)

PlatformIO project that plays the animations made in `sim/` on the round
240×240 display. There are no web pages on the device: it is controlled over
Bluetooth LE ([BLE.md](BLE.md)), MQTT / Home Assistant (below), USB serial, and
an HTTP API for scripts and uploads ([API.md](API.md)).

## Wiring

| Display pin | ESP32-S3 SuperMini | Notes |
|---|---|---|
| VCC | 3V3 | module has its own 3.3 V regulator, 3.3 V or 5 V both work |
| GND | GND | |
| SCL | GPIO 12 | SPI clock (`TFT_SCLK`) |
| SDA | GPIO 11 | SPI MOSI (`TFT_MOSI`) |
| DC | GPIO 9 | data/command (`TFT_DC`) |
| CS | GPIO 10 | chip select, active low (`TFT_CS`) |
| RST | GPIO 8 | reset, active low (`TFT_RST`) |

Change pins in `platformio.ini` (the `-DTFT_*` build flags); TFT_eSPI is
configured entirely from there, no `User_Setup.h` editing. Keep
`-DUSE_FSPI_PORT=1`: on the ESP32-S3, TFT_eSPI's default port selection
resolves to SPI port 0, whose register base is 0, and the firmware crashes at
boot with `StoreProhibited` at address 0x10.

## Two builds

| | Wi-Fi build (default) | Build without Wi-Fi |
|---|---|---|
| PlatformIO environment | `esp32s3_supermini` | `esp32s3_supermini_ble` |
| Control | Bluetooth, MQTT / Home Assistant, HTTP API, USB serial | Bluetooth, USB serial |
| Animations in over | HTTP, Bluetooth, USB serial | Bluetooth, USB serial |
| Firmware updates | over Wi-Fi (OTA) or USB | USB only |
| Firmware | ~952 KB in one of two 1 MB slots (`partitions.csv`) | ~494 KB in one 640 KB slot (`partitions_ble.csv`) |
| Space for animations | 1.875 MB (65 faces fill it, ~28 KB each) | 3.3 MB (about 115 of those faces) |

The two use different partition tables, so switching between them (one USB
flash) erases the stored animations; push them again afterwards
(`sim/test/push_all.sh ble` or `usb`). Settings and Bluetooth bonds are kept.
In code the switch is `BUDDY_WIFI` (`src/config.h`): with 0, `net.cpp` and
`mqtt.cpp` compile to nothing and their headers become empty stubs.

## Build, flash, monitor

```sh
cd hardware
pio run                                   # build (Wi-Fi build)
pio run -t upload                         # flash over the SuperMini's USB port
pio run -e esp32s3_supermini_ble -t upload   # the build without Wi-Fi
pio device monitor                        # 115200 baud
```

If upload cannot find the port: hold BOOT, tap RESET, release BOOT, retry.
The board is defined as `lolin_s3_mini` (same ESP32-S3FH4R2 chip as the
SuperMini: 4 MB flash, 2 MB PSRAM, native USB).

## First start

Three ways to give the Wi-Fi build its network (the build without Wi-Fi needs
none of this):

- **Bluetooth:** pair a phone (BLE UART app, or `sim/remote.html`) and send
  `wifi <ssid> <password>`; see [BLE.md](BLE.md).
- **USB serial:** `wifi <ssid> <password>` in `pio device monitor`.
- **Setup access point:** with no Wi-Fi saved the buddy starts an open access
  point **DeskBuddy-xxxxxx** (the screen shows its name and address for a few
  seconds). Join it and `curl -X POST http://192.168.4.1/api/config -d
  ssid=<ssid> -d pass=<password>` ([API.md](API.md)).

Once on your network the API is at `http://<device name>.local/` (default
`desk-buddy.local`) or the IP printed on serial. If the saved network cannot
be reached for 20 s the access point comes back (and the station keeps
retrying every minute).

Console commands (USB serial at 115200, or a paired Bluetooth device):
`status`, `list`, `names`, `state`, `delete <name>`, `play <name>` (or
`play cycle`), `next`, `cycle [a,b,c]`, `wifi <ssid> <password>`,
`mqtt <host> [port] [user] [password]`, `prefix <topic prefix>`,
`name <device name>`, `rotation 0-3`, `loops <n>`, `speed <percent>`,
`theme <name>|none`, `screen on|off`, `brightness <10-100>` (software
dimming: the backlight is hard-wired, so pixel values are scaled),
`ble on|off|forget`, `upload <name> <bytes>`, `appass <password>`, `ap`,
`reset`, `reboot`. `names` and `state` print one machine-readable line
(comma-separated names / JSON).

## Bluetooth LE

The buddy advertises over Bluetooth LE under its device name (always in the
build without Wi-Fi; on by default in the Wi-Fi build, `ble on|off`). It
speaks the Nordic UART Service, so a generic "BLE UART" app (nRF Connect,
Bluefruit Connect) can type the console commands above, and
`sim/remote.html` is a remote with face buttons, screen, brightness and theme
(Chrome/Edge; open it through `./sim/serve.sh`). Only paired devices get in:
on the first connection the buddy shows a 6-digit code on its screen and the
phone asks for it (LE Secure Connections, bonds kept; `ble forget` forgets
them). A paired device can run every command, including uploads.

How it works, the UUIDs, every command, the upload protocol, the state JSON,
clients and troubleshooting: [BLE.md](BLE.md).

## Themes

An animation named `<theme>__<name>` (two underscores) belongs to that theme;
the simulator produces such names for animations registered with
`theme: 'xmas'` etc. Themed animations are hidden and skipped while cycling
unless their theme is selected; common animations (no prefix) always play.
Themes are discovered from the stored names, so pushing an animation with a
new prefix creates a new theme. Select it with `theme <name>` / `theme none`
(serial or Bluetooth), `POST /api/theme`, or over MQTT (`theme/set`, a Home
Assistant select). Shipped themes: one per build variant (`dj`, `cat`, `bear`, `bunny`,
`king`, `unicorn`, `skeleton`, `gamer`, `bee`, `devil`, `dragon`, `robot`)
and seasonal or occasion ones (`halloween`, `xmas`, `space`, `ocean`,
`birthday`, `valentine`, `summer`), plus `claude`.

## MQTT

Set a broker host with `mqtt <host>` (serial or Bluetooth) or `mqttHost` in
`POST /api/config`. Default prefix is
`deskbuddy/<id>`; all topics are under it:

| Topic | Direction | Payload |
|---|---|---|
| `set` | to device | face name (`face_happy`), `cycle`, or `{"animation":"face_happy"}` |
| `state` | from device, retained | current face name or `cycle` |
| `screen/set` | to device | `on` / `off` |
| `screen/state` | from device, retained | `on` / `off` |
| `brightness/set` | to device | `10`..`100` |
| `brightness/state` | from device, retained | current percentage |
| `theme/set` | to device | theme name or `none` |
| `theme/state` | from device, retained | theme name or `none` |
| `availability` | from device, retained, last will | `online` / `offline` |
| `animations` | from device, retained | JSON list of names |
| `error` | from device | e.g. `unknown animation: foo` |

With "Home Assistant discovery" on, the device appears in Home Assistant with
a **Face** select entity, a **Theme** select, a **Screen** switch and a
**Brightness** number (needs the MQTT integration).

## Getting animations in (no reflash)

Animations are stored on the device's flash file system (LittleFS: 1.875 MB
in the Wi-Fi build, 3.3 MB without Wi-Fi) and survive reboots and firmware
updates of the same build. They are stored deflated (the `DBAZ` container:
zlib over the DBA1 stream, typically 4–5× smaller, so a 3 s face is 10–25 KB)
and inflated into PSRAM when selected, using the inflate routine in the S3's
ROM. Uncompressed `DBA1` uploads are still accepted. Up to 256 are listed.

The board address can be an IP or `.local` name (HTTP, Wi-Fi build), `usb`
(USB serial) or `ble` (Bluetooth, paired):

- From the simulator: run `./sim/serve.sh`, enter the address next to
  **→ board**, press it. With "play" ticked it starts immediately.
- Every animation at once: `sim/test/push_all.sh <address>`.
- A `.dba` file from anywhere: `python3 sim/tools/dba.py push anim.dba --host <address> --name face_wave --play`.
- Manage them with `list` / `delete <name>` (serial or Bluetooth) or
  `GET` / `DELETE /api/anim`.

HTTP uses `PUT /api/anim` ([API.md](API.md)); USB and Bluetooth use the
`upload` command ([BLE.md](BLE.md#uploading-animations)). One upload at a time:
a second one is refused as busy (HTTP 409).

Nothing is compiled in by default: the Wi-Fi firmware is kept small
(~952 KB with Bluetooth) so the two OTA slots can be 1 MB each and the file
system gets 1.875 MB. With
no animation stored the screen says "push one from the sim". Compiled-in
animations are still possible (`src/animations/anim_<name>.h` + generated
`animations.h`, written by the simulator's **→ firmware** button or
`sim/test/export_all.sh`, registry by `sim/tools/gen_registry.py`) but each
one eats into the 1 MB slot; a stored animation with the same name replaces
a built-in one.

Where the flash goes: the precompiled ESP-IDF in the Arduino core (Wi-Fi
~310 KB, lwIP ~95 KB, Bluetooth controller ~67 KB, LittleFS, mDNS, FreeRTOS)
is most of it and cannot be trimmed without building ESP-IDF from source.
Bluetooth (NimBLE, ~210 KB as shipped) fits because of these trims, measured
with the linker map (`.pio/build/esp32s3_supermini/firmware.map`):

| Trim | Where | Saves |
|---|---|---|
| printf/vfprintf from the chip ROM, sprintf from newlib-nano (as ESP-IDF's `CONFIG_NEWLIB_NANO_FORMAT`): **no `%f` / `%ll` in printf formats** | `slim.py` | 56 KB |
| no C++ unwind tables (nothing catches exceptions; uncaught ones abort either way) | `platformio.ini` | 51 KB |
| NimBLE: peripheral role only, one connection | `platformio.ini` | 38 KB |
| no core dump writer (nothing read the dumps) | `src/no_coredump.c` | 11 KB |
| no web pages or captive portal (removed; the API stays) | `src/net.cpp` | ~14 KB |
| no ESP Insights log hooks (esp_diagnostics) | `slim.py` | 2 KB |
| TFT font 1 (GLCD) not loaded | `platformio.ini` | ~1.5 KB |

Bluetooth pairing (Secure Connections, bonds in NVS) is on and costs about
24 KB; only legacy pairing is left out. The linker already drops library
functions nothing calls, so editing library sources buys little: what is left unused but linked is small (WebServer's
multipart parser 3.4 KB, TFT_eSPI's virtual readPixel 0.8 KB) and would mean
vendoring the libraries.

## Firmware updates over Wi-Fi (OTA)

Wi-Fi build only (the build without Wi-Fi updates over USB):

- `hardware/ota.sh 192.168.50.99 [password]` builds and uploads the firmware
  over HTTP (`PUT /api/update`, header `X-OTA-Password` if a password is set).
- PlatformIO/ArduinoOTA: `pio run -e ota -t upload --upload-port 192.168.50.99`
  (add `--upload-flags --auth=<password>` with a password).

The screen shows "firmware update" during the transfer and the device
reboots into the new image (two app slots, see `partitions.csv`). Set a
firmware update password (`otaPass` in `POST /api/config`) if other people
are on the network; the API itself has no authentication ([API.md](API.md)).
Changing `partitions.csv` requires one USB flash.

## How it runs

Two tasks on the two cores: the renderer (core 0) draws frames and the
loading ring; the Arduino loop (core 1) runs Wi-Fi, the API server, uploads,
OTA, MQTT, Bluetooth commands (queued by the NimBLE task) and the serial
console. A recursive mutex guards the player state
and the animation registry; only the renderer touches the display. A slow
upload, a Wi-Fi scan or an MQTT reconnect therefore never stalls the face.
While an animation or firmware image is being received the screen shows a
spinner with a progress ring, the percentage and the name, then the face
comes back (the newly uploaded one if it replaced the playing one).

Uploads that would not fit in the file system (a 16 KB margin is kept, since
LittleFS crashes when written completely full) are refused with HTTP 507 (or
`error not enough space` over USB / Bluetooth) and a message saying how much
space is available.

## Layout

```
platformio.ini          board, pins, TFT_eSPI + NimBLE flags, size flags; envs: Wi-Fi, without Wi-Fi, OTA
slim.py                 build script: ROM printf, no log hooks
partitions.csv          Wi-Fi build: two 1 MB app slots (OTA) + 1.875 MB LittleFS
partitions_ble.csv      build without Wi-Fi: one 640 KB app slot + 3.3 MB LittleFS
ota.sh                  build + upload over Wi-Fi
API.md                  the HTTP API (Wi-Fi build)
BLE.md                  Bluetooth: pairing, commands, upload protocol, clients
src/main.cpp            player loop + console commands (serial and Bluetooth)
src/ble.*               Bluetooth LE: Nordic UART Service + state characteristic, pairing
src/upload.*            animation upload over USB serial / Bluetooth
src/store.*             animation registry: LittleFS uploads + built-ins
src/net.*               Wi-Fi, setup AP, HTTP API, OTA (Wi-Fi build)
src/mqtt.*              MQTT + Home Assistant discovery (Wi-Fi build)
src/config.*            settings in NVS
src/no_coredump.c       leaves ESP-IDF's core dump writer out (see the size table)
src/animations/         optional built-in animations (generated; empty by default)
lib/dba_player/         DBA1 decoder (plain C; sim/player symlinks here, sim/test checks it)
```
