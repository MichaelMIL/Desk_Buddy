/*
 * Desk buddy firmware: plays DBA1 animations (exported from sim/) on the
 * round GC9A01 display. Faces are chosen from the web page (setup AP or LAN),
 * over MQTT, over Bluetooth LE (ble.cpp) or on the serial console; new faces
 * are uploaded over Wi-Fi.
 *
 * Tasks: a render task pinned to core 0 draws frames; the Arduino loop
 * (core 1) runs Wi-Fi, the web server, uploads, OTA, MQTT, Bluetooth commands
 * and the serial console. The player lock guards the shared state; only this file draws.
 *
 * Serial (115200):
 *   list                    print animation names (built-in and stored)
 *   names | state           one-line machine-readable list / state (JSON)
 *   delete <name>           remove a stored animation
 *   play <name>             play one animation and stay on it ("play cycle" resumes cycling)
 *   next | cycle [a,b|all]  skip / resume cycling (optionally set the cycle list)
 *   status                  wifi / mqtt / animation state
 *   wifi <ssid> <password>  save Wi-Fi credentials and reboot
 *   mqtt <host> [port] [user] [password]   save broker settings and reboot
 *   prefix <topic prefix>   MQTT topic prefix (default deskbuddy/<id>)
 *   name <device name>      device name (web page, Home Assistant, mDNS host)
 *   rotation 0|1|2|3        display rotation (x 90 degrees)
 *   loops <n>               loops per face when cycling
 *   speed <percent>         playback speed, 25..400
 *   theme <name>|none       select a theme: "<theme>__name" animations play only in their theme
 *   screen on|off           display on/off
 *   brightness <10-100>     software dimming (the backlight is hard-wired)
 *   ble on|off              Bluetooth LE control (saved, reboots)
 *   appass <password>       setup AP password (empty = open)
 *   ap                      start the setup access point now
 *   reset                   erase all settings and reboot
 *   reboot
 *
 * Bluetooth runs the same commands (app_command), limited to the ones that
 * steer playback; see remote_ok().
 */
#include <Arduino.h>
#include <TFT_eSPI.h>
#include "dba_player.h"
#include "app.h"
#include "store.h"
#include "config.h"
#include "net.h"
#include "mqtt.h"
#include "ble.h"

TFT_eSPI tft;

// ---- player state (guarded by the lock) --------------------------------------

enum Mode { MODE_ANIM, MODE_MESSAGE, MODE_LOADING };

static SemaphoreHandle_t mx;
static dba_t anim;
static uint16_t rowbuf[240];
static size_t current = 0;
static String cur_name;
static const uint8_t *cur_buf = NULL;    // bytes of the current animation (flash or PSRAM)
static bool have_anim = false;
static bool cycling = true;
static uint32_t loops_done = 0;
static uint32_t next_frame_at = 0;
static bool screen_on = true;
static Mode mode = MODE_ANIM;
static bool mode_dirty = false;          // the mode's static parts need drawing
static String msg1, msg2, load_label;
static volatile int load_pct = -1;
static uint32_t frames_rendered = 0;

struct Lock {
  Lock() { xSemaphoreTakeRecursive(mx, portMAX_DELAY); }
  ~Lock() { xSemaphoreGiveRecursive(mx); }
};

void app_lock() { xSemaphoreTakeRecursive(mx, portMAX_DELAY); }
void app_unlock() { xSemaphoreGiveRecursive(mx); }

// ---- display ----------------------------------------------------------------

/* Software dimming: the module's backlight is hard-wired, so brightness scales
 * the pixel values instead (black stays black, which suits the faces). */
static uint8_t lut5[32], lut6[64];
static uint8_t brightness = 100;
static uint16_t dimrow[240];

static void build_dim_lut() {
  for (int i = 0; i < 32; i++) lut5[i] = (uint8_t)((i * brightness + 50) / 100);
  for (int i = 0; i < 64; i++) lut6[i] = (uint8_t)((i * brightness + 50) / 100);
}

static void push_row(void *user, uint16_t x, uint16_t y, uint16_t w, const uint16_t *px) {
  (void)user;
  if (brightness >= 100) { tft.pushImage(x, y, w, 1, (uint16_t *)px); return; }
  for (uint16_t i = 0; i < w; i++) {
    uint16_t c = px[i];
    dimrow[i] = (uint16_t)((lut5[c >> 11] << 11) | (lut6[(c >> 5) & 0x3f] << 5) | lut5[c & 0x1f]);
  }
  tft.pushImage(x, y, w, 1, dimrow);
}

static void draw_message() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextDatum(MC_DATUM);
  tft.setTextPadding(0);
  tft.drawString(msg1, 120, 108, 2);
  tft.drawString(msg2, 120, 132, 2);
}

/* Loading ring: a spinner on the outer ring, the progress on the inner ring,
 * the percentage in the middle and the label below. Called every ~40 ms. */
/* Arc segment on a ring; handles wrapping past 360 (drawArc's 0 is at 6 o'clock, clockwise). */
static void ring_arc(int32_t r, int32_t ir, uint32_t a0, uint32_t a1, uint32_t col) {
  a0 %= 360; a1 %= 360;
  if (a0 == a1) return;
  if (a0 < a1) tft.drawArc(120, 120, r, ir, a0, a1, col, TFT_BLACK, false);
  else { tft.drawArc(120, 120, r, ir, a0, 360, col, TFT_BLACK, false); if (a1) tft.drawArc(120, 120, r, ir, 0, a1, col, TFT_BLACK, false); }
}

static void draw_loading(bool full) {
  static uint32_t spin = 0, drawn_deg = 0;
  static int drawn_pct = -2;
  const uint32_t SEG = 60, STEP = 12;
  if (full) {
    tft.fillScreen(TFT_BLACK);
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
    tft.setTextPadding(200);
    tft.drawString(load_label, 120, 168, 2);
    tft.drawArc(120, 120, 62, 54, 0, 360, 0x2124, TFT_BLACK, false);   // dim track for the progress ring
    spin = 0; drawn_deg = 0; drawn_pct = -2;
    ring_arc(74, 68, 0, SEG, TFT_CYAN);
  } else {
    // spinner: erase the tail and extend the head by STEP degrees
    ring_arc(74, 68, spin, spin + STEP, TFT_BLACK);
    ring_arc(74, 68, spin + SEG, spin + SEG + STEP, TFT_CYAN);
    spin = (spin + STEP) % 360;
  }
  int pct = load_pct;
  if (pct >= 0) {
    // progress: fill the inner ring clockwise from the top, only the new part
    uint32_t deg = (uint32_t)(pct * 360 / 100);
    if (deg > drawn_deg) { ring_arc(62, 54, 180 + drawn_deg, 180 + deg, TFT_WHITE); drawn_deg = deg; }
    if (pct != drawn_pct) {
      drawn_pct = pct;
      tft.setTextDatum(MC_DATUM);
      tft.setTextColor(TFT_WHITE, TFT_BLACK);
      tft.setTextPadding(70);
      tft.drawString(String(pct) + "%", 120, 120, 4);
    }
  }
}

// ---- animations -------------------------------------------------------------

static bool in_cycle(size_t idx) {
  const String &n = storeEntry(idx).name;
  if (!storeInTheme(n, cfg.theme)) return false;          // other themes' animations stay hidden
  if (cfg.cycleList.isEmpty()) return true;
  String list = "," + cfg.cycleList + ",";
  return list.indexOf("," + n + ",") >= 0;
}

static size_t next_in_cycle(size_t from) {
  size_t n = storeCount();
  if (!n) return 0;
  for (size_t k = 1; k <= n; k++) {
    size_t i = (from + k) % n;
    if (in_cycle(i)) return i;
  }
  return (from + 1) % n;   // nothing matches the list: fall back to all
}

static void release_current() {
  if (cur_buf) { storeRelease(current, cur_buf); cur_buf = NULL; }
  have_anim = false;
}

static bool start_animation(size_t idx) {
  size_t n = storeCount();
  if (n == 0) return false;
  idx %= n;
  bool have_anim_before = have_anim;
  release_current();
  size_t len = 0;
  const uint8_t *buf = storeLoad(idx, &len);
  if (!buf || dba_open(&anim, buf, len) != 0) {
    Serial.printf("animation %s: cannot load\n", storeEntry(idx).name.c_str());
    if (buf) storeRelease(idx, buf);
    return false;
  }
  bool same = have_anim_before && cur_name == storeEntry(idx).name;
  current = idx;
  cur_name = storeEntry(idx).name;
  cur_buf = buf;
  loops_done = 0;
  next_frame_at = millis();
  have_anim = true;
  mode = MODE_ANIM;
  if (!same) Serial.printf("playing %s (%u frames%s)\n", cur_name.c_str(), anim.frame_count, storeEntry(idx).builtin ? ", built-in" : "");
  return true;
}

/* One frame of the animation (or nothing if it is not due yet). */
static void render_step() {
  if (!have_anim || !screen_on) return;
  if ((int32_t)(millis() - next_frame_at) < 0) return;
  int ended = 0;
  uint16_t hold = dba_render_next(&anim, rowbuf, push_row, NULL, &ended);
  frames_rendered++;
  uint32_t scaled = (uint32_t)hold * 100 / cfg.speed;
  next_frame_at += scaled ? scaled : 1;
  if ((int32_t)(millis() - next_frame_at) > 500) next_frame_at = millis();   // fell behind: resync
  if (ended) {
    loops_done++;
    bool once = !(anim.flags & DBA_FLAG_LOOP);
    if (cycling && (loops_done >= cfg.loops || once)) start_animation(next_in_cycle(current));
    else if (once && !cycling) have_anim = false;   // played once, stay on the last frame
  }
}

// ---- app.h -------------------------------------------------------------------

/* Something visible changed (face, screen, brightness, theme): tell MQTT and
 * Bluetooth. Both only set a flag; the publish happens in the network loop. */
static void state_changed() { mqttPublishState(); bleStateChanged(); }

size_t app_anim_count() { Lock l; return storeCount(); }
const char *app_anim_name(size_t i) { Lock l; return i < storeCount() ? storeEntry(i).name.c_str() : ""; }
bool app_cycling() { return cycling; }
const char *app_current() { Lock l; return (cycling || !have_anim) ? "cycle" : cur_name.c_str(); }
bool app_screen_on() { return screen_on; }
uint32_t app_frames_rendered() { return frames_rendered; }

bool app_play(const char *name) {
  Lock l;
  if (!strcmp(name, "cycle") || !*name) {
    cycling = true; loops_done = 0;
    if (!have_anim || !in_cycle(current)) start_animation(next_in_cycle(current));
    else mode = MODE_ANIM;
    state_changed();
    return true;
  }
  int i = storeFind(name);
  if (i < 0) return false;
  cycling = false;
  bool ok = start_animation(i);
  state_changed();
  return ok;
}

void app_screen(bool on) {
  Lock l;
  if (on == screen_on) return;
  screen_on = on;
  if (on) {
    tft.writecommand(0x29);                        // GC9A01 display on
    if (have_anim) start_animation(current);       // redraw from a full frame
  } else {
    tft.fillScreen(TFT_BLACK);
    tft.writecommand(0x28);                        // display off (backlight is hard-wired)
  }
  Serial.printf("screen %s\n", on ? "on" : "off");
  state_changed();
}

void app_brightness(uint8_t percent) {
  Lock l;
  if (percent < 10) percent = 10;
  if (percent > 100) percent = 100;
  if (percent == brightness) return;
  brightness = percent;
  build_dim_lut();
  if (have_anim && mode == MODE_ANIM) start_animation(current);   // redraw with the new level
  state_changed();
}
uint8_t app_brightness_get() { return brightness; }

void app_apply_settings() {
  Lock l;
  tft.setRotation(cfg.rotation);
  if (have_anim) start_animation(current);
}

void app_set_theme(const char *theme) {
  Lock l;
  cfg.theme = theme;
  configSave();
  // when cycling, move on if the current animation does not belong to the new theme
  if (cycling && have_anim && !in_cycle(current)) start_animation(next_in_cycle(current));
  state_changed();
  Serial.printf("theme '%s'\n", cfg.theme.c_str());
}

void app_animations_changed(const char *name) {
  Lock l;
  if (!storeCount()) { release_current(); msg1 = "no animations"; msg2 = "push one from the sim"; mode = MODE_MESSAGE; mode_dirty = true; return; }
  int i = cur_name.length() ? storeFind(cur_name.c_str()) : -1;
  if (i < 0) start_animation(next_in_cycle(current));          // current one is gone
  else start_animation(i);                                    // same (possibly replaced) animation, from a full frame
  (void)name;
  mqttPublishAnimations();
  bleStateChanged();
}

void app_message(const char *l1, const char *l2) {
  Lock l;
  msg1 = l1; msg2 = l2;
  mode = MODE_MESSAGE; mode_dirty = true;
}

void app_loading(const char *label, int percent) {
  load_pct = percent;                                   // lock-free: the render loop just reads it
  if (mode != MODE_LOADING || load_label != label) {   // once per upload
    Lock l;
    load_label = label; mode = MODE_LOADING; mode_dirty = true;
  }
}

void app_resume() {
  Lock l;
  if (have_anim) start_animation(current);
  else { msg1 = "no animations"; msg2 = "push one from the sim"; mode = MODE_MESSAGE; mode_dirty = true; }
}

// ---- serial console -------------------------------------------------------------

static void print_status(Print &out) {
  Lock l;
  out.printf("animation: %s%s, theme '%s', screen %s, brightness %u%%, rotation %u, speed %u%%, loops %u, cycle list '%s', frames rendered %lu\n", app_current(), cycling ? " (cycling)" : "",
                cfg.theme.c_str(), screen_on ? "on" : "off", brightness, cfg.rotation, cfg.speed, cfg.loops, cfg.cycleList.c_str(), (unsigned long)frames_rendered);
  out.printf("name: %s (http://%s.local/), setup AP %s\n", cfg.name.c_str(), hostName().c_str(), cfg.apPass.length() ? "password-protected" : "open");
  out.printf("wifi: %s%s\n", netConnected() ? ("connected, " + netIp()).c_str() : "not connected",
                netApActive() ? (" | setup AP " + netApSsid() + " at " + netIp()).c_str() : "");
  out.printf("mqtt: %s (%s:%u, prefix %s)\n", mqttStatus().c_str(), cfg.mqttHost.c_str(), cfg.mqttPort, cfg.mqttPrefix.c_str());
  out.printf("bluetooth: %s\n", bleStatus().c_str());
  out.printf("device id: %s, free heap: %u, store: %u animations, %u KB free\n", deviceId().c_str(), ESP.getFreeHeap(), (unsigned)storeCount(), (unsigned)(storeFreeBytes() / 1024));
}

/* Machine-readable state, one line of JSON (Bluetooth state characteristic, "state" command). */
String app_state_json() {
  Lock l;
  String s = "{\"current\":\"" + String(app_current()) + "\",\"cycling\":" + (cycling ? "true" : "false");
  s += ",\"screen\":" + String(screen_on ? "true" : "false") + ",\"brightness\":" + String(brightness);
  s += ",\"theme\":\"" + cfg.theme + "\",\"themes\":" + storeThemesJson() + ",\"count\":" + String(storeCount()) + "}";
  return s;
}

/* Commands that only steer playback. Over Bluetooth (no pairing, anyone in
 * range can connect) only these are accepted; settings that could lock the
 * owner out (Wi-Fi, passwords, reset, delete) need USB serial or the web page. */
static bool remote_ok(const String &cmd) {
  static const char *ok[] = { "list", "names", "state", "play", "next", "cycle", "status", "screen", "brightness", "theme", "speed", "loops", "rotation", "help" };
  for (const char *c : ok) if (cmd == c) return true;
  return false;
}

void app_command(const String &line, Print &out, bool remote) {
  String cmd = line, arg;
  cmd.trim();
  int sp = cmd.indexOf(' ');
  if (sp > 0) { arg = cmd.substring(sp + 1); cmd = cmd.substring(0, sp); }
  arg.trim();
  if (cmd.isEmpty()) return;
  if (remote && !remote_ok(cmd)) { out.printf("%s: not available over Bluetooth (use USB serial or the web page)\n", cmd.c_str()); return; }
  if (cmd == "list") {
    Lock l;
    for (size_t i = 0; i < storeCount(); i++) out.printf("  %s (%u bytes%s)\n", storeEntry(i).name.c_str(), (unsigned)storeEntry(i).len, storeEntry(i).builtin ? ", built-in" : "");
    out.printf("  %u KB free for uploads\n", (unsigned)(storeFreeBytes() / 1024));
  } else if (cmd == "names") {
    Lock l;
    String s = "names ";
    for (size_t i = 0; i < storeCount(); i++) { if (i) s += ','; s += storeEntry(i).name; }
    out.println(s);
  } else if (cmd == "state") {
    out.println("state " + app_state_json());
  } else if (cmd == "delete") {
    Lock l;
    out.println(storeDelete(arg.c_str()) ? "deleted" : "not found or built-in");
    app_animations_changed(arg.c_str());
  } else if (cmd == "play") {
    if (!app_play(arg.c_str())) out.printf("no animation named '%s' (try: list)\n", arg.c_str());
  } else if (cmd == "next") {
    Lock l;
    start_animation(cycling ? next_in_cycle(current) : current + 1);
    state_changed();
  } else if (cmd == "cycle") {
    if (arg.length()) { cfg.cycleList = (arg == "all") ? "" : arg; configSave(); out.printf("cycle list '%s'\n", cfg.cycleList.c_str()); }
    app_play("cycle");
  } else if (cmd == "status") {
    print_status(out);
  } else if (cmd == "ble") {
    cfg.ble = (arg == "on" || arg == "1"); configSave(); out.printf("bluetooth %s, rebooting\n", cfg.ble ? "on" : "off"); delay(200); ESP.restart();
  } else if (cmd == "wifi") {
    int s2 = arg.indexOf(' ');
    cfg.ssid = s2 > 0 ? arg.substring(0, s2) : arg;
    cfg.pass = s2 > 0 ? arg.substring(s2 + 1) : "";
    configSave(); out.println("saved, rebooting"); delay(200); ESP.restart();
  } else if (cmd == "mqtt") {
    String parts[4]; int k = 0;
    for (int i = 0; i < (int)arg.length() && k < 4; ) { int e = arg.indexOf(' ', i); if (e < 0) e = arg.length(); parts[k++] = arg.substring(i, e); i = e + 1; }
    cfg.mqttHost = parts[0];
    if (parts[1].length()) cfg.mqttPort = parts[1].toInt();
    cfg.mqttUser = parts[2]; cfg.mqttPass = parts[3];
    configSave(); out.println("saved, rebooting"); delay(200); ESP.restart();
  } else if (cmd == "prefix") {
    cfg.mqttPrefix = arg; configSave(); out.println("saved, rebooting"); delay(200); ESP.restart();
  } else if (cmd == "name") {
    cfg.name = arg; configSave(); out.println("saved, rebooting"); delay(200); ESP.restart();
  } else if (cmd == "rotation") {
    cfg.rotation = arg.toInt() & 3; configSave(); app_apply_settings(); out.printf("rotation %u\n", cfg.rotation);
  } else if (cmd == "loops") {
    int v = arg.toInt(); if (v >= 1 && v <= 50) { cfg.loops = v; configSave(); } out.printf("loops %u\n", cfg.loops);
  } else if (cmd == "speed") {
    int v = arg.toInt(); if (v >= 25 && v <= 400) { cfg.speed = v; configSave(); } out.printf("speed %u%%\n", cfg.speed);
  } else if (cmd == "theme") {
    for (char c : arg) if (!isalnum((unsigned char)c)) { out.println("theme names are letters and digits"); return; }
    app_set_theme(arg == "none" ? "" : arg.c_str());
  } else if (cmd == "screen") {
    app_screen(arg == "on" || arg == "1"); cfg.screenOn = screen_on; configSave();
  } else if (cmd == "brightness") {
    int v = arg.toInt(); if (v >= 10 && v <= 100) { app_brightness(v); cfg.brightness = v; configSave(); } out.printf("brightness %u%%\n", brightness);
  } else if (cmd == "appass") {
    if (arg.isEmpty() || arg.length() >= 8) { cfg.apPass = arg; configSave(); out.println("saved (takes effect next time the AP starts)"); }
    else out.println("AP password needs at least 8 characters");
  } else if (cmd == "ap") {
    netStartAp();
  } else if (cmd == "reset") {
    configClear(); out.println("settings erased, rebooting"); delay(200); ESP.restart();
  } else if (cmd == "reboot") {
    ESP.restart();
  } else if (remote) {
    out.println("commands: names | state | list | play <name>|cycle | next | cycle [a,b|all] | screen on|off | brightness <10-100> | theme <t>|none | speed <pct> | loops <n> | rotation 0-3 | status");
  } else {
    out.println("commands: list | names | state | delete <n> | play <name> | next | cycle [a,b|all] | status | wifi <ssid> <pass> | mqtt <host> [port] [user] [pass] | prefix <p> | name <n> | rotation 0-3 | loops <n> | speed <pct> | theme <t>|none | screen on|off | brightness <pct> | ble on|off | appass <p> | ap | reset | reboot");
  }
}

static void handle_serial() {
  static char line[160];
  static size_t n = 0;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c != '\n') { if (n < sizeof(line) - 1) line[n++] = c; continue; }
    line[n] = 0; n = 0;
    app_command(String(line), Serial, false);
  }
}

// ---- tasks -----------------------------------------------------------------------

/* Core 0: rendering only. Blocking network calls on core 1 (uploads, MQTT
 * connect, Wi-Fi scan) never stall the animation. */
static void render_task(void *) {
  uint32_t last_loading = 0;
  for (;;) {
    {
      Lock l;
      if (mode == MODE_ANIM) render_step();
      else if (mode == MODE_MESSAGE && mode_dirty) { draw_message(); mode_dirty = false; }
    }
    if (mode == MODE_LOADING && (mode_dirty || millis() - last_loading >= 40)) {
      bool full = mode_dirty;
      mode_dirty = false;
      if (screen_on) draw_loading(full);
      last_loading = millis();
    }
    vTaskDelay(1);   // also keeps core 0's idle task (and its watchdog) happy
  }
}

void setup() {
  Serial.begin(115200);
  mx = xSemaphoreCreateRecursiveMutex();
  tft.init();
  configLoad();
  tft.setRotation(cfg.rotation);
  tft.setSwapBytes(true);   // DBA pixels are native little-endian uint16_t
  tft.fillScreen(TFT_BLACK);

  brightness = cfg.brightness;
  build_dim_lut();
  storeBegin();
  if (!app_play(cfg.anim.c_str())) start_animation(0);
  if (!have_anim) { msg1 = "no animations"; msg2 = "push one from the sim"; mode = MODE_MESSAGE; mode_dirty = true; }

  netBegin();
  mqttBegin();
  bleBegin();
  if (netApActive()) {
    app_message(("Wi-Fi: " + netApSsid()).c_str(), ("http://" + netIp() + "/").c_str());
    draw_message(); mode_dirty = false;
    delay(2500);                                   // show the setup hint once, then animate
    app_resume();
  }
  if (!cfg.screenOn) app_screen(false);
  print_status(Serial);

  xTaskCreatePinnedToCore(render_task, "render", 8192, NULL, 2, NULL, 0);
}

/* Core 1: network + serial console. */
void loop() {
  handle_serial();
  netLoop();
  mqttLoop();
  bleLoop();
  delay(1);
}
