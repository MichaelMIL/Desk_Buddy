import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../buddy_link.dart';
import '../buddy_theme.dart';
import '../protocol.dart';
import '../widgets/face_tile.dart';
import 'preview_sheet.dart';

enum _Where { all, onBuddy, notOnBuddy }

/// Every animation: the ones on the buddy and the ones only in the app's
/// library, grouped by theme. Tap one to preview it before it goes to the
/// buddy; press and hold to play it right away.
class GalleryTab extends StatefulWidget {
  const GalleryTab({super.key, required this.link});
  final BuddyLink link;

  @override
  State<GalleryTab> createState() => _GalleryTabState();
}

class _GalleryTabState extends State<GalleryTab> {
  _Where _where = _Where.all;
  String? _only; // a theme ('' = the plain faces), or null for all

  BuddyLink get link => widget.link;

  @override
  Widget build(BuildContext context) {
    final st = link.state;
    if (st == null) return const Center(child: CircularProgressIndicator());
    final cs = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final onBuddy = link.names.toSet();
    final everything = {...link.names, ...link.library.names}.where((n) => n != 'cycle').toList()..sort();
    final shown = everything.where(
      (n) => switch (_where) {
        _Where.all => true,
        _Where.onBuddy => onBuddy.contains(n),
        _Where.notOnBuddy => !onBuddy.contains(n),
      },
    );
    // plain faces first, then the buddy's theme, Claude, and the rest A to Z
    final groups = <String, List<String>>{};
    for (final n in shown) {
      groups.putIfAbsent(themeOf(n), () => []).add(n);
    }
    int rank(String t) => t.isEmpty ? 0 : (t == st.theme ? 1 : (t == 'claude' ? 2 : 3));
    final order = groups.keys.toList()..sort((a, b) => rank(a) != rank(b) ? rank(a) - rank(b) : a.compareTo(b));
    final visible = _only == null ? order : order.where((t) => t == _only).toList();
    final flat = [for (final t in visible) ...groups[t]!];
    final playing = st.cycling ? null : st.current;
    final allThemes = ({for (final n in everything) themeOf(n)}.toList()
      ..sort((a, b) => rank(a) != rank(b) ? rank(a) - rank(b) : a.compareTo(b)));

    return CustomScrollView(
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          sliver: SliverToBoxAdapter(
            child: SegmentedButton<_Where>(
              showSelectedIcon: false,
              segments: [
                ButtonSegment(value: _Where.all, label: Text('All ${everything.length}')),
                ButtonSegment(
                  value: _Where.onBuddy,
                  label: Text('On buddy ${onBuddy.where((n) => n != 'cycle').length}'),
                ),
                ButtonSegment(
                  value: _Where.notOnBuddy,
                  label: Text('In app ${everything.where((n) => !onBuddy.contains(n)).length}'),
                ),
              ],
              selected: {_where},
              onSelectionChanged: (s) => setState(() => _where = s.first),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: SizedBox(
            height: 56,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              children: [
                _ThemeChip(label: 'All themes', selected: _only == null, onTap: () => setState(() => _only = null)),
                for (final t in allThemes)
                  _ThemeChip(
                    emoji: t.isEmpty ? '🙂' : emojiFor(t),
                    label: themeLabel(t),
                    color: themeColor(t),
                    selected: _only == t,
                    onTap: () => setState(() => _only = _only == t ? null : t),
                  ),
              ],
            ),
          ),
        ),
        if (flat.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  _where == _Where.notOnBuddy ? 'Everything in the app is on the buddy.' : 'Nothing here.',
                  style: text.bodyLarge?.copyWith(color: cs.onSurfaceVariant),
                ),
              ),
            ),
          ),
        for (final t in visible) ...[
          SliverToBoxAdapter(
            child: _ThemeHeader(
              theme: t,
              count: groups[t]!.length,
              selected: t.isNotEmpty && st.theme == t,
              onUse: t.isEmpty || !link.isReady
                  ? null
                  : () {
                      HapticFeedback.selectionClick();
                      link.setTheme(st.theme == t ? '' : t);
                    },
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 96,
                mainAxisExtent: 120,
                crossAxisSpacing: 2,
              ),
              delegate: SliverChildBuilderDelegate(childCount: groups[t]!.length, (context, i) {
                final n = groups[t]![i];
                return LayoutBuilder(
                  builder: (context, box) => FaceTile(
                    name: n,
                    width: box.maxWidth,
                    onBuddy: onBuddy.contains(n),
                    playing: n == playing,
                    onTap: () => showPreview(context, link, flat, flat.indexOf(n)),
                    onLongPress: link.isReady ? () => link.play(n) : null,
                  ),
                );
              }),
            ),
          ),
        ],
        const SliverToBoxAdapter(child: SizedBox(height: 24)),
      ],
    );
  }
}

class _ThemeChip extends StatelessWidget {
  const _ThemeChip({required this.label, required this.selected, required this.onTap, this.emoji, this.color});
  final String label;
  final String? emoji;
  final Color? color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = color ?? Theme.of(context).colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: ChoiceChip(
        avatar: emoji == null ? null : Text(emoji!),
        label: Text(label),
        selected: selected,
        selectedColor: c.withValues(alpha: 0.3),
        side: BorderSide(color: c.withValues(alpha: selected ? 0.9 : 0.3)),
        onSelected: (_) => onTap(),
      ),
    );
  }
}

class _ThemeHeader extends StatelessWidget {
  const _ThemeHeader({required this.theme, required this.count, required this.selected, this.onUse});
  final String theme;
  final int count;
  final bool selected;
  final VoidCallback? onUse;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final color = themeColor(theme);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 8, 6),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color.withValues(alpha: 0.18),
              border: Border.all(color: color.withValues(alpha: 0.6), width: 1.5),
            ),
            child: Text(theme.isEmpty ? '🙂' : emojiFor(theme), style: const TextStyle(fontSize: 18)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(theme.isEmpty ? 'Faces' : '${themeLabel(theme)} theme', style: text.titleMedium),
                Text(
                  '$count${selected ? ' · the buddy\'s theme' : ''}',
                  style: text.bodySmall?.copyWith(color: cs.onSurfaceVariant),
                ),
              ],
            ),
          ),
          if (onUse != null)
            selected
                ? TextButton(onPressed: onUse, child: const Text('Stop using'))
                : FilledButton.tonal(
                    onPressed: onUse,
                    style: FilledButton.styleFrom(
                      backgroundColor: color.withValues(alpha: 0.2),
                      foregroundColor: cs.onSurface,
                      visualDensity: VisualDensity.compact,
                    ),
                    child: const Text('Use theme'),
                  ),
        ],
      ),
    );
  }
}
