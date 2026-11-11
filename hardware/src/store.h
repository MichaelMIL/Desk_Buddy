/* Animation registry: built-in (compiled-in PROGMEM) + stored on LittleFS.
 * Stored animations are uploaded from the simulator and survive reboots and
 * firmware updates. A stored animation with the same name replaces a built-in one. */
#pragma once
#include <Arduino.h>

struct AnimEntry {
  String name;
  const uint8_t *flash;   // built-in data, or NULL for a stored file
  size_t len;
  bool builtin;
};

void storeBegin();                       // mount the file system and scan
void storeScan();                        // rebuild the registry
size_t storeCount();
const AnimEntry &storeEntry(size_t i);
int storeFind(const char *name);         // index or -1
bool storeValidName(const String &name); // [a-z0-9_]{1,31}

/* Get the animation bytes: built-ins return the flash pointer; stored ones are
 * read into PSRAM (or heap). Release with storeRelease(). */
const uint8_t *storeLoad(size_t i, size_t *len);
void storeRelease(size_t i, const uint8_t *buf);

/* Streaming upload (used by the web server's raw handler): the data goes to a
 * temp file, then storeUploadCommit() validates it and gives it its name. */
bool storeUploadBegin(size_t expectedBytes, String &err);   // refuses if it will not fit
bool storeUploadWrite(const uint8_t *data, size_t n);
void storeUploadClose();
bool storeUploadCommit(const String &name, String &err);
void storeUploadAbort();
bool storeDelete(const char *name);

/* Themes: an animation named "<theme>__<name>" belongs to that theme. */
String storeThemeOf(const String &name);   // "" for common animations
String storeThemesJson();                  // ["halloween","xmas",...] derived from the stored names
bool storeInTheme(const String &name, const String &theme); // common, or belongs to `theme`

size_t storeFreeBytes();
size_t storeTotalBytes();
String storeListJson();                  // [{"name","bytes","builtin"},...]
