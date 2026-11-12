/* MQTT: <prefix>/set selects a face ("cycle" resumes cycling), /state and
 * /availability are retained, /animations lists what is available, and Home
 * Assistant discovery exposes a select entity. */
#pragma once
#include <Arduino.h>
#include "config.h"

#if BUDDY_WIFI
void mqttBegin();
void mqttLoop();
void mqttPublishState();
void mqttPublishAnimations();   // list + Home Assistant discovery (after upload/delete)
String mqttStatus();        // "disabled" | "connecting" | "connected" | "error <rc>"
#else                       // build without Wi-Fi: no MQTT
inline void mqttBegin() {}
inline void mqttLoop() {}
inline void mqttPublishState() {}
inline void mqttPublishAnimations() {}
inline String mqttStatus() { return "not in this build"; }
#endif
