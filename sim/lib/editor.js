/*
 * editor.js - the animation editor (editor.html).
 *
 * Two modes:
 *   visual  keyframed face animations (FaceRig SPECs, see animations/face_rig.js):
 *           pose the face with sliders and poses, keys live on a timeline.
 *   code    any animation file, edited as JavaScript with a live preview.
 * Files are saved through serve.py into sim/animations/ and can be pushed to
 * the board. The simulator tab reloads automatically after a save.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const LIB_FILES = ['index.js', 'face_lib.js', 'face_rig.js', 'claude_kit.js'];

  // ---- Sim API (same contract as the simulator) --------------------------------

  let capture = null;
  function prepare(def) {
    def.name = def.name || 'untitled';
    def.fps = def.fps || 30;
    if (!def.frames && !def.duration) def.duration = 2000;
    if (!def.frames) def.frames = Math.max(1, Math.round(def.duration / 1000 * def.fps));
    return def;
  }
  window.Sim = {
    register(def) {
      if (!def || typeof def.frame !== 'function') throw new Error('Sim.register: need a frame(g, f) function');
      prepare(def);
      if (capture) capture.push(def);
    },
    ...Gfx,
    C: Gfx.COLORS,
  };

  /** Run an animation file in its own scope; returns the animations it registered. */
  function runFile(code, file) {
    const out = [], prev = capture;
    capture = out;
    try { new Function(code + '\n//# sourceURL=animations/' + file)(); }
    finally { capture = prev; }
    for (const d of out) d._file = file;
    return out;
  }

  // ---- status / small helpers -------------------------------------------------------

  function status(msg, isErr) {
    $('status').textContent = msg;
    $('status').className = isErr ? 'err' : '';
    if (isErr) console.error(msg);
  }
  const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  function categoryOf(a) {
    if (a.category) return String(a.category);
    const m = a.name.match(/^([^:]+):\s*\S/);
    if (m) return m[1].trim() === 'Face' ? 'Faces' : m[1].trim();
    if (a.theme) return cap(a.theme);
    return 'Other';
  }
  async function fetchText(url) {
    const r = await fetch(url + '?v=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.text();
  }

  // ---- library (all animation files) ---------------------------------------------

  const lib = { files: [], sources: {}, defs: [] };

  async function loadLibrary() {
    const idx = await fetchText('animations/index.js');
    const w = {};
    new Function('window', idx)(w);
    lib.files = (w.ANIMATION_FILES || []).slice();
    const texts = await Promise.all(lib.files.map(f => fetchText('animations/' + f).catch(e => { status(e.message, true); return null; })));
    lib.sources = {};
    lib.defs = [];
    lib.files.forEach((f, k) => {
      if (texts[k] == null) return;
      lib.sources[f] = texts[k];
      try { lib.defs.push(...runFile(texts[k], f)); }
      catch (e) { status(`${f}: ${e.message}`, true); }
    });
    buildOpenList();
    buildThemeList();
  }

  function refreshLibraryFile(file, code) {
    lib.sources[file] = code;
    if (!lib.files.includes(file)) lib.files.push(file);
    lib.defs = lib.defs.filter(d => d._file !== file);
    try { lib.defs.push(...runFile(code, file)); } catch (e) { /* shown elsewhere */ }
    buildOpenList();
    buildThemeList();
  }

  function buildOpenList() {
    const q = $('filter').value.trim().toLowerCase();
    const groups = new Map();
    for (const d of lib.defs) {
      if (q && !d.name.toLowerCase().includes(q) && !String(d._file).includes(q)) continue;
      const c = categoryOf(d);
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(d);
    }
    if (groups.has('Other')) { const o = groups.get('Other'); groups.delete('Other'); groups.set('Other', o); }
    const ul = $('open-list');
    ul.innerHTML = '';
    for (const [cat, defs] of groups) {
      const h = document.createElement('li');
      h.className = 'grp';
      h.textContent = cat;
      ul.appendChild(h);
      for (const d of defs) {
        const li = document.createElement('li');
        li.className = 'item' + (doc.file === d._file && currentName() === d.name ? ' active' : '');
        li.textContent = d.name.replace(/^[^:]+:\s*(?=\S)/, '');
        const b = document.createElement('span');
        b.className = 'badge';
        b.textContent = d.rig ? 'visual' : 'code';
        li.appendChild(b);
        li.title = `${d.name} (animations/${d._file})`;
        li.onclick = () => openDef(d);
        ul.appendChild(li);
      }
    }
  }

  function buildThemeList() {
    const themes = [...new Set(lib.defs.map(d => d.theme).filter(Boolean))].sort();
    $('themes').innerHTML = themes.map(t => `<option value="${t}">`).join('');
  }

  // ---- document -------------------------------------------------------------------------

  const doc = { mode: 'none', file: null, dirty: false };
  let spec = null;              // visual mode
  let codeDefs = [];            // code mode: animations defined by the edited file
  let previewName = null;       // code mode: which one is previewed

  function currentName() {
    if (doc.mode === 'visual') return spec && spec.name;
    if (doc.mode === 'code') return previewName;
    return null;
  }

  function setMode(mode) {
    doc.mode = mode;
    document.body.className = 'mode-' + mode;
    if (mode === 'code' && cm) setTimeout(() => cm.refresh(), 0);
  }

  function setDirty(d) {
    doc.dirty = d;
    $('dirty').textContent = d ? '● unsaved' : '';
  }

  function updateTitle() {
    const n = currentName();
    $('doc-title').textContent = n ? `${n} · ${doc.mode === 'visual' ? 'visual' : 'code'}` : '';
    $('file-label').textContent = doc.file ? `animations/${doc.file}` : (doc.mode === 'none' ? '' : 'new, not saved yet');
    $('btn-save-new').disabled = doc.mode === 'none';
    $('btn-save').disabled = doc.mode === 'none';
    $('btn-push').disabled = doc.mode === 'none';
    document.title = (n ? n + ' · ' : '') + 'Desk Buddy Animation Editor';
  }

  function confirmDiscard() {
    return !doc.dirty || confirm('Discard the unsaved changes?');
  }

  function uniqueName(base) {
    const names = new Set(lib.defs.map(d => d.name));
    if (!names.has(base)) return base;
    for (let k = 2; ; k++) if (!names.has(`${base} ${k}`)) return `${base} ${k}`;
  }

  function openDef(def) {
    if (!confirmDiscard()) return;
    if (def.rig) openVisual(def.rig, def._file);
    else openCode(lib.sources[def._file], def._file, def.name);
  }

  // ---- preview -----------------------------------------------------------------------------

  const fb = new Gfx.Framebuffer();
  const ctx = $('screen').getContext('2d');
  const rgba = new Uint8ClampedArray(Gfx.WIDTH * Gfx.HEIGHT * 4);
  const image = new ImageData(rgba, Gfx.WIDTH, Gfx.HEIGHT);
  const pv = { def: null, state: {}, index: -1 };
  const cur = { i: 0 };
  let playing = false, playT = 0, lastTs = 0, rendering = false, pending = null;

  function setPreview(def) {
    pv.def = def ? prepare(def) : null;
    pv.state = {};
    pv.index = -1;
    if (pv.def) cur.i = Math.min(cur.i, pv.def.frames - 1);
    renderIndex(cur.i);
  }

  function frameMs() { return pv.def ? 1000 / pv.def.fps : 33.33; }

  async function renderIndex(i) {
    const def = pv.def;
    if (!def) { fb.clear(0); blit(); return; }
    i = Math.max(0, Math.min(def.frames - 1, i | 0));
    if (rendering) { pending = i; return; }
    rendering = true;
    try {
      if (def.rig) {
        window.Face.background = null;
        def.frame(fb, Board.frameInfo(def, i, pv.state));
      } else {
        if (pv.index < 0 || i < pv.index) {
          pv.state = {};
          fb.clear(0);
          if (typeof def.setup === 'function') await def.setup(fb, pv.state);
          pv.index = -1;
        }
        for (let k = pv.index + 1; k <= i; k++) {
          window.Face.background = null;
          def.frame(fb, Board.frameInfo(def, k, pv.state));
        }
      }
      pv.index = i;
    } catch (e) {
      pv.index = -1;
      setPlaying(false);
      const msg = `frame ${i}: ${e.message}`;
      if (doc.mode === 'code') setCodeStatus(msg, true); else status(msg, true);
    } finally {
      rendering = false;
    }
    blit();
    updateTime();
    if (pending !== null) { const p = pending; pending = null; if (p !== i) renderIndex(p); }
  }

  function blit() {
    fb.toRGBA(rgba);
    ctx.putImageData(image, 0, 0);
  }

  function updateTime() {
    const def = pv.def;
    if (!def) { $('time').textContent = ''; return; }
    $('time').textContent = `${(cur.i * 1000 / def.fps / 1000).toFixed(2)} s  ·  ${cur.i + 1}/${def.frames}`;
  }

  function seek(i) {
    if (!pv.def) return;
    cur.i = Math.max(0, Math.min(pv.def.frames - 1, i));
    playT = cur.i * frameMs();
    renderIndex(cur.i);
    if (doc.mode === 'visual') { updatePlayhead(); updateParams(); }
  }

  function setPlaying(p) {
    playing = p && !!pv.def;
    $('btn-play').textContent = playing ? 'Pause' : 'Play';
    lastTs = 0;
    playT = cur.i * frameMs();
  }

  function tick(ts) {
    requestAnimationFrame(tick);
    if (!playing || !pv.def) { lastTs = ts; return; }
    const dt = Math.min(100, ts - (lastTs || ts));
    lastTs = ts;
    playT += dt;
    const total = pv.def.frames * frameMs();
    if (playT >= total) {
      if (pv.def.loop === false) { playT = total - frameMs(); setPlaying(false); }
      else playT %= total;
    }
    const i = Math.floor(playT / frameMs());
    if (i !== cur.i) {
      cur.i = i;
      renderIndex(i);
      if (doc.mode === 'visual') { updatePlayhead(); updateParams(); }
    }
  }

  // ---- visual mode: SPEC editing ------------------------------------------------------------

  const R = () => window.FaceRig;
  let history = [], future = [], lastTag = null, lastTime = 0;
  let selKey = null;       // { key, t }
  let selParam = null;

  function defaultSpec() {
    return {
      name: uniqueName('Face: new'),
      fps: 30, duration: 3000,
      colors: Object.assign({}, R().COLORS),
      tracks: {
        open: [[0, 1], [1400, 1, 'linear'], [1480, 0, 'linear'], [1560, 1]],
        lookX: [[0, 0], [700, 10], [2000, -10], [2900, 0]],
      },
    };
  }

  function openVisual(s, file) {
    spec = R().normalize(s);
    doc.file = file || null;
    history = []; future = []; lastTag = null;
    selKey = null; selParam = null;
    setMode('visual');
    setDirty(!file);
    cur.i = 0;
    buildParams();
    fillFields();
    rebuildRig();
    updateTitle();
    buildOpenList();
    updateUndo();
    status(file ? `opened animations/${file}` : 'new face animation');
  }

  function rebuildRig() {
    setPreview(R().animation(spec));
    renderTimeline();
    updateParams();
    renderKeyBox();
  }

  /** Record an undo step (grouped by tag while the same control keeps changing), apply fn, refresh. */
  function change(tag, fn, opts = {}) {
    const now = Date.now();
    if (tag !== lastTag || now - lastTime > 800) {
      history.push(JSON.stringify(spec));
      if (history.length > 200) history.shift();
      future = [];
    }
    lastTag = tag; lastTime = now;
    fn();
    spec = R().normalize(spec);
    setDirty(true);
    if (opts.fields) fillFields();
    rebuildRig();
    updateTitle();
    updateUndo();
  }

  function undo() {
    if (doc.mode === 'code') { if (cm) cm.undo(); return; }
    if (doc.mode !== 'visual' || !history.length) return;
    future.push(JSON.stringify(spec));
    spec = JSON.parse(history.pop());
    lastTag = null;
    afterHistory();
  }
  function redo() {
    if (doc.mode === 'code') { if (cm) cm.redo(); return; }
    if (doc.mode !== 'visual' || !future.length) return;
    history.push(JSON.stringify(spec));
    spec = JSON.parse(future.pop());
    lastTag = null;
    afterHistory();
  }
  function afterHistory() {
    setDirty(true);
    selKey = null;
    fillFields();
    rebuildRig();
    updateTitle();
    updateUndo();
  }
  function updateUndo() {
    const code = doc.mode === 'code';
    $('btn-undo').disabled = !(code || (doc.mode === 'visual' && history.length));
    $('btn-redo').disabled = !(code || (doc.mode === 'visual' && future.length));
  }

  const snapT = i => Math.round(i * 1000 / spec.fps);
  const nowT = () => snapT(cur.i);
  function keyIndex(track, t) { return track ? track.findIndex(k => Math.abs(k[0] - t) < 500 / spec.fps) : -1; }
  function roundTo(p, v) {
    const step = p.step || 0.01, d = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
    return +Math.max(p.min, Math.min(p.max, Math.round(v / step) * step)).toFixed(d);
  }
  function valueNow(key) { return R().trackValue(spec.tracks[key], nowT(), R().BY_KEY[key].def); }

  /** Set a key at time t. A brand-new track first gets an anchor key at 0 with the current value. */
  function setKey(key, t, value) {
    const p = R().BY_KEY[key];
    value = roundTo(p, value);
    let tr = spec.tracks[key];
    if (!tr) {
      tr = spec.tracks[key] = [];
      const before = p.def;
      if (t > 0 && Math.abs(before - value) > 1e-9) tr.push([0, before]);
    }
    const k = keyIndex(tr, t);
    if (k >= 0) tr[k][1] = value;
    else { tr.push([t, value]); tr.sort((a, b) => a[0] - b[0]); }
  }

  function deleteKey(key, t) {
    const tr = spec.tracks[key];
    const k = keyIndex(tr, t);
    if (k < 0) return;
    tr.splice(k, 1);
    if (!tr.length) delete spec.tracks[key];
  }

  function applyPose(name) {
    const pose = R().pose(name), t = nowT();
    change('pose', () => {
      for (const k of R().FACE_KEYS) {
        const v = pose[k];
        if (spec.tracks[k] || Math.abs(valueNow(k) - v) > 1e-6) setKey(k, t, v);
      }
    });
    status(`pose "${name}" keyed at ${(t / 1000).toFixed(2)} s`);
  }

  // fields

  function fillFields() {
    $('f-name').value = spec.name;
    $('f-theme').value = spec.theme || '';
    $('f-fps').value = spec.fps;
    $('f-dur').value = (spec.duration / 1000).toFixed(2).replace(/\.?0+$/, '');
    $('f-loop').checked = spec.loop !== false;
    $('c-bg').value = spec.colors.bg;
    $('c-iris').value = spec.colors.iris;
    $('c-mouth').value = spec.colors.mouth;
    $('c-blush').value = spec.colors.blush;
  }

  function wireFields() {
    $('f-name').addEventListener('input', e => change('name', () => { spec.name = e.target.value || 'Face: untitled'; }));
    $('f-theme').addEventListener('change', e => change('theme', () => {
      const t = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (t) spec.theme = t; else delete spec.theme;
    }, { fields: true }));
    $('f-fps').addEventListener('change', e => change('fps', () => { spec.fps = Math.max(5, Math.min(40, +e.target.value || 30)); }, { fields: true }));
    $('f-dur').addEventListener('change', e => change('dur', () => {
      spec.duration = Math.max(200, Math.min(20000, Math.round((+e.target.value || 3) * 1000)));
      for (const k of Object.keys(spec.tracks)) {           // keys past the end are dropped
        spec.tracks[k] = spec.tracks[k].filter(x => x[0] < spec.duration);
        if (!spec.tracks[k].length) delete spec.tracks[k];
      }
    }, { fields: true }));
    $('f-loop').addEventListener('change', e => change('loop', () => { if (e.target.checked) delete spec.loop; else spec.loop = false; }));
    for (const c of ['bg', 'iris', 'mouth', 'blush']) {
      $('c-' + c).addEventListener('input', e => change('color-' + c, () => { spec.colors[c] = e.target.value; }));
    }
    const poses = $('poses');
    for (const name of Object.keys(R().POSES)) {
      const b = document.createElement('button');
      b.textContent = cap(name);
      b.onclick = () => applyPose(name);
      poses.appendChild(b);
    }
    const asCode = document.createElement('button');
    asCode.textContent = 'Edit as code';
    asCode.title = 'Open the generated JavaScript; it stays editable here as long as the SPEC is kept';
    asCode.style.marginLeft = 'auto';
    asCode.onclick = () => { const f = doc.file, d = doc.dirty; openCode(R().toCode(spec), f, spec.name); setDirty(d || !f); };
    document.querySelector('#side .colors').appendChild(asCode);
  }

  // parameters

  const paramEls = {};
  function buildParams() {
    const box = $('params');
    if (box.childElementCount) return;
    let group = null;
    for (const p of R().PARAMS) {
      if (p.group !== group) {
        group = p.group;
        const h = document.createElement('div');
        h.className = 'ghead';
        h.textContent = group;
        box.appendChild(h);
      }
      const row = document.createElement('div');
      row.className = 'param';
      row.innerHTML = `<button class="kbtn" title="Key at the playhead: add / remove">◆</button><span class="name"></span><input type="range"><span class="val"></span>`;
      row.querySelector('.name').textContent = p.label;
      row.querySelector('.name').title = p.hint || p.label;
      const input = row.querySelector('input');
      Object.assign(input, { min: p.min, max: p.max, step: p.step });
      input.addEventListener('pointerdown', () => selectParam(p.key));
      input.addEventListener('input', () => {
        const v = +input.value;          // read before selectParam() refreshes the sliders
        selectParam(p.key);
        change('param-' + p.key + '@' + cur.i, () => setKey(p.key, nowT(), v));
        selKey = { key: p.key, t: nowT() };
        renderKeyBox();
        renderTimeline();
      });
      row.querySelector('.kbtn').onclick = () => {
        const t = nowT();
        const has = keyIndex(spec.tracks[p.key], t) >= 0;
        change('kbtn', () => { if (has) deleteKey(p.key, t); else setKey(p.key, t, valueNow(p.key)); });
        selKey = has ? null : { key: p.key, t };
        renderKeyBox(); renderTimeline();
      };
      row.querySelector('.name').onclick = () => selectParam(p.key);
      box.appendChild(row);
      paramEls[p.key] = { row, input, val: row.querySelector('.val'), kbtn: row.querySelector('.kbtn') };
    }
  }

  function updateParams() {
    if (doc.mode !== 'visual' || !spec) return;
    const t = nowT();
    for (const p of R().PARAMS) {
      const el = paramEls[p.key];
      if (!el) continue;
      const v = R().trackValue(spec.tracks[p.key], t, p.def);
      if (document.activeElement !== el.input) el.input.value = v;
      el.val.textContent = p.step >= 1 ? Math.round(v) : v.toFixed(2);
      const tr = spec.tracks[p.key];
      el.kbtn.className = 'kbtn' + (keyIndex(tr, t) >= 0 ? ' key' : tr ? ' track' : '');
      el.row.classList.toggle('sel', selParam === p.key);
    }
  }

  function selectParam(key) {
    selParam = key;
    updateParams();
    for (const row of document.querySelectorAll('.tl-row[data-key]')) row.classList.toggle('sel', row.dataset.key === key);
  }

  // key box

  function renderKeyBox() {
    const box = $('keybox');
    const tr = selKey && spec.tracks[selKey.key];
    const k = tr ? keyIndex(tr, selKey.t) : -1;
    if (k < 0) { box.className = 'none'; box.textContent = 'Click a ◆ on the timeline to select it.'; return; }
    const key = tr[k], p = R().BY_KEY[selKey.key];
    box.className = '';
    box.innerHTML = `<div><b></b> at <span class="t"></span></div>
      <div class="row">value <input class="v" type="number"> ease <select class="e">
        <option value="smooth">smooth</option><option value="linear">linear</option><option value="pop">pop (overshoot)</option><option value="step">hold</option></select></div>
      <div class="row">time (s) <input class="tt" type="number" step="0.01" min="0"> <button class="del">Delete key</button></div>`;
    box.querySelector('b').textContent = p.label;
    box.querySelector('.t').textContent = (key[0] / 1000).toFixed(2) + ' s';
    const v = box.querySelector('.v');
    Object.assign(v, { min: p.min, max: p.max, step: p.step, value: key[1] });
    v.addEventListener('change', () => change('kv', () => { key[1] = roundTo(p, +v.value); }));
    const e = box.querySelector('.e');
    e.value = key[2] || 'smooth';
    e.addEventListener('change', () => change('ke', () => { if (e.value === 'smooth') key.length = 2; else key[2] = e.value; }));
    const tt = box.querySelector('.tt');
    tt.value = (key[0] / 1000).toFixed(2);
    tt.addEventListener('change', () => {
      const i = Math.round(+tt.value * spec.fps), t = snapT(Math.max(0, Math.min(Math.round(spec.duration * spec.fps / 1000) - 1, i)));
      if (keyIndex(tr, t) >= 0 && keyIndex(tr, t) !== k) { status('there is already a key at that time', true); return; }
      change('kt', () => { key[0] = t; tr.sort((a, b) => a[0] - b[0]); });
      selKey = { key: selKey.key, t };
      seek(Math.round(t * spec.fps / 1000));
      renderKeyBox();
    });
    box.querySelector('.del').onclick = deleteSelectedKey;
  }

  function deleteSelectedKey() {
    if (!selKey) return;
    const { key, t } = selKey;
    change('del', () => deleteKey(key, t));
    selKey = null;
    renderKeyBox(); renderTimeline();
  }

  // timeline

  function renderTimeline() {
    const tl = $('timeline');
    if (doc.mode !== 'visual' || !spec) { tl.innerHTML = ''; return; }
    const dur = spec.duration;
    const pct = t => (100 * t / dur).toFixed(3) + '%';
    let html = '<div class="tl-row tl-ruler"><span class="tl-label">time</span><div class="tl-lane" data-lane="ruler">';
    const step = dur > 8000 ? 1000 : dur > 3000 ? 500 : 250;
    for (let t = 0; t < dur; t += step) html += `<div class="tick" style="left:${pct(t)}"><span>${(t / 1000).toFixed(step < 1000 ? 2 : 0).replace(/\.?0+$/, '') || 0}s</span></div>`;
    html += '<div class="ph"></div></div></div>';
    const keys = R().PARAMS.filter(p => spec.tracks[p.key]);
    for (const p of keys) {
      const tr = spec.tracks[p.key];
      html += `<div class="tl-row${selParam === p.key ? ' sel' : ''}" data-key="${p.key}"><span class="tl-label" title="${p.label}">${p.label}</span><div class="tl-lane" data-lane="${p.key}">`;
      if (tr.length > 1) html += `<div class="seg" style="left:${pct(tr[0][0])}; width:${(100 * (tr[tr.length - 1][0] - tr[0][0]) / dur).toFixed(3)}%"></div>`;
      for (const k of tr) {
        const sel = selKey && selKey.key === p.key && Math.abs(selKey.t - k[0]) < 500 / spec.fps;
        html += `<div class="kf ease-${k[2] || 'smooth'}${sel ? ' sel' : ''}" data-key="${p.key}" data-t="${k[0]}" style="left:${pct(k[0])}" title="${p.label} = ${k[1]} at ${(k[0] / 1000).toFixed(2)} s"></div>`;
      }
      html += '<div class="ph"></div></div></div>';
    }
    if (!keys.length) html += '<div class="tl-empty">Move a slider or pick a pose to add keyframes at the playhead.</div>';
    tl.innerHTML = html;
    updatePlayhead();
  }

  function updatePlayhead() {
    if (doc.mode !== 'visual' || !spec) return;
    const left = (100 * nowT() / spec.duration).toFixed(3) + '%';
    for (const ph of document.querySelectorAll('#timeline .ph')) ph.style.left = left;
  }

  function laneIndex(lane, clientX) {
    const r = lane.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const n = Math.round(spec.duration * spec.fps / 1000);
    return Math.max(0, Math.min(n - 1, Math.round(frac * spec.duration * spec.fps / 1000)));
  }

  function wireTimeline() {
    const tl = $('timeline');
    tl.addEventListener('pointerdown', e => {
      if (doc.mode !== 'visual') return;
      const kf = e.target.closest('.kf');
      const lane = e.target.closest('.tl-lane');
      const label = e.target.closest('.tl-label');
      if (label) { const row = label.closest('.tl-row'); if (row && row.dataset.key) selectParam(row.dataset.key); return; }
      if (!lane) return;
      setPlaying(false);
      if (kf) {
        // select + drag a key
        const key = kf.dataset.key, t0 = +kf.dataset.t;
        selKey = { key, t: t0 };
        selectParam(key);
        seek(Math.round(t0 * spec.fps / 1000));
        renderKeyBox(); renderTimeline();
        const laneEl = document.querySelector(`.tl-lane[data-lane="${key}"]`);
        let curT = t0, moved = false;
        const move = ev => {
          const t = snapT(laneIndex(laneEl, ev.clientX));
          if (t === curT) return;
          const tr = spec.tracks[key];
          if (keyIndex(tr, t) >= 0) return;          // do not stack two keys
          const k = keyIndex(tr, curT);
          if (k < 0) return;
          if (!moved) { history.push(JSON.stringify(spec)); future = []; lastTag = null; moved = true; }
          tr[k][0] = t;
          tr.sort((a, b) => a[0] - b[0]);
          curT = t;
          selKey = { key, t };
          cur.i = Math.round(t * spec.fps / 1000);
          setPreview(R().animation(spec));
          renderTimeline(); updateParams(); renderKeyBox();
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          if (moved) { setDirty(true); updateUndo(); }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        e.preventDefault();
        return;
      }
      // scrub
      const scrub = ev => seek(laneIndex(lane, ev.clientX));
      scrub(e);
      if (lane.dataset.lane !== 'ruler') { selKey = null; renderKeyBox(); renderTimeline(); selectParam(lane.dataset.lane); }
      const up = () => { window.removeEventListener('pointermove', scrub); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', scrub);
      window.addEventListener('pointerup', up);
      e.preventDefault();
    });
  }

  // ---- code mode ----------------------------------------------------------------------------

  let cm = null, ta = null, suppress = false, compileTimer = null;

  function ensureEditor() {
    if (cm || ta) return;
    if (window.CodeMirror) {
      cm = CodeMirror($('code-host'), {
        mode: 'javascript', theme: 'material-darker', lineNumbers: true, indentUnit: 2, tabSize: 2,
        matchBrackets: true, autoCloseBrackets: true, lineWrapping: false,
        extraKeys: {
          'Cmd-/': 'toggleComment', 'Ctrl-/': 'toggleComment',
          Tab: c => c.execCommand(c.somethingSelected() ? 'indentMore' : 'insertSoftTab'),
          'Shift-Tab': 'indentLess',
          'Cmd-S': () => save(false), 'Ctrl-S': () => save(false),
        },
      });
      cm.on('change', onCodeChange);
    } else {
      ta = document.createElement('textarea');
      ta.className = 'fallback';
      ta.spellcheck = false;
      ta.addEventListener('input', onCodeChange);
      $('code-host').appendChild(ta);
    }
  }
  const getCode = () => (cm ? cm.getValue() : ta ? ta.value : '');
  function setCode(s) {
    suppress = true;
    if (cm) { cm.setValue(s); cm.clearHistory(); } else ta.value = s;
    suppress = false;
  }

  function onCodeChange() {
    if (suppress) return;
    setDirty(true);
    clearTimeout(compileTimer);
    compileTimer = setTimeout(compileCode, 450);
  }

  function setCodeStatus(msg, isErr) {
    $('code-status').textContent = msg;
    $('code-status').className = isErr ? 'err' : '';
  }

  function compileCode() {
    let defs;
    try {
      defs = runFile(getCode(), doc.file || 'untitled.js');
    } catch (e) {
      setCodeStatus(`${e.name}: ${e.message}`, true);
      return false;
    }
    if (!defs.length) { setCodeStatus('This file does not call Sim.register(...) yet.', true); return false; }
    codeDefs = defs;
    if (!defs.some(d => d.name === previewName)) previewName = defs[0].name;
    const sel = $('preview-select');
    sel.innerHTML = '';
    for (const d of defs) { const o = document.createElement('option'); o.value = o.textContent = d.name; sel.appendChild(o); }
    sel.value = previewName;
    sel.style.display = defs.length > 1 ? '' : 'none';
    const def = defs.find(d => d.name === previewName);
    // status first: a runtime error while rendering the preview replaces it
    setCodeStatus(`OK · ${defs.length > 1 ? defs.length + ' animations in this file · ' : ''}${def.name}: ${def.frames} frames @ ${def.fps} fps${def.theme ? ' · theme ' + def.theme : ''}`);
    setPreview(def);
    updateTitle();
    return true;
  }

  function openCode(code, file, name) {
    ensureEditor();
    doc.file = file || null;
    previewName = name || null;
    setMode('code');
    setCode(code || '');
    setDirty(!file);
    cur.i = 0;
    compileCode();
    updateTitle();
    buildOpenList();
    updateUndo();
    status(file ? `opened animations/${file}` : 'new code animation');
  }

  // ---- new ------------------------------------------------------------------------------

  function newVisual() {
    if (!confirmDiscard()) return;
    openVisual(defaultSpec(), null);
  }

  function newCode() {
    if (!confirmDiscard()) return;
    const name = uniqueName('My animation');
    let src = lib.sources['template.js'] || `Sim.register({\n  name: 'Template',\n  fps: 30,\n  duration: 2000,\n  frame(g, f) {\n    g.clear(Sim.C.BLACK);\n    g.fillCircle(120, 120, 40, Sim.hsv(f.p * 360, 1, 1));\n  },\n});\n`;
    src = src.replace(/name:\s*'Template'/, `name: '${name}'`);
    openCode(src, null, name);
  }

  // ---- save / push --------------------------------------------------------------------------

  function currentDef() {
    if (doc.mode === 'visual') return prepare(R().animation(spec));
    if (doc.mode === 'code') return codeDefs.find(d => d.name === previewName) || codeDefs[0] || null;
    return null;
  }

  async function save(asNew) {
    if (doc.mode === 'none') return;
    let code, name;
    if (doc.mode === 'visual') { code = R().toCode(spec); name = spec.name; }
    else {
      if (!compileCode()) { status('fix the errors before saving', true); return; }
      code = getCode(); name = codeDefs[0].name;
    }
    const file = (!asNew && doc.file) ? doc.file : Board.fileNameFor(name);
    if (LIB_FILES.includes(file)) { status(`${file} is a library file; rename the animation`, true); return; }
    if (file !== doc.file && lib.files.includes(file) && !confirm(`animations/${file} already exists. Overwrite it?`)) return;
    let r, j = {};
    try {
      r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file, code }) });
      try { j = await r.json(); } catch (e) { /* not JSON: no serve.py */ }
    } catch (e) { status('save failed: ' + e.message, true); return; }
    if (!r.ok) {
      status(r.status === 501 || r.status === 404 ? 'saving needs the dev server: run ./sim/serve.sh' : 'save failed: ' + (j.error || r.statusText), true);
      return;
    }
    doc.file = file;
    setDirty(false);
    refreshLibraryFile(file, code);
    Board.announceSaved(file, doc.mode === 'visual' ? spec.name : previewName);
    updateTitle();
    status(`saved animations/${file}${j.added_to_index ? ' (added to index.js)' : ''}`);
  }

  async function push() {
    const def = currentDef();
    if (!def) return;
    const host = $('board-host').value.trim();
    if (!host) { status('enter the board address first (e.g. 192.168.50.99)', true); $('board-host').focus(); return; }
    Board.setHost(host);
    const name = Board.boardName(def);
    const bar = $('progress');
    $('btn-push').disabled = true;
    try {
      status(`rendering ${def.frames} frames…`);
      const { raw, bytes } = await Board.build(def);
      bar.style.display = ''; bar.value = 0;
      status(`uploading ${name} (${(bytes.length / 1024).toFixed(1)} KB, ${(raw.length / 1024).toFixed(0)} KB uncompressed)…`);
      const res = await Board.push(host, name, bytes, $('chk-play').checked, (sent, total) => {
        bar.value = total ? Math.round(100 * sent / total) : 0;
        status(`uploading ${name}: ${(sent / 1024).toFixed(0)} / ${(total / 1024).toFixed(0)} KB`);
      });
      bar.value = 100;
      status(`stored ${name} on ${host}${res.play ? ', playing' : ''} · ${res.free_kb} KB free`);
    } catch (e) {
      status('push failed: ' + e.message, true);
    } finally {
      $('btn-push').disabled = false;
      setTimeout(() => { bar.style.display = 'none'; }, 2500);
      renderIndex(cur.i);
    }
  }

  // ---- keyboard ---------------------------------------------------------------------------

  function wireKeys() {
    document.addEventListener('keydown', e => {
      const t = e.target;
      const textField = (t.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'button'].includes(t.type)) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.closest && t.closest('.CodeMirror'));
      const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
      if (mod && k === 's') { e.preventDefault(); save(e.shiftKey); return; }
      if (textField) return;
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (mod) return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
      else if (t.type === 'range') return;                       // let sliders use the arrow keys
      else if (e.key === 'ArrowRight') { e.preventDefault(); setPlaying(false); seek(cur.i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); seek(cur.i - 1); }
      else if (e.key === 'Home') { setPlaying(false); seek(0); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && doc.mode === 'visual' && selKey) { e.preventDefault(); deleteSelectedKey(); }
    });
  }

  // ---- boot ---------------------------------------------------------------------------------

  async function boot() {
    $('board-host').value = Board.getHost();
    $('board-host').addEventListener('change', e => Board.setHost(e.target.value.trim()));
    $('btn-new-visual').onclick = newVisual;
    $('btn-new-code').onclick = newCode;
    $('btn-save').onclick = () => save(false);
    $('btn-save-new').onclick = () => save(true);
    $('btn-push').onclick = push;
    $('btn-undo').onclick = undo;
    $('btn-redo').onclick = redo;
    $('btn-play').onclick = () => setPlaying(!playing);
    $('btn-start').onclick = () => { setPlaying(false); seek(0); };
    $('btn-prev').onclick = () => { setPlaying(false); seek(cur.i - 1); };
    $('btn-next').onclick = () => { setPlaying(false); seek(cur.i + 1); };
    $('preview-select').onchange = e => { previewName = e.target.value; compileCode(); buildOpenList(); };
    $('filter').addEventListener('input', buildOpenList);
    window.addEventListener('beforeunload', e => { if (doc.dirty) { e.preventDefault(); e.returnValue = ''; } });
    wireKeys();
    wireTimeline();
    updateTitle();
    updateUndo();
    requestAnimationFrame(tick);

    try { await loadLibrary(); }
    catch (e) { status('could not load the animations: ' + e.message, true); return; }
    if (!window.FaceRig || !window.Face) { status('face_lib.js / face_rig.js are missing from animations/index.js', true); return; }
    wireFields();
    status(`${lib.defs.length} animations loaded`);

    const q = new URLSearchParams(location.search);
    if (q.get('new') === 'face') newVisual();
    else if (q.get('new') === 'code') newCode();
    else if (q.get('file')) {
      const d = lib.defs.find(x => x._file === q.get('file') && (!q.get('name') || x.name === q.get('name'))) || lib.defs.find(x => x._file === q.get('file'));
      if (d) openDef(d); else status(`animations/${q.get('file')} not found`, true);
    }
  }

  // test hook
  window.Editor = {
    lib, doc,
    get spec() { return spec; }, get codeDefs() { return codeDefs; }, get frame() { return cur.i; },
    openVisual, openCode, newVisual, newCode, applyPose, seek, save, push, undo, redo, compileCode,
    setParam(key, value) { change('test-' + key, () => setKey(key, nowT(), value)); },
    toCode: () => R().toCode(spec), getCode, setCode: s => { setCode(s); onCodeChange(); },
  };

  boot();
})();
