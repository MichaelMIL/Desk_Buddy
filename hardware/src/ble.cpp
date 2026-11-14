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

static bool started = false;
static NimBLEServer *server = nullptr;
static NimBLECharacteristic *txChr = nullptr, *stateChr = nullptr;
static StreamBufferHandle_t rx = nullptr;     // NimBLE task -> loop task (one writer, one reader), 4 KB > one upload window
static volatile uint32_t lastRxAt = 0;
static volatile uint16_t connHandle = 0;
static volatile bool connected = false, connEvent = false, stateDirty = true;
// pairing (set by the NimBLE task, acted on in bleLoop)
static volatile bool secured = false;          // this link is encrypted AND authenticated (paired with the code)
static volatile uint32_t passkey = 0;
static volatile bool showCode = false, authEvent = false, authOk = false;
// loop task only
static String line;                           // command being assembled
static String pending;                        // reply text not yet notified
static uint32_t codeShownAt = 0, failShownAt = 0;

void bleStateChanged() { stateDirty = true; }

int bleBondCount() { return started ? NimBLEDevice::getNumBonds() : -1; }

String bleStatus() {
  if (!started) return "off";   // (always on in a build without Wi-Fi)
  if (connected) return secured ? String("connected, paired") : String("connected, not paired");
  return "advertising as '" + cfg.name.substring(0, 29) + "', " + String(NimBLEDevice::getNumBonds()) + " paired";
}

void bleForgetAll() {
  if (started) NimBLEDevice::deleteAllBonds();
  else {                                       // NimBLE not running: clear its bond store in NVS directly
    Preferences p;
    if (p.begin("nimble_bond", false)) { p.clear(); p.end(); }
  }
  Serial.println("bluetooth: forgot all paired devices");
}

/* Everything the paired device should read: command replies and upload acks.
 * Appends to `pending`, which bleLoop sends as TX notifications. */
class BleOut : public Print {
 public:
  size_t write(uint8_t c) override { pending += (char)c; return 1; }
};
static BleOut bleOut;

class ServerCB : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *, ble_gap_conn_desc *desc) override {
    connHandle = desc->conn_handle; connected = true; secured = false; connEvent = true;
    // ask for security right away: a bonded device re-encrypts silently, a new one
    // gets the pairing prompt (and the code appears on the buddy's screen)
    NimBLEDevice::startSecurity(desc->conn_handle);
  }
  void onDisconnect(NimBLEServer *) override { connected = false; secured = false; connEvent = true; }   // advertising restarts by itself

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
    secured = ok; authOk = ok; authEvent = true; stateDirty = true;
  }
};

class RxCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c) override {
    if (!secured) return;                               // the stack already refuses unauthenticated writes; belt and braces
    std::string v = c->getValue();
    lastRxAt = millis();                                // before the data, so bleLoop never sees data with an old time
    xStreamBufferSend(rx, v.data(), v.size(), 0);       // drops what does not fit
  }
};

/* NimBLE 1.4's setValue(const char *) is a template that would store the pointer itself. */
static void setState() {
  String s = app_state_json();
  stateChr->setValue((const uint8_t *)s.c_str(), s.length());
}

static void run(String cmd) {
  cmd.trim();
  if (cmd.isEmpty()) return;
  Serial.printf("ble: %s\n", cmd.c_str());
  if (pending.length() > MAX_PENDING) return;          // client is not reading its replies
  size_t before = pending.length();
  app_command(cmd, bleOut);
  if (pending.length() == before) pending += "ok\n";  // every command answers
}

void bleBegin() {
  if (!cfg.ble && BUDDY_WIFI) return;                  // without Wi-Fi, Bluetooth is the only wireless link: always on
  rx = xStreamBufferCreate(4096, 1);
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
  if (codeShownAt && (!connected || millis() - codeShownAt > PAIR_SCREEN_MS)) {
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
    if (!connected) {
      if (uploadActive(bleOut)) uploadAbort("Bluetooth disconnected");   // only our own upload; one over USB carries on
      line = ""; pending = "";
    }
  }
  pairingScreen();

  // received bytes -> commands, one per line, or upload data while an upload
  // started here runs (RxCB only queues them on a secured link)
  uint8_t buf[256];
  size_t n;
  while ((n = xStreamBufferReceive(rx, buf, sizeof(buf), 0)) > 0) {
    for (size_t i = 0; i < n; i++) {
      if (uploadActive(bleOut)) { size_t used = uploadFeed(buf + i, n - i); i += (used ? used : n - i) - 1; continue; }
      if (buf[i] == '\n' || buf[i] == '\r') { run(line); line = ""; }
      else if (line.length() < MAX_LINE) line += (char)buf[i];
    }
  }
  if (line.length() && !uploadActive(bleOut) && millis() - lastRxAt > LINE_IDLE_MS) { run(line); line = ""; }

  if (stateDirty) {
    stateDirty = false;
    setState();                                        // reads need a paired link (READ_AUTHEN)
    if (connected && secured) stateChr->notify();
  }

  // replies: a few notifications per pass, only while NimBLE has buffers
  // (notify() in NimBLE-Arduino 1.4 does not handle running out of them)
  if (pending.length() && connected && secured) {
    uint16_t mtu = server->getPeerMTU(connHandle);
    size_t chunk = mtu > 23 ? mtu - 3 : 20;
    for (int k = 0; k < 4 && pending.length() && os_msys_num_free() >= 4; k++) {
      size_t len = pending.length() < chunk ? pending.length() : chunk;
      txChr->notify((const uint8_t *)pending.c_str(), len);
      pending.remove(0, len);
    }
  }
}

#endif  // BUDDY_BLE
