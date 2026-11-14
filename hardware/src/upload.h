/* Animation upload over a byte stream: USB serial or Bluetooth (paired),
 * the same protocol on both. The HTTP API has its own (PUT /api/anim).
 *
 *   > upload <name> <bytes>\n          a console command
 *   < ready <window>                   or "error <reason>"
 *   > <at most <window> raw bytes>     DBAL, DBAZ or DBA1 data, as the sim exports it
 *   < ack <received>                   after each full window and after the last byte
 *   ... repeat until all bytes are sent ...
 *   < stored <name> <free> KB free     or "error <reason>"
 *
 * The sender waits for each "ack" before the next window, so neither
 * transport's receive buffer (4 KB each) can overflow while LittleFS writes.
 * On USB serial other log lines are interleaved: a sender picks out the lines
 * that start with ready / ack / stored / error. 10 s without data aborts.
 * All of this runs in the Arduino loop task.
 *
 * Firmware updates (built with -DBUDDY_BLE_OTA=1) use the same windows and acks:
 *
 *   > update <bytes> <md5 hex> [password]\n   password: when one is set (otapass)
 *   < ready <window>                   or "error <reason>"
 *   > windows of the firmware .bin, each answered by "ack <received>"
 *   < updated <bytes> bytes, restarting   or "error <reason>" (e.g. MD5 mismatch)
 *
 * The image goes into the other app slot and is checked against the MD5; the buddy
 * restarts into it 1.5 s after "updated". One transfer at a time, uploads included. */
#pragma once
#include <Arduino.h>

static const size_t UPLOAD_WINDOW = 2048;

bool uploadStart(const String &name, size_t bytes, Print &out);  // "upload" command; replies on `out`
bool updateStart(size_t bytes, const String &md5, const String &password, Print &out);   // "update" command
bool uploadActive(const Print &out);   // `out`'s transport is mid-upload: its incoming bytes are data
size_t uploadFeed(const uint8_t *data, size_t n);                 // returns the bytes consumed
void uploadAbort(const char *why);     // e.g. the Bluetooth client disconnected
void uploadPoll();                     // call from the loop: times out a stalled upload
