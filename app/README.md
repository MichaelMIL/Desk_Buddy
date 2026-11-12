# Desk Buddy app

A phone app (iOS and Android, also builds for macOS) that drives the desk
buddy over Bluetooth LE. It speaks the protocol in
[`hardware/BLE.md`](../hardware/BLE.md): text commands on the Nordic UART
Service and the JSON state characteristic. Flutter, one codebase.

What it does:

- **Finds buddies** by the service UUID (plus any already connected to the
  phone, which do not advertise), remembers the last one and reconnects to it
  on launch.
- **Pairs** the first time: the buddy shows a 6-digit code, the phone's system
  prompt asks for it, and the app waits (up to 90 s) and explains the step.
  Later connections re-encrypt with the stored bond, no code.
- **Remote:** a picture of the round screen with the playing face, cycle /
  next / screen on-off, brightness, the faces (common ones plus the selected
  theme's, as on the device), theme picker, speed, loops per face, rotation,
  and which faces cycle.
- **Long-press a face** to play or delete it.
- **Animations deleted from the buddy come back:** the app carries the
  animation library, shows faces the buddy no longer has (dimmed, with a
  download mark), and uploads one when you play it. When the buddy is full it
  deletes the least recently played animations the library can put back:
  other themes' first; never the one playing, a cycle-list face or a built-in
  one.
- **Buddy settings:** rename, Wi-Fi network (SSID and password, sent over the
  encrypted link), restart. Each restarts the buddy and the app reconnects.
- **Console:** any console command, with the replies. Passwords in `wifi`,
  `mqtt` and `appass` are masked in the log. Errors (unknown animation,
  unknown command, a command the firmware refuses) also show as a message.
- **Device status** (the `status` report: Wi-Fi, MQTT, Bluetooth, memory).
- **Reconnects** by itself after a dropped link or a restart (four tries,
  then a button), and again when the app comes back to the foreground.

Firmware from before full Bluetooth access (playback commands only) still
works for the remote; there the settings and delete answer "not available
over Bluetooth", which the app shows as a message.

## Run it

Needs Flutter 3.44+ (`flutter doctor`). Bluetooth does not work in the iOS
simulator or the Android emulator, so use a real phone.

```sh
cd app
flutter pub get
flutter run                 # picks a connected phone; -d <id> to choose
```

- **iPhone:** open `ios/Runner.xcworkspace` in Xcode once, pick your team
  under Runner › Signing & Capabilities, then `flutter run` (or
  `flutter run --release` to keep it on the phone after unplugging).
- **Android:** `flutter run`, or `flutter build apk --release` and install
  `build/app/outputs/flutter-apk/app-release.apk`. Android 12+ asks for
  "Nearby devices"; older versions ask for location (needed to scan).
- **macOS:** `flutter run -d macos` (asks to allow Bluetooth the first time).

**Every build carries every animation.** Before Flutter bundles the assets,
the iOS and macOS Xcode builds and the Android Gradle build run
`tool/sync_library.sh`. It exports all of the simulator's animations into
`assets/library` (not committed), so the app's faces and themes always match
`sim/animations/`. The export takes about a minute in headless Chrome and runs
only when an animation or the simulator's renderer changed since the last one;
otherwise it adds nothing to the build. It needs Google Chrome; without it the
app keeps the animations it had. `DESK_BUDDY_SKIP_LIBRARY=1` skips it, and
`tool/sync_library.sh --force` exports now.

The buddy accepts one connection at a time. Close the simulator's remote page
or any other app connected to it first.

## Code

| File | Role |
|---|---|
| `lib/protocol.dart` | UUIDs, state JSON, reply lines (split at MTU − 3, joined at the newline), reply parsing, theme and face names, emoji |
| `lib/transport.dart` | `BuddyTransport` interface and its universal_ble implementation: connect, discover, MTU, subscribe, read, write |
| `lib/buddy_link.dart` | The controller: connect and pairing wait, state and names, ordered writes, status, reconnects |
| `lib/scanner.dart` | Scanning by service UUID, Bluetooth on/allowed state |
| `lib/saved_device.dart` | The remembered buddy (shared_preferences) |
| `lib/library.dart` | The bundled animation library and when each animation last played |
| `tool/sync_library.sh` | Run by every build: exports the simulator's animations into `assets/library` when they changed |
| `lib/screens/` | Scan, connecting/pairing, remote and console, buddy settings |
| `lib/widgets/buddy_face.dart` | The round-screen picture |

Protocol rules from `hardware/BLE.md` that the code follows:

- One command per line, at most 160 characters. Writes go out one at a time,
  in pieces of MTU − 3 bytes.
- The state characteristic notifies on every change. A notification cut off by
  a small MTU is completed with one read, and a read is never started from a
  read's own value event (that made the first web remote slow).
- When `count` in the state changes, `names` is fetched again.
- Speed, loops, rotation and the cycle list are not in the state; they come
  from the first line of `status` and from the replies to those commands.

The Bluetooth library is [universal_ble](https://pub.dev/packages/universal_ble)
(BSD-3). flutter_blue_plus 2.x was left out on purpose: its license requires a
paid license for use by for-profit organizations and it sends a build-time
"license ping" with the app name.

## Tests

```sh
flutter test                                          # protocol, controller, screens (no hardware)
flutter test integration_test/device_test.dart -d macos   # against a real buddy nearby
flutter test integration_test/library_test.dart -d macos  # upload from the library, play, delete again
```

`test/fake_buddy.dart` answers like the firmware (replies split at MTU − 3,
cut-off state notifications, refused reads until paired, restarts after
`name` / `wifi` / `reboot`, dropped links, and the older playback-only
firmware), so the controller and the screens are tested without a buddy.

The device test finds the nearest buddy, connects, plays a face, changes
brightness, theme and speed, checks an error reply, drives the real screens,
saves screenshots to the app's temp folder, and puts every setting back. It
sends no `wifi`, `name`, `delete` or `reboot`. It needs this computer paired
with the buddy (or the code typed when asked) and no other client connected:
the buddy stops advertising while one is (`"ble"` in `GET /api/status`).
