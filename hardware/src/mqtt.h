/* MQTT: <prefix>/set selects a face ("cycle" resumes cycling), /state and
 * /availability are retained, /animations lists what is available, and Home
 * Assistant discovery exposes a select entity. */
#pragma once
#include <Arduino.h>

void mqttBegin();
void mqttLoop();
void mqttPublishState();
void mqttPublishAnimations();   // list + Home Assistant discovery (after upload/delete)
String mqttStatus();        // "disabled" | "connecting" | "connected" | "error <rc>"
