import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../buddy_theme.dart';
import '../protocol.dart';
import 'buddy_face.dart';

/// One animation as a little buddy: its still picture on a round screen,
/// framed in its theme's color, with its name under it. A badge says
/// whether it is on the buddy; the one playing is ringed.
class FaceTile extends StatelessWidget {
  const FaceTile({
    super.key,
    required this.name,
    required this.onTap,
    this.onLongPress,
    this.width = 78,
    this.onBuddy = true,
    this.playing = false,
  });

  final String name;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final double width;
  final bool onBuddy, playing;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final face = width - 10;
    final color = themeColor(themeOf(name));
    return SizedBox(
      width: width,
      child: Semantics(
        button: true,
        selected: playing,
        label: '${niceName(name)}${playing ? ', playing' : ''}${onBuddy ? '' : ', not on the buddy'}',
        hint: name == 'cycle' ? null : 'Previews; press and hold to play',
        excludeSemantics: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          onLongPress: onLongPress == null
              ? null
              : () {
                  HapticFeedback.mediumImpact();
                  onLongPress!();
                },
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: face,
                  height: face,
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: playing ? cs.primary : Colors.transparent, width: 3),
                        ),
                        padding: const EdgeInsets.all(2),
                        child: Opacity(
                          opacity: onBuddy ? 1 : 0.75,
                          child: BuddyFace(
                            size: face - 10,
                            animation: name,
                            emoji: emojiFor(name),
                            glow: color,
                            still: true,
                          ),
                        ),
                      ),
                      if (!onBuddy || playing)
                        Positioned(
                          right: -1,
                          bottom: -1,
                          child: Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              color: playing ? cs.primary : cs.surfaceContainerHighest,
                              shape: BoxShape.circle,
                              border: Border.all(color: cs.surface, width: 2),
                            ),
                            child: Icon(
                              playing ? Icons.play_arrow_rounded : Icons.download_rounded,
                              size: 13,
                              color: playing ? cs.onPrimary : cs.onSurfaceVariant,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  niceName(name),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontWeight: playing ? FontWeight.w700 : FontWeight.w500,
                    color: playing ? cs.primary : cs.onSurface,
                    height: 1.15,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
