# Assembly: parts and pinout map

Everything needed to wire a desk buddy: the parts, which pin goes where, and a
check after each stage. The printed body and the mechanical steps are in the 3D
assembly guide (`3d/guide/assembly_guide.html`, PDF in `3d/`); the details
behind the battery parts are in [README.md](README.md#battery-level-optional).

The SuperMini's pins are labelled on its silkscreen; the tables below go by
those labels. The display pins (8-12) are on one pin row next to 5V, GND and
3V3; GPIO 1-7 are on the other row.

## Parts

### Core (every buddy)

| Part | Qty | Notes |
|---|---|---|
| ESP32-S3 SuperMini | 1 | ESP32-S3FH4R2 (4 MB flash, 2 MB PSRAM), native USB-C, 23.5 × 18 mm |
| GC9A01 1.28″ round TFT module, 240 × 240, 7-pin | 1 | 38 mm round PCB with its own 3.3 V regulator; backlight hard-wired on |
| Silicone wire, 28-30 AWG, ~10 cm | 7 | display to SuperMini; solder, no Dupont plugs (too long for the neck) |
| Heat-shrink, small | 7 | over the display header joints |
| Printed parts | | see the 3D assembly guide; no screws, no glue |

That is a complete buddy on USB power. Flash the `esp32s3_supermini_nobat`
(or `_ble_nobat`) build if it will never have a battery.

### Battery (optional)

| Part | Qty | Notes |
|---|---|---|
| 1-cell LiPo, 3.7 V | 1 | the buddy draws ~100 mA, so runtime in hours ≈ mAh / 100 (500 mAh ≈ 5 h). The current printed body has no battery bay: check the space |
| TP4056 + DW01 charger module (USB-C, "03962A") | 1 | charges the cell and protects it (over-discharge, over-current); charge through **its** USB port |
| Resistor 100 kΩ, 1 % | 2 | battery level divider (5 % works, `battery cal` corrects it) |
| Capacitor 100 nF, ceramic | 1 | optional, steadies the battery reading |
| Schottky diode 1N5817 or SS14 | 1 | charger OUT+ to the SuperMini's 5V, so USB on the SuperMini cannot back-feed the cell |
| Schottky diode BAT54, BAT43 or 1N5817 | 2 | optional, charger status pads to GPIO 2 and 4 (charging animations) |
| Silicone wire, 28-30 AWG | ~6 | |
| Slide switch | 1 | optional, in the OUT+ line, to turn the buddy off |

## GPIO map

| SuperMini pin | Connects to | Direction | Firmware | Notes |
|---|---|---|---|---|
| 3V3 | display VCC | power out | | or 5V (the display has its own regulator); on battery prefer 3V3 |
| GND | display GND, charger OUT−, divider bottom | ground | | one common ground |
| 5V | charger OUT+ through the 1N5817 (band at 5V) | power in | | only with a battery; USB-C on the SuperMini also feeds it |
| GPIO 12 | display SCL | out | `TFT_SCLK` | SPI clock |
| GPIO 11 | display SDA | out | `TFT_MOSI` | SPI data (write only, no MISO) |
| GPIO 10 | display CS | out | `TFT_CS` | chip select, active low |
| GPIO 9 | display DC | out | `TFT_DC` | data / command |
| GPIO 8 | display RST | out | `TFT_RST` | reset, active low |
| GPIO 1 | battery divider middle (and the 100 nF) | analog in | `BAT_PIN` | ADC1 channel 0; half the cell voltage, 2.1 V at full |
| GPIO 2 | charger CHRG pad, through a Schottky (band at the charger) | in, pull-up | `BAT_CHRG_PIN` | low while charging |
| GPIO 4 | charger STDBY pad, through a Schottky (band at the charger) | in, pull-up | `BAT_STDBY_PIN` | low once the cell is full |

Pins to leave alone: GPIO 0 (BOOT button), GPIO 3, 45 and 46 (strapping),
GPIO 19 / 20 (the USB-C port), GPIO 43 / 44 (serial TX / RX). Free for
additions: GPIO 5, 6 and 7. All pins are build flags in `platformio.ini`
(`-DTFT_*`, `-DBAT_PIN`, `-DBAT_CHRG_PIN`, `-DBAT_STDBY_PIN`; `-1` turns a
charger pin off).

## Wiring diagram

The display (every buddy):

```
   GC9A01 display          ESP32-S3 SuperMini
   VCC ─────────────────── 3V3   (or 5V)
   GND ─────────────────── GND
   SCL ─────────────────── GPIO 12
   SDA ─────────────────── GPIO 11
   DC  ─────────────────── GPIO 9
   CS  ─────────────────── GPIO 10
   RST ─────────────────── GPIO 8
```

The battery part (optional); `──►|──` is a diode, current flows towards the
bar (the band on the part):

```
                 ┌──────────────────┐
   LiPo + ────── │ B+          OUT+ │ ──[switch]──►|── 5V        1N5817
   LiPo − ────── │ B−          OUT− │ ──────────────── GND
                 │  TP4056 + DW01   │
                 │  (charge through │
                 │   its USB-C)     │
                 │        CHRG pad  │ ──|◄── GPIO 2              BAT54
                 │        STDBY pad │ ──|◄── GPIO 4              BAT54
                 └──────────────────┘

   B+ ──[100k]──┬──[100k]── GND
                ├────────── GPIO 1
                └──[100nF]── GND        (optional)
```

## Connections, one by one

### Display (7 wires)

| From (display) | To (SuperMini) |
|---|---|
| VCC | 3V3 (or 5V) |
| GND | GND |
| SCL | GPIO 12 |
| SDA | GPIO 11 |
| DC | GPIO 9 |
| CS | GPIO 10 |
| RST | GPIO 8 |

Check: flash the firmware (`cd hardware && pio run -t upload`); the screen
shows a face, or "no animations / push one from the sim" on a fresh board.

### Power from the battery

| From | To | Notes |
|---|---|---|
| LiPo + | charger B+ | mind the polarity: reversed, the cell is short-circuited |
| LiPo − | charger B− | |
| charger OUT+ | 1N5817 anode (no band) | optional slide switch in between |
| 1N5817 cathode (band) | SuperMini 5V | |
| charger OUT− | SuperMini GND | |

Check: unplug USB from the SuperMini; the buddy keeps running. Charging is
through the charger module's USB-C port. The diode costs ~0.3 V, so under
~3.5 V on the cell the 3.3 V rail starts to sag; the low battery alert comes
well before that (15 %, ~3.7 V).

### Battery level (3 parts)

| From | To |
|---|---|
| charger B+ (the cell +, not the 5V pin) | 100 kΩ, other end to GPIO 1 |
| GPIO 1 | 100 kΩ, other end to GND |
| GPIO 1 | 100 nF, other end to GND (optional) |

Check: `status` on the serial console (115200) or in the app shows
`battery: 64% (3912 mV)`; without the divider it says `none (nothing on GPIO 1)`.
Measure the cell with a multimeter and send `battery cal <mV>` to correct the
reading.

### Charging status (2 diodes)

| From | To |
|---|---|
| GPIO 2 | BAT54 anode; its cathode (band) to the charger's CHRG pad |
| GPIO 4 | BAT54 anode; its cathode (band) to the charger's STDBY pad |

On most TP4056 modules CHRG and STDBY are pins 7 and 6 of the chip, or the
LED side of the two LED resistors (red LED: CHRG, green or blue: STDBY). The
diodes keep the charger's 5 V, which reaches the pads through its LEDs, off
the 3.3 V pins; a Schottky keeps the "low" under 0.5 V, a 1N4148 can be too
high to read as low.

Check: plug in the charger's USB-C; within 2 s `status` shows `, charging`
and the apps show a bolt. `alerts test plugged` plays a charging animation
right away.

## Firmware for each kit

| Kit | Build (`pio run -e <env> -t upload`) |
|---|---|
| USB power only | `esp32s3_supermini_nobat` (Wi-Fi) or `esp32s3_supermini_ble_nobat` (Bluetooth only) |
| With battery, with or without the charging wires | `esp32s3_supermini` (Wi-Fi) or `esp32s3_supermini_ble` (Bluetooth only) |

Switching between Wi-Fi and Bluetooth-only builds erases the stored
animations (push them again with `sim/test/push_all.sh`); switching a build
to or from its `_nobat` twin keeps them. Then push the animations, including
the `Battery:` and `Charging:` ones: `sim/test/push_all.sh ble` (or `usb`, or
the buddy's address over Wi-Fi). How often the low battery and charging
animations play is set in the phone app or `sim/remote.html`
([README](README.md#battery-and-charging-animations)).
