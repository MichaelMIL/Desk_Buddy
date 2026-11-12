import 'dart:convert';

import 'package:desk_buddy/library.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// An asset bundle from a map of path -> bytes.
class MapBundle extends CachingAssetBundle {
  MapBundle(this.files);
  final Map<String, List<int>> files;

  @override
  Future<ByteData> load(String key) async {
    final f = files[key];
    if (f == null) throw StateError('no asset $key');
    return ByteData.sublistView(Uint8List.fromList(f));
  }
}

ByteData _manifest(List<String> paths) =>
    const StandardMessageCodec().encodeMessage({for (final p in paths) p: [{'asset': p}]})!;

void main() {
  final dbal = utf8.encode('DBAL....');

  test('reads the packed library from index.json', () async {
    final lib = await AnimationLibrary.fromAssets(MapBundle({
      'assets/library/index.json': utf8.encode(jsonEncode({
        'version': 1,
        'animations': [
          {'name': 'hacker__matrix', 'file': 'hacker__matrix.dbal', 'bytes': 8},
          {'name': 'face_wink', 'file': 'face_wink.dbal', 'bytes': 8},
        ],
      })),
      'assets/library/hacker__matrix.dbal': dbal,
      'assets/library/face_wink.dbal': dbal,
    }));
    expect(lib.names.toSet(), {'hacker__matrix', 'face_wink'});
    expect(lib.sizes['face_wink'], 8);
    expect(await lib.bytes('hacker__matrix'), dbal);
  });

  test('without index.json, finds the files through the asset manifest', () async {
    final bundle = MapBundle({
      'assets/library/builder__hammer.dbal': dbal,
      'assets/library/README.md': utf8.encode('not an animation'),
    });
    final m = _manifest(bundle.files.keys.toList());
    bundle.files['AssetManifest.bin'] = m.buffer.asUint8List(m.offsetInBytes, m.lengthInBytes);
    final lib = await AnimationLibrary.fromAssets(bundle);
    expect(lib.names.toList(), ['builder__hammer']);
    expect(await lib.bytes('builder__hammer'), dbal);
  });

  test('a build without any animations has an empty library', () async {
    final lib = await AnimationLibrary.fromAssets(MapBundle({}));
    expect(lib.names, isEmpty);
    expect(lib.has('face_happy'), isFalse);
  });
}
