#!/bin/sh
# Build and push the firmware to a running desk buddy over Wi-Fi.
#   hardware/ota.sh 192.168.50.99 [password]
#   hardware/ota.sh --nobat 192.168.50.99 [password]   the build without battery level
set -e
cd "$(dirname "$0")"
ENV=esp32s3_supermini
if [ "$1" = "--nobat" ]; then ENV=esp32s3_supermini_nobat; shift; fi
HOST="${1:?usage: ota.sh [--nobat] <address> [firmware password]}"
PASS="$2"
pio run -e "$ENV" >/dev/null
BIN=.pio/build/$ENV/firmware.bin
echo "uploading $BIN ($(du -k "$BIN" | cut -f1) KB) to $HOST ..."
curl -sS -f -X PUT --data-binary "@$BIN" -H "Content-Type: application/octet-stream" ${PASS:+-H "X-OTA-Password: $PASS"} "http://$HOST/api/update"
echo
echo "done - the device reboots now"
