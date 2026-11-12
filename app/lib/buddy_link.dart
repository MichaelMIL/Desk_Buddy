/// Connection controller: connects and pairs, keeps the buddy's state and
/// animation names current, sends commands in order, and reconnects after a
/// dropped link. The screens listen to it (it is a [ChangeNotifier]).
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';

import 'protocol.dart';
import 'transport.dart';

enum LinkPhase {
  /// Not connected; the scan screen shows.
  idle,

  /// Connecting and discovering the service.
  connecting,

  /// Connected, but the state cannot be read yet: the buddy shows a 6-digit
  /// code and the phone's pairing prompt asks for it (first time only).
  pairing,

  /// Paired, state read; commands work.
  ready,

  /// The link dropped while ready. [BuddyLink.reconnecting] tells whether a
  /// reconnect is under way.
  lost,
}

enum LogKind { sent, reply, error, info }

class LogLine {
  LogLine(this.text, this.kind) : time = DateTime.now();
  final String text;
  final LogKind kind;
  final DateTime time;
}

class BuddyLink extends ChangeNotifier {
  BuddyLink({
    BuddyTransport Function(String deviceId)? transportFactory,
    this.pairingTimeout = const Duration(seconds: 90),
    this.reconnectDelays = const [Duration(seconds: 1), Duration(seconds: 3), Duration(seconds: 8)],
    this.retryDelay = const Duration(seconds: 1),
    this.pairingHintAfter = const Duration(milliseconds: 1500),
  }) : _factory = transportFactory ?? BleTransport.new;

  final BuddyTransport Function(String deviceId) _factory;

  /// How long to wait for the user to type the pairing code.
  final Duration pairingTimeout;

  /// Waits before each automatic reconnect after a dropped link.
  final List<Duration> reconnectDelays;

  /// Pause between state reads while waiting for pairing.
  final Duration retryDelay;

  /// How long a state read may take before the screen explains pairing (a
  /// bonded phone gets through in well under a second).
  final Duration pairingHintAfter;

  LinkPhase phase = LinkPhase.idle;
  bool reconnecting = false;
  String? deviceId;
  String deviceName = '';

  /// Why the last connect failed or the link dropped.
  String? error;

  BuddyState? state;
  List<String> names = const [];
  PlaybackSettings settings = const PlaybackSettings();

  /// The latest `status` report, one entry per line.
  List<String> statusLines = const [];

  final List<LogLine> log = [];
  static const _maxLog = 400;

  final _notices = StreamController<String>.broadcast();

  /// Replies worth a snackbar: refusals and mistakes.
  Stream<String> get notices => _notices.stream;

  /// Called after every successful connect, to remember the buddy.
  void Function(String deviceId, String name)? onConnected;

  BuddyTransport? _t;
  final _subs = <StreamSubscription<dynamic>>[];
  int _session = 0;
  Future<void> _writes = Future.value();
  final _lines = LineAssembler();
  bool _namesPending = false;
  bool _stateReading = false;
  int _quietStatus = 0;
  List<String>? _statusCapture;
  Timer? _reconnectTimer;
  bool _disposed = false;

  bool get isReady => phase == LinkPhase.ready;

  /// Connects to [id], waiting for pairing if needed. Returns whether it
  /// worked; on failure [error] says why and the phase is back to idle.
  Future<bool> connect(String id, {String? name}) async {
    _reconnectTimer?.cancel();
    reconnecting = false;
    final session = await _restart(id, name);
    _setPhase(LinkPhase.connecting);
    try {
      await _attach(session, pairingTimeout, showPairing: true);
      return true;
    } on _Superseded {
      return false;
    } catch (e) {
      if (session != _session) return false;
      await _teardown();
      error = _describe(e);
      _info('connect failed: $error');
      _setPhase(LinkPhase.idle);
      return false;
    }
  }

  /// Retries the current buddy after a dropped link, keeping the control
  /// screen up. A bonded phone re-encrypts in under a second, so this does
  /// not wait for a pairing prompt.
  Future<bool> reconnect() async {
    final id = deviceId;
    if (id == null) return false;
    _reconnectTimer?.cancel();
    final session = await _restart(id, deviceName);
    reconnecting = true;
    _setPhase(LinkPhase.lost);
    try {
      await _attach(session, const Duration(seconds: 10), showPairing: false);
      return true;
    } on _Superseded {
      return false;
    } catch (e) {
      if (session != _session) return false;
      await _teardown();
      error = _describe(e);
      reconnecting = false;
      _setPhase(LinkPhase.lost);
      return false;
    }
  }

  /// Hangs up and goes back to the scan screen.
  Future<void> disconnect() async {
    _reconnectTimer?.cancel();
    _session++;
    reconnecting = false;
    error = null;
    await _teardown();
    _info('disconnected');
    _setPhase(LinkPhase.idle);
  }

  // ---- commands ------------------------------------------------------------

  /// Sends one command line. Commands go out in order, one write at a time,
  /// in pieces of MTU - 3 bytes (the buddy joins them at the newline).
  Future<void> send(String command, {bool echo = false}) {
    final cmd = command.replaceAll(RegExp(r'[\r\n]'), ' ').trim();
    if (cmd.isEmpty) return Future.value();
    if (echo) _log('> $cmd', LogKind.sent);
    if (cmd.length > maxCommandLength) {
      _notice('Command too long (at most $maxCommandLength characters)');
      return Future.value();
    }
    final t = _t;
    if (t == null || phase != LinkPhase.ready) {
      _notice('Not connected');
      return Future.value();
    }
    final bytes = utf8.encode('$cmd\n');
    final piece = max(20, t.mtu - 3);
    _writes = _writes.then((_) async {
      for (var i = 0; i < bytes.length; i += piece) {
        await t.write(bytes.sublist(i, min(i + piece, bytes.length)));
      }
    }).catchError((Object e) {
      if (identical(t, _t)) _log('! $cmd: ${_describe(e)}', LogKind.error);
    });
    return _writes;
  }

  Future<void> play(String name) => send('play $name');
  Future<void> cycle() => send('play cycle');
  Future<void> next() => send('next');
  Future<void> setScreen(bool on) {
    _patchState(screen: on);
    return send('screen ${on ? 'on' : 'off'}');
  }

  Future<void> setBrightness(int percent) {
    final v = percent.clamp(brightnessRange.min, brightnessRange.max);
    _patchState(brightness: v);
    return send('brightness $v');
  }

  Future<void> setTheme(String theme) {
    _patchState(theme: theme);
    return send('theme ${theme.isEmpty ? 'none' : theme}');
  }

  Future<void> setSpeed(int percent) =>
      send('speed ${percent.clamp(speedRange.min, speedRange.max)}');
  Future<void> setLoops(int loops) => send('loops ${loops.clamp(loopsRange.min, loopsRange.max)}');
  Future<void> setRotation(int quarterTurns) => send('rotation ${quarterTurns & 3}');

  /// Sets which faces cycle (empty: all) and starts cycling. Returns false
  /// when the list does not fit in one command.
  bool setCycleList(List<String> faces) {
    final cmd = cycleCommand(faces);
    if (cmd == null) return false;
    send(cmd);
    return true;
  }

  /// Asks for a fresh `status` report into [statusLines], without logging it.
  Future<void> refreshStatus() {
    if (!isReady) return Future.value();
    _quietStatus++;
    return send('status');
  }

  void clearLog() {
    log.clear();
    notifyListeners();
  }

  // ---- connection internals ---------------------------------------------------

  /// Drops any current link and starts a new session for [id].
  Future<int> _restart(String id, String? name) async {
    final session = ++_session;
    await _teardown();
    deviceId = id;
    if (name != null && name.isNotEmpty) deviceName = name;
    if (deviceName.isEmpty) deviceName = 'Desk Buddy';
    error = null;
    return session;
  }

  Future<void> _attach(int session, Duration stateWait, {required bool showPairing}) async {
    final t = _factory(deviceId!);
    _t = t;
    var dropped = false;
    _subs.add(t.replies.listen(_onReplyBytes));
    _subs.add(t.stateValues.listen(_onStateBytes));
    unawaited(t.lost.then((_) {
      dropped = true;
      if (session == _session && phase == LinkPhase.ready) _onLost();
    }));

    _info('connecting to $deviceName');
    await t.open();
    if (session != _session) throw const _Superseded();

    // The buddy asks to pair as soon as a phone connects. Until the code from
    // its screen is typed into the phone's prompt, the state read is refused
    // (Android) or held (iOS). Keep trying; a bonded phone gets through at once.
    final hint = showPairing
        ? Timer(pairingHintAfter, () {
            if (session == _session && phase == LinkPhase.connecting) _setPhase(LinkPhase.pairing);
          })
        : null;
    final BuddyState first;
    try {
      first = await _readStateUntilPaired(t, session, stateWait, () => dropped);
    } finally {
      hint?.cancel();
    }

    state = first;
    reconnecting = false;
    error = null;
    _info('connected, MTU ${t.mtu}');
    _setPhase(LinkPhase.ready);
    onConnected?.call(deviceId!, deviceName);
    _setState(first); // asks for names: the list is empty
    refreshStatus(); // speed, loops, rotation and the cycle list
  }

  Future<BuddyState> _readStateUntilPaired(
      BuddyTransport t, int session, Duration limit, bool Function() dropped) async {
    final deadline = DateTime.now().add(limit);
    Object? last;
    while (true) {
      if (session != _session) throw const _Superseded();
      if (dropped()) {
        throw const LinkError('The buddy closed the connection. If its screen says '
            '"pairing failed", the code was wrong or the prompt was cancelled: connect again for a new code.');
      }
      final left = deadline.difference(DateTime.now());
      if (left <= Duration.zero) {
        throw LinkError(last == null
            ? 'Pairing timed out.'
            : 'Pairing did not finish in time (${_describe(last)}). If the phone has '
                'an old pairing with this buddy, remove it in Bluetooth settings and try again.');
      }
      try {
        final wait = left < const Duration(seconds: 30) ? left : const Duration(seconds: 30);
        final v = await Future.any([
          t.readState(timeout: wait),
          t.lost.then<List<int>>((_) => throw const LinkError('connection closed')),
        ]);
        final s = BuddyState.tryParse(utf8.decode(v, allowMalformed: true));
        if (s != null) return s;
        last = 'unreadable state';
      } catch (e) {
        last = e;
      }
      await Future<void>.delayed(retryDelay);
    }
  }

  void _onLost() {
    _info('connection lost');
    unawaited(_teardown());
    error = 'Connection lost';
    reconnecting = true;
    _setPhase(LinkPhase.lost);
    _scheduleReconnect(0);
  }

  void _scheduleReconnect(int attempt) {
    if (attempt >= reconnectDelays.length) {
      reconnecting = false;
      notifyListeners();
      return;
    }
    _reconnectTimer = Timer(reconnectDelays[attempt], () async {
      if (phase != LinkPhase.lost) return;
      final ok = await reconnect();
      if (!ok && phase == LinkPhase.lost && !_disposed) {
        reconnecting = true; // keep the banner on "Reconnecting…" between tries
        notifyListeners();
        _scheduleReconnect(attempt + 1);
      }
    });
  }

  Future<void> _teardown() async {
    final t = _t;
    _t = null;
    for (final s in _subs) {
      await s.cancel();
    }
    _subs.clear();
    _lines.reset();
    _writes = Future.value();
    _namesPending = false;
    _stateReading = false;
    _quietStatus = 0;
    _statusCapture = null;
    if (t != null) {
      try {
        await t.close();
      } catch (_) {}
    }
  }

  // ---- incoming --------------------------------------------------------------

  void _onStateBytes(List<int> value) {
    final s = BuddyState.tryParse(utf8.decode(value, allowMalformed: true));
    if (s != null) {
      if (phase == LinkPhase.ready) _setState(s);
      return;
    }
    // Cut off (a notification carries MTU - 3 bytes): read the whole value,
    // once. A read's own value comes back through here too, so never start
    // another read while one is running (hardware/BLE.md, "read loop").
    final t = _t;
    if (t == null || _stateReading || phase != LinkPhase.ready) return;
    _stateReading = true;
    t.readState().then((v) {
      final full = BuddyState.tryParse(utf8.decode(v, allowMalformed: true));
      if (full != null && identical(t, _t)) _setState(full);
    }).catchError((Object _) {}).whenComplete(() => _stateReading = false);
  }

  void _setState(BuddyState s) {
    state = s;
    if (names.length != s.count && !_namesPending && phase == LinkPhase.ready) {
      _namesPending = true; // the list changed (upload or delete): fetch it again
      send('names');
    }
    notifyListeners();
  }

  void _patchState({bool? screen, int? brightness, String? theme}) {
    final s = state;
    if (s == null) return;
    state = BuddyState(
      current: s.current,
      cycling: s.cycling,
      screen: screen ?? s.screen,
      brightness: brightness ?? s.brightness,
      theme: theme ?? s.theme,
      count: s.count,
    );
    notifyListeners();
  }

  void _onReplyBytes(List<int> bytes) {
    for (final line in _lines.add(bytes)) {
      _onLine(line);
    }
  }

  void _onLine(String line) {
    final reply = parseReply(line);

    // status: keep the report; hide the ones the app asked for itself
    if (reply is SettingsReply && line.startsWith('animation: ')) _statusCapture = [];
    final capture = _statusCapture;
    var quiet = false;
    if (capture != null) {
      capture.add(line);
      quiet = _quietStatus > 0;
      if (capture.length > 8) {
        _statusCapture = null; // the report's last line never came
        _quietStatus = 0;
      } else if (isLastStatusLine(line)) {
        statusLines = List.unmodifiable(capture);
        _statusCapture = null;
        if (_quietStatus > 0) _quietStatus--;
      }
    }

    switch (reply) {
      case OkReply():
        break;
      case NamesReply(:final names):
        this.names = List.unmodifiable(names);
        _namesPending = false;
      case StateReply(:final state):
        _setState(state);
      case SettingsReply(:final settings):
        this.settings = this.settings.merge(settings);
        if (!quiet) _log(line, LogKind.reply);
      case ErrorReply():
        _log(line, LogKind.error);
        _notice(line);
      case TextReply():
        if (!quiet) _log(line, LogKind.reply);
    }
    notifyListeners();
  }

  // ---- helpers ---------------------------------------------------------------

  void _setPhase(LinkPhase p) {
    phase = p;
    notifyListeners();
  }

  void _log(String text, LogKind kind) {
    log.add(LogLine(text, kind));
    if (log.length > _maxLog) log.removeRange(0, log.length - _maxLog);
    notifyListeners();
  }

  void _info(String text) => _log(text, LogKind.info);

  void _notice(String text) {
    if (!_notices.isClosed) _notices.add(text);
  }

  static String _describe(Object e) {
    if (e is LinkError) return e.message;
    if (e is TimeoutException) return 'timed out';
    final s = e.toString();
    return s.length > 200 ? '${s.substring(0, 200)}…' : s;
  }

  @override
  void notifyListeners() {
    if (!_disposed) super.notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _reconnectTimer?.cancel();
    _session++;
    unawaited(_teardown());
    _notices.close();
    super.dispose();
  }
}

/// A newer connect or a disconnect replaced this attempt.
class _Superseded implements Exception {
  const _Superseded();
}
