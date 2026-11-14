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


class Plan(unittest.TestCase):
    def test_defaults(self):
        p = fb.plan(DOC, {}, YES)
        self.assertEqual(p["env"], "base")
        self.assertEqual(p["flags"], [])
        self.assertEqual(p["errors"], [])
        self.assertTrue(p["name"].endswith("_wifi_ble_pa_" + fb.fw_version()))
        self.assertTrue(p["wifi_build"])

    def test_bool_env_and_flags(self):
        p = fb.plan(DOC, {"wifi": "off", "ble": False}, YES)
        self.assertEqual(p["env"], "nowifi_env")
        self.assertEqual(p["flags"], ["-DBUDDY_BLE=0"])
        self.assertEqual(p["warnings"], ["USB only"])
        self.assertTrue(p["name"].endswith("_nowifi_noble_pa_" + fb.fw_version()))
        self.assertFalse(p["wifi_build"])

    def test_forces(self):
        p = fb.plan(DOC, {"serial": True, "wifi": True, "ble": True}, YES)
        self.assertEqual(p["env"], "nowifi_env")
        self.assertEqual(p["flags"], ["-DBUDDY_BLE=0"])
        self.assertEqual(p["forced"], {"wifi": "Serial only", "ble": "Serial only"})
        self.assertEqual((p["values"]["wifi"], p["values"]["ble"]), (False, False))
        self.assertTrue(p["name"].endswith("_serial_pa_" + fb.fw_version()))
        self.assertEqual(p["warnings"], ["USB only"])
        self.assertEqual(fb.plan(DOC, {"serial": False}, YES)["forced"], {})
        self.assertTrue(any("BUDDY_BLE" in e for e in fb.plan(DOC, {"serial": True}, NO)["errors"]))

    def test_choice_and_number(self):
        p = fb.plan(DOC, {"pins": "b", "spi": "20"}, YES)
        self.assertEqual(p["flags"], ["-DPINS_B=1", "-DSPI_MHZ=20"])
        self.assertTrue(p["name"].endswith("_pb_spi20_" + fb.fw_version()))
        self.assertEqual(fb.plan(DOC, {"spi": 40}, YES)["flags"], [])   # default: no flag

    def test_errors(self):
        self.assertIn("unknown setting 'x'", fb.plan(DOC, {"x": 1}, YES)["errors"])
        self.assertTrue(fb.plan(DOC, {"spi": 99}, YES)["errors"])
        self.assertTrue(fb.plan(DOC, {"pins": "z"}, YES)["errors"])
        self.assertTrue(fb.plan(DOC, {"wifi": "maybe"}, YES)["errors"])

    def test_env_conflict(self):
        p = fb.plan(DOC, {"wifi": False, "pins": "c"}, YES)
        self.assertTrue(any("different base environments" in e for e in p["errors"]))

    def test_requires_firmware_support(self):
        self.assertEqual(fb.plan(DOC, {}, NO)["errors"], [])              # default is fine
        p = fb.plan(DOC, {"ble": False}, NO)
        self.assertTrue(any("BUDDY_BLE" in e for e in p["errors"]))

    def test_parse_bool(self):
        o = DOC["options"][0]
        for s in ("on", "ON", "true", "1", "yes", True):
            self.assertIs(fb.parse_value(o, s), True)
        for s in ("off", "false", "0", "no", False):
            self.assertIs(fb.parse_value(o, s), False)

    def test_upload_checks(self):
        p = fb.plan(DOC, {}, YES)
        self.assertIsNone(fb.check_upload(None, p))
        self.assertIsNone(fb.check_upload({"type": "usb", "port": "/dev/cu.usbmodem1101"}, p))
        self.assertIsNone(fb.check_upload({"type": "ota", "host": "desk-buddy.local"}, p))
        self.assertTrue(fb.check_upload({"type": "ota", "host": "a b"}, p))
        self.assertTrue(fb.check_upload({"type": "usb", "port": "x; rm -rf /"}, p))
        self.assertTrue(fb.check_upload({"type": "ota", "host": "1.2.3.4"}, fb.plan(DOC, {"wifi": False}, YES)))

    def test_command(self):
        p = fb.plan(DOC, {}, YES)
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


if __name__ == "__main__":
    unittest.main()
