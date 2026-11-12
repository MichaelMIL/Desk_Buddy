#include "mqtt.h"
#if BUDDY_WIFI   // the whole file; config.h
#include "app.h"
#include "config.h"
#include "net.h"
#include "store.h"
#include <WiFi.h>
#include <PubSubClient.h>

static WiFiClient wifiClient;
static PubSubClient mq(wifiClient);
static uint32_t lastAttempt = 0;
static int lastRc = 0;
static bool enabled = false;
static volatile bool stateDirty = false, animsDirty = false;
static const uint32_t RETRY_MS = 10000;

static String topic(const char *suffix) { return cfg.mqttPrefix + "/" + suffix; }

String mqttStatus() {
  if (!enabled) return "disabled";
  if (mq.connected()) return "connected";
  if (!netConnected()) return "waiting for wifi";
  return lastRc == 0 ? "connecting" : "error " + String(lastRc);
}

static void onMessage(char *t, uint8_t *payload, unsigned int len) {
  String msg;
  msg.reserve(len);
  for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];
  msg.trim();
  if (String(t) == topic("screen/set")) {
    String v = msg; v.toLowerCase();
    app_screen(v == "on" || v == "1" || v == "true");
    return;
  }
  if (String(t) == topic("theme/set")) {
    String v = msg; v.toLowerCase();
    if (v == "none") v = "";
    app_set_theme(v.c_str());
    return;
  }
  if (String(t) == topic("brightness/set")) {
    int v = msg.toInt();
    if (v >= 10 && v <= 100) { app_brightness(v); cfg.brightness = v; configSave(); }
    return;
  }
  // accept a bare name or {"animation":"name"}
  int k = msg.indexOf("\"animation\"");
  if (k >= 0) {
    int q1 = msg.indexOf('"', msg.indexOf(':', k) + 1);
    int q2 = msg.indexOf('"', q1 + 1);
    if (q1 >= 0 && q2 > q1) msg = msg.substring(q1 + 1, q2);
  }
  if (msg.startsWith("\"") && msg.endsWith("\"") && msg.length() >= 2) msg = msg.substring(1, msg.length() - 1);
  Serial.printf("mqtt: %s -> '%s'\n", t, msg.c_str());
  if (!app_play(msg.c_str())) mq.publish(topic("error").c_str(), ("unknown animation: " + msg).c_str());
}

static void publishStateNow() {
  if (!mq.connected()) return;
  mq.publish(topic("state").c_str(), app_current(), true);
  mq.publish(topic("screen/state").c_str(), app_screen_on() ? "on" : "off", true);
  mq.publish(topic("brightness/state").c_str(), String(app_brightness_get()).c_str(), true);
  mq.publish(topic("theme/state").c_str(), cfg.theme.isEmpty() ? "none" : cfg.theme.c_str(), true);
}

// May be called from any task: the publish happens in mqttLoop() (network task).
void mqttPublishState() { stateDirty = true; }
void mqttPublishAnimations() { animsDirty = true; }

static void publishDiscovery() {
  if (!cfg.haDiscovery) return;
  String id = "deskbuddy_" + deviceId();
  String opts = "\"cycle\"";
  app_lock();
  for (size_t i = 0; i < app_anim_count(); i++) opts += String(",\"") + app_anim_name(i) + "\"";
  app_unlock();
  String dev = "\"dev\":{\"ids\":[\"" + id + "\"],\"name\":\"" + cfg.name + "\",\"mf\":\"desk_buddies\",\"mdl\":\"ESP32-S3 SuperMini + GC9A01\"}";
  String p = "{\"name\":\"Face\",\"uniq_id\":\"" + id + "_face\",\"cmd_t\":\"" + topic("set") + "\",\"stat_t\":\"" + topic("state") +
             "\",\"avty_t\":\"" + topic("availability") + "\",\"options\":[" + opts + "],\"icon\":\"mdi:emoticon-happy-outline\"," + dev + "}";
  mq.publish(("homeassistant/select/" + id + "/face/config").c_str(), p.c_str(), true);
  String sw = "{\"name\":\"Screen\",\"uniq_id\":\"" + id + "_screen\",\"cmd_t\":\"" + topic("screen/set") + "\",\"stat_t\":\"" + topic("screen/state") +
              "\",\"avty_t\":\"" + topic("availability") + "\",\"pl_on\":\"on\",\"pl_off\":\"off\",\"icon\":\"mdi:monitor\"," + dev + "}";
  mq.publish(("homeassistant/switch/" + id + "/screen/config").c_str(), sw.c_str(), true);
  String br = "{\"name\":\"Brightness\",\"uniq_id\":\"" + id + "_brightness\",\"cmd_t\":\"" + topic("brightness/set") + "\",\"stat_t\":\"" + topic("brightness/state") +
              "\",\"avty_t\":\"" + topic("availability") + "\",\"min\":10,\"max\":100,\"step\":5,\"unit_of_meas\":\"%\",\"icon\":\"mdi:brightness-6\"," + dev + "}";
  mq.publish(("homeassistant/number/" + id + "/brightness/config").c_str(), br.c_str(), true);
  app_lock();
  String themes = storeThemesJson();   // ["halloween",...]
  app_unlock();
  String topts = "\"none\"" + (themes.length() > 2 ? "," + themes.substring(1, themes.length() - 1) : String());
  String th = "{\"name\":\"Theme\",\"uniq_id\":\"" + id + "_theme\",\"cmd_t\":\"" + topic("theme/set") + "\",\"stat_t\":\"" + topic("theme/state") +
              "\",\"avty_t\":\"" + topic("availability") + "\",\"options\":[" + topts + "],\"icon\":\"mdi:palette\"," + dev + "}";
  mq.publish(("homeassistant/select/" + id + "/theme/config").c_str(), th.c_str(), true);
}

static void publishAnimationsNow() {
  if (!mq.connected()) return;
  String list = "[\"cycle\"";
  app_lock();
  for (size_t i = 0; i < app_anim_count(); i++) list += String(",\"") + app_anim_name(i) + "\"";
  app_unlock();
  list += "]";
  mq.publish(topic("animations").c_str(), list.c_str(), true);
  publishDiscovery();
}

static void connectNow() {
  lastAttempt = millis();
  String clientId = "deskbuddy-" + deviceId();
  String avail = topic("availability");
  bool ok = cfg.mqttUser.length()
    ? mq.connect(clientId.c_str(), cfg.mqttUser.c_str(), cfg.mqttPass.c_str(), avail.c_str(), 1, true, "offline")
    : mq.connect(clientId.c_str(), avail.c_str(), 1, true, "offline");
  lastRc = ok ? 0 : mq.state();
  if (!ok) { Serial.printf("mqtt: connect to %s:%u failed (rc=%d)\n", cfg.mqttHost.c_str(), cfg.mqttPort, lastRc); return; }
  Serial.printf("mqtt: connected to %s:%u, prefix %s\n", cfg.mqttHost.c_str(), cfg.mqttPort, cfg.mqttPrefix.c_str());
  mq.publish(avail.c_str(), "online", true);
  publishStateNow();
  publishAnimationsNow();
  stateDirty = animsDirty = false;
  mq.subscribe(topic("set").c_str());
  mq.subscribe(topic("screen/set").c_str());
  mq.subscribe(topic("brightness/set").c_str());
  mq.subscribe(topic("theme/set").c_str());
}

void mqttBegin() {
  enabled = cfg.mqttHost.length() > 0;
  if (!enabled) return;
  mq.setServer(cfg.mqttHost.c_str(), cfg.mqttPort);
  mq.setCallback(onMessage);
  mq.setBufferSize(8192);    // the discovery message lists every face name (~20 bytes each)
  mq.setSocketTimeout(3);    // seconds; keeps a dead broker from stalling the animation for long
  mq.setKeepAlive(30);
}

void mqttLoop() {
  if (!enabled || !netConnected()) return;
  if (!mq.connected()) {
    if (millis() - lastAttempt > RETRY_MS || lastAttempt == 0) connectNow();
    return;
  }
  mq.loop();
  if (animsDirty) { animsDirty = false; publishAnimationsNow(); }
  if (stateDirty) { stateDirty = false; publishStateNow(); }
}

#endif  // BUDDY_WIFI
