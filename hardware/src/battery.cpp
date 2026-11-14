#include "battery.h"
#if BUDDY_BATTERY                 // else battery.h has stubs and this file is empty
#include "ble.h"
#include "mqtt.h"
#include <driver/adc.h>
#include <driver/gpio.h>
#include <driver/rtc_io.h>
#include <esp_adc_cal.h>

static BatteryInfo info = {};

/* Cell voltage (light load, ~100 mA) -> percent. A LiPo spends most of its
 * charge between 3.7 and 3.9 V, so the middle of the table is dense. */
static const uint16_t CURVE[][2] = {
  {4200, 100}, {4100, 90}, {4000, 80}, {3920, 70}, {3870, 60}, {3830, 50},
  {3790, 40}, {3750, 30}, {3710, 20}, {3670, 10}, {3600, 5}, {3300, 0},
};

static uint8_t percentOf(uint32_t mv) {
  if (mv >= CURVE[0][0]) return 100;
  for (size_t i = 1; i < sizeof(CURVE) / sizeof(CURVE[0]); i++) {
    if (mv < CURVE[i][0]) continue;
    uint32_t v0 = CURVE[i][0], v1 = CURVE[i - 1][0], p0 = CURVE[i][1], p1 = CURVE[i - 1][1];
    return (uint8_t)(p0 + (mv - v0) * (p1 - p0) / (v1 - v0));
  }
  return 0;
}

BatteryInfo batteryGet() { return info; }

static const char *chgJson() { return info.charging ? ",\"chg\":\"charging\"" : info.full ? ",\"chg\":\"full\"" : ""; }

String batteryJson() {
  if (!info.present) return String("{\"present\":false") + chgJson() + "}";
  return "{\"present\":true,\"mv\":" + String(info.mv) + ",\"pct\":" + String(info.pct) + ",\"low\":" + (info.low ? "true" : "false") + chgJson() + "}";
}

String batteryStateJson() {
  return String(",\"bat\":") + (info.present ? String(info.pct) : String("null")) + ",\"batLow\":" + (info.present && info.low ? "true" : "false") + chgJson();
}

String batteryText() {
  String s = !info.present ? "none (nothing on GPIO " + String(BAT_PIN) + ")"
    : String(info.critical ? "critical, " : info.low ? "low, " : "") + String(info.pct) + "% (" + String(info.mv) + " mV)";
  return s + (info.charging ? ", charging" : info.full ? ", charged" : "");
}

static const uint32_t SAMPLE_MS = 2000;       // one reading (16 samples averaged) every 2 s
static const uint32_t PROBE_MS = 30000;       // pull-down check for a divider this often
static const uint32_t PROBE_SETTLE_MS = 30;   // pull-down on this long before reading (100 nF: tau ~2.4 ms)
static const uint32_t AFTER_PROBE_MS = 100;   // and off this long before the next real reading (tau ~5 ms)
static const int PROBE_RAW = 200;             // ~150 mV with the pull-down on: below that the pin is floating
static const uint32_t MIN_CELL_MV = 2500, MAX_CELL_MV = 4700;   // outside: no cell (unplugged, cut off by its protection)

static adc1_channel_t ch;
static esp_adc_cal_characteristics_t cal;
static bool ready = false, wired = false, probing = false;
static uint32_t probeAt = 0, lastProbe = 0, lastSample = 0, reportedAt = 0;
static uint32_t filtered = 0;                 // cell mV x 16, before calibration (moving average)
static uint8_t charger = 0;                   // 0 off the charger (or not wired), 1 charging, 2 full
static const uint32_t CHARGER_POLL_MS = 100;
static const uint32_t CHARGER_STABLE_MS = 2000;   // a TP4056 without a cell blinks CHRG: only steady changes count

static uint32_t calibrated(uint32_t mv) { return mv * cfg.batCal / 10000; }

/* The state other modules see. Small changes in the percentage are held back
 * (a 1 % wobble would notify every 2 s): 2 % or more, or 1 % that lasts a minute. */
static void publish(BatteryInfo n) {
  bool changed = n.present != info.present || n.low != info.low || n.critical != info.critical ||
                 n.charging != info.charging || n.full != info.full;
  if (!changed && n.present) {
    int d = abs((int)n.pct - (int)info.pct);
    if (d >= 2 || (d == 1 && millis() - reportedAt >= 60000)) changed = true;
    else n.pct = info.pct;
  }
  bool presence = n.present != info.present;
  info = n;
  if (!changed) return;
  reportedAt = millis();
  bleStateChanged();
  mqttPublishState();
  if (presence) mqttPublishAnimations();      // adds or drops the Home Assistant battery sensor
}

static void update() {
  BatteryInfo n = {};
  uint32_t mv = calibrated(filtered / 16);
  n.present = wired && mv >= MIN_CELL_MV && mv <= MAX_CELL_MV;
  if (n.present) {
    n.mv = (uint16_t)mv;
    n.pct = percentOf(mv);
    n.low = info.low ? n.pct < BAT_OK_PCT : n.pct <= BAT_LOW_PCT;
    n.critical = n.pct <= BAT_CRITICAL_PCT;
  }
  n.charging = charger == 1;
  n.full = charger == 2;
  if (n.present != info.present) Serial.printf("battery: %s\n", n.present ? "connected" : "none");
  if (n.present && n.low && !info.low) Serial.printf("battery: low, %u%% (%u mV)\n", n.pct, n.mv);
  publish(n);
}

static void pulldown(bool on) {
  gpio_num_t g = (gpio_num_t)BAT_PIN;
  // the ADC hands the pad to the RTC domain, where its own pull-down applies
  if (on) { rtc_gpio_pulldown_en(g); gpio_pulldown_en(g); }
  else { rtc_gpio_pulldown_dis(g); gpio_pulldown_dis(g); }
}

static bool padLow(int pin) { return pin >= 0 && digitalRead(pin) == LOW; }

/* The charger's CHRG / STDBY pads (battery.h), polled every 100 ms. */
static void pollCharger(uint32_t now) {
  static uint32_t polled = 0, since = 0;
  static uint8_t seen = 0;
  if (now - polled < CHARGER_POLL_MS) return;
  polled = now;
  uint8_t s = padLow(BAT_CHRG_PIN) ? 1 : padLow(BAT_STDBY_PIN) ? 2 : 0;
  if (s != seen) { seen = s; since = now; return; }
  if (s == charger || now - since < CHARGER_STABLE_MS) return;
  charger = s;
  Serial.printf("battery: %s\n", s == 1 ? "charging" : s == 2 ? "charged" : "off the charger");
  update();
}

void batteryBegin() {
  if (BAT_CHRG_PIN >= 0) pinMode(BAT_CHRG_PIN, INPUT_PULLUP);
  if (BAT_STDBY_PIN >= 0) pinMode(BAT_STDBY_PIN, INPUT_PULLUP);
  int c = digitalPinToAnalogChannel(BAT_PIN);
  if (c < 0 || c >= SOC_ADC_MAX_CHANNEL_NUM) { Serial.printf("battery: GPIO %d is not an ADC1 pin\n", BAT_PIN); return; }
  ch = (adc1_channel_t)c;
  adc1_config_width(ADC_WIDTH_BIT_12);
  adc1_config_channel_atten(ch, ADC_ATTEN_DB_12);   // up to ~3.1 V (a full cell halved is 2.1 V)
  esp_adc_cal_characterize(ADC_UNIT_1, ADC_ATTEN_DB_12, ADC_WIDTH_BIT_12, 1100, &cal);   // eFuse calibration
  lastProbe = millis() - PROBE_MS;                  // probe right away
  ready = true;
}

void batteryLoop() {
  uint32_t now = millis();
  pollCharger(now);
  if (!ready) return;                                // batteryBegin() found no usable ADC pin
  if (probing) {
    if (now - probeAt < PROBE_SETTLE_MS) return;
    int raw = adc1_get_raw(ch);
    pulldown(false);
    probing = false;
    lastProbe = now;
    lastSample = now - SAMPLE_MS + AFTER_PROBE_MS;   // next reading once the pin has recovered
    bool w = raw > PROBE_RAW;
    if (w != wired) { wired = w; filtered = 0; if (!w) update(); }
    return;
  }
  if (now - lastProbe >= PROBE_MS) { pulldown(true); probing = true; probeAt = now; return; }
  if (!wired || now - lastSample < SAMPLE_MS) return;
  lastSample = now;
  uint32_t sum = 0;
  for (int i = 0; i < 16; i++) sum += adc1_get_raw(ch);
  uint32_t pin = esp_adc_cal_raw_to_voltage(sum / 16, &cal);
  uint32_t cell16 = pin * (BAT_R_TOP + BAT_R_BOTTOM) * 16 / BAT_R_BOTTOM;
  filtered = filtered ? (filtered * 7 + cell16) / 8 : cell16;
  update();
}

void batteryCommand(const String &arg, Print &out) {
  if (arg.startsWith("cal")) {
    String v = arg.substring(3); v.trim();
    if (v == "reset") cfg.batCal = 10000;
    else {
      long target = v.toInt();
      uint32_t raw = filtered / 16;
      if (!info.present || !raw) { out.println("battery: no battery to calibrate"); return; }
      if (target < 2500 || target > 4500) { out.println("battery cal <millivolts>: the cell voltage your multimeter shows, e.g. battery cal 3950"); return; }
      uint32_t k = (uint32_t)target * 10000 / raw;
      if (k < 8000 || k > 12000) { out.println("battery: that is more than 20% off the reading; check the resistors"); return; }
      cfg.batCal = (uint16_t)k;
    }
    configSave();
    update();
    out.printf("battery calibrated: x%u.%04u, now %u mV\n", cfg.batCal / 10000, cfg.batCal % 10000, info.mv);
    return;
  }
  out.println("battery " + batteryJson());
}

#endif  // BUDDY_BATTERY
