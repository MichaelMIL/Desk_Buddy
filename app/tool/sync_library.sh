#!/bin/sh
# Packs the current animations into the app (assets/library) before every build. The Xcode build
# phases (ios: Run Script, macos: Flutter Assemble) and the Gradle build (android) run it, so
# `flutter run`, `flutter build` and Xcode / Android Studio builds all get every animation the
# simulator has. The export (sim/test/library.sh --app: headless Chrome, about a minute) runs only
# when an animation or the simulator's renderer/encoder changed since the last one; otherwise this
# returns at once. It never fails the build: without Chrome or sim/ the app keeps what it had.
#   DESK_BUDDY_SKIP_LIBRARY=1   skip it
#   tool/sync_library.sh --force   export even if nothing changed
APP="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(dirname "$APP")"
OUT="$APP/assets/library"
STAMP="$APP/.dart_tool/desk_buddy_library.sha"
[ "${DESK_BUDDY_SKIP_LIBRARY:-}" = 1 ] && exit 0
[ -d "$REPO/sim/animations" ] || { echo "warning: no sim/ next to app/; the animation library is not updated"; exit 0; }
# the export's inputs: every animation, and the simulator code that renders and encodes them
FP=$(cd "$REPO/sim" && cat animations/*.js lib/*.js index.html test/export_all.html test/library.sh serve.py tools/*.py 2>/dev/null \
     | shasum | cut -d' ' -f1)
if [ "$1" != "--force" ] && [ -f "$OUT/index.json" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$FP" ]; then
  exit 0
fi
echo "Animation library: the simulator's animations changed; exporting them all into the app…"
if "$REPO/sim/test/library.sh" --app; then
  mkdir -p "$(dirname "$STAMP")" && echo "$FP" > "$STAMP"
  echo "Animation library: $(ls "$OUT" | grep -c '\.dba') animations packed"
else
  echo "warning: exporting the animation library failed (Chrome missing?); the app keeps the animations it had" >&2
fi
exit 0
