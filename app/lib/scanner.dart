/// Finds buddies nearby: scans for the desk buddy service UUID and tracks
/// whether Bluetooth is on and allowed.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:universal_ble/universal_ble.dart';

import 'protocol.dart';

class FoundBuddy {
  FoundBuddy(this.id, this.name, this.rssi);
  final String id;
  String name;
  int rssi;
  DateTime seen = DateTime.now();
}

class BuddyScanner extends ChangeNotifier {
  AvailabilityState availability = AvailabilityState.unknown;
  final Map<String, FoundBuddy> found = {};
  bool scanning = false;
  String? error;

  StreamSubscription<BleDevice>? _scanSub;
  StreamSubscription<AvailabilityState>? _availSub;
  Timer? _stopTimer;
  bool _wantScan = false;
  bool _disposed = false;

  static const scanTime = Duration(seconds: 20);

  /// Buddies sorted by signal strength, nearest first.
  List<FoundBuddy> get buddies => found.values.toList()..sort((a, b) => b.rssi.compareTo(a.rssi));

  Future<void> init() async {
    _availSub = UniversalBle.availabilityStream.listen((s) {
      availability = s;
      if (s == AvailabilityState.poweredOn && _wantScan && !scanning) start();
      if (s != AvailabilityState.poweredOn) scanning = false;
      notifyListeners();
    });
    try {
      availability = await UniversalBle.getBluetoothAvailabilityState();
    } catch (_) {}
    notifyListeners();
  }

  /// Scans for [scanTime]. Asks for the Bluetooth permission first (Android
  /// 12+ "Nearby devices", the iOS Bluetooth prompt).
  Future<void> start() async {
    _wantScan = true;
    if (scanning) return;
    error = null;
    try {
      await UniversalBle.requestPermissions();
      availability = await UniversalBle.getBluetoothAvailabilityState();
      if (availability != AvailabilityState.poweredOn) {
        notifyListeners();
        return; // starts when Bluetooth comes on (see init)
      }
      found.clear();
      _scanSub ??= UniversalBle.scanStream.listen(_onResult);
      await UniversalBle.startScan(
        scanFilter: ScanFilter(withServices: [BuddyUuids.service]),
        platformConfig: PlatformConfig(
          android: AndroidOptions(
            legacy: true, // the ESP32 sends legacy (BLE 4) advertisements
            scanMode: AndroidScanMode.lowLatency,
            requestLocationPermission: false,
          ),
        ),
      );
      scanning = true;
      _stopTimer?.cancel();
      _stopTimer = Timer(scanTime, stop);
    } catch (e) {
      scanning = false;
      error = e is UniversalBleException ? e.message : e.toString();
    }
    notifyListeners();
  }

  Future<void> stop() async {
    _wantScan = false;
    _stopTimer?.cancel();
    if (!scanning) return;
    scanning = false;
    try {
      await UniversalBle.stopScan();
    } catch (_) {}
    notifyListeners();
  }

  void _onResult(BleDevice d) {
    final name = (d.name ?? '').isEmpty ? null : d.name;
    final b = found[d.deviceId];
    if (b == null) {
      // The name is in the scan response, which can arrive after the
      // advertisement; until then the entry says "Desk Buddy".
      found[d.deviceId] = FoundBuddy(d.deviceId, name ?? 'Desk Buddy', d.rssi ?? -100);
    } else {
      if (name != null) b.name = name;
      if (d.rssi != null) b.rssi = d.rssi!;
      b.seen = DateTime.now();
    }
    notifyListeners();
  }

  @override
  void notifyListeners() {
    if (!_disposed) super.notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _stopTimer?.cancel();
    _scanSub?.cancel();
    _availSub?.cancel();
    if (scanning) UniversalBle.stopScan().catchError((_) {});
    super.dispose();
  }
}
