/*
 * gfx.js - pixel-exact framebuffer for a 240x240 RGB565 TFT (GC9A01, round 1.28").
 *
 * Everything draws into a Uint16Array of RGB565 pixels using integer
 * rasterizers (no anti-aliasing), the same way Adafruit_GFX / TFT_eSPI do on
 * the microcontroller. draw2d() is an escape hatch for Canvas 2D drawing that
 * gets quantised down to RGB565 afterwards.
 *
 * Works as a classic <script> (window.Gfx) and as a CommonJS module (node).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Gfx = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WIDTH = 240;
  const HEIGHT = 240;
  const RADIUS = 120; // visible active area is a circle of this radius

  // ---- colour helpers -----------------------------------------------------

  function color565(r, g, b) {
    return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | ((b & 0xff) >> 3);
  }

  function rgbFrom565(c) {
    const r = (c >> 11) & 0x1f, g = (c >> 5) & 0x3f, b = c & 0x1f;
    return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
  }

  function hex(s) {
    s = String(s).replace('#', '');
    if (s.length === 3) s = s.split('').map(ch => ch + ch).join('');
    const v = parseInt(s, 16);
    return color565((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
  }

  function hsv(h, s, v) {
    // h in degrees, s and v in 0..1
    h = ((h % 360) + 360) % 360;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return color565(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255));
  }

  function lerp565(a, b, t) {
    const A = rgbFrom565(a), B = rgbFrom565(b);
    return color565(
      Math.round(A[0] + (B[0] - A[0]) * t),
      Math.round(A[1] + (B[1] - A[1]) * t),
      Math.round(A[2] + (B[2] - A[2]) * t));
  }

  // Same values as TFT_eSPI's TFT_xxx constants.
  const COLORS = {
    BLACK: 0x0000, NAVY: 0x000f, DARKGREEN: 0x03e0, DARKCYAN: 0x03ef,
    MAROON: 0x7800, PURPLE: 0x780f, OLIVE: 0x7be0, LIGHTGREY: 0xd69a,
    DARKGREY: 0x7bef, BLUE: 0x001f, GREEN: 0x07e0, CYAN: 0x07ff,
    RED: 0xf800, MAGENTA: 0xf81f, YELLOW: 0xffe0, WHITE: 0xffff,
    ORANGE: 0xfda0, GREENYELLOW: 0xb7e0, PINK: 0xfe19, BROWN: 0x9a60,
    GOLD: 0xfea0, SILVER: 0xc618, SKYBLUE: 0x867d, VIOLET: 0x915c,
  };

  // ---- framebuffer --------------------------------------------------------

  class Framebuffer {
    constructor(width = WIDTH, height = HEIGHT) {
      this.width = width;
      this.height = height;
      this.buf = new Uint16Array(width * height);
      this._scratch = null; // lazily created canvas for draw2d / text
    }

    // -- raw access --------------------------------------------------------

    clear(color = 0) { this.buf.fill(color & 0xffff); }
    fillScreen(color) { this.clear(color); }

    snapshot() { return new Uint16Array(this.buf); }
    restore(pixels) { this.buf.set(pixels); }

    getPixel(x, y) {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
      return this.buf[y * this.width + x];
    }

    drawPixel(x, y, color) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
      this.buf[y * this.width + x] = color & 0xffff;
    }

    /** True when (x,y) is inside the round visible area of the panel. */
    isVisible(x, y) {
      const dx = x + 0.5 - this.width / 2, dy = y + 0.5 - this.height / 2;
      return dx * dx + dy * dy <= RADIUS * RADIUS;
    }

    // -- lines & rects -----------------------------------------------------

    drawFastHLine(x, y, w, color) {
      x |= 0; y |= 0; w |= 0;
      if (y < 0 || y >= this.height || w <= 0) return;
      let x0 = Math.max(0, x), x1 = Math.min(this.width, x + w);
      if (x1 <= x0) return;
      this.buf.fill(color & 0xffff, y * this.width + x0, y * this.width + x1);
    }

    drawFastVLine(x, y, h, color) {
      x |= 0; y |= 0; h |= 0;
      if (x < 0 || x >= this.width || h <= 0) return;
      const y0 = Math.max(0, y), y1 = Math.min(this.height, y + h);
      for (let yy = y0; yy < y1; yy++) this.buf[yy * this.width + x] = color & 0xffff;
    }

    drawLine(x0, y0, x1, y1, color) {
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
      if (y0 === y1) { return this.drawFastHLine(Math.min(x0, x1), y0, Math.abs(x1 - x0) + 1, color); }
      if (x0 === x1) { return this.drawFastVLine(x0, Math.min(y0, y1), Math.abs(y1 - y0) + 1, color); }
      // Bresenham, as in Adafruit_GFX::writeLine
      const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
      if (steep) { [x0, y0] = [y0, x0]; [x1, y1] = [y1, x1]; }
      if (x0 > x1) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }
      const dx = x1 - x0, dy = Math.abs(y1 - y0), ystep = y0 < y1 ? 1 : -1;
      let err = dx >> 1;
      for (; x0 <= x1; x0++) {
        if (steep) this.drawPixel(y0, x0, color); else this.drawPixel(x0, y0, color);
        err -= dy;
        if (err < 0) { y0 += ystep; err += dx; }
      }
    }

    drawRect(x, y, w, h, color) {
      this.drawFastHLine(x, y, w, color);
      this.drawFastHLine(x, y + h - 1, w, color);
      this.drawFastVLine(x, y, h, color);
      this.drawFastVLine(x + w - 1, y, h, color);
    }

    fillRect(x, y, w, h, color) {
      x |= 0; y |= 0; w |= 0; h |= 0;
      for (let yy = y; yy < y + h; yy++) this.drawFastHLine(x, yy, w, color);
    }

    // -- circles (Adafruit_GFX midpoint algorithm) -------------------------

    drawCircle(x0, y0, r, color) {
      x0 |= 0; y0 |= 0; r |= 0;
      let f = 1 - r, ddF_x = 1, ddF_y = -2 * r, x = 0, y = r;
      this.drawPixel(x0, y0 + r, color);
      this.drawPixel(x0, y0 - r, color);
      this.drawPixel(x0 + r, y0, color);
      this.drawPixel(x0 - r, y0, color);
      while (x < y) {
        if (f >= 0) { y--; ddF_y += 2; f += ddF_y; }
        x++; ddF_x += 2; f += ddF_x;
        this.drawPixel(x0 + x, y0 + y, color);
        this.drawPixel(x0 - x, y0 + y, color);
        this.drawPixel(x0 + x, y0 - y, color);
        this.drawPixel(x0 - x, y0 - y, color);
        this.drawPixel(x0 + y, y0 + x, color);
        this.drawPixel(x0 - y, y0 + x, color);
        this.drawPixel(x0 + y, y0 - x, color);
        this.drawPixel(x0 - y, y0 - x, color);
      }
    }

    _fillCircleHelper(x0, y0, r, corners, delta, color) {
      let f = 1 - r, ddF_x = 1, ddF_y = -2 * r, x = 0, y = r, px = x, py = y;
      delta++;
      while (x < y) {
        if (f >= 0) { y--; ddF_y += 2; f += ddF_y; }
        x++; ddF_x += 2; f += ddF_x;
        if (x < y + 1) {
          if (corners & 1) this.drawFastVLine(x0 + x, y0 - y, 2 * y + delta, color);
          if (corners & 2) this.drawFastVLine(x0 - x, y0 - y, 2 * y + delta, color);
        }
        if (y !== py) {
          if (corners & 1) this.drawFastVLine(x0 + py, y0 - px, 2 * px + delta, color);
          if (corners & 2) this.drawFastVLine(x0 - py, y0 - px, 2 * px + delta, color);
          py = y;
        }
        px = x;
      }
    }

    fillCircle(x0, y0, r, color) {
      x0 |= 0; y0 |= 0; r |= 0;
      this.drawFastVLine(x0, y0 - r, 2 * r + 1, color);
      this._fillCircleHelper(x0, y0, r, 3, 0, color);
    }

    _drawCircleHelper(x0, y0, r, corners, color) {
      let f = 1 - r, ddF_x = 1, ddF_y = -2 * r, x = 0, y = r;
      while (x < y) {
        if (f >= 0) { y--; ddF_y += 2; f += ddF_y; }
        x++; ddF_x += 2; f += ddF_x;
        if (corners & 4) { this.drawPixel(x0 + x, y0 + y, color); this.drawPixel(x0 + y, y0 + x, color); }
        if (corners & 2) { this.drawPixel(x0 + x, y0 - y, color); this.drawPixel(x0 + y, y0 - x, color); }
        if (corners & 8) { this.drawPixel(x0 - y, y0 + x, color); this.drawPixel(x0 - x, y0 + y, color); }
        if (corners & 1) { this.drawPixel(x0 - y, y0 - x, color); this.drawPixel(x0 - x, y0 - y, color); }
      }
    }

    drawRoundRect(x, y, w, h, r, color) {
      x |= 0; y |= 0; w |= 0; h |= 0; r |= 0;
      const maxR = ((w < h) ? w : h) >> 1;
      if (r > maxR) r = maxR;
      this.drawFastHLine(x + r, y, w - 2 * r, color);
      this.drawFastHLine(x + r, y + h - 1, w - 2 * r, color);
      this.drawFastVLine(x, y + r, h - 2 * r, color);
      this.drawFastVLine(x + w - 1, y + r, h - 2 * r, color);
      this._drawCircleHelper(x + r, y + r, r, 1, color);
      this._drawCircleHelper(x + w - r - 1, y + r, r, 2, color);
      this._drawCircleHelper(x + w - r - 1, y + h - r - 1, r, 4, color);
      this._drawCircleHelper(x + r, y + h - r - 1, r, 8, color);
    }

    fillRoundRect(x, y, w, h, r, color) {
      x |= 0; y |= 0; w |= 0; h |= 0; r |= 0;
      const maxR = ((w < h) ? w : h) >> 1;
      if (r > maxR) r = maxR;
      this.fillRect(x + r, y, w - 2 * r, h, color);
      this._fillCircleHelper(x + w - r - 1, y + r, r, 1, h - 2 * r - 1, color);
      this._fillCircleHelper(x + r, y + r, r, 2, h - 2 * r - 1, color);
    }

    // -- triangles ---------------------------------------------------------

    drawTriangle(x0, y0, x1, y1, x2, y2, color) {
      this.drawLine(x0, y0, x1, y1, color);
      this.drawLine(x1, y1, x2, y2, color);
      this.drawLine(x2, y2, x0, y0, color);
    }

    fillTriangle(x0, y0, x1, y1, x2, y2, color) {
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0; x2 |= 0; y2 |= 0;
      // sort by y
      if (y0 > y1) { [y0, y1] = [y1, y0]; [x0, x1] = [x1, x0]; }
      if (y1 > y2) { [y2, y1] = [y1, y2]; [x2, x1] = [x1, x2]; }
      if (y0 > y1) { [y0, y1] = [y1, y0]; [x0, x1] = [x1, x0]; }
      let a, b, y;
      if (y0 === y2) {
        a = b = x0;
        if (x1 < a) a = x1; else if (x1 > b) b = x1;
        if (x2 < a) a = x2; else if (x2 > b) b = x2;
        this.drawFastHLine(a, y0, b - a + 1, color);
        return;
      }
      const dx01 = x1 - x0, dy01 = y1 - y0, dx02 = x2 - x0, dy02 = y2 - y0,
            dx12 = x2 - x1, dy12 = y2 - y1;
      let sa = 0, sb = 0;
      const last = (y1 === y2) ? y1 : y1 - 1;
      for (y = y0; y <= last; y++) {
        a = x0 + Math.trunc(sa / dy01);
        b = x0 + Math.trunc(sb / dy02);
        sa += dx01; sb += dx02;
        if (a > b) [a, b] = [b, a];
        this.drawFastHLine(a, y, b - a + 1, color);
      }
      sa = dx12 * (y - y1); sb = dx02 * (y - y0);
      for (; y <= y2; y++) {
        a = x1 + Math.trunc(sa / dy12);
        b = x0 + Math.trunc(sb / dy02);
        sa += dx12; sb += dx02;
        if (a > b) [a, b] = [b, a];
        this.drawFastHLine(a, y, b - a + 1, color);
      }
    }

    // -- ellipses & arcs ---------------------------------------------------

    fillEllipse(cx, cy, rx, ry, color) {
      cx |= 0; cy |= 0; rx |= 0; ry |= 0;
      if (rx < 2 || ry < 2) return;
      const ry2 = ry * ry;
      for (let dy = -ry; dy <= ry; dy++) {
        const dx = Math.floor(rx * Math.sqrt(1 - (dy * dy) / ry2));
        this.drawFastHLine(cx - dx, cy + dy, 2 * dx + 1, color);
      }
    }

    drawEllipse(cx, cy, rx, ry, color) {
      cx |= 0; cy |= 0; rx |= 0; ry |= 0;
      if (rx < 2 || ry < 2) return;
      // TFT_eSPI::drawEllipse
      let x = 0, y = ry;
      const rx2 = rx * rx, ry2 = ry * ry, fx2 = 4 * rx2, fy2 = 4 * ry2;
      let s = 2 * ry2 + rx2 * (1 - 2 * ry);
      for (; ry2 * x <= rx2 * y; x++) {
        this.drawPixel(cx + x, cy + y, color);
        this.drawPixel(cx - x, cy + y, color);
        this.drawPixel(cx - x, cy - y, color);
        this.drawPixel(cx + x, cy - y, color);
        if (s >= 0) { s += fx2 * (1 - y); y--; }
        s += ry2 * ((4 * x) + 6);
      }
      s = 2 * rx2 + ry2 * (1 - 2 * rx);
      x = rx; y = 0;
      for (; rx2 * y <= ry2 * x; y++) {
        this.drawPixel(cx + x, cy + y, color);
        this.drawPixel(cx - x, cy + y, color);
        this.drawPixel(cx - x, cy - y, color);
        this.drawPixel(cx + x, cy - y, color);
        if (s >= 0) { s += fy2 * (1 - x); x--; }
        s += rx2 * ((4 * y) + 6);
      }
    }

    /**
     * Filled arc / ring segment. Angles in degrees, 0 = 12 o'clock, clockwise,
     * like TFT_eSPI::drawArc. rInner = 0 gives a pie slice.
     */
    drawArc(cx, cy, rOuter, rInner, startDeg, endDeg, color) {
      let a0 = ((startDeg % 360) + 360) % 360, a1 = ((endDeg % 360) + 360) % 360;
      const full = Math.abs(endDeg - startDeg) >= 360;
      const r2o = rOuter * rOuter, r2i = rInner * rInner;
      const x0 = Math.max(0, Math.floor(cx - rOuter)), x1 = Math.min(this.width - 1, Math.ceil(cx + rOuter));
      const y0 = Math.max(0, Math.floor(cy - rOuter)), y1 = Math.min(this.height - 1, Math.ceil(cy + rOuter));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy;
          if (d2 > r2o || d2 < r2i) continue;
          if (!full) {
            let ang = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
            const inside = a0 <= a1 ? (ang >= a0 && ang <= a1) : (ang >= a0 || ang <= a1);
            if (!inside) continue;
          }
          this.buf[y * this.width + x] = color & 0xffff;
        }
      }
    }

    // -- bitmaps -----------------------------------------------------------

    /** 1-bit-per-pixel bitmap (MSB first, rows padded to bytes) like GFX drawBitmap. */
    drawBitmap(x, y, bitmap, w, h, color, bg) {
      const byteWidth = (w + 7) >> 3;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const bit = bitmap[j * byteWidth + (i >> 3)] & (0x80 >> (i & 7));
          if (bit) this.drawPixel(x + i, y + j, color);
          else if (bg !== undefined) this.drawPixel(x + i, y + j, bg);
        }
      }
    }

    /** RGB565 pixel block (Uint16Array, w*h), optional transparent colour key. */
    drawRGB565(x, y, w, h, pixels, transparent) {
      for (let j = 0; j < h; j++) {
        const yy = y + j;
        if (yy < 0 || yy >= this.height) continue;
        for (let i = 0; i < w; i++) {
          const xx = x + i;
          if (xx < 0 || xx >= this.width) continue;
          const c = pixels[j * w + i];
          if (transparent !== undefined && c === transparent) continue;
          this.buf[yy * this.width + xx] = c;
        }
      }
    }

    // -- Canvas 2D escape hatch (browser only) ------------------------------

    _canvas() {
      if (!this._scratch) {
        if (typeof document === 'undefined') throw new Error('draw2d/text need a browser');
        const c = document.createElement('canvas');
        c.width = this.width; c.height = this.height;
        this._scratch = c;
      }
      return this._scratch;
    }

    /**
     * Draw with a Canvas 2D context, then composite the result onto the
     * framebuffer and quantise to RGB565. Anti-aliased edges get alpha blended
     * against the existing pixels, so this looks like a pre-rendered image
     * would on the real panel.
     */
    draw2d(fn, opts = {}) {
      const c = this._canvas();
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = opts.smooth !== undefined ? !!opts.smooth : true;
      ctx.save();
      fn(ctx, c);
      ctx.restore();
      this.compositeImageData(ctx.getImageData(0, 0, c.width, c.height), 0, 0, opts.threshold);
    }

    /** Alpha-composite an ImageData onto the framebuffer at (x,y). */
    compositeImageData(img, x = 0, y = 0, threshold) {
      const d = img.data, w = img.width, h = img.height;
      for (let j = 0; j < h; j++) {
        const yy = y + j;
        if (yy < 0 || yy >= this.height) continue;
        for (let i = 0; i < w; i++) {
          const xx = x + i;
          if (xx < 0 || xx >= this.width) continue;
          const o = (j * w + i) * 4, a = d[o + 3];
          if (a === 0) continue;
          const idx = yy * this.width + xx;
          if (a === 255 || (threshold !== undefined && a >= threshold)) {
            this.buf[idx] = color565(d[o], d[o + 1], d[o + 2]);
          } else if (threshold === undefined) {
            const dst = rgbFrom565(this.buf[idx]), t = a / 255;
            this.buf[idx] = color565(
              Math.round(d[o] * t + dst[0] * (1 - t)),
              Math.round(d[o + 1] * t + dst[1] * (1 - t)),
              Math.round(d[o + 2] * t + dst[2] * (1 - t)));
          }
        }
      }
    }

    /**
     * Text via the browser's font engine. opts: { size (px, default 16),
     * font (CSS family, default monospace), weight, align ('left'|'center'|'right'),
     * baseline ('top'|'middle'|'alphabetic'|'bottom'), bg, crisp (threshold alpha) }
     */
    text(x, y, str, color, opts = {}) {
      const [r, g, b] = rgbFrom565(color);
      const size = opts.size || 16;
      this.draw2d(ctx => {
        ctx.font = `${opts.weight || 'normal'} ${size}px ${opts.font || 'monospace'}`;
        ctx.textAlign = opts.align || 'left';
        ctx.textBaseline = opts.baseline || 'top';
        if (opts.bg !== undefined) {
          const m = ctx.measureText(str);
          const [br, bgc, bb] = rgbFrom565(opts.bg);
          let bx = x;
          if (ctx.textAlign === 'center') bx = x - m.width / 2;
          else if (ctx.textAlign === 'right') bx = x - m.width;
          ctx.fillStyle = `rgb(${br},${bgc},${bb})`;
          ctx.fillRect(bx, y, m.width, size * 1.2);
        }
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillText(str, x, y);
      }, { threshold: opts.crisp ? 128 : undefined });
    }

    /** Draw an HTMLImageElement / canvas. opts: { w, h, sx, sy, sw, sh, smooth, threshold } */
    drawImage(img, x, y, opts = {}) {
      this.draw2d(ctx => {
        const w = opts.w || img.width, h = opts.h || img.height;
        if (opts.sw) ctx.drawImage(img, opts.sx || 0, opts.sy || 0, opts.sw, opts.sh, x, y, w, h);
        else ctx.drawImage(img, x, y, w, h);
      }, { smooth: opts.smooth === undefined ? false : opts.smooth, threshold: opts.threshold });
    }

    // -- output ------------------------------------------------------------

    /** Fill a Uint8ClampedArray (RGBA) from the framebuffer. */
    toRGBA(out) {
      const n = this.width * this.height;
      if (!out) out = new Uint8ClampedArray(n * 4);
      for (let i = 0; i < n; i++) {
        const c = this.buf[i];
        const r = (c >> 11) & 0x1f, g = (c >> 5) & 0x3f, b = c & 0x1f;
        out[i * 4] = (r << 3) | (r >> 2);
        out[i * 4 + 1] = (g << 2) | (g >> 4);
        out[i * 4 + 2] = (b << 3) | (b >> 2);
        out[i * 4 + 3] = 255;
      }
      return out;
    }
  }

  /** Load an image (needs http://, not file://, for pixel access). */
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('failed to load ' + url));
      img.src = url;
    });
  }

  return { WIDTH, HEIGHT, RADIUS, Framebuffer, color565, rgbFrom565, hex, hsv, lerp565, COLORS, loadImage };
});
