import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../buddy_link.dart';
import '../protocol.dart';
import '../widgets/battery_indicator.dart';
import '../widgets/buddy_face.dart';
import 'settings_screen.dart';

/// Connected: the remote (faces, screen, brightness, theme, playback) and a
/// console for any command.
class ControlScreen extends StatefulWidget {
  const ControlScreen({super.key, required this.link, required this.onForget});

  final BuddyLink link;
  final VoidCallback onForget;

  @override
  State<ControlScreen> createState() => _ControlScreenState();
}

class _ControlScreenState extends State<ControlScreen> {
  int _tab = 0;

  BuddyLink get link => widget.link;

  String _subtitle() {
    if (link.phase == LinkPhase.lost) return link.reconnecting ? 'Reconnecting…' : 'Disconnected';
    final st = link.state;
    if (st == null) return '';
    final what = st.cycling ? 'Cycling' : niceName(st.current);
    return '$what · ${st.count} animations';
  }

  void _showStatus() {
    link.refreshStatus();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => _StatusSheet(link: link),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(link.deviceName),
            Text(
              _subtitle(),
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
          ],
        ),
        actions: [
          BatteryIndicator(
            percent: link.state?.battery,
            low: link.state?.batteryLow ?? false,
            charging: link.state?.charging ?? false,
            charged: link.state?.charged ?? false,
          ),
          IconButton(
            tooltip: 'Device status',
            icon: const Icon(Icons.info_outline_rounded),
            onPressed: link.isReady ? _showStatus : null,
          ),
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'settings') {
                Navigator.push(context, MaterialPageRoute<void>(builder: (_) => SettingsScreen(link: link)));
              }
              if (v == 'disconnect') link.disconnect();
              if (v == 'forget') widget.onForget();
            },
            itemBuilder: (context) => [
              PopupMenuItem(value: 'settings', enabled: link.isReady, child: const Text('Buddy settings')),
              const PopupMenuItem(value: 'disconnect', child: Text('Disconnect')),
              const PopupMenuItem(value: 'forget', child: Text('Forget this buddy')),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          if (link.phase == LinkPhase.lost) _LostBanner(link: link),
          Expanded(
            child: IndexedStack(
              index: _tab,
              children: [
                _RemoteTab(link: link),
                _ConsoleTab(link: link),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.tune_rounded), label: 'Remote'),
          NavigationDestination(icon: Icon(Icons.terminal_rounded), label: 'Console'),
        ],
      ),
    );
  }
}

class _LostBanner extends StatelessWidget {
  const _LostBanner({required this.link});
  final BuddyLink link;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: cs.errorContainer,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
        child: Row(
          children: [
            Icon(Icons.link_off_rounded, color: cs.onErrorContainer),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                link.reconnecting
                    ? (link.restarting ? 'The buddy is restarting. Reconnecting…' : 'Connection lost. Reconnecting…')
                    : 'Disconnected${link.error != null ? ': ${link.error}' : ''}',
                style: TextStyle(color: cs.onErrorContainer),
              ),
            ),
            if (link.reconnecting)
              const Padding(
                padding: EdgeInsets.all(12),
                child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
              )
            else
              TextButton(
                onPressed: () => link.connect(link.deviceId!, name: link.deviceName),
                child: const Text('Reconnect'),
              ),
          ],
        ),
      ),
    );
  }
}

// ---- remote -----------------------------------------------------------------

class _RemoteTab extends StatelessWidget {
  const _RemoteTab({required this.link});
  final BuddyLink link;

  @override
  Widget build(BuildContext context) {
    final st = link.state;
    if (st == null) return const Center(child: CircularProgressIndicator());
    // the faces on the buddy plus the library's others (uploaded when played)
    final onBuddy = link.names.toSet();
    final all = {...link.names, ...link.library.names}.toList()..sort();
    final faces = facesFor(all, st.theme);
    final themes = themesIn(all);
    final ready = link.isReady;
    return AbsorbPointer(
      absorbing: !ready,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 200),
        opacity: ready ? 1 : 0.45,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            if (link.uploading != null) _UploadBanner(link: link),
            _NowPlaying(link: link, st: st),
            const SizedBox(height: 12),
            _BrightnessCard(link: link, value: st.brightness),
            const _Section('Faces'),
            if (link.names.isEmpty && st.count > 0)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              )
            else
              _FaceWrap(
                names: ['cycle', ...faces.common],
                st: st,
                onBuddy: onBuddy,
                onTap: (n) => n == 'cycle' ? link.cycle() : link.play(n),
                onLongPress: (n) => _faceActions(context, link, n, onBuddy.contains(n)),
              ),
            if (faces.themed.isNotEmpty) ...[
              _Section('${_cap(st.theme)} theme'),
              _FaceWrap(
                names: faces.themed,
                st: st,
                onBuddy: onBuddy,
                onTap: link.play,
                onLongPress: (n) => _faceActions(context, link, n, onBuddy.contains(n)),
              ),
            ],
            if (themes.isNotEmpty) ...[
              const _Section('Theme'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final t in ['', ...themes])
                    ChoiceChip(
                      avatar: t.isEmpty ? null : Text(emojiFor(t)),
                      label: Text(t.isEmpty ? 'None' : _cap(t)),
                      selected: st.theme == t,
                      onSelected: (_) {
                        HapticFeedback.selectionClick();
                        link.setTheme(t);
                      },
                    ),
                ],
              ),
            ],
            const _Section('Playback'),
            _PlaybackCard(link: link, faces: [...faces.common, ...faces.themed].where(onBuddy.contains).toList()),
            if (link.alerts case final alerts?) ...[
              const _Section('Battery and charging'),
              _AlertsCard(link: link, alerts: alerts),
            ],
          ],
        ),
      ),
    );
  }
}

/// A library upload under way: which animation, and how far.
class _UploadBanner extends StatelessWidget {
  const _UploadBanner({required this.link});
  final BuddyLink link;

  @override
  Widget build(BuildContext context) {
    final name = link.uploading!;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.download_rounded, size: 18),
                  const SizedBox(width: 8),
                  Expanded(child: Text('Uploading ${niceName(name)} to the buddy…')),
                  Text('${(link.uploadProgress * 100).round()}%'),
                ],
              ),
              const SizedBox(height: 8),
              LinearProgressIndicator(value: link.uploadProgress > 0 ? link.uploadProgress : null),
            ],
          ),
        ),
      ),
    );
  }
}

/// Long press on a face: play it, or delete it from the buddy. One that is
/// only in the library can only be played (it is uploaded first).
void _faceActions(BuildContext context, BuddyLink link, String name, bool onBuddy) {
  if (name == 'cycle') return;
  HapticFeedback.mediumImpact();
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: Text(emojiFor(name), style: const TextStyle(fontSize: 28)),
            title: Text(niceName(name)),
            subtitle: Text(onBuddy ? name : '$name · not on the buddy, uploads when played'),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.play_arrow_rounded),
            title: const Text('Play'),
            onTap: () {
              Navigator.pop(sheet);
              link.play(name);
            },
          ),
          if (onBuddy)
            ListTile(
              leading: Icon(Icons.delete_outline_rounded, color: Theme.of(sheet).colorScheme.error),
              title: const Text('Delete from the buddy'),
              onTap: () async {
                Navigator.pop(sheet);
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (d) => AlertDialog(
                    title: Text('Delete "${niceName(name)}"?'),
                    content: const Text(
                      'It is removed from the buddy\'s storage. Built-in animations stay. '
                      'Push it again from the simulator to get it back.',
                    ),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Cancel')),
                      FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Delete')),
                    ],
                  ),
                );
                if (ok ?? false) link.deleteAnimation(name);
              },
            ),
        ],
      ),
    ),
  );
}

/// `xmas` → `Xmas`; short names are initials: `dj` → `DJ`.
String _cap(String s) => s.length <= 2 ? s.toUpperCase() : s[0].toUpperCase() + s.substring(1);

class _Section extends StatelessWidget {
  const _Section(this.title);
  final String title;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 22, 4, 10),
    child: Text(
      title.toUpperCase(),
      style: Theme.of(
        context,
      ).textTheme.labelMedium?.copyWith(letterSpacing: 1.1, color: Theme.of(context).colorScheme.onSurfaceVariant),
    ),
  );
}

class _NowPlaying extends StatelessWidget {
  const _NowPlaying({required this.link, required this.st});
  final BuddyLink link;
  final BuddyState st;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 22, 16, 16),
        child: Column(
          children: [
            GestureDetector(
              onTap: () => link.setScreen(!st.screen),
              child: BuddyFace(
                size: 172,
                emoji: emojiFor(st.cycling ? 'cycle' : st.current),
                caption: st.cycling ? 'cycling' : niceName(st.current),
                screenOn: st.screen,
                brightness: st.brightness,
              ),
            ),
            const SizedBox(height: 18),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _Action(icon: Icons.repeat_rounded, label: 'Cycle', selected: st.cycling, onTap: link.cycle),
                _Action(icon: Icons.skip_next_rounded, label: 'Next', onTap: link.next),
                _Action(
                  icon: st.screen ? Icons.lightbulb_rounded : Icons.lightbulb_outline_rounded,
                  label: st.screen ? 'Screen on' : 'Screen off',
                  selected: st.screen,
                  onTap: () => link.setScreen(!st.screen),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({required this.icon, required this.label, required this.onTap, this.selected = false});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    // icon and label are one tap target
    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Column(
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: 58,
                height: 58,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: selected ? cs.primary : cs.surfaceContainerHighest,
                ),
                child: Icon(icon, size: 26, color: selected ? cs.onPrimary : cs.onSurface),
              ),
              const SizedBox(height: 6),
              Text(label, style: Theme.of(context).textTheme.labelMedium),
            ],
          ),
        ),
      ),
    );
  }
}

class _FaceWrap extends StatelessWidget {
  const _FaceWrap({required this.names, required this.st, required this.onTap, this.onLongPress, this.onBuddy});
  final List<String> names;
  final BuddyState st;

  /// Names stored on the buddy; the others are only in the library.
  final Set<String>? onBuddy;
  final void Function(String name) onTap;
  final void Function(String name)? onLongPress;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final n in names)
          Builder(
            builder: (context) {
              final on = n == 'cycle' ? st.cycling : (!st.cycling && n == st.current);
              final stored = n == 'cycle' || onBuddy == null || onBuddy!.contains(n);
              return Material(
                color: on ? cs.primary : cs.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () {
                    HapticFeedback.selectionClick();
                    onTap(n);
                  },
                  onLongPress: onLongPress == null ? null : () => onLongPress!(n),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 10, 14, 10),
                    child: Opacity(
                      opacity: stored ? 1 : 0.55,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(emojiFor(n), style: const TextStyle(fontSize: 18)),
                          const SizedBox(width: 8),
                          Text(
                            niceName(n),
                            style: TextStyle(
                              color: on ? cs.onPrimary : cs.onSurface,
                              fontWeight: on ? FontWeight.w600 : FontWeight.w400,
                            ),
                          ),
                          if (!stored) ...[
                            const SizedBox(width: 6),
                            Icon(
                              Icons.download_rounded,
                              size: 15,
                              color: cs.onSurfaceVariant,
                              semanticLabel: 'not on the buddy, uploads when played',
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
      ],
    );
  }
}

/// Sends a value once the finger rests for a moment and when it lets go;
/// every setting is saved to the buddy's flash, so not on every pixel.
class _Debounced {
  Timer? _t;
  void call(VoidCallback f, [Duration d = const Duration(milliseconds: 200)]) {
    _t?.cancel();
    _t = Timer(d, f);
  }

  void now(VoidCallback f) {
    _t?.cancel();
    f();
  }

  void cancel() => _t?.cancel();
}

class _BrightnessCard extends StatefulWidget {
  const _BrightnessCard({required this.link, required this.value});
  final BuddyLink link;
  final int value;

  @override
  State<_BrightnessCard> createState() => _BrightnessCardState();
}

class _BrightnessCardState extends State<_BrightnessCard> {
  double? _drag;
  final _send = _Debounced();

  @override
  void dispose() {
    _send.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final v = (_drag ?? widget.value.toDouble()).clamp(10.0, 100.0);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
        child: Row(
          children: [
            const Icon(Icons.brightness_6_rounded),
            Expanded(
              child: Slider(
                value: v,
                min: brightnessRange.min.toDouble(),
                max: brightnessRange.max.toDouble(),
                divisions: 18,
                label: '${v.round()}%',
                onChanged: (x) {
                  setState(() => _drag = x);
                  _send(() => widget.link.setBrightness(x.round()));
                },
                onChangeEnd: (x) {
                  _send.now(() => widget.link.setBrightness(x.round()));
                  setState(() => _drag = null);
                },
              ),
            ),
            SizedBox(width: 44, child: Text('${v.round()}%', textAlign: TextAlign.end)),
          ],
        ),
      ),
    );
  }
}

class _PlaybackCard extends StatefulWidget {
  const _PlaybackCard({required this.link, required this.faces});
  final BuddyLink link;
  final List<String> faces;

  @override
  State<_PlaybackCard> createState() => _PlaybackCardState();
}

class _PlaybackCardState extends State<_PlaybackCard> {
  double? _speedDrag;

  @override
  Widget build(BuildContext context) {
    final link = widget.link;
    final s = link.settings;
    final text = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final speed = (_speedDrag ?? (s.speed ?? 100).toDouble()).clamp(25.0, 400.0);
    final loops = s.loops;
    final cycleNames = s.cycleNames;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text('Speed', style: text.titleSmall)),
                Text(s.speed == null ? '…' : '${speed.round()}%'),
              ],
            ),
            Slider(
              value: speed,
              min: speedRange.min.toDouble(),
              max: speedRange.max.toDouble(),
              divisions: 15,
              label: '${speed.round()}%',
              onChanged: (x) => setState(() => _speedDrag = x),
              onChangeEnd: (x) {
                link.setSpeed(x.round());
                setState(() => _speedDrag = null);
              },
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Loops per face', style: text.titleSmall),
                      Text('while cycling', style: text.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                    ],
                  ),
                ),
                IconButton.outlined(
                  icon: const Icon(Icons.remove_rounded),
                  onPressed: loops != null && loops > loopsRange.min ? () => link.setLoops(loops - 1) : null,
                ),
                SizedBox(
                  width: 40,
                  child: Text(loops?.toString() ?? '…', textAlign: TextAlign.center, style: text.titleMedium),
                ),
                IconButton.outlined(
                  icon: const Icon(Icons.add_rounded),
                  onPressed: loops != null && loops < loopsRange.max ? () => link.setLoops(loops + 1) : null,
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text('Rotation', style: text.titleSmall),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<int>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: 0, label: Text('0°')),
                  ButtonSegment(value: 1, label: Text('90°')),
                  ButtonSegment(value: 2, label: Text('180°')),
                  ButtonSegment(value: 3, label: Text('270°')),
                ],
                selected: {if (s.rotation != null) s.rotation!},
                emptySelectionAllowed: true,
                onSelectionChanged: (sel) {
                  if (sel.isNotEmpty) link.setRotation(sel.first);
                },
              ),
            ),
            const SizedBox(height: 6),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('Faces in the cycle', style: text.titleSmall),
              subtitle: Text(
                s.cycleList == null
                    ? '…'
                    : cycleNames.isEmpty
                    ? 'All faces'
                    : '${cycleNames.length}: ${cycleNames.map(niceName).join(', ')}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => showModalBottomSheet<void>(
                context: context,
                showDragHandle: true,
                isScrollControlled: true,
                builder: (context) => _CycleSheet(link: link, faces: widget.faces, initial: cycleNames),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// When the buddy shows its battery and charging animations, and the pools
/// it picks them from (by name, see [alertPoolOf]).
class _AlertsCard extends StatelessWidget {
  const _AlertsCard({required this.link, required this.alerts});
  final BuddyLink link;
  final AlertSettings alerts;

  static const _lowChoices = [0, 2, 5, 10, 15, 30];
  static const _chargingChoices = [-1, 0, 5, 10, 15, 30, 60];

  static String lowLabel(int m) => m <= 0 ? 'Off' : 'Every ~$m min';
  static String chargingLabel(int m) => m < 0
      ? 'Off'
      : m == 0
      ? 'Plug-in and full only'
      : 'Every ~$m min';

  static String _short(String name) => name.replaceFirst(RegExp(r'^(battery|charging)_'), '').replaceAll('_', ' ');

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final dim = text.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant);
    final pools = alertPools(link.names);
    Widget choice(
      String title,
      String sub,
      int value,
      List<int> choices,
      String Function(int) label,
      Future<void> Function(int) set,
    ) => Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: text.titleSmall),
              Text(sub, style: dim),
            ],
          ),
        ),
        DropdownButton<int>(
          value: value,
          isDense: true,
          items: [
            for (final c in ({...choices, value}.toList()..sort())) DropdownMenuItem(value: c, child: Text(label(c))),
          ],
          onChanged: (v) {
            if (v != null && v != value) set(v);
          },
        ),
      ],
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            choice(
              'Low battery',
              'from 15 %; every minute at 5 %',
              alerts.low,
              _lowChoices,
              lowLabel,
              link.setLowAlerts,
            ),
            const SizedBox(height: 12),
            choice(
              'Charging',
              'plugged in, while charging, charged',
              alerts.charging,
              _chargingChoices,
              chargingLabel,
              link.setChargingAlerts,
            ),
            const SizedBox(height: 8),
            Text('Each time a random animation from the pool, at a random time around the interval.', style: dim),
            const Divider(height: 20),
            for (final p in AlertPool.values)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(p.label),
                subtitle: Text(
                  pools[p]!.isEmpty
                      ? 'None on the buddy (${p.when})'
                      : '${pools[p]!.map(_short).join(', ')} · ${p.when}',
                ),
                trailing: TextButton(
                  onPressed: () {
                    HapticFeedback.selectionClick();
                    link.testAlert(p);
                  },
                  child: const Text('Try'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _CycleSheet extends StatefulWidget {
  const _CycleSheet({required this.link, required this.faces, required this.initial});
  final BuddyLink link;
  final List<String> faces;
  final List<String> initial;

  @override
  State<_CycleSheet> createState() => _CycleSheetState();
}

class _CycleSheetState extends State<_CycleSheet> {
  late final Set<String> _sel = widget.initial.toSet();

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final list = widget.faces.where(_sel.contains).toList();
    final fits = cycleCommand(list) != null;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Faces in the cycle', style: text.titleLarge),
              const SizedBox(height: 4),
              Text(
                _sel.isEmpty ? 'None picked: every face cycles.' : '${_sel.length} picked.',
                style: text.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
              ),
              const SizedBox(height: 14),
              Flexible(
                child: SingleChildScrollView(
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final n in widget.faces)
                        FilterChip(
                          avatar: Text(emojiFor(n)),
                          label: Text(niceName(n)),
                          selected: _sel.contains(n),
                          onSelected: (on) => setState(() => on ? _sel.add(n) : _sel.remove(n)),
                        ),
                    ],
                  ),
                ),
              ),
              if (!fits)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    'Too many for one command ($maxCommandLength characters). Pick fewer, or use all faces.',
                    style: text.bodySmall?.copyWith(color: cs.error),
                  ),
                ),
              const SizedBox(height: 16),
              Row(
                children: [
                  TextButton(onPressed: _sel.isEmpty ? null : () => setState(_sel.clear), child: const Text('Clear')),
                  const Spacer(),
                  FilledButton(
                    onPressed: fits
                        ? () {
                            widget.link.setCycleList(list);
                            Navigator.pop(context);
                          }
                        : null,
                    child: Text(_sel.isEmpty ? 'Cycle all faces' : 'Save and cycle'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---- console ----------------------------------------------------------------

class _ConsoleTab extends StatefulWidget {
  const _ConsoleTab({required this.link});
  final BuddyLink link;

  @override
  State<_ConsoleTab> createState() => _ConsoleTabState();
}

class _ConsoleTabState extends State<_ConsoleTab> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  int _seen = 0;

  static const _quick = ['status', 'list', 'names', 'state', 'next'];

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send([String? cmd]) {
    final c = (cmd ?? _input.text).trim();
    if (c.isEmpty) return;
    widget.link.send(c, echo: true);
    if (cmd == null) _input.clear();
  }

  @override
  Widget build(BuildContext context) {
    final link = widget.link;
    final cs = Theme.of(context).colorScheme;
    if (link.log.length != _seen) {
      _seen = link.log.length;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) {
          _scroll.animateTo(
            _scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 150),
            curve: Curves.easeOut,
          );
        }
      });
    }
    const mono = TextStyle(
      fontFamily: 'monospace',
      fontFamilyFallback: ['Menlo', 'Courier'],
      fontSize: 12.5,
      height: 1.35,
    );
    return Column(
      children: [
        Expanded(
          child: Container(
            margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            decoration: BoxDecoration(
              color: cs.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: cs.outlineVariant),
            ),
            child: Stack(
              children: [
                ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                  itemCount: link.log.length,
                  itemBuilder: (context, i) {
                    final l = link.log[i];
                    final color = switch (l.kind) {
                      LogKind.sent => cs.primary,
                      LogKind.reply => cs.onSurface,
                      LogKind.error => cs.error,
                      LogKind.info => cs.onSurfaceVariant,
                    };
                    return SelectableText(l.text, style: mono.copyWith(color: color));
                  },
                ),
                Positioned(
                  top: 2,
                  right: 2,
                  child: IconButton(
                    tooltip: 'Clear',
                    icon: const Icon(Icons.clear_all_rounded),
                    onPressed: link.clearLog,
                  ),
                ),
              ],
            ),
          ),
        ),
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            children: [
              for (final c in _quick)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ActionChip(label: Text(c), onPressed: link.isReady ? () => _send(c) : null),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  enabled: link.isReady,
                  autocorrect: false,
                  enableSuggestions: false,
                  textCapitalization: TextCapitalization.none,
                  textInputAction: TextInputAction.send,
                  maxLength: maxCommandLength,
                  buildCounter: (context, {required currentLength, required isFocused, maxLength}) => null,
                  decoration: InputDecoration(
                    hintText: 'play face_happy, speed 150, loops 2…',
                    filled: true,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  ),
                  onSubmitted: (_) => _send(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                tooltip: 'Send',
                onPressed: link.isReady ? _send : null,
                icon: const Icon(Icons.send_rounded),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ---- status sheet -------------------------------------------------------------

class _StatusSheet extends StatelessWidget {
  const _StatusSheet({required this.link});
  final BuddyLink link;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return ListenableBuilder(
      listenable: link,
      builder: (context, _) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text('Device status', style: text.titleLarge)),
                  IconButton(
                    tooltip: 'Refresh',
                    icon: const Icon(Icons.refresh_rounded),
                    onPressed: link.isReady ? link.refreshStatus : null,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (link.statusLines.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                )
              else
                for (final line in link.statusLines)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Builder(
                      builder: (context) {
                        final i = line.indexOf(': ');
                        final label = i > 0 ? line.substring(0, i) : '';
                        final value = i > 0 ? line.substring(i + 2) : line;
                        return Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 92,
                              child: Text(label, style: text.labelLarge?.copyWith(color: cs.onSurfaceVariant)),
                            ),
                            Expanded(child: SelectableText(value)),
                          ],
                        );
                      },
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}
