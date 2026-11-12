/*
 * board.js - shared by the simulator (app.js) and the editor (editor.js):
 * board names, file names, rendering an animation to the bytes the board
 * stores (DBAL: LZMA), and pushing to a running desk buddy through serve.py's
 * /api/push (NDJSON progress). Boards with firmware older than DBAL get DBAZ.
 */
(function () {
  'use strict';

  const HOST_KEY = 'sim.board.host';

  /** Name on the board: <slug>, or <theme>__<slug> for themed animations. */
  function boardName(def) {
    let base = def.name || 'animation';
    if (def.theme) base = base.replace(/^[^:]*:\s*/, '');
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'animation';
    const theme = def.theme ? String(def.theme).toLowerCase().replace(/[^a-z0-9]+/g, '') + '__' : '';
    return theme + slug;
  }

  /** File name in sim/animations/ for an animation name ("Face: giggle" -> face_giggle.js). */
  function fileNameFor(name) {
    const s = String(name || '').toLowerCase().replace(/^face:\s*/, 'face_').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return (s || 'animation') + '.js';
  }

  function frameInfo(def, i, state) {
    return { i, n: def.frames, fps: def.fps, dt: 1000 / def.fps, t: i * 1000 / def.fps, p: def.frames > 1 ? i / def.frames : 0, state };
  }

  /**
   * Encode frames the way the board stores them: DBA1 split into several rectangles per
   * frame or not, whichever is smaller once compressed, in a DBAL (LZMA) container.
   * Returns { raw (DBA1), bytes (DBAL) }.
   */
  function pack(frames, delays, loop) {
    const opts = { width: Gfx.WIDTH, height: Gfx.HEIGHT, delays, loop: loop !== false };
    const split = DBA.encode(frames, { ...opts, split: true });
    const single = DBA.encode(frames, { ...opts, split: false });
    const a = { raw: split, bytes: DBA.compressLzma(split) };
    if (single.length === split.length && single.every((v, i) => v === split[i])) return a;
    const b = { raw: single, bytes: DBA.compressLzma(single) };
    return b.bytes.length < a.bytes.length ? b : a;
  }

  /** Render every frame of `def` (a registered animation) and return { raw, bytes } (see pack). */
  async function build(def) {
    const fb = new Gfx.Framebuffer();
    const state = {};
    if (typeof def.setup === 'function') await def.setup(fb, state);
    const frames = [], delays = [];
    for (let i = 0; i < def.frames; i++) {
      if (window.Face) window.Face.background = null;
      let d = def.frame(fb, frameInfo(def, i, state));
      if (typeof d !== 'number' || !(d >= 0)) d = 1000 / def.fps;
      delays.push(d);
      frames.push(fb.snapshot());
    }
    return pack(frames, delays, def.loop);
  }

  function toBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /* Hosts whose firmware refused DBAL (from before DBAL support): they get DBAZ from then on. */
  const noLzma = new Set();
  const oldFirmwareRefusal = msg => /DBA1\/DBAZ animation/.test(msg) && !/DBAL/.test(msg);

  /**
   * Upload DBAL/DBAZ bytes to the board at `host` as `name`. onProgress(sent, total) is called
   * while the bytes go out. Resolves with the board's reply; throws with a readable message.
   * A board whose firmware predates DBAL refuses it; the bytes are then re-sent as DBAZ.
   */
  async function push(host, name, bytes, play, onProgress) {
    if (DBA.isLzma(bytes) && noLzma.has(host)) bytes = await DBA.compress(await DBA.decompress(bytes));
    try {
      return await pushOnce(host, name, bytes, play, onProgress);
    } catch (e) {
      if (!DBA.isLzma(bytes) || !oldFirmwareRefusal(e.message)) throw e;
      noLzma.add(host);
      return pushOnce(host, name, await DBA.compress(await DBA.decompress(bytes)), play, onProgress);
    }
  }

  async function pushOnce(host, name, bytes, play, onProgress) {
    const r = await fetch('/api/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, name, data_base64: toBase64(bytes), play: !!play }),
    });
    if (!r.ok) {
      let msg = r.statusText;
      try { msg = (await r.json()).error || msg; } catch (e) { /* not JSON */ }
      throw new Error(msg);
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '', result = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch (e) { continue; }
        if (ev.type === 'progress') { if (onProgress) onProgress(ev.sent, ev.total); }
        else if (ev.type === 'done') result = ev;
        else if (ev.type === 'error') throw new Error(ev.error);
      }
    }
    if (!result) throw new Error('connection to serve.py ended without a result');
    return result;
  }

  function getHost() { try { return localStorage.getItem(HOST_KEY) || ''; } catch (e) { return ''; } }
  function setHost(h) { try { localStorage.setItem(HOST_KEY, h); } catch (e) { /* ignore */ } }

  /** Tell other open simulator/editor tabs that an animation file changed. */
  function announceSaved(file, name) {
    try { new BroadcastChannel('desk-buddy-sim').postMessage({ type: 'saved', file, name }); } catch (e) { /* unsupported */ }
  }

  window.Board = { boardName, fileNameFor, frameInfo, pack, build, push, getHost, setHost, announceSaved };
})();
