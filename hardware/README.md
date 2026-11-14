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

### Battery level (optional)

To run the buddy from a 1-cell LiPo and see its charge, wire two equal
resistors from the cell to GPIO 1:

```
cell + (B+) ──[ 100 kΩ ]──┬──[ 100 kΩ ]── GND
                          ├── GPIO 1
                          └──[ 100 nF ]── GND    optional, steadies the reading
```

- **Two 100 kΩ, 1 %** resistors (0603/0805 SMD or ¼ W through-hole). They halve the
  cell voltage: a full 4.2 V cell puts 2.1 V on the pin, inside the range the
  ADC measures accurately (12 dB attenuation, up to ~3.1 V); a cheaper 5 %
  pair works, `battery cal` corrects the error. The pair draws 4.2 V / 200 kΩ =
  21 µA, nothing next to the buddy's ~100 mA. Much higher values (1 MΩ) make
  the ADC read low because its sampling capacitor loads the pin; much lower
  (10 kΩ) wastes 200 µA.
- Connect the top resistor to the **cell itself** (B+ on the charger board),
  not to the SuperMini's 5V pin, which shows USB's 5 V whenever a cable is in.
- The SuperMini has no charger, so the cell goes through a charger board with
  protection (e.g. TP4056 + DW01, "03962A"): cell on B+/B−, OUT+/OUT− to the
  buddy's 5V/GND. Charge through that board's USB port. If you also plug
  USB into the SuperMini, put a Schottky diode (1N5817, SS14) from OUT+ to 5V,
  or the SuperMini's USB 5 V flows straight into the cell.
- Another pin: `-DBAT_PIN=<gpio>` in `platformio.ini`, ADC1 only (GPIO 1-10;
  ADC2 does not work while Wi-Fi is on); GPIO 1-7 are free on the SuperMini's
  other pin row. Other resistors: `-DBAT_R_TOP=<kΩ> -DBAT_R_BOTTOM=<kΩ>` (keep the
  pin under 3 V at 4.2 V).
- **No battery?** The normal builds work without one (they report no
  battery), but the `*_nobat` builds leave the battery code out entirely,
  ~12 KB less firmware (see [Two builds](#two-builds)).

The buddy reads the pin every 2 s and turns the voltage into a percentage
with a LiPo discharge curve (from the voltage alone, so expect ±5-10 %; it
reads high while charging). Without the resistors the pin floats; every 30 s
the buddy checks it with the pad's internal pull-down, and with nothing wired
it reports no battery instead of noise. With a multimeter on the cell,
`battery cal <millivolts>` (e.g. `battery cal 3950`) corrects resistor
tolerance; `battery cal reset` undoes it.

At 15 % the battery counts as low (until it is back at 20 %): the buddy plays
a low battery animation between faces (twice, or once if it does not loop),
at once and then about every 5 minutes, about every minute at 5 % and below,
and goes back to what it played. See [Battery and charging
animations](#battery-and-charging-animations) for which one and how often.
The charge is in `battery`, `status`, `state` (`bat`, `batLow`), `config`,
`GET /api/status`, MQTT and Home Assistant, the phone app, `sim/remote.html`
and the Claude Code menu bar app.

#### Charging (optional)

To let the buddy know it is on the charger, wire the TP4056's two status
pads, which drive its LEDs (open drain: low while that LED is on), to two
GPIOs, each through a Schottky diode with its band towards the charger:

```
GPIO 2 ──▶|── CHRG     (red LED)    low while charging
GPIO 4 ──▶|── STDBY    (green/blue) low once the cell is full
          1N5817, BAT54 or BAT43
```

On most TP4056 modules these are pins 7 (CHRG) and 6 (STDBY) of the chip, or
the LED side of the two LED resistors. The firmware turns on the GPIOs' own
pull-ups. The diodes matter: through its LEDs the charger pulls the pads
towards its 5 V, which the ESP32-S3's 3.3 V pins must not see (a Schottky
keeps the "low" under 0.5 V; a 1N4148 can be too high to read as low).
Without the wires the pull-ups read "not on the charger", so nothing changes.
Other pins: `-DBAT_CHRG_PIN=<gpio> -DBAT_STDBY_PIN=<gpio>`, `-1` for none;
GPIO 3 is a strapping pin, keep it free. A change counts once it holds for
2 s (a TP4056 without a cell blinks CHRG).

What the buddy does with it: an animation when plugged in, more about every
10 minutes while charging, one when charged (a top-up after "full" is not a
new plug-in), and no low battery alerts while on the charger; see the next
section. `state` and the battery
JSON carry `"chg":"charging"` or `"chg":"full"` while on the charger (absent
otherwise); the apps, `sim/remote.html` and the menu bar show a bolt or
"charged". The voltage reads high while charging, so the percentage does too.
One catch: the TP4056 ends a charge when the current falls to a tenth of its
setting, and the buddy (~100 mA, powered from OUT+) draws through it too, so
on a 1 A module "full" can come late or not at all; a module set to less
current (a larger R_PROG) or a load-sharing charger avoids that.

#### Battery and charging animations

The buddy picks these from five pools, by the animation's name, so a new
simulator animation joins its pool by itself (`Charging: full party` becomes
`charging_full_party`, in the full pool):

| Pool | Names | Plays |
|---|---|---|
| low | `battery_*` (not critical) | at once when the battery gets low, then about every `low` minutes |
| critical | `battery_critical*` | instead of low at 5 % and below, about every minute (none: the low pool) |
| plugged | `charging_plugged*` | when charging starts (none: the charging pool) |
| charging | other `charging_*` | about every `charging` minutes while charging |
| full | `charging_full*` | once, when the charger is done |

Each time it plays a random one from the pool (not the same one twice in a
row when there is another), at a random time between half and one and a half
times the interval, then goes back to what it played. With an empty pool it
shows a text screen ("Battery low" and the percentage, "Charging", "Battery
charged") for 5 s, except for the every-few-minutes charging pool. These
animations never join the cycle (unless a cycle list names them).

Settings (saved; the phone app's "Battery and charging" card and
`sim/remote.html` have them too):

```
alerts                      settings and pools as JSON
alerts low 5                low battery: about every 5 minutes (1-120); "off" for none
alerts charging 10          while charging: about every 10 minutes (1-120); 0 = only
                            when plugged in and when charged; "off" for none
alerts test charging        play one from a pool now (low, critical, plugged, charging, full)
```

`alerts` answers `alerts {"low":5,"charging":10,"pools":{"low":["battery_low",…],
"critical":[…],"plugged":[…],"charging":[…],"full":[…]}}`; `config` has
`"alerts":{"low":5,"charging":10}`. Over Wi-Fi, `POST /api/config` takes
`alertLow` and `alertCharging`.

## Two builds

| | Wi-Fi build (default) | Build without Wi-Fi |
|---|---|---|
| PlatformIO environment | `esp32s3_supermini` | `esp32s3_supermini_ble` |
| Control | Bluetooth, MQTT / Home Assistant, HTTP API, USB serial | Bluetooth, USB serial |
| Animations in over | HTTP, Bluetooth, USB serial | Bluetooth, USB serial |
| Firmware updates | over Wi-Fi (OTA) or USB | USB only |
| Firmware | ~970 KB in one of two 1 MB slots (`partitions.csv`) | ~512 KB in one 640 KB slot (`partitions_ble.csv`) |
| Space for animations | 1.875 MB (all of the simulator's animations fit, ~13 KB each) | 3.3 MB (about twice that; up to 256 are listed) |

The two use different partition tables, so switching between them (one USB
flash) erases the stored animations; push them again afterwards
(`sim/test/push_all.sh ble` or `usb`). Settings and Bluetooth bonds are kept.
In code the switch is `BUDDY_WIFI` (`src/config.h`): with 0, `net.cpp` and
`mqtt.cpp` compile to nothing and their headers become empty stubs.

Each build also comes without the [battery level](#battery-level-optional),
for buddies that always run on USB power:

| | With battery level (default) | Without |
|---|---|---|
| Wi-Fi build | `esp32s3_supermini` (~970 KB) | `esp32s3_supermini_nobat` (~958 KB) |
| Build without Wi-Fi | `esp32s3_supermini_ble` (~512 KB) | `esp32s3_supermini_ble_nobat` (~499 KB) |

Without it there is no battery code, reading or low battery alert; the state,
`config` and `/api/status` carry no battery fields, so the apps, the bridge
and the menu bar show none, and `status` says "battery: not in this build".
Switching between a build and its `_nobat` twin keeps the stored animations
(same partition table). Over Wi-Fi: `hardware/ota.sh --nobat <address>`. In
code the switch is `BUDDY_BATTERY` (`src/config.h`): with 0, `battery.cpp`
compiles to nothing and `battery.h` has stubs.

## Build, flash, monitor

```sh
cd hardware
pio run                                   # build (Wi-Fi build)
pio run -t upload                         # flash over the SuperMini's USB port
pio run -e esp32s3_supermini_ble -t upload   # the build without Wi-Fi
pio run -e esp32s3_supermini_nobat -t upload # no battery level (also esp32s3_supermini_ble_nobat)
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
`ble on|off|forget`, `upload <name> <bytes>`, `start <name>|cycle`,
`ha on|off`, `appass <password>`, `otapass <password>`, `ap`,
`battery [cal <mV>|cal reset]`, `alerts [low off|<min>] [charging off|0|<min>]
[test <pool>]`, `reset`, `reboot`. `names`, `state` and `config` print one machine-readable line
(comma-separated names / state JSON / settings JSON). Quote a Wi-Fi name
with spaces: `wifi "My Home" <password>`.

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
| `battery` | from device, retained | charge in percent (only with a battery connected) |
| `error` | from device | e.g. `unknown animation: foo` |

With "Home Assistant discovery" on, the device appears in Home Assistant with
a **Face** select entity, a **Theme** select, a **Screen** switch, a
**Brightness** number and, with a battery connected, a **Battery** sensor
(needs the MQTT integration).

## Getting animations in (no reflash)

Animations are stored on the device's flash file system (LittleFS: 1.875 MB
in the Wi-Fi build, 3.3 MB without Wi-Fi) and survive reboots and firmware
updates of the same build. They are stored compressed, normally as the `DBAL`
container (LZMA over the DBA1 stream, about 9× smaller, so a 3 s face is
4–12 KB), and unpacked into PSRAM when selected with `lib/dba_player/lzma_dec.c`
(1.8 KB of code, 7 KB of work memory; about 3.5 MB/s, so a face takes
25 ms to unpack when selected and the largest animation an estimated 125 ms). The older `DBAZ` container (zlib, about
40% larger, unpacked by the inflate routine in the S3's ROM) and uncompressed
`DBA1` uploads are still accepted. Up to 256 are listed. Frames whose changes
are far apart arrive as several records, all but the last with delay 0; the
renderer draws those back to back.

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
(~970 KB with Bluetooth) so the two OTA slots can be 1 MB each and the file
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
spinner with a progress ring and the percentage, then the face
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
lib/dba_player/         DBA1 decoder and the DBAL (LZMA) decoder (plain C; sim/player symlinks here, sim/test checks them)
```
