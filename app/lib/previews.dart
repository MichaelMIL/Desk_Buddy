/// Animations from the library, decoded for previews: whole animations (to
/// play) and one still picture each (for the grids). Decoding runs on a
/// background isolate, so scrolling stays smooth.
library;

import 'dart:async';
import 'dart:collection';
import 'dart:isolate';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';

import 'dba.dart';
import 'library.dart';

class Previews {
  /// [library] is read on every lookup, so it can be loaded later. [inline]
  /// decodes on the calling isolate (tests).
  Previews(this._library, {this.inline = false});

  final AnimationLibrary Function() _library;
  final bool inline;

  static const _keepAnimations = 6;
  static const posterSize = 160;
  final _anims = <String, Future<DbaAnimation?>>{}; // insertion order: least recent first
  final _posters = <String, Future<ui.Image?>>{};
  final _waiting = Queue<Completer<void>>();
  int _busy = 0;

  bool has(String name) => _library().has(name);

  /// The decoded animation, or null when the library does not have it (or it
  /// does not decode). The last few stay decoded.
  Future<DbaAnimation?> animation(String name) {
    final hit = _anims.remove(name);
    if (hit != null) return _anims[name] = hit;
    if (!has(name)) return Future.value();
    final f = _run(name, _decodeOff, DbaAnimation.decode);
    _anims[name] = f;
    while (_anims.length > _keepAnimations) {
      _anims.remove(_anims.keys.first);
    }
    return f;
  }

  /// Its still picture ([DbaCanvas.showPoster]), [posterSize] pixels square, or null.
  Future<ui.Image?> poster(String name) {
    if (!has(name)) return Future.value();
    return _posters[name] ??= () async {
      final rgba = await _run(name, _posterOff, _posterRgba);
      if (rgba == null) return null;
      final done = Completer<ui.Image>();
      ui.decodeImageFromPixels(
        rgba.$1,
        rgba.$2,
        rgba.$3,
        ui.PixelFormat.rgba8888,
        done.complete,
        targetWidth: posterSize,
        targetHeight: posterSize,
      );
      return done.future;
    }();
  }

  /// Runs [off] on an isolate (or [here] inline) with the animation's bytes,
  /// two at a time; null when it is not in the library or fails.
  Future<T?> _run<T>(String name, Future<T> Function(Uint8List) off, T Function(Uint8List) here) async {
    if (_busy >= 2) {
      final turn = Completer<void>();
      _waiting.add(turn);
      await turn.future; // the finishing one hands over its slot
    } else {
      _busy++;
    }
    try {
      final bytes = await _library().bytes(name);
      final data = bytes is Uint8List ? bytes : Uint8List.fromList(bytes);
      return inline ? here(data) : await off(data);
    } catch (e) {
      debugPrint('preview of $name: $e');
      return null;
    } finally {
      if (_waiting.isNotEmpty) {
        _waiting.removeFirst().complete();
      } else {
        _busy--;
      }
    }
  }

  // static, so the isolate closures capture only the bytes
  static Future<DbaAnimation> _decodeOff(Uint8List b) => Isolate.run(() => DbaAnimation.decode(b));
  static Future<(Uint8List, int, int)> _posterOff(Uint8List b) => Isolate.run(() => _posterRgba(b));

  static (Uint8List, int, int) _posterRgba(Uint8List bytes) {
    final anim = DbaAnimation.decode(bytes);
    final c = DbaCanvas(anim)..showPoster();
    return (c.rgba, anim.width, anim.height);
  }
}

/// Makes [Previews] available below it (above the app's routes, so sheets
/// and pages find it too).
class PreviewScope extends InheritedWidget {
  const PreviewScope({super.key, required this.previews, required super.child});
  final Previews previews;

  static Previews of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<PreviewScope>()?.previews ?? _none;
  static final _none = Previews(() => AnimationLibrary.empty);

  @override
  bool updateShouldNotify(PreviewScope old) => old.previews != previews;
}
