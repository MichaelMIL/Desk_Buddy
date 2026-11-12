import 'package:flutter/material.dart';
import 'package:universal_ble/universal_ble.dart';

import '../buddy_link.dart';
import '../saved_device.dart';
import '../scanner.dart';
import '../widgets/buddy_face.dart';

/// Not connected: the remembered buddy, buddies nearby, and why none show up.
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key, required this.link, required this.saved, required this.onForget});

  final BuddyLink link;
  final SavedDevice? saved;
  final VoidCallback onForget;

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final scanner = BuddyScanner();

  @override
  void initState() {
    super.initState();
    scanner.init().then((_) => scanner.start());
  }

  @override
  void dispose() {
    scanner.dispose();
    super.dispose();
  }

  Future<void> _connect(String id, String name) async {
    await scanner.stop();
    await widget.link.connect(id, name: name);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Desk Buddy')),
      body: ListenableBuilder(
        listenable: scanner,
        builder: (context, _) {
          final saved = widget.saved;
          final nearby = scanner.buddies.where((b) => b.id != saved?.id).toList();
          final savedNearby = saved != null && scanner.found.containsKey(saved.id);
          return RefreshIndicator(
            onRefresh: () async {
              await scanner.stop();
              await scanner.start();
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
              children: [
                const Center(child: BuddyFace(size: 120, emoji: '👋')),
                const SizedBox(height: 16),
                if (widget.link.error != null)
                  _Notice(
                    icon: Icons.error_outline_rounded,
                    color: cs.error,
                    text: widget.link.error!,
                  ),
                _BluetoothNotice(scanner: scanner),
                if (saved != null) ...[
                  _Header('Your buddy'),
                  Card(
                    child: ListTile(
                      contentPadding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
                      leading: const _Avatar(),
                      title: Text(saved.name),
                      subtitle: Text(savedNearby ? 'Nearby' : 'Last used'),
                      onTap: () => _connect(saved.id, saved.name),
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        IconButton(
                          tooltip: 'Forget',
                          icon: const Icon(Icons.delete_outline_rounded),
                          onPressed: widget.onForget,
                        ),
                        FilledButton(
                          onPressed: () => _connect(saved.id, saved.name),
                          child: const Text('Connect'),
                        ),
                      ]),
                    ),
                  ),
                ],
                _Header(
                  saved == null ? 'Buddies nearby' : 'Other buddies nearby',
                  trailing: scanner.scanning
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : null,
                ),
                if (nearby.isEmpty)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        scanner.scanning ? 'Looking for buddies…' : 'None found.',
                        style: text.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
                      ),
                    ),
                  )
                else
                  Card(
                    clipBehavior: Clip.antiAlias,
                    child: Column(children: [
                      for (final b in nearby)
                        ListTile(
                          leading: const _Avatar(),
                          title: Text(b.name),
                          subtitle: Text(_signal(b.rssi)),
                          trailing: Icon(_signalIcon(b.rssi)),
                          onTap: () => _connect(b.id, b.name),
                        ),
                    ]),
                  ),
                if (scanner.error != null)
                  _Notice(icon: Icons.warning_amber_rounded, color: cs.error, text: scanner.error!),
                _Header('Not showing up?'),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      '• A buddy accepts one connection at a time and stops advertising while '
                      'a phone or browser tab is connected. Disconnect that one first.\n'
                      '• Bluetooth must be on in the buddy\'s settings (USB serial: ble on).\n'
                      '• The first connection asks for the 6-digit code from the buddy\'s screen.',
                      style: text.bodyMedium?.copyWith(color: cs.onSurfaceVariant, height: 1.45),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
      floatingActionButton: ListenableBuilder(
        listenable: scanner,
        builder: (context, _) => FloatingActionButton.extended(
          onPressed: scanner.scanning ? scanner.stop : scanner.start,
          icon: Icon(scanner.scanning ? Icons.stop_rounded : Icons.bluetooth_searching_rounded),
          label: Text(scanner.scanning ? 'Stop' : 'Scan'),
        ),
      ),
    );
  }

  static String _signal(int rssi) => rssi >= -60
      ? 'Close by'
      : rssi >= -75
          ? 'In range'
          : 'Far away';

  static IconData _signalIcon(int rssi) => rssi >= -60
      ? Icons.signal_cellular_alt_rounded
      : rssi >= -75
          ? Icons.signal_cellular_alt_2_bar_rounded
          : Icons.signal_cellular_alt_1_bar_rounded;
}

class _BluetoothNotice extends StatelessWidget {
  const _BluetoothNotice({required this.scanner});
  final BuddyScanner scanner;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final text = switch (scanner.availability) {
      AvailabilityState.poweredOff => 'Bluetooth is off. Turn it on to find your buddy.',
      AvailabilityState.unauthorized =>
        'Desk Buddy may not use Bluetooth. Allow it in the phone\'s Settings for this app.',
      AvailabilityState.unsupported => 'This device has no Bluetooth LE.',
      _ => null,
    };
    if (text == null) return const SizedBox.shrink();
    return _Notice(icon: Icons.bluetooth_disabled_rounded, color: cs.tertiary, text: text);
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.color, required this.text});
  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Card(
          color: color.withValues(alpha: 0.12),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(icon, color: color),
              const SizedBox(width: 12),
              Expanded(child: Text(text)),
            ]),
          ),
        ),
      );
}

class _Header extends StatelessWidget {
  const _Header(this.title, {this.trailing});
  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 18, 4, 8),
        child: Row(children: [
          Expanded(
            child: Text(
              title.toUpperCase(),
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    letterSpacing: 1.1,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
          ),
          ?trailing,
        ]),
      );
}

class _Avatar extends StatelessWidget {
  const _Avatar();

  @override
  Widget build(BuildContext context) => Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: const Color(0xFF050607),
          border: Border.all(color: const Color(0xFF2B2F36), width: 3),
        ),
        alignment: Alignment.center,
        child: const Text('🙂', style: TextStyle(fontSize: 18)),
      );
}
