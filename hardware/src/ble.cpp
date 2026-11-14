#include "ble.h"
#if BUDDY_BLE                     // else ble.h has stubs and this file is empty
#include "app.h"
#include "config.h"
#include "upload.h"
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <esp_random.h>
#include <freertos/stream_buffer.h>

#define NUS_SERVICE "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_RX      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_TX      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
#define STATE_CHR   "8b3f2a51-6c0d-4e7a-9b14-d2e5f7a90c36"

static const size_t MAX_LINE = 160, MAX_PENDING = 4096;
static const uint32_t LINE_IDLE_MS = 150;     // a write without a newline ends a command after this pause
static const uint32_t PAIR_SCREEN_MS = 60000; // the code leaves the screen after this, paired or not
static const uint32_t FAIL_SCREEN_MS = 2500;
static const uint32_t CLASH_MS = 3000;        // commands from both devices this close together: the buddy is confused
static const uint32_t HELLO_AWAY_MS = 600000; // the "connected" animation only for a device away at least this long
static const int LINKS = CONFIG_BT_NIMBLE_MAX_CONNECTIONS;   // 2 (platformio.ini)

/* Everything one paired device should read: command replies and upload acks.
 * Appends to its link's `pending`, which bleLoop sends as TX notifications to that
 * device only (the other one does not see them). */
class BleOut : public Print {
 public:
  String *pending = nullptr;
  size_t write(uint8_t c) override { *pending += (char)c; return 1; }
};

/* One connected device. The NimBLE task sets the volatile flags; bleLoop (Arduino loop)
 * owns the rest. A slot is reused only after bleLoop has cleared it (`gone`). */
struct Link {
  volatile bool used = false, secured = false, gone = false, hello = false;
  volatile uint16_t handle = 0;
  uint8_t addr[6] = {};                       // the device's identity address (after pairing / re-encryption)
  volatile uint32_t lastRxAt = 0;
  StreamBufferHandle_t rx = nullptr;          // NimBLE task -> loop task, 4 KB > one upload window
  String line;                                // command being assembled
  String pending;                             // reply text not yet notified
  uint32_t lastActionAt = 0;                  // last command that changed what the buddy shows
  BleOut out;
};

static bool started = false;
static NimBLEServer *server = nullptr;
static NimBLECharacteristic *txChr = nullptr, *stateChr = nullptr;
static Link links[LINKS];
static volatile bool connEvent = false, stateDirty = true;
// pairing (set by the NimBLE task, acted on in bleLoop)
static volatile uint32_t passkey = 0;
static volatile bool showCode = false, authEvent = false, authOk = false;
// loop task only
static uint32_t codeShownAt = 0, failShownAt = 0;

/* When each device (by identity address) was last connected, so the bridge, which
 * reconnects whenever Claude starts working, does not get a "hello" every time. */
struct Seen { uint8_t addr[6]; uint32_t at; bool used; };
static Seen seen[4];

static bool seenRecently(const uint8_t *addr) {
  for (auto &e : seen) if (e.used && !memcmp(e.addr, addr, 6)) return millis() - e.at < HELLO_AWAY_MS;
  return false;
}

static void markSeen(const uint8_t *addr) {
  Seen *slot = &seen[0];
  for (auto &e : seen) {
    if (e.used && !memcmp(e.addr, addr, 6)) { slot = &e; break; }
    if (!e.used || (int32_t)(e.at - slot->at) < 0) slot = &e;   // a free one, else the oldest
  }
  memcpy(slot->addr, addr, 6); slot->at = millis(); slot->used = true;
}

static Link *linkOf(uint16_t handle) {
  for (auto &l : links) if (l.used && l.handle == handle) return &l;
  return nullptr;
}

static int linkCount(bool securedOnly) {
  int n = 0;
  for (auto &l : links) if (l.used && (l.secured || !securedOnly)) n++;
  return n;
}

void bleStateChanged() { stateDirty = true; }

int bleBondCount() { return started ? NimBLEDevice::getNumBonds() : -1; }

String bleStatus() {
  if (!started) return "off";   // (always on in a build without Wi-Fi)
  int n = linkCount(false), paired = linkCount(true);
  String adv = "advertising as '" + cfg.name.substring(0, 29) + "', " + String(NimBLEDevice::getNumBonds()) + " paired";
  if (n == 0) return adv;
  String s = n == 1 ? String(paired ? "connected, paired" : "connected, not paired")
                    : String(n) + " connected, " + (paired == n ? "both paired" : String(paired) + " paired");
  return n < LINKS ? s + "; " + adv : s;
}

void bleForgetAll() {
  if (started) NimBLEDevice::deleteAllBonds();
  else {                                       // NimBLE not running: clear its bond store in NVS directly
    Preferences p;
    if (p.begin("nimble_bond", false)) { p.clear(); p.end(); }
  }
  Serial.println("bluetooth: forgot all paired devices");
}

class ServerCB : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *, ble_gap_conn_desc *desc) override {
    Link *slot = nullptr;
    for (auto &l : links) if (!l.used && !l.gone) { slot = &l; break; }
    if (!slot) { server->disconnect(desc->conn_handle); return; }   // the last one's slot is still being cleared
    slot->handle = desc->conn_handle; slot->secured = false; slot->lastRxAt = 0;
    slot->used = true; connEvent = true;
    // ask for security right away: a bonded device re-encrypts silently, a new one
    // gets the pairing prompt (and the code appears on the buddy's screen)
    NimBLEDevice::startSecurity(desc->conn_handle);
    if (linkCount(false) < LINKS) NimBLEDevice::startAdvertising();   // room for one more
  }
  void onDisconnect(NimBLEServer *, ble_gap_conn_desc *desc) override {
    Link *l = linkOf(desc->conn_handle);
    if (l) { l->gone = true; l->used = false; l->secured = false; }
    connEvent = true;                          // advertising restarts by itself
  }

  // Passkey entry: the buddy displays a fresh 6-digit code, the other device types it in.
  uint32_t onPassKeyRequest() override {
    uint32_t k = esp_random() % 1000000;
    passkey = k; showCode = true;
    return k;
  }

  // After pairing, and after a bonded device re-encrypts. Only an authenticated link
  // (the code was typed) may use the service; "Just Works" pairing is thrown out.
  void onAuthenticationComplete(ble_gap_conn_desc *desc) override {
    bool ok = desc->sec_state.encrypted && desc->sec_state.authenticated;
    if (desc->sec_state.encrypted && !desc->sec_state.authenticated) {
      NimBLEDevice::deleteBond(NimBLEAddress(desc->peer_id_addr));
      server->disconnect(desc->conn_handle);
    }
    Link *l = linkOf(desc->conn_handle);
    if (l) {
      l->secured = ok;
      if (ok) { memcpy(l->addr, desc->peer_id_addr.val, 6); l->hello = true; }   // bleLoop says hello
    }
    authOk = ok; authEvent = true; stateDirty = true;
  }
};

class RxCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c, ble_gap_conn_desc *desc) override {
    Link *l = linkOf(desc->conn_handle);
    if (!l || !l->secured) return;                      // the stack already refuses unauthenticated writes; belt and braces
    std::string v = c->getValue();
    l->lastRxAt = millis();                             // before the data, so bleLoop never sees data with an old time
    xStreamBufferSend(l->rx, v.data(), v.size(), 0);    // drops what does not fit
  }
};

/* NimBLE 1.4's setValue(const char *) is a template that would store the pointer itself. */
static void setState() {
  String s = app_state_json();
  stateChr->setValue((const uint8_t *)s.c_str(), s.length());
}

/* Commands that change what the buddy shows or how it plays (not the questions:
 * state, names, status, config, ...). Two devices sending these at once confuse it. */
static bool isAction(const String &cmd) {
  int sp = cmd.indexOf(' ');
  String w = sp < 0 ? cmd : cmd.substring(0, sp);
  return w == "play" || w == "next" || w == "cycle" || w == "screen" || w == "brightness" || w == "theme" ||
         w == "speed" || w == "loops" || w == "rotation" || w == "start";
}

static void run(Link &l, String cmd) {
  cmd.trim();
  if (cmd.isEmpty()) return;
  int me = &l - links;
  Serial.printf("ble %d: %s\n", me + 1, cmd.c_str());
  if (l.pending.length() > MAX_PENDING) return;        // this client is not reading its replies
  size_t before = l.pending.length();
  app_command(cmd, l.out);
  if (l.pending.length() == before) l.pending += "ok\n";  // every command answers
  if (!isAction(cmd)) return;
  uint32_t now = millis();
  l.lastActionAt = now;
  for (auto &o : links)
    if (&o != &l && o.used && o.secured && o.lastActionAt && now - o.lastActionAt < CLASH_MS) {
      Serial.println("bluetooth: two devices at once");
      app_confused();                                  // then back to what this (the later) command chose
      break;
    }
}

/* One TX notification to one device (NimBLE 1.4's notify() goes to every subscriber).
 * Sent whether or not it subscribed (a bonded device's restored subscription is not
 * always reported); a client that did not ask for them ignores them. */
static void notifyOne(Link &l, const uint8_t *data, size_t len) {
  os_mbuf *om = ble_hs_mbuf_from_flat(data, len);
  if (om) ble_gattc_notify_custom(l.handle, txChr->getHandle(), om);
}

void bleBegin() {
  if (!cfg.ble && BUDDY_WIFI) return;                  // without Wi-Fi, Bluetooth is the only wireless link: always on
  for (auto &l : links) { l.rx = xStreamBufferCreate(4096, 1); l.out.pending = &l.pending; }
  NimBLEDevice::init(cfg.name.substring(0, 29).c_str());
  // LE Secure Connections with MITM protection and bonding; legacy pairing is not
  // compiled in (platformio.ini). The buddy can only display, so the method is passkey entry.
  NimBLEDevice::setSecurityAuth(true, true, true);
  NimBLEDevice::setSecurityIOCap(BLE_HS_IO_DISPLAY_ONLY);
  server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCB());
  NimBLEService *svc = server->createService(NUS_SERVICE);
  NimBLECharacteristic *rxChr = svc->createCharacteristic(NUS_RX,
      NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR | NIMBLE_PROPERTY::WRITE_ENC | NIMBLE_PROPERTY::WRITE_AUTHEN);
  rxChr->setCallbacks(new RxCB());
  // notifications cannot be locked by the stack (subscribing is always allowed), so
  // bleLoop only sends them on a secured link
  txChr = svc->createCharacteristic(NUS_TX, NIMBLE_PROPERTY::NOTIFY);
  stateChr = svc->createCharacteristic(STATE_CHR,
      NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::READ_ENC | NIMBLE_PROPERTY::READ_AUTHEN | NIMBLE_PROPERTY::NOTIFY);
  setState();
  svc->start();
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE);
  adv->setScanResponse(true);                          // the name goes in the scan response (no room next to a 128-bit UUID)
  adv->start();
  started = true;
  Serial.printf("bluetooth: %s\n", bleStatus().c_str());
}

/* Pairing code on the screen while pairing runs; back to the face when it is done. */
static void pairingScreen() {
  if (showCode) {
    showCode = false;
    char code[8];
    snprintf(code, sizeof(code), "%03lu %03lu", (unsigned long)(passkey / 1000), (unsigned long)(passkey % 1000));
    Serial.printf("bluetooth: pairing, code %s on the screen\n", code);
    app_message_big("Bluetooth pairing", code, "enter it on your device");
    codeShownAt = millis(); failShownAt = 0;
  }
  if (authEvent) {
    authEvent = false;
    Serial.printf("bluetooth: %s\n", authOk ? "secured (paired device)" : "pairing failed or not authenticated");
    if (codeShownAt) {
      codeShownAt = 0;
      if (authOk) app_resume();
      else { app_message("Bluetooth", "pairing failed"); failShownAt = millis(); }
    }
  }
  if (codeShownAt && (linkCount(false) == linkCount(true) || millis() - codeShownAt > PAIR_SCREEN_MS)) {
    codeShownAt = 0;
    Serial.println("bluetooth: pairing abandoned");
    app_resume();
  }
  if (failShownAt && millis() - failShownAt > FAIL_SCREEN_MS) { failShownAt = 0; app_resume(); }
}

void bleLoop() {
  if (!started) return;
  if (connEvent) {
    connEvent = false;
    Serial.printf("bluetooth: %s\n", bleStatus().c_str());
    for (auto &l : links) {
      if (!l.gone) continue;
      if (l.addr[0] | l.addr[1] | l.addr[2] | l.addr[3] | l.addr[4] | l.addr[5]) markSeen(l.addr);
      memset(l.addr, 0, sizeof(l.addr)); l.hello = false;
      if (uploadActive(l.out)) uploadAbort("Bluetooth disconnected");   // only its own upload; others carry on
      xStreamBufferReset(l.rx);
      l.line = ""; l.pending = ""; l.lastActionAt = 0;
      l.gone = false;                                  // the slot can take a new connection
    }
  }
  pairingScreen();

  for (auto &l : links) {
    if (!l.used || !l.hello || codeShownAt) continue;  // after the pairing screen has gone
    l.hello = false;
    bool back = seenRecently(l.addr);
    markSeen(l.addr);
    if (!back) app_connected();
  }

  for (auto &l : links) {
    if (!l.used) continue;
    // received bytes -> commands, one per line, or upload data while an upload
    // started on this link runs (RxCB only queues them on a secured link)
    uint8_t buf[256];
    size_t n;
    while ((n = xStreamBufferReceive(l.rx, buf, sizeof(buf), 0)) > 0) {
      for (size_t i = 0; i < n; i++) {
        if (uploadActive(l.out)) { size_t used = uploadFeed(buf + i, n - i); i += (used ? used : n - i) - 1; continue; }
        if (buf[i] == '\n' || buf[i] == '\r') { run(l, l.line); l.line = ""; }
        else if (l.line.length() < MAX_LINE) l.line += (char)buf[i];
      }
    }
    if (l.line.length() && !uploadActive(l.out) && millis() - l.lastRxAt > LINE_IDLE_MS) { run(l, l.line); l.line = ""; }
  }

  if (stateDirty) {
    stateDirty = false;
    setState();                                        // reads need a paired link (READ_AUTHEN)
    if (linkCount(true)) stateChr->notify();           // to every subscribed, encrypted link
  }

  // replies, to the device that asked: a few notifications per pass, only while
  // NimBLE has buffers (it does not handle running out of them)
  for (auto &l : links) {
    if (!l.pending.length() || !l.used || !l.secured) continue;
    uint16_t mtu = server->getPeerMTU(l.handle);
    size_t chunk = mtu > 23 ? mtu - 3 : 20;
    for (int k = 0; k < 4 && l.pending.length() && os_msys_num_free() >= 4; k++) {
      size_t len = l.pending.length() < chunk ? l.pending.length() : chunk;
      notifyOne(l, (const uint8_t *)l.pending.c_str(), len);
      l.pending.remove(0, len);
    }
  }
}

#endif  // BUDDY_BLE
