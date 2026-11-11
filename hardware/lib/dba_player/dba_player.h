/*
 * dba_player.h - tiny decoder for DBA1 animations exported by the desk_buddies
 * simulator (sim/). Pure C, no dynamic allocation, display-agnostic: you give
 * it a callback that pushes one row of RGB565 pixels to the screen.
 *
 * Usage (see examples/PlayAnim/PlayAnim.ino for Arduino / TFT_eSPI):
 *
 *   dba_t anim;
 *   dba_open(&anim, anim_eyes, anim_eyes_len);
 *   static uint16_t rowbuf[240];
 *   for (;;) {
 *     uint16_t delay_ms = dba_render_next(&anim, rowbuf, push_row, NULL);
 *     wait(delay_ms);
 *   }
 *
 * Frames are deltas against the previous frame, so playback is sequential;
 * dba_rewind() restarts from frame 0 (which is always a full-screen frame).
 */
#pragma once
#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Override for memories that need special reads (e.g. AVR PROGMEM). */
#ifndef DBA_READ8
#define DBA_READ8(p) (*(const uint8_t *)(p))
#endif

#define DBA_FLAG_LOOP 1

typedef struct {
  const uint8_t *data;
  size_t len;
  uint16_t width, height, frame_count, flags;
  uint16_t frame_index;   /* index of the frame that will be rendered next */
  size_t offset;          /* byte offset of that frame's header */
} dba_t;

typedef struct {
  uint16_t x, y, w, h, delay_ms;
  uint32_t data_len;
} dba_frame_t;

/* Row callback: pixels[0..w-1] belong at (x, y). Return value ignored. */
typedef void (*dba_row_fn)(void *user, uint16_t x, uint16_t y, uint16_t w, const uint16_t *pixels);

/* Returns 0 on success, -1 if the data is not a DBA1 file. */
int dba_open(dba_t *a, const uint8_t *data, size_t len);

void dba_rewind(dba_t *a);

/* Peek at the header of the next frame. Returns 0 on success. */
int dba_peek(const dba_t *a, dba_frame_t *fh);

/*
 * Decode the next frame, calling row_fn once per row of the dirty rectangle
 * (rowbuf must hold at least a->width pixels). Advances to the following
 * frame, wrapping to 0 after the last one. Returns the frame's delay in ms,
 * or 0 if the animation has no frames. Sets *ended (if non-NULL) to 1 when the
 * frame just rendered was the last one.
 */
uint16_t dba_render_next(dba_t *a, uint16_t *rowbuf, dba_row_fn row_fn, void *user, int *ended);

#ifdef __cplusplus
}
#endif
