#include "upload.h"
#include "app.h"
#include "config.h"
#include "store.h"
#if BUDDY_BLE_OTA
#include <Update.h>
#include <esp_ota_ops.h>
#endif

static const uint32_t TIMEOUT_MS = 10000;
static const uint32_t RESTART_DELAY_MS = 1500;   // after "updated": time for the reply to reach the sender

static Print *owner = nullptr;        // the transport's output; non-null while an upload runs
static bool firmware = false;         // the running transfer is a firmware update, not an animation
static String upName, label;
static size_t total = 0, got = 0, sinceAck = 0;
static uint32_t lastAt = 0, restartAt = 0;

bool uploadActive(const Print &out) { return owner == &out; }

bool uploadStart(const String &name, size_t bytes, Print &out) {
  if (owner) { out.println("error another upload is running"); return false; }
  if (restartAt) { out.println("error restarting after a firmware update"); return false; }
  if (!storeValidName(name)) { out.println("error usage: upload <name> <bytes>, name = a-z 0-9 _ (1-31 characters)"); return false; }
  if (bytes == 0) { out.println("error usage: upload <name> <bytes>"); return false; }
  String err;
  if (!storeUploadBegin(bytes, err)) { out.println("error " + err); return false; }
  owner = &out; upName = name; total = bytes; got = 0; sinceAck = 0; lastAt = millis();
  label = "loading " + name;
  app_loading(label.c_str(), 0);
  Serial.printf("upload: %s, %u bytes\n", name.c_str(), (unsigned)bytes);
  out.printf("ready %u\n", (unsigned)UPLOAD_WINDOW);
  out.flush();   // USB serial holds short writes until a 64-byte packet fills (~1 s): send now
  return true;
}

bool updateStart(size_t bytes, const String &md5, const String &password, Print &out) {
#if !BUDDY_BLE_OTA
  (void)bytes; (void)md5; (void)password;
  out.println("error firmware updates are not in this build (BUDDY_BLE_OTA=0); flash over USB");
  return false;
#else
  if (owner || restartAt || Update.isRunning()) { out.println("error another upload is running"); return false; }   // (or an update over Wi-Fi)
  if (cfg.otaPass.length() && password != cfg.otaPass) {
    out.println(password.length() ? "error wrong firmware update password" : "error needs the firmware update password");
    return false;
  }
  bool hex = md5.length() == 32;
  for (char c : md5) hex = hex && isxdigit((unsigned char)c);
  if (!bytes || !hex) { out.println("error usage: update <bytes> <md5 hex> [password]"); return false; }
  const esp_partition_t *slot = esp_ota_get_next_update_partition(nullptr);
  if (!slot) { out.println("error no update slot: this partition table has one app slot, flash over USB"); return false; }
  if (bytes > slot->size) { out.printf("error too big: %u bytes, the update slot holds %u\n", (unsigned)bytes, (unsigned)slot->size); return false; }
  if (!Update.begin(bytes)) { out.println("error " + String(Update.errorString())); return false; }
  Update.setMD5(md5.c_str());
  owner = &out; firmware = true; upName = "firmware"; total = bytes; got = 0; sinceAck = 0; lastAt = millis();
  label = "updating firmware";
  app_loading(label.c_str(), 0);
  Serial.printf("update: %u bytes into %s\n", (unsigned)bytes, slot->label);
  out.printf("ready %u\n", (unsigned)UPLOAD_WINDOW);
  out.flush();
  return true;
#endif
}

static void fail(const char *why) {
  Print *o = owner;
  owner = nullptr;
#if BUDDY_BLE_OTA
  if (firmware) Update.abort();
  else
#endif
  storeUploadAbort();
  firmware = false;
  app_resume();
  Serial.printf("upload: %s: %s\n", upName.c_str(), why);
  if (o) { o->printf("error %s\n", why); o->flush(); }
}

void uploadAbort(const char *why) { if (owner) fail(why); }

void uploadPoll() {
  if (owner && millis() - lastAt > TIMEOUT_MS) fail("timeout: no data for 10 s");
  if (restartAt && (int32_t)(millis() - restartAt) >= 0) { Serial.println("update: restarting"); Serial.flush(); ESP.restart(); }
}

size_t uploadFeed(const uint8_t *data, size_t n) {
  if (!owner) return 0;
  size_t take = n < total - got ? n : total - got;
#if BUDDY_BLE_OTA
  if (firmware) {
    if (take && Update.write((uint8_t *)data, take) != take) { fail(Update.errorString()); return take; }
  } else
#endif
  if (take && !storeUploadWrite(data, take)) { fail("write failed (file system full?)"); return take; }
  got += take; sinceAck += take; lastAt = millis();
  app_loading(label.c_str(), (int)((uint64_t)got * 100 / total));   // cheap: only the percentage changes
  if (got < total) {
    if (sinceAck >= UPLOAD_WINDOW) { sinceAck = 0; owner->printf("ack %u\n", (unsigned)got); owner->flush(); }
    return take;
  }
  // last byte: validate, name it, show it
  Print *o = owner;
  owner = nullptr;
  o->printf("ack %u\n", (unsigned)got);
#if BUDDY_BLE_OTA
  if (firmware) {
    firmware = false;
    if (!Update.end()) {                              // checks the MD5 and the image
      const char *why = Update.errorString();
      Serial.printf("update: failed: %s\n", why);
      app_resume();
      o->printf("error %s\n", why); o->flush();
      return take;
    }
    Serial.printf("update: %u bytes written and checked\n", (unsigned)got);
    app_message("Firmware updated", "restarting");
    o->printf("updated %u bytes, restarting\n", (unsigned)got); o->flush();
    restartAt = millis() + RESTART_DELAY_MS;
    return take;
  }
#endif
  storeUploadClose();
  String err;
  app_lock();
  bool ok = storeUploadCommit(upName, err);           // rescans the registry
  if (ok) app_animations_changed(upName.c_str());     // leaves the loading screen, restarts playback
  else app_resume();
  unsigned freeKb = (unsigned)(storeFreeBytes() / 1024);
  app_unlock();
  Serial.printf("upload: %s %s\n", upName.c_str(), ok ? "stored" : err.c_str());
  if (ok) o->printf("stored %s %u KB free\n", upName.c_str(), freeKb);
  else o->println("error " + err);
  o->flush();
  return take;
}
