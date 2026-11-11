#include "dba_player.h"

static uint16_t rd16(const uint8_t *p) {
  return (uint16_t)(DBA_READ8(p) | ((uint16_t)DBA_READ8(p + 1) << 8));
}

static uint32_t rd32(const uint8_t *p) {
  return (uint32_t)rd16(p) | ((uint32_t)rd16(p + 2) << 16);
}

int dba_open(dba_t *a, const uint8_t *data, size_t len) {
  if (len < 16 || DBA_READ8(data) != 'D' || DBA_READ8(data + 1) != 'B' ||
      DBA_READ8(data + 2) != 'A' || DBA_READ8(data + 3) != '1')
    return -1;
  a->data = data;
  a->len = len;
  a->width = rd16(data + 4);
  a->height = rd16(data + 6);
  a->frame_count = rd16(data + 8);
  a->flags = rd16(data + 10);
  dba_rewind(a);
  return 0;
}

void dba_rewind(dba_t *a) {
  a->frame_index = 0;
  a->offset = 16;
}

int dba_peek(const dba_t *a, dba_frame_t *fh) {
  const uint8_t *p;
  if (a->frame_count == 0 || a->offset + 16 > a->len) return -1;
  p = a->data + a->offset;
  fh->x = rd16(p);
  fh->y = rd16(p + 2);
  fh->w = rd16(p + 4);
  fh->h = rd16(p + 6);
  fh->delay_ms = rd16(p + 8);
  fh->data_len = rd32(p + 12);
  return 0;
}

uint16_t dba_render_next(dba_t *a, uint16_t *rowbuf, dba_row_fn row_fn, void *user, int *ended) {
  dba_frame_t fh;
  const uint8_t *p, *end;
  uint16_t col = 0, row = 0;
  uint8_t run_left = 0, lit_left = 0;
  uint16_t run_val = 0;

  if (ended) *ended = 0;
  if (dba_peek(a, &fh) != 0) return 0;

  p = a->data + a->offset + 16;
  end = p + fh.data_len;

  if (fh.w && fh.h) {
    /* Stream the RLE tokens straight into row-sized chunks. */
    while (row < fh.h) {
      if (run_left == 0 && lit_left == 0) {
        uint8_t t;
        if (p >= end) break; /* corrupt: stop quietly */
        t = DBA_READ8(p++);
        if (t & 0x80) {
          run_left = (uint8_t)((t & 0x7f) + 1);
          run_val = rd16(p);
          p += 2;
        } else {
          lit_left = (uint8_t)(t + 1);
        }
      }
      if (run_left) {
        rowbuf[col++] = run_val;
        run_left--;
      } else {
        rowbuf[col++] = rd16(p);
        p += 2;
        lit_left--;
      }
      if (col == fh.w) {
        row_fn(user, fh.x, (uint16_t)(fh.y + row), fh.w, rowbuf);
        col = 0;
        row++;
      }
    }
  }

  a->offset += 16 + fh.data_len;
  a->frame_index++;
  if (a->frame_index >= a->frame_count) {
    if (ended) *ended = 1;
    dba_rewind(a);
  }
  return fh.delay_ms;
}
