import 'dart:convert';

import 'package:desk_buddy/protocol.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('BuddyState', () {
    test('parses the state JSON from hardware/BLE.md', () {
      final s = BuddyState.tryParse(
          '{"current":"face_happy","cycling":false,"screen":true,"brightness":60,"theme":"bunny","count":37}');
      expect(s, isNotNull);
      expect(s!.current, 'face_happy');
      expect(s.cycling, isFalse);
      expect(s.screen, isTrue);
      expect(s.brightness, 60);
      expect(s.theme, 'bunny');
      expect(s.count, 37);
    });

    test('a JSON cut off by a small MTU is rejected, not half-read', () {
      const full = '{"current":"face_happy","cycling":false,"screen":true,"brightness":60,"theme":"","count":37}';
      expect(BuddyState.tryParse(full.substring(0, 20)), isNull);
      expect(BuddyState.tryParse('[1,2]'), isNull);
      expect(BuddyState.tryParse('{"current":5}'), isNull);
    });
  });

  group('LineAssembler', () {
    test('joins notifications at the newline', () {
      final a = LineAssembler();
      expect(a.add(utf8.encode('names bear__ho')), isEmpty);
      expect(a.add(utf8.encode('ney,clock\nok\nspe')), ['names bear__honey,clock', 'ok']);
      expect(a.add(utf8.encode('ed 150%\r\n')), ['speed 150%']);
    });

    test('a UTF-8 character split between notifications survives', () {
      final bytes = utf8.encode('theme ✦ x\n');
      final a = LineAssembler();
      final cut = bytes.indexOf(0xe2) + 1; // inside the 3-byte ✦
      expect(a.add(bytes.sublist(0, cut)), isEmpty);
      expect(a.add(bytes.sublist(cut)), ['theme ✦ x']);
    });
  });

  group('parseReply', () {
    test('classifies replies', () {
      expect(parseReply('ok'), isA<OkReply>());
      expect((parseReply('names a,b__c,d') as NamesReply).names, ['a', 'b__c', 'd']);
      expect((parseReply('names') as NamesReply).names, isEmpty);
      expect(
          (parseReply('state {"current":"cycle","cycling":true,"screen":true,"brightness":100,"theme":"","count":3}')
                  as StateReply)
              .state
              .cycling,
          isTrue);
      expect((parseReply('speed 150%') as SettingsReply).settings.speed, 150);
      expect((parseReply('loops 7') as SettingsReply).settings.loops, 7);
      expect((parseReply('rotation 2') as SettingsReply).settings.rotation, 2);
      expect((parseReply("cycle list 'a,b'") as SettingsReply).settings.cycleList, 'a,b');
      expect(parseReply("no animation named 'x' (try: list)"), isA<ErrorReply>());
      expect(parseReply('wifi: not available over Bluetooth (use USB serial or the web page)'), isA<ErrorReply>());
      expect(parseReply('commands: names | state'), isA<ErrorReply>());
      expect(parseReply('brightness 60%'), isA<TextReply>());
      expect(parseReply('wifi: connected, 192.168.50.99'), isA<TextReply>());
    });

    test('reads the playback settings from the first status line (real device output)', () {
      final r = parseReply("animation: cycle (cycling), theme 'robot', screen on, brightness 100%, "
          "rotation 0, speed 100%, loops 3, cycle list '', frames rendered 10819");
      final s = (r as SettingsReply).settings;
      expect(s.rotation, 0);
      expect(s.speed, 100);
      expect(s.loops, 3);
      expect(s.cycleList, '');
      expect(s.cycleNames, isEmpty);
    });

    test('settings merge keeps what a reply does not mention', () {
      const a = PlaybackSettings(speed: 100, loops: 3, rotation: 1, cycleList: 'x,y');
      final b = a.merge(const PlaybackSettings(speed: 200));
      expect([b.speed, b.loops, b.rotation, b.cycleList], [200, 3, 1, 'x,y']);
      expect(b.cycleNames, ['x', 'y']);
    });
  });

  group('names', () {
    final names = ['bear__honey', 'clock', 'face_happy', 'face_in_love', 'robot__boot', 'xmas__santa'];

    test('themes and display names', () {
      expect(themeOf('xmas__santa'), 'xmas');
      expect(themeOf('face_happy'), '');
      expect(niceName('xmas__santa'), 'santa');
      expect(niceName('face_in_love'), 'in love');
      expect(niceName('bouncing_ball'), 'bouncing ball');
      expect(themesIn(names), ['bear', 'robot', 'xmas']);
    });

    test('faces for a theme: common ones plus that theme\'s', () {
      final f = facesFor(names, 'robot');
      expect(f.common, ['clock', 'face_happy', 'face_in_love']);
      expect(f.themed, ['robot__boot']);
      expect(facesFor(names, '').themed, isEmpty);
    });

    test('emoji', () {
      expect(emojiFor('face_happy'), '😊');
      expect(emojiFor('face_in_love'), '😍');
      expect(emojiFor('space__astronaut'), '🧑‍🚀');
      expect(emojiFor('robot__unknown_thing'), '🤖'); // falls back to the theme
      expect(emojiFor('mystery'), '✨');
      expect(emojiFor('cycle'), '🔁');
    });

    test('cycle command respects the 160-character limit', () {
      expect(cycleCommand([]), 'cycle all');
      expect(cycleCommand(['a', 'b']), 'cycle a,b');
      expect(cycleCommand(List.filled(20, 'face_surprised')), isNull);
    });
  });
}
