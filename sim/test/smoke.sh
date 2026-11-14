#!/bin/sh
# Headless browser smoke test: serves sim/, loads test/smoke.html in Chrome and waits, in
# real time (test/headless.mjs), until it has rendered and exported every animation, then
# prints the report. Passes only if the report's last line is "SMOKE OK". Needs Google
# Chrome and Node 22+. SMOKE_TIMEOUT (seconds, default 900) caps the wait.
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
[ -n "$CHROME" ] || { echo "Chrome not found; set CHROME=/path/to/chrome"; exit 1; }
export CHROME
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
TMP=$(mktemp -d)
trap 'st=$?; { kill $SRV; wait $SRV; } 2>/dev/null || true; rm -rf "$TMP"; exit $st' EXIT   # set -e applies in traps too
sleep 1
node test/headless.mjs "http://127.0.0.1:$PORT/test/smoke.html" "${SMOKE_TIMEOUT:-900}" > "$TMP/report.txt" || true
cat "$TMP/report.txt"
# exact last line: a substring check would also match unfinished output
[ "$(tail -n 1 "$TMP/report.txt")" = "SMOKE OK" ] || { echo "smoke test failed (or did not finish within ${SMOKE_TIMEOUT:-900} s)"; exit 1; }
