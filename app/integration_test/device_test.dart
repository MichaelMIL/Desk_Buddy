// End-to-end test against a real buddy nearby. Runs on macOS (or a phone):
//
//   flutter test integration_test/device_test.dart -d macos
//
// The first macOS run asks to allow Bluetooth for the app. The buddy must be
// free (no phone or browser tab connected) and this computer paired with it,
// or the buddy's code typed into the pairing prompt. The test puts back the
// theme, brightness, screen, speed and playback it found.
import 'dart:io';
import 'dart:ui' as ui;

import 'package:desk_buddy/buddy_link.dart';
import 'package:desk_buddy/main.dart';
import 'package:desk_buddy/protocol.dart';
import 'package:desk_buddy/scanner.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:universal_ble/universal_ble.dart';

Future<int> waitFor(String what, bool Function() done, {Duration timeout = const Duration(seconds: 5)}) async {
  final sw = Stopwatch()..start();
  while (!done()) {
    if (sw.elapsed > timeout) fail('timed out after ${timeout.inSeconds} s waiting for $what');
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
  return sw.elapsedMilliseconds;
}

final _shot = GlobalKey();

Future<void> screenshot(WidgetTester tester, String name) async {
  await tester.pumpAndSettle();
  final boundary = _shot.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  final image = await boundary.toImage(pixelRatio: 2);
  final png = await image.toByteData(format: ui.ImageByteFormat.png);
  final file = File('${Directory.systemTemp.path}/desk_buddy_$name.png');
  await file.writeAsBytes(png!.buffer.asUint8List());
  debugPrint('screenshot: ${file.path}');
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('real buddy: find, connect, control, restore', (tester) async {
    final timings = <String, int>{};

    // ---- find ----
    final scanner = BuddyScanner();
    await scanner.init();
    await scanner.start();
    await waitFor('Bluetooth on and allowed', () => scanner.availability == AvailabilityState.poweredOn,
        timeout: const Duration(seconds: 90));
    if (!scanner.scanning) await scanner.start();
    timings['scan'] = await waitFor('a buddy advertising', () => scanner.found.isNotEmpty,
        timeout: const Duration(seconds: 20));
    final found = scanner.buddies.first;
    await scanner.stop();
    scanner.dispose();
    debugPrint('found ${found.name} (${found.id}) at ${found.rssi} dBm');

    // ---- connect ----
    final link = BuddyLink();
    final notices = <String>[];
    link.notices.listen(notices.add);
    final sw = Stopwatch()..start();
    final ok = await link.connect(found.id, name: found.name);
    expect(ok, isTrue, reason: link.error);
    timings['connect+pair'] = sw.elapsedMilliseconds;
    await waitFor('names', () => link.names.isNotEmpty && link.names.length == link.state!.count);
    await waitFor('status', () => link.statusLines.isNotEmpty && link.settings.speed != null);
    final before = link.state!;
    final speedBefore = link.settings.speed!;
    debugPrint('before: $before, speed $speedBefore%, ${link.names.length} names');
    debugPrint(link.log.map((l) => l.text).join(' | '));

    try {
      // ---- controller ----
      final face = link.names.firstWhere((n) => n == 'face_happy', orElse: () => facesFor(link.names, '').common.first);
      await link.play(face);
      timings['play'] = await waitFor('playing $face', () => link.state!.current == face);
      expect(link.state!.cycling, isFalse);

      final dim = before.brightness == 40 ? 50 : 40;
      await link.setBrightness(dim);
      timings['brightness'] = await waitFor('brightness $dim', () => link.state!.brightness == dim);

      final themes = themesIn(link.names);
      final otherTheme = themes.firstWhere((t) => t != before.theme, orElse: () => '');
      await link.setTheme(otherTheme);
      timings['theme'] = await waitFor('theme "$otherTheme"', () => link.state!.theme == otherTheme);

      await link.setSpeed(150);
      timings['speed'] = await waitFor('speed 150', () => link.settings.speed == 150);

      // A harmless mistake. (Never test refusals with wifi/name/delete: newer
      // firmware runs every serial command for a paired device.)
      link.play('no_such_face_zz');
      await waitFor('error reply', () => notices.any((n) => n.startsWith("no animation named 'no_such_face_zz'")));

      await link.cycle();
      timings['cycle'] = await waitFor('cycling', () => link.state!.cycling);

      // ---- the app's screens on the live link ----
      await tester.binding.setSurfaceSize(const Size(390, 844));
      await tester.pumpWidget(RepaintBoundary(key: _shot, child: DeskBuddyApp(link: link)));
      await screenshot(tester, 'remote');

      final faceLabel = find.text(niceName(face));
      await tester.tap(faceLabel.first);
      timings['ui play'] = await waitFor('UI tap plays $face', () => link.state!.current == face);
      await screenshot(tester, 'remote_playing');

      await tester.tap(find.text('Screen on'));
      await waitFor('screen off', () => !link.state!.screen);
      await screenshot(tester, 'remote_screen_off');
      await tester.tap(find.text('Screen off'));
      await waitFor('screen on', () => link.state!.screen);

      await tester.drag(find.byType(ListView).first, const Offset(0, -700));
      await screenshot(tester, 'remote_scrolled');

      await tester.tap(find.text('Console'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'status');
      await tester.testTextInput.receiveAction(TextInputAction.send);
      await waitFor('status in the console', () => link.log.any((l) => l.text.startsWith('bluetooth: ')));
      await screenshot(tester, 'console');

      await tester.tap(find.text('Remote'));
      await tester.tap(find.byIcon(Icons.info_outline_rounded));
      await screenshot(tester, 'status_sheet');
    } finally {
      // ---- put everything back ----
      await link.setTheme(before.theme);
      await link.setBrightness(before.brightness);
      await link.setSpeed(speedBefore);
      await link.setScreen(before.screen);
      await (before.cycling ? link.cycle() : link.play(before.current));
      await waitFor('restored state', () {
        final s = link.state!;
        return s.theme == before.theme &&
            s.brightness == before.brightness &&
            s.screen == before.screen &&
            s.cycling == before.cycling &&
            link.settings.speed == speedBefore;
      });
      await link.disconnect();
    }
    debugPrint('timings (ms): $timings');
    debugPrint('restored: ${link.state}');
  });
}
