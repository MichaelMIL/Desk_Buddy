
import 'package:desk_buddy/buddy_link.dart';
import 'package:desk_buddy/library.dart';
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
    expect(link.statusLines, hasLength(7));
    expect(link.statusLines, contains('battery: none (nothing on GPIO 1)'));
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

  test('refusals (older firmware) and mistakes reach the notices stream and the log', () async {
    final b = FakeBuddy(fullAccess: false);
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
    expect(link.log.map((l) => l.text), contains('> wifi home ••••')); // password masked
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

  test('rename: sends the name, the buddy restarts, the app reconnects and remembers the new name', () async {
    final first = FakeBuddy();
    final second = FakeBuddy(deviceName: 'Kitchen Buddy');
    final link = _link([first, second]);
    final remembered = <String>[];
    link.onConnected = (id, name) => remembered.add(name);
    await link.connect('id', name: 'Desk Buddy');
    await _settle();

    expect(link.rename('  '), isNotNull);
    expect(link.rename('x' * 40), contains('29'));
    final phases = <LinkPhase>[];
    var sawRestarting = false;
    link.addListener(() {
      if (phases.isEmpty || phases.last != link.phase) phases.add(link.phase);
      if (link.phase == LinkPhase.lost && link.restarting) sawRestarting = true;
    });
    expect(link.rename('Kitchen Buddy'), isNull);
    await Future<void>.delayed(const Duration(milliseconds: 150));

    expect(first.commands.last, 'name Kitchen Buddy');
    expect(phases, containsAllInOrder([LinkPhase.lost, LinkPhase.ready]));
    expect(sawRestarting, isTrue);
    expect(link.restarting, isFalse);
    expect(link.deviceName, 'Kitchen Buddy');
    expect(remembered.last, 'Kitchen Buddy');
  });

  test('Wi-Fi: checks the input, keeps the password out of the log', () async {
    final first = FakeBuddy();
    final link = _link([first, FakeBuddy()]);
    await link.connect('id');
    await _settle();

    expect(link.setWifi('', 'x'), isNotNull);
    expect(link.setWifi('bad"name', 'x'), isNotNull);
    expect(link.setWifi('home', 'p' * 200), contains('too long'));
    expect(first.wifi, isNull);

    expect(link.setWifi('home', 'secret pass'), isNull);
    await Future<void>.delayed(const Duration(milliseconds: 150));
    expect(first.wifi, 'home secret pass');
    expect(link.log.any((l) => l.text.contains('secret')), isFalse);
    expect(link.phase, LinkPhase.ready); // reconnected after the restart
  });

  test('reboot drops the link on purpose and reconnects', () async {
    final first = FakeBuddy();
    final second = FakeBuddy();
    final link = _link([first, second]);
    await link.connect('id');
    await _settle();

    await link.reboot();
    await Future<void>.delayed(const Duration(milliseconds: 150));
    expect(first.commands.last, 'reboot');
    expect(second.opened, isTrue);
    expect(link.phase, LinkPhase.ready);
  });

  test('delete: the names follow the new count', () async {
    final b = FakeBuddy();
    final link = _link([b]);
    await link.connect('id');
    await _settle();

    await link.deleteAnimation('clock');
    await _settle();
    expect(b.commands, containsAllInOrder(['delete clock', 'names']));
    expect(link.names, isNot(contains('clock')));
    expect(link.names.length, link.state!.count);
  });

  test('a name changed elsewhere is picked up from status', () async {
    final b = FakeBuddy(deviceName: 'Office Buddy');
    final link = _link([b]);
    final remembered = <String>[];
    link.onConnected = (id, name) => remembered.add(name);
    await link.connect('id', name: 'Desk Buddy');
    await _settle();
    expect(link.deviceName, 'Office Buddy');
    expect(remembered, ['Desk Buddy', 'Office Buddy']);
  });

  group('library', () {
    // sizes in bytes; the bytes themselves are a recognisable pattern
    AnimationLibrary lib(Map<String, int> sizes) =>
        AnimationLibrary(sizes, (n) async => List.generate(sizes[n]!, (i) => (i * 7 + n.length) & 0xff));

    test('playing a face that is only in the library uploads it, then plays it', () async {
      final b = FakeBuddy();
      final link = _link([b])..library = lib({'hacker__matrix': 5000, 'face_happy': 3000});
      await link.connect('id');
      await _settle();
      b.commands.clear();

      await link.play('hacker__matrix');
      await _settle();

      expect(b.commands.first, 'upload hacker__matrix 5000');
      expect(b.commands.last, 'play hacker__matrix');
      expect(b.uploaded['hacker__matrix'], await link.library.bytes('hacker__matrix'));
      expect(b.writes.every((w) => w.length <= 182), isTrue);            // MTU - 3
      expect(link.names, contains('hacker__matrix'));
      expect(link.state!.current, 'hacker__matrix');
      expect(link.uploading, isNull);
    });

    test('a full buddy deletes other themes first, least recently played, never what plays or cycles', () async {
      final b = FakeBuddy(names: ['face_happy', 'face_sleepy', 'xmas__santa', 'bear__honey', 'robot__boot', 'claude__done']);
      b.freeKb = 4;
      for (final n in b.names) {
        b.sizes[n] = 6;
      }
      b.current = 'robot__boot';
      b.cycling = false;
      b.cycleList = 'face_sleepy';
      final link = _link([b])
        ..library = lib({for (final n in b.names) n: 6000, 'hacker__typing': 15000})
        ..plays = PlayLog({'bear__honey': 500, 'xmas__santa': 100});
      await link.connect('id');
      await _settle();

      expect(await link.ensureOnBuddy('hacker__typing'), isTrue);       // 15 KB into 4 KB free
      await _settle();
      // xmas and bear are other themes (robot is selected): oldest first
      expect(b.commands.where((c) => c.startsWith('delete')), ['delete xmas__santa', 'delete bear__honey']);
      expect(b.names, containsAll(['face_happy', 'face_sleepy', 'robot__boot', 'claude__done', 'hacker__typing']));
    });

    test('nothing the library could put back: no deletes, a message, no play', () async {
      final b = FakeBuddy();
      b.freeKb = 2;
      final link = _link([b])..library = lib({'hacker__denied': 20000});        // has none of the buddy's
      await link.connect('id');
      await _settle();
      b.commands.clear();
      final notices = <String>[];
      final sub = link.notices.listen(notices.add);

      await link.play('hacker__denied');
      await _settle();

      expect(b.commands, ['upload hacker__denied 20000']);
      expect(notices.single, contains('No room'));
      await sub.cancel();
    });

    test('commands sent during an upload wait for it (they would land in the data)', () async {
      final b = FakeBuddy();
      final link = _link([b])..library = lib({'hacker__matrix': 9000});
      await link.connect('id');
      await _settle();
      b.commands.clear();

      final up = link.play('hacker__matrix');
      await Future<void>.delayed(Duration.zero);
      link.setBrightness(30);
      await up;
      await _settle();

      // (the new count also fetches the names again)
      expect(b.commands.where((c) => c != 'names'), ['upload hacker__matrix 9000', 'play hacker__matrix', 'brightness 30']);
      expect(b.brightness, 30);
    });

    test('a built-in animation the buddy refuses to delete is skipped', () async {
      final b = FakeBuddy(names: ['face_happy', 'xmas__santa', 'xmas__lights']);
      b.freeKb = 0;
      b.builtin.add('xmas__lights');
      b.sizes['xmas__santa'] = 6;
      final link = _link([b])..library = lib({'xmas__santa': 6000, 'xmas__lights': 6000, 'face_wink': 4000});
      await link.connect('id');
      await _settle();

      expect(await link.ensureOnBuddy('face_wink'), isTrue);
      expect(b.commands.where((c) => c.startsWith('delete')), ['delete xmas__lights', 'delete xmas__santa']);
    });
  });
}
