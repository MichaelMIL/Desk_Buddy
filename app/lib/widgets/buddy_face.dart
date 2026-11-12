import 'package:flutter/material.dart';

/// The buddy's round 1.28" screen, drawn as a dial: an emoji for the playing
/// face, dimmed with the brightness, dark when the screen is off.
class BuddyFace extends StatelessWidget {
  const BuddyFace({
    super.key,
    required this.size,
    this.emoji = '🙂',
    this.caption,
    this.screenOn = true,
    this.brightness = 100,
    this.pulse = false,
  });

  final double size;
  final String emoji;
  final String? caption;
  final bool screenOn;
  final int brightness;

  /// A breathing ring, for "connecting".
  final bool pulse;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final dim = 0.35 + 0.65 * (brightness.clamp(10, 100) / 100);
    final face = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF050607),
        border: Border.all(color: const Color(0xFF2B2F36), width: size * 0.045),
        boxShadow: [
          if (screenOn)
            BoxShadow(
              color: cs.primary.withValues(alpha: 0.22 * dim),
              blurRadius: size * 0.18,
              spreadRadius: size * 0.01,
            ),
        ],
      ),
      alignment: Alignment.center,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 250),
        opacity: screenOn ? dim : 1,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          transitionBuilder: (child, a) => ScaleTransition(
            scale: Tween(begin: 0.7, end: 1.0).animate(a),
            child: FadeTransition(opacity: a, child: child),
          ),
          child: screenOn
              ? Column(
                  key: ValueKey('$emoji|$caption'),
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(emoji, style: TextStyle(fontSize: size * 0.36, height: 1.1)),
                    if (caption != null)
                      Padding(
                        padding: EdgeInsets.only(top: size * 0.03),
                        child: SizedBox(
                          width: size * 0.62,
                          child: Text(
                            caption!,
                            textAlign: TextAlign.center,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: size * 0.075,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ),
                  ],
                )
              : Icon(
                  Icons.power_settings_new_rounded,
                  key: const ValueKey('off'),
                  color: Colors.white24,
                  size: size * 0.22,
                ),
        ),
      ),
    );
    return pulse ? _Pulse(size: size, child: face) : face;
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
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))
    ..repeat();

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
          child: Stack(alignment: Alignment.center, children: [
            Container(
              width: widget.size * (1 + 0.45 * t),
              height: widget.size * (1 + 0.45 * t),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: color.withValues(alpha: 0.5 * (1 - t)), width: 3),
              ),
            ),
            child!,
          ]),
        );
      },
    );
  }
}
