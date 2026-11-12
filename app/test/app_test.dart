import 'package:desk_buddy/buddy_link.dart';
import 'package:desk_buddy/main.dart';
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
}
