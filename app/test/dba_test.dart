import 'dart:io';
import 'dart:typed_data';

import 'package:desk_buddy/dba.dart';
import 'package:flutter_test/flutter_test.dart';

int fnv(List<int> data, [int h = 0x811c9dc5]) {
  for (final b in data) {
    h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF;
  }
  return h;
}

/// A DBA1 file: one full red frame, then a 2x1 blue patch at (1, 1), shown in
/// two records (the first with delay 0, so they are one picture).
Uint8List tinyDba1() {
  final b = BytesBuilder();
  void u16(int v) => b.add([v & 0xFF, v >> 8]);
  void u32(int v) => b.add([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, v >> 24]);
  void frame(int x, int y, int w, int h, int delay, List<int> rle) {
    u16(x);
    u16(y);
    u16(w);
    u16(h);
    u16(delay);
    u16(0);
    u32(rle.length);
    b.add(rle);
  }

  b.add('DBA1'.codeUnits);
  u16(4);
  u16(4);
  u16(3);
  u16(1);
  u32(0);
  frame(0, 0, 4, 4, 100, [0x80 | 15, 0x00, 0xF8]); // 16 x red (0xF800)
  frame(1, 1, 1, 1, 0, [0x00, 0x1F, 0x00]); // a literal blue (0x001F)
  frame(2, 1, 1, 1, 50, [0x80, 0x1F, 0x00]); // a run of one blue
  return b.toBytes();
}

void main() {
  // checksums from sim/tools/dba.py (decompress, decode, rgb_from_565)
  final fixtures = {
    'battery_critical': (unpacked: 17966, raw: 0xed6029bc, pictures: 64, rgba: 0xff05de49, duration: 3200),
    'face_wink': (unpacked: 24295, raw: 0xab993a34, pictures: 72, rgba: 0x7aaf7a72, duration: 2376),
  };

  for (final MapEntry(key: name, value: want) in fixtures.entries) {
    test('$name decodes like the Python decoder', () {
      final packed = File('test/fixtures/$name.dbal').readAsBytesSync();
      final raw = unpackDba(packed);
      expect(raw.length, want.unpacked);
      expect(fnv(raw), want.raw);
      final anim = DbaAnimation.parse(raw);
      expect((anim.width, anim.height, anim.loop), (240, 240, true));
      expect(anim.frameCount, want.pictures);
      expect(anim.durationMs, want.duration);
      final canvas = DbaCanvas(anim);
      var h = 0x811c9dc5, total = 0;
      for (var i = 0; i < want.pictures; i++) {
        total += canvas.step();
        h = fnv(canvas.rgba, h);
      }
      expect(total, want.duration);
      expect(h, want.rgba);
    });
  }

  test('pictures merge records with delay 0; it loops; the fullest picture is the poster', () {
    final anim = DbaAnimation.parse(tinyDba1());
    expect((anim.frameCount, anim.durationMs, anim.records.length), (2, 150, 3));
    final c = DbaCanvas(anim);
    int px(int x, int y) => ByteData.sublistView(c.rgba).getUint32((y * 4 + x) * 4, Endian.little);
    const red = 0xFF0000FF, blue = 0xFFFF0000; // A B G R as a little-endian word
    expect(c.step(), 100);
    expect((px(1, 1), px(2, 1)), (red, red));
    expect(c.step(), 50); // both blue records at once
    expect((px(0, 0), px(1, 1), px(2, 1)), (red, blue, blue));
    expect(c.step(), 100); // starts over with the full frame
    expect(px(1, 1), red);
    expect(c.showPoster(), 0); // both all lit, both as near the middle: the first
    c.seek(1);
    expect((px(1, 1), px(2, 1)), (blue, blue));
    c.seek(0);
    expect(px(2, 1), red);
  });

  test('the poster is a typical picture: not a blink to black, not a flash', () {
    final anim = DbaAnimation.decode(File('test/fixtures/battery_critical.dbal').readAsBytesSync());
    int lit(Uint8List rgba) {
      var n = 0;
      for (var i = 0; i < rgba.length; i += 4) {
        if (rgba[i] > 40 || rgba[i + 1] > 40 || rgba[i + 2] > 40) n++;
      }
      return n;
    }

    final c = DbaCanvas(anim);
    final all = [for (var i = 0; i < anim.frameCount; i++) lit((c..step()).rgba)]; // one buffer: count as it goes
    final darkest = all.reduce((a, b) => a < b ? a : b), fullest = all.reduce((a, b) => a > b ? a : b);
    expect(darkest, lessThan(fullest ~/ 4)); // it goes dark
    expect(all.where((l) => l == fullest).length, 1); // and flashes once
    // the face with its battery shows most of the time: that is the still
    final counts = <int, int>{};
    for (final l in all) {
      counts[l] = (counts[l] ?? 0) + 1;
    }
    final usual = counts.entries.reduce((a, b) => a.value >= b.value ? a : b).key;
    c.showPoster();
    expect(lit(c.rgba), usual);
  });

  test('bad files are refused, not crashed on', () {
    expect(unpackDba(tinyDba1()), tinyDba1()); // raw DBA1 passes through
    expect(() => DbaAnimation.parse(Uint8List.fromList('nope'.codeUnits)), throwsA(isA<DbaFormatException>()));
    final cut = tinyDba1().sublist(0, 40);
    expect(() => DbaAnimation.parse(cut), throwsA(isA<DbaFormatException>()));
    final packed = File('test/fixtures/face_wink.dbal').readAsBytesSync();
    expect(() => unpackDba(packed.sublist(0, packed.length ~/ 2)), throwsA(isA<DbaFormatException>()));
    final garbled = Uint8List.fromList(packed)..[400] ^= 0x55;
    expect(() {
      final anim = DbaAnimation.decode(garbled);
      final c = DbaCanvas(anim);
      for (var i = 0; i < anim.records.length; i++) {
        c.step();
      }
    }, throwsA(isA<DbaFormatException>()));
  });

  test('every animation in assets/library decodes and plays', () {
    final dir = Directory('assets/library');
    final files = dir.existsSync()
        ? dir.listSync().whereType<File>().where((f) => f.path.endsWith('.dbal')).toList()
        : <File>[];
    if (files.isEmpty) {
      markTestSkipped('no assets/library (sim/test/library.sh --app)');
      return;
    }
    final sw = Stopwatch()..start();
    for (final f in files) {
      final anim = DbaAnimation.decode(f.readAsBytesSync());
      final c = DbaCanvas(anim);
      for (var i = 0; i < anim.frameCount; i++) {
        c.step();
      }
    }
    // ignore: avoid_print
    print('${files.length} animations decoded and played in ${sw.elapsedMilliseconds} ms');
  });
}
