#!/bin/sh
# Serve the simulator (with the save/export endpoints) and open it in the browser.
cd "$(dirname "$0")"
PORT="${1:-8080}"
URL="http://localhost:$PORT/"
(
  sleep 1
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi
) &
exec python3 serve.py "$PORT"
