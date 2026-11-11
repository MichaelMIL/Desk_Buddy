#!/bin/sh
# Build and push the firmware to a running desk buddy over Wi-Fi.
#   hardware/ota.sh 192.168.50.99 [password]
set -e
cd "$(dirname "$0")"
HOST="${1:?usage: ota.sh <address> [firmware password]}"
PASS="$2"
pio run -e esp32s3_supermini >/dev/null
BIN=.pio/build/esp32s3_supermini/firmware.bin
echo "uploading $BIN ($(du -k "$BIN" | cut -f1) KB) to $HOST ..."
curl -sS -f -X PUT --data-binary "@$BIN" -H "Content-Type: application/octet-stream" ${PASS:+-H "X-OTA-Password: $PASS"} "http://$HOST/api/update"
echo
echo "done - the device reboots now"
