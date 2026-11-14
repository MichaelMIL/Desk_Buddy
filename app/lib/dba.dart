/// The buddy's animation files, decoded on the phone so an animation can be
/// previewed before it is sent: the DBAL / DBAZ containers, the LZMA stream
/// inside DBAL, and DBA1 frames (a dirty rectangle of RLE'd RGB565 pixels
/// each). Formats: sim/lib/dba.js; this is a port of the firmware's decoders
/// (hardware/lib/dba_player/lzma_dec.c and dba_player.c).
library;

import 'dart:io' show ZLibCodec;
import 'dart:typed_data';

class DbaFormatException implements Exception {
  DbaFormatException(this.message);
  final String message;
  @override
  String toString() => 'DbaFormatException: $message';
}

bool _magic(Uint8List b, String m) =>
    b.length >= 4 &&
    b[0] == m.codeUnitAt(0) &&
    b[1] == m.codeUnitAt(1) &&
    b[2] == m.codeUnitAt(2) &&
    b[3] == m.codeUnitAt(3);

/// DBAL (LZMA), DBAZ (zlib) or DBA1 bytes -> DBA1 bytes.
Uint8List unpackDba(Uint8List data) {
  final lzma = _magic(data, 'DBAL');
  if (!lzma && !_magic(data, 'DBAZ')) return data;
  if (data.length < 12) throw DbaFormatException('container header cut off');
  final bd = ByteData.sublistView(data);
  final orig = bd.getUint32(4, Endian.little), clen = bd.getUint32(8, Endian.little);
  if (12 + clen > data.length || orig < 32 || orig > 16 << 20) throw DbaFormatException('bad container header');
  final body = Uint8List.sublistView(data, 12, 12 + clen);
  final raw = lzma ? lzmaDecode(body, orig) : Uint8List.fromList(ZLibCodec().decode(body));
  if (raw.length != orig) throw DbaFormatException('expected $orig bytes, got ${raw.length}');
  return raw;
}

// ---- LZMA ------------------------------------------------------------------------

const _nStates = 12, _posStatesMax = 16;
const _pIsMatch = 0;
const _pIsRep = _pIsMatch + _nStates * _posStatesMax;
const _pIsRepG0 = _pIsRep + _nStates;
const _pIsRepG1 = _pIsRepG0 + _nStates;
const _pIsRepG2 = _pIsRepG1 + _nStates;
const _pIsRep0Long = _pIsRepG2 + _nStates;
const _pDistSlot = _pIsRep0Long + _nStates * _posStatesMax;
const _pDistSpecial = _pDistSlot + 4 * 64;
const _pAlign = _pDistSpecial + 128;
const _lenCoderSize = 2 + 2 * _posStatesMax * 8 + 256;
const _pLenMatch = _pAlign + 16;
const _pLenRep = _pLenMatch + _lenCoderSize;
const _pLiteral = _pLenRep + _lenCoderSize;
const _lenChoice = 0,
    _lenChoice2 = 1,
    _lenLow = 2,
    _lenMid = 2 + _posStatesMax * 8,
    _lenHigh = 2 + 2 * _posStatesMax * 8;

/// Decodes an .lzma stream (13-byte header, then range-coded data) into
/// exactly [outLen] bytes, like the firmware: the output is the dictionary.
Uint8List lzmaDecode(Uint8List input, int outLen) => _Lzma(input).decode(outLen);

class _Lzma {
  _Lzma(this._in);
  final Uint8List _in;
  int _p = 0, _range = 0, _code = 0;
  bool _eof = false;
  late Uint16List _pr;

  int _byte() {
    if (_p < _in.length) return _in[_p++];
    _eof = true;
    return 0;
  }

  int _bit(int i) {
    if (_range < 0x1000000) {
      _range = (_range << 8) & 0xFFFFFFFF;
      _code = ((_code << 8) | _byte()) & 0xFFFFFFFF;
    }
    final prob = _pr[i];
    final bound = (_range >>> 11) * prob;
    if (_code < bound) {
      _range = bound;
      _pr[i] = prob + ((2048 - prob) >> 5);
      return 0;
    }
    _range -= bound;
    _code -= bound;
    _pr[i] = prob - (prob >> 5);
    return 1;
  }

  int _tree(int base, int bits) {
    var m = 1;
    for (var i = 0; i < bits; i++) {
      m = (m << 1) | _bit(base + m);
    }
    return m - (1 << bits);
  }

  int _treeRev(int base, int bits) {
    var m = 1, sym = 0;
    for (var i = 0; i < bits; i++) {
      final b = _bit(base + m);
      m = (m << 1) | b;
      sym |= b << i;
    }
    return sym;
  }

  int _direct(int bits) {
    var v = 0;
    while (bits-- > 0) {
      if (_range < 0x1000000) {
        _range = (_range << 8) & 0xFFFFFFFF;
        _code = ((_code << 8) | _byte()) & 0xFFFFFFFF;
      }
      _range >>>= 1;
      if (_code >= _range) {
        _code -= _range;
        v = (v << 1) | 1;
      } else {
        v <<= 1;
      }
    }
    return v;
  }

  int _len(int base, int posState) {
    if (_bit(base + _lenChoice) == 0) return _tree(base + _lenLow + posState * 8, 3);
    if (_bit(base + _lenChoice2) == 0) return 8 + _tree(base + _lenMid + posState * 8, 3);
    return 16 + _tree(base + _lenHigh, 8);
  }

  Uint8List decode(int outLen) {
    final input = _in;
    if (input.length < 13 + 5 || input[0] >= 9 * 5 * 5) throw DbaFormatException('not an LZMA stream');
    var d = input[0];
    final lc = d % 9;
    d ~/= 9;
    final lp = d % 5, pb = d ~/ 5;
    if (lc + lp > 4) throw DbaFormatException('LZMA lc + lp > 4');
    final lpMask = (1 << lp) - 1, pbMask = (1 << pb) - 1;
    _pr = Uint16List(_pLiteral + (0x300 << (lc + lp)))..fillRange(0, _pLiteral + (0x300 << (lc + lp)), 1024);
    _p = 13;
    if (_byte() != 0) throw DbaFormatException('LZMA data corrupt');
    _code = 0;
    _range = 0xFFFFFFFF;
    for (var i = 0; i < 4; i++) {
      _code = ((_code << 8) | _byte()) & 0xFFFFFFFF;
    }

    final out = Uint8List(outLen);
    var pos = 0, state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;
    while (pos < outLen) {
      if (_eof) throw DbaFormatException('LZMA input ended early');
      final ps = pos & pbMask;
      if (_bit(_pIsMatch + state * _posStatesMax + ps) == 0) {
        // literal
        final prev = pos > 0 ? out[pos - 1] : 0;
        final lit = _pLiteral + 0x300 * (((pos & lpMask) << lc) + (prev >> (8 - lc)));
        var sym = 1;
        if (state >= 7) {
          var mb = out[pos - rep0 - 1];
          do {
            final mbit = (mb >> 7) & 1;
            mb <<= 1;
            final b = _bit(lit + ((1 + mbit) << 8) + sym);
            sym = (sym << 1) | b;
            if (b != mbit) break;
          } while (sym < 0x100);
        }
        while (sym < 0x100) {
          sym = (sym << 1) | _bit(lit + sym);
        }
        out[pos++] = sym & 0xFF;
        state = state < 4 ? 0 : (state < 10 ? state - 3 : state - 6);
        continue;
      }
      int len;
      if (_bit(_pIsRep + state) == 1) {
        if (pos == 0) throw DbaFormatException('LZMA data corrupt');
        if (_bit(_pIsRepG0 + state) == 0) {
          if (_bit(_pIsRep0Long + state * _posStatesMax + ps) == 0) {
            // short rep: one byte
            state = state < 7 ? 9 : 11;
            out[pos] = out[pos - rep0 - 1];
            pos++;
            continue;
          }
        } else {
          int dist;
          if (_bit(_pIsRepG1 + state) == 0) {
            dist = rep1;
          } else {
            if (_bit(_pIsRepG2 + state) == 0) {
              dist = rep2;
            } else {
              dist = rep3;
              rep3 = rep2;
            }
            rep2 = rep1;
          }
          rep1 = rep0;
          rep0 = dist;
        }
        len = _len(_pLenRep, ps);
        state = state < 7 ? 8 : 11;
      } else {
        rep3 = rep2;
        rep2 = rep1;
        rep1 = rep0;
        len = _len(_pLenMatch, ps);
        state = state < 7 ? 7 : 10;
        final slot = _tree(_pDistSlot + (len < 3 ? len : 3) * 64, 6);
        if (slot < 4) {
          rep0 = slot;
        } else {
          final footer = (slot >> 1) - 1;
          rep0 = (2 | (slot & 1)) << footer;
          if (slot < 14) {
            rep0 += _treeRev(_pDistSpecial + rep0 - slot - 1, footer);
          } else {
            rep0 += _direct(footer - 4) << 4;
            rep0 += _treeRev(_pAlign, 4);
            if (rep0 == 0xFFFFFFFF) {
              throw DbaFormatException(_eof ? 'LZMA input ended early' : 'LZMA stream ended early');
            }
          }
        }
        if (rep0 >= pos) throw DbaFormatException('LZMA data corrupt');
      }
      len += 2;
      if (len > outLen - pos) throw DbaFormatException('LZMA data corrupt');
      var src = pos - rep0 - 1;
      for (final end = pos + len; pos < end;) {
        out[pos++] = out[src++];
      }
    }
    if (_eof) throw DbaFormatException('LZMA input ended early');
    return out;
  }
}

// ---- DBA1 ------------------------------------------------------------------------

/// One frame record: a rectangle of new pixels (none when w or h is 0) shown
/// for [delay] ms; 0 means the next record belongs to the same picture.
class DbaRecord {
  const DbaRecord(this.x, this.y, this.w, this.h, this.delay, this.offset, this.length);
  final int x, y, w, h, delay;

  /// Where its RLE data starts in [DbaAnimation.data], and how long it is.
  final int offset, length;
}

/// A parsed DBA1 animation. Frames are deltas, so it plays front to back
/// (see [DbaCanvas]).
class DbaAnimation {
  DbaAnimation._(this.data, this.width, this.height, this.loop, this.records);

  final Uint8List data;
  final int width, height;
  final bool loop;
  final List<DbaRecord> records;

  /// DBAL, DBAZ or DBA1 bytes.
  factory DbaAnimation.decode(Uint8List bytes) => DbaAnimation.parse(unpackDba(bytes));

  /// DBA1 bytes. Checks the layout, not the pixels (see [DbaCanvas]).
  factory DbaAnimation.parse(Uint8List b) {
    if (!_magic(b, 'DBA1') || b.length < 16) throw DbaFormatException('not a DBA1 animation');
    final bd = ByteData.sublistView(b);
    final width = bd.getUint16(4, Endian.little), height = bd.getUint16(6, Endian.little);
    final count = bd.getUint16(8, Endian.little), flags = bd.getUint16(10, Endian.little);
    if (width == 0 || height == 0 || width > 1024 || height > 1024) {
      throw DbaFormatException('bad size ${width}x$height');
    }
    final records = <DbaRecord>[];
    var o = 16;
    for (var i = 0; i < count; i++) {
      if (o + 16 > b.length) throw DbaFormatException('frame $i cut off');
      final x = bd.getUint16(o, Endian.little), y = bd.getUint16(o + 2, Endian.little);
      final w = bd.getUint16(o + 4, Endian.little), h = bd.getUint16(o + 6, Endian.little);
      final delay = bd.getUint16(o + 8, Endian.little), len = bd.getUint32(o + 12, Endian.little);
      if (o + 16 + len > b.length) throw DbaFormatException('frame $i data cut off');
      if ((w > 0 && h > 0) && (x + w > width || y + h > height)) {
        throw DbaFormatException('frame $i outside the screen');
      }
      records.add(DbaRecord(x, y, w, h, delay, o + 16, len));
      o += 16 + len;
    }
    if (records.isEmpty) throw DbaFormatException('no frames');
    return DbaAnimation._(b, width, height, (flags & 1) != 0, records);
  }

  /// Pictures shown (records with a delay; split ones count once).
  int get frameCount => records.where((r) => r.delay > 0).length;

  /// One pass, in ms.
  int get durationMs => records.fold(0, (t, r) => t + r.delay);
}

/// RGB565 -> RGBA8888 as one little-endian word (bytes R, G, B, A), like
/// sim/tools/dba.py's rgb_from_565.
final Uint32List _rgba = () {
  final t = Uint32List(65536);
  for (var c = 0; c < 65536; c++) {
    final r = (c >> 11) & 0x1F, g = (c >> 5) & 0x3F, b = c & 0x1F;
    t[c] = 0xFF000000 | (((b << 3) | (b >> 2)) << 16) | (((g << 2) | (g >> 4)) << 8) | ((r << 3) | (r >> 2));
  }
  return t;
}();

/// Plays an animation into an RGBA buffer (rows of [DbaAnimation.width]
/// pixels, R, G, B, A bytes), the way the buddy draws it on its screen.
class DbaCanvas {
  DbaCanvas(this.anim) : rgba = Uint8List(anim.width * anim.height * 4) {
    _px = Uint32List.view(rgba.buffer);
  }

  final DbaAnimation anim;
  final Uint8List rgba;
  late final Uint32List _px;
  int _next = 0;

  /// Draws the next picture (the records up to one with a delay) and returns
  /// how long to show it, in ms. After the last one it starts over.
  int step() {
    final records = anim.records;
    var guard = records.length;
    while (true) {
      if (_next >= records.length) _next = 0;
      final r = records[_next++];
      _draw(r);
      if (r.delay > 0 || _next >= records.length || --guard <= 0) return r.delay;
    }
  }

  /// Draws the picture that makes the best still and returns its index: a
  /// typical one, not a blink or fade to (nearly) black and not a flash. Of
  /// the pictures with more than 2 % of their pixels lit (all, if none is),
  /// the one nearest their median; of equals, the one nearest the middle.
  int showPoster() {
    final n = anim.frameCount;
    if (n <= 1) {
      seek(0);
      return 0;
    }
    _next = 0;
    final lit = [for (var i = 0; i < n; i++) (step(), _lit()).$2];
    final samples = (_px.length + 6) ~/ 7;
    var shown = [
      for (var i = 0; i < n; i++)
        if (lit[i] * 50 > samples) i,
    ];
    if (shown.isEmpty) shown = [for (var i = 0; i < n; i++) i];
    final typical = ([for (final i in shown) lit[i]]..sort())[shown.length ~/ 2];
    final mid = (n - 1) / 2;
    var best = shown.first;
    for (final i in shown) {
      final d = (lit[i] - typical).abs(), bd = (lit[best] - typical).abs();
      if (d < bd || (d == bd && (i - mid).abs() < (best - mid).abs())) best = i;
    }
    seek(best);
    return best;
  }

  /// Sampled pixels brighter than near-black.
  int _lit() {
    var n = 0;
    final px = _px;
    for (var i = 0; i < px.length; i += 7) {
      final p = px[i];
      if ((p & 0xFF) > 40 || ((p >> 8) & 0xFF) > 40 || ((p >> 16) & 0xFF) > 40) n++;
    }
    return n;
  }

  /// Draws from the start up to picture [index].
  void seek(int index) {
    _next = 0;
    for (var i = 0; i <= index; i++) {
      step();
    }
  }

  void _draw(DbaRecord r) {
    if (r.w == 0 || r.h == 0) return;
    final data = anim.data, px = _px, lut = _rgba, width = anim.width;
    var p = r.offset;
    final end = r.offset + r.length;
    var col = 0, row = 0, at = r.y * width + r.x;
    while (row < r.h && p < end) {
      final t = data[p++];
      int n;
      int? run;
      if (t & 0x80 != 0) {
        n = (t & 0x7F) + 1;
        if (p + 2 > end) throw DbaFormatException('RLE run cut off');
        run = lut[data[p] | (data[p + 1] << 8)];
        p += 2;
      } else {
        n = t + 1;
        if (p + 2 * n > end) throw DbaFormatException('RLE literal cut off');
      }
      while (n-- > 0) {
        if (run != null) {
          px[at + col] = run;
        } else {
          px[at + col] = lut[data[p] | (data[p + 1] << 8)];
          p += 2;
        }
        if (++col == r.w) {
          col = 0;
          at += width;
          if (++row == r.h) break;
        }
      }
    }
    if (row < r.h || p != end) throw DbaFormatException('RLE data does not match its rectangle');
  }
}
