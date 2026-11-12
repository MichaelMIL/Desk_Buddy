#!/bin/sh
# Export every animation into the local library (~/.config/desk-buddy/library, or
# $DESK_BUDDY_LIBRARY): the files the Claude Code bridge, the remote page and the phone app
# upload when they play an animation that is no longer on the buddy.
#   sim/test/library.sh          # (re)build the library
#   sim/test/library.sh --app    # and copy it into app/assets/library for the phone app
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
[ -n "$CHROME" ] || { echo "Chrome not found; set CHROME=/path/to/chrome"; exit 1; }
LIB="${DESK_BUDDY_LIBRARY:-$HOME/.config/desk-buddy/library}"
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
python3 serve.py "$PORT" >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
TMP=$(mktemp -d)
mkdir -p "$LIB" && touch "$TMP/started"
"$CHROME" --headless=new --disable-gpu --no-sandbox --user-data-dir="$TMP" \
  --virtual-time-budget=300000 --dump-dom "http://127.0.0.1:$PORT/test/export_all.html?library=1" 2>/dev/null \
  | sed -n '/<pre id="result">/,/<\/pre>/p' | sed 's/<[^>]*>//g' > "$TMP/report.txt"
grep -c 'library/' "$TMP/report.txt" | xargs printf '%s animations exported to '; echo "$LIB"
grep 'FAILED' "$TMP/report.txt" || true
grep -q "EXPORT OK" "$TMP/report.txt"
# the sim is the source: drop files it did not write this time (renamed or deleted animations)
STALE=$(find "$LIB" -maxdepth 1 \( -name '*.dbal' -o -name '*.dbaz' -o -name '*.dba' \) ! -newer "$TMP/started")
if [ -n "$STALE" ]; then
  echo "$STALE" | xargs rm -f
  echo "removed $(echo "$STALE" | wc -l | tr -d ' ') stale: $(echo "$STALE" | xargs -n1 basename | tr '\n' ' ')"
fi
DESK_BUDDY_LIBRARY="$LIB" python3 -c 'import serve; serve.library_index()'
if [ "$1" = "--app" ]; then
  DEST=../app/assets/library
  mkdir -p "$DEST"
  rm -f "$DEST"/*.dbal "$DEST"/*.dbaz "$DEST"/*.dba
  cp "$LIB"/*.dbal "$LIB"/index.json "$DEST"/ 2>/dev/null || true
  cp "$LIB"/*.dbaz "$DEST"/ 2>/dev/null || true
  echo "copied into app/assets/library ($(du -sh "$DEST" | cut -f1))"
fi
