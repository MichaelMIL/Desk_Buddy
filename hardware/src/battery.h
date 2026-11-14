/* Battery level: a 1-cell LiPo measured through two resistors on an ADC pin.
 *
 *   battery + ──[ 100 kΩ ]──┬──[ 100 kΩ ]── GND
 *                           ├── GPIO 1 (BAT_PIN, ADC1 channel 0)
 *                           └──[ 100 nF ]── GND     (optional, steadies the reading)
 *
 * The divider halves the cell voltage: 4.2 V full reads 2.1 V at the pin, well
 * inside the ADC's calibrated range (12 dB attenuation, ~3.1 V), and it draws
 * 4.2 V / 200 kΩ = 21 µA. Measure the cell itself (B+ of the charger board),
 * not the 5 V pin, which shows USB when a cable is plugged in.
 *
 * Without a divider the pin floats and reads noise, so every 30 s the buddy
 * reads it once with the pad's internal pull-down (~45 kΩ) switched on: a
 * floating pin drops to ~0 V, a wired divider still shows ~1 V. "No battery"
 * is reported then, and nothing on the buddy reacts to the noise.
 *
 * Other resistors: -DBAT_R_TOP=<kΩ> -DBAT_R_BOTTOM=<kΩ>; another pin (ADC1 only,
 * GPIO 1-10; ADC2 does not work while Wi-Fi runs): -DBAT_PIN=<gpio>.
 * "battery cal <mV>" corrects resistor tolerance against a multimeter.
 *
 * Built with -DBUDDY_BATTERY=0 (config.h; the *_nobat environments) none of
 * this is compiled in: the functions below are stubs, the state, config and
 * /api/status carry no battery fields (clients then show none, as with older
 * firmware) and the low battery alert never plays. */
#pragma once
#include <Arduino.h>
#include "config.h"

#ifndef BAT_PIN
#define BAT_PIN 1
#endif
#ifndef BAT_R_TOP
#define BAT_R_TOP 100        // kΩ, battery + to the pin
#endif
#ifndef BAT_R_BOTTOM
#define BAT_R_BOTTOM 100     // kΩ, pin to GND
#endif

#define BAT_LOW_PCT 15       // low at or below this...
#define BAT_OK_PCT 20        // ...until it is back at or above this
#define BAT_CRITICAL_PCT 5

struct BatteryInfo {
  bool present;            // a cell is connected (false: nothing on the pin, or a build without battery)
  uint16_t mv;             // cell voltage (filtered)
  uint8_t pct;             // 0..100, from a LiPo discharge curve
  bool low;                // <= BAT_LOW_PCT, with hysteresis
  bool critical;           // <= BAT_CRITICAL_PCT
};

#if BUDDY_BATTERY
void batteryBegin();
void batteryLoop();        // Arduino loop (core 1): samples every 2 s, never blocks
BatteryInfo batteryGet();
String batteryJson();      // {"present":true,"mv":3912,"pct":64,"low":false} or {"present":false}
String batteryStateJson(); // ,"bat":64,"batLow":false  (",bat":null when there is none), for app_state_json
String batteryText();      // "64% (3912 mV)", "low, 12% (3650 mV)", "none (nothing on GPIO 1)"
void batteryCommand(const String &arg, Print &out);   // "battery", "battery cal <mV>", "battery cal reset"
#else
inline void batteryBegin() {}
inline void batteryLoop() {}
inline BatteryInfo batteryGet() { return {}; }
inline String batteryStateJson() { return String(); }
inline String batteryText() { return "not in this build (BUDDY_BATTERY=0)"; }
inline void batteryCommand(const String &arg, Print &out) { out.println(arg.length() ? "battery: not in this build (BUDDY_BATTERY=0)" : "battery {\"present\":false}"); }
#endif
