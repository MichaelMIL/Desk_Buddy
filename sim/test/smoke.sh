#!/bin/sh
# Headless browser smoke test: serves sim/, loads test/smoke.html in Chrome,
# prints the report. Needs Google Chrome.
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
[ -n "$CHROME" ] || { echo "Chrome not found; set CHROME=/path/to/chrome"; exit 1; }
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
TMP=$(mktemp -d)
"$CHROME" --headless=new --disable-gpu --no-sandbox --user-data-dir="$TMP" \
  --virtual-time-budget=60000 --dump-dom "http://127.0.0.1:$PORT/test/smoke.html" 2>/dev/null \
  | sed -n '/<pre id="result">/,/<\/pre>/p' | sed 's/<[^>]*>//g' | tee "$TMP/report.txt"
grep -q "SMOKE OK" "$TMP/report.txt"
