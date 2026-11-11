#!/bin/sh
# Upload every animation to a running desk buddy over Wi-Fi (no reflash).
#   sim/test/push_all.sh 192.168.50.99
set -e
cd "$(dirname "$0")/.."
HOST="${1:?usage: push_all.sh <board address>}"
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
python3 serve.py "$PORT" >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
node test/headless.mjs "http://127.0.0.1:$PORT/test/export_all.html?push=$HOST" 900
