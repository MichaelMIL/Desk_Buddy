#!/usr/bin/env python3
"""
firmware.py - build the desk buddy firmware with your own settings, and flash it.

  python3 tools/firmware/firmware.py                 the GUI in your browser: Build and Flash pages
  python3 tools/firmware/firmware.py --list          the settings and their defaults
  python3 tools/firmware/firmware.py --plan wifi=off battery=off      what a build would do
  python3 tools/firmware/firmware.py --build wifi=off [--upload usb[:PORT] | --upload ota:HOST[@PASSWORD]]

The settings are in options.json (README.md has the format, so adding one is an edit
there). Each picks the PlatformIO base environment and/or adds -D flags. A build runs
`pio run -e <env>` in hardware/ with the flags in PLATFORMIO_BUILD_FLAGS and its own
build directory (hardware/.pio/firmware_tool), so it leaves the normal builds alone.
Each build lands in tools/firmware/out/ as

  deskbuddy_<settings>_<version>.bin          the app, for updates over Wi-Fi
  deskbuddy_<settings>_<version>_factory.bin  bootloader + partition table + app in one
                                              image from 0x0: what the web flasher writes
  deskbuddy_<settings>_<version>.json         what it was built with, sizes

The Flash page (flash.html) writes a factory image from the browser over Web Serial
(Chrome or Edge), skipping the settings partition so Wi-Fi and pairing survive.

The GUI server binds 127.0.0.1 only; its API needs the random token from the URL it
opens, so other web pages cannot start builds or uploads.
"""
import argparse
import configparser
import hmac
import http.client
import json
import os
import re
import secrets
import shlex
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
HW = os.path.join(REPO, "hardware")
OPTIONS_FILE = os.path.join(HERE, "options.json")
OUT_DIR = os.path.join(HERE, "out")
BUILD_DIR = os.path.join(HW, ".pio", "firmware_tool")
PAGES = {"/": "index.html", "/index.html": "index.html", "/flash.html": "flash.html", "/wiring.html": "wiring.html",
         "/style.css": "style.css", "/partmap.js": "partmap.js"}
CTYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8"}
LIBRARY_DIR = os.environ.get("DESK_BUDDY_LIBRARY") or os.path.join(os.path.expanduser("~"), ".config", "desk-buddy", "library")
FS_BLOCK = 4096                                  # LittleFS block size on the buddy
HOST_RE = re.compile(r"^[A-Za-z0-9.\-]{1,253}(?::\d{1,5})?$")
PORT_RE = re.compile(r"^[\w./\-:]{1,200}$")
OUT_RE = re.compile(r"^deskbuddy_[a-z0-9_.\-]{1,120}\.bin$")
SIZE_RE = re.compile(r"^(RAM|Flash):\s+\[.*\]\s+([\d.]+)%\s+\(used (\d+) bytes from (\d+) bytes\)")
TRUE, FALSE = {"1", "true", "on", "yes", "y"}, {"0", "false", "off", "no", "n"}


# ---- settings -> build plan ---------------------------------------------------------

def load_options(path=OPTIONS_FILE):
    with open(path) as f:
        doc = json.load(f)
    ids = [o["id"] for o in doc["options"]]
    if len(ids) != len(set(ids)):
        raise ValueError("options.json: duplicate option id")
    return doc


def fw_version():
    try:
        with open(os.path.join(HW, "platformio.ini")) as f:
            m = re.search(r"^__fw_version\s*=\s*(\S+)", f.read(), re.M)
        return m.group(1) if m else "dev"
    except OSError:
        return "dev"


_macros = {}
def macro_supported(macro, src=os.path.join(HW, "src")):
    """True when the firmware source mentions `macro` (an option needing firmware support)."""
    key = (macro, src)
    if key not in _macros:
        pat, found = re.compile(r"\b%s\b" % re.escape(macro)), False
        for root, _, files in os.walk(src):
            for name in files:
                if name.endswith((".c", ".cpp", ".h")):
                    try:
                        with open(os.path.join(root, name), errors="replace") as f:
                            if pat.search(f.read()):
                                found = True
                                break
                    except OSError:
                        pass
            if found:
                break
        _macros[key] = found
    return _macros[key]


def parse_value(opt, raw):
    """A setting's value from a string (command line) or JSON value (GUI)."""
    t = opt["type"]
    if t == "bool":
        if isinstance(raw, bool):
            return raw
        s = str(raw).strip().lower()
        if s in TRUE:
            return True
        if s in FALSE:
            return False
        raise ValueError("%s: expected on or off, not %r" % (opt["id"], raw))
    if t == "choice":
        values = [c["value"] for c in opt["choices"]]
        if raw in values:
            return raw
        if str(raw) in [str(v) for v in values]:
            return values[[str(v) for v in values].index(str(raw))]
        raise ValueError("%s: expected one of %s, not %r" % (opt["id"], ", ".join(map(str, values)), raw))
    if t == "number":
        try:
            v = int(raw)
        except (TypeError, ValueError):
            raise ValueError("%s: expected a whole number, not %r" % (opt["id"], raw))
        if ("min" in opt and v < opt["min"]) or ("max" in opt and v > opt["max"]):
            raise ValueError("%s: %d is outside %s..%s" % (opt["id"], v, opt.get("min", ""), opt.get("max", "")))
        return v
    raise ValueError("%s: unknown option type %r" % (opt["id"], t))


def effect(opt, value):
    """What a value does: {"env"?, "flags"?, "forces"?, "slug"?}."""
    t = opt["type"]
    if t == "bool":
        return opt.get("on" if value else "off", {})
    if t == "choice":
        return next(c for c in opt["choices"] if c["value"] == value)
    if t == "number":
        return {"flags": [opt["flag"]], "slug": opt.get("slug")} if value != opt["default"] or opt.get("always") else {}
    return {}


def plan(doc, values=None, supported=macro_supported):
    """Turns settings into a build: env, flags, output name, warnings and errors."""
    opts = {o["id"]: o for o in doc["options"]}
    vals, errors = {o["id"]: o["default"] for o in doc["options"]}, []
    for k, raw in (values or {}).items():
        if k not in opts:
            errors.append("unknown setting %r" % k)
            continue
        try:
            vals[k] = parse_value(opts[k], raw)
        except ValueError as e:
            errors.append(str(e))
    forced = {}                                  # option id -> label of the option forcing it
    for o in doc["options"]:
        for k, v in (effect(o, vals[o["id"]]).get("forces") or {}).items():
            if k not in opts:
                errors.append("%s forces an unknown setting %r" % (o["label"], k))
                continue
            try:
                vals[k] = parse_value(opts[k], v)
            except ValueError as e:
                errors.append(str(e))
            forced[k] = o["label"]
    env, env_from, flags, slug = doc["base_env"], None, [], []
    for o in doc["options"]:
        v = vals[o["id"]]
        if o.get("requires") and not supported(o["requires"]) and v != o["default"]:
            errors.append("%s: the firmware does not support this yet (no %s in hardware/src)" % (o["label"], o["requires"]))
        e = effect(o, v)
        if e.get("env"):
            if env_from and e["env"] != env:
                errors.append("%s and %s need different base environments (%s, %s)" % (env_from, o["label"], env, e["env"]))
            env, env_from = e["env"], o["label"]
        flags += [f.format(value=v) for f in e.get("flags", [])]
        if e.get("slug") and o["id"] not in forced:          # "serial", not "serial_nowifi_noble"
            slug.append(e["slug"].format(value=v))
    warnings = [w["text"] for w in doc.get("warnings", []) if all(vals.get(k) == v for k, v in w["when"].items())]
    notes = [o["upload_note"] for o in doc["options"] if o.get("upload_note")]
    name = "_".join(["deskbuddy"] + slug + [fw_version()])
    return {"env": env, "flags": flags, "values": vals, "forced": forced, "name": name, "warnings": warnings,
            "errors": errors, "upload_notes": notes, "wifi_build": env == doc["base_env"]}   # base_env is the Wi-Fi build


DEFINE_RE = re.compile(r"-D\s*([A-Za-z_]\w*)(?:=(\S+))?")
HEADER_DEFAULT_RE = re.compile(r"#ifndef\s+(\w+)\s*\n\s*#define\s+\1\s+(-?(?:0x[0-9a-fA-F]+|\d+))\b")


def read_ini(path=os.path.join(HW, "platformio.ini")):
    cp = configparser.ConfigParser(interpolation=None, strict=False, inline_comment_prefixes=(";",))
    cp.read(path)
    return cp


def ini_env_value(env, key, cp=None, seen=()):
    """A setting of [env:<env>] in platformio.ini, following `extends`; None when unset."""
    cp = cp or read_ini()
    sec = "env:" + env
    if sec not in cp or env in seen:
        return None
    s = cp[sec]
    if key in s:
        return s[key]
    ext = s.get("extends", "").strip()
    return ini_env_value(ext[4:] if ext.startswith("env:") else ext, key, cp, seen + (env,)) if ext else None


def ini_env_flags(env, path=os.path.join(HW, "platformio.ini")):
    """An environment's build_flags from platformio.ini, following `extends` and ${env:X.build_flags}."""
    cp = read_ini(path)

    def flags_of(name, seen=()):
        raw = ini_env_value(name, "build_flags", cp)
        if raw is None or name in seen:
            return ""
        return re.sub(r"\$\{env:([\w\-]+)\.build_flags\}", lambda m: flags_of(m.group(1), seen + (name,)), raw)
    return flags_of(env)


# ---- flash layout ----------------------------------------------------------------------

PART_TYPES = {"app": 0, "data": 1}
PART_SUBTYPES = {0: {"factory": 0x00, "test": 0x20, **{"ota_%d" % i: 0x10 + i for i in range(16)}},
                 1: {"ota": 0x00, "phy": 0x01, "nvs": 0x02, "coredump": 0x03, "nvs_keys": 0x04, "efuse": 0x05,
                     "undefined": 0x06, "fat": 0x81, "spiffs": 0x82, "littlefs": 0x83}}


def parse_size(v):
    """"0x10000", "65536", "64K", "1M" -> bytes; "" -> None."""
    v = v.strip()
    if not v:
        return None
    m = re.match(r"^(0x[0-9a-fA-F]+|\d+)\s*([KkMm]?)$", v)
    if not m:
        raise ValueError("bad size %r" % v)
    return int(m.group(1), 0) * {"": 1, "K": 1024, "M": 1048576}[m.group(2).upper()]


def parse_partitions(path):
    """Rows of an ESP-IDF partition CSV, as {label, type, subtype, offset, size} with numeric type and
    subtype (the same shape as a binary table read back from flash). Blank offsets are placed like
    gen_esp32part.py does: after the previous partition, apps aligned to 64 KB, data to 4 KB."""
    rows, nxt = [], 0x9000                       # after the bootloader (0x0) and the table (0x8000)
    with open(path) as f:
        for line in f:
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            cols = [c.strip() for c in line.split(",")]
            name, typ, sub, off, size = (cols + [""] * 5)[:5]
            t = PART_TYPES.get(typ, None)
            t = int(typ, 0) if t is None else t
            st = PART_SUBTYPES.get(t, {}).get(sub)
            st = int(sub, 0) if st is None else st
            align = 0x10000 if t == 0 else 0x1000
            o = parse_size(off)
            if o is None:
                o = (nxt + align - 1) // align * align
            sz = parse_size(size)
            rows.append({"label": name, "type": t, "subtype": st, "offset": o, "size": sz})
            nxt = o + sz
    return rows


def flash_size(env):
    """The board's flash size in bytes (PlatformIO board manifest), 4 MB if unknown."""
    board = (ini_env_value(env, "board") or "").strip()
    override = ini_env_value(env, "board_upload.flash_size")
    txt = override
    if not txt and board:
        for base in (os.path.join(os.path.expanduser("~"), ".platformio", "platforms", "espressif32", "boards"),):
            try:
                with open(os.path.join(base, board + ".json")) as f:
                    txt = json.load(f).get("upload", {}).get("flash_size")
            except (OSError, ValueError):
                pass
    try:
        return parse_size((txt or "4MB").upper().replace("MB", "M").replace("KB", "K"))
    except ValueError:
        return 4 * 1048576


def layout(env):
    """The flash layout a build gets: {flash_size, partitions, csv}."""
    csv = (ini_env_value(env, "board_build.partitions") or "").strip()
    if not csv:
        return None
    return {"flash_size": flash_size(env), "partitions": parse_partitions(os.path.join(HW, csv)), "csv": "hardware/" + csv}


def fs_margin(src=os.path.join(HW, "src", "store.cpp")):
    """The headroom the firmware keeps free on LittleFS when accepting an upload (FS_MARGIN)."""
    try:
        with open(src) as f:
            m = re.search(r"FS_MARGIN\s*=\s*(\d+)\s*\*\s*1024", f.read())
        return int(m.group(1)) * 1024 if m else 16384
    except OSError:
        return 16384


def library_stats(path=LIBRARY_DIR):
    """Count, bytes and LittleFS blocks of the animations in the library (what the buddy stores)."""
    sizes = []
    try:
        for n in os.listdir(path):
            if n.endswith((".dbal", ".dbaz", ".dba")):
                sizes.append(os.path.getsize(os.path.join(path, n)))
    except OSError:
        pass
    # a LittleFS file takes whole blocks; each block after the first gives a few bytes to its skip-list
    blocks = sum(-(-s // (FS_BLOCK - 8)) for s in sizes)
    return {"dir": path, "count": len(sizes), "bytes": sum(sizes), "blocks": blocks, "block": FS_BLOCK,
            "margin": fs_margin(), "median": sorted(sizes)[len(sizes) // 2] if sizes else None}


def resolve_macros(p, src=os.path.join(HW, "src")):
    """The integer macros a build would see: header defaults (#ifndef X / #define X n), then the
    environment's build_flags, then the settings' flags. Pins, BUDDY_* switches, ..."""
    m = {}
    for root, _, files in os.walk(src):
        for name in sorted(files):
            if name.endswith(".h"):
                with open(os.path.join(root, name), errors="replace") as f:
                    for k, v in HEADER_DEFAULT_RE.findall(f.read()):
                        m[k] = int(v, 0)
    for k, v in DEFINE_RE.findall(ini_env_flags(p["env"]) + " " + " ".join(p["flags"])):
        try:
            m[k] = int(v or "1", 0)
        except ValueError:
            pass                                     # strings like FW_VERSION
    return m


def find_pio():
    for c in (shutil.which("pio"), shutil.which("platformio"),
              os.path.expanduser("~/.platformio/penv/bin/pio")):
        if c and os.access(c, os.X_OK):
            return c
    return None


def command(p, upload=None, pio="pio", hw=HW):
    cmd = [pio, "run", "-d", hw, "-e", p["env"]]
    if upload and upload.get("type") == "usb":
        cmd += ["-t", "upload"] + (["--upload-port", upload["port"]] if upload.get("port") else [])
    return cmd


def build_env(p):
    """The environment variables for building `p` (also for asking pio about that build)."""
    env = os.environ.copy()
    env.pop("PLATFORMIO_BUILD_FLAGS", None)
    if p["flags"]:
        env["PLATFORMIO_BUILD_FLAGS"] = " ".join(p["flags"])
    env["PLATFORMIO_BUILD_DIR"] = BUILD_DIR
    return env


def flash_layout(pio, p):
    """[(offset, path)] of everything besides the app, and the app's offset, from PlatformIO."""
    r = subprocess.run([pio, "project", "metadata", "-d", HW, "-e", p["env"], "--json-output"],
                       capture_output=True, text=True, env=build_env(p), timeout=180)
    out = r.stdout
    if "{" not in out:
        raise RuntimeError("pio project metadata: %s" % (r.stderr.strip() or out.strip() or "no output"))
    extra = json.loads(out[out.index("{"):])[p["env"]]["extra"]
    return [(int(i["offset"], 16), i["path"]) for i in extra["flash_images"]], int(extra.get("application_offset", "0x10000"), 16)


def make_factory(parts, dst):
    """One image from 0x0: each (offset, path) at its offset, 0xFF in between (like esptool merge_bin)."""
    parts = sorted(parts)
    blobs = []
    for off, path in parts:
        with open(path, "rb") as f:
            blobs.append((off, f.read()))
    for (a, da), (b, _) in zip(blobs, blobs[1:]):
        if a + len(da) > b:
            raise RuntimeError("flash images overlap at 0x%x" % b)
    end = max(off + len(d) for off, d in blobs)
    buf = bytearray(b"\xff" * end)
    for off, d in blobs:
        buf[off:off + len(d)] = d
    with open(dst, "wb") as f:
        f.write(buf)
    return len(buf)


def list_builds():
    """The builds in out/, newest first, from their .json files."""
    res = []
    try:
        names = os.listdir(OUT_DIR)
    except OSError:
        return res
    for n in names:
        if not n.endswith(".json"):
            continue
        try:
            with open(os.path.join(OUT_DIR, n)) as f:
                b = json.load(f)
        except (OSError, ValueError):
            continue
        if os.path.exists(os.path.join(OUT_DIR, b.get("factory", ""))):
            res.append(b)
    res.sort(key=lambda b: b.get("built", 0), reverse=True)
    return res


def list_ports(pio):
    """Serial ports from `pio device list`; Espressif USB ones first."""
    try:
        out = subprocess.run([pio, "device", "list", "--serial", "--json-output"], capture_output=True, text=True, timeout=20).stdout
        ports = json.loads(out or "[]")
    except (OSError, ValueError, subprocess.SubprocessError):
        return []
    res = [{"port": p.get("port", ""), "description": p.get("description", ""), "hwid": p.get("hwid", "")} for p in ports]
    res = [p for p in res if p["port"] and "Bluetooth" not in p["port"] and "debug-console" not in p["port"]]
    res.sort(key=lambda p: (not ("303A" in p["hwid"].upper() or "usbmodem" in p["port"]), p["port"]))
    return res


# ---- a build ------------------------------------------------------------------------

class Job:
    """One `pio run`, its log, then the files in out/ and an upload."""

    def __init__(self, p, upload=None, pio="pio", echo=False):
        self.plan, self.upload, self.pio, self.echo = p, upload, pio, echo
        self.lines, self.status, self.result = [], "running", {}
        self.proc, self.stopped, self.lock = None, False, threading.Lock()

    def log(self, line):
        with self.lock:
            self.lines.append(line)
        if self.echo:
            print(line, flush=True)

    def stop(self):
        self.stopped = True
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()

    def run(self):
        try:
            self._run()
        except Exception as e:                       # report, never leave the job "running"
            self.log("error: %s" % e)
            self.status = "failed"

    def _run(self):
        p, env = self.plan, build_env(self.plan)
        cmd = command(p, self.upload, self.pio)
        self.log("$ %s%s" % ("PLATFORMIO_BUILD_FLAGS=%s " % shlex.quote(env["PLATFORMIO_BUILD_FLAGS"]) if p["flags"] else "", shlex.join(cmd)))
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env,
                                     text=True, bufsize=1, errors="replace")
        for line in self.proc.stdout:
            line = line.rstrip("\n")
            self.log(line)
            m = SIZE_RE.match(line)
            if m:
                self.result[m.group(1).lower()] = {"pct": float(m.group(2)), "used": int(m.group(3)), "total": int(m.group(4))}
        rc = self.proc.wait()
        if self.stopped:
            self.log("stopped")
            self.status = "stopped"
            return
        if rc != 0:
            self.log("pio exited with %d" % rc)
            self.status = "failed"
            return
        self._save()
        if self.upload and self.upload.get("type") == "ota":
            self._ota(os.path.join(OUT_DIR, p["name"] + ".bin"))
            return
        if self.upload and self.upload.get("type") == "usb":
            self.result["uploaded"] = "usb"
        self.status = "ok"

    def _save(self):
        """Copies the app to out/, makes the factory image and the .json next to them."""
        p = self.plan
        os.makedirs(OUT_DIR, exist_ok=True)
        app = os.path.join(BUILD_DIR, p["env"], "firmware.bin")
        app_out, fac_out = p["name"] + ".bin", p["name"] + "_factory.bin"
        shutil.copyfile(app, os.path.join(OUT_DIR, app_out))
        images, app_off = flash_layout(self.pio, p)
        size = make_factory(images + [(app_off, app)], os.path.join(OUT_DIR, fac_out))
        info = {"name": p["name"], "app": app_out, "factory": fac_out, "version": fw_version(), "env": p["env"],
                "flags": p["flags"], "values": p["values"], "wifi_build": p["wifi_build"], "built": int(time.time()),
                "app_bytes": os.path.getsize(app), "factory_bytes": size, "app_offset": app_off,
                "flash": self.result.get("flash"), "ram": self.result.get("ram")}
        with open(os.path.join(OUT_DIR, p["name"] + ".json"), "w") as f:
            json.dump(info, f, indent=1)
        rel = os.path.relpath(OUT_DIR, REPO)
        self.result.update({"name": p["name"], "bin": os.path.join(rel, app_out), "factory": os.path.join(rel, fac_out),
                            "bytes": info["app_bytes"], "factory_bytes": size})
        self.log("app: %s (%d KB%s)" % (self.result["bin"], info["app_bytes"] // 1024, ", for updates over Wi-Fi" if p["wifi_build"] else ""))
        self.log("full image: %s (%d KB, from 0x0: the web flasher writes this)" % (self.result["factory"], size // 1024))

    def _ota(self, path):
        host, pw = self.upload["host"], self.upload.get("password") or ""
        self.log("uploading over Wi-Fi to %s ..." % host)
        h, _, port = host.partition(":")
        conn = http.client.HTTPConnection(h, int(port or 80), timeout=180)
        with open(path, "rb") as f:
            data = f.read()
        headers = {"Content-Type": "application/octet-stream", "Content-Length": str(len(data))}
        if pw:
            headers["X-OTA-Password"] = pw
        try:
            conn.request("PUT", "/api/update", body=data, headers=headers)
            r = conn.getresponse()
            body = r.read().decode(errors="replace").strip()
        except OSError as e:
            self.log("upload failed: %s" % e)
            self.status = "failed"
            return
        finally:
            conn.close()
        self.log("buddy: %d %s" % (r.status, body))
        if r.status == 200:
            self.result["uploaded"] = "ota"
            self.log("done, the buddy reboots now")
            self.status = "ok"
        else:
            self.status = "failed"


def check_upload(upload, p):
    """None, or an error for an upload request."""
    if not upload:
        return None
    t = upload.get("type")
    if t == "usb":
        return None if not upload.get("port") or PORT_RE.match(upload["port"]) else "bad port"
    if t == "ota":
        if not p["wifi_build"]:
            return "updates over Wi-Fi need a Wi-Fi build"
        return None if HOST_RE.match(upload.get("host") or "") else "bad address"
    return "unknown upload type"


# ---- GUI server ---------------------------------------------------------------------

class State:
    token = ""
    port = 0
    pio = None
    job = None
    lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    server_version = "deskbuddy-firmware"

    def log_message(self, *a):
        pass

    def _send(self, code, obj=None, body=None, ctype="application/json"):
        data = body if body is not None else json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _allowed(self, needs_token):
        host = self.headers.get("Host", "")
        if host not in ("127.0.0.1:%d" % State.port, "localhost:%d" % State.port):   # DNS rebinding
            self._send(403, {"error": "bad host"})
            return False
        if needs_token and not hmac.compare_digest(self.headers.get("X-Token", ""), State.token):
            self._send(403, {"error": "bad token"})
            return False
        return True

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 65536:
            raise ValueError("body too large")
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        path = self.path.split("?")[0]
        if not self._allowed(path.startswith("/api/") or path.startswith("/out/")):
            return
        if path in PAGES:
            name = PAGES[path]
            with open(os.path.join(HERE, name), "rb") as f:
                return self._send(200, body=f.read(), ctype=CTYPES[os.path.splitext(name)[1]])
        if path.startswith("/out/"):
            name = path[5:]
            if not OUT_RE.match(name) or not os.path.isfile(os.path.join(OUT_DIR, name)):
                return self._send(404, {"error": "not found"})
            with open(os.path.join(OUT_DIR, name), "rb") as f:
                return self._send(200, body=f.read(), ctype="application/octet-stream")
        if path == "/api/options":
            _macros.clear()                          # the firmware may have changed since
            doc = load_options()
            for o in doc["options"]:
                o["supported"] = not o.get("requires") or macro_supported(o["requires"])
            return self._send(200, {"doc": doc, "version": fw_version(), "pio": State.pio,
                                    "out_dir": os.path.relpath(OUT_DIR, REPO)})
        if path == "/api/library":
            return self._send(200, library_stats())
        if path == "/api/builds":
            return self._send(200, {"builds": list_builds(), "out_dir": os.path.relpath(OUT_DIR, REPO)})
        if path == "/api/ports":
            return self._send(200, {"ports": list_ports(State.pio) if State.pio else []})
        if path == "/api/job":
            j = State.job
            if not j:
                return self._send(200, {"status": "idle", "lines": [], "next": 0})
            try:
                since = int(self.path.split("since=")[1].split("&")[0]) if "since=" in self.path else 0
            except ValueError:
                since = 0
            with j.lock:
                lines = j.lines[since:]
                nxt = len(j.lines)
            return self._send(200, {"status": j.status, "lines": lines, "next": nxt, "result": j.result,
                                    "name": j.plan["name"]})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?")[0]
        if not self._allowed(True):
            return
        try:
            req = self._body()
        except ValueError as e:
            return self._send(400, {"error": str(e)})
        if path == "/api/plan":
            p = plan(load_options(), req.get("values") or {})
            p["command"] = shlex.join(command(p, req.get("upload"), "pio", os.path.relpath(HW, REPO)))
            p["layout"] = layout(p["env"])
            last = os.path.join(OUT_DIR, p["name"] + ".json")
            if os.path.exists(last):
                try:
                    with open(last) as f:
                        b = json.load(f)
                    p["last_build"] = {"app_bytes": b.get("app_bytes"), "built": b.get("built")}
                except (OSError, ValueError):
                    pass
            return self._send(200, p)
        if path == "/api/wiring":
            p = plan(load_options(), req.get("values") or {})
            return self._send(200, {"macros": resolve_macros(p), "values": p["values"], "forced": p["forced"],
                                    "errors": p["errors"], "warnings": p["warnings"], "env": p["env"],
                                    "wifi_build": p["wifi_build"]})
        if path == "/api/build":
            if not State.pio:
                return self._send(400, {"error": "PlatformIO (pio) not found"})
            p = plan(load_options(), req.get("values") or {})
            err = p["errors"][0] if p["errors"] else check_upload(req.get("upload"), p)
            if err:
                return self._send(400, {"error": err})
            with State.lock:
                if State.job and State.job.status == "running":
                    return self._send(409, {"error": "a build is already running"})
                State.job = Job(p, req.get("upload"), State.pio)
                threading.Thread(target=State.job.run, daemon=True).start()
            return self._send(200, {"ok": True, "name": p["name"]})
        if path == "/api/stop":
            if State.job:
                State.job.stop()
            return self._send(200, {"ok": True})
        self._send(404, {"error": "not found"})


def serve(port=0, open_browser=True):
    State.token, State.pio = secrets.token_urlsafe(18), find_pio()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    State.port = httpd.server_address[1]
    url = "http://127.0.0.1:%d/?t=%s" % (State.port, State.token)
    print("Desk Buddy firmware: %s" % url, flush=True)
    if not State.pio:
        print("warning: PlatformIO (pio) not found; the Flash page works, building does not", flush=True)
    if open_browser:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        if State.job:
            State.job.stop()


# ---- command line -------------------------------------------------------------------

def parse_settings(items):
    vals = {}
    for it in items:
        k, sep, v = it.partition("=")
        if not sep:
            raise SystemExit("settings are name=value, not %r" % it)
        vals[k.strip()] = v.strip()
    return vals


def parse_upload(s):
    if not s:
        return None
    if s == "usb" or s.startswith("usb:"):
        return {"type": "usb", "port": s[4:] or None}
    if s.startswith("ota:"):
        host, _, pw = s[4:].partition("@")
        return {"type": "ota", "host": host, "password": pw}
    raise SystemExit("--upload is usb, usb:<port> or ota:<address>[@password]")


def main():
    ap = argparse.ArgumentParser(description="Build the desk buddy firmware with your own settings and flash it (GUI without arguments).")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--list", action="store_true", help="show the settings")
    g.add_argument("--plan", nargs="*", metavar="NAME=VALUE", help="show what a build with these settings does")
    g.add_argument("--build", nargs="*", metavar="NAME=VALUE", help="build with these settings")
    ap.add_argument("--upload", help="after --build: usb, usb:<port> or ota:<address>[@password]")
    ap.add_argument("--port", type=int, default=0, help="GUI server port (default: any free one)")
    ap.add_argument("--no-browser", action="store_true", help="GUI: print the address instead of opening it")
    a = ap.parse_args()
    doc = load_options()
    if a.list:
        for o in doc["options"]:
            sup = "" if not o.get("requires") or macro_supported(o["requires"]) else "  (needs firmware support: %s)" % o["requires"]
            kind = {"bool": "on|off", "choice": "|".join(str(c["value"]) for c in o.get("choices", [])),
                    "number": "%s..%s" % (o.get("min", ""), o.get("max", ""))}[o["type"]]
            d = o["default"]
            print("%-10s %-14s default %-6s %s%s" % (o["id"], kind, ("on" if d else "off") if o["type"] == "bool" else d, o["label"], sup))
        return
    if a.plan is not None or a.build is not None:
        p = plan(doc, parse_settings(a.plan if a.plan is not None else a.build))
        up = parse_upload(a.upload)
        for w in p["warnings"]:
            print("warning: " + w)
        if p["errors"]:
            for e in p["errors"]:
                print("error: " + e, file=sys.stderr)
            sys.exit(2)
        err = check_upload(up, p)
        if err:
            sys.exit("error: " + err)
        if a.plan is not None:
            rel = os.path.relpath(OUT_DIR, REPO)
            print("env:    %s\nflags:  %s\noutput: %s.bin, %s_factory.bin\ncommand: %s%s" % (
                p["env"], " ".join(p["flags"]) or "(none)", os.path.join(rel, p["name"]), os.path.join(rel, p["name"]),
                "PLATFORMIO_BUILD_FLAGS=%s " % shlex.quote(" ".join(p["flags"])) if p["flags"] else "", shlex.join(command(p, up))))
            return
        pio = find_pio()
        if not pio:
            sys.exit("error: PlatformIO (pio) not found")
        j = Job(p, up, pio, echo=True)
        j.run()
        sys.exit(0 if j.status == "ok" else 1)
    serve(a.port, not a.no_browser)


if __name__ == "__main__":
    main()
