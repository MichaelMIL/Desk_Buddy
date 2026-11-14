/// The desk buddy's Bluetooth LE protocol, as described in hardware/BLE.md:
/// text commands on the Nordic UART Service plus a JSON state characteristic.
/// Pure Dart, so it is unit tested without a phone or a buddy.
library;

import 'dart:convert';

/// GATT identifiers (hardware/src/ble.h).
class BuddyUuids {
  static const service = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

  /// Commands from the app (write, paired link only).
  static const rx = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

  /// Replies as text lines (notify, paired link only).
  static const tx = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

  /// The state JSON (read on a paired link, notify).
  static const state = '8b3f2a51-6c0d-4e7a-9b14-d2e5f7a90c36';
}

/// Longest command the buddy accepts, without the newline.
const maxCommandLength = 160;

/// Value ranges the firmware accepts (hardware/src/main.cpp).
const brightnessRange = (min: 10, max: 100);
const speedRange = (min: 25, max: 400);
const loopsRange = (min: 1, max: 50);

/// The state characteristic: `{"current":"face_happy","cycling":false,...}`.
class BuddyState {
  const BuddyState({
    required this.current,
    required this.cycling,
    required this.screen,
    required this.brightness,
    required this.theme,
    required this.count,
    this.battery,
    this.batteryLow = false,
    this.charging = false,
    this.charged = false,
  });

  /// Playing animation, or `cycle` while cycling.
  final String current;
  final bool cycling;
  final bool screen;

  /// 10 to 100 (percent).
  final int brightness;

  /// Selected theme, empty for none.
  final String theme;

  /// Number of stored animations; when it changes the names list is stale.
  final int count;

  /// Battery charge, 0 to 100 (percent); null without a battery, or on
  /// firmware older than the battery measurement (`bat`).
  final int? battery;

  /// The buddy considers the battery low (`batLow`: at 15 % and below until
  /// it is back at 20 %); it shows its low battery face then.
  final bool batteryLow;

  /// On the charger and charging (`chg` "charging"), or done (`chg` "full").
  /// Only with the charger's status pads wired (hardware/README.md).
  final bool charging, charged;

  /// Parses the JSON, or returns null when it is cut off or malformed (a
  /// notification at a small MTU carries only MTU - 3 bytes).
  static BuddyState? tryParse(String json) {
    try {
      final m = jsonDecode(json);
      if (m is! Map<String, dynamic>) return null;
      return BuddyState(
        current: m['current'] as String? ?? '',
        cycling: m['cycling'] as bool? ?? false,
        screen: m['screen'] as bool? ?? true,
        brightness: (m['brightness'] as num?)?.toInt() ?? 100,
        theme: m['theme'] as String? ?? '',
        count: (m['count'] as num?)?.toInt() ?? 0,
        battery: (m['bat'] as num?)?.toInt(),
        batteryLow: m['batLow'] as bool? ?? false,
        charging: m['chg'] == 'charging',
        charged: m['chg'] == 'full',
      );
    } on FormatException {
      return null;
    } on TypeError {
      return null;
    }
  }

  @override
  bool operator ==(Object other) =>
      other is BuddyState &&
      other.current == current &&
      other.cycling == cycling &&
      other.screen == screen &&
      other.brightness == brightness &&
      other.theme == theme &&
      other.count == count &&
      other.battery == battery &&
      other.batteryLow == batteryLow &&
      other.charging == charging &&
      other.charged == charged;

  @override
  int get hashCode =>
      Object.hash(current, cycling, screen, brightness, theme, count, battery, batteryLow, charging, charged);

  @override
  String toString() =>
      'BuddyState($current, cycling: $cycling, screen: $screen, brightness: $brightness, theme: "$theme", count: $count, '
      'battery: ${battery ?? 'none'}${batteryLow ? ' (low)' : ''}${charging ? ' charging' : charged ? ' charged' : ''})';
}

/// Joins TX notifications into lines. Replies are split into notifications of
/// MTU - 3 bytes, so a line (or a UTF-8 character) can span several; lines are
/// cut at the newline and decoded whole.
class LineAssembler {
  final List<int> _pending = [];

  /// Adds one notification and returns the lines it completed.
  List<String> add(List<int> bytes) {
    final lines = <String>[];
    for (final b in bytes) {
      if (b == 0x0a) {
        lines.add(utf8.decode(_pending, allowMalformed: true).replaceAll('\r', ''));
        _pending.clear();
      } else {
        _pending.add(b);
      }
    }
    // A runaway line without a newline would grow forever; the buddy never
    // sends one longer than its 4 KB reply buffer.
    if (_pending.length > 8192) _pending.clear();
    return lines;
  }

  void reset() => _pending.clear();
}

/// Playback settings that are not in the state JSON. They come from the
/// first line of `status` and from the replies to the setting commands.
class PlaybackSettings {
  const PlaybackSettings({this.speed, this.loops, this.rotation, this.cycleList});

  final int? speed;
  final int? loops;
  final int? rotation;

  /// Comma-separated animation names; empty means every face cycles.
  final String? cycleList;

  PlaybackSettings merge(PlaybackSettings o) => PlaybackSettings(
        speed: o.speed ?? speed,
        loops: o.loops ?? loops,
        rotation: o.rotation ?? rotation,
        cycleList: o.cycleList ?? cycleList,
      );

  /// The cycle list as names, empty for "all faces".
  List<String> get cycleNames =>
      (cycleList ?? '').split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
}

/// The pools the buddy picks its battery and charging animations from, by
/// name as in the firmware: `battery_critical…` critical, other `battery_…`
/// low, `charging_plugged…` plugged, `charging_full…` full, other
/// `charging_…` charging.
enum AlertPool {
  low('Battery low', 'about every few minutes while low (15 %)'),
  critical('Battery critical', 'instead, at 5 % and below'),
  plugged('Plugged in', 'when charging starts'),
  charging('While charging', 'about every few minutes'),
  full('Charged', 'once, when the charger is done');

  const AlertPool(this.label, this.when);
  final String label, when;
}

AlertPool? alertPoolOf(String name) {
  if (name.startsWith('battery_critical')) return AlertPool.critical;
  if (name.startsWith('battery_')) return AlertPool.low;
  if (name.startsWith('charging_plugged')) return AlertPool.plugged;
  if (name.startsWith('charging_full')) return AlertPool.full;
  if (name.startsWith('charging_')) return AlertPool.charging;
  return null;
}

/// The animations in each pool, in name order.
Map<AlertPool, List<String>> alertPools(Iterable<String> names) {
  final pools = {for (final p in AlertPool.values) p: <String>[]};
  for (final n in names) {
    final p = alertPoolOf(n);
    if (p != null) pools[p]!.add(n);
  }
  for (final l in pools.values) {
    l.sort();
  }
  return pools;
}

/// When the buddy shows them (`alerts`): [low] about every N minutes while
/// the battery is low, 0 = off; [charging] about every N minutes while
/// charging, 0 = only when plugged in and when charged, -1 = off. The
/// buddy picks at random from the pool and at random times around N.
class AlertSettings {
  const AlertSettings({required this.low, required this.charging});
  final int low, charging;

  static AlertSettings? tryParse(String json) {
    try {
      final m = jsonDecode(json);
      if (m is! Map<String, dynamic>) return null;
      final low = m['low'], charging = m['charging'];
      if (low is! int || charging is! int) return null;
      return AlertSettings(low: low, charging: charging);
    } on FormatException {
      return null;
    }
  }

  @override
  bool operator ==(Object other) => other is AlertSettings && other.low == low && other.charging == charging;

  @override
  int get hashCode => Object.hash(low, charging);
}

/// One reply line from TX, classified.
sealed class Reply {
  const Reply(this.line);
  final String line;
}

/// `ok`: the command ran and had nothing to say.
class OkReply extends Reply {
  const OkReply() : super('ok');
}

/// `names a,b,c`: every stored animation.
class NamesReply extends Reply {
  const NamesReply(super.line, this.names);
  final List<String> names;
}

/// `state {...}`: the state JSON (the reply to `state`).
class StateReply extends Reply {
  const StateReply(super.line, this.state);
  final BuddyState state;
}

/// `alerts {...}`: the battery / charging animation settings.
class AlertsReply extends Reply {
  const AlertsReply(super.line, this.alerts);
  final AlertSettings alerts;
}

/// A line that changes a playback setting: `speed 150%`, `loops 3`,
/// `rotation 1`, `cycle list 'a,b'`, or the first line of `status`.
class SettingsReply extends Reply {
  const SettingsReply(super.line, this.settings);
  final PlaybackSettings settings;
}

/// A refusal or a mistake: unknown animation, a command not allowed over
/// Bluetooth, a bad theme name, or the command list (the answer to an
/// unknown command).
class ErrorReply extends Reply {
  const ErrorReply(super.line);
}

/// Anything else (`list` output, the other `status` lines, `brightness 60%`).
class TextReply extends Reply {
  const TextReply(super.line);
}

final _speedRe = RegExp(r'^speed (\d+)%$');
final _loopsRe = RegExp(r'^loops (\d+)$');
final _rotationRe = RegExp(r'^rotation (\d)$');
final _cycleListRe = RegExp(r"^cycle list '(.*)'$");
final _statusRe = RegExp(
    r"^animation: .*, rotation (\d), speed (\d+)%, loops (\d+), cycle list '([^']*)'");

Reply parseReply(String line) {
  if (line == 'ok') return const OkReply();
  if (line.startsWith('names ') || line == 'names') {
    final list = line.length > 6 ? line.substring(6) : '';
    return NamesReply(line, list.split(',').where((s) => s.isNotEmpty).toList());
  }
  if (line.startsWith('state ')) {
    final s = BuddyState.tryParse(line.substring(6));
    if (s != null) return StateReply(line, s);
  }
  if (line.startsWith('alerts {')) {
    final a = AlertSettings.tryParse(line.substring(7));
    if (a != null) return AlertsReply(line, a);
  }
  RegExpMatch? m;
  if ((m = _speedRe.firstMatch(line)) != null) {
    return SettingsReply(line, PlaybackSettings(speed: int.parse(m!.group(1)!)));
  }
  if ((m = _loopsRe.firstMatch(line)) != null) {
    return SettingsReply(line, PlaybackSettings(loops: int.parse(m!.group(1)!)));
  }
  if ((m = _rotationRe.firstMatch(line)) != null) {
    return SettingsReply(line, PlaybackSettings(rotation: int.parse(m!.group(1)!)));
  }
  if ((m = _cycleListRe.firstMatch(line)) != null) {
    return SettingsReply(line, PlaybackSettings(cycleList: m!.group(1)));
  }
  if ((m = _statusRe.firstMatch(line)) != null) {
    return SettingsReply(
        line,
        PlaybackSettings(
          rotation: int.parse(m!.group(1)!),
          speed: int.parse(m.group(2)!),
          loops: int.parse(m.group(3)!),
          cycleList: m.group(4),
        ));
  }
  if (line.startsWith('no animation named ') ||
      line.contains('not available over Bluetooth') || // firmware before full Bluetooth access
      line.contains('this build has no Wi-Fi') ||
      line.startsWith('theme names are') ||
      line.startsWith('not found or built-in') ||
      line.startsWith('AP password needs') ||
      line.startsWith('error ') ||
      line.startsWith('commands: ')) {
    return ErrorReply(line);
  }
  return TextReply(line);
}

/// The last line `status` prints; the app hides its own `status` up to here.
bool isLastStatusLine(String line) => line.startsWith('device id: ');

/// The device name from the `name:` line of `status`, or null for any other
/// line. The Wi-Fi build prints `name: Desk Buddy (http://desk-buddy.local/),
/// setup AP open`, the build without Wi-Fi `name: Desk Buddy, build without
/// Wi-Fi (Bluetooth + USB only), firmware 2026.11.12c`.
String? deviceNameFromStatus(String line) {
  if (!line.startsWith('name: ')) return null;
  var n = line.substring(6);
  for (final end in const [' (http://', ', build without Wi-Fi', ', setup AP', ', firmware ']) {
    final i = n.indexOf(end);
    if (i >= 0) n = n.substring(0, i);
  }
  n = n.trim();
  return n.isEmpty ? null : n;
}

// ---- settings commands ----------------------------------------------------
// Firmware with full Bluetooth access (hardware/BLE.md, "Commands") runs
// these for a paired device; each saves and reboots the buddy.

/// Longest name that still fits whole in the advertisement.
const maxDeviceNameLength = 29;

/// `name <n>`, or an explanation of what is wrong with [name].
({String? command, String? problem}) nameCommand(String name) {
  final n = name.trim();
  if (n.isEmpty) return (command: null, problem: 'Enter a name.');
  if (n.length > maxDeviceNameLength) {
    return (command: null, problem: 'At most $maxDeviceNameLength characters.');
  }
  if (n.contains(RegExp(r'[\r\n]'))) return (command: null, problem: 'One line only.');
  return (command: 'name $n', problem: null);
}

/// `wifi <ssid> <password>`, or an explanation of what is wrong. A network
/// name with spaces goes in quotes (`wifi "My Home" pass`); the buddy trims
/// the password, so it cannot start or end with a space.
({String? command, String? problem}) wifiCommand(String ssid, String password) {
  if (ssid.isEmpty) return (command: null, problem: 'Enter the network name.');
  if (ssid.contains('"')) {
    return (command: null, problem: 'Network names with a " cannot be set this way; use USB serial.');
  }
  if (ssid.startsWith(' ') || ssid.endsWith(' ')) {
    return (command: null, problem: 'The network name starts or ends with a space; check it.');
  }
  if (password != password.trim()) {
    return (command: null, problem: 'The password starts or ends with a space, which the buddy drops.');
  }
  final net = ssid.contains(' ') ? '"$ssid"' : ssid;
  final cmd = password.isEmpty ? 'wifi $net' : 'wifi $net $password';
  if (cmd.contains(RegExp(r'[\r\n]'))) return (command: null, problem: 'One line only.');
  if (cmd.length > maxCommandLength) return (command: null, problem: 'Name and password are too long.');
  return (command: cmd, problem: null);
}

// ---- animation names ------------------------------------------------------

final _themeRe = RegExp(r'^([a-z0-9]+)__');

/// `xmas__santa` belongs to theme `xmas`; `face_happy` to none ('').
String themeOf(String name) => _themeRe.firstMatch(name)?.group(1) ?? '';

/// `xmas__santa` → `santa`, `face_in_love` → `in love`, `cycle` → `cycle`.
String niceName(String name) => name
    .replaceFirst(_themeRe, '')
    .replaceFirst(RegExp(r'^face_'), '')
    .replaceAll('_', ' ');

/// The themes present in a names list, sorted.
List<String> themesIn(List<String> names) =>
    (names.map(themeOf).where((t) => t.isNotEmpty).toSet().toList()..sort());

/// The faces the buddy shows with [theme] selected: the common ones plus the
/// theme's own. Other themes' faces stay hidden on the device too.
({List<String> common, List<String> themed}) facesFor(List<String> names, String theme) => (
      common: names.where((n) => themeOf(n).isEmpty).toList(),
      themed: theme.isEmpty ? <String>[] : names.where((n) => themeOf(n) == theme).toList(),
    );

const _emoji = <String, String>{
  // faces
  'angry': '😠', 'giggle': '😆', 'happy': '😊', 'in_love': '😍', 'love': '😍',
  'kiss': '😘', 'sleepy': '😴', 'sleep': '😴', 'surprised': '😮', 'wink': '😉',
  'sad': '😢', 'cry': '😢', 'eyes': '👀', 'clock': '🕒', 'confetti': '🎉',
  'ball': '⚽', 'spinner': '🌀',
  // theme faces
  'honey': '🍯', 'roar': '🐻', 'carrot': '🥕', 'hop': '🐰', 'purr': '🐱',
  'yarn': '🧶', 'spark': '✳️', 'beats': '🎧', 'scratch': '💿', 'bat': '🦇',
  'ghost': '👻', 'pumpkin': '🎃', 'coins': '🪙', 'royal': '👑', 'diver': '🤿',
  'fish': '🐠', 'jellyfish': '🪼', 'boot': '🔌', 'compute': '🧮', 'error': '⚠️',
  'alien': '👽', 'astronaut': '🧑‍🚀', 'rocket': '🚀', 'rainbow': '🌈',
  'sparkle': '✨', 'lights': '💡', 'santa': '🎅', 'snowman': '⛄',
  'clover': '🍀', 'pot_of_gold': '💰', 'hat': '🎩', 'cake': '🎂',
  'heart': '💘', 'fire': '🔥', 'skull': '💀', 'sun': '☀️',
  // themes
  'bear': '🐻', 'bee': '🐝', 'birthday': '🎂', 'bunny': '🐰', 'cat': '🐱',
  'claude': '✳️', 'claudecode': '💻', 'devil': '😈', 'dj': '🎧', 'dragon': '🐉',
  'gamer': '🎮', 'halloween': '🎃', 'king': '👑', 'ocean': '🌊', 'robot': '🤖',
  'skeleton': '💀', 'space': '🚀', 'summer': '☀️', 'unicorn': '🦄',
  'valentine': '💘', 'xmas': '🎄', 'stpatricks': '🍀', 'template': '🧩',
  'builder': '👷', 'hacker': '🧑‍💻', 'scientist': '🔬', 'spicy': '🌶️', 'rude': '😜',
};

/// `xmas` → `Xmas`; short names are initials: `dj` → `DJ`; none → `Faces`.
String themeLabel(String theme) => theme.isEmpty
    ? 'Faces'
    : theme.length <= 2
    ? theme.toUpperCase()
    : theme[0].toUpperCase() + theme.substring(1);

/// A decorative emoji for an animation or theme name; the longest matching
/// word wins, then the theme's emoji, then a sparkle.
String emojiFor(String name) {
  if (name == 'cycle') return '🔁';
  final bare = name.replaceFirst(_themeRe, '').replaceFirst(RegExp(r'^face_'), '');
  if (_emoji.containsKey(bare)) return _emoji[bare]!;
  final hit = _emoji.keys.where((k) => bare.contains(k)).fold<String?>(
      null, (best, k) => best == null || k.length > best.length ? k : best);
  if (hit != null) return _emoji[hit]!;
  final theme = themeOf(name);
  return _emoji[theme] ?? '✨';
}

/// `cycle a,b,c` for a cycle list, `cycle all` for every face. Returns null
/// when the command would be longer than the buddy accepts.
String? cycleCommand(List<String> faces) {
  final cmd = faces.isEmpty ? 'cycle all' : 'cycle ${faces.join(',')}';
  return cmd.length <= maxCommandLength ? cmd : null;
}
