import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../dba.dart';
import '../previews.dart';

/// Plays a library animation the way the buddy draws it (square; clip it to
/// the round screen). Shows [fallback] until it is decoded, or when the
/// library does not have it. Stops on its poster picture when [playing] is
/// off, when reduced motion is on, off screen (TickerMode) and in the
/// background.
class AnimationView extends StatefulWidget {
  const AnimationView({super.key, required this.name, this.playing = true, this.speed = 100, this.fallback});

  final String name;
  final bool playing;

  /// The buddy's playback speed, in percent.
  final int speed;
  final Widget? fallback;

  @override
  State<AnimationView> createState() => _AnimationViewState();
}

class _AnimationViewState extends State<AnimationView> with WidgetsBindingObserver {
  DbaCanvas? _canvas;
  ui.Image? _image;
  Timer? _timer;
  int _gen = 0, _due = 0;
  bool _started = false, _reduceMotion = false, _loading = false, _failed = false;
  ValueListenable<TickerModeData>? _tickerMode;
  String? _loaded;

  bool get _shouldPlay =>
      widget.playing &&
      !_reduceMotion &&
      (_tickerMode?.value.enabled ?? true) &&
      (WidgetsBinding.instance.lifecycleState ?? AppLifecycleState.resumed) == AppLifecycleState.resumed;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final tm = TickerMode.getValuesNotifier(context);
    if (tm != _tickerMode) {
      _tickerMode?.removeListener(_schedule);
      _tickerMode = tm..addListener(_schedule);
    }
    if (_loaded != widget.name) _load();
    _schedule();
  }

  @override
  void didUpdateWidget(AnimationView old) {
    super.didUpdateWidget(old);
    if (old.name != widget.name) {
      _load();
    } else if (old.playing != widget.playing || old.speed != widget.speed) {
      _schedule();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => _schedule();

  Future<void> _load() async {
    final name = _loaded = widget.name;
    _timer?.cancel();
    _canvas = null;
    _started = false;
    _loading = true;
    _failed = false;
    final anim = await PreviewScope.of(context).animation(name);
    if (!mounted || name != widget.name) return;
    _loading = false;
    if (anim == null) {
      setState(() {
        _failed = true;
        _image?.dispose();
        _image = null;
      });
      return;
    }
    final c = _canvas = DbaCanvas(anim);
    if (_shouldPlay) {
      _due = c.step();
      _started = true;
    } else {
      c.showPoster();
    }
    _show();
    _schedule();
  }

  void _schedule() {
    _timer?.cancel();
    if (!mounted || _canvas == null || _loading || !_shouldPlay) return;
    if (!_started) {
      // from the poster to playing: start at the beginning
      _due = _canvas!.step();
      _started = true;
      _show();
    }
    final ms = (_due * 100 / widget.speed.clamp(10, 1000)).round();
    _timer = Timer(Duration(milliseconds: ms < 16 ? 16 : ms), _tick);
  }

  void _tick() {
    if (!mounted || _canvas == null) return;
    _due = _canvas!.step();
    _show();
    _schedule();
  }

  void _show() {
    final c = _canvas!;
    final gen = ++_gen;
    ui.decodeImageFromPixels(Uint8List.fromList(c.rgba), c.anim.width, c.anim.height, ui.PixelFormat.rgba8888, (img) {
      if (!mounted || gen != _gen) {
        img.dispose();
        return;
      }
      setState(() {
        _image?.dispose();
        _image = img;
      });
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _tickerMode?.removeListener(_schedule);
    _timer?.cancel();
    _image?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final img = _image;
    if (img == null) return _failed ? (widget.fallback ?? const SizedBox.expand()) : const SizedBox.expand();
    return RawImage(
      image: img,
      fit: BoxFit.cover,
      filterQuality: FilterQuality.medium,
      width: double.infinity,
      height: double.infinity,
    );
  }
}

/// A library animation's still picture ([DbaCanvas.showPoster]), or [fallback].
class PosterView extends StatelessWidget {
  const PosterView({super.key, required this.name, this.fallback});
  final String name;
  final Widget? fallback;

  @override
  Widget build(BuildContext context) {
    final previews = PreviewScope.of(context);
    if (!previews.has(name)) return fallback ?? const SizedBox.expand();
    return FutureBuilder<ui.Image?>(
      future: previews.poster(name),
      builder: (context, snap) {
        final img = snap.data;
        final Widget child = img == null
            ? (snap.connectionState == ConnectionState.done
                  ? (fallback ?? const SizedBox.expand())
                  : const SizedBox.expand())
            : RawImage(
                key: const ValueKey('poster'),
                image: img,
                fit: BoxFit.cover,
                filterQuality: FilterQuality.medium,
                width: double.infinity,
                height: double.infinity,
              );
        return AnimatedSwitcher(duration: const Duration(milliseconds: 180), child: child);
      },
    );
  }
}
