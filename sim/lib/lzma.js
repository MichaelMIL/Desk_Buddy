/*
 * lzma.js - LZMA (LZMA1, the .lzma "alone" format) encoder and decoder for the
 * DBAL animation container (see dba.js). The firmware's decoder is
 * hardware/lib/dba_player/lzma_dec.c; this file mirrors it.
 *
 *   LZMA.encode(bytes, opts?) -> Uint8Array   13-byte header + range-coded data + end marker
 *   LZMA.decode(stream, outLen) -> Uint8Array
 *
 * The encoder finds matches with hash chains and, by default, picks between
 * literals, repeats and matches by their price in bits over blocks of up to
 * 2 KB (dynamic programming, like xz's "normal" mode, without its
 * literal-then-repeat shortcuts). opts.fast = true uses a greedy parser with one
 * step of lazy matching instead (xz's "fast" mode). Python's lzma module and
 * xz read the output; the desk buddy's decoder reads both.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LZMA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const N_STATES = 12, PS_MAX = 16;
  // probability model offsets, the same layout as lzma_dec.c
  const P_IS_MATCH = 0, P_IS_REP = P_IS_MATCH + N_STATES * PS_MAX, P_IS_REP_G0 = P_IS_REP + N_STATES,
    P_IS_REP_G1 = P_IS_REP_G0 + N_STATES, P_IS_REP_G2 = P_IS_REP_G1 + N_STATES, P_IS_REP0_LONG = P_IS_REP_G2 + N_STATES,
    P_DIST_SLOT = P_IS_REP0_LONG + N_STATES * PS_MAX, P_DIST_SPECIAL = P_DIST_SLOT + 4 * 64, P_ALIGN = P_DIST_SPECIAL + 128,
    LEN_SIZE = 2 + 2 * PS_MAX * 8 + 256, P_LEN_MATCH = P_ALIGN + 16, P_LEN_REP = P_LEN_MATCH + LEN_SIZE, P_LITERAL = P_LEN_REP + LEN_SIZE;
  const LEN_CHOICE = 0, LEN_CHOICE2 = 1, LEN_LOW = 2, LEN_MID = 2 + PS_MAX * 8, LEN_HIGH = 2 + 2 * PS_MAX * 8;
  const MAX_LEN = 273, TOP = 0x1000000;

  const litState = s => (s < 4 ? 0 : s < 10 ? s - 3 : s - 6);

  function header(lc, lp, pb, dictSize) {
    const h = new Uint8Array(13);
    h[0] = (pb * 5 + lp) * 9 + lc;
    for (let k = 0; k < 4; k++) h[1 + k] = (dictSize >>> (8 * k)) & 0xff;
    h.fill(0xff, 5);                                     // uncompressed size: unknown (end marker used)
    return h;
  }

  // ---- encoder ---------------------------------------------------------------

  // price of a bit in 1/16 bit units, indexed by probability >> 4 (as in the LZMA SDK)
  const PRICE = new Uint32Array(128);
  for (let i = 0; i < 128; i++) PRICE[i] = Math.round(-Math.log2(((i << 4) + 8) / 2048) * 16);
  const INF = 0x7fffffff;

  function encode(data, opts = {}) {
    const lc = opts.lc ?? 0, lp = opts.lp ?? 1, pb = opts.pb ?? 1;  // lp/pb = 1 suit 16-bit pixel data
    const depth = opts.depth ?? 128, nice = Math.min(MAX_LEN, opts.nice ?? 128);
    const n = data.length;
    let dictSize = 4096;
    while (dictSize < n) dictSize *= 2;

    // output buffer
    let out = new Uint8Array(Math.max(1024, (n >> 1) + 64)), outLen = 0;
    const put = b => {
      if (outLen === out.length) { const o = new Uint8Array(out.length * 2); o.set(out); out = o; }
      out[outLen++] = b;
    };
    header(lc, lp, pb, dictSize).forEach(put);

    // range encoder (low may exceed 2^32 by a carry, so it is a plain number)
    let low = 0, range = 0xffffffff, cache = 0, cacheSize = 1;
    const shiftLow = () => {
      if (low < 0xff000000 || low >= 0x100000000) {
        const carry = low >= 0x100000000 ? 1 : 0;
        let temp = cache;
        do { put((temp + carry) & 0xff); temp = 0xff; } while (--cacheSize !== 0);
        cache = Math.floor((low % 0x100000000) / 0x1000000);
      }
      cacheSize++;
      low = (low % 0x1000000) * 256;
    };
    const probs = new Uint16Array(P_LITERAL + (0x300 << (lc + lp))).fill(1024);
    const bit = (i, b) => {
      const p = probs[i], bound = (range >>> 11) * p;
      if (b) { low += bound; range -= bound; probs[i] = p - (p >> 5); }
      else { range = bound; probs[i] = p + ((2048 - p) >> 5); }
      while (range < TOP) { range = range * 256; shiftLow(); }
    };
    const tree = (base, bits, sym) => {
      let m = 1;
      for (let k = bits - 1; k >= 0; k--) { const b = (sym >>> k) & 1; bit(base + m, b); m = (m << 1) | b; }
    };
    const treeRev = (base, bits, sym) => {
      let m = 1;
      for (let k = 0; k < bits; k++) { const b = (sym >>> k) & 1; bit(base + m, b); m = (m << 1) | b; }
    };
    const direct = (v, bits) => {
      for (let k = bits - 1; k >= 0; k--) {
        range = Math.floor(range / 2);
        if ((v >>> k) & 1) low += range;
        while (range < TOP) { range = range * 256; shiftLow(); }
      }
    };
    const lenCode = (base, l, ps) => {                   // l = length - 2
      if (l < 8) { bit(base + LEN_CHOICE, 0); tree(base + LEN_LOW + ps * 8, 3, l); }
      else if (l < 16) { bit(base + LEN_CHOICE, 1); bit(base + LEN_CHOICE2, 0); tree(base + LEN_MID + ps * 8, 3, l - 8); }
      else { bit(base + LEN_CHOICE, 1); bit(base + LEN_CHOICE2, 1); tree(base + LEN_HIGH, 8, l - 16); }
    };
    const slotOf = d => { if (d < 4) return d; const k = 31 - Math.clz32(d); return 2 * k + ((d >>> (k - 1)) & 1); };

    const lpMask = (1 << lp) - 1, pbMask = (1 << pb) - 1;
    let state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;

    const literal = i => {
      const ps = i & pbMask;
      bit(P_IS_MATCH + state * PS_MAX + ps, 0);
      const prev = i ? data[i - 1] : 0, b = data[i];
      const lit = P_LITERAL + 0x300 * (((i & lpMask) << lc) + (prev >> (8 - lc)));
      let sym = 1;
      if (state >= 7) {
        const mb = data[i - rep0 - 1];
        let same = true;
        for (let k = 7; k >= 0; k--) {
          const v = (b >> k) & 1;
          if (same) { const mbit = (mb >> k) & 1; bit(lit + ((1 + mbit) << 8) + sym, v); same = v === mbit; }
          else bit(lit + sym, v);
          sym = (sym << 1) | v;
        }
      } else {
        for (let k = 7; k >= 0; k--) { const v = (b >> k) & 1; bit(lit + sym, v); sym = (sym << 1) | v; }
      }
      state = litState(state);
    };
    const shortRep = i => {
      const ps = i & pbMask;
      bit(P_IS_MATCH + state * PS_MAX + ps, 1); bit(P_IS_REP + state, 1);
      bit(P_IS_REP_G0 + state, 0); bit(P_IS_REP0_LONG + state * PS_MAX + ps, 0);
      state = state < 7 ? 9 : 11;
    };
    const repMatch = (i, r, len) => {
      const ps = i & pbMask;
      bit(P_IS_MATCH + state * PS_MAX + ps, 1); bit(P_IS_REP + state, 1);
      if (r === 0) { bit(P_IS_REP_G0 + state, 0); bit(P_IS_REP0_LONG + state * PS_MAX + ps, 1); }
      else {
        bit(P_IS_REP_G0 + state, 1);
        let d;
        if (r === 1) { bit(P_IS_REP_G1 + state, 0); d = rep1; }
        else {
          bit(P_IS_REP_G1 + state, 1);
          if (r === 2) { bit(P_IS_REP_G2 + state, 0); d = rep2; }
          else { bit(P_IS_REP_G2 + state, 1); d = rep3; rep3 = rep2; }
          rep2 = rep1;
        }
        rep1 = rep0; rep0 = d;
      }
      lenCode(P_LEN_REP, len - 2, ps);
      state = state < 7 ? 8 : 11;
    };
    const match = (i, dist, len) => {                   // dist = distance - 1 (0xffffffff = end marker)
      const ps = i & pbMask;
      bit(P_IS_MATCH + state * PS_MAX + ps, 1); bit(P_IS_REP + state, 0);
      lenCode(P_LEN_MATCH, len - 2, ps);
      const ls = Math.min(len - 2, 3), slot = dist === 0xffffffff ? 63 : slotOf(dist);
      tree(P_DIST_SLOT + ls * 64, 6, slot);
      if (slot >= 4) {
        const footer = (slot >> 1) - 1, base = (2 + (slot & 1)) * 2 ** footer, red = dist - base;
        if (slot < 14) treeRev(P_DIST_SPECIAL + base - slot - 1, footer, red);
        else { direct(Math.floor(red / 16), footer - 4); treeRev(P_ALIGN, 4, red & 15); }
      }
      rep3 = rep2; rep2 = rep1; rep1 = rep0; rep0 = dist;
      state = state < 7 ? 7 : 10;
    };

    // match finder: hash chains over 3 bytes
    const HB = 16, head = new Int32Array(1 << HB).fill(-1), chain = new Int32Array(Math.max(1, n));
    let inserted = 0;
    const hash = i => (((data[i] | (data[i + 1] << 8) | (data[i + 2] << 16)) * 2654435761) >>> (32 - HB));
    const insertTo = p => { for (; inserted < p && inserted + 2 < n; inserted++) { const h = hash(inserted); chain[inserted] = head[h]; head[h] = inserted; } };
    const mlen = (a, b, max) => { let l = 0; while (l < max && data[a + l] === data[b + l]) l++; return l; };
    let bestLen = 0, bestDist = 0;
    const find = i => {                                  // longest match at i -> bestLen, bestDist
      bestLen = 0; bestDist = 0;
      if (i + 2 >= n) return;
      insertTo(i);
      const max = Math.min(MAX_LEN, n - i);
      let c = head[hash(i)], k = depth;
      while (c >= 0 && k-- > 0) {
        if (data[c + bestLen] === data[i + bestLen]) {
          const l = mlen(c, i, max);
          if (l > bestLen) { bestLen = l; bestDist = i - c - 1; if (l >= nice || l === max) break; }
        }
        c = chain[c];
      }
      if (bestLen < 3) bestLen = 0;
    };
    let repLen = 0, repIdx = 0;
    const findRep = i => {
      repLen = 0; repIdx = 0;
      const max = Math.min(MAX_LEN, n - i), reps = [rep0, rep1, rep2, rep3];
      if (max < 2) return;
      for (let r = 0; r < 4; r++) {
        const s = i - reps[r] - 1;
        if (s < 0 || data[s] !== data[i] || data[s + 1] !== data[i + 1]) continue;
        const l = mlen(s, i, max);
        if (l > repLen) { repLen = l; repIdx = r; }
      }
    };
    const far = (small, big) => (big >>> 7) > small;

    const parseFast = () => {
    let i = 0;
    while (i < n) {
      findRep(i);
      if (repLen >= nice) { repMatch(i, repIdx, repLen); i += repLen; continue; }
      find(i);
      let mainLen = bestLen;
      const mainDist = bestDist;
      if (mainLen >= nice) { match(i, mainDist, mainLen); i += mainLen; continue; }
      if (repLen >= 2 && (repLen + 1 >= mainLen || (repLen + 2 >= mainLen && mainDist >= 512) || (repLen + 3 >= mainLen && mainDist >= 32768))) {
        repMatch(i, repIdx, repLen); i += repLen; continue;
      }
      if (mainLen >= 3 && i + 1 < n) {                  // lazy: would starting one byte later be better?
        const r = [repLen, repIdx];
        findRep(i + 1);
        const nextRep = repLen;
        find(i + 1);
        if (nextRep + 1 >= mainLen || bestLen > mainLen || (bestLen === mainLen && far(bestDist, mainDist)) ||
            (bestLen + 1 === mainLen && far(bestDist, mainDist) && mainLen >= 4)) mainLen = 0;
        [repLen, repIdx] = r;
      }
      if (mainLen >= 3) { match(i, mainDist, mainLen); i += mainLen; continue; }
      if (i > rep0 && data[i] === data[i - rep0 - 1] && state >= 7) shortRep(i); else literal(i);
      i++;
    }
    };

    // ---- price-based parse --------------------------------------------------------
    const bp = (i, b) => PRICE[(b ? 2048 - probs[i] : probs[i]) >> 4];
    const treePrice = (base, bits, sym) => {
      let m = 1, pr = 0;
      for (let k = bits - 1; k >= 0; k--) { const b = (sym >>> k) & 1; pr += bp(base + m, b); m = (m << 1) | b; }
      return pr;
    };
    const treeRevPrice = (base, bits, sym) => {
      let m = 1, pr = 0;
      for (let k = 0; k < bits; k++) { const b = (sym >>> k) & 1; pr += bp(base + m, b); m = (m << 1) | b; }
      return pr;
    };
    const nPS = 1 << pb;
    const lenPrices = [new Uint32Array(nPS * 272), new Uint32Array(nPS * 272)];   // [match, rep][ps * 272 + len - 2]
    const slotPrices = new Uint32Array(4 * 64), smallDist = new Uint32Array(4 * 128), alignPrices = new Uint32Array(16);
    const updatePrices = () => {
      [P_LEN_MATCH, P_LEN_REP].forEach((base, c) => {
        const t = lenPrices[c], c0 = bp(base + LEN_CHOICE, 0), c1 = bp(base + LEN_CHOICE, 1);
        const m0 = c1 + bp(base + LEN_CHOICE2, 0), m1 = c1 + bp(base + LEN_CHOICE2, 1);
        for (let ps = 0; ps < nPS; ps++) for (let l = 0; l < 272; l++) {
          t[ps * 272 + l] = l < 8 ? c0 + treePrice(base + LEN_LOW + ps * 8, 3, l)
            : l < 16 ? m0 + treePrice(base + LEN_MID + ps * 8, 3, l - 8) : m1 + treePrice(base + LEN_HIGH, 8, l - 16);
        }
      });
      for (let ls = 0; ls < 4; ls++) {
        for (let slot = 0; slot < 64; slot++) {
          let pr = treePrice(P_DIST_SLOT + ls * 64, 6, slot);
          if (slot >= 14) pr += (((slot >> 1) - 1) - 4) * 16;                 // direct bits cost one bit each
          slotPrices[ls * 64 + slot] = pr;
        }
        for (let d = 0; d < 128; d++) {
          const slot = slotOf(d);
          let pr = slotPrices[ls * 64 + slot];
          if (slot >= 4) { const footer = (slot >> 1) - 1, base = (2 + (slot & 1)) << footer; pr += treeRevPrice(P_DIST_SPECIAL + base - slot - 1, footer, d - base); }
          smallDist[ls * 128 + d] = pr;
        }
      }
      for (let k = 0; k < 16; k++) alignPrices[k] = treeRevPrice(P_ALIGN, 4, k);
    };
    const distPrice = (ls, d) => (d < 128 ? smallDist[ls * 128 + d] : slotPrices[ls * 64 + slotOf(d)] + alignPrices[d & 15]);
    const litPrice = (pos, st, mb) => {
      const prev = pos ? data[pos - 1] : 0, b = data[pos];
      const lit = P_LITERAL + 0x300 * (((pos & lpMask) << lc) + (prev >> (8 - lc)));
      let sym = 1, pr = 0, same = st >= 7;
      for (let k = 7; k >= 0; k--) {
        const v = (b >> k) & 1;
        if (same) { const mbit = (mb >> k) & 1; pr += bp(lit + ((1 + mbit) << 8) + sym, v); same = v === mbit; }
        else pr += bp(lit + sym, v);
        sym = (sym << 1) | v;
      }
      return pr;
    };

    const BLOCK = 2048, NODES = BLOCK + MAX_LEN + 1;
    const oPrice = new Int32Array(NODES), oPrev = new Int32Array(NODES), oType = new Uint8Array(NODES),
      oArg = new Float64Array(NODES), oLen = new Uint16Array(NODES), oState = new Uint8Array(NODES), oReps = new Float64Array(NODES * 4);
    const mLen = new Uint16Array(MAX_LEN + 1), mDist = new Float64Array(MAX_LEN + 1);   // match candidates at one position
    let mCount = 0;
    const findAll = i => {                               // matches at i, increasing length, nearest distance for each
      mCount = 0;
      if (i + 2 >= n) return;
      insertTo(i);
      const max = Math.min(MAX_LEN, n - i);
      let c = head[hash(i)], k = depth, best = 2;
      while (c >= 0 && k-- > 0) {
        if (data[c + best] === data[i + best]) {
          const l = mlen(c, i, max);
          if (l > best) { best = l; mLen[mCount] = l; mDist[mCount++] = i - c - 1; if (l >= nice || l === max) break; }
        }
        c = chain[c];
      }
    };
    const LIT = 0, SHORTREP = 1, REP = 2, MATCH = 3;
    const relax = (j, price, prev, type, arg, len, st, r0, r1, r2, r3) => {
      if (price >= oPrice[j]) return;
      oPrice[j] = price; oPrev[j] = prev; oType[j] = type; oArg[j] = arg; oLen[j] = len; oState[j] = st;
      const q = j * 4; oReps[q] = r0; oReps[q + 1] = r1; oReps[q + 2] = r2; oReps[q + 3] = r3;
    };
    const ops = [];
    const parseOptimal = () => {
      let pos = 0, sinceUpdate = 1 << 30;
      while (pos < n) {
        if (sinceUpdate >= BLOCK) { updatePrices(); sinceUpdate = 0; }
        const limit = Math.min(BLOCK, n - pos);
        oPrice.fill(INF, 0, Math.min(NODES, limit + MAX_LEN + 1));
        oPrice[0] = 0; oState[0] = state; oReps[0] = rep0; oReps[1] = rep1; oReps[2] = rep2; oReps[3] = rep3;
        let lenEnd = 1, end = -1, forced = false;
        for (let j = 0; j < lenEnd; j++) {
          if (j >= limit) { end = j; break; }
          const p = pos + j, st = oState[j], q = j * 4, ps = p & pbMask;
          const R0 = oReps[q], R1 = oReps[q + 1], R2 = oReps[q + 2], R3 = oReps[q + 3], base = oPrice[j];
          const maxLen = Math.min(MAX_LEN, n - p);
          findAll(p);
          if (mCount && mLen[mCount - 1] >= nice) {    // a long match: take the best path here, then it
            end = j; forced = true; break;
          }
          // literal / short rep
          const mb = p > R0 ? data[p - R0 - 1] : 0;
          relax(j + 1, base + bp(P_IS_MATCH + st * PS_MAX + ps, 0) + litPrice(p, st, mb), j, LIT, 0, 1, litState(st), R0, R1, R2, R3);
          const mPre = base + bp(P_IS_MATCH + st * PS_MAX + ps, 1), rPre = mPre + bp(P_IS_REP + st, 1);
          if (p > R0 && data[p] === data[p - R0 - 1]) {
            relax(j + 1, rPre + bp(P_IS_REP_G0 + st, 0) + bp(P_IS_REP0_LONG + st * PS_MAX + ps, 0), j, SHORTREP, 0, 1, st < 7 ? 9 : 11, R0, R1, R2, R3);
          }
          // repeat matches
          if (maxLen >= 2) {
            const reps = [R0, R1, R2, R3];
            for (let r = 0; r < 4; r++) {
              const s = p - reps[r] - 1;
              if (s < 0 || data[s] !== data[p] || data[s + 1] !== data[p + 1]) continue;
              const L = mlen(s, p, maxLen);
              let rp = rPre;
              if (r === 0) rp += bp(P_IS_REP_G0 + st, 0) + bp(P_IS_REP0_LONG + st * PS_MAX + ps, 1);
              else {
                rp += bp(P_IS_REP_G0 + st, 1);
                if (r === 1) rp += bp(P_IS_REP_G1 + st, 0);
                else rp += bp(P_IS_REP_G1 + st, 1) + bp(P_IS_REP_G2 + st, r === 3 ? 1 : 0);
              }
              const nr = r === 0 ? reps : r === 1 ? [R1, R0, R2, R3] : r === 2 ? [R2, R0, R1, R3] : [R3, R0, R1, R2];
              const lp2 = lenPrices[1], ns = st < 7 ? 8 : 11;
              for (let l = 2; l <= L; l++) relax(j + l, rp + lp2[ps * 272 + l - 2], j, REP, r, l, ns, nr[0], nr[1], nr[2], nr[3]);
              if (L >= nice) { /* long repeats are taken through the normal search below */ }
              if (j + L > lenEnd) lenEnd = j + L;
            }
          }
          // normal matches
          if (mCount) {
            const nPre = mPre + bp(P_IS_REP + st, 0), lp1 = lenPrices[0], ns = st < 7 ? 7 : 10;
            let l = 3;
            for (let k = 0; k < mCount; k++) {
              const d = mDist[k];
              for (; l <= mLen[k]; l++) relax(j + l, nPre + lp1[ps * 272 + l - 2] + distPrice(Math.min(l - 2, 3), d), j, MATCH, d, l, ns, d, R0, R1, R2);
            }
            if (j + mLen[mCount - 1] > lenEnd) lenEnd = j + mLen[mCount - 1];
          }
          if (j + 1 > lenEnd) lenEnd = j + 1;
        }
        if (end < 0) end = lenEnd;
        // backtrack to collect the ops on the cheapest path to `end`
        ops.length = 0;
        for (let j = end; j > 0; j = oPrev[j]) ops.push(j);
        ops.reverse();
        let at = pos;
        for (const j of ops) {
          const t = oType[j], l = oLen[j];
          if (t === LIT) literal(at); else if (t === SHORTREP) shortRep(at);
          else if (t === REP) repMatch(at, oArg[j], l); else match(at, oArg[j], l);
          at += l;
        }
        pos += end; sinceUpdate += end;
        if (forced) {                                    // the long match found at `end`
          findAll(pos);
          const L = mLen[mCount - 1], d = mDist[mCount - 1];
          findRep(pos);
          if (repLen >= L) { repMatch(pos, repIdx, repLen); pos += repLen; sinceUpdate += repLen; }
          else { match(pos, d, L); pos += L; sinceUpdate += L; }
        }
      }
    };
    if (opts.fast) parseFast(); else parseOptimal();
    match(n, 0xffffffff, 2);                             // end marker
    for (let k = 0; k < 5; k++) shiftLow();
    return out.slice(0, outLen);
  }

  // ---- decoder (mirrors lzma_dec.c) -----------------------------------------------

  function decode(inp, outLen) {
    if (inp.length < 18) throw new Error('LZMA: stream too short');
    let d = inp[0];
    if (d >= 225) throw new Error('LZMA: bad properties');
    const lc = d % 9; d = (d / 9) | 0;
    const lp = d % 5, pb = (d / 5) | 0;
    if (lc + lp > 4) throw new Error('LZMA: lc + lp > 4 is not supported');
    const out = new Uint8Array(outLen);
    const probs = new Uint16Array(P_LITERAL + (0x300 << (lc + lp))).fill(1024);
    let p = 13, range = 0xffffffff, code = 0;
    const next = () => { if (p >= inp.length) throw new Error('LZMA: input ended early'); return inp[p++]; };
    if (next() !== 0) throw new Error('LZMA: corrupt stream');
    for (let k = 0; k < 4; k++) code = ((code << 8) | next()) >>> 0;
    const bit = i => {
      if (range < TOP) { range = (range << 8) >>> 0; code = ((code << 8) | next()) >>> 0; }
      const pr = probs[i], bound = (range >>> 11) * pr;
      if (code < bound) { range = bound; probs[i] = pr + ((2048 - pr) >> 5); return 0; }
      range -= bound; code -= bound; probs[i] = pr - (pr >> 5); return 1;
    };
    const tree = (base, bits) => { let m = 1; for (let k = 0; k < bits; k++) m = (m << 1) | bit(base + m); return m - (1 << bits); };
    const treeRev = (base, bits) => { let m = 1, s = 0; for (let k = 0; k < bits; k++) { const b = bit(base + m); m = (m << 1) | b; s |= b << k; } return s; };
    const direct = bits => {
      let v = 0;
      while (bits--) {
        if (range < TOP) { range = (range << 8) >>> 0; code = ((code << 8) | next()) >>> 0; }
        range >>>= 1;
        if (code >= range) { code -= range; v = v * 2 + 1; } else v *= 2;
      }
      return v;
    };
    const len = (base, ps) => {
      if (!bit(base + LEN_CHOICE)) return tree(base + LEN_LOW + ps * 8, 3);
      if (!bit(base + LEN_CHOICE2)) return 8 + tree(base + LEN_MID + ps * 8, 3);
      return 16 + tree(base + LEN_HIGH, 8);
    };
    const lpMask = (1 << lp) - 1, pbMask = (1 << pb) - 1;
    let state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0, pos = 0;
    while (pos < outLen) {
      const ps = pos & pbMask;
      if (!bit(P_IS_MATCH + state * PS_MAX + ps)) {
        const prev = pos ? out[pos - 1] : 0;
        const lit = P_LITERAL + 0x300 * (((pos & lpMask) << lc) + (prev >> (8 - lc)));
        let sym = 1;
        if (state >= 7) {
          let mb = out[pos - rep0 - 1];
          do {
            const mbit = (mb >> 7) & 1; mb <<= 1;
            const b = bit(lit + ((1 + mbit) << 8) + sym);
            sym = (sym << 1) | b;
            if (b !== mbit) break;
          } while (sym < 0x100);
        }
        while (sym < 0x100) sym = (sym << 1) | bit(lit + sym);
        out[pos++] = sym & 0xff;
        state = litState(state);
        continue;
      }
      let l;
      if (bit(P_IS_REP + state)) {
        if (pos === 0) throw new Error('LZMA: corrupt stream');
        if (!bit(P_IS_REP_G0 + state)) {
          if (!bit(P_IS_REP0_LONG + state * PS_MAX + ps)) { state = state < 7 ? 9 : 11; out[pos] = out[pos - rep0 - 1]; pos++; continue; }
        } else {
          let dd;
          if (!bit(P_IS_REP_G1 + state)) dd = rep1;
          else { if (!bit(P_IS_REP_G2 + state)) dd = rep2; else { dd = rep3; rep3 = rep2; } rep2 = rep1; }
          rep1 = rep0; rep0 = dd;
        }
        l = len(P_LEN_REP, ps);
        state = state < 7 ? 8 : 11;
      } else {
        rep3 = rep2; rep2 = rep1; rep1 = rep0;
        l = len(P_LEN_MATCH, ps);
        state = state < 7 ? 7 : 10;
        const slot = tree(P_DIST_SLOT + Math.min(l, 3) * 64, 6);
        if (slot < 4) rep0 = slot;
        else {
          const footer = (slot >> 1) - 1;
          rep0 = (2 + (slot & 1)) * 2 ** footer;
          if (slot < 14) rep0 += treeRev(P_DIST_SPECIAL + rep0 - slot - 1, footer);
          else {
            rep0 += direct(footer - 4) * 16 + treeRev(P_ALIGN, 4);
            if (rep0 === 0xffffffff) throw new Error('LZMA: stream ended early');
          }
        }
        if (rep0 >= pos) throw new Error('LZMA: corrupt stream');
      }
      l += 2;
      if (l > outLen - pos) throw new Error('LZMA: corrupt stream');
      for (let s = pos - rep0 - 1; l > 0; l--) out[pos++] = out[s++];
    }
    return out;
  }

  return { encode, decode };
});
