# HTTP API

The Wi-Fi build of the buddy has no web pages; it serves this JSON API on
port 80. Everyday control is meant to go over Bluetooth ([BLE.md](BLE.md))
or MQTT ([README.md](README.md#mqtt)). The API is for scripts, the
simulator's "→ board" push, firmware updates and first-time setup. The build
without Wi-Fi (`env:esp32s3_supermini_ble`) has no API at all.

Address: the IP printed on USB serial, `http://<device name>.local/`
(default `desk-buddy.local`, via mDNS), or `192.168.4.1` on the setup access
point. `GET /` lists the endpoints.

**No authentication.** Anyone who can reach the buddy (your LAN, or the setup
access point while it is up) can use every endpoint, including
`/api/config` and `/api/reset`. Give the setup access point a password
(`appass` on serial or `apPass` below). A firmware update password protects
`/api/update` only from someone who does not know it; `/api/config` can
change it.

## Endpoints

| Method and path | Parameters | Does | Answer |
|---|---|---|---|
| `GET /` | | Lists the endpoints | `{"name","version","docs","api":[…]}` |
| `GET /api/status` | | Everything about the buddy | see below |
| `POST /api/play` | `name` = animation or `cycle` | Plays one animation (and stays on it) or resumes cycling | `{"ok":true,"current":"face_happy"}`; 404 unknown animation |
| `POST /api/screen` | `on` = `1`/`0` (`on`/`off`, `true`/`false`) | Display on or off (not saved) | `{"ok":true,"on":false}` |
| `POST /api/brightness` | `value` = 10 to 100 | Software dimming (saved) | `{"ok":true,"brightness":60}`; 400 out of range |
| `POST /api/theme` | `name` = theme, empty for none | Selects a theme (saved) | `{"ok":true,"theme":"xmas"}`; 400 not letters/digits |
| `GET /api/anim` | | Stored animations and space | `{"animations":[{"name","bytes","builtin"}],"free","total"}` (bytes) |
| `PUT /api/anim` | header `X-Anim-Name`, body = DBAL/DBAZ/DBA1 bytes | Stores an animation; replaces one with the same name | `{"ok":true,"name","free_kb","animations":[…]}`; 507 no space, 409 another upload running, 400 invalid |
| `DELETE /api/anim` | `name` | Deletes a stored animation | `{"ok":true,"free_kb":512}`; 404 not found or built-in |
| `GET /api/scan` | | Scans for Wi-Fi networks (a few seconds) | `[{"ssid","rssi","open"}]`, at most 20 |
| `POST /api/config` | form fields, below | Saves settings, then reboots | `{"ok":true,"rebooting":true}` |
| `POST /api/ble/forget` | | Forgets every paired Bluetooth device | `{"ok":true}` |
| `POST /api/reboot` | | Reboots | `{"ok":true}` |
| `POST /api/reset` | | Erases all settings and Bluetooth bonds, reboots into setup (animations stay) | `{"ok":true,"rebooting":true}` |
| `PUT /api/update` | body = `firmware.bin`; header `X-OTA-Password` if one is set | Writes new firmware to the other app slot, reboots into it | `{"ok":true,"rebooting":true}`; 401 wrong password, 400 bad image |

Parameters go in the query string (`POST /api/play?name=face_happy`) or a
form body. The exception is `PUT /api/anim`: the ESP32 web server does not
parse query arguments for raw-body requests, so the name travels in the
`X-Anim-Name` header. `POST` works in place of `PUT` for both uploads.
Errors answer `{"error":"<reason>"}`; unknown paths answer 404.

### `GET /api/status`

```json
{
  "id": "3ce36c", "current": "cycle", "animations": ["bear__honey", "…"],
  "wifi": {"connected": true, "ssid": "home", "ip": "192.168.50.99", "rssi": -61},
  "ap": null, "mqtt": "disabled",
  "ble": "advertising as 'Desk Buddy', 1 paired", "bleBonds": 1,
  "screen": true, "brightness": 100, "theme": "bunny", "themes": ["bear", "bunny", "…"],
  "host": "desk-buddy", "heap": 195000, "uptime": 3600, "version": "2026.11.12c",
  "config": {"ssid": "home", "mqttHost": "", "mqttPort": 1883, "mqttUser": "",
             "mqttPrefix": "deskbuddy/3ce36c", "haDiscovery": true, "ble": true,
             "anim": "", "name": "Desk Buddy", "apPassSet": false, "otaPassSet": false,
             "cycleList": "", "rotation": 0, "loops": 3, "speed": 100, "screenOn": true}
}
```

`current` is the playing animation or `cycle`. `ap` is the setup access point's
name while it is up, else `null`. `bleBonds` is -1 with Bluetooth off.
Passwords are never returned; `apPassSet` and `otaPassSet` say whether one
is set.

### `POST /api/config`

Send only the fields to change. The buddy saves them and reboots.

| Field | Value |
|---|---|
| `ssid`, `pass` | Wi-Fi network; an empty `pass` keeps the saved one |
| `mqttHost`, `mqttPort`, `mqttUser`, `mqttPass`, `mqttPrefix` | MQTT broker (empty host = MQTT off); an empty `mqttPass` or `mqttPrefix` keeps the saved one |
| `haDiscovery` | `1` / `0`: Home Assistant discovery |
| `ble` | `1` / `0`: Bluetooth control |
| `name` | Device name (Bluetooth name, mDNS host, Home Assistant) |
| `anim` | Animation to start with (`cycle` or empty = cycle) |
| `cycleList` | Comma-separated names that cycle (empty = all) |
| `theme` | Selected theme (empty = none) |
| `rotation` | 0 to 3 (× 90°) |
| `loops` | 1 to 50, loops per face while cycling |
| `speed` | 25 to 400, playback speed in percent |
| `apPass` + `apPassSet=1` | Setup access point password, at least 8 characters (empty = open) |
| `otaPass` + `otaPassSet=1` | Firmware update password (empty = none) |

## Examples

```sh
B=desk-buddy.local
curl http://$B/api/status
curl -X POST "http://$B/api/play?name=face_happy"
curl -X POST "http://$B/api/brightness?value=40"
curl -X POST "http://$B/api/screen?on=0"
curl -X PUT --data-binary @face_wave.dba -H "X-Anim-Name: face_wave" http://$B/api/anim
curl -X DELETE "http://$B/api/anim?name=face_wave"
curl -X PUT --data-binary @.pio/build/esp32s3_supermini/firmware.bin http://$B/api/update   # or hardware/ota.sh

# first-time setup: join the open access point DeskBuddy-xxxxxx, then
curl -X POST http://192.168.4.1/api/config -d ssid=home -d pass=secret
```

The same settings are reachable without Wi-Fi: on USB serial (`wifi <ssid>
<pass>`, `mqtt <host>`, …) and from a paired Bluetooth device ([BLE.md](BLE.md)).

## Other network services

- **mDNS:** `<device name>.local`, advertising `_http._tcp` on port 80.
- **ArduinoOTA** (PlatformIO `pio run -e ota -t upload`): port 3232, with the
  firmware update password if one is set.
- **Setup access point:** `DeskBuddy-<id>` at 192.168.4.1. It starts when no
  Wi-Fi is saved, when the saved network is unreachable for 20 s (the station
  keeps retrying every minute), or with `ap` on serial. Only the API is on it;
  there is no captive page anymore.
