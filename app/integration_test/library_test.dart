// Uploading from the library to a real buddy, from macOS:
//
//   curl -s -X POST -H 'X-Desk-Buddy: 1' -d '{"seconds": 180}' 127.0.0.1:47615/hold   # keep the bridge off
//   flutter test integration_test/library_test.dart -d macos
//
// Picks the smallest library animation that is not on the buddy, uploads it
// (ensureOnBuddy), plays it, then deletes it again and puts back what was
// playing, so the buddy ends as it was. Needs assets/library
// (sim/test/library.sh --app).
import 'package:desk_buddy/buddy_link.dart';
import 'package:desk_buddy/library.dart';
import 'package:desk_buddy/scanner.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:universal_ble/universal_ble.dart';

Future<int> waitFor(String what, bool Function() done, {Duration timeout = const Duration(seconds: 10)}) async {
  final sw = Stopwatch()..start();
  while (!done()) {
    if (sw.elapsed > timeout) fail('timed out waiting for $what');
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
  return sw.elapsedMilliseconds;
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('real buddy: upload from the library, play, delete again', (tester) async {
    final lib = await AnimationLibrary.fromAssets();
    expect(lib.names, isNotEmpty, reason: 'run sim/test/library.sh --app first');

    final scanner = BuddyScanner();
    await scanner.init();
    await scanner.start();
    await waitFor('Bluetooth on', () => scanner.availability == AvailabilityState.poweredOn,
        timeout: const Duration(seconds: 60));
    if (!scanner.scanning) await scanner.start();
    await waitFor('a buddy', () => scanner.found.isNotEmpty, timeout: const Duration(seconds: 20));
    final found = scanner.buddies.first;
    await scanner.stop();
    scanner.dispose();

    final link = BuddyLink()..library = lib;
    final notices = <String>[];
    link.notices.listen(notices.add);
    expect(await link.connect(found.id, name: found.name), isTrue, reason: link.error);
    await waitFor('names', () => link.names.isNotEmpty && link.names.length == link.state!.count);
    final before = link.state!;

    final missing = lib.names.where((n) => !link.names.contains(n)).toList()
      ..sort((a, b) => lib.sizes[a]!.compareTo(lib.sizes[b]!));
    expect(missing, isNotEmpty, reason: 'every library animation is on the buddy already');
    final name = missing.first;
    debugPrint('uploading $name (${lib.sizes[name]} bytes); ${link.names.length} on the buddy');

    try {
      final sw = Stopwatch()..start();
      await link.play(name); // uploads first
      debugPrint('upload + play: ${sw.elapsedMilliseconds} ms; notices: $notices');
      expect(notices, isEmpty);
      await waitFor('$name playing', () => link.state!.current == name);
      await waitFor('names fetched again', () => link.names.contains(name) && link.names.length == link.state!.count);
    } finally {
      // leave the buddy as it was
      if (link.names.contains(name)) {
        await link.send('delete $name');
        await waitFor('$name deleted', () => link.state!.count == link.names.length && !link.names.contains(name),
            timeout: const Duration(seconds: 15));
      }
      await (before.cycling ? link.cycle() : link.play(before.current));
      await Future<void>.delayed(const Duration(milliseconds: 500));
      debugPrint('restored: ${link.state}');
      await link.disconnect();
    }
  });
}
