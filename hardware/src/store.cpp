#include "store.h"
#include "animations/animations.h"
#include <LittleFS.h>
#include <esp_heap_caps.h>
#include <sys/stat.h>
#include "rom/miniz.h"      // inflate from ROM: no flash cost

static const char *DIR = "/a";
static const size_t MAX_ENTRIES = 256;   // ~6 KB; the BLE-only build's 3.3 MB holds ~150-300 faces
static AnimEntry entries[MAX_ENTRIES];
static size_t count = 0;
static bool fsOk = false;

static File upFile;
static String upName, upTmp;
static size_t upBytes = 0, upBudget = 0;
// One upload at a time (HTTP, USB serial and Bluetooth share the temp file): busy from
// begin until commit/abort; an upload with no data for 15 s may be taken over.
static bool upBusy = false;
static uint32_t upLastAt = 0;
static const uint32_t UP_STALE_MS = 15000;
static uint8_t upHead[16];
static const size_t FS_MARGIN = 16 * 1024;   // LittleFS needs headroom; writing it completely full crashes it

static String pathFor(const String &name) { return String(DIR) + "/" + name + ".dba"; }

static void *bigAlloc(size_t n) { return psramFound() ? heap_caps_malloc(n, MALLOC_CAP_SPIRAM) : malloc(n); }

/* "DBAZ" container: magic, u32 original size, u32 compressed size, zlib stream. */
static bool isDbaz(const uint8_t *p, size_t n) { return n >= 12 && memcmp(p, "DBAZ", 4) == 0; }
static uint32_t rd32(const uint8_t *p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((uint32_t)p[3] << 24); }

/* Inflate a DBAZ buffer. Returns a bigAlloc'ed DBA1 buffer (caller frees) or NULL. */
static uint8_t *inflateDbaz(const uint8_t *z, size_t zlen, size_t *outLen, String *err) {
  if (!isDbaz(z, zlen)) { if (err) *err = "not DBAZ"; return NULL; }
  uint32_t orig = rd32(z + 4), clen = rd32(z + 8);
  if (clen + 12 > zlen || orig < 32 || orig > 4 * 1024 * 1024) { if (err) *err = "bad DBAZ header"; return NULL; }
  uint8_t *out = (uint8_t *)bigAlloc(orig);
  tinfl_decompressor *d = (tinfl_decompressor *)bigAlloc(sizeof(tinfl_decompressor));
  if (!out || !d) { free(out); free(d); if (err) *err = "out of memory"; return NULL; }
  tinfl_init(d);
  size_t inSize = clen, outSize = orig;
  tinfl_status st = tinfl_decompress(d, z + 12, &inSize, out, out, &outSize,
                                     TINFL_FLAG_PARSE_ZLIB_HEADER | TINFL_FLAG_USING_NON_WRAPPING_OUTPUT_BUF);
  free(d);
  if (st != TINFL_STATUS_DONE || outSize != orig) { free(out); if (err) *err = "inflate failed (" + String((int)st) + ")"; return NULL; }
  *outLen = orig;
  return out;
}

static bool validDba1(const uint8_t *p, size_t n) {
  return n >= 32 && memcmp(p, "DBA1", 4) == 0 && (p[4] | (p[5] << 8)) == 240 && (p[6] | (p[7] << 8)) == 240;
}
// FS::exists() opens the file and logs an error when it is missing; stat() is quiet
static bool fileExists(const String &path) { struct stat st; return stat(("/littlefs" + path).c_str(), &st) == 0; }
static void removeIfExists(const String &path) { if (fileExists(path)) LittleFS.remove(path); }

bool storeValidName(const String &name) {
  if (name.isEmpty() || name.length() > 31) return false;
  for (char c : name) if (!(islower((unsigned char)c) || isdigit((unsigned char)c) || c == '_')) return false;
  return true;
}

void storeBegin() {
  fsOk = LittleFS.begin(true);
  if (!fsOk) Serial.println("store: LittleFS mount failed");
  else if (!LittleFS.exists(DIR)) LittleFS.mkdir(DIR);
  storeScan();
}

void storeScan() {
  count = 0;
  // stored first (they win over built-ins with the same name)
  if (fsOk) {
    File d = LittleFS.open(DIR);
    if (d && d.isDirectory()) {
      size_t skipped = 0;
      for (File f = d.openNextFile(); f; f = d.openNextFile()) {
        String n = f.name();
        int slash = n.lastIndexOf('/'); if (slash >= 0) n = n.substring(slash + 1);
        if (!n.endsWith(".dba")) continue;
        n.remove(n.length() - 4);
        if (!storeValidName(n)) continue;
        if (count >= MAX_ENTRIES) { skipped++; continue; }
        entries[count++] = { n, NULL, (size_t)f.size(), false };
      }
      if (skipped) Serial.printf("store: %u animations over the limit of %u are ignored\n", (unsigned)skipped, (unsigned)MAX_ENTRIES);
    }
  }
  for (size_t i = 0; i < ANIMATIONS_COUNT && count < MAX_ENTRIES; i++) {
    if (storeFind(ANIMATIONS[i].name) >= 0) continue;
    entries[count++] = { String(ANIMATIONS[i].name), ANIMATIONS[i].data, ANIMATIONS[i].len, true };
  }
  // sort by name so the order is stable regardless of upload order
  for (size_t i = 1; i < count; i++) {
    AnimEntry e = entries[i]; size_t j = i;
    while (j > 0 && entries[j - 1].name > e.name) { entries[j] = entries[j - 1]; j--; }
    entries[j] = e;
  }
  Serial.printf("store: %u animations (%u built-in), %u KB free\n", (unsigned)count, (unsigned)ANIMATIONS_COUNT, (unsigned)(storeFreeBytes() / 1024));
}

size_t storeCount() { return count; }
const AnimEntry &storeEntry(size_t i) { return entries[i < count ? i : 0]; }
int storeFind(const char *name) {
  for (size_t i = 0; i < count; i++) if (entries[i].name == name) return (int)i;
  return -1;
}

const uint8_t *storeLoad(size_t i, size_t *len) {
  if (i >= count) return NULL;
  AnimEntry &e = entries[i];
  if (e.builtin) {
    if (!isDbaz(e.flash, e.len)) { *len = e.len; return e.flash; }   // raw DBA1 in flash: use in place
    String err;
    uint8_t *out = inflateDbaz(e.flash, e.len, len, &err);
    if (!out) Serial.printf("store: %s: %s\n", e.name.c_str(), err.c_str());
    return out;
  }
  File f = LittleFS.open(pathFor(e.name), "r");
  if (!f) return NULL;
  uint8_t *buf = (uint8_t *)bigAlloc(e.len);
  if (!buf) { f.close(); Serial.printf("store: out of memory for %s (%u bytes)\n", e.name.c_str(), (unsigned)e.len); return NULL; }
  size_t got = f.read(buf, e.len);
  f.close();
  if (got != e.len) { free(buf); return NULL; }
  if (!isDbaz(buf, e.len)) { *len = e.len; return buf; }            // older, uncompressed upload
  String err;
  uint8_t *out = inflateDbaz(buf, e.len, len, &err);
  free(buf);
  if (!out) Serial.printf("store: %s: %s\n", e.name.c_str(), err.c_str());
  return out;
}

void storeRelease(size_t i, const uint8_t *buf) {
  if (i >= count || !buf) return;
  if (entries[i].builtin && buf == entries[i].flash) return;   // raw flash data, nothing to free
  free((void *)buf);
}

bool storeUploadBegin(size_t expectedBytes, String &err) {
  if (!fsOk) { err = "file system not mounted"; return false; }
  if (upBusy && millis() - upLastAt < UP_STALE_MS) { err = "busy: another upload is in progress, try again in a moment"; return false; }
  if (upFile) upFile.close();                 // a stale upload: take over
  upBusy = false;
  upTmp = String(DIR) + "/upload.tmp";
  removeIfExists(upTmp);
  size_t freeB = storeFreeBytes();
  upBudget = freeB > FS_MARGIN ? freeB - FS_MARGIN : 0;
  if (expectedBytes > upBudget) {
    err = "not enough space: need " + String((expectedBytes + 1023) / 1024) + " KB, " + String(upBudget / 1024) + " KB available (delete an animation first)";
    return false;
  }
  upFile = LittleFS.open(upTmp, "w");
  if (!upFile) { err = "cannot create file"; return false; }
  upBytes = 0;
  upBusy = true; upLastAt = millis();
  return true;
}

bool storeUploadWrite(const uint8_t *data, size_t n) {
  if (!upFile) return false;
  if (upBytes + n > upBudget) return false;   // never fill the file system completely
  upLastAt = millis();
  for (size_t k = 0; k < n && upBytes + k < sizeof(upHead); k++) upHead[upBytes + k] = data[k];
  size_t w = upFile.write(data, n);
  upBytes += w;
  return w == n;
}

void storeUploadClose() {
  if (upFile) upFile.close();
}

bool storeUploadCommit(const String &name, String &err) {
  upBusy = false;                             // (runs in the loop task, so nothing starts in between)
  if (upFile) upFile.close();
  if (!storeValidName(name)) { removeIfExists(upTmp); err = "bad name (a-z, 0-9, _ ; max 31 chars)"; return false; }
  if (count >= MAX_ENTRIES && storeFind(name.c_str()) < 0) {   // a new name would be stored but never listed
    removeIfExists(upTmp); err = "too many animations (" + String(MAX_ENTRIES) + "); delete one first"; return false;
  }
  upName = name;
  bool ok = validDba1(upHead, upBytes);
  if (!ok && isDbaz(upHead, upBytes)) {
    // compressed: inflate once to make sure it is a valid 240x240 DBA1 before keeping it
    File f = LittleFS.open(upTmp, "r");
    uint8_t *z = f ? (uint8_t *)bigAlloc(upBytes) : NULL;
    if (z && f.read(z, upBytes) == upBytes) {
      size_t n = 0; String ierr;
      uint8_t *raw = inflateDbaz(z, upBytes, &n, &ierr);
      ok = raw && validDba1(raw, n);
      if (!raw) err = ierr;
      free(raw);
    }
    if (f) f.close();
    free(z);
  }
  if (!ok) { removeIfExists(upTmp); if (err.isEmpty()) err = "not a 240x240 DBA1/DBAZ animation"; return false; }
  String dst = pathFor(upName);
  removeIfExists(dst);
  if (!LittleFS.rename(upTmp, dst)) { removeIfExists(upTmp); err = "rename failed"; return false; }
  storeScan();
  return true;
}

void storeUploadAbort() {
  upBusy = false;
  if (upFile) upFile.close();
  if (upTmp.length()) removeIfExists(upTmp);
}

bool storeDelete(const char *name) {
  int i = storeFind(name);
  if (i < 0 || entries[i].builtin) return false;
  bool ok = LittleFS.remove(pathFor(entries[i].name));
  storeScan();
  return ok;
}

String storeThemeOf(const String &name) {
  int k = name.indexOf("__");
  return k > 0 ? name.substring(0, k) : String();
}

bool storeInTheme(const String &name, const String &theme) {
  String t = storeThemeOf(name);
  return t.isEmpty() || t == theme;
}

String storeThemesJson() {
  String seen = ",", s = "[";
  for (size_t i = 0; i < count; i++) {
    String t = storeThemeOf(entries[i].name);
    if (t.isEmpty() || seen.indexOf("," + t + ",") >= 0) continue;
    seen += t + ",";
    if (s.length() > 1) s += ",";
    s += "\"" + t + "\"";
  }
  return s + "]";
}

size_t storeFreeBytes() { return fsOk ? LittleFS.totalBytes() - LittleFS.usedBytes() : 0; }
size_t storeTotalBytes() { return fsOk ? LittleFS.totalBytes() : 0; }

String storeListJson() {
  String s = "[";
  for (size_t i = 0; i < count; i++) {
    if (i) s += ",";
    s += "{\"name\":\"" + entries[i].name + "\",\"bytes\":" + String(entries[i].len) + ",\"builtin\":" + (entries[i].builtin ? "true" : "false") + "}";
  }
  return s + "]";
}
