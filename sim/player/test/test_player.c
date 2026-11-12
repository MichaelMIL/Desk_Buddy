/*
 * Host test: decode a .dba (DBA1, or the DBAL container via lzma_dec.c) with
 * dba_player.c and dump every frame as raw little-endian RGB565 to stdout, so it
 * can be compared with the source frames. Records with delay 0 are parts of the
 * picture that follows, so a frame is dumped after each record with a delay.
 *
 *   cc -O2 -Wall -Wextra -I.. test_player.c ../dba_player.c ../lzma_dec.c -o test_player
 *   ./test_player anim.dba > frames.bin
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "dba_player.h"
#include "lzma_dec.h"

static uint32_t rd32(const uint8_t *p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((uint32_t)p[3] << 24); }

static uint16_t *screen;
static uint16_t W;

static void push_row(void *user, uint16_t x, uint16_t y, uint16_t w, const uint16_t *px) {
  (void)user;
  memcpy(screen + (size_t)y * W + x, px, (size_t)w * 2);
}

int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "usage: %s file.dba\n", argv[0]); return 2; }
  FILE *f = fopen(argv[1], "rb");
  if (!f) { perror("open"); return 2; }
  fseek(f, 0, SEEK_END);
  long len = ftell(f);
  fseek(f, 0, SEEK_SET);
  uint8_t *data = malloc(len);
  if (fread(data, 1, len, f) != (size_t)len) { perror("read"); return 2; }
  fclose(f);

  if (len >= 12 && !memcmp(data, "DBAL", 4)) {           /* LZMA container: unpack first */
    uint32_t orig = rd32(data + 4), clen = rd32(data + 8);
    size_t ws = lzma_work_size(data + 12, clen);
    uint8_t *raw = malloc(orig);
    void *work = ws ? malloc(ws) : NULL;
    int r = (ws && clen + 12 <= (size_t)len) ? lzma_decode(data + 12, clen, raw, orig, work) : -1;
    if (r) { fprintf(stderr, "DBAL: unpack failed (%d)\n", r); return 1; }
    fprintf(stderr, "DBAL: %u -> %u bytes\n", clen, orig);
    free(work); free(data);
    data = raw; len = orig;
  }

  dba_t a;
  if (dba_open(&a, data, len) != 0) { fprintf(stderr, "not a DBA1 file\n"); return 1; }
  W = a.width;
  screen = calloc((size_t)a.width * a.height, 2);
  uint16_t *rowbuf = malloc((size_t)a.width * 2);
  fprintf(stderr, "%ux%u, %u frames, flags=%u\n", a.width, a.height, a.frame_count, a.flags);

  for (unsigned i = 0; i < a.frame_count; i++) {
    int ended = 0;
    uint16_t d = dba_render_next(&a, rowbuf, push_row, NULL, &ended);
    fprintf(stderr, "record %u delay %u%s\n", i, d, ended ? " (last)" : "");
    if (d == 0 && !ended) continue;                        /* part of the next picture */
    for (size_t k = 0; k < (size_t)a.width * a.height; k++) {
      unsigned char b[2] = { screen[k] & 0xff, screen[k] >> 8 };
      fwrite(b, 1, 2, stdout);
    }
  }
  return 0;
}
