/* Shared interface between the player (main.cpp; renders on core 0) and the
 * network modules (net.cpp / mqtt.cpp / ble.cpp, in the Arduino loop on core 1).
 *
 * Only the player task draws on the display. Everything here takes the
 * player lock, so it is safe to call from either task. */
#pragma once
#include <Arduino.h>

void app_lock();                      // recursive; wrap registry (store*) mutations and reads from other tasks
void app_unlock();

size_t app_anim_count();
const char *app_anim_name(size_t i);
const char *app_current();            // name of the playing animation, or "cycle"
bool app_cycling();
bool app_play(const char *name);      // "cycle" resumes cycling; returns false if unknown
void app_screen(bool on);             // display on/off (runtime)
bool app_screen_on();
void app_brightness(uint8_t percent); // 10..100, applied to every pixel pushed (saved by the caller)
uint8_t app_brightness_get();
void app_apply_settings();            // re-apply rotation after a config change
void app_set_theme(const char *theme); // select a theme (saved); "" = none
void app_animations_changed(const char *name); // registry changed (upload/delete); name = affected animation
void app_message(const char *l1, const char *l2); // show text on the screen and pause playback
void app_message_big(const char *l1, const char *big, const char *l2); // same, with a large middle line; turns the display on if off
void app_loading(const char *label, int percent); // loading ring (percent -1 = indeterminate) and pause playback
void app_resume();                    // back to the animation after app_message / app_loading
uint32_t app_frames_rendered();       // counter, for diagnostics

/* Run one console command ("play face_happy", "brightness 40", ...) and write
 * the reply to `out` (USB serial, or a paired Bluetooth device). */
void app_command(const String &line, Print &out);
String app_state_json();              // {"current","cycling","screen","brightness","theme","count"}
