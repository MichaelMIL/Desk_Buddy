/* Persistent settings (NVS via Preferences). */
#pragma once
#include <Arduino.h>

/* Build variant: -DBUDDY_WIFI=0 (env:esp32s3_supermini_ble in platformio.ini)
 * leaves out Wi-Fi, MQTT, the HTTP API and OTA; Bluetooth and USB serial
 * remain, and the file system gets the freed flash. */
#ifndef BUDDY_WIFI
#define BUDDY_WIFI 1
#endif
#ifndef FW_VERSION
#define FW_VERSION "dev"
#endif

struct Config {
  // network
  String ssid, pass;
  String apPass;             // setup AP password ("" = open network)
  String otaPass;            // password for firmware updates over Wi-Fi ("" = none)
  String name = "Desk Buddy";// shown in the page / Home Assistant; also the mDNS host (sanitised)
  // mqtt
  String mqttHost;
  uint16_t mqttPort = 1883;
  String mqttUser, mqttPass;
  String mqttPrefix;         // default: deskbuddy/<id>
  bool haDiscovery = true;   // publish Home Assistant MQTT discovery
  // bluetooth
  bool ble = true;           // Bluetooth LE control (Nordic UART Service), see ble.h
  // display / playback
  String anim;               // animation to start with ("" or "cycle" = cycle)
  String cycleList;          // comma-separated names to cycle through ("" = all)
  String theme;              // selected theme: "<theme>__name" animations play only when their theme is selected
  uint8_t rotation = 0;      // 0..3 (x 90 degrees)
  uint8_t loops = 3;         // loops per animation when cycling
  uint16_t speed = 100;      // playback speed percent (25..400)
  bool screenOn = true;      // display on/off at boot
  uint8_t brightness = 100;  // 10..100 %. The module's backlight is hard-wired, so this dims the pixels
};

extern Config cfg;

String deviceId();           // 6 hex chars from the MAC, e.g. "a1b2c3"
String hostName();           // e.g. "desk-buddy" (from cfg.name, DNS-safe)
String jsonStr(const String &s);   // s as a quoted, escaped JSON string
void configLoad();
void configSave();
void configClear();
