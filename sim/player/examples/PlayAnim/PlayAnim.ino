/*
 * PlayAnim.ino - plays a DBA1 animation exported from the simulator on the
 * 1.28" GC9A01 round display using TFT_eSPI.
 *
 * 1. In TFT_eSPI's User_Setup.h (or a User_Setup_Select.h entry) select the
 *    GC9A01 driver with 240x240 and your SPI pins, e.g.
 *      #define GC9A01_DRIVER
 *      #define TFT_WIDTH  240
 *      #define TFT_HEIGHT 240
 *      #define TFT_MOSI 23   // SDA
 *      #define TFT_SCLK 18   // SCL
 *      #define TFT_CS    5
 *      #define TFT_DC   16
 *      #define TFT_RST  17
 *      #define SPI_FREQUENCY 40000000
 * 2. Export an animation from the simulator as a C header, save it next to
 *    this sketch as anim.h, and copy hardware/lib/dba_player/dba_player.{h,c}
 *    here too. (The PlatformIO project in hardware/ does all this for you.)
 * 3. Upload.
 *
 * Adafruit_GFX users: replace tft.pushImage(...) in push_row with
 * tft.drawRGBBitmap(x, y, (uint16_t*)px, w, 1).
 */
#include <TFT_eSPI.h>
#include "dba_player.h"
#include "anim.h"      // defines anim_xxx[] and anim_xxx_len

#ifndef ANIM_DATA
#define ANIM_DATA     anim_eyes      // change to the symbol in your anim.h
#define ANIM_DATA_LEN anim_eyes_len
#endif

TFT_eSPI tft;
static dba_t anim;
static uint16_t rowbuf[240];

static void push_row(void *user, uint16_t x, uint16_t y, uint16_t w, const uint16_t *px) {
  (void)user;
  tft.pushImage(x, y, w, 1, (uint16_t *)px);
}

void setup() {
  Serial.begin(115200);
  tft.init();
  tft.setRotation(0);
  tft.setSwapBytes(true);   // DBA pixels are native little-endian uint16_t
  tft.fillScreen(TFT_BLACK);
  if (dba_open(&anim, ANIM_DATA, ANIM_DATA_LEN) != 0) {
    Serial.println("bad animation data");
    for (;;) delay(1000);
  }
  Serial.printf("animation: %ux%u, %u frames\n", anim.width, anim.height, anim.frame_count);
}

void loop() {
  uint32_t t0 = millis();
  int ended = 0;
  uint16_t hold = dba_render_next(&anim, rowbuf, push_row, NULL, &ended);
  if (ended && !(anim.flags & DBA_FLAG_LOOP)) {
    for (;;) delay(1000);   // play once
  }
  uint32_t spent = millis() - t0;
  if (hold > spent) delay(hold - spent);
}
