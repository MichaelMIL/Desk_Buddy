/* Wi-Fi station + fallback setup AP + the HTTP API (hardware/API.md); no web pages. */
#pragma once
#include <Arduino.h>
#include "config.h"

#if BUDDY_WIFI
void netBegin();
void netLoop();
bool netConnected();
bool netApActive();
String netApSsid();
String netIp();            // STA IP when connected, else AP IP
void netStartAp();         // force the setup AP on (keeps STA retrying)
#else                      // build without Wi-Fi: nothing to do
inline void netBegin() {}
inline void netLoop() {}
inline bool netConnected() { return false; }
inline bool netApActive() { return false; }
inline String netApSsid() { return String(); }
inline String netIp() { return String(); }
inline void netStartAp() {}
#endif
