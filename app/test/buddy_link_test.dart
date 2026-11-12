
import 'package:desk_buddy/buddy_link.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_buddy.dart';

const _fast = Duration(milliseconds: 5);

BuddyLink _link(List<FakeBuddy> buddies, {List<Duration>? reconnectDelays}) {
  var i = 0;
  return BuddyLink(
    transportFactory: (_) => buddies[i < buddies.length - 1 ? i++ : i],
    retryDelay: _fast,
    pairingHintAfter: const Duration(milliseconds: 20),
    pairingTimeout: const Duration(seconds: 2),
    reconnectDelays: reconnectDelays ?? const [_fast, _fast],
  );
}

/// Lets queued writes and replies run.
Future<void> _settle() => Future<void>.delayed(const Duration(milliseconds: 30));

void main() {
  test('connect: reads the state, fetches names and the playback settings', () async {
    final b = FakeBuddy();
    final link = _link([b]);
    String? saved;
    link.onConnected = (id, name) => saved = '$id/$name';

    expect(await link.connect('aa:bb', name: 'Desk Buddy'), isTrue);
    await _settle();

    expect(link.phase, LinkPhase.ready);
    expect(saved, 'aa:bb/Desk Buddy');
    expect(link.state!.theme, 'robot');
    expect(link.names, b.names);
    expect(b.commands, ['names', 'status']);
    expect(link.settings.speed, 100);
    expect(link.settings.loops, 3);
    expect(link.settings.rotation, 0);
    expect(link.statusLines, hasLength(6));
    // the app's own status request stays out of the console
    expect(link.log.where((l) => l.text.startsWith('wifi:')), isEmpty);
  });

  test('pairing: keeps reading until the code is typed, showing the pairing step', () async {
    final b = FakeBuddy(readsBeforePaired: 8);
    final link = _link([b]);
    final phases = <LinkPhase>[];
    link.addListener(() {
      if (phases.isEmpty || phases.last != link.phase) phases.add(link.phase);
    });

    expect(await link.connect('id'), isTrue);
    expect(phases, containsAllInOrder([LinkPhase.connecting, LinkPhase.pairing, LinkPhase.ready]));
    expect(b.reads, greaterThanOrEqualTo(9));
  });

  test('pairing failed: the buddy hangs up, connect reports it and goes idle', () async {
    final b = FakeBuddy(readsBeforePaired: 2, dropWhilePairing: true);
    final link = _link([b]);

    expect(await link.connect('id'), isFalse);
    expect(link.phase, LinkPhase.idle);
    expect(link.error, contains('pairing failed'));
    expect(b.closed, isTrue);
  });

  test('pairing times out with a hint about stale bonds', () async {
    final b = FakeBuddy(readsBeforePaired: 1 << 30);
    final link = BuddyLink(
      transportFactory: (_) => b,
      retryDelay: _fast,
      pairingTimeout: const Duration(milliseconds: 100),
    );
    expect(await link.connect('id'), isFalse);
    expect(link.error, contains('Bluetooth settings'));
  });

  test('commands go out in order, split at MTU - 3 and joined by the buddy', () async {
    final b = FakeBuddy(mtu: 23);
    final link = _link([b]);
    await link.connect('id');
    await _settle();
    b.commands.clear();
    b.writes.clear();

    link.play('face_sleepy');
    link.setBrightness(35);
    link.send('play robot__error_with_a_rather_long_made_up_name');
    await link.setSpeed(150);
    await _settle();

    expect(b.commands, [
      'play face_sleepy',
      'brightness 35',
      'play robot__error_with_a_rather_long_made_up_name',
      'speed 150',
    ]);
    expect(b.writes.every((w) => w.length <= 20), isTrue);
    expect(link.state!.current, 'face_sleepy');
    expect(link.state!.brightness, 35);
    expect(link.settings.speed, 150);
  });

  test('a state notification cut off at a small MTU is completed with one read, no read loop', () async {
    final b = FakeBuddy(mtu: 23);
    final link = _link([b]);
    await link.connect('id');
    await _settle();
    final readsBefore = b.reads;

    b.current = 'face_happy';
    b.cycling = false;
    b.notifyState(); // 20 bytes of JSON
    await _settle();

    expect(link.state!.current, 'face_happy');
    expect(b.reads - readsBefore, 1);
  });

  test('a changed animation count fetches the names again', () async {
    final b = FakeBuddy();
    final link = _link([b]);
    await link.connect('id');
    await _settle();
    b.commands.clear();

    b.names = [...b.names, 'face_wink'];
    b.notifyState();
    await _settle();

    expect(b.commands, ['names']);
    expect(link.names, contains('face_wink'));
  });

  test('refusals and mistakes reach the notices stream and the log', () async {
    final b = FakeBuddy();
    final link = _link([b]);
    await link.connect('id');
    final notices = <String>[];
    final sub = link.notices.listen(notices.add);

    link.send('wifi home secret', echo: true);
    link.play('nope');
    await _settle();

    expect(notices, [
      'wifi: not available over Bluetooth (use USB serial or the web page)',
      "no animation named 'nope' (try: list)",
    ]);
    expect(link.log.map((l) => l.text), contains('> wifi home secret'));
    await sub.cancel();
  });

  test('too-long commands are not sent', () async {
    final b = FakeBuddy();
    final link = _link([b]);
    await link.connect('id');
    await _settle();
    b.commands.clear();
    final notices = <String>[];
    final sub = link.notices.listen(notices.add);

    expect(link.setCycleList(List.filled(20, 'face_surprised')), isFalse);
    link.send('play ${'x' * 200}');
    await _settle();

    expect(b.commands, isEmpty);
    expect(notices.single, contains('too long'));
    await sub.cancel();
  });

  test('cycle list: sends the list and keeps the reply', () async {
    final b = FakeBuddy();
    final link = _link([b]);
    await link.connect('id');
    await _settle();

    expect(link.setCycleList(['face_happy', 'clock']), isTrue);
    await _settle();
    expect(b.commands.last, 'cycle face_happy,clock');
    expect(link.settings.cycleNames, ['face_happy', 'clock']);
    expect(link.state!.cycling, isTrue);
  });

  test('a dropped link reconnects on its own with a fresh transport', () async {
    final first = FakeBuddy();
    final second = FakeBuddy()..current = 'face_happy';
    final link = _link([first, second]);
    await link.connect('id');
    await _settle();

    final phases = <LinkPhase>[];
    link.addListener(() {
      if (phases.isEmpty || phases.last != link.phase) phases.add(link.phase);
    });
    first.drop();
    await Future<void>.delayed(const Duration(milliseconds: 100));

    expect(phases, containsAllInOrder([LinkPhase.lost, LinkPhase.ready]));
    expect(link.phase, LinkPhase.ready);
    expect(first.closed, isTrue);
    expect(second.opened, isTrue);
    expect(link.state!.current, 'face_happy');
  });

  test('gives up reconnecting after the last attempt and waits for the user', () async {
    final first = FakeBuddy();
    final unreachable = FakeBuddy(readsBeforePaired: 1 << 30);
    final link = BuddyLink(
      transportFactory: (_) => first.opened ? unreachable : first,
      retryDelay: _fast,
      reconnectDelays: const [_fast],
    );
    await link.connect('id');
    first.drop();
    // the reconnect waits up to 10 s for the state; cut it short by dropping
    await Future<void>.delayed(const Duration(milliseconds: 30));
    unreachable.drop();
    await Future<void>.delayed(const Duration(milliseconds: 100));

    expect(link.phase, LinkPhase.lost);
    expect(link.reconnecting, isFalse);
  });

  test('disconnect stops everything and goes idle', () async {
    final b = FakeBuddy();
    final link = _link([b]);
    await link.connect('id');
    await link.disconnect();

    expect(link.phase, LinkPhase.idle);
    expect(b.closed, isTrue);
    expect(link.error, isNull);
    b.drop(); // a late drop event does not resurrect anything
    await _settle();
    expect(link.phase, LinkPhase.idle);
  });

  test('cancelling during pairing abandons the attempt', () async {
    final b = FakeBuddy(readsBeforePaired: 1 << 30);
    final link = _link([b]);
    final attempt = link.connect('id');
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(link.phase, LinkPhase.pairing);
    await link.disconnect();
    expect(await attempt.timeout(const Duration(seconds: 1)), isFalse);
    expect(link.phase, LinkPhase.idle);
    expect(link.error, isNull);
  });
}
