// Render test frames with gfx.js, encode with dba.js, and write:
//   out/frames.raw  all frames as little-endian RGB565 (for comparison)
//   out/delays.json per-frame delays
//   out/js.dba      encoder output (raw DBA1)
//   out/js.dbaz     the same, deflated (DBAZ container)
// Also round-trips through the JS decoder and the DBAZ compress/decompress pair.
const fs = require('fs');
const path = require('path');
const Gfx = require('../lib/gfx.js');
const DBA = require('../lib/dba.js');

const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });

const g = new Gfx.Framebuffer();
const frames = [], delays = [];
const C = Gfx.COLORS;
const N = 24;
for (let i = 0; i < N; i++) {
  g.clear(C.BLACK);
  g.fillCircle(120, 120, 100, Gfx.hex('#123456'));
  g.drawCircle(120, 120, 110, C.WHITE);
  g.fillRoundRect(40 + i * 2, 60, 80, 40, 8, C.ORANGE);
  g.drawRoundRect(30, 50, 100, 60, 10, C.CYAN);
  g.fillTriangle(150, 150, 200, 170, 160 + i, 210, C.GREEN);
  g.drawTriangle(150, 150, 200, 170, 160 + i, 210, C.RED);
  g.drawLine(0, i * 10, 239, 239 - i * 10, C.YELLOW);
  g.drawEllipse(120, 180, 50, 20, C.MAGENTA);
  g.fillEllipse(60, 180, 20, 30, C.PINK);
  g.drawArc(120, 120, 60, 50, i * 15, i * 15 + 120, Gfx.hsv(i * 15, 1, 1));
  g.drawRect(0, 0, 240, 240, C.DARKGREY);
  // some noise so literals get exercised
  for (let k = 0; k < 300; k++) g.drawPixel((k * 37 + i) % 240, (k * 91 + i * 3) % 240, (k * 977 + i) & 0xffff);
  frames.push(g.snapshot());
  delays.push(i === 5 ? 500 : 40);
}
// two identical frames in a row -> empty delta
frames.push(frames[N - 1].slice());
delays.push(100);

const bytes = DBA.encode(frames, { width: 240, height: 240, delays, loop: true });
fs.writeFileSync(path.join(out, 'js.dba'), bytes);
fs.writeFileSync(path.join(out, 'delays.json'), JSON.stringify(delays));
const raw = Buffer.alloc(frames.length * 240 * 240 * 2);
frames.forEach((f, i) => Buffer.from(f.buffer, f.byteOffset, f.byteLength).copy(raw, i * 240 * 240 * 2));
fs.writeFileSync(path.join(out, 'frames.raw'), raw);

// JS round trip
const dec = DBA.decode(bytes);
if (dec.frames.length !== frames.length) throw new Error('frame count mismatch');
dec.frames.forEach((f, i) => {
  if (f.delay !== delays[i]) throw new Error(`delay mismatch at ${i}`);
  for (let k = 0; k < f.pixels.length; k++) if (f.pixels[k] !== frames[i][k]) throw new Error(`pixel mismatch frame ${i} @ ${k}`);
});
const empty = dec.frames[frames.length - 1].rect;
if (empty.w !== 0 || empty.h !== 0) throw new Error('expected empty delta for identical frame');
// header output sanity
const hdr = DBA.toCHeader(bytes, 'anim_test');
if (!hdr.includes(`anim_test_len = ${bytes.length}`)) throw new Error('bad header');
console.log(`js: ${frames.length} frames, ${bytes.length} bytes, round trip OK`);

// DBAZ: compress, decompress, compare
(async () => {
  const z = await DBA.compress(bytes);
  if (!DBA.isCompressed(z)) throw new Error('compress did not produce DBAZ');
  const back = await DBA.decompress(z);
  if (back.length !== bytes.length) throw new Error('DBAZ round trip length mismatch');
  for (let i = 0; i < bytes.length; i++) if (back[i] !== bytes[i]) throw new Error(`DBAZ round trip mismatch @ ${i}`);
  fs.writeFileSync(path.join(out, 'js.dbaz'), z);
  console.log(`js: DBAZ ${z.length} bytes (${(100 * z.length / bytes.length).toFixed(0)}% of raw), round trip OK`);
})().catch(e => { console.error(e); process.exit(1); });
