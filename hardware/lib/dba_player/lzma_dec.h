/*
 * lzma_dec.h - small LZMA (LZMA1, as in .lzma / xz's "lzma_alone") decoder for
 * the desk buddy's "DBAL" animation container. Decodes a whole stream into a
 * caller-provided buffer: the output buffer is the dictionary, so there is no
 * separate window to allocate, only the probability tables (see
 * lzma_work_size). Plain C, no allocation, no globals.
 *
 * Input layout: the 13-byte .lzma header (1 byte lc/lp/pb, u32 dictionary size,
 * u64 uncompressed size, which is ignored) followed by the range-coded data.
 * Decoding stops after out_len bytes or at the end-of-stream marker.
 */
#pragma once
#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define LZMA_HEADER_SIZE 13

/* Bytes of work memory needed to decode `in` (from its header), or 0 if the
 * header is not one this decoder takes (lc + lp > 4, pb > 4). */
size_t lzma_work_size(const uint8_t *in, size_t in_len);

/* Decode exactly out_len bytes. work: lzma_work_size() bytes, 2-byte aligned.
 * Returns 0 on success, or a negative error (-1 header, -2 corrupt data,
 * -3 input ended early, -4 stream ended before out_len bytes). */
int lzma_decode(const uint8_t *in, size_t in_len, uint8_t *out, size_t out_len, void *work);

#ifdef __cplusplus
}
#endif
