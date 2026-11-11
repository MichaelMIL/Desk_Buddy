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
 *     8  u16      delayMs      how long to show this frame
 *     10 u16      reserved (0)
 *     12 u32      dataLen
 *     16 ...      RLE stream covering w*h pixels, row-major:
 *                   token t: if t & 0x80 -> run   of (t & 0x7f) + 1 copies of next u16
 *                            else        -> literal of t + 1 u16 values follow
 *
 * Compressed container ("DBAZ"): the whole DBA1 stream deflated (zlib format).
 *   0  char[4]  "DBAZ"
 *   4  u32      original (DBA1) size
 *   8  u32      compressed size
 *   12 ...      zlib stream
 * Animations are stored and pushed compressed (typically 4-5x smaller); the
 * firmware inflates into PSRAM when an animation is selected.
 *
 * The same format is implemented by tools/dba.py (Python) and player/dba_player.c
 * (raw DBA1; hardware/src/store.cpp handles DBAZ).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DBA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAGIC = [0x44, 0x42, 0x41, 0x31]; // "DBA1"
  const MAGIC_Z = [0x44, 0x42, 0x41, 0x5a]; // "DBAZ"
  const FLAG_LOOP = 1;

  async function pipeThrough(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }

  function isCompressed(bytes) {
    return bytes.length >= 12 && MAGIC_Z.every((b, i) => bytes[i] === b);
  }

  /** DBA1 bytes -> DBAZ bytes (zlib deflate). */
  async function compress(bytes) {
    const z = await pipeThrough(bytes, new CompressionStream('deflate'));
    const out = new Uint8Array(12 + z.length);
    const dv = new DataView(out.buffer);
    out.set(MAGIC_Z, 0);
    dv.setUint32(4, bytes.length, true);
    dv.setUint32(8, z.length, true);
    out.set(z, 12);
    return out;
  }

  /** DBAZ or DBA1 bytes -> DBA1 bytes. */
  async function decompress(bytes) {
    if (!isCompressed(bytes)) return bytes;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const orig = dv.getUint32(4, true), clen = dv.getUint32(8, true);
    const raw = await pipeThrough(bytes.subarray(12, 12 + clen), new DecompressionStream('deflate'));
    if (raw.length !== orig) throw new Error(`DBAZ: expected ${orig} bytes, got ${raw.length}`);
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
   * opts: { width, height, delays: number[] | number (ms per frame), loop }
   */
  function encode(frames, opts) {
    const width = opts.width, height = opts.height;
    const delays = Array.isArray(opts.delays)
      ? opts.delays
      : frames.map(() => (opts.delays || 33));
    const chunks = [];
    const hdr = new Uint8Array(16);
    const dv = new DataView(hdr.buffer);
    hdr.set(MAGIC, 0);
    dv.setUint16(4, width, true);
    dv.setUint16(6, height, true);
    dv.setUint16(8, frames.length, true);
    dv.setUint16(10, opts.loop === false ? 0 : FLAG_LOOP, true);
    dv.setUint32(12, 0, true);
    chunks.push(hdr);

    let prev = null;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (f.length !== width * height) throw new Error(`frame ${i} has wrong size`);
      let rect = prev ? dirtyRect(prev, f, width, height) : { x: 0, y: 0, w: width, h: height };
      let data = [];
      if (rect) {
        const px = new Uint16Array(rect.w * rect.h);
        for (let y = 0; y < rect.h; y++) {
          const src = (rect.y + y) * width + rect.x;
          px.set(f.subarray(src, src + rect.w), y * rect.w);
        }
        data = rleEncode(px);
      } else {
        rect = { x: 0, y: 0, w: 0, h: 0 };
      }
      const fh = new Uint8Array(16);
      const fv = new DataView(fh.buffer);
      fv.setUint16(0, rect.x, true);
      fv.setUint16(2, rect.y, true);
      fv.setUint16(4, rect.w, true);
      fv.setUint16(6, rect.h, true);
      fv.setUint16(8, Math.max(0, Math.min(65535, Math.round(delays[i]))), true);
      fv.setUint16(10, 0, true);
      fv.setUint32(12, data.length, true);
      chunks.push(fh, Uint8Array.from(data));
      prev = f;
    }
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  /** Decode to full frames. Returns { width, height, loop, frames: [{pixels, delay, rect}] } */
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

  return { MAGIC, MAGIC_Z, FLAG_LOOP, encode, decode, dirtyRect, rleEncode, rleDecode, toCHeader, compress, decompress, isCompressed };
});
