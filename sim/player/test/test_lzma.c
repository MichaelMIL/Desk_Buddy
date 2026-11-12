/*
 * Host test for lzma_dec.c: test_lzma <stream.lzma> <expected.bin> decodes the
 * .lzma stream and compares it with the expected bytes. sim/test/check_lzma.py
 * makes the streams with Python's lzma module (xz) in several settings.
 *
 *   cc -O2 -Wall -Wextra -I.. test_lzma.c ../lzma_dec.c -o test_lzma
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "lzma_dec.h"

static uint8_t *slurp(const char *path, size_t *n) {
  FILE *f = fopen(path, "rb");
  uint8_t *b;
  if (!f) { perror(path); exit(2); }
  fseek(f, 0, SEEK_END); *n = (size_t)ftell(f); fseek(f, 0, SEEK_SET);
  b = malloc(*n + 1);
  if (fread(b, 1, *n, f) != *n) { perror(path); exit(2); }
  fclose(f);
  return b;
}

int main(int argc, char **argv) {
  size_t zn, en, ws;
  uint8_t *z, *e, *out;
  void *work;
  int r;
  if (argc < 3) { fprintf(stderr, "usage: %s stream.lzma expected.bin\n", argv[0]); return 2; }
  z = slurp(argv[1], &zn);
  e = slurp(argv[2], &en);
  ws = lzma_work_size(z, zn);
  if (!ws) { printf("FAIL %s: header not supported\n", argv[1]); return 1; }
  work = malloc(ws);
  out = malloc(en + 1);
  r = lzma_decode(z, zn, out, en, work);
  if (r || memcmp(out, e, en)) { printf("FAIL %s: %d\n", argv[1], r); return 1; }
  /* corrupt input must fail cleanly, never crash: flip bytes and cut the stream short */
  if (zn > 40) {
    z[zn / 2] ^= 0x5a;
    (void)lzma_decode(z, zn, out, en, work);
    (void)lzma_decode(z, zn / 3, out, en, work);
  }
  return 0;
}
