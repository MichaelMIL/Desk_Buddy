import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../buddy_link.dart';
import '../buddy_theme.dart';
import '../dba.dart';
import '../previews.dart';
import '../protocol.dart';
import '../widgets/buddy_face.dart';

/// Previews names[index] before it goes to the buddy: it plays here as the
/// buddy would show it; then play it there (uploading it first when the
/// buddy no longer has it) or delete it. Swipe sideways for the rest of
/// [names].
Future<void> showPreview(BuildContext context, BuddyLink link, List<String> names, int index) {
  HapticFeedback.selectionClick();
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => PreviewSheet(link: link, names: names, initial: index),
  );
}

class PreviewSheet extends StatefulWidget {
  const PreviewSheet({super.key, required this.link, required this.names, required this.initial});
  final BuddyLink link;
  final List<String> names;
  final int initial;

  @override
  State<PreviewSheet> createState() => _PreviewSheetState();
}

class _PreviewSheetState extends State<PreviewSheet> {
  late final _pages = PageController(initialPage: widget.initial);
  late int _page = widget.initial;
  bool _paused = false;

  BuddyLink get link => widget.link;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _go(int delta) {
    final to = (_page + delta).clamp(0, widget.names.length - 1);
    _pages.animateToPage(to, duration: const Duration(milliseconds: 260), curve: Curves.easeOutCubic);
  }

  @override
  Widget build(BuildContext context) {
    final size = (MediaQuery.sizeOf(context).width * 0.62).clamp(160.0, 260.0);
    final text = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final many = widget.names.length > 1;
    return ListenableBuilder(
      listenable: link,
      builder: (context, _) {
        final name = widget.names[_page];
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: size + 24,
                child: PageView.builder(
                  controller: _pages,
                  itemCount: widget.names.length,
                  onPageChanged: (i) => setState(() {
                    _page = i;
                    _paused = false;
                    HapticFeedback.selectionClick();
                  }),
                  itemBuilder: (context, i) {
                    final n = widget.names[i];
                    return Center(
                      child: Semantics(
                        label: 'Preview of ${niceName(n)}',
                        button: true,
                        hint: _paused ? 'Plays' : 'Pauses',
                        child: GestureDetector(
                          onTap: () => setState(() => _paused = !_paused),
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              BuddyFace(
                                size: size,
                                animation: n,
                                emoji: emojiFor(n),
                                caption: niceName(n),
                                playing: i == _page && !_paused,
                                speed: link.settings.speed ?? 100,
                                glow: themeColor(themeOf(n)),
                              ),
                              if (i == _page && _paused)
                                const IgnorePointer(
                                  child: CircleAvatar(
                                    radius: 26,
                                    backgroundColor: Colors.black54,
                                    child: Icon(Icons.play_arrow_rounded, color: Colors.white, size: 32),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              if (many)
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      tooltip: 'Previous',
                      onPressed: _page > 0 ? () => _go(-1) : null,
                      icon: const Icon(Icons.chevron_left_rounded),
                    ),
                    Text(
                      '${_page + 1} of ${widget.names.length}',
                      style: text.labelMedium?.copyWith(color: cs.onSurfaceVariant),
                    ),
                    IconButton(
                      tooltip: 'Next',
                      onPressed: _page < widget.names.length - 1 ? () => _go(1) : null,
                      icon: const Icon(Icons.chevron_right_rounded),
                    ),
                  ],
                ),
              const SizedBox(height: 4),
              _Details(key: ValueKey(name), link: link, name: name),
            ],
          ),
        );
      },
    );
  }
}

class _Details extends StatelessWidget {
  const _Details({super.key, required this.link, required this.name});
  final BuddyLink link;
  final String name;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final previews = PreviewScope.of(context);
    final theme = themeOf(name);
    final onBuddy = link.names.contains(name);
    final inLibrary = link.library.has(name);
    final st = link.state;
    final playingNow = st != null && !st.cycling && st.current == name;
    final bytes = link.library.sizes[name] ?? 0;
    final kb = (bytes + 1023) ~/ 1024;
    final dim = text.bodyMedium?.copyWith(color: cs.onSurfaceVariant);
    final color = themeColor(theme);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          niceName(name),
          textAlign: TextAlign.center,
          style: text.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 10),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 6,
          runSpacing: 6,
          children: [
            _Pill(
              icon: Text(theme.isEmpty ? '🙂' : emojiFor(theme)),
              label: theme.isEmpty ? 'Faces' : '${themeLabel(theme)} theme',
              color: color,
            ),
            if (playingNow)
              _Pill(icon: const Icon(Icons.play_arrow_rounded, size: 16), label: 'Playing now', color: cs.primary)
            else if (onBuddy)
              _Pill(icon: const Icon(Icons.check_circle_rounded, size: 16), label: 'On your buddy', color: Colors.green)
            else
              _Pill(icon: const Icon(Icons.download_rounded, size: 16), label: 'Not on the buddy', color: cs.tertiary),
            if (inLibrary)
              FutureBuilder<DbaAnimation?>(
                future: previews.animation(name),
                builder: (context, snap) {
                  final a = snap.data;
                  if (a == null) return const SizedBox.shrink();
                  return _Pill(
                    icon: const Icon(Icons.timer_outlined, size: 16),
                    label: '${(a.durationMs / 1000).toStringAsFixed(1)} s · ${a.frameCount} frames',
                    color: cs.onSurfaceVariant,
                  );
                },
              ),
            if (inLibrary)
              _Pill(icon: const Icon(Icons.sd_storage_outlined, size: 16), label: '$kb KB', color: cs.onSurfaceVariant),
          ],
        ),
        const SizedBox(height: 14),
        if (!inLibrary)
          Text(
            'No preview: it is on the buddy, but not in this app\'s library (it was put there after this '
            'app was built).',
            textAlign: TextAlign.center,
            style: dim,
          )
        else if (!onBuddy)
          Text(
            'Sending it uploads $kb KB over Bluetooth, about ${(bytes / 2200).ceil()} s. When the buddy is '
            'full, the app makes room by removing the least recently played animations it can put back.',
            textAlign: TextAlign.center,
            style: dim,
          ),
        const SizedBox(height: 16),
        _PlayButton(link: link, name: name, onBuddy: onBuddy, inLibrary: inLibrary, playingNow: playingNow),
        const SizedBox(height: 4),
        Wrap(
          alignment: WrapAlignment.center,
          children: [
            if (theme.isNotEmpty && st != null && st.theme != theme)
              TextButton.icon(
                onPressed: link.isReady ? () => link.setTheme(theme) : null,
                icon: Text(emojiFor(theme)),
                label: Text('Use the ${themeLabel(theme)} theme'),
              ),
            if (onBuddy)
              TextButton.icon(
                style: TextButton.styleFrom(foregroundColor: cs.error),
                onPressed: link.isReady
                    ? () async {
                        // done with it: back to the faces
                        if (await confirmDelete(context, link, name) && context.mounted) Navigator.pop(context);
                      }
                    : null,
                icon: const Icon(Icons.delete_outline_rounded),
                label: const Text('Delete from the buddy'),
              ),
          ],
        ),
      ],
    );
  }
}

class _PlayButton extends StatelessWidget {
  const _PlayButton({
    required this.link,
    required this.name,
    required this.onBuddy,
    required this.inLibrary,
    required this.playingNow,
  });
  final BuddyLink link;
  final String name;
  final bool onBuddy, inLibrary, playingNow;

  @override
  Widget build(BuildContext context) {
    final up = link.uploading;
    if (up == name) {
      return Column(
        children: [
          FilledButton.icon(
            onPressed: null,
            icon: const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
            label: Text('Sending to the buddy… ${(link.uploadProgress * 100).round()}%'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          ),
          const SizedBox(height: 8),
          LinearProgressIndicator(value: link.uploadProgress > 0 ? link.uploadProgress : null),
        ],
      );
    }
    final canSend = onBuddy || inLibrary;
    final label = !canSend
        ? 'Not available'
        : up != null
        ? 'Another upload is running'
        : playingNow
        ? 'Play again'
        : onBuddy
        ? 'Play on the buddy'
        : 'Send to the buddy and play';
    return FilledButton.icon(
      onPressed: canSend && up == null && link.isReady
          ? () {
              HapticFeedback.mediumImpact();
              link.play(name);
            }
          : null,
      icon: Icon(onBuddy ? Icons.play_arrow_rounded : Icons.send_rounded),
      label: Text(label),
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        textStyle: Theme.of(context).textTheme.titleMedium,
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.label, required this.color});
  final Widget icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 4, 10, 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconTheme.merge(
            data: IconThemeData(color: color),
            child: icon,
          ),
          const SizedBox(width: 5),
          Text(label, style: Theme.of(context).textTheme.labelMedium),
        ],
      ),
    );
  }
}

/// Asks, then deletes [name] from the buddy. Returns whether it did.
Future<bool> confirmDelete(BuildContext context, BuddyLink link, String name) async {
  final back = link.library.has(name)
      ? 'The app can put it back: it sends it again when you play it.'
      : 'Built-in animations stay. Push it again from the simulator to get it back.';
  final ok = await showDialog<bool>(
    context: context,
    builder: (d) => AlertDialog(
      title: Text('Delete "${niceName(name)}"?'),
      content: Text('It is removed from the buddy\'s storage. $back'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Delete')),
      ],
    ),
  );
  if (!(ok ?? false)) return false;
  await link.deleteAnimation(name);
  return true;
}
