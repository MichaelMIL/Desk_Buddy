#!/usr/bin/env python3
"""
serve.py - development server for the simulator.

Serves sim/ as static files and adds two tiny endpoints used by the in-browser
Claude chat so generated animations can be saved straight into animations/:

  GET  /api/ping                 -> {"ok": true, "firmware": <dir or null>, "claude": <cli path or null>}
  POST /api/push  {host, name, data_base64, play?}
                                 -> uploads the animation to a running desk buddy and optionally plays it.
                                    host = an address (HTTP: PUT http://<host>/api/anim with X-Anim-Name),
                                    "usb" / "usb:<port>" (USB serial) or "ble" / "ble:<name>" (Bluetooth,
                                    paired; the first time the OS asks for the code on the buddy's screen).
                                    Streams NDJSON progress: {"type":"progress","sent","total"} ... {"type":"done",...}
  POST /api/claude {prompt, system, model?, session_id?}
                                 -> runs the Claude Code CLI (`claude -p`, your Claude Code
                                    login, no API key) and streams NDJSON back:
                                    {"type":"delta","text"} ... {"type":"done","session_id","stop_reason","text"}
  POST /api/save  {file, code}   -> writes animations/<file> and adds it to index.js
  POST /api/export {symbol, data_base64, comment}
                                 -> writes <firmware>/anim_<symbol>.h and regenerates
                                    animations.h there (default: ../hardware/src/animations)
  POST /api/library {name, data_base64}
                                 -> saves the animation in the local library (below)
  GET  /api/library              -> {"dir", "animations": [{"name", "file", "bytes"}]}
  GET  /api/library/<name>       -> the animation's bytes (DBAL, or DBAZ/DBA1 if it came that way)

The library (~/.config/desk-buddy/library, or $DESK_BUDDY_LIBRARY) holds a copy of every
animation pushed to a buddy and of every library export (test/library.sh). The Claude Code
bridge, the remote page and the phone app upload from it when they play an animation that
was deleted from the buddy.

Usage: python3 serve.py [port]   (default 8080, binds 127.0.0.1 only)
"""
import base64
import http.client
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
ANIM_DIR = os.path.join(ROOT, "animations")
FIRMWARE_DIR = os.environ.get("SIM_FIRMWARE_DIR") or os.path.normpath(os.path.join(ROOT, "..", "hardware", "src", "animations"))
FILE_RE = re.compile(r"^[a-z0-9][a-z0-9_\-]*\.js$")
SYM_RE = re.compile(r"^anim_[a-z0-9_]+$")
SESSION_RE = re.compile(r"^[0-9a-f\-]{36}$")
HOST_RE = re.compile(r"^(?:usb(?::[\w./\-]+)?|ble(?::[\w .\-]{1,29})?|[A-Za-z0-9.\-]+(?::\d+)?)$")
NAME_RE = re.compile(r"^[a-z0-9_]{1,31}$")
MODEL_RE = re.compile(r"^[a-z0-9][a-z0-9.\-]*$")
REPO_ROOT = os.path.normpath(os.path.join(ROOT, ".."))
LIBRARY_DIR = os.environ.get("DESK_BUDDY_LIBRARY") or os.path.join(os.path.expanduser("~"), ".config", "desk-buddy", "library")
LIB_EXT = {b"DBAL": ".dbal", b"DBAZ": ".dbaz", b"DBA1": ".dba"}
LIB_FILE_RE = re.compile(r"^([a-z0-9_]{1,31})\.(dbal|dbaz|dba)$")


def library_index():
    """Rewrite <library>/index.json from the files there; returns its animations list."""
    anims = []
    if os.path.isdir(LIBRARY_DIR):
        for f in sorted(os.listdir(LIBRARY_DIR)):
            m = LIB_FILE_RE.match(f)
            if m:
                anims.append({"name": m.group(1), "file": f, "bytes": os.path.getsize(os.path.join(LIBRARY_DIR, f))})
        tmp = os.path.join(LIBRARY_DIR, ".index.json.tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump({"version": 1, "animations": anims}, fh, indent=0)
        os.replace(tmp, os.path.join(LIBRARY_DIR, "index.json"))
    return anims


def library_save(name, data):
    """Keep <name>.<dbal|dbaz|dba> in the library (one file per name) and refresh index.json."""
    os.makedirs(LIBRARY_DIR, exist_ok=True)
    ext = LIB_EXT.get(bytes(data[:4]), ".dba")
    for e in set(LIB_EXT.values()) - {ext}:          # the same name in another format is stale now
        try:
            os.remove(os.path.join(LIBRARY_DIR, name + e))
        except FileNotFoundError:
            pass
    tmp = os.path.join(LIBRARY_DIR, ".%s.tmp" % name)
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, os.path.join(LIBRARY_DIR, name + ext))
    return library_index()


def library_file(name):
    for ext in (".dbal", ".dbaz", ".dba"):
        p = os.path.join(LIBRARY_DIR, name + ext)
        if os.path.isfile(p):
            return p
    return None


def find_claude():
    """Path of the Claude Code CLI, or None."""
    p = shutil.which("claude")
    if p:
        return p
    for cand in (os.path.expanduser("~/.local/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"):
        if os.access(cand, os.X_OK):
            return cand
    return None


CLAUDE_CLI = find_claude()

sys.path.insert(0, os.path.join(ROOT, "tools"))
import dba  # noqa: E402  (to_c_header; Pillow not needed for that)
import gen_registry  # noqa: E402


def add_to_index(filename):
    path = os.path.join(ANIM_DIR, "index.js")
    src = open(path, encoding="utf-8").read()
    if re.search(r"['\"]%s['\"]" % re.escape(filename), src):
        return False
    # insert before the closing bracket of the ANIMATION_FILES array
    idx = src.rfind("];")
    if idx < 0:
        raise ValueError("index.js: could not find the end of ANIMATION_FILES")
    before = src[:idx].rstrip()
    if not before.endswith(","):
        before += ","
    src = before + "\n  '%s',\n" % filename + src[idx:]
    open(path, "w", encoding="utf-8").write(src)
    return True


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        # animations are edited live; never let the browser cache them
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        if self.path.split("?")[0] == "/api/ping":
            fw = FIRMWARE_DIR if os.path.isdir(FIRMWARE_DIR) else None
            return self._json(200, {"ok": True, "root": ROOT, "firmware": fw, "claude": CLAUDE_CLI})
        route = self.path.split("?")[0]
        if route == "/api/library":
            return self._json(200, {"dir": LIBRARY_DIR, "animations": library_index()})
        if route.startswith("/api/library/"):
            name = route[len("/api/library/"):]
            path = library_file(name) if NAME_RE.match(name) else None
            if not path:
                return self._json(404, {"error": "not in the library: %s" % name})
            with open(path, "rb") as fh:
                body = fh.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return None
        return super().do_GET()

    def do_POST(self):
        route = self.path.split("?")[0]
        if route == "/api/export":
            return self.do_export()
        if route == "/api/claude":
            return self.do_claude()
        if route == "/api/push":
            return self.do_push()
        if route == "/api/library":
            return self.do_library()
        if route != "/api/save":
            return self._json(404, {"error": "unknown endpoint"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(n) or b"{}")
            name = str(req.get("file", ""))
            code = str(req.get("code", ""))
            if not FILE_RE.match(name) or name in ("index.js", "face_lib.js", "face_rig.js", "claude_kit.js"):
                return self._json(400, {"error": "bad file name: %r" % name})
            if "Sim.register(" not in code:
                return self._json(400, {"error": "code does not call Sim.register"})
            os.makedirs(ANIM_DIR, exist_ok=True)
            path = os.path.join(ANIM_DIR, name)
            existed = os.path.exists(path)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(code if code.endswith("\n") else code + "\n")
            added = add_to_index(name)
            return self._json(200, {"ok": True, "file": name, "overwritten": existed, "added_to_index": added})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"error": str(e)})

    def do_export(self):
        try:
            n = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(n) or b"{}")
            sym = str(req.get("symbol", ""))
            if not SYM_RE.match(sym):
                return self._json(400, {"error": "bad symbol: %r" % sym})
            data = base64.b64decode(req.get("data_base64", ""))
            if data[:4] not in (b"DBA1", b"DBAZ", b"DBAL"):
                return self._json(400, {"error": "data is not a DBA1/DBAZ/DBAL animation"})
            if not os.path.isdir(FIRMWARE_DIR):
                return self._json(400, {"error": "firmware dir not found: %s" % FIRMWARE_DIR})
            path = os.path.join(FIRMWARE_DIR, sym + ".h")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(dba.to_c_header(data, sym, str(req.get("comment", ""))))
            syms = gen_registry.generate(FIRMWARE_DIR)
            return self._json(200, {"ok": True, "file": path, "bytes": len(data), "registry": syms})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"error": str(e)})

    def do_library(self):
        try:
            n = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(n) or b"{}")
            name = str(req.get("name", "")).strip()
            if not NAME_RE.match(name):
                return self._json(400, {"error": "bad name (a-z, 0-9, _ only)"})
            data = base64.b64decode(req.get("data_base64", ""))
            if data[:4] not in LIB_EXT:
                return self._json(400, {"error": "data is not a DBA1/DBAZ/DBAL animation"})
            anims = library_save(name, data)
            return self._json(200, {"ok": True, "name": name, "bytes": len(data), "count": len(anims), "dir": LIBRARY_DIR})
        except Exception as e:  # noqa: BLE001
            return self._json(400, {"error": str(e)})

    def do_push(self):
        try:
            n = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(n) or b"{}")
            host = str(req.get("host", "")).strip()
            name = str(req.get("name", "")).strip()
            if not HOST_RE.match(host):
                return self._json(400, {"error": "bad host"})
            if not NAME_RE.match(name):
                return self._json(400, {"error": "bad name (a-z, 0-9, _ only)"})
            data = base64.b64decode(req.get("data_base64", ""))
            if data[:4] not in (b"DBA1", b"DBAZ", b"DBAL"):
                return self._json(400, {"error": "data is not a DBA1/DBAZ/DBAL animation"})
            if data[:4] == b"DBA1":
                data = dba.compress(data, "zlib")   # DBAZ: every firmware takes it
            library_save(name, data)                 # so it can be put back after it is deleted from the buddy
        except Exception as e:  # noqa: BLE001
            return self._json(400, {"error": str(e)})
        # stream progress while the bytes go to the board
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        def emit(obj):
            try:
                self.wfile.write((json.dumps(obj) + "\n").encode())
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass

        try:
            result = push_to_board(host, name, data, play=bool(req.get("play")),
                                   progress=lambda sent, total: emit({"type": "progress", "sent": sent, "total": total}))
            result["type"] = "done"
            emit(result)
        except BoardError as e:
            emit({"type": "error", "error": str(e)})
        except (OSError, http.client.HTTPException) as e:
            emit({"type": "error", "error": "cannot reach board: %s" % e})
        except Exception as e:  # noqa: BLE001
            emit({"type": "error", "error": str(e)})

    def do_claude(self):
        """Run `claude -p` and relay its stream-json output as NDJSON lines."""
        try:
            n = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(n) or b"{}")
        except Exception as e:  # noqa: BLE001
            return self._json(400, {"error": "bad request: %s" % e})
        if not CLAUDE_CLI:
            return self._json(500, {"error": "Claude Code CLI not found (install it or add `claude` to PATH)"})
        prompt = str(req.get("prompt", "")).strip()
        system = str(req.get("system", ""))
        model = str(req.get("model", "") or "")
        session = str(req.get("session_id", "") or "")
        if not prompt:
            return self._json(400, {"error": "empty prompt"})
        if model and not MODEL_RE.match(model):
            return self._json(400, {"error": "bad model name"})
        if session and not SESSION_RE.match(session):
            return self._json(400, {"error": "bad session id"})

        cmd = [CLAUDE_CLI, "-p", prompt,
               "--output-format", "stream-json", "--verbose", "--include-partial-messages",
               "--tools", "",                 # pure text generation: no file/shell tools
               "--strict-mcp-config",         # don't start the user's MCP servers
               "--setting-sources", "",       # ignore project/user settings (hooks etc.)
               "--permission-mode", "default"]
        if system:
            cmd += ["--system-prompt", system]
        if model:
            cmd += ["--model", model]
        if session:
            cmd += ["--resume", session]

        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        class ClientGone(Exception):
            pass

        def emit(obj):
            try:
                self.wfile.write((json.dumps(obj) + "\n").encode())
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                raise ClientGone()

        env = dict(os.environ)
        env.pop("CLAUDECODE", None)   # allow running from inside a Claude Code session
        try:
            proc = subprocess.Popen(cmd, cwd=REPO_ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    stdin=subprocess.DEVNULL, env=env, text=True, bufsize=1)
        except OSError as e:
            return emit({"type": "error", "message": "could not start claude: %s" % e})

        stderr_buf = []
        threading.Thread(target=lambda: stderr_buf.append(proc.stderr.read()), daemon=True).start()
        timer = threading.Timer(600, proc.kill)
        timer.start()
        text, result, session_id = [], None, session
        try:
            for line in proc.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except ValueError:
                    continue
                t = ev.get("type")
                if t == "system" and ev.get("subtype") == "init":
                    session_id = ev.get("session_id", session_id)
                    emit({"type": "init", "session_id": session_id, "model": ev.get("model")})
                elif t == "stream_event":
                    e = ev.get("event", {})
                    if e.get("type") == "content_block_delta" and e.get("delta", {}).get("type") == "text_delta":
                        text.append(e["delta"]["text"])
                        emit({"type": "delta", "text": e["delta"]["text"]})
                elif t == "result":
                    result = ev
                    session_id = ev.get("session_id", session_id)
            proc.wait()
        except ClientGone:
            # browser went away (reload / new chat): stop the CLI and give up quietly
            proc.kill()
            proc.wait()
            self.log_message("claude: client disconnected, generation cancelled")
            return
        finally:
            timer.cancel()
        try:
            self._claude_finish(emit, proc, result, text, session_id, stderr_buf)
        except ClientGone:
            pass

    def _claude_finish(self, emit, proc, result, text, session_id, stderr_buf):
        if result is None or proc.returncode not in (0, None):
            err = (stderr_buf[0] if stderr_buf else "").strip() or (result or {}).get("result") or "claude exited with code %s" % proc.returncode
            return emit({"type": "error", "message": err[-2000:], "session_id": session_id})
        full = "".join(text) or (result.get("result") if isinstance(result.get("result"), str) else "")
        emit({"type": "done", "session_id": session_id, "stop_reason": result.get("stop_reason"),
              "is_error": bool(result.get("is_error")), "cost_usd": result.get("total_cost_usd"),
              "text": full})

    def log_message(self, fmt, *args):
        # only log API calls and errors, not every static file
        text = fmt % args if args else fmt
        if "/api/" in text or not text.startswith('"GET'):
            super().log_message(fmt, *args)


class BoardError(Exception):
    pass


# Byte-stream upload protocol of the firmware (hardware/src/upload.h), used over USB serial and Bluetooth:
#   > upload <name> <bytes>   < ready <window>   > window bytes   < ack <n>  ...   < stored <name> <kb> KB free
REPLY_RE = re.compile(r"^(ready|ack|stored|error)\b ?(.*)$")
NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"


def _stream_upload(send_line, send_bytes, next_reply, name, data, play, progress):
    """The protocol, transport-agnostic. next_reply(timeout) -> (kind, rest) of the next
    ready/ack/stored/error line, other lines (logs on USB serial) skipped."""
    total = len(data)
    send_line("upload %s %d" % (name, total))
    kind, rest = next_reply(60)              # Bluetooth: the first write may wait for pairing
    if kind != "ready":
        raise BoardError(rest or "board did not accept the upload")
    window = int(rest.split()[0])
    sent = 0
    if progress:
        progress(0, total)
    while sent < total:
        part = data[sent:sent + window]
        send_bytes(part)
        sent += len(part)
        if progress:
            progress(sent, total)
        kind, rest = next_reply(20)
        if kind != "ack":
            raise BoardError(rest or "upload failed")
    kind, rest = next_reply(20)
    if kind != "stored":
        raise BoardError(rest or "board did not store the animation")
    m = re.search(r"(\d+) KB free", rest)
    result = {"ok": True, "name": name, "free_kb": int(m.group(1)) if m else None}
    if play:
        send_line("play " + name)
        result["play"] = {"ok": True}
    return result


def _push_serial(port, name, data, play, progress):
    try:
        import serial
        from serial.tools import list_ports
    except ImportError:
        raise BoardError("USB push needs pyserial: pip install pyserial")
    if not port:   # the ESP32-S3's own USB serial (Espressif vendor id)
        ports = [p.device for p in list_ports.comports() if p.vid == 0x303A]
        if not ports:
            raise BoardError("no desk buddy on USB (looked for an Espressif USB serial port)")
        port = ports[0]
    try:
        ser = serial.Serial(port, 115200, timeout=0.2)
    except serial.SerialException as e:
        raise BoardError("cannot open %s (is a serial monitor open?): %s" % (port, e))
    buf = bytearray()

    def next_reply(timeout):
        nonlocal buf
        end = time.time() + timeout
        while time.time() < end:
            while b"\n" in buf:
                line, _, rest = bytes(buf).partition(b"\n")
                buf = bytearray(rest)
                m = REPLY_RE.match(line.decode(errors="replace").strip())
                if m:
                    return m.group(1), m.group(2)
            buf += ser.read(512)
        raise BoardError("no answer from the board on %s" % port)
    try:
        ser.reset_input_buffer()
        return _stream_upload(lambda t: ser.write((t + "\n").encode()), ser.write, next_reply, name, data, play, progress)
    finally:
        ser.close()


def _bridge_hold(seconds):
    """Ask the Claude Code bridge (claude_integration/buddy_bridge.py) to drop its Bluetooth link
    and stay off the buddy for `seconds` (0 ends the hold). The buddy takes one connection, and a
    command the bridge wrote mid-upload would land in the upload data. No bridge running: ignored."""
    try:
        c = http.client.HTTPConnection("127.0.0.1", 47615, timeout=90)   # waits for an upload the bridge is doing
        c.request("POST", "/hold", body=json.dumps({"seconds": seconds}), headers={"X-Desk-Buddy": "1"})
        c.getresponse().read()
        c.close()
    except OSError:
        pass


def _push_ble(device_name, name, data, play, progress):
    try:
        import asyncio
        from bleak import BleakClient, BleakScanner
    except ImportError:
        raise BoardError("Bluetooth push needs bleak: pip install bleak")
    _bridge_hold(300)
    try:
        return _push_ble_now(device_name, name, data, play, progress, asyncio, BleakClient, BleakScanner)
    finally:
        _bridge_hold(5)   # not 0: push_all.sh pushes the next file right away and renews the hold


def _push_ble_now(device_name, name, data, play, progress, asyncio, BleakClient, BleakScanner):

    async def run():
        def match(d, ad):
            if NUS_SERVICE not in [u.lower() for u in ad.service_uuids]:
                return False
            return not device_name or device_name in (ad.local_name, d.name)
        dev = await BleakScanner.find_device_by_filter(match, timeout=10)
        if not dev:
            raise BoardError("no desk buddy advertising over Bluetooth (is another phone, tab or program connected to it?)")
        replies, text = asyncio.Queue(), [""]

        def on_tx(_, d):
            text[0] += d.decode(errors="replace")
            while "\n" in text[0]:
                line, text[0] = text[0].split("\n", 1)
                m = REPLY_RE.match(line.strip())
                if m:
                    replies.put_nowait((m.group(1), m.group(2)))
        async with BleakClient(dev, timeout=20) as c:
            await c.start_notify(NUS_TX, on_tx)
            mtu = max(20, c.mtu_size - 3)
            loop = asyncio.get_running_loop()
            # _stream_upload is synchronous; run it in a thread and bridge its calls into this loop
            def call(coro, timeout=60):
                return asyncio.run_coroutine_threadsafe(coro, loop).result(timeout)

            def send_line(t):
                call(c.write_gatt_char(NUS_RX, (t + "\n").encode(), response=True))

            async def write_chunks(b):
                for i in range(0, len(b), mtu):
                    await c.write_gatt_char(NUS_RX, b[i:i + mtu], response=False)

            def next_reply(timeout):
                try:
                    return call(asyncio.wait_for(replies.get(), timeout), timeout + 5)
                except Exception:  # noqa: BLE001
                    raise BoardError("no answer from the board over Bluetooth (paired? the code is on its screen)")
            return await loop.run_in_executor(None, lambda: _stream_upload(
                send_line, lambda b: call(write_chunks(b)), next_reply, name, data, play, progress))
    return asyncio.run(run())


def push_to_board(host, name, data, play=False, timeout=60, progress=None, chunk=4096):
    """Upload a DBA1/DBAZ/DBAL animation to a desk buddy, calling progress(sent, total) along the way;
    returns the board's reply. host = ip[:port] (HTTP), "usb[:<port>]" or "ble[:<name>]"."""
    if host == "usb" or host.startswith("usb:"):
        return _push_serial(host[4:], name, data, play, progress)
    if host == "ble" or host.startswith("ble:"):
        return _push_ble(host[4:], name, data, play, progress)
    h, _, port = host.partition(":")
    conn = http.client.HTTPConnection(h, int(port) if port else 80, timeout=timeout)
    try:
        conn.connect()
        # small send buffer so each send() waits for the board to take the data,
        # which makes the progress reflect the real transfer instead of the OS buffer
        try:
            conn.sock.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 8192)
        except OSError:
            pass
        conn.putrequest("PUT", "/api/anim")
        conn.putheader("Content-Type", "application/octet-stream")
        conn.putheader("Content-Length", str(len(data)))
        conn.putheader("X-Anim-Name", name)
        conn.endheaders()
        sent = 0
        if progress:
            progress(0, len(data))
        while sent < len(data):
            conn.send(data[sent:sent + chunk])
            sent += min(chunk, len(data) - sent)
            if progress:
                progress(sent, len(data))
        resp = conn.getresponse()
        body = resp.read().decode(errors="replace")
        if resp.status != 200:
            raise BoardError("board answered %d: %s" % (resp.status, body[:300]))
        result = json.loads(body or "{}")
        if play:
            conn.request("POST", "/api/play?name=" + name, body=b"")
            resp = conn.getresponse()
            pbody = resp.read().decode(errors="replace")
            result["play"] = json.loads(pbody or "{}") if resp.status == 200 else {"error": pbody[:200]}
        return result
    finally:
        conn.close()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("Simulator at http://localhost:%d/  (Ctrl-C to stop)" % port)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
