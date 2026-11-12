/// The Bluetooth LE link to one buddy: the GATT calls the controller needs,
/// behind an interface so the controller can be tested with a fake.
library;

import 'dart:async';
import 'dart:typed_data';

import 'package:universal_ble/universal_ble.dart';

import 'protocol.dart';

/// A failure with a message meant for the user.
class LinkError implements Exception {
  const LinkError(this.message);
  final String message;
  @override
  String toString() => message;
}

abstract class BuddyTransport {
  /// TX notifications (reply text, in pieces of up to MTU - 3 bytes).
  Stream<List<int>> get replies;

  /// Values of the state characteristic, from notifications and reads.
  Stream<List<int>> get stateValues;

  /// Completes when the link drops without [close] being called.
  Future<void> get lost;

  /// The negotiated ATT MTU (23 until [open] has run).
  int get mtu;

  /// Connects, discovers the service and subscribes to TX and state.
  /// Subscribing works before pairing; reads and writes do not.
  Future<void> open({Duration timeout});

  /// Reads the state characteristic. Refused until the link is paired; on
  /// iOS it can also wait while the pairing prompt is on screen.
  Future<List<int>> readState({Duration timeout});

  /// Writes one chunk to RX, with response.
  Future<void> write(List<int> bytes);

  Future<void> close();
}

/// [BuddyTransport] on the universal_ble plugin (Android, iOS, macOS).
class BleTransport implements BuddyTransport {
  BleTransport(this.deviceId);

  final String deviceId;
  final _replies = StreamController<List<int>>.broadcast();
  final _state = StreamController<List<int>>.broadcast();
  final _lost = Completer<void>();
  final _subs = <StreamSubscription<dynamic>>[];
  BleCharacteristic? _rx, _tx, _st;
  bool _closed = false;

  @override
  int mtu = 23;

  @override
  Stream<List<int>> get replies => _replies.stream;

  @override
  Stream<List<int>> get stateValues => _state.stream;

  @override
  Future<void> get lost => _lost.future;

  @override
  Future<void> open({Duration timeout = const Duration(seconds: 15)}) => _plain(_open(timeout));

  Future<void> _open(Duration timeout) async {
    final device = BleDevice(deviceId: deviceId, name: null);
    _subs.add(UniversalBle.connectionStream(deviceId).listen((connected) {
      if (!connected && !_closed && !_lost.isCompleted) _lost.complete();
    }));
    await device.connect(timeout: timeout);
    final services = await device.discoverServices(timeout: timeout);
    final svc = services.where((s) => BleUuidParser.compareStrings(s.uuid, BuddyUuids.service));
    if (svc.isEmpty) {
      throw StateError('this device has no desk buddy service');
    }
    _rx = svc.first.getCharacteristic(BuddyUuids.rx);
    _tx = svc.first.getCharacteristic(BuddyUuids.tx);
    _st = svc.first.getCharacteristic(BuddyUuids.state);
    // iOS and macOS negotiate the MTU themselves (185 or more); Android
    // starts at 23 and has to ask. Best effort: replies are split anyway.
    try {
      mtu = await device.requestMtu(255);
    } catch (_) {}
    _subs.add(_tx!.onValueReceived.listen(_replies.add));
    _subs.add(_st!.onValueReceived.listen(_state.add));
    await _tx!.notifications.subscribe(timeout: timeout);
    await _st!.notifications.subscribe(timeout: timeout);
  }

  @override
  Future<List<int>> readState({Duration timeout = const Duration(seconds: 30)}) =>
      _plain(_st!.read(timeout: timeout));

  @override
  Future<void> write(List<int> bytes) =>
      _plain(_rx!.write(Uint8List.fromList(bytes), withResponse: true));

  /// Turns the plugin's exceptions into [LinkError]s with readable text.
  static Future<T> _plain<T>(Future<T> f) => f.catchError((Object e) {
        if (e is UniversalBleException) {
          final what = switch (e.code) {
            UniversalBleErrorCode.insufficientAuthentication ||
            UniversalBleErrorCode.insufficientEncryption =>
              'not paired yet',
            UniversalBleErrorCode.connectionTimeout => 'the buddy did not answer (out of range or off?)',
            UniversalBleErrorCode.deviceDisconnected => 'the buddy disconnected',
            _ => e.message.isNotEmpty ? e.message : e.code.name,
          };
          throw LinkError(what);
        }
        throw e;
      });

  @override
  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    for (final s in _subs) {
      await s.cancel();
    }
    try {
      await UniversalBle.disconnect(deviceId, timeout: const Duration(seconds: 5));
    } catch (_) {}
    await _replies.close();
    await _state.close();
  }
}
