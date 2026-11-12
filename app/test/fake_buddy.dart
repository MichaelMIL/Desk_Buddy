import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:desk_buddy/transport.dart';

/// A buddy in memory that answers like the firmware (hardware/src/main.cpp,
/// ble.cpp): commands joined at the newline, replies split into MTU - 3
/// byte notifications, state notifications cut off at MTU - 3 bytes,
/// reads refused until paired.
class FakeBuddy implements BuddyTransport {
  FakeBuddy({
    this.mtu = 185,
    this.readsBeforePaired = 0,
    this.dropWhilePairing = false,
    List<String>? names,
  }) : names = names ??
            [
              'bear__honey',
              'clock',
              'face_happy',
              'face_sleepy',
              'robot__boot',
              'robot__error',
              'xmas__santa',
            ];

  @override
  int mtu;

  /// State reads refused before the "user types the code".
  int readsBeforePaired;

  /// Hang up during pairing, as after a wrong code.
  bool dropWhilePairing;

  List<String> names;
  String current = 'cycle';
  bool cycling = true;
  bool screen = true;
  int brightness = 60;
  String theme = 'robot';
  int speed = 100, loops = 3, rotation = 0;
  String cycleList = '';

  /// Every command line received, in order.
  final commands = <String>[];

  /// Every chunk written, for checking the MTU split.
  final writes = <List<int>>[];
  int reads = 0;
  bool opened = false, closed = false;

  final _replies = StreamController<List<int>>.broadcast(sync: true);
  final _state = StreamController<List<int>>.broadcast(sync: true);
  final _lost = Completer<void>();
  final _rx = <int>[];

  @override
  Stream<List<int>> get replies => _replies.stream;
  @override
  Stream<List<int>> get stateValues => _state.stream;
  @override
  Future<void> get lost => _lost.future;

  String get stateJson => jsonEncode({
        'current': current,
        'cycling': cycling,
        'screen': screen,
        'brightness': brightness,
        'theme': theme,
        'count': names.length,
      });

  @override
  Future<void> open({Duration timeout = const Duration(seconds: 15)}) async {
    opened = true;
  }

  @override
  Future<List<int>> readState({Duration timeout = const Duration(seconds: 30)}) async {
    reads++;
    if (readsBeforePaired > 0) {
      readsBeforePaired--;
      if (dropWhilePairing) drop();
      throw const LinkError('not paired yet');
    }
    final v = utf8.encode(stateJson);
    // A read fires the value event too (as in Web Bluetooth), delivered later
    // like a platform event, never from inside another event.
    scheduleMicrotask(() => _state.add(v));
    return v;
  }

  @override
  Future<void> write(List<int> bytes) async {
    if (closed) throw const LinkError('closed');
    writes.add(bytes);
    for (final b in bytes) {
      if (b == 0x0a) {
        final line = utf8.decode(_rx);
        _rx.clear();
        commands.add(line);
        _run(line);
      } else {
        _rx.add(b);
      }
    }
  }

  @override
  Future<void> close() async {
    closed = true;
  }

  /// The link drops (buddy rebooted, out of range).
  void drop() {
    if (!_lost.isCompleted) _lost.complete();
  }

  /// Sends a state notification, cut to MTU - 3 bytes as on the device.
  void notifyState() {
    final v = utf8.encode(stateJson);
    _state.add(v.sublist(0, min(v.length, mtu - 3)));
  }

  void reply(String text) {
    final bytes = utf8.encode('$text\n');
    final piece = mtu - 3;
    for (var i = 0; i < bytes.length; i += piece) {
      _replies.add(bytes.sublist(i, min(i + piece, bytes.length)));
    }
  }

  void _run(String line) {
    final sp = line.indexOf(' ');
    final cmd = sp < 0 ? line : line.substring(0, sp);
    final arg = sp < 0 ? '' : line.substring(sp + 1).trim();
    switch (cmd) {
      case 'names':
        reply('names ${names.join(',')}');
      case 'state':
        reply('state $stateJson');
      case 'status':
        reply("animation: $current${cycling ? ' (cycling)' : ''}, theme '$theme', screen ${screen ? 'on' : 'off'}, "
            "brightness $brightness%, rotation $rotation, speed $speed%, loops $loops, cycle list '$cycleList', frames rendered 42");
        reply('name: Desk Buddy (http://desk-buddy.local/), setup AP open');
        reply('wifi: connected, 192.168.1.20');
        reply('mqtt: disabled (:1883, prefix deskbuddy/abc123)');
        reply('bluetooth: connected, paired');
        reply('device id: abc123, free heap: 195000, store: ${names.length} animations, 520 KB free');
      case 'play':
        if (arg == 'cycle') {
          current = 'cycle';
          cycling = true;
        } else if (names.contains(arg)) {
          current = arg;
          cycling = false;
        } else {
          reply("no animation named '$arg' (try: list)");
          return;
        }
        notifyState();
        reply('ok');
      case 'cycle':
        if (arg.isNotEmpty) {
          cycleList = arg == 'all' ? '' : arg;
          reply("cycle list '$cycleList'");
        }
        current = 'cycle';
        cycling = true;
        notifyState();
      case 'screen':
        screen = arg == 'on';
        notifyState();
        reply('ok');
      case 'brightness':
        final v = int.tryParse(arg) ?? 0;
        if (v >= 10 && v <= 100) brightness = v;
        notifyState();
        reply('brightness $brightness%');
      case 'theme':
        theme = arg == 'none' ? '' : arg;
        notifyState();
        reply('ok');
      case 'speed':
        final v = int.tryParse(arg) ?? 0;
        if (v >= 25 && v <= 400) speed = v;
        reply('speed $speed%');
      case 'loops':
        final v = int.tryParse(arg) ?? 0;
        if (v >= 1 && v <= 50) loops = v;
        reply('loops $loops');
      case 'rotation':
        rotation = (int.tryParse(arg) ?? 0) & 3;
        reply('rotation $rotation');
      case 'next':
        notifyState();
        reply('ok');
      case 'wifi' || 'delete' || 'reset' || 'reboot' || 'ble':
        reply('$cmd: not available over Bluetooth (use USB serial or the web page)');
      default:
        reply('commands: names | state | list | play <name>|cycle | next | ...');
    }
  }
}
