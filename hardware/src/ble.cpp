#include "ble.h"
#include "app.h"
#include "config.h"
#include <NimBLEDevice.h>
#include <freertos/stream_buffer.h>

#define NUS_SERVICE "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_RX      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_TX      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
#define STATE_CHR   "8b3f2a51-6c0d-4e7a-9b14-d2e5f7a90c36"

static const size_t MAX_LINE = 160, MAX_PENDING = 4096;
static const uint32_t LINE_IDLE_MS = 150;   // a write without a newline ends a command after this pause

static bool started = false;
static NimBLEServer *server = nullptr;
static NimBLECharacteristic *txChr = nullptr, *stateChr = nullptr;
static StreamBufferHandle_t rx = nullptr;   // NimBLE task -> loop task (one writer, one reader)
static volatile uint32_t lastRxAt = 0;
static volatile uint16_t connHandle = 0;
static volatile bool connected = false, connEvent = false, stateDirty = true;
static String line;                         // command being assembled (loop task only)
static String pending;                      // reply text not yet notified (loop task only)

void bleStateChanged() { stateDirty = true; }

String bleStatus() {
  if (!started) return "off";
  return connected ? String("connected") : "advertising as '" + cfg.name.substring(0, 29) + "'";
}

/* Collects one command's reply. */
class Reply : public Print {
 public:
  String text;
  size_t write(uint8_t c) override { text += (char)c; return 1; }
};

class ServerCB : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *, ble_gap_conn_desc *desc) override {
    connHandle = desc->conn_handle; connected = true; connEvent = true; stateDirty = true;
  }
  void onDisconnect(NimBLEServer *) override { connected = false; connEvent = true; }   // advertising restarts by itself
};

class RxCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *c) override {
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
  Reply r;
  app_command(cmd, r, true);
  pending += r.text.length() ? r.text : String("ok\n");
}

void bleBegin() {
  if (!cfg.ble) return;
  rx = xStreamBufferCreate(512, 1);
  NimBLEDevice::init(cfg.name.substring(0, 29).c_str());
  server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCB());
  NimBLEService *svc = server->createService(NUS_SERVICE);
  NimBLECharacteristic *rxChr = svc->createCharacteristic(NUS_RX, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  rxChr->setCallbacks(new RxCB());
  txChr = svc->createCharacteristic(NUS_TX, NIMBLE_PROPERTY::NOTIFY);
  stateChr = svc->createCharacteristic(STATE_CHR, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  setState();
  svc->start();
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE);
  adv->setScanResponse(true);                          // the name goes in the scan response (no room next to a 128-bit UUID)
  adv->start();
  started = true;
  Serial.printf("bluetooth: %s\n", bleStatus().c_str());
}

void bleLoop() {
  if (!started) return;
  if (connEvent) {
    connEvent = false;
    Serial.printf("bluetooth: %s\n", bleStatus().c_str());
    if (!connected) { line = ""; pending = ""; }
  }

  // received bytes -> commands, one per line
  char buf[64];
  size_t n;
  while ((n = xStreamBufferReceive(rx, buf, sizeof(buf), 0)) > 0) {
    for (size_t i = 0; i < n; i++) {
      if (buf[i] == '\n' || buf[i] == '\r') { run(line); line = ""; }
      else if (line.length() < MAX_LINE) line += buf[i];
    }
  }
  if (line.length() && millis() - lastRxAt > LINE_IDLE_MS) { run(line); line = ""; }

  if (stateDirty) {
    stateDirty = false;
    setState();                                        // kept current for reads even with nobody connected
    if (connected) stateChr->notify();
  }

  // replies: a few notifications per pass, only while NimBLE has buffers
  // (notify() in NimBLE-Arduino 1.4 does not handle running out of them)
  if (pending.length() && connected) {
    uint16_t mtu = server->getPeerMTU(connHandle);
    size_t chunk = mtu > 23 ? mtu - 3 : 20;
    for (int k = 0; k < 4 && pending.length() && os_msys_num_free() >= 4; k++) {
      size_t len = pending.length() < chunk ? pending.length() : chunk;
      txChr->notify((const uint8_t *)pending.c_str(), len);
      pending.remove(0, len);
    }
  }
}
