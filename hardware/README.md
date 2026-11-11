# Desk buddy firmware (ESP32-S3 SuperMini + 1.28" GC9A01)

PlatformIO project that plays the animations made in `sim/` on the round
240×240 display.

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

## Build, flash, monitor

```sh
cd hardware
pio run                    # build
pio run -t upload          # flash over the SuperMini's USB port
pio device monitor         # 115200 baud
```

If upload cannot find the port: hold BOOT, tap RESET, release BOOT, retry.
The board is defined as `lolin_s3_mini` (same ESP32-S3FH4R2 chip as the
SuperMini: 4 MB flash, 2 MB PSRAM, native USB). Partition table is
`huge_app.csv`: a single 3 MB app slot, no OTA, so animations have room.

## First start, Wi-Fi and the web page

With no Wi-Fi saved the buddy starts an open access point **DeskBuddy-xxxxxx**
(the screen shows its name and address for a few seconds). Join it; the setup
page opens by itself (captive portal) or at http://192.168.4.1/. Pick a face,
enter your Wi-Fi and optional MQTT settings, press **Save & reboot**. From then
on the same page is at `http://<device name>.local/` (default
http://desk-buddy.local/) or the IP printed on the serial console. If the saved
network cannot be reached for 20 s the AP comes back (and the station keeps
retrying every minute).

The faces page (`/`) has the face buttons (common ones plus the selected
theme's, marked ✦), a screen on/off switch and a
brightness slider (software dimming: the module's backlight is hard-wired,
so pixel values are scaled; black stays black). The
**Settings** page (`/settings`) has device settings (name, display rotation,
loops per face when cycling, playback speed, which faces take part in
cycling, the face to start with, passwords for the setup AP and for firmware
updates), Wi-Fi (with scan), MQTT, the list of stored animations (upload,
delete), firmware update, reboot and factory reset.

Serial commands (115200): `status`, `list`, `delete <name>`, `play <name>` (or `play cycle`),
`next`, `cycle [a,b,c]`, `wifi <ssid> <password>`, `mqtt <host> [port] [user]
[password]`, `prefix <topic prefix>`, `name <device name>`, `rotation 0-3`,
`loops <n>`, `speed <percent>`, `theme <name>|none`, `screen on|off`, `brightness <10-100>`,
`appass <password>`, `ap`, `reset`, `reboot`.

## Themes

An animation named `<theme>__<name>` (two underscores) belongs to that theme;
the simulator produces such names for animations registered with
`theme: 'xmas'` etc. Themed animations are hidden and skipped while cycling
unless their theme is selected; common animations (no prefix) always play.
Themes are discovered from the stored names, so pushing an animation with a
new prefix creates a new theme. Select it on the Settings page, with
`theme <name>` / `theme none` on serial, or over MQTT (`theme/set`, a Home
Assistant select). Shipped themes: one per build variant (`dj`, `cat`, `bear`, `bunny`,
`king`, `unicorn`) and seasonal ones (`halloween`, `xmas`, `space`, `ocean`).

## MQTT

Set a broker host on the page (or `mqtt <host>` on serial). Default prefix is
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

Animations are stored on the device's flash file system (LittleFS, about
1.9 MB) and survive reboots and firmware updates. They are stored deflated
(the `DBAZ` container: zlib over the DBA1 stream, typically 4–5× smaller, so
a 3 s face is 10–25 KB and the file system holds 60+ of them) and inflated
into PSRAM when selected, using the inflate routine in the S3's ROM.
Uncompressed `DBA1` uploads are still accepted.

- From the simulator: run `./sim/serve.sh`, enter the board address next to
  **→ board** (e.g. `192.168.50.99` or `desk-buddy.local`), press it. The
  animation is uploaded and, with "play" ticked, starts immediately.
- Every animation at once: `sim/test/push_all.sh 192.168.50.99`.
- A `.dba` file from anywhere: `python3 sim/tools/dba.py push anim.dba --host 192.168.50.99 --name face_wave --play`,
  or the upload box on the device's Settings page.
- Manage them on the Settings page (sizes, delete) or with `list` /
  `delete <name>` on serial.

HTTP API used by all of the above: `GET /api/anim` (list), `PUT /api/anim`
with header `X-Anim-Name: <name>` and the DBA1 bytes as body, `DELETE
/api/anim?name=<name>`, `POST /api/play?name=<name>`.

Nothing is compiled in by default: the firmware is kept small (~910 KB) so
the two OTA slots can be 1 MB each and the file system gets 1.875 MB. With
no animation stored the screen says "push one from the sim". Compiled-in
animations are still possible (`src/animations/anim_<name>.h` + generated
`animations.h`, written by the simulator's **→ firmware** button or
`sim/test/export_all.sh`, registry by `sim/tools/gen_registry.py`) but each
one eats into the 1 MB slot; a stored animation with the same name replaces
a built-in one.

Where the flash goes: the Wi-Fi/TCP stack, web server, mDNS, OTA and MQTT
make up ~850 KB of the firmware and are needed for everything above, so
moving the remaining ~25 KB of pages and fonts to the file system would not
buy a smaller slot. Dropping the compiled-in face (87 KB) was the lever.

## Firmware updates over Wi-Fi (OTA)

Three ways, all needing the buddy on your network:

- `hardware/ota.sh 192.168.50.99 [password]` builds and uploads the firmware
  over HTTP (`PUT /api/update`, header `X-OTA-Password` if a password is set).
- Settings page › Firmware: pick `hardware/.pio/build/esp32s3_supermini/firmware.bin`.
- PlatformIO/ArduinoOTA: `pio run -e ota -t upload --upload-port 192.168.50.99`
  (add `--upload-flags --auth=<password>` with a password).

The screen shows "firmware update" during the transfer and the device
reboots into the new image (two app slots, see `partitions.csv`). Set a
firmware update password on the Settings page if other people are on the
network. Changing `partitions.csv` requires one USB flash.

## How it runs

Two tasks on the two cores: the renderer (core 0) draws frames and the
loading ring; the Arduino loop (core 1) runs Wi-Fi, the web server, uploads,
OTA, MQTT and the serial console. A recursive mutex guards the player state
and the animation registry; only the renderer touches the display. A slow
upload, a Wi-Fi scan or an MQTT reconnect therefore never stalls the face.
While an animation or firmware image is being received the screen shows a
spinner with a progress ring, the percentage and the name, then the face
comes back (the newly uploaded one if it replaced the playing one).

Uploads that would not fit in the file system (a 16 KB margin is kept, since
LittleFS crashes when written completely full) are refused with HTTP 507 and
a message saying how much space is available.

## Layout

```
platformio.ini          board, pins, TFT_eSPI flags, OTA env
partitions.csv          two 1 MB app slots (OTA) + 1.875 MB LittleFS
ota.sh                  build + upload over Wi-Fi
src/main.cpp            player loop + serial commands
src/store.*             animation registry: LittleFS uploads + built-ins
src/net.*               Wi-Fi, setup AP, web pages, HTTP API, OTA
src/mqtt.*              MQTT + Home Assistant discovery
src/config.*            settings in NVS
src/web_page.h          the two pages (faces, settings)
src/animations/         optional built-in animations (generated; empty by default)
lib/dba_player/         DBA1 decoder (plain C; sim/player symlinks here, sim/test checks it)
```
