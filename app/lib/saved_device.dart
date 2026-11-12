/// Remembers the last buddy, so the app reconnects to it on launch.
library;

import 'package:shared_preferences/shared_preferences.dart';

class SavedDevice {
  const SavedDevice(this.id, this.name);

  /// The platform's id: a MAC address on Android, a per-phone UUID on iOS.
  final String id;
  final String name;

  static const _idKey = 'device_id', _nameKey = 'device_name';

  static Future<SavedDevice?> load() async {
    final p = await SharedPreferences.getInstance();
    final id = p.getString(_idKey);
    return id == null ? null : SavedDevice(id, p.getString(_nameKey) ?? 'Desk Buddy');
  }

  static Future<void> save(String id, String name) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_idKey, id);
    await p.setString(_nameKey, name);
  }

  static Future<void> forget() async {
    final p = await SharedPreferences.getInstance();
    await p.remove(_idKey);
    await p.remove(_nameKey);
  }
}
