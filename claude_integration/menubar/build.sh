#!/bin/sh
# Builds "Buddy Bridge.app", the menu bar app for the Claude Code bridge, into menubar/build/.
#   claude_integration/menubar/build.sh             build
#   claude_integration/menubar/build.sh --install   build, copy to ~/Applications and start it
set -e
cd "$(dirname "$0")"
swift build -c release --product BuddyBar
BIN="$(swift build -c release --show-bin-path)/BuddyBar"
APP="build/Buddy Bridge.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/BuddyBar"
cp Info.plist "$APP/Contents/Info.plist"
codesign --force --sign - "$APP"          # ad hoc: enough to run on this Mac
echo "built $(pwd)/$APP"
if [ "$1" = "--install" ]; then
  mkdir -p "$HOME/Applications"
  pkill -x BuddyBar 2>/dev/null || true
  rm -rf "$HOME/Applications/Buddy Bridge.app"
  cp -R "$APP" "$HOME/Applications/"
  open "$HOME/Applications/Buddy Bridge.app"
  echo "installed $HOME/Applications/Buddy Bridge.app (running; the icon is in the menu bar)"
fi
