/*
 * dba.js - "Desk Buddy Animation" (DBA1) encoder / decoder.
 *
 * Binary layout (all little-endian):
 *
 *   file header (16 bytes)
 *     0  char[4]  "DBA1"
 *     4  u16      width
 *     6  u16      height
 *     8  u16      frameCount
 *     10 u16      flags        bit0 = loop
 *     12 u32      reserved (0)
 *
 *   per frame (16-byte header followed by `dataLen` bytes)
 *     0  u16      x            dirty rectangle (region that changed since the
 *     2  u16      y            previous frame; frame 0 is always full screen)
 *     4  u16      w            w == 0 && h == 0 -> nothing changed, just wait
 *     6  u16      h
 *     8  u16      delayMs      how long to show this frame. 0 = the next record
 *                              belongs to the same picture: the encoder splits a
 *                              frame whose changes are far apart into several
 *                              rectangles, all but the last with delay 0
 *     10 u16      reserved (0)
 *     12 u32      dataLen
 *     16 ...      RLE stream covering w*h pixels, row-major:
 *                   token t: if t & 0x80 -> run   of (t & 0x7f) + 1 copies of next u16
 *                            else        -> literal of t + 1 u16 values follow
 *
 * Compressed containers: the whole DBA1 stream compressed, after a 12-byte header
 *   0  char[4]  "DBAL" (LZMA) or "DBAZ" (deflate, zlib format)
 *   4  u32      original (DBA1) size
 *   8  u32      compressed size
 *   12 ...      DBAL: an .lzma stream (13-byte header, see lzma.js); DBAZ: a zlib stream
 * Animations are stored and pushed compressed; the firmware unpacks into PSRAM
 * when an animation is selected. DBAL is about 40% smaller than DBAZ; firmware
 * from before DBAL support only takes DBAZ and DBA1 (Board.push falls back).
 *
 * The same format is implemented by tools/dba.py (Python), player/dba_player.c
 * (raw DBA1) and player/lzma_dec.c; hardware/src/store.cpp unpacks the containers.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DBA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAGIC = [0x44, 0x42, 0x41, 0x31]; // "DBA1"
  const MAGIC_Z = [0x44, 0x42, 0x41, 0x5a]; // "DBAZ"
  const MAGIC_L = [0x44, 0x42, 0x41, 0x4c]; // "DBAL"
  const LZMA = typeof module === 'object' && module.exports ? require('./lzma.js') : self.LZMA;
  const FLAG_LOOP = 1;

  async function pipeThrough(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }

  const hasMagic = (bytes, m) => bytes.length >= 12 && m.every((b, i) => bytes[i] === b);
  function isCompressed(bytes) { return hasMagic(bytes, MAGIC_Z) || hasMagic(bytes, MAGIC_L); }
  function isLzma(bytes) { return hasMagic(bytes, MAGIC_L); }

  function container(magic, origLen, payload) {
    const out = new Uint8Array(12 + payload.length);
    const dv = new DataView(out.buffer);
    out.set(magic, 0);
    dv.setUint32(4, origLen, true);
    dv.setUint32(8, payload.length, true);
    out.set(payload, 12);
    return out;
  }

  /** DBA1 bytes -> DBAL bytes (LZMA). Synchronous. */
  function compressLzma(bytes) {
    return container(MAGIC_L, bytes.length, LZMA.encode(bytes));
  }

  /** DBA1 bytes -> DBAZ bytes (zlib deflate), for firmware from before DBAL support. */
  async function compress(bytes) {
    return container(MAGIC_Z, bytes.length, await pipeThrough(bytes, new CompressionStream('deflate')));
  }

  /** DBAL, DBAZ or DBA1 bytes -> DBA1 bytes. */
  async function decompress(bytes) {
    if (!isCompressed(bytes)) return bytes;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const orig = dv.getUint32(4, true), clen = dv.getUint32(8, true), body = bytes.subarray(12, 12 + clen);
    const raw = isLzma(bytes) ? LZMA.decode(body, orig) : await pipeThrough(body, new DecompressionStream('deflate'));
    if (raw.length !== orig) throw new Error(`${isLzma(bytes) ? 'DBAL' : 'DBAZ'}: expected ${orig} bytes, got ${raw.length}`);
    return raw;
  }

  /** Bounding box of pixels differing between a and b, or null if identical. */
  function dirtyRect(a, b, width, height) {
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (a[row + x] !== b[row + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /**
   * Rectangles covering the pixels that differ between a and b, for splitting one
   * frame into several records: changed 4x4 tiles are grouped into 8-connected
   * clusters (scanned row by row), each cluster becomes the bounding box of its
   * changed pixels, and the two boxes whose union adds the fewest unchanged pixels
   * are merged while that is under 400 pixels. Boxes are {x, y, w, h}, in order.
   * tools/dba.py implements the same steps and must produce the same boxes.
   */
  const TILE = 4, MERGE_PX = 400;
  function splitRects(a, b, width, height) {
    const tw = Math.ceil(width / TILE), th = Math.ceil(height / TILE), nt = tw * th;
    const bx0 = new Int32Array(nt).fill(-1), by0 = new Int32Array(nt), bx1 = new Int32Array(nt), by1 = new Int32Array(nt);
    for (let y = 0; y < height; y++) {
      const row = y * width, ty = (y / TILE) | 0;
      for (let x = 0; x < width; x++) {
        if (a[row + x] === b[row + x]) continue;
        const t = ty * tw + ((x / TILE) | 0);
        if (bx0[t] < 0) { bx0[t] = x; by0[t] = y; bx1[t] = x; by1[t] = y; }
        else { if (x < bx0[t]) bx0[t] = x; if (x > bx1[t]) bx1[t] = x; by1[t] = y; }
      }
    }
    const seen = new Uint8Array(nt), boxes = [], stack = [];
    for (let t0 = 0; t0 < nt; t0++) {
      if (bx0[t0] < 0 || seen[t0]) continue;
      let x0 = width, y0 = height, x1 = -1, y1 = -1;
      seen[t0] = 1; stack.push(t0);
      while (stack.length) {
        const t = stack.pop(), tx = t % tw, ty = (t / tw) | 0;
        if (bx0[t] < x0) x0 = bx0[t]; if (by0[t] < y0) y0 = by0[t];
        if (bx1[t] > x1) x1 = bx1[t]; if (by1[t] > y1) y1 = by1[t];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx, ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= tw || ny >= th) continue;
          const u = ny * tw + nx;
          if (bx0[u] >= 0 && !seen[u]) { seen[u] = 1; stack.push(u); }
        }
      }
      boxes.push([x0, y0, x1 + 1, y1 + 1]);
    }
    const area = q => (q[2] - q[0]) * (q[3] - q[1]);
    for (;;) {
      let best = null;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const p = boxes[i], q = boxes[j];
          const u = [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3])];
          const cost = area(u) - area(p) - area(q);
          if (cost < MERGE_PX && (!best || cost < best.cost)) best = { cost, i, j, u };
        }
      }
      if (!best) break;
      boxes[best.i] = best.u;
      boxes.splice(best.j, 1);
    }
    return boxes.map(q => ({ x: q[0], y: q[1], w: q[2] - q[0], h: q[3] - q[1] }));
  }

  /** RLE-encode an array of u16 pixels. Returns an array of bytes. */
  function rleEncode(px) {
    const out = [];
    const n = px.length;
    let i = 0;
    while (i < n) {
      // measure run length at i
      let run = 1;
      while (i + run < n && run < 128 && px[i + run] === px[i]) run++;
      if (run >= 2) {
        out.push(0x80 | (run - 1), px[i] & 0xff, px[i] >> 8);
        i += run;
        continue;
      }
      // literal: extend until a run of >= 3 starts (or 128 reached)
      let j = i + 1;
      while (j < n && j - i < 128) {
        if (j + 2 < n && px[j] === px[j + 1] && px[j] === px[j + 2]) break;
        j++;
      }
      out.push(j - i - 1);
      for (let k = i; k < j; k++) out.push(px[k] & 0xff, px[k] >> 8);
      i = j;
    }
    return out;
  }

  function rleDecode(bytes, offset, count, out) {
    let o = offset, n = 0;
    while (n < count) {
      const t = bytes[o++];
      if (t & 0x80) {
        const len = (t & 0x7f) + 1;
        const v = bytes[o] | (bytes[o + 1] << 8);
        o += 2;
        for (let k = 0; k < len; k++) out[n++] = v;
      } else {
        const len = t + 1;
        for (let k = 0; k < len; k++) { out[n++] = bytes[o] | (bytes[o + 1] << 8); o += 2; }
      }
    }
    return o;
  }

  /**
   * frames: array of Uint16Array (width*height RGB565)
   * opts: { width, height, delays: number[] | number (ms per frame), loop,
   *         split (default true): several rectangles per frame when that is smaller }
   */
  function encode(frames, opts) {
    const width = opts.width, height = opts.height;
    const delays = Array.isArray(opts.delays)
      ? opts.delays
      : frames.map(() => (opts.delays || 33));
    const split = opts.split !== false;
    const chunks = [];
    const hdr = new Uint8Array(16);
    const dv = new DataView(hdr.buffer);
    hdr.set(MAGIC, 0);
    dv.setUint16(4, width, true);
    dv.setUint16(6, height, true);
    dv.setUint16(10, opts.loop === false ? 0 : FLAG_LOOP, true);
    dv.setUint32(12, 0, true);
    chunks.push(hdr);

    let prev = null, records = 0;
    const record = (f, rect, delay) => {
      let data = [];
      if (rect.w && rect.h) {
        const px = new Uint16Array(rect.w * rect.h);
        for (let y = 0; y < rect.h; y++) {
          const src = (rect.y + y) * width + rect.x;
          px.set(f.subarray(src, src + rect.w), y * rect.w);
        }
        data = rleEncode(px);
      }
      const fh = new Uint8Array(16);
      const fv = new DataView(fh.buffer);
      fv.setUint16(0, rect.x, true);
      fv.setUint16(2, rect.y, true);
      fv.setUint16(4, rect.w, true);
      fv.setUint16(6, rect.h, true);
      fv.setUint16(8, delay, true);
      fv.setUint16(10, 0, true);
      fv.setUint32(12, data.length, true);
      chunks.push(fh, Uint8Array.from(data));
      records++;
    };
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (f.length !== width * height) throw new Error(`frame ${i} has wrong size`);
      const delay = Math.max(0, Math.min(65535, Math.round(delays[i])));
      let rects;
      if (!prev) rects = [{ x: 0, y: 0, w: width, h: height }];
      else if (split) rects = splitRects(prev, f, width, height);
      else { const r = dirtyRect(prev, f, width, height); rects = r ? [r] : []; }
      if (!rects.length) rects = [{ x: 0, y: 0, w: 0, h: 0 }];
      rects.forEach((r, k) => record(f, r, k === rects.length - 1 ? delay : 0));
      prev = f;
    }
    if (records > 65535) throw new Error(`too many records (${records}); encode with split: false`);
    dv.setUint16(8, records, true);
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  /** Decode every record. Returns { width, height, loop, frames: [{pixels, delay, rect}] }. With a
   *  split encoding a picture is several records: the ones with delay 0 lead up to it. */
  function decode(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < 4; i++) if (bytes[i] !== MAGIC[i]) throw new Error('not a DBA1 file');
    const width = dv.getUint16(4, true), height = dv.getUint16(6, true);
    const count = dv.getUint16(8, true), flags = dv.getUint16(10, true);
    let o = 16;
    const frames = [];
    let cur = new Uint16Array(width * height);
    for (let i = 0; i < count; i++) {
      const x = dv.getUint16(o, true), y = dv.getUint16(o + 2, true);
      const w = dv.getUint16(o + 4, true), h = dv.getUint16(o + 6, true);
      const delay = dv.getUint16(o + 8, true);
      const dataLen = dv.getUint32(o + 12, true);
      o += 16;
      if (w && h) {
        const px = new Uint16Array(w * h);
        const end = rleDecode(bytes, o, w * h, px);
        if (end !== o + dataLen) throw new Error(`frame ${i}: RLE length mismatch`);
        for (let yy = 0; yy < h; yy++) cur.set(px.subarray(yy * w, yy * w + w), (y + yy) * width + x);
      }
      o += dataLen;
      frames.push({ pixels: new Uint16Array(cur), delay, rect: { x, y, w, h } });
    }
    return { width, height, loop: !!(flags & FLAG_LOOP), frames };
  }

  /** Render bytes as a C header usable with player/dba_player.h. */
  function toCHeader(bytes, symbol, comment) {
    const lines = [];
    lines.push('/* Generated by desk_buddies sim - DBA1 animation. ' + (comment || '') + ' */');
    lines.push('#pragma once');
    lines.push('#include <stdint.h>');
    lines.push('#include <stddef.h>');
    lines.push('#ifndef PROGMEM');
    lines.push('#define PROGMEM');
    lines.push('#endif');
    lines.push(`const size_t ${symbol}_len = ${bytes.length};`);
    lines.push(`const uint8_t ${symbol}[] PROGMEM = {`);
    for (let i = 0; i < bytes.length; i += 16) {
      const row = [];
      for (let j = i; j < Math.min(i + 16, bytes.length); j++) row.push('0x' + bytes[j].toString(16).padStart(2, '0'));
      lines.push('  ' + row.join(',') + ',');
    }
    lines.push('};');
    return lines.join('\n') + '\n';
  }

  return { MAGIC, MAGIC_Z, MAGIC_L, FLAG_LOOP, encode, decode, dirtyRect, splitRects, rleEncode, rleDecode, toCHeader,
           compress, compressLzma, decompress, isCompressed, isLzma };
});
