/* Bluetooth LE control.
 *
 * The buddy advertises under its device name with the Nordic UART Service
 * (NUS), so any "BLE UART" app (nRF Connect, Bluefruit Connect, Serial
 * Bluetooth Terminal, ...) or the simulator's remote page (sim/remote.html)
 * can drive it:
 *
 *   6e400001-b5a3-f393-e0a9-e50e24dcca9e  service
 *   6e400002-...                          RX, write: commands, one per line
 *                                         (or one per write), e.g. "play face_happy"
 *   6e400003-...                          TX, notify: the replies, text lines
 *   8b3f2a51-6c0d-4e7a-9b14-d2e5f7a90c36  state, read/notify: JSON (app_state_json)
 *
 * The commands are the serial console's playback commands (see remote_ok() in
 * main.cpp): names, state, list, play, next, cycle, screen, brightness,
 * theme, speed, loops, rotation, status. There is no pairing, so Wi-Fi,
 * passwords, delete and reset are not reachable over Bluetooth.
 *
 * Commands are queued by the NimBLE task and run from bleLoop() in the
 * Arduino loop (core 1), like serial and web requests. */
#pragma once
#include <Arduino.h>

void bleBegin();          // starts advertising if cfg.ble is on
void bleLoop();           // runs received commands, sends replies and state
void bleStateChanged();   // from any task: refresh + notify the state characteristic
String bleStatus();       // "off" | "advertising as '<name>'" | "connected"
