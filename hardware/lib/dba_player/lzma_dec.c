/* lzma_dec.c - see lzma_dec.h. Written from the LZMA specification (lzma-specification.txt in the LZMA SDK). */
#include "lzma_dec.h"

#define N_STATES 12
#define POS_STATES_MAX 16
#define PROB_INIT 1024
#define TOP (1u << 24)

/* Offsets (in uint16 probabilities) of each model inside the work memory. */
enum {
  P_IS_MATCH = 0,                                       /* [state][posState] */
  P_IS_REP = P_IS_MATCH + N_STATES * POS_STATES_MAX,    /* [state] */
  P_IS_REP_G0 = P_IS_REP + N_STATES,
  P_IS_REP_G1 = P_IS_REP_G0 + N_STATES,
  P_IS_REP_G2 = P_IS_REP_G1 + N_STATES,
  P_IS_REP0_LONG = P_IS_REP_G2 + N_STATES,              /* [state][posState] */
  P_DIST_SLOT = P_IS_REP0_LONG + N_STATES * POS_STATES_MAX,   /* [4][64] */
  P_DIST_SPECIAL = P_DIST_SLOT + 4 * 64,                /* 115 used, indexed from 1 */
  P_ALIGN = P_DIST_SPECIAL + 128,                       /* [16], indexed from 1 */
  P_LEN_MATCH = P_ALIGN + 16,                           /* length coder, see LEN_* */
  P_LEN_REP = P_LEN_MATCH + 2 + 2 * POS_STATES_MAX * 8 + 256,
  P_LITERAL = P_LEN_REP + 2 + 2 * POS_STATES_MAX * 8 + 256    /* [0x300 << (lc + lp)] */
};
enum { LEN_CHOICE = 0, LEN_CHOICE2 = 1, LEN_LOW = 2, LEN_MID = 2 + POS_STATES_MAX * 8, LEN_HIGH = 2 + 2 * POS_STATES_MAX * 8 };

typedef struct {
  const uint8_t *p, *end;
  uint32_t range, code;
  int eof;
} rc_t;

static inline uint8_t rc_byte(rc_t *rc) {
  if (rc->p < rc->end) return *rc->p++;
  rc->eof = 1;
  return 0;
}

static inline void rc_norm(rc_t *rc) {
  if (rc->range < TOP) { rc->range <<= 8; rc->code = (rc->code << 8) | rc_byte(rc); }
}

static inline unsigned rc_bit(rc_t *rc, uint16_t *prob) {
  uint32_t bound;
  rc_norm(rc);
  bound = (rc->range >> 11) * *prob;
  if (rc->code < bound) {
    rc->range = bound;
    *prob += (2048 - *prob) >> 5;
    return 0;
  }
  rc->range -= bound;
  rc->code -= bound;
  *prob -= *prob >> 5;
  return 1;
}

static unsigned rc_tree(rc_t *rc, uint16_t *probs, unsigned bits) {
  unsigned m = 1, i;
  for (i = 0; i < bits; i++) m = (m << 1) | rc_bit(rc, probs + m);
  return m - (1u << bits);
}

static unsigned rc_tree_rev(rc_t *rc, uint16_t *probs, unsigned bits) {
  unsigned m = 1, sym = 0, i, b;
  for (i = 0; i < bits; i++) { b = rc_bit(rc, probs + m); m = (m << 1) | b; sym |= b << i; }
  return sym;
}

static uint32_t rc_direct(rc_t *rc, unsigned bits) {
  uint32_t v = 0;
  while (bits--) {
    rc_norm(rc);
    rc->range >>= 1;
    if (rc->code >= rc->range) { rc->code -= rc->range; v = (v << 1) | 1; }
    else v <<= 1;
  }
  return v;
}

static unsigned decode_len(rc_t *rc, uint16_t *lc, unsigned pos_state) {
  if (!rc_bit(rc, lc + LEN_CHOICE)) return rc_tree(rc, lc + LEN_LOW + pos_state * 8, 3);
  if (!rc_bit(rc, lc + LEN_CHOICE2)) return 8 + rc_tree(rc, lc + LEN_MID + pos_state * 8, 3);
  return 16 + rc_tree(rc, lc + LEN_HIGH, 8);
}

static int read_props(const uint8_t *in, size_t in_len, unsigned *lc, unsigned *lp, unsigned *pb) {
  unsigned d;
  if (in_len < LZMA_HEADER_SIZE + 5 || in[0] >= 9 * 5 * 5) return -1;
  d = in[0];
  *lc = d % 9; d /= 9;
  *lp = d % 5;
  *pb = d / 5;
  return (*lc + *lp > 4) ? -1 : 0;
}

size_t lzma_work_size(const uint8_t *in, size_t in_len) {
  unsigned lc, lp, pb;
  if (read_props(in, in_len, &lc, &lp, &pb)) return 0;
  return ((size_t)P_LITERAL + ((size_t)0x300 << (lc + lp))) * sizeof(uint16_t);
}

int lzma_decode(const uint8_t *in, size_t in_len, uint8_t *out, size_t out_len, void *work) {
  unsigned lc, lp, pb, state = 0, i;
  uint32_t rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0, lp_mask, pb_mask;
  size_t pos = 0, n;
  uint16_t *pr = (uint16_t *)work;
  rc_t rc;

  if (read_props(in, in_len, &lc, &lp, &pb)) return -1;
  lp_mask = (1u << lp) - 1;
  pb_mask = (1u << pb) - 1;
  n = (size_t)P_LITERAL + ((size_t)0x300 << (lc + lp));
  for (i = 0; i < n; i++) pr[i] = PROB_INIT;

  rc.p = in + LZMA_HEADER_SIZE;
  rc.end = in + in_len;
  rc.eof = 0;
  if (rc_byte(&rc) != 0) return -2;                    /* the first range coder byte is always 0 */
  rc.code = 0;
  rc.range = 0xFFFFFFFFu;
  for (i = 0; i < 4; i++) rc.code = (rc.code << 8) | rc_byte(&rc);

  while (pos < out_len) {
    unsigned ps = (unsigned)pos & pb_mask, len;
    if (rc.eof) return -3;
    if (!rc_bit(&rc, pr + P_IS_MATCH + state * POS_STATES_MAX + ps)) {
      /* literal */
      unsigned prev = pos ? out[pos - 1] : 0, sym = 1;
      uint16_t *lit = pr + P_LITERAL + 0x300 * ((((unsigned)pos & lp_mask) << lc) + (prev >> (8 - lc)));
      if (state >= 7) {
        unsigned mb = out[pos - rep0 - 1];
        do {
          unsigned mbit = (mb >> 7) & 1, b;
          mb <<= 1;
          b = rc_bit(&rc, lit + ((1 + mbit) << 8) + sym);
          sym = (sym << 1) | b;
          if (b != mbit) break;
        } while (sym < 0x100);
      }
      while (sym < 0x100) sym = (sym << 1) | rc_bit(&rc, lit + sym);
      out[pos++] = (uint8_t)sym;
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
      continue;
    }
    if (rc_bit(&rc, pr + P_IS_REP + state)) {
      if (pos == 0) return -2;
      if (!rc_bit(&rc, pr + P_IS_REP_G0 + state)) {
        if (!rc_bit(&rc, pr + P_IS_REP0_LONG + state * POS_STATES_MAX + ps)) {   /* short rep: one byte */
          state = state < 7 ? 9 : 11;
          out[pos] = out[pos - rep0 - 1];
          pos++;
          continue;
        }
      } else {
        uint32_t d;
        if (!rc_bit(&rc, pr + P_IS_REP_G1 + state)) d = rep1;
        else {
          if (!rc_bit(&rc, pr + P_IS_REP_G2 + state)) d = rep2;
          else { d = rep3; rep3 = rep2; }
          rep2 = rep1;
        }
        rep1 = rep0;
        rep0 = d;
      }
      len = decode_len(&rc, pr + P_LEN_REP, ps);
      state = state < 7 ? 8 : 11;
    } else {
      unsigned slot, ls;
      rep3 = rep2; rep2 = rep1; rep1 = rep0;
      len = decode_len(&rc, pr + P_LEN_MATCH, ps);
      state = state < 7 ? 7 : 10;
      ls = len < 3 ? len : 3;
      slot = rc_tree(&rc, pr + P_DIST_SLOT + ls * 64, 6);
      if (slot < 4) rep0 = slot;
      else {
        unsigned footer = (slot >> 1) - 1;
        rep0 = (2u | (slot & 1)) << footer;
        if (slot < 14) rep0 += rc_tree_rev(&rc, pr + P_DIST_SPECIAL + rep0 - slot - 1, footer);
        else {
          rep0 += rc_direct(&rc, footer - 4) << 4;
          rep0 += rc_tree_rev(&rc, pr + P_ALIGN, 4);
          if (rep0 == 0xFFFFFFFFu) return rc.eof ? -3 : -4;   /* end marker before out_len bytes */
        }
      }
      if (rep0 >= pos) return -2;
    }
    len += 2;
    if (len > out_len - pos) return -2;
    {
      const uint8_t *src = out + pos - rep0 - 1;
      uint8_t *dst = out + pos;
      pos += len;
      while (len--) *dst++ = *src++;
    }
  }
  return rc.eof ? -3 : 0;
}
