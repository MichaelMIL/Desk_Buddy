/*
 * app.js - simulator UI: loads animations, plays them on a virtual 240x240
 * round display, scrubs frames, exports DBA / C header / PNG.
 */
(function () {
  'use strict';

  const { WIDTH, HEIGHT, RADIUS, Framebuffer } = Gfx;

  // ---- animation registry (what animations/*.js call) ---------------------

  const registry = [];
  window.Sim = {
    register(def) {
      if (!def || typeof def.frame !== 'function') throw new Error('Sim.register: need a frame(g, f) function');
      def.name = def.name || 'untitled';
      def.fps = def.fps || 30;
      if (!def.frames && !def.duration) def.duration = 2000;
      if (!def.frames) def.frames = Math.max(1, Math.round(def.duration / 1000 * def.fps));
      registry.push(def);
    },
    // handy re-exports so animation files can write Sim.hex('#f00') etc.
    ...Gfx,
    C: Gfx.COLORS,
  };

  // ---- DOM ----------------------------------------------------------------

  const $ = id => document.getElementById(id);
  const screen = $('screen');
  const sctx = screen.getContext('2d');
  const stage = $('stage');
  const animList = $('anim-list');
  const log = $('log');

  const fb = new Framebuffer(WIDTH, HEIGHT);
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  const imageData = new ImageData(rgba, WIDTH, HEIGHT);

  // ---- state --------------------------------------------------------------

  const S = {
    anim: null,
    index: 0,          // current frame index
    playing: true,
    acc: 0,            // ms accumulated towards next frame
    lastTs: 0,
    state: {},         // per-animation scratch object
    delays: [],        // per-frame delay overrides captured during playback
    scale: 2,
    round: true,
    grid: false,
    scripts: [],
  };

  function say(msg, isErr) {
    const line = document.createElement('div');
    line.textContent = msg;
    if (isErr) line.className = 'err';
    log.prepend(line);
    while (log.children.length > 60) log.lastChild.remove();
    if (isErr) console.error(msg); else console.log(msg);
  }

  // ---- loading animation scripts -----------------------------------------

  /* Load an animation file. Each file runs in its own function scope, so top-level
   * `const`/`let` helpers in different files (or in the same file on reload) never
   * collide, and syntax or runtime errors end up in the log with the file name.
   * Opening index.html from file:// cannot fetch(), so that falls back to a <script> tag. */
  async function loadScript(src) {
    const url = src + (src.includes('?') ? '&' : '?') + 'v=' + Date.now();
    let code = null;
    try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) code = await r.text(); } catch (e) { /* file:// */ }
    if (code === null) return loadScriptTag(url, src);
    try {
      new Function(code + '\n//# sourceURL=' + src)();
    } catch (e) {
      throw new Error(`${src}: ${e.message}`);
    }
  }

  function loadScriptTag(url, src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => resolve(s);
      s.onerror = () => reject(new Error('could not load ' + src));
      document.head.appendChild(s);
      S.scripts.push(s);
    });
  }

  async function reloadAnimations(keepName) {
    const prevName = keepName || (S.anim && S.anim.name);
    for (const s of S.scripts) s.remove();
    S.scripts = [];
    registry.length = 0;
    try {
      await loadScript('animations/index.js');
      const files = window.ANIMATION_FILES || [];
      for (const f of files) {
        const before = registry.length;
        try { await loadScript('animations/' + f); }
        catch (e) { say(e.message, true); }
        for (let i = before; i < registry.length; i++) registry[i]._file = f;
      }
    } catch (e) { say(e.message, true); }
    buildList();
    const found = registry.find(a => a.name === prevName) || registry[0];
    if (found) selectAnimation(found, true);
    say(`loaded ${registry.length} animation(s)`);
  }

  /* Categories: an explicit `category`, else the name prefix before ":" ("Face: angry" ->
   * "Faces", "Halloween: bat" -> "Halloween"), else the theme, else "Other".
   * Groups appear in manifest order; collapsed groups are remembered per browser. */
  const COLLAPSE_KEY = 'sim.list.collapsed';
  let collapsed = new Set();
  try { collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); } catch (e) { /* storage unavailable */ }
  function saveCollapsed() { try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed])); } catch (e) { /* ignore */ } }

  function categoryOf(a) {
    if (a.category) return String(a.category);
    const m = a.name.match(/^([^:]+):\s*\S/);
    if (m) return m[1].trim() === 'Face' ? 'Faces' : m[1].trim();
    if (a.theme) return String(a.theme).charAt(0).toUpperCase() + String(a.theme).slice(1);
    return 'Other';
  }
  function shortName(a) { return a.name.replace(/^[^:]+:\s*(?=\S)/, ''); }

  function buildList() {
    const groups = new Map();
    for (const a of registry) {
      const c = categoryOf(a);
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(a);
    }
    if (groups.has('Other')) { const o = groups.get('Other'); groups.delete('Other'); groups.set('Other', o); }   // always last
    animList.innerHTML = '';
    for (const [cat, anims] of groups) {
      const theme = anims.find(a => a.theme);
      const box = document.createElement('li');
      box.className = 'cat' + (collapsed.has(cat) ? ' collapsed' : '');
      const head = document.createElement('div');
      head.className = 'cat-head';
      head.innerHTML = '<span class="caret"></span><span class="cat-name"></span><span class="cat-tag"></span><span class="cat-count"></span>';
      head.querySelector('.cat-name').textContent = cat;
      head.querySelector('.cat-tag').textContent = theme ? 'theme' : '';
      head.querySelector('.cat-count').textContent = anims.length;
      head.title = theme ? `theme "${theme.theme}": on the board these play only when that theme is selected` : '';
      head.onclick = () => {
        if (collapsed.has(cat)) collapsed.delete(cat); else collapsed.add(cat);
        box.classList.toggle('collapsed');
        saveCollapsed();
      };
      const ul = document.createElement('ul');
      for (const a of anims) {
        const li = document.createElement('li');
        li.className = 'item' + (S.anim && S.anim.name === a.name ? ' active' : '');
        li.dataset.name = a.name;
        li.textContent = shortName(a);
        li.title = `${a.name}: ${a.frames} frames @ ${a.fps} fps` + (a.theme ? `, board name ${symbolName(a).slice(5)}` : '');
        li.onclick = () => selectAnimation(a);
        ul.appendChild(li);
      }
      box.appendChild(head);
      box.appendChild(ul);
      animList.appendChild(box);
    }
    const active = animList.querySelector('li.item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });   // keep the selection visible in the scrolled list
  }

  // ---- rendering ----------------------------------------------------------

  async function runSetup(anim) {
    S.state = {};
    fb.clear(0);
    if (typeof anim.setup === 'function') {
      try { await anim.setup(fb, S.state); }
      catch (e) { say(`${anim.name} setup: ${e.message}`, true); }
    }
  }

  function frameInfo(anim, i) {
    return {
      i, n: anim.frames, fps: anim.fps,
      dt: 1000 / anim.fps,
      t: i * 1000 / anim.fps,
      p: anim.frames > 1 ? i / anim.frames : 0,
      state: S.state,
    };
  }

  /** Run frame i of the current animation on the framebuffer. Returns its delay (ms). */
  function renderFrame(anim, i) {
    let delay;
    if (window.Face) window.Face.background = null;
    try { delay = anim.frame(fb, frameInfo(anim, i)); }
    catch (e) { say(`${anim.name} frame ${i}: ${e.message}`, true); S.playing = false; }
    if (typeof delay !== 'number' || !(delay >= 0)) delay = 1000 / anim.fps;
    return delay;
  }

  /** Re-run the animation from scratch up to and including frame k. */
  async function renderTo(anim, k) {
    await runSetup(anim);
    let delay = 1000 / anim.fps;
    for (let i = 0; i <= k; i++) delay = renderFrame(anim, i);
    S.index = k;
    S.currentDelay = delay;
    present();
  }

  function present() {
    fb.toRGBA(rgba);
    sctx.putImageData(imageData, 0, 0);
    if (S.grid && S.scale >= 4) drawGrid();
    updateHud();
  }

  function drawGrid() {
    // grid is drawn on the overlay canvas in CSS pixels
    const ov = $('overlay'), c = ov.getContext('2d');
    ov.width = WIDTH * S.scale; ov.height = HEIGHT * S.scale;
    c.clearRect(0, 0, ov.width, ov.height);
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x <= WIDTH; x += 10) { c.moveTo(x * S.scale + 0.5, 0); c.lineTo(x * S.scale + 0.5, ov.height); }
    for (let y = 0; y <= HEIGHT; y += 10) { c.moveTo(0, y * S.scale + 0.5); c.lineTo(ov.width, y * S.scale + 0.5); }
    c.stroke();
  }

  function updateHud() {
    const a = S.anim;
    if (!a) return;
    $('hud-frame').textContent = `${S.index + 1} / ${a.frames}`;
    $('hud-time').textContent = `${(S.index * 1000 / a.fps / 1000).toFixed(2)} s`;
    $('hud-fps').textContent = `${a.fps} fps`;
    $('scrub').max = a.frames - 1;
    $('scrub').value = S.index;
    $('btn-play').textContent = S.playing ? 'Pause' : 'Play';
  }

  // ---- playback loop ------------------------------------------------------

  function tick(ts) {
    requestAnimationFrame(tick);
    const a = S.anim;
    if (!a || !S.playing || S.busy) { S.lastTs = ts; return; }
    const dt = Math.min(100, ts - (S.lastTs || ts));
    S.lastTs = ts;
    S.acc += dt;
    let drew = false;
    while (S.acc >= S.currentDelay) {
      S.acc -= S.currentDelay;
      S.index = (S.index + 1) % a.frames;
      if (S.index === 0) {
        // restart from a clean slate so playback matches export
        S.busy = true;
        renderTo(a, 0).then(() => { S.busy = false; });
        return;
      }
      S.currentDelay = renderFrame(a, S.index);
      drew = true;
      if (S.currentDelay <= 0) S.currentDelay = 1;
    }
    if (drew) present();
  }

  async function selectAnimation(anim, silent) {
    const changed = !S.anim || S.anim.name !== anim.name;
    S.anim = anim;
    if (changed && collapsed.delete(categoryOf(anim))) saveCollapsed();
    S.acc = 0;
    S.busy = true;
    await renderTo(anim, 0);
    S.busy = false;
    buildList();
    $('hud-name').textContent = anim.name;
    $('hud-size').textContent = '';
    if (!silent) say(`selected ${anim.name}`);
  }

  // ---- export -------------------------------------------------------------

  async function collectFrames(anim) {
    await runSetup(anim);
    const frames = [], delays = [];
    for (let i = 0; i < anim.frames; i++) {
      delays.push(renderFrame(anim, i));
      frames.push(fb.snapshot());
    }
    return { frames, delays };
  }

  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /** C symbol / board name: anim_<slug>, or anim_<theme>__<slug> for themed animations
   *  (the device shows "<theme>__" animations only when that theme is selected). */
  function symbolName(anim) {
    return 'anim_' + Board.boardName(anim);
  }

  /** Render + encode + compress the animation. Returns { raw, bytes } (bytes = DBAL, see Board.pack). */
  async function buildAnimation(anim) {
    const { frames, delays } = await collectFrames(anim);
    const { raw, bytes } = Board.pack(frames, delays, anim.loop);
    $('hud-size').textContent = `${(bytes.length / 1024).toFixed(1)} KB (${(raw.length / 1024).toFixed(1)} KB uncompressed)`;
    return { raw, bytes };
  }

  async function exportDBA(asHeader) {
    const a = S.anim;
    if (!a) return;
    S.busy = true;
    try {
      const { bytes } = await buildAnimation(a);
      const sym = symbolName(a);
      const kb = (bytes.length / 1024).toFixed(1);
      if (asHeader) {
        download(sym + '.h', new Blob([DBA.toCHeader(bytes, sym, `${a.name}: ${a.frames} frames @ ${a.fps} fps, LZMA`)], { type: 'text/plain' }));
      } else {
        download(sym + '.dba', new Blob([bytes], { type: 'application/octet-stream' }));
      }
      say(`exported ${a.name}: ${a.frames} frames, ${kb} KB`);
    } finally {
      await renderTo(a, S.index);
      S.busy = false;
    }
  }

  async function exportToFirmware(anim) {
    anim = anim || S.anim;
    if (!anim) return null;
    S.busy = true;
    try {
      const { bytes } = await buildAnimation(anim);
      let b64 = '';
      for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      const r = await fetch('/api/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symbolName(anim), data_base64: btoa(b64), comment: `${anim.name}: ${anim.frames} frames @ ${anim.fps} fps` }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      say(`firmware: wrote ${j.file.split('/').slice(-3).join('/')} (${(bytes.length / 1024).toFixed(1)} KB), registry now ${j.registry.length} animation(s)`);
      return j;
    } catch (e) {
      say('firmware export failed: ' + e.message, true);
      return null;
    } finally {
      await renderTo(anim, S.index);
      S.busy = false;
    }
  }

  async function pushToBoard(anim) {
    anim = anim || S.anim;
    if (!anim) return null;
    const host = $('board-host').value.trim();
    if (!host) { say('enter the board address first (e.g. 192.168.50.99 or desk-buddy.local)', true); return null; }
    localStorage.setItem('sim.board.host', host);
    S.busy = true;
    try {
      const { bytes } = await buildAnimation(anim);
      const name = symbolName(anim).replace(/^anim_/, '');
      const kb = (bytes.length / 1024).toFixed(1);
      say(`board: uploading ${name} (${kb} KB) to ${host}…`);
      showProgress(`uploading ${name} to ${host}`, 0);
      const j = await Board.push(host, name, bytes, $('chk-board-play').checked, (sent, total) =>
        showProgress(`uploading ${name} to ${host}: ${(sent / 1024).toFixed(0)} / ${(total / 1024).toFixed(0)} KB`, total ? sent / total : 0));
      showProgress(`stored ${name} on ${host}`, 1);
      say(`board: stored ${name}${j.play ? ', now playing' : ''} (${j.free_kb !== undefined ? j.free_kb + ' KB free on the board' : 'ok'})`);
      return j;
    } catch (e) {
      say('board push failed: ' + e.message, true);
      showProgress('push failed: ' + e.message, 0, true);
      return null;
    } finally {
      setTimeout(hideProgress, 2500);
      await renderTo(anim, S.index);
      S.busy = false;
    }
  }

  function showProgress(text, frac, isErr) {
    const box = $('board-progress');
    box.style.display = '';
    $('board-progress-bar').value = Math.round(frac * 100);
    $('board-progress-text').textContent = text;
    $('board-progress-text').className = isErr ? 'err' : '';
  }
  function hideProgress() { $('board-progress').style.display = 'none'; }

  function exportPNG() {
    const a = S.anim;
    if (!a) return;
    const c = document.createElement('canvas');
    c.width = WIDTH; c.height = HEIGHT;
    c.getContext('2d').putImageData(imageData, 0, 0);
    c.toBlob(b => download(`${symbolName(a)}_${String(S.index).padStart(4, '0')}.png`, b), 'image/png');
  }

  async function estimateSize() {
    const a = S.anim;
    if (!a) return;
    S.busy = true;
    await buildAnimation(a);
    await renderTo(a, S.index);
    S.busy = false;
  }

  // ---- view controls ------------------------------------------------------

  function applyView() {
    const px = WIDTH * S.scale;
    screen.style.width = px + 'px';
    screen.style.height = px + 'px';
    stage.style.width = px + 'px';
    stage.style.height = px + 'px';
    stage.classList.toggle('round', S.round);
    const ov = $('overlay');
    ov.style.width = px + 'px'; ov.style.height = px + 'px';
    if (!(S.grid && S.scale >= 4)) ov.getContext('2d').clearRect(0, 0, ov.width, ov.height);
    present();
  }

  function wire() {
    $('btn-play').onclick = () => { S.playing = !S.playing; S.lastTs = 0; updateHud(); };
    $('btn-step').onclick = async () => {
      S.playing = false;
      const a = S.anim; if (!a) return;
      S.busy = true; await renderTo(a, (S.index + 1) % a.frames); S.busy = false;
    };
    $('btn-back').onclick = async () => {
      S.playing = false;
      const a = S.anim; if (!a) return;
      S.busy = true; await renderTo(a, (S.index - 1 + a.frames) % a.frames); S.busy = false;
    };
    $('btn-restart').onclick = async () => { S.busy = true; await renderTo(S.anim, 0); S.busy = false; };
    $('scrub').oninput = async e => {
      S.playing = false;
      S.busy = true; await renderTo(S.anim, +e.target.value); S.busy = false;
    };
    $('btn-reload').onclick = () => reloadAnimations();
    $('btn-export-dba').onclick = () => exportDBA(false);
    $('btn-export-h').onclick = () => exportDBA(true);
    $('btn-export-png').onclick = exportPNG;
    $('btn-size').onclick = estimateSize;
    $('btn-export-fw').onclick = () => exportToFirmware();
    $('btn-push-board').onclick = () => pushToBoard();
    $('btn-edit').onclick = () => {
      const a = S.anim;
      if (!a) return;
      if (!a._file) { say('this animation is not saved to a file yet (save it from the chat first)', true); return; }
      window.open(`editor.html?file=${encodeURIComponent(a._file)}&name=${encodeURIComponent(a.name)}`, 'desk-buddy-editor');
    };
    // the editor announces saves: reload and show the saved animation
    try {
      new BroadcastChannel('desk-buddy-sim').onmessage = e => {
        if (e.data && e.data.type === 'saved') { say(`editor saved animations/${e.data.file}`); reloadAnimations(e.data.name); }
      };
    } catch (e) { /* BroadcastChannel unsupported */ }
    $('board-host').value = localStorage.getItem('sim.board.host') || '';
    fetch('/api/ping').then(r => r.json()).then(j => {
      if (j && j.ok && j.firmware) {
        $('btn-export-fw').style.display = '';
        $('btn-export-fw').title = 'write anim_<name>.h into ' + j.firmware;
      }
      if (j && j.ok) $('board-row').style.display = '';
    }).catch(() => {});
    $('sel-scale').onchange = e => { S.scale = +e.target.value; applyView(); };
    $('chk-round').onchange = e => { S.round = e.target.checked; applyView(); };
    $('chk-grid').onchange = e => { S.grid = e.target.checked; applyView(); };

    screen.onmousemove = e => {
      const r = screen.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / S.scale), y = Math.floor((e.clientY - r.top) / S.scale);
      const c = fb.getPixel(x, y);
      const [cr, cg, cb] = Gfx.rgbFrom565(c);
      $('hud-pixel').textContent = `(${x}, ${y})  0x${c.toString(16).padStart(4, '0')}  rgb(${cr},${cg},${cb})${fb.isVisible(x, y) ? '' : '  [outside round area]'}`;
      $('hud-swatch').style.background = `rgb(${cr},${cg},${cb})`;
    };

    document.addEventListener('keydown', e => {
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName) || e.target.isContentEditable) return;
      if (e.code === 'Space') { e.preventDefault(); $('btn-play').click(); }
      else if (e.code === 'ArrowRight') $('btn-step').click();
      else if (e.code === 'ArrowLeft') $('btn-back').click();
      else if (e.key === 'r') reloadAnimations();
    });
  }

  // ---- API for lib/chat.js ------------------------------------------------

  /** Render every frame of `anim` off-screen and collect error messages. */
  async function dryRun(anim) {
    const errors = [];
    const wasPlaying = S.playing;
    S.busy = true;
    try {
      S.state = {};
      fb.clear(0);
      if (typeof anim.setup === 'function') {
        try { await anim.setup(fb, S.state); } catch (e) { errors.push(`setup: ${e.message}`); }
      }
      for (let i = 0; i < anim.frames && errors.length < 5; i++) {
        if (window.Face) window.Face.background = null;
        try { anim.frame(fb, frameInfo(anim, i)); } catch (e) { errors.push(`frame ${i}: ${e.message}`); }
      }
    } finally {
      S.busy = false;
      S.playing = wasPlaying;
      if (S.anim) await renderTo(S.anim, S.index);
    }
    return errors;
  }

  window.SimApp = {
    registry,
    current: () => S.anim,
    select: a => selectAnimation(a),
    reload: name => reloadAnimations(name),
    dryRun,
    exportToFirmware,
    pushToBoard,
    removeAnimation(name) {
      const i = registry.findIndex(a => a.name === name);
      if (i >= 0) registry.splice(i, 1);
    },
  };

  // ---- boot ---------------------------------------------------------------

  wire();
  $('sel-scale').value = S.scale;
  applyView();
  reloadAnimations().then(() => requestAnimationFrame(tick));
})();
