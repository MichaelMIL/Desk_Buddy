/* Wi-Fi station + fallback setup AP with captive portal + web UI. */
#pragma once
#include <Arduino.h>

void netBegin();
void netLoop();
bool netConnected();
bool netApActive();
String netApSsid();
String netIp();            // STA IP when connected, else AP IP
void netStartAp();         // force the setup AP on (keeps STA retrying)
