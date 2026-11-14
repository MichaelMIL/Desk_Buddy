import 'package:flutter/material.dart';

import '../buddy_link.dart';
import '../widgets/buddy_face.dart';

/// Connecting, then (first time only) waiting for the pairing code.
class ConnectingScreen extends StatelessWidget {
  const ConnectingScreen({super.key, required this.link});
  final BuddyLink link;

  @override
  Widget build(BuildContext context) {
    final pairing = link.phase == LinkPhase.pairing;
    final text = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                BuddyFace(
                  size: 150,
                  emoji: pairing ? '🔐' : '📡',
                  animation: pairing ? null : 'template__eyes',
                  pulse: true,
                ),
                const SizedBox(height: 20),
                Text(
                  pairing ? 'Pair with ${link.deviceName}' : 'Connecting to ${link.deviceName}…',
                  style: text.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                AnimatedSize(
                  duration: const Duration(milliseconds: 250),
                  child: pairing
                      ? Card(
                          child: Padding(
                            padding: const EdgeInsets.all(18),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              _Step(n: 1, text: 'The buddy\'s screen shows a 6-digit code.'),
                              _Step(n: 2, text: 'Type it into the pairing prompt on this phone.'),
                              const SizedBox(height: 6),
                              Text(
                                'Only the first time: after that the phone reconnects without a code.',
                                style: text.bodySmall?.copyWith(color: cs.onSurfaceVariant),
                              ),
                              const Divider(height: 24),
                              Text(
                                'No prompt? If this phone was paired before and the buddy has since '
                                'forgotten it, remove "${link.deviceName}" in the phone\'s Bluetooth '
                                'settings and connect again.',
                                style: text.bodySmall?.copyWith(color: cs.onSurfaceVariant),
                              ),
                            ]),
                          ),
                        )
                      : const SizedBox(width: double.infinity),
                ),
                const SizedBox(height: 24),
                const SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 3)),
                const SizedBox(height: 24),
                OutlinedButton(onPressed: link.disconnect, child: const Text('Cancel')),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.n, required this.text});
  final int n;
  final String text;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        CircleAvatar(
          radius: 12,
          backgroundColor: cs.primary,
          child: Text('$n', style: TextStyle(color: cs.onPrimary, fontSize: 13, fontWeight: FontWeight.w700)),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyLarge)),
      ]),
    );
  }
}
