#!/usr/bin/env python3
"""Tests for firmware.py: settings -> build plan, the factory image (no PlatformIO needed):
    python3 tools/firmware/test_firmware.py"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import firmware as fb  # noqa: E402

DOC = {
    "base_env": "base",
    "options": [
        {"id": "wifi", "label": "Wi-Fi", "type": "bool", "default": True,
         "on": {"slug": "wifi"}, "off": {"env": "nowifi_env", "slug": "nowifi"}, "upload_note": "erases"},
        {"id": "ble", "label": "Bluetooth", "type": "bool", "default": True, "requires": "BUDDY_BLE",
         "on": {"slug": "ble"}, "off": {"flags": ["-DBUDDY_BLE=0"], "slug": "noble"}},
        {"id": "serial", "label": "Serial only", "type": "bool", "default": False,
         "on": {"forces": {"wifi": False, "ble": False}, "slug": "serial"}},
        {"id": "pins", "label": "Pins", "type": "choice", "default": "a",
         "choices": [{"value": "a", "slug": "pa"}, {"value": "b", "flags": ["-DPINS_B=1"], "slug": "pb"},
                     {"value": "c", "env": "other_env"}]},
        {"id": "spi", "label": "SPI MHz", "type": "number", "default": 40, "min": 10, "max": 80,
         "flag": "-DSPI_MHZ={value}", "slug": "spi{value}"},
    ],
    "warnings": [{"when": {"wifi": False, "ble": False}, "text": "USB only"}],
}
YES = lambda macro: True   # noqa: E731
NO = lambda macro: False   # noqa: E731


def dplan(values, supported):
    """plan() on the made-up DOC, whose environments are not in platformio.ini."""
    return fb.plan(DOC, values, supported, env_exists=lambda env: True)


class Plan(unittest.TestCase):
    def test_defaults(self):
        p = dplan({}, YES)
        self.assertEqual(p["env"], "base")
        self.assertEqual(p["flags"], [])
        self.assertEqual(p["errors"], [])
        self.assertTrue(p["name"].endswith("_wifi_ble_pa_" + fb.fw_version()))
        self.assertTrue(p["wifi_build"])

    def test_bool_env_and_flags(self):
        p = dplan({"wifi": "off", "ble": False}, YES)
        self.assertEqual(p["env"], "nowifi_env")
        self.assertEqual(p["flags"], ["-DBUDDY_BLE=0"])
        self.assertEqual(p["warnings"], ["USB only"])
        self.assertTrue(p["name"].endswith("_nowifi_noble_pa_" + fb.fw_version()))
        self.assertFalse(p["wifi_build"])

    def test_forces(self):
        p = dplan({"serial": True, "wifi": True, "ble": True}, YES)
        self.assertEqual(p["env"], "nowifi_env")
        self.assertEqual(p["flags"], ["-DBUDDY_BLE=0"])
        self.assertEqual(p["forced"], {"wifi": "Serial only", "ble": "Serial only"})
        self.assertEqual((p["values"]["wifi"], p["values"]["ble"]), (False, False))
        self.assertTrue(p["name"].endswith("_serial_pa_" + fb.fw_version()))
        self.assertEqual(p["warnings"], ["USB only"])
        self.assertEqual(dplan({"serial": False}, YES)["forced"], {})
        self.assertTrue(any("BUDDY_BLE" in e for e in dplan({"serial": True}, NO)["errors"]))

    def test_choice_and_number(self):
        p = dplan({"pins": "b", "spi": "20"}, YES)
        self.assertEqual(p["flags"], ["-DPINS_B=1", "-DSPI_MHZ=20"])
        self.assertTrue(p["name"].endswith("_pb_spi20_" + fb.fw_version()))
        self.assertEqual(dplan({"spi": 40}, YES)["flags"], [])   # default: no flag

    def test_errors(self):
        self.assertIn("unknown setting 'x'", dplan({"x": 1}, YES)["errors"])
        self.assertTrue(dplan({"spi": 99}, YES)["errors"])
        self.assertTrue(dplan({"pins": "z"}, YES)["errors"])
        self.assertTrue(dplan({"wifi": "maybe"}, YES)["errors"])

    def test_env_conflict(self):
        p = dplan({"wifi": False, "pins": "c"}, YES)
        self.assertTrue(any("different base environments" in e for e in p["errors"]))

    def test_requires_firmware_support(self):
        self.assertEqual(dplan({}, NO)["errors"], [])              # default is fine
        p = dplan({"ble": False}, NO)
        self.assertTrue(any("BUDDY_BLE" in e for e in p["errors"]))

    def test_parse_bool(self):
        o = DOC["options"][0]
        for s in ("on", "ON", "true", "1", "yes", True):
            self.assertIs(fb.parse_value(o, s), True)
        for s in ("off", "false", "0", "no", False):
            self.assertIs(fb.parse_value(o, s), False)

    def test_upload_checks(self):
        p = dplan({}, YES)
        self.assertIsNone(fb.check_upload(None, p))
        self.assertIsNone(fb.check_upload({"type": "usb", "port": "/dev/cu.usbmodem1101"}, p))
        self.assertIsNone(fb.check_upload({"type": "ota", "host": "desk-buddy.local"}, p))
        self.assertTrue(fb.check_upload({"type": "ota", "host": "a b"}, p))
        self.assertTrue(fb.check_upload({"type": "usb", "port": "x; rm -rf /"}, p))
        self.assertTrue(fb.check_upload({"type": "ota", "host": "1.2.3.4"}, dplan({"wifi": False}, YES)))

    def test_command(self):
        p = dplan({}, YES)
        self.assertEqual(fb.command(p)[-2:], ["-e", "base"])
        self.assertEqual(fb.command(p, {"type": "usb", "port": "/dev/x"})[-4:], ["-t", "upload", "--upload-port", "/dev/x"])


class Factory(unittest.TestCase):
    def test_merge(self):
        with tempfile.TemporaryDirectory() as d:
            def blob(name, data):
                p = os.path.join(d, name)
                with open(p, "wb") as f:
                    f.write(data)
                return p
            parts = [(0x10000, blob("app", b"\xe9APP")), (0x0, blob("boot", b"\xe9BOOT")), (0x8000, blob("pt", b"\xaa\x50PT"))]
            n = fb.make_factory(parts, os.path.join(d, "out.bin"))
            with open(os.path.join(d, "out.bin"), "rb") as f:
                img = f.read()
            self.assertEqual(n, 0x10004)
            self.assertEqual(img[:5], b"\xe9BOOT")
            self.assertEqual(img[5:0x8000], b"\xff" * (0x8000 - 5))
            self.assertEqual(img[0x8000:0x8004], b"\xaa\x50PT")
            self.assertEqual(img[0x10000:], b"\xe9APP")
            with self.assertRaises(RuntimeError):
                fb.make_factory([(0, blob("big", b"x" * 0x9000)), (0x8000, parts[2][1])], os.path.join(d, "bad.bin"))

    def test_out_names(self):
        self.assertTrue(fb.OUT_RE.match("deskbuddy_wifi_ble_bat_2026.11.14d_factory.bin"))
        for bad in ("../firmware.py", "deskbuddy_/../x.bin", "other.bin", "deskbuddy_x.json"):
            self.assertFalse(fb.OUT_RE.match(bad), bad)


class RealOptions(unittest.TestCase):
    """options.json itself: valid, and every env it names exists in platformio.ini."""

    def test_options_file(self):
        doc = fb.load_options()
        with open(os.path.join(fb.HW, "platformio.ini")) as f:
            ini = f.read()
        envs = {doc["base_env"]}
        for o in doc["options"]:
            self.assertIn(o["type"], ("bool", "choice", "number"))
            self.assertIn("label", o)
            fb.parse_value(o, o["default"])
            for e in [o.get("on", {}), o.get("off", {})] + o.get("choices", []):
                if e.get("env"):
                    envs.add(e["env"])
                for k in e.get("forces", {}):
                    self.assertIn(k, [x["id"] for x in doc["options"]])
        for e in envs:
            self.assertIn("[env:%s]" % e, ini)
        self.assertEqual(fb.plan(doc, {})["env"], doc["base_env"])
        json.dumps(fb.plan(doc, {}))

    def test_battery_off_forces_charging_off(self):
        p = fb.plan(fb.load_options(), {"battery": False, "charging": True})
        self.assertEqual(p["forced"].get("charging"), "Battery level")
        self.assertIn("-DBUDDY_BATTERY=0", p["flags"])
        self.assertNotIn("nochg", p["name"])                 # forced: not in the name


class BluetoothUpdates(unittest.TestCase):
    def test_serial_turns_ble_and_ble_ota_off(self):
        p = fb.plan(fb.load_options(), {"serial": True, "ble_ota": True}, supported=lambda m: True, env_exists=lambda e: True)
        self.assertEqual(p["values"]["ble"], False)
        self.assertEqual(p["values"]["ble_ota"], False)              # through ble's own forces
        self.assertIn("ble_ota", p["forced"])
        self.assertNotIn("bleota", p["name"])

    def test_env_rule_without_wifi(self):
        doc = fb.load_options()
        p = fb.plan(doc, {"wifi": False, "ble_ota": True}, supported=lambda m: True, env_exists=lambda e: True)
        self.assertEqual(p["env"], "esp32s3_supermini_ble_ota")
        self.assertIn("-DBUDDY_BLE_OTA=1", p["flags"])
        self.assertIn("_bleota_", p["name"])
        p = fb.plan(doc, {"wifi": True, "ble_ota": True}, supported=lambda m: True, env_exists=lambda e: True)
        self.assertEqual(p["env"], doc["base_env"])                  # the Wi-Fi build has its update slot
        p = fb.plan(doc, {"wifi": False, "ble_ota": True}, supported=lambda m: True, env_exists=lambda e: e != "esp32s3_supermini_ble_ota")
        self.assertTrue(any("esp32s3_supermini_ble_ota" in e for e in p["errors"]))

    def test_env_rules_exist_or_are_locked(self):
        """Every env_rules environment is in platformio.ini, unless its settings still need firmware support."""
        doc = fb.load_options()
        opts = {o["id"]: o for o in doc["options"]}
        for r in doc.get("env_rules", []):
            locked = any(opts[k].get("requires") and not fb.macro_supported(opts[k]["requires"]) for k in r["when"])
            self.assertTrue(fb.env_in_ini(r["env"]) or locked, r["env"])

    def test_upload_parsing(self):
        self.assertEqual(fb.parse_upload("ble"), {"type": "ble", "name": "", "password": ""})
        self.assertEqual(fb.parse_upload("ble:Desk Buddy"), {"type": "ble", "name": "Desk Buddy", "password": ""})
        self.assertEqual(fb.parse_upload("ble:Desk Buddy@pw"), {"type": "ble", "name": "Desk Buddy", "password": "pw"})
        self.assertEqual(fb.parse_upload("ble@pw"), {"type": "ble", "name": "", "password": "pw"})

    def test_upload_needs_a_ble_update_build(self):
        p = fb.plan(fb.load_options(), {})
        if not fb.ble_update_build(p):
            self.assertIn("Bluetooth", fb.check_upload({"type": "ble"}, p))


class Wiring(unittest.TestCase):
    """Pins and switches as the firmware would see them (headers, platformio.ini, flags)."""

    def macros(self, **values):
        return fb.resolve_macros(fb.plan(fb.load_options(), values))

    def test_defaults(self):
        m = self.macros()
        self.assertEqual((m["BUDDY_WIFI"], m["BUDDY_BLE"], m["BUDDY_BATTERY"]), (1, 1, 1))
        for k in ("TFT_SCLK", "TFT_MOSI", "TFT_CS", "TFT_DC", "TFT_RST", "BAT_PIN", "BAT_CHRG_PIN", "BAT_STDBY_PIN"):
            self.assertIn(k, m)
        self.assertGreaterEqual(m["BAT_CHRG_PIN"], 0)

    def test_settings_change_macros(self):
        self.assertEqual(self.macros(wifi=False)["BUDDY_WIFI"], 0)       # from the ble env's build_flags
        m = self.macros(charging=False)
        self.assertEqual((m["BAT_CHRG_PIN"], m["BAT_STDBY_PIN"]), (-1, -1))
        self.assertEqual(self.macros(battery=False)["BUDDY_BATTERY"], 0)
        self.assertEqual(self.macros(serial=True)["BUDDY_BLE"], 0)

    def test_ini_flags_follow_extends(self):
        self.assertIn("-DTFT_MOSI=", fb.ini_env_flags("esp32s3_supermini_ble"))
        self.assertIn("-DBUDDY_WIFI=0", fb.ini_env_flags("esp32s3_supermini_ble"))
        self.assertIn("-DTFT_MOSI=", fb.ini_env_flags("ota"))           # extends, no build_flags of its own


class Layout(unittest.TestCase):
    def test_parse_size(self):
        self.assertEqual(fb.parse_size("0x10000"), 0x10000)
        self.assertEqual(fb.parse_size("64K"), 65536)
        self.assertEqual(fb.parse_size("1M"), 1048576)
        self.assertEqual(fb.parse_size("4096"), 4096)
        self.assertIsNone(fb.parse_size(""))

    def test_parse_partitions(self):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
            f.write("# comment\nnvs, data, nvs, , 0x5000,\nphy, data, phy, , 4K\napp, app, factory, , 1M,\nfs, data, littlefs, , 512K\n")
        try:
            rows = fb.parse_partitions(f.name)
        finally:
            os.unlink(f.name)
        self.assertEqual([(r["label"], r["type"], r["subtype"], r["offset"], r["size"]) for r in rows], [
            ("nvs", 1, 0x02, 0x9000, 0x5000), ("phy", 1, 0x01, 0xE000, 0x1000),
            ("app", 0, 0x00, 0x10000, 0x100000), ("fs", 1, 0x83, 0x110000, 0x80000)])

    def test_real_layouts(self):
        wifi, ble = fb.layout("esp32s3_supermini"), fb.layout("esp32s3_supermini_ble")
        self.assertEqual(wifi["flash_size"], 4 * 1048576)
        for lay in (wifi, ble):
            parts = sorted(lay["partitions"], key=lambda r: r["offset"])
            self.assertTrue(any(p["type"] == 0 for p in parts))
            self.assertTrue(any(p["type"] == 1 and p["subtype"] in (0x82, 0x83) for p in parts))
            for a, b in zip(parts, parts[1:]):
                self.assertLessEqual(a["offset"] + a["size"], b["offset"])     # no overlaps
            self.assertLessEqual(parts[-1]["offset"] + parts[-1]["size"], lay["flash_size"])
        self.assertEqual(sum(p["type"] == 0 for p in wifi["partitions"]), 2)    # OTA: two app slots
        self.assertEqual(sum(p["type"] == 0 for p in ble["partitions"]), 1)
        # the plan carries it
        self.assertEqual(fb.layout(fb.plan(fb.load_options(), {"wifi": False})["env"])["csv"], ble["csv"])

    def test_library_stats(self):
        with tempfile.TemporaryDirectory() as d:
            for name, n in (("a.dbal", 100), ("b.dbal", 4088), ("c.dbal", 4089), ("notes.json", 50000)):
                with open(os.path.join(d, name), "wb") as f:
                    f.write(b"x" * n)
            st = fb.library_stats(d)
        self.assertEqual(st["count"], 3)
        self.assertEqual(st["bytes"], 100 + 4088 + 4089)
        self.assertEqual(st["blocks"], 1 + 1 + 2)
        self.assertEqual(fb.library_stats("/nonexistent/x")["count"], 0)
        self.assertGreater(fb.fs_margin(), 0)                                 # read from store.cpp


if __name__ == "__main__":
    unittest.main()
