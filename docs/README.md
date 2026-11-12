# Docs

Reference for the display module, and the pictures the READMEs show.

| Path | What it is |
|---|---|
| `tft_screen_1.PNG` | The module's mechanical drawing |
| `tft_screen_2.PNG` | Its specification table |
| `tft_screen_3.PNG` | Pin definitions and the module schematic |
| [`images/`](images/) | Screenshots and animation contact sheets for the main README |

The three spec sheets are phone screenshots of the seller's AITEXM
datasheet for the 1.28" round TFT.

## The display module

| Item | Value |
|---|---|
| Panel | 1.28" round TFT, 240 × 240 RGB, normally black, all viewing angles |
| Driver | GC9A01, 4‑line SPI |
| Active area | Ø 32.4 mm, 0.135 mm dot pitch |
| PCB | Ø 38 mm round, with a pin tab; 45.5 mm from the top of the circle to the bottom of the tab |
| Backlight | 2 white LEDs in parallel, always on; 400 cd/m² typical |
| Operating temperature | −20 to +70 °C |

| Pin | Name | What it does |
|---|---|---|
| 1 | VCC | Power, into an onboard 3.3 V regulator |
| 2 | GND | Ground |
| 3 | SCL | SPI clock |
| 4 | SDA | SPI data, latched on the rising edge of SCL |
| 5 | DC | Data / command select |
| 6 | CS | Chip select, active low |
| 7 | RST | Reset, active low |

How it is wired to the ESP32‑S3 SuperMini is in the main
[README](../README.md#hardware) and the
[assembly guide](../3d/RoundBot_v8_Assembly_Guide.pdf). The enclosure's
display pocket is modelled on the drawing's dimensions (`pcb_d`, `tab_w`,
`pcb_h`, `aa_d` in [`3d/round_bot.scad`](../3d/round_bot.scad)).
