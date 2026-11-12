#include "upload.h"
#include "app.h"
#include "store.h"

static const uint32_t TIMEOUT_MS = 10000;

static Print *owner = nullptr;        // the transport's output; non-null while an upload runs
static String upName, label;
static size_t total = 0, got = 0, sinceAck = 0;
static uint32_t lastAt = 0;

bool uploadActive(const Print &out) { return owner == &out; }

bool uploadStart(const String &name, size_t bytes, Print &out) {
  if (owner) { out.println("error another upload is running"); return false; }
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

static void fail(const char *why) {
  Print *o = owner;
  owner = nullptr;
  storeUploadAbort();
  app_resume();
  Serial.printf("upload: %s: %s\n", upName.c_str(), why);
  if (o) { o->printf("error %s\n", why); o->flush(); }
}

void uploadAbort(const char *why) { if (owner) fail(why); }

void uploadPoll() { if (owner && millis() - lastAt > TIMEOUT_MS) fail("timeout: no data for 10 s"); }

size_t uploadFeed(const uint8_t *data, size_t n) {
  if (!owner) return 0;
  size_t take = n < total - got ? n : total - got;
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
