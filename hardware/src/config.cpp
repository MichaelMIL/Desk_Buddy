#include "config.h"
#include <Preferences.h>

Config cfg;
static Preferences prefs;

String deviceId() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[8];
  snprintf(buf, sizeof(buf), "%06llx", (unsigned long long)(mac >> 24) & 0xffffff);
  return String(buf);
}

String hostName() {
  String h;
  for (char c : cfg.name) {
    if (isalnum((unsigned char)c)) h += (char)tolower((unsigned char)c);
    else if ((c == ' ' || c == '-' || c == '_') && h.length() && !h.endsWith("-")) h += '-';
  }
  while (h.endsWith("-")) h.remove(h.length() - 1);
  return h.length() ? h : "deskbuddy";
}

void configLoad() {
  prefs.begin("buddy", true);
  cfg.ssid = prefs.getString("ssid", "");
  cfg.pass = prefs.getString("pass", "");
  cfg.apPass = prefs.getString("appass", "");
  cfg.otaPass = prefs.isKey("otapass") ? prefs.getString("otapass", "") : "";
  cfg.name = prefs.getString("name", "Desk Buddy");
  cfg.mqttHost = prefs.getString("mhost", "");
  cfg.mqttPort = prefs.getUShort("mport", 1883);
  cfg.mqttUser = prefs.getString("muser", "");
  cfg.mqttPass = prefs.getString("mpass", "");
  cfg.mqttPrefix = prefs.getString("mprefix", "");
  cfg.haDiscovery = prefs.getBool("ha", true);
  cfg.anim = prefs.getString("anim", "");
  cfg.cycleList = prefs.getString("cycle", "");
  cfg.theme = prefs.getString("theme", "");
  cfg.rotation = prefs.getUChar("rot", 0) & 3;
  cfg.loops = prefs.getUChar("loops", 3);
  cfg.speed = prefs.getUShort("speed", 100);
  cfg.screenOn = prefs.getBool("screen", true);
  cfg.brightness = prefs.getUChar("bright", 100);
  prefs.end();
  if (cfg.brightness < 10 || cfg.brightness > 100) cfg.brightness = 100;
  if (cfg.mqttPrefix.isEmpty()) cfg.mqttPrefix = "deskbuddy/" + deviceId();
  if (cfg.loops < 1) cfg.loops = 1;
  if (cfg.speed < 25 || cfg.speed > 400) cfg.speed = 100;
}

void configSave() {
  prefs.begin("buddy", false);
  prefs.putString("ssid", cfg.ssid);
  prefs.putString("pass", cfg.pass);
  prefs.putString("appass", cfg.apPass);
  prefs.putString("otapass", cfg.otaPass);
  prefs.putString("name", cfg.name);
  prefs.putString("mhost", cfg.mqttHost);
  prefs.putUShort("mport", cfg.mqttPort);
  prefs.putString("muser", cfg.mqttUser);
  prefs.putString("mpass", cfg.mqttPass);
  prefs.putString("mprefix", cfg.mqttPrefix);
  prefs.putBool("ha", cfg.haDiscovery);
  prefs.putString("anim", cfg.anim);
  prefs.putString("cycle", cfg.cycleList);
  prefs.putString("theme", cfg.theme);
  prefs.putUChar("rot", cfg.rotation & 3);
  prefs.putUChar("loops", cfg.loops);
  prefs.putUShort("speed", cfg.speed);
  prefs.putBool("screen", cfg.screenOn);
  prefs.putUChar("bright", cfg.brightness);
  prefs.end();
}

void configClear() {
  prefs.begin("buddy", false);
  prefs.clear();
  prefs.end();
}
