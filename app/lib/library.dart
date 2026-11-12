/// The animations the app can put back on the buddy after they were deleted
/// from it, and when each one last played (a full buddy deletes the least
/// recently played first). The library is bundled from
/// `sim/test/library.sh --app` into assets/library/.
library;

import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AnimationLibrary {
  AnimationLibrary(Map<String, int> sizes, this._load) : sizes = Map.unmodifiable(sizes);

  /// Animation name -> bytes.
  final Map<String, int> sizes;
  final Future<List<int>> Function(String name) _load;

  static final empty = AnimationLibrary(const {}, (n) async => throw StateError('$n is not in the library'));

  Iterable<String> get names => sizes.keys;
  bool has(String name) => sizes.containsKey(name);
  Future<List<int>> bytes(String name) => _load(name);

  /// Whatever animations this build packed into assets/library (every build
  /// does, see tool/sync_library.sh): from index.json, or, without it, from
  /// the asset manifest. Empty when there are none.
  static Future<AnimationLibrary> fromAssets([AssetBundle? bundle]) async {
    final b = bundle ?? rootBundle;
    final files = <String, String>{}, sizes = <String, int>{};
    try {
      final index = jsonDecode(await b.loadString('assets/library/index.json')) as Map<String, dynamic>;
      for (final a in (index['animations'] as List).cast<Map<String, dynamic>>()) {
        files[a['name'] as String] = a['file'] as String;
        sizes[a['name'] as String] = (a['bytes'] as num).toInt();
      }
    } catch (_) {
      try {
        final manifest = await AssetManifest.loadFromAssetBundle(b);
        for (final path in manifest.listAssets()) {
          final m = _file.firstMatch(path);
          if (m != null) {
            files[m.group(1)!] = path.substring('assets/library/'.length);
            sizes[m.group(1)!] = 0; // unknown until loaded
          }
        }
      } catch (_) {}
    }
    if (files.isEmpty) return empty;
    return AnimationLibrary(sizes, (n) async {
      final data = await b.load('assets/library/${files[n]}');
      return data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
    });
  }

  static final _file = RegExp(r'^assets/library/([a-z0-9_]{1,31})\.(dbal|dbaz|dba)$');
}

/// When each animation last played from this phone (or was seen playing).
class PlayLog {
  PlayLog([Map<String, int>? at]) : _at = at ?? {};

  final Map<String, int> _at;
  SharedPreferences? _prefs;
  static const _key = 'plays';

  static Future<PlayLog> load() async {
    final p = await SharedPreferences.getInstance();
    final log = PlayLog();
    try {
      final m = jsonDecode(p.getString(_key) ?? '{}') as Map<String, dynamic>;
      m.forEach((k, v) => log._at[k] = (v as num).toInt());
    } catch (_) {}
    log._prefs = p;
    return log;
  }

  int lastPlayed(String name) => _at[name] ?? 0;

  void touch(String name, [DateTime? now]) {
    if (name.isEmpty || name == 'cycle') return;
    _at[name] = (now ?? DateTime.now()).millisecondsSinceEpoch;
    _prefs?.setString(_key, jsonEncode(_at));
  }
}
