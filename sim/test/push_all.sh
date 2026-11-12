#!/bin/sh
# Upload every animation to a running desk buddy (no reflash).
#   sim/test/push_all.sh 192.168.50.99            # everything, over Wi-Fi
#   sim/test/push_all.sh 192.168.50.99 '^King'    # only names matching a regex
#   sim/test/push_all.sh usb                      # over USB serial (Espressif port found automatically)
#   sim/test/push_all.sh ble                      # over Bluetooth (paired; the code is on the buddy's screen)
set -e
cd "$(dirname "$0")/.."
HOST="${1:?usage: push_all.sh <board address|usb[:port]|ble[:name]> [name regex]}"
FILTER="${2:-}"
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
python3 serve.py "$PORT" >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
ENC=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$FILTER")
node test/headless.mjs "http://127.0.0.1:$PORT/test/export_all.html?push=$HOST&filter=$ENC" 900
