import 'package:flutter/material.dart';

import '../buddy_link.dart';
import '../protocol.dart';

/// Name, Wi-Fi network and reboot. Each saves on the buddy and restarts it;
/// the app reconnects by itself. Needs firmware that runs every console
/// command over Bluetooth (older firmware answers "not available").
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.link});
  final BuddyLink link;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final _name = TextEditingController(text: widget.link.deviceName);
  final _ssid = TextEditingController();
  final _pass = TextEditingController();
  bool _showPass = false;
  String? _nameProblem, _wifiProblem;

  BuddyLink get link => widget.link;

  @override
  void initState() {
    super.initState();
    link.refreshStatus();
  }

  @override
  void dispose() {
    _name.dispose();
    _ssid.dispose();
    _pass.dispose();
    super.dispose();
  }

  /// The value of a `status` line, e.g. `wifi` → `connected, 192.168.1.20`.
  String? _status(String key) {
    for (final l in link.statusLines) {
      if (l.startsWith('$key: ')) return l.substring(key.length + 2);
    }
    return null;
  }

  Future<bool> _confirm(String title, String body, String action) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(action)),
        ],
      ),
    );
    return ok ?? false;
  }

  Future<void> _rename() async {
    final c = nameCommand(_name.text);
    setState(() => _nameProblem = c.problem);
    if (c.command == null) return;
    final name = _name.text.trim();
    if (!await _confirm('Rename to "$name"?', 'The buddy restarts to use the new name. '
        'The app reconnects by itself.', 'Rename')) {
      return;
    }
    link.rename(name);
    if (mounted) Navigator.pop(context);
  }

  Future<void> _wifi() async {
    final ssid = _ssid.text.trim();
    final c = wifiCommand(ssid, _pass.text);
    setState(() => _wifiProblem = c.problem);
    if (c.command == null) return;
    if (!await _confirm('Join "$ssid"?', 'The buddy saves the network and restarts. If the name '
        'or password is wrong it opens its setup access point instead; you can '
        'set it again here over Bluetooth.', 'Save and restart')) {
      return;
    }
    link.setWifi(ssid, _pass.text);
    if (mounted) Navigator.pop(context);
  }

  Future<void> _reboot() async {
    if (!await _confirm('Restart the buddy?', 'It comes back in a few seconds and the app reconnects.',
        'Restart')) {
      return;
    }
    link.reboot();
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return ListenableBuilder(
      listenable: link,
      builder: (context, _) {
        final ready = link.isReady;
        final wifi = _status('wifi');
        final hasWifi = link.statusLines.isEmpty || wifi != null;
        return Scaffold(
          appBar: AppBar(title: const Text('Buddy settings')),
          body: AbsorbPointer(
            absorbing: !ready,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                if (!ready)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text('Not connected.', style: TextStyle(color: cs.error)),
                  ),
                _Card(
                  title: 'Name',
                  subtitle: 'Shown in Bluetooth scans, on the network and in Home Assistant.',
                  children: [
                    TextField(
                      controller: _name,
                      maxLength: maxDeviceNameLength,
                      textCapitalization: TextCapitalization.words,
                      decoration: InputDecoration(
                        border: const OutlineInputBorder(),
                        labelText: 'Device name',
                        errorText: _nameProblem,
                      ),
                      onSubmitted: (_) => _rename(),
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton.tonal(onPressed: _rename, child: const Text('Rename')),
                    ),
                  ],
                ),
                if (hasWifi) ...[
                  const SizedBox(height: 12),
                  _Card(
                    title: 'Wi-Fi',
                    subtitle: wifi == null ? 'The network the buddy joins.' : 'Now: $wifi',
                    children: [
                      TextField(
                        controller: _ssid,
                        autocorrect: false,
                        enableSuggestions: false,
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          labelText: 'Network name (SSID)',
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _pass,
                        obscureText: !_showPass,
                        autocorrect: false,
                        enableSuggestions: false,
                        decoration: InputDecoration(
                          border: const OutlineInputBorder(),
                          labelText: 'Password',
                          helperText: 'Empty for an open network. Sent over the encrypted Bluetooth link.',
                          helperMaxLines: 2,
                          errorText: _wifiProblem,
                          errorMaxLines: 2,
                          suffixIcon: IconButton(
                            icon: Icon(_showPass ? Icons.visibility_off_rounded : Icons.visibility_rounded),
                            onPressed: () => setState(() => _showPass = !_showPass),
                          ),
                        ),
                        onSubmitted: (_) => _wifi(),
                      ),
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerRight,
                        child: FilledButton.tonal(onPressed: _wifi, child: const Text('Save and restart')),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 12),
                _Card(
                  title: 'Restart',
                  subtitle: 'Reboots the buddy; settings and animations stay.',
                  children: [
                    Align(
                      alignment: Alignment.centerRight,
                      child: OutlinedButton.icon(
                        onPressed: _reboot,
                        icon: const Icon(Icons.restart_alt_rounded),
                        label: const Text('Restart'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Text(
                  'To unpair every phone, factory reset or change MQTT, use the console '
                  '(ble forget, reset, mqtt …) or USB serial.',
                  style: text.bodySmall?.copyWith(color: cs.onSurfaceVariant),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.subtitle, required this.children});
  final String title, subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: text.titleMedium),
          const SizedBox(height: 2),
          Text(subtitle, style: text.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height: 14),
          ...children,
        ]),
      ),
    );
  }
}
