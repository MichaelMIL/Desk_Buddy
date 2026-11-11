/*
 * Host test: decode a .dba with dba_player.c and dump every frame as raw
 * little-endian RGB565 to stdout, so it can be compared with the Python decoder.
 *
 *   cc -O2 -Wall -Wextra -I.. test_player.c ../dba_player.c -o test_player
 *   ./test_player anim.dba > frames.bin
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "dba_player.h"

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

  dba_t a;
  if (dba_open(&a, data, len) != 0) { fprintf(stderr, "not a DBA1 file\n"); return 1; }
  W = a.width;
  screen = calloc((size_t)a.width * a.height, 2);
  uint16_t *rowbuf = malloc((size_t)a.width * 2);
  fprintf(stderr, "%ux%u, %u frames, flags=%u\n", a.width, a.height, a.frame_count, a.flags);

  for (unsigned i = 0; i < a.frame_count; i++) {
    int ended = 0;
    uint16_t d = dba_render_next(&a, rowbuf, push_row, NULL, &ended);
    fprintf(stderr, "frame %u delay %u%s\n", i, d, ended ? " (last)" : "");
    for (size_t k = 0; k < (size_t)a.width * a.height; k++) {
      unsigned char b[2] = { screen[k] & 0xff, screen[k] >> 8 };
      fwrite(b, 1, 2, stdout);
    }
  }
  return 0;
}
