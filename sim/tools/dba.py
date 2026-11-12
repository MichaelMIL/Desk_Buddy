#!/usr/bin/env python3
"""
dba.py - encode / decode / inspect DBA1 animations (see lib/dba.js for the
format). Lets you turn PNG sequences or GIFs made in any PC tool into files
the desk buddy firmware can play.

  python3 dba.py encode frames/*.png -o anim.h --fps 25
  python3 dba.py encode wave.gif -o wave.dba
  python3 dba.py decode anim.dba -o out_dir/        # PNG per frame
  python3 dba.py gif anim.dba -o preview.gif
  python3 dba.py info anim.dba
  python3 dba.py push anim.dba --host 192.168.50.99 --name face_wave --play   # to a running board
  python3 dba.py push anim.dba --host usb --name face_wave      # over USB serial (or --host ble: Bluetooth)

Needs Pillow:  pip install pillow
"""
import argparse
import glob
import os
import re
import struct
import sys
import zlib

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

MAGIC = b"DBA1"
MAGIC_Z = b"DBAZ"      # compressed container: magic, u32 original size, u32 compressed size, zlib stream
FLAG_LOOP = 1
WIDTH, HEIGHT = 240, 240


def compress(data):
    """DBA1 bytes -> DBAZ bytes (zlib, level 9)."""
    z = zlib.compress(data, 9)
    return MAGIC_Z + struct.pack("<II", len(data), len(z)) + z


def decompress(data):
    """DBAZ or DBA1 bytes -> DBA1 bytes."""
    if data[:4] != MAGIC_Z:
        return data
    orig, clen = struct.unpack_from("<II", data, 4)
    raw = zlib.decompress(data[12:12 + clen])
    if len(raw) != orig:
        raise ValueError("DBAZ: expected %d bytes, got %d" % (orig, len(raw)))
    return raw


# ---- pixel helpers -----------------------------------------------------------

def color565(r, g, b):
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


def rgb_from_565(c):
    r, g, b = (c >> 11) & 0x1F, (c >> 5) & 0x3F, c & 0x1F
    return (r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)


def image_to_565(img, width=WIDTH, height=HEIGHT):
    """Flatten onto black, fit to width x height, return list of RGB565."""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    if img.size != (width, height):
        img = img.resize((width, height), Image.LANCZOS)
    bg = Image.new("RGBA", img.size, (0, 0, 0, 255))
    bg.alpha_composite(img)
    px = bg.convert("RGB").tobytes()
    return [color565(px[i], px[i + 1], px[i + 2]) for i in range(0, len(px), 3)]


# ---- RLE --------------------------------------------------------------------

def rle_encode(px):
    out = bytearray()
    n = len(px)
    i = 0
    while i < n:
        run = 1
        while i + run < n and run < 128 and px[i + run] == px[i]:
            run += 1
        if run >= 2:
            out.append(0x80 | (run - 1))
            out += struct.pack("<H", px[i])
            i += run
            continue
        j = i + 1
        while j < n and j - i < 128:
            if j + 2 < n and px[j] == px[j + 1] == px[j + 2]:
                break
            j += 1
        out.append(j - i - 1)
        out += struct.pack("<%dH" % (j - i), *px[i:j])
        i = j
    return bytes(out)


def rle_decode(data, offset, count):
    out = []
    o = offset
    while len(out) < count:
        t = data[o]
        o += 1
        if t & 0x80:
            length = (t & 0x7F) + 1
            (v,) = struct.unpack_from("<H", data, o)
            o += 2
            out.extend([v] * length)
        else:
            length = t + 1
            out.extend(struct.unpack_from("<%dH" % length, data, o))
            o += 2 * length
    return out, o


# ---- encode / decode -----------------------------------------------------------

def dirty_rect(a, b, width, height):
    x0, y0, x1, y1 = width, height, -1, -1
    for y in range(height):
        row = y * width
        ra, rb = a[row:row + width], b[row:row + width]
        if ra == rb:
            continue
        for x in range(width):
            if ra[x] != rb[x]:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    if x1 < 0:
        return None
    return x0, y0, x1 - x0 + 1, y1 - y0 + 1


def encode(frames, delays, width=WIDTH, height=HEIGHT, loop=True):
    """frames: list of RGB565 lists (width*height). delays: ms per frame."""
    out = bytearray(MAGIC)
    out += struct.pack("<HHHHI", width, height, len(frames), FLAG_LOOP if loop else 0, 0)
    prev = None
    for i, f in enumerate(frames):
        if len(f) != width * height:
            raise ValueError("frame %d has wrong size" % i)
        rect = dirty_rect(prev, f, width, height) if prev is not None else (0, 0, width, height)
        data = b""
        if rect:
            x, y, w, h = rect
            px = []
            for yy in range(h):
                s = (y + yy) * width + x
                px.extend(f[s:s + w])
            data = rle_encode(px)
        else:
            x = y = w = h = 0
        d = max(0, min(65535, int(round(delays[i]))))
        out += struct.pack("<HHHHHHI", x, y, w, h, d, 0, len(data))
        out += data
        prev = f
    return bytes(out)


def decode(data):
    data = decompress(data)
    if data[:4] != MAGIC:
        raise ValueError("not a DBA1 file")
    width, height, count, flags, _ = struct.unpack_from("<HHHHI", data, 4)
    o = 16
    cur = [0] * (width * height)
    frames = []
    for i in range(count):
        x, y, w, h, delay, _, dlen = struct.unpack_from("<HHHHHHI", data, o)
        o += 16
        if w and h:
            px, end = rle_decode(data, o, w * h)
            if end != o + dlen:
                raise ValueError("frame %d: RLE length mismatch" % i)
            for yy in range(h):
                s = (y + yy) * width + x
                cur[s:s + w] = px[yy * w:(yy + 1) * w]
        o += dlen
        frames.append({"pixels": list(cur), "delay": delay, "rect": (x, y, w, h)})
    return {"width": width, "height": height, "loop": bool(flags & FLAG_LOOP), "frames": frames}


def to_c_header(data, symbol, comment=""):
    lines = [
        "/* Generated by desk_buddies sim/tools/dba.py - DBA1 animation. %s */" % comment,
        "#pragma once",
        "#include <stdint.h>",
        "#include <stddef.h>",
        "#ifndef PROGMEM",
        "#define PROGMEM",
        "#endif",
        "const size_t %s_len = %d;" % (symbol, len(data)),
        "const uint8_t %s[] PROGMEM = {" % symbol,
    ]
    for i in range(0, len(data), 16):
        lines.append("  " + ",".join("0x%02x" % b for b in data[i:i + 16]) + ",")
    lines.append("};")
    return "\n".join(lines) + "\n"


def frame_to_image(pixels, width, height):
    raw = bytearray()
    for c in pixels:
        raw += bytes(rgb_from_565(c))
    return Image.frombytes("RGB", (width, height), bytes(raw))


# ---- CLI -------------------------------------------------------------------------

def load_inputs(paths, fps):
    """Yield (pixels, delay_ms) from PNG/JPG files, GIFs (with their own timing) or directories."""
    files = []
    for p in paths:
        if os.path.isdir(p):
            files += sorted(glob.glob(os.path.join(p, "*.png")) + glob.glob(os.path.join(p, "*.PNG")))
        else:
            files += sorted(glob.glob(p)) or [p]
    frames, delays = [], []
    for fp in files:
        img = Image.open(fp)
        n = getattr(img, "n_frames", 1)
        for k in range(n):
            if n > 1:
                img.seek(k)
            frames.append(image_to_565(img.copy()))
            dur = img.info.get("duration") if n > 1 else None
            delays.append(dur if dur else 1000.0 / fps)
    return frames, delays


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    e = sub.add_parser("encode", help="PNG sequence / GIF -> .dba or .h")
    e.add_argument("inputs", nargs="+")
    e.add_argument("-o", "--output", required=True, help=".dba or .h")
    e.add_argument("--fps", type=float, default=30)
    e.add_argument("--no-loop", action="store_true")
    e.add_argument("--raw", action="store_true", help="write uncompressed DBA1 instead of the deflated DBAZ container")
    e.add_argument("--name", help="C symbol name (default from output filename)")

    d = sub.add_parser("decode", help=".dba -> PNG per frame")
    d.add_argument("input")
    d.add_argument("-o", "--output", required=True, help="output directory")

    gf = sub.add_parser("gif", help=".dba -> animated GIF preview")
    gf.add_argument("input")
    gf.add_argument("-o", "--output", required=True)

    inf = sub.add_parser("info", help="print header and per-frame sizes")
    inf.add_argument("input")

    pu = sub.add_parser("push", help="upload a .dba to a desk buddy (Wi-Fi, USB serial or Bluetooth)")
    pu.add_argument("input")
    pu.add_argument("--host", required=True, help="board address (192.168.50.99, desk-buddy.local), usb[:<port>] or ble[:<name>]")
    pu.add_argument("--name", help="name on the board (default: file name without extension / anim_ prefix)")
    pu.add_argument("--play", action="store_true", help="start playing it after the upload")

    a = ap.parse_args(argv)

    if a.cmd == "push":
        import json
        import urllib.request
        data = open(a.input, "rb").read()
        if data[:4] not in (MAGIC, MAGIC_Z):
            sys.exit("%s is not a DBA1/DBAZ file" % a.input)
        if data[:4] == MAGIC:
            data = compress(data)   # the board stores compressed files; convert on the fly
        name = a.name or re.sub(r"^anim_", "", os.path.splitext(os.path.basename(a.input))[0])
        if not re.match(r"^[a-z0-9_]{1,31}$", name):
            sys.exit("bad name %r: use a-z, 0-9, _ (max 31 chars)" % name)
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
        import serve  # noqa: E402  (push_to_board lives in the dev server module)

        def prog(sent, total):
            sys.stdout.write("\r  %s: %5.1f / %5.1f KB  %3d%%" % (name, sent / 1024, total / 1024, 100 * sent // max(1, total)))
            sys.stdout.flush()
        try:
            res = serve.push_to_board(a.host, name, data, play=a.play, progress=prog)
        except serve.BoardError as e:
            sys.exit("\n%s" % e)
        print("\n  stored, %s KB free on the board%s" % (res.get("free_kb", "?"), ", playing" if a.play else ""))
        return

    if a.cmd != "info" and Image is None:
        sys.exit("Pillow is required: pip install pillow")

    if a.cmd == "encode":
        frames, delays = load_inputs(a.inputs, a.fps)
        if not frames:
            sys.exit("no input frames found")
        data = encode(frames, delays, loop=not a.no_loop)
        if not a.raw:
            data = compress(data)
        if a.output.endswith(".h"):
            sym = a.name or "anim_" + os.path.splitext(os.path.basename(a.output))[0]
            with open(a.output, "w") as fh:
                fh.write(to_c_header(data, sym, "%d frames" % len(frames)))
        else:
            with open(a.output, "wb") as fh:
                fh.write(data)
        print("%s: %d frames, %.1f KB" % (a.output, len(frames), len(data) / 1024))

    elif a.cmd == "decode":
        anim = decode(open(a.input, "rb").read())
        os.makedirs(a.output, exist_ok=True)
        for i, f in enumerate(anim["frames"]):
            frame_to_image(f["pixels"], anim["width"], anim["height"]).save(
                os.path.join(a.output, "frame_%04d.png" % i))
        print("wrote %d frames to %s" % (len(anim["frames"]), a.output))

    elif a.cmd == "gif":
        anim = decode(open(a.input, "rb").read())
        imgs = [frame_to_image(f["pixels"], anim["width"], anim["height"]) for f in anim["frames"]]
        imgs[0].save(a.output, save_all=True, append_images=imgs[1:],
                     duration=[f["delay"] for f in anim["frames"]], loop=0)
        print("wrote %s" % a.output)

    elif a.cmd == "info":
        filedata = open(a.input, "rb").read()
        data = decompress(filedata)
        anim = decode(data)
        print("%s: %dx%d, %d frames, loop=%s, %.1f KB%s" % (
            a.input, anim["width"], anim["height"], len(anim["frames"]), anim["loop"], len(filedata) / 1024,
            " deflated (%.1f KB uncompressed)" % (len(data) / 1024) if filedata[:4] == MAGIC_Z else ""))
        o = 16
        for i, f in enumerate(anim["frames"]):
            dlen = struct.unpack_from("<I", data, o + 12)[0]
            print("  frame %3d: rect=%-20s delay=%4d ms  %6d bytes" % (i, f["rect"], f["delay"], dlen))
            o += 16 + dlen


if __name__ == "__main__":
    main()
