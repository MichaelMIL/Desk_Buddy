import 'package:desk_buddy/buddy_link.dart';
import 'package:desk_buddy/library.dart';
import 'package:desk_buddy/main.dart';
import 'package:desk_buddy/widgets/battery_indicator.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_buddy.dart';

/// Lets the link's write chain (started on the real event loop by
/// [connected]) run, then rebuilds.
Future<void> settle(WidgetTester tester) async {
  await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<(FakeBuddy, BuddyLink)> connected(WidgetTester tester) async {
    // a tall phone, so the whole remote is built without scrolling
    tester.view.physicalSize = const Size(1290, 7200);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final b = FakeBuddy();
    final link = BuddyLink(transportFactory: (_) => b, retryDelay: const Duration(milliseconds: 5));
    await tester.runAsync(() async {
      await link.connect('id', name: 'Desk Buddy');
      await Future<void>.delayed(const Duration(milliseconds: 30));
    });
    await tester.pumpWidget(DeskBuddyApp(link: link));
    await tester.pumpAndSettle();
    return (b, link);
  }

  testWidgets('battery in the app bar: level, low alert, hidden without one', (tester) async {
    final (b, _) = await connected(tester);
    expect(find.byIcon(Icons.battery_alert_rounded), findsNothing);
    expect(find.text('64%'), findsNothing);

    b.battery = 64;
    b.notifyState();
    await settle(tester);
    expect(find.text('64%'), findsOneWidget);
    expect(find.byIcon(Icons.battery_4_bar_rounded), findsOneWidget);

    b.battery = 12;
    b.batteryLow = true;
    b.notifyState();
    await settle(tester);
    expect(find.text('12%'), findsOneWidget);
    expect(find.byIcon(Icons.battery_alert_rounded), findsOneWidget);
    expect(find.byTooltip('Battery low (12 %): charge the buddy'), findsOneWidget);

    b.charger = 'charging';                             // plugged in: a bolt, no alert
    b.notifyState();
    await settle(tester);
    expect(find.byIcon(Icons.battery_charging_full_rounded), findsOneWidget);
    expect(find.byIcon(Icons.battery_alert_rounded), findsNothing);
    expect(find.byTooltip('Battery 12 %, charging'), findsOneWidget);

    b.battery = 99;
    b.batteryLow = false;
    b.charger = 'full';
    b.notifyState();
    await settle(tester);
    expect(find.byIcon(Icons.battery_full_rounded), findsOneWidget);
    expect(find.byTooltip('Battery charged (99 %)'), findsOneWidget);

    b.battery = null;
    b.charger = null;
    b.notifyState();
    await settle(tester);
    expect(find.text('99%'), findsNothing);
    expect(find.byIcon(Icons.battery_full_rounded), findsNothing);
  });

  test('battery icon follows the charge', () {
    expect(BatteryIndicator.iconFor(100, low: false), Icons.battery_full_rounded);
    expect(BatteryIndicator.iconFor(96, low: false), Icons.battery_full_rounded);
    expect(BatteryIndicator.iconFor(90, low: false), Icons.battery_6_bar_rounded);
    expect(BatteryIndicator.iconFor(50, low: false), Icons.battery_3_bar_rounded);
    expect(BatteryIndicator.iconFor(3, low: false), Icons.battery_0_bar_rounded);
    expect(BatteryIndicator.iconFor(40, low: true), Icons.battery_alert_rounded);
    expect(BatteryIndicator.iconFor(10, low: true, charging: true), Icons.battery_charging_full_rounded);
    expect(BatteryIndicator.iconFor(97, low: false, charged: true), Icons.battery_full_rounded);
  });

  testWidgets('remote shows the common faces and the selected theme\'s only', (tester) async {
    await connected(tester);
    expect(find.text('Desk Buddy'), findsOneWidget);
    expect(find.text('Cycling · 7 animations'), findsOneWidget);
    expect(find.text('happy'), findsOneWidget);
    expect(find.text('clock'), findsOneWidget);
    expect(find.text('boot'), findsOneWidget); // robot theme, selected
    expect(find.text('santa'), findsNothing); // xmas theme, not selected
  });

  testWidgets('tapping a face plays it and the screen follows the state', (tester) async {
    final (b, _) = await connected(tester);
    await tester.tap(find.text('sleepy'));
    await settle(tester);
    expect(b.commands.last, 'play face_sleepy');
    expect(find.text('sleepy · 7 animations'), findsOneWidget);
  });

  testWidgets('choosing a theme switches the themed faces', (tester) async {
    final (b, _) = await connected(tester);
    await tester.tap(find.text('Xmas'));
    await settle(tester);
    expect(b.commands.last, 'theme xmas');
    expect(find.text('santa'), findsOneWidget);
    expect(find.text('boot'), findsNothing);
  });

  testWidgets('screen toggle and playback settings', (tester) async {
    final (b, _) = await connected(tester);
    await tester.tap(find.text('Screen on'));
    await settle(tester);
    expect(b.commands.last, 'screen off');
    expect(find.text('Screen off'), findsOneWidget);

    await tester.tap(find.text('180°'));
    await settle(tester);
    expect(b.commands.last, 'rotation 2');

    await tester.tap(find.byIcon(Icons.add_rounded));
    await settle(tester);
    expect(b.commands.last, 'loops 4');
    expect(find.text('4'), findsOneWidget);
  });

  testWidgets('console sends typed commands and shows replies', (tester) async {
    final (b, _) = await connected(tester);
    await tester.tap(find.text('Console'));
    await settle(tester);
    await tester.enterText(find.byType(TextField), 'speed 200');
    await tester.testTextInput.receiveAction(TextInputAction.send);
    await settle(tester);
    expect(b.commands.last, 'speed 200');
    expect(find.text('> speed 200'), findsOneWidget);
    expect(find.text('speed 200%'), findsOneWidget);
  });

  testWidgets('long-press a face to delete it, after a confirmation', (tester) async {
    final (b, link) = await connected(tester);
    await tester.longPress(find.text('sleepy'));
    await settle(tester);
    await tester.tap(find.text('Delete from the buddy'));
    await settle(tester);
    expect(find.text('Delete "sleepy"?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await settle(tester);
    expect(b.commands, contains('delete face_sleepy'));
    expect(link.names, isNot(contains('face_sleepy')));
    expect(find.text('sleepy'), findsNothing);
  });

  testWidgets('settings: rename asks first, then sends the name', (tester) async {
    final (b, _) = await connected(tester);
    await tester.tap(find.byType(PopupMenuButton<String>));
    await settle(tester);
    await tester.tap(find.text('Buddy settings'));
    await settle(tester);
    expect(find.text('Now: connected, 192.168.1.20'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Device name'), 'Kitchen Buddy');
    await tester.tap(find.widgetWithText(FilledButton, 'Rename'));
    await settle(tester);
    expect(find.text('Rename to "Kitchen Buddy"?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Rename').last);
    // the buddy restarts: the "Reconnecting…" spinner never settles
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 200)); // dialog and page close
    }
    expect(b.commands, contains('name Kitchen Buddy'));
    expect(find.text('Buddy settings'), findsNothing); // back on the remote
    expect(find.text('The buddy is restarting. Reconnecting…'), findsOneWidget);
    expect(find.text('Kitchen Buddy'), findsOneWidget);
  });

  testWidgets('settings: a password the buddy would mangle is explained, not sent', (tester) async {
    final (b, _) = await connected(tester);
    await tester.tap(find.byType(PopupMenuButton<String>));
    await settle(tester);
    await tester.tap(find.text('Buddy settings'));
    await settle(tester);
    await tester.enterText(find.widgetWithText(TextField, 'Network name (SSID)'), 'My Home');
    await tester.enterText(find.widgetWithText(TextField, 'Password'), 'secret ');
    await tester.tap(find.widgetWithText(FilledButton, 'Save and restart'));
    await settle(tester);
    expect(find.textContaining('ends with a space'), findsOneWidget);
    expect(b.commands.where((c) => c.startsWith('wifi')), isEmpty);
  });

  testWidgets('a face only in the library is marked, and tapping it uploads then plays it', (tester) async {
    tester.view.physicalSize = const Size(1290, 7200);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final b = FakeBuddy();
    final link = BuddyLink(transportFactory: (_) => b, retryDelay: const Duration(milliseconds: 5))
      ..library = AnimationLibrary({'face_wink': 3000}, (n) async => List.filled(3000, 1));
    await tester.runAsync(() async {
      await link.connect('id', name: 'Desk Buddy');
      await Future<void>.delayed(const Duration(milliseconds: 30));
    });
    await tester.pumpWidget(DeskBuddyApp(link: link));
    await tester.pumpAndSettle();

    final wink = find.ancestor(of: find.text('wink'), matching: find.byType(Row));
    expect(find.descendant(of: wink, matching: find.byIcon(Icons.download_rounded)), findsOneWidget);
    expect(find.descendant(of: find.ancestor(of: find.text('happy'), matching: find.byType(Row)),
        matching: find.byIcon(Icons.download_rounded)), findsNothing);

    await tester.tap(find.text('wink'));
    for (var i = 0; i < 4; i++) {
      await settle(tester); // the upload's steps alternate between the real event loop and the test's clock
    }
    expect(b.commands, containsAllInOrder(['upload face_wink 3000', 'play face_wink']));
    expect(find.byIcon(Icons.download_rounded), findsNothing);              // on the buddy now
    expect(find.text('wink · 8 animations'), findsOneWidget);
  });
}
