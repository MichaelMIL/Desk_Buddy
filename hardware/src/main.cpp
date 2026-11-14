/*
 * Desk buddy firmware: plays DBA1 animations (exported from sim/) on the
 * round GC9A01 display. Faces are chosen over Bluetooth LE (ble.cpp), MQTT,
 * the HTTP API (net.cpp, hardware/API.md) or the serial console; new faces
 * arrive over the HTTP API, Bluetooth or USB serial (upload.cpp).
 * Built with -DBUDDY_WIFI=0 there is no Wi-Fi, MQTT or HTTP API (see config.h).
 *
 * Tasks: a render task pinned to core 0 draws frames; the Arduino loop
 * (core 1) runs Wi-Fi, the API server, uploads, OTA, MQTT, Bluetooth commands
 * and the serial console. The player lock guards the shared state; only this file draws.
 *
 * Serial (115200):
 *   list                    print animation names (built-in and stored)
 *   names | state | config  one-line machine-readable list / state / settings (JSON)
 *   delete <name>           remove a stored animation
 *   play <name>             play one animation and stay on it ("play cycle" resumes cycling)
 *   next | cycle [a,b|all]  skip / resume cycling (optionally set the cycle list)
 *   status                  wifi / mqtt / animation / battery state
 *   battery [cal <mV>|cal reset]  battery level as JSON; calibrate against a multimeter (battery.h)
 *   alerts [low off|<min>] [charging off|0|<min>] [test <pool>]   low battery / charging animations:
 *                           settings and pools as JSON; "test" plays one from a pool now
 *   wifi <ssid> <password>  save Wi-Fi credentials and reboot ("quote" an SSID with spaces)
 *   mqtt <host> [port] [user] [password]   save broker settings and reboot
 *   prefix <topic prefix>   MQTT topic prefix (default deskbuddy/<id>)
 *   ha on|off               Home Assistant MQTT discovery
 *   otapass <password>      firmware update password (empty = none)
 *   start <name>|cycle      what plays after a reboot
 *   name <device name>      device name (Bluetooth, Home Assistant, mDNS host)
 *   rotation 0|1|2|3        display rotation (x 90 degrees)
 *   loops <n>               loops per face when cycling
 *   speed <percent>         playback speed, 25..400
 *   theme <name>|none       select a theme: "<theme>__name" animations play only in their theme
 *   screen on|off           display on/off
 *   brightness <10-100>     software dimming (the backlight is hard-wired)
 *   ble on|off              Bluetooth LE control (saved, reboots)
 *   ble forget              forget every paired Bluetooth device
 *   appass <password>       setup AP password (empty = open)
 *   ap                      start the setup access point now
 *   reset                   erase all settings and reboot
 *   upload <name> <bytes>   receive an animation on this channel (protocol in upload.h)
 *   reboot
 *
 * A paired Bluetooth device runs the same commands (app_command).
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
#include "upload.h"
#include "battery.h"

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
static String msg1, msg2, msg_big, load_label;   // msg_big: large centre line (pairing code)
static volatile int load_pct = -1;
static uint32_t frames_rendered = 0;
// alert: an animation (or a text screen when it is not on the buddy) shown between the
// faces, e.g. low battery; afterwards playback goes back to what it interrupted
static const uint32_t ALERT_LOOPS = 2, ALERT_TEXT_MS = 5000;
static bool alert_on = false, alert_was_cycling = false;
static String alert_resume;              // the animation it interrupted
static uint32_t alert_until = 0;         // text alert: ends at this time (0 = an animation alert)

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
  if (msg_big.length()) {                 // e.g. a pairing code: font 4 at double size, ~52 px tall
    tft.drawString(msg1, 120, 72, 2);
    tft.setTextSize(2);
    tft.drawString(msg_big, 120, 122, 4);
    tft.setTextSize(1);
    tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
    tft.drawString(msg2, 120, 170, 2);
    return;
  }
  tft.drawString(msg1, 120, 108, 2);
  tft.drawString(msg2, 120, 132, 2);
}

/* Loading ring: a spinner on the outer ring, the progress on the inner ring and
 * the percentage in the middle. Called every ~40 ms. */
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
    // no name on screen: the spinner ring ran through it. load_label only marks a new upload.
    tft.fillScreen(TFT_BLACK);
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
  if (cfg.cycleList.isEmpty()) return !n.startsWith("battery_") && !n.startsWith("charging_");   // alerts, played by battery_alerts()
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

/* Back to what the alert interrupted: the next face when cycling, else the same one. */
static void alert_end() {
  alert_on = false; alert_until = 0;
  cycling = alert_was_cycling;
  int i = alert_resume.length() ? storeFind(alert_resume.c_str()) : -1;
  if (i >= 0) start_animation(cycling ? next_in_cycle(i) : (size_t)i);
  else if (storeCount()) start_animation(next_in_cycle(current));
  else { release_current(); msg1 = "no animations"; msg2 = "push one from the sim"; msg_big = ""; mode = MODE_MESSAGE; mode_dirty = true; }
}

/* One frame of the animation (or nothing if it is not due yet). */
static void render_step() {
  if (!have_anim || !screen_on) return;
  if ((int32_t)(millis() - next_frame_at) < 0) return;
  int ended = 0;
  uint16_t hold = dba_render_next(&anim, rowbuf, push_row, NULL, &ended);
  // records with delay 0 are parts of the same picture (the encoder splits a frame whose
  // changes are far apart into several rectangles): draw the rest now, not 1 ms apart
  for (int part = 1; hold == 0 && !ended && part < 256; part++) hold = dba_render_next(&anim, rowbuf, push_row, NULL, &ended);
  frames_rendered++;
  uint32_t scaled = (uint32_t)hold * 100 / cfg.speed;
  next_frame_at += scaled ? scaled : 1;
  if ((int32_t)(millis() - next_frame_at) > 500) next_frame_at = millis();   // fell behind: resync
  if (ended) {
    loops_done++;
    bool once = !(anim.flags & DBA_FLAG_LOOP);
    if (alert_on) { if (loops_done >= ALERT_LOOPS || once) alert_end(); return; }
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
const char *app_current() { Lock l; return (cycling || !have_anim) ? "cycle" : alert_on ? alert_resume.c_str() : cur_name.c_str(); }
bool app_screen_on() { return screen_on; }
uint32_t app_frames_rendered() { return frames_rendered; }

bool app_play(const char *name) {
  Lock l;
  if (!strcmp(name, "cycle") || !*name) {
    alert_on = false;                                   // a choice ends an alert (cycling is untouched by one)
    cycling = true; loops_done = 0;
    if (!have_anim || !in_cycle(current)) start_animation(next_in_cycle(current));
    else mode = MODE_ANIM;
    state_changed();
    return true;
  }
  int i = storeFind(name);
  if (i < 0) return false;                              // unknown: an alert carries on
  alert_on = false;
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
  if (alert_on) alert_end();
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

/* A text alert gives way to any other screen; an animation alert carries on after it. */
static void text_alert_off() { if (alert_on && alert_until) { alert_on = false; alert_until = 0; } }

void app_message(const char *l1, const char *l2) {
  Lock l;
  text_alert_off();
  msg1 = l1; msg2 = l2; msg_big = "";
  mode = MODE_MESSAGE; mode_dirty = true;
}

void app_message_big(const char *l1, const char *big, const char *l2) {
  Lock l;
  text_alert_off();
  msg1 = l1; msg_big = big; msg2 = l2;
  if (!screen_on) tft.writecommand(0x29);          // must be seen even with the screen switched off; app_resume() turns it off again
  mode = MODE_MESSAGE; mode_dirty = true;
}

void app_loading(const char *label, int percent) {
  load_pct = percent;                                   // lock-free: the render loop just reads it
  if (mode != MODE_LOADING || load_label != label) {   // once per upload
    Lock l;
    text_alert_off();
    load_label = label; mode = MODE_LOADING; mode_dirty = true;
  }
}

void app_resume() {
  Lock l;
  text_alert_off();
  if (!screen_on) { tft.fillScreen(TFT_BLACK); tft.writecommand(0x28); }   // undo app_message_big's display-on
  if (have_anim) start_animation(current);
  else { msg1 = "no animations"; msg2 = "push one from the sim"; mode = MODE_MESSAGE; mode_dirty = true; }
}

#if BUDDY_BATTERY
static bool show_alert(const char *name, const char *l1, const char *big, const char *l2) {
  Lock l;
  if (alert_on || !screen_on || mode != MODE_ANIM) return false;   // not over a pairing code, an upload or a dark screen
  alert_was_cycling = cycling;
  alert_resume = have_anim ? cur_name : "";
  int i = storeFind(name);
  if (i >= 0 && start_animation(i)) { alert_on = true; alert_until = 0; }
  else {
    msg1 = l1; msg_big = big; msg2 = l2;
    mode = MODE_MESSAGE; mode_dirty = true;
    alert_on = true; alert_until = millis() + ALERT_TEXT_MS;
  }
  Serial.printf("alert: %s\n", alert_until ? "text" : name);
  return true;
}

/* Alert pools, by name: battery_critical* -> critical, other battery_* -> low,
 * charging_plugged* -> plugged, charging_full* -> full, other charging_* -> charging.
 * So a new "Charging: full ..." animation in the simulator joins its pool by itself. */
enum Pool { POOL_LOW, POOL_CRITICAL, POOL_PLUGGED, POOL_CHARGING, POOL_FULL, POOL_COUNT };
static const char *const POOL_NAMES[POOL_COUNT] = {"low", "critical", "plugged", "charging", "full"};

static int pool_of(const String &n) {
  if (n.startsWith("battery_critical")) return POOL_CRITICAL;
  if (n.startsWith("battery_")) return POOL_LOW;
  if (n.startsWith("charging_plugged")) return POOL_PLUGGED;
  if (n.startsWith("charging_full")) return POOL_FULL;
  if (n.startsWith("charging_")) return POOL_CHARGING;
  return -1;
}

/* A random animation from the pool, not `avoid` when there is another; "" when it is empty. */
static String pick(int pool, const String &avoid) {
  Lock l;
  size_t n = 0, skip = 0;
  for (size_t i = 0; i < storeCount(); i++)
    if (pool_of(storeEntry(i).name) == pool) { n++; if (storeEntry(i).name == avoid) skip = 1; }
  if (n == 0) return "";
  if (n == 1) skip = 0;
  size_t k = esp_random() % (n - skip);
  for (size_t i = 0; i < storeCount(); i++) {
    const String &name = storeEntry(i).name;
    if (pool_of(name) != pool || (skip && name == avoid)) continue;
    if (k-- == 0) return name;
  }
  return "";
}

/* Plays a random animation from the pool as an alert. An empty critical pool uses
 * the low one, an empty plugged pool the charging one; with nothing to play, a text
 * screen (but nothing for the every-few-minutes charging pool). 1 shown (`shown` says
 * what, "" for the text), 0 nothing to show, -1 not now (screen off or busy). */
static int play_pool(int pool, String &shown) {
  static String last[POOL_COUNT];                // not the same one twice in a row
  int p = pool;
  shown = pick(p, last[p]);
  if (shown.isEmpty() && p == POOL_CRITICAL) shown = pick(p = POOL_LOW, last[POOL_LOW]);
  if (shown.isEmpty() && p == POOL_PLUGGED) shown = pick(p = POOL_CHARGING, last[POOL_CHARGING]);
  if (shown.isEmpty() && pool == POOL_CHARGING) return 0;
  BatteryInfo b = batteryGet();
  char pct[8] = "";
  if (b.present) snprintf(pct, sizeof(pct), "%u%%", b.pct);
  bool low = pool == POOL_LOW || pool == POOL_CRITICAL;
  if (!show_alert(shown.c_str(), low ? "Battery low" : pool == POOL_FULL ? "Battery charged" : "Charging", pct,
                  low ? "connect USB-C to charge" : "")) return -1;
  if (shown.length()) last[p] = shown;
  return 1;
}

/* Between half and one and a half times `minutes`: the alerts come at random times. */
static uint32_t random_gap(uint32_t minutes) {
  uint32_t ms = minutes * 60000UL;
  return ms / 2 + esp_random() % (ms + 1);
}

/* Battery alerts between the faces; each plays twice (once if it does not loop), then
 * playback resumes:
 * - low (15 %, off the charger, cfg.alertLow > 0): at once, then about every
 *   cfg.alertLow minutes (about every minute when critical, 5 %), from the low pool
 *   (critical pool when critical);
 * - plugged in (the charger's CHRG pad, cfg.alertCharging >= 0): the plugged pool, then
 *   about every cfg.alertCharging minutes while charging the charging pool (0: never);
 * - charged (STDBY): the full pool, once per time on the charger. */
static void battery_alerts() {
  static uint32_t tried = 0, lowNext = 0, chgNext = 0;
  static bool lowShown = false, plugShown = false, fullShown = false;
  BatteryInfo b = batteryGet();
  uint32_t now = millis();
  bool charger = b.charging || b.full;
  if (!charger) plugShown = fullShown = false;  // a TP4056 that tops up after "full" is not a new plug-in
  bool low = b.present && b.low && !charger && cfg.alertLow > 0;
  if (!low) lowShown = false;
  bool chg = cfg.alertCharging >= 0;
  int pool;
  if (chg && b.full && !fullShown) pool = POOL_FULL;
  else if (chg && b.charging && !plugShown) pool = POOL_PLUGGED;
  else if (chg && b.charging && cfg.alertCharging > 0 && (int32_t)(now - chgNext) >= 0) pool = POOL_CHARGING;
  else if (low && (!lowShown || (int32_t)(now - lowNext) >= 0)) pool = b.critical ? POOL_CRITICAL : POOL_LOW;
  else return;
  if (now - tried < 1000) return;              // screen off or busy: look again in a second
  tried = now;
  String shown;
  if (play_pool(pool, shown) < 0) return;
  if (pool == POOL_FULL) fullShown = true;
  else if (pool == POOL_PLUGGED || pool == POOL_CHARGING) { plugShown = true; chgNext = now + random_gap(cfg.alertCharging); }
  else { lowShown = true; lowNext = now + random_gap(b.critical ? 1 : cfg.alertLow); }
}

/* The settings and the pools as one line of JSON ("alerts"). */
static String alerts_json() {
  String pools[POOL_COUNT];
  {
    Lock l;
    for (size_t i = 0; i < storeCount(); i++) {
      const String &n = storeEntry(i).name;
      int p = pool_of(n);
      if (p >= 0) pools[p] += (pools[p].length() ? "," : "") + jsonStr(n);
    }
  }
  String s = "{\"low\":" + String(cfg.alertLow) + ",\"charging\":" + String(cfg.alertCharging) + ",\"pools\":{";
  for (int p = 0; p < POOL_COUNT; p++) s += String(p ? "," : "") + "\"" + POOL_NAMES[p] + "\":[" + pools[p] + "]";
  return s + "}}";
}

/* "alerts", "alerts low off|<minutes>", "alerts charging off|0|<minutes>", "alerts test <pool>". */
static void alerts_command(const String &arg, Print &out) {
  int sp = arg.indexOf(' ');
  String what = sp < 0 ? arg : arg.substring(0, sp), v = sp < 0 ? String() : arg.substring(sp + 1);
  v.trim();
  if (what == "test") {
    int p = -1;
    for (int i = 0; i < POOL_COUNT; i++) if (v == POOL_NAMES[i]) p = i;
    if (p < 0) { out.println("alerts test low|critical|plugged|charging|full"); return; }
    { Lock l; if (alert_on) alert_end(); }
    String shown;
    int r = play_pool(p, shown);
    if (r < 0) out.println("alerts: not now (the screen is off or showing something else)");
    else if (r == 0) out.printf("alerts: the %s pool is empty\n", POOL_NAMES[p]);
    else out.printf("alerts: playing %s\n", shown.length() ? shown.c_str() : "the text screen (no animation in the pool)");
    return;
  }
  if (what == "low" && v.length()) {
    int m = v == "off" ? 0 : v.toInt();
    if (m < 0 || m > 120 || (m == 0 && v != "off" && v != "0")) { out.println("alerts low off|<minutes 1-120>"); return; }
    cfg.alertLow = m; configSave();
  } else if (what == "charging" && v.length()) {
    int m = v == "off" ? -1 : v.toInt();
    if (m < -1 || m > 120 || (m == 0 && v != "0")) { out.println("alerts charging off|0|<minutes 1-120> (0: only when plugged in and when charged)"); return; }
    cfg.alertCharging = m; configSave();
  } else if (what.length()) {
    out.println("alerts [low off|<min>] [charging off|0|<min>] [test low|critical|plugged|charging|full]");
    return;
  }
  out.println("alerts " + alerts_json());
}
#endif

// ---- serial console -------------------------------------------------------------

static void print_status(Print &out) {
  Lock l;
  out.printf("animation: %s%s, theme '%s', screen %s, brightness %u%%, rotation %u, speed %u%%, loops %u, cycle list '%s', frames rendered %lu\n", app_current(), cycling ? " (cycling)" : "",
                cfg.theme.c_str(), screen_on ? "on" : "off", brightness, cfg.rotation, cfg.speed, cfg.loops, cfg.cycleList.c_str(), (unsigned long)frames_rendered);
#if BUDDY_WIFI
  out.printf("name: %s (http://%s.local/), setup AP %s\n", cfg.name.c_str(), hostName().c_str(), cfg.apPass.length() ? "password-protected" : "open");
  out.printf("wifi: %s%s\n", netConnected() ? ("connected, " + netIp()).c_str() : "not connected",
                netApActive() ? (" | setup AP " + netApSsid() + " at " + netIp()).c_str() : "");
  out.printf("mqtt: %s (%s:%u, prefix %s)\n", mqttStatus().c_str(), cfg.mqttHost.c_str(), cfg.mqttPort, cfg.mqttPrefix.c_str());
#else
  out.printf("name: %s, build without Wi-Fi (Bluetooth + USB only), firmware " FW_VERSION "\n", cfg.name.c_str());
#endif
  out.printf("bluetooth: %s\n", bleStatus().c_str());
  out.printf("battery: %s\n", batteryText().c_str());
  out.printf("device id: %s, free heap: %u, store: %u animations, %u KB free\n", deviceId().c_str(), ESP.getFreeHeap(), (unsigned)storeCount(), (unsigned)(storeFreeBytes() / 1024));
}

/* Machine-readable state, one line of JSON (Bluetooth state characteristic, "state" command).
 * Kept short so a notification carries all of it; themes come from "names". */
String app_state_json() {
  Lock l;
  String s = "{\"current\":\"" + String(app_current()) + "\",\"cycling\":" + (cycling ? "true" : "false");
  s += ",\"screen\":" + String(screen_on ? "true" : "false") + ",\"brightness\":" + String(brightness);
  s += ",\"theme\":\"" + cfg.theme + "\",\"count\":" + String(storeCount()) + batteryStateJson() + "}";   // ~135 bytes: one notification at MTU 185
  return s;
}

/* Settings and status as one line of JSON, for clients ("config" command). */
static String app_config_json() {
  Lock l;
  String s = "{\"name\":" + jsonStr(cfg.name) + ",\"version\":\"" FW_VERSION "\",\"wifiBuild\":" + (BUDDY_WIFI ? "true" : "false");
  s += ",\"speed\":" + String(cfg.speed) + ",\"loops\":" + String(cfg.loops) + ",\"rotation\":" + String(cfg.rotation);
  s += ",\"cycleList\":" + jsonStr(cfg.cycleList) + ",\"start\":" + jsonStr(cfg.anim);
  s += ",\"count\":" + String(storeCount()) + ",\"freeKb\":" + String(storeFreeBytes() / 1024) + ",\"totalKb\":" + String(storeTotalBytes() / 1024);
  s += ",\"bonds\":" + String(bleBondCount());
#if BUDDY_BATTERY
  s += ",\"battery\":" + batteryJson() + ",\"alerts\":{\"low\":" + String(cfg.alertLow) + ",\"charging\":" + String(cfg.alertCharging) + "}";
#endif
#if BUDDY_WIFI
  s += ",\"wifi\":{\"ssid\":" + jsonStr(cfg.ssid) + ",\"connected\":" + (netConnected() ? "true" : "false") + ",\"ip\":" + jsonStr(netIp());
  s += ",\"ap\":" + jsonStr(netApActive() ? netApSsid() : String()) + ",\"apPassSet\":" + (cfg.apPass.length() ? "true" : "false") + "}";
  s += ",\"mqtt\":{\"host\":" + jsonStr(cfg.mqttHost) + ",\"port\":" + String(cfg.mqttPort) + ",\"user\":" + jsonStr(cfg.mqttUser);
  s += ",\"prefix\":" + jsonStr(cfg.mqttPrefix) + ",\"ha\":" + (cfg.haDiscovery ? "true" : "false") + ",\"status\":" + jsonStr(mqttStatus()) + "}";
  s += ",\"otaPassSet\":" + String(cfg.otaPass.length() ? "true" : "false");
#endif
  return s + "}";
}

#if !BUDDY_WIFI
static bool wifi_only(const String &cmd) {
  static const char *w[] = { "wifi", "mqtt", "prefix", "appass", "ap", "ha", "otapass" };
  for (const char *c : w) if (cmd == c) return true;
  return false;
}
#endif

void app_command(const String &line, Print &out) {
  String cmd = line, arg;
  cmd.trim();
  int sp = cmd.indexOf(' ');
  if (sp > 0) { arg = cmd.substring(sp + 1); cmd = cmd.substring(0, sp); }
  arg.trim();
  if (cmd.isEmpty()) return;
#if !BUDDY_WIFI
  if (wifi_only(cmd)) { out.printf("%s: this build has no Wi-Fi\n", cmd.c_str()); return; }
#endif
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
  } else if (cmd == "config") {
    out.println("config " + app_config_json());
  } else if (cmd == "start") {
    if (arg != "cycle" && storeFind(arg.c_str()) < 0) { out.printf("no animation named '%s'\n", arg.c_str()); return; }
    cfg.anim = arg == "cycle" ? "" : arg; configSave(); out.printf("start '%s'\n", arg.c_str());
  } else if (cmd == "ha") {
    cfg.haDiscovery = (arg == "on" || arg == "1"); configSave(); mqttPublishAnimations(); out.printf("home assistant discovery %s\n", cfg.haDiscovery ? "on" : "off");
  } else if (cmd == "otapass") {
    cfg.otaPass = arg; configSave(); out.println(arg.length() ? "firmware update password set (OTA restarts with it after a reboot)" : "firmware update password removed");
  } else if (cmd == "delete") {
    Lock l;
    out.println(storeDelete(arg.c_str()) ? "deleted" : "not found or built-in");
    app_animations_changed(arg.c_str());
  } else if (cmd == "play") {
    if (!app_play(arg.c_str())) out.printf("no animation named '%s' (try: list)\n", arg.c_str());
  } else if (cmd == "next") {
    Lock l;
    if (alert_on) { alert_end(); state_changed(); return; }   // skips the alert
    start_animation(cycling ? next_in_cycle(current) : current + 1);
    state_changed();
  } else if (cmd == "cycle") {
    if (arg.length()) { cfg.cycleList = (arg == "all") ? "" : arg; configSave(); out.printf("cycle list '%s'\n", cfg.cycleList.c_str()); }
    app_play("cycle");
  } else if (cmd == "status") {
    print_status(out);
  } else if (cmd == "battery") {
    batteryCommand(arg, out);
  } else if (cmd == "alerts") {
#if BUDDY_BATTERY
    alerts_command(arg, out);
#else
    out.println("alerts: not in this build (BUDDY_BATTERY=0)");
#endif
  } else if (cmd == "ble" && arg == "forget") {
    bleForgetAll(); out.println("forgot all paired Bluetooth devices (remove the buddy on those devices too)");
  } else if (cmd == "ble") {
    if (!BUDDY_WIFI && arg != "on") { out.println("bluetooth stays on: this build has no Wi-Fi"); return; }
    cfg.ble = (arg == "on" || arg == "1"); configSave(); out.printf("bluetooth %s, rebooting\n", cfg.ble ? "on" : "off"); delay(200); ESP.restart();
  } else if (cmd == "wifi") {
    // wifi <ssid> <password>, or wifi "<ssid with spaces>" <password>
    int s2;
    if (arg.startsWith("\"")) { int q = arg.indexOf('"', 1); cfg.ssid = q > 0 ? arg.substring(1, q) : arg.substring(1); s2 = q > 0 ? q + 1 : arg.length(); }
    else { s2 = arg.indexOf(' '); cfg.ssid = s2 > 0 ? arg.substring(0, s2) : arg; if (s2 < 0) s2 = arg.length(); }
    cfg.pass = arg.substring(s2); cfg.pass.trim();
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
    configClear(); bleForgetAll(); out.println("settings erased, rebooting"); delay(200); ESP.restart();
  } else if (cmd == "upload") {
    int s2 = arg.indexOf(' ');
    long bytes = s2 > 0 ? arg.substring(s2 + 1).toInt() : 0;
    uploadStart(s2 > 0 ? arg.substring(0, s2) : arg, bytes > 0 ? (size_t)bytes : 0, out);
  } else if (cmd == "reboot") {
    out.println("rebooting"); delay(200); ESP.restart();
  } else {
    out.println("commands: list | names | state | config | delete <n> | play <name> | next | cycle [a,b|all] | start <name>|cycle | status | battery [cal <mV>] | alerts [low|charging <min>|test <pool>] | "
#if BUDDY_WIFI
                "wifi <ssid> <pass> | mqtt <host> [port] [user] [pass] | prefix <p> | ha on|off | appass <p> | otapass <p> | ap | "
#endif
                "name <n> | rotation 0-3 | loops <n> | speed <pct> | theme <t>|none | screen on|off | brightness <pct> | ble on|off|forget | upload <name> <bytes> | reset | reboot");
  }
}

static void handle_serial() {
  static char line[160];
  static size_t n = 0;
  uint8_t buf[256];
  while (Serial.available()) {
    if (uploadActive(Serial)) {            // mid-upload: the bytes are animation data
      size_t k = Serial.read(buf, min((size_t)Serial.available(), sizeof(buf)));
      uploadFeed(buf, k);
      continue;
    }
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c != '\n') { if (n < sizeof(line) - 1) line[n++] = c; continue; }
    line[n] = 0; n = 0;
    app_command(String(line), Serial);
    Serial.flush();                        // send the reply now, not when a 64-byte USB packet fills
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
      if (alert_on && alert_until && (int32_t)(millis() - alert_until) >= 0) alert_end();
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
  Serial.setRxBufferSize(4096);   // > one upload window (upload.h); the USB driver drops bytes when it is full
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

  batteryBegin();
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
  uploadPoll();
#if BUDDY_BATTERY
  batteryLoop();
  battery_alerts();
#endif
  delay(1);
}
