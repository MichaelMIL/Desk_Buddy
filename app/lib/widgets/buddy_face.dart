import 'package:flutter/material.dart';

import '../previews.dart';
import 'animation_view.dart';

/// The buddy's round 1.28" screen in its bezel. It plays [animation] when
/// the library has it, as the buddy shows it; otherwise an emoji stands in.
/// Dimmed with the brightness, dark when the screen is off; [glow] (the
/// theme's color by default) lights up around it.
class BuddyFace extends StatelessWidget {
  const BuddyFace({
    super.key,
    required this.size,
    this.emoji = '🙂',
    this.caption,
    this.animation,
    this.playing = true,
    this.speed = 100,
    this.screenOn = true,
    this.brightness = 100,
    this.pulse = false,
    this.glow,
    this.still = false,
  });

  final double size;
  final String emoji;

  /// Under the emoji (not over an animation).
  final String? caption;
  final String? animation;
  final bool playing;
  final int speed;
  final bool screenOn;
  final int brightness;

  /// A breathing ring, for "connecting".
  final bool pulse;
  final Color? glow;

  /// The poster picture instead of a player (grids).
  final bool still;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final glowColor = glow ?? cs.primary;
    final dim = 0.35 + 0.65 * (brightness.clamp(10, 100) / 100);
    final bezel = size * 0.055;
    final stand = _EmojiScreen(key: ValueKey('$emoji|$caption'), emoji: emoji, caption: caption, size: size);
    final hasAnim = animation != null && PreviewScope.of(context).has(animation!);
    final Widget content = !screenOn
        ? Icon(Icons.power_settings_new_rounded, key: const ValueKey('off'), color: Colors.white24, size: size * 0.22)
        : hasAnim
        ? (still
              ? PosterView(key: ValueKey('p|$animation'), name: animation!, fallback: stand)
              : AnimationView(
                  key: ValueKey('a|$animation'),
                  name: animation!,
                  playing: playing,
                  speed: speed,
                  fallback: stand,
                ))
        : stand;
    final face = Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(bezel),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        // the body around the screen: dark plastic with a rim in the theme's color
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF3A3F47), Color(0xFF16181C)],
        ),
        border: Border.all(
          color: glowColor.withValues(alpha: screenOn ? 0.55 : 0.2),
          width: size < 80 ? 1.5 : 2,
        ),
        boxShadow: [
          if (screenOn && size >= 80)
            BoxShadow(
              color: glowColor.withValues(alpha: 0.28 * dim),
              blurRadius: size * 0.2,
              spreadRadius: size * 0.01,
            ),
        ],
      ),
      child: ClipOval(
        child: ColoredBox(
          color: const Color(0xFF050607),
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 250),
            opacity: screenOn ? dim : 1,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              child: SizedBox.expand(
                key: content.key,
                child: Center(child: content),
              ),
            ),
          ),
        ),
      ),
    );
    return pulse ? _Pulse(size: size, child: face) : face;
  }
}

class _EmojiScreen extends StatelessWidget {
  const _EmojiScreen({super.key, required this.emoji, required this.caption, required this.size});
  final String emoji;
  final String? caption;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(emoji, style: TextStyle(fontSize: size * 0.34, height: 1.1)),
        if (caption != null && size >= 80)
          Padding(
            padding: EdgeInsets.only(top: size * 0.03),
            child: SizedBox(
              width: size * 0.62,
              child: Text(
                caption!,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: Colors.white70, fontSize: size * 0.075, fontWeight: FontWeight.w500),
              ),
            ),
          ),
      ],
    );
  }
}

class _Pulse extends StatefulWidget {
  const _Pulse({required this.size, required this.child});
  final double size;
  final Widget child;

  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.primary;
    return AnimatedBuilder(
      animation: _c,
      child: widget.child,
      builder: (context, child) {
        final t = Curves.easeOut.transform(_c.value);
        return SizedBox(
          width: widget.size * 1.5,
          height: widget.size * 1.5,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: widget.size * (1 + 0.45 * t),
                height: widget.size * (1 + 0.45 * t),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: color.withValues(alpha: 0.5 * (1 - t)), width: 3),
                ),
              ),
              child!,
            ],
          ),
        );
      },
    );
  }
}
