import 'dart:async';

import 'package:flutter/material.dart';

import 'buddy_link.dart';
import 'saved_device.dart';
import 'screens/connecting_screen.dart';
import 'screens/control_screen.dart';
import 'screens/scan_screen.dart';

void main() => runApp(const DeskBuddyApp());

/// Colors of the simulator's remote page (sim/remote.html).
const accent = Color(0xFF4FB3FF);
const _darkBg = Color(0xFF15171A);
const _darkCard = Color(0xFF1F2227);

ThemeData buildTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  var scheme = ColorScheme.fromSeed(seedColor: accent, brightness: brightness);
  if (dark) {
    scheme = scheme.copyWith(
      primary: accent,
      onPrimary: Colors.black,
      surface: _darkBg,
      surfaceContainerLowest: const Color(0xFF101214),
      surfaceContainerLow: _darkCard,
      surfaceContainer: _darkCard,
      surfaceContainerHigh: const Color(0xFF272B31),
      surfaceContainerHighest: const Color(0xFF2E333A),
    );
  }
  return ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor: scheme.surface,
    cardTheme: CardThemeData(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: scheme.surfaceContainerLow,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
    ),
    appBarTheme: AppBarTheme(backgroundColor: scheme.surface, scrolledUnderElevation: 0),
    chipTheme: const ChipThemeData(showCheckmark: false),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}

class DeskBuddyApp extends StatefulWidget {
  const DeskBuddyApp({super.key, this.link});

  /// For tests; the app makes its own otherwise.
  final BuddyLink? link;

  @override
  State<DeskBuddyApp> createState() => _DeskBuddyAppState();
}

class _DeskBuddyAppState extends State<DeskBuddyApp> {
  late final BuddyLink link = widget.link ?? BuddyLink();
  final _messenger = GlobalKey<ScaffoldMessengerState>();
  StreamSubscription<String>? _notices;
  AppLifecycleListener? _life;
  SavedDevice? _saved;

  @override
  void initState() {
    super.initState();
    link.onConnected = (id, name) {
      SavedDevice.save(id, name);
      if (mounted) setState(() => _saved = SavedDevice(id, name));
    };
    _notices = link.notices.listen((text) {
      _messenger.currentState
        ?..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(text)));
    });
    // Back from the background with a dropped link: try again right away.
    _life = AppLifecycleListener(onResume: () {
      if (link.phase == LinkPhase.lost && !link.reconnecting) link.reconnect();
    });
    if (widget.link == null) {
      SavedDevice.load().then((s) {
        if (!mounted) return;
        setState(() => _saved = s);
        if (s != null && link.phase == LinkPhase.idle) link.connect(s.id, name: s.name);
      });
    }
  }

  Future<void> _forget() async {
    await SavedDevice.forget();
    setState(() => _saved = null);
    await link.disconnect();
  }

  @override
  void dispose() {
    _notices?.cancel();
    _life?.dispose();
    if (widget.link == null) link.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Desk Buddy',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: _messenger,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: ThemeMode.system,
      home: ListenableBuilder(
        listenable: link,
        builder: (context, _) {
          final Widget screen = switch (link.phase) {
            LinkPhase.idle => ScanScreen(link: link, saved: _saved, onForget: _forget),
            LinkPhase.connecting || LinkPhase.pairing => ConnectingScreen(link: link),
            LinkPhase.ready || LinkPhase.lost => ControlScreen(link: link, onForget: _forget),
          };
          return AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            child: KeyedSubtree(key: ValueKey(screen.runtimeType), child: screen),
          );
        },
      ),
    );
  }
}
