/*
 * chat.js - "Ask Claude" panel: generates animations from a description,
 * loads them live into the simulator, and saves them to animations/ through
 * serve.py (or downloads them when running without the server).
 *
 * Two backends:
 *   - "Claude Code": serve.py runs the local `claude -p` CLI, so generation
 *     uses the Claude Code login/subscription. Default when available.
 *   - "API key": the Anthropic SDK (loaded from a CDN) talks to the API
 *     directly from the browser with a key kept in localStorage.
 */
const SDK_URL = 'https://esm.sh/@anthropic-ai/sdk@1.8.0';
let Anthropic = null;

const $ = id => document.getElementById(id);
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const CLI_MODELS = ['default', 'opus', 'sonnet', 'fable'];
const KEY_STORE = 'sim.anthropic.apiKey';
const MODEL_STORE = 'sim.anthropic.model';
const CLI_MODEL_STORE = 'sim.claude.cliModel';
const BACKEND_STORE = 'sim.chat.backend';

const state = {
  messages: [],      // Anthropic.MessageParam[]
  busy: false,
  lastCode: null,    // last generated animation source
  lastName: null,    // its Sim.register name
  lastErrors: [],    // runtime errors from the last dry run
  server: false,     // serve.py available?
  cli: false,        // serve.py found the Claude Code CLI?
  backend: 'cli',    // 'cli' | 'api'
  cliSession: null,  // Claude Code session id, for --resume on follow-ups
  guide: null,       // ANIMATIONS.md text
  faceLib: null,     // face_lib.js source
};

// ---- helpers ----------------------------------------------------------------

async function fetchText(url) {
  const r = await fetch(url + '?v=' + Date.now());
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.text();
}

async function buildSystemPrompt() {
  if (!state.guide) state.guide = await fetchText('ANIMATIONS.md');
  if (!state.faceLib) state.faceLib = await fetchText('animations/face_lib.js');
  const parts = [
    'You write animations for a desk companion\'s round 240x240 TFT screen, inside a browser simulator. ' +
    'Follow the guide below exactly: it is the complete API. Answer with one ```js code block holding the whole animation file.',
    '# GUIDE (sim/ANIMATIONS.md)\n\n' + state.guide,
    '# face_lib.js (the Face helpers, for reference)\n\n```js\n' + state.faceLib + '\n```',
  ];
  const cur = window.SimApp && window.SimApp.current();
  if (cur && $('chat-ctx').checked) {
    let src = cur._source;
    if (!src && cur._file) { try { src = await fetchText('animations/' + cur._file); } catch (e) { /* ignore */ } }
    if (src) parts.push(`# Currently selected animation ("${cur.name}"${cur._file ? ', file ' + cur._file : ''})\n\n\`\`\`js\n${src}\n\`\`\``);
  }
  return parts.join('\n\n');
}

function extractCode(text) {
  const m = text.match(/```(?:js|javascript)\s*\n([\s\S]*?)```/);
  return m ? m[1].trim() + '\n' : null;
}

function nameFromCode(code) {
  const m = code.match(/name\s*:\s*(['"`])(.*?)\1/);
  return m ? m[2] : null;
}

function fileNameFor(name) {
  let s = name.toLowerCase().replace(/^face:\s*/, 'face_').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (s || 'animation') + '.js';
}

function addBubble(role, text) {
  const div = document.createElement('div');
  div.className = 'bubble ' + role;
  div.textContent = text;
  $('chat-log').appendChild(div);
  $('chat-log').scrollTop = $('chat-log').scrollHeight;
  return div;
}

function renderAssistant(div, text) {
  // show prose, collapse code blocks into a tag
  const code = extractCode(text);
  const prose = text.replace(/```(?:js|javascript)?\s*\n[\s\S]*?```/g, '').trim();
  div.textContent = prose;
  if (code) {
    const tag = document.createElement('div');
    tag.className = 'code-tag';
    const name = nameFromCode(code) || 'animation';
    tag.textContent = `⟶ ${name}  (${code.split('\n').length} lines)`;
    tag.title = 'click to show the code';
    const pre = document.createElement('pre');
    pre.textContent = code;
    pre.style.display = 'none';
    tag.onclick = () => { pre.style.display = pre.style.display === 'none' ? 'block' : 'none'; };
    div.appendChild(tag);
    div.appendChild(pre);
  }
  $('chat-log').scrollTop = $('chat-log').scrollHeight;
}

function setBusy(b) {
  state.busy = b;
  $('chat-send').disabled = b;
  $('chat-send').textContent = b ? '…' : 'Send';
}

// ---- loading generated code into the simulator -----------------------------

async function loadGenerated(code) {
  const app = window.SimApp;
  const name = nameFromCode(code);
  const errors = [];
  app.removeAnimation(name);
  const before = app.registry.length;
  try {
    new Function(code)();
  } catch (e) {
    errors.push(`load error: ${e.message}`);
  }
  const def = app.registry[app.registry.length - 1];
  if (app.registry.length === before || !def) {
    if (!errors.length) errors.push('the code did not call Sim.register');
    return { errors };
  }
  def._source = code;
  def._generated = true;
  // dry run every frame to catch runtime errors before playing
  const runErrors = await app.dryRun(def);
  errors.push(...runErrors);
  await app.select(def);
  return { def, errors };
}

// ---- client -------------------------------------------------------------------

async function loadSdk() {
  if (Anthropic) return Anthropic;
  try {
    Anthropic = (await import(SDK_URL)).default;
  } catch (e) {
    throw new Error('could not load the Anthropic SDK from ' + SDK_URL + ' (offline? blocked CDN?): ' + e.message);
  }
  return Anthropic;
}

/** "sk-ant-api…" / "sk-ant-admin…" are API keys; anything else is treated as an
 *  OAuth access token (e.g. from `ant auth print-credentials --access-token`). */
async function makeClient(credential) {
  const A = await loadSdk();
  const isKey = /^sk-ant-(api|admin)/.test(credential);
  const client = new A(isKey
    ? { apiKey: credential, dangerouslyAllowBrowser: true }
    : { authToken: credential, dangerouslyAllowBrowser: true, defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' } });
  return { client, isKey };
}

function describeError(e) {
  if (!e) return 'unknown error';
  let msg = e.status ? `API error ${e.status}: ${e.message}` : (e.message || String(e));
  if (e.error && e.error.error && e.error.error.message && !msg.includes(e.error.error.message)) msg += ' - ' + e.error.error.message;
  if (/Connection error|Failed to fetch/i.test(msg)) msg += ' (network/CORS problem reaching api.anthropic.com; check the browser console)';
  return msg;
}

/** Cheap connectivity check: retrieves the selected model (no tokens billed). */
async function testKey() {
  const credential = $('chat-key').value.trim();
  if (!credential) { addBubble('sys', 'Enter a key first.'); return; }
  localStorage.setItem(KEY_STORE, credential);
  const model = $('chat-model').value;
  const b = addBubble('sys', `Testing ${model}…`);
  try {
    const { client } = await makeClient(credential);
    const m = await client.models.retrieve(model);
    b.textContent = `OK: key works, ${m.display_name || m.id} is available.`;
  } catch (e) {
    b.textContent = 'Test failed: ' + describeError(e);
    console.error(e);
  }
}

// ---- the request ------------------------------------------------------------

/** API-key backend: full conversation is sent each turn. */
async function requestApi(userText, onText) {
  const apiKey = $('chat-key').value.trim();
  if (!apiKey) throw new Error('Enter your Anthropic API key first (sk-ant-api…), or switch the backend to Claude Code. The key is only stored in this browser.');
  localStorage.setItem(KEY_STORE, apiKey);
  localStorage.setItem(MODEL_STORE, $('chat-model').value);
  state.messages.push({ role: 'user', content: userText });
  const { client, isKey } = await makeClient(apiKey);
  const system = await buildSystemPrompt();
  let stream;
  try {
    stream = client.beta.messages.stream({
      model: $('chat-model').value,
      max_tokens: 32000,
      system,
      messages: state.messages,
      output_config: { effort: 'high' },
      betas: ['server-side-fallback-2026-07-01', ...(isKey ? [] : ['oauth-2025-04-20'])],
      fallbacks: 'default',
    });
    stream.on('text', (delta, snapshot) => onText(snapshot));
    const final = await stream.finalMessage();
    state.messages.push({ role: 'assistant', content: final.content });
    const text = final.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    let note = null;
    if (final.stop_reason === 'refusal') note = 'Claude declined this request' + (final.stop_details && final.stop_details.explanation ? ': ' + final.stop_details.explanation : '.');
    else if (final.stop_reason === 'max_tokens') note = 'The reply was cut off (max_tokens). Ask Claude to continue or simplify.';
    return { text, note };
  } catch (e) {
    state.messages.pop(); // drop the user turn so a retry does not duplicate it
    throw e;
  }
}

/** Claude Code backend: serve.py runs `claude -p`, follow-ups resume the session. */
async function requestCli(userText, onText) {
  const model = $('chat-cli-model').value;
  localStorage.setItem(CLI_MODEL_STORE, model);
  const body = { prompt: userText, model: model === 'default' ? '' : model, session_id: state.cliSession || '' };
  body.system = await buildSystemPrompt();   // sent on every turn so "include current" stays up to date
  const r = await fetch('/api/claude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error || msg; } catch (e) { /* ignore */ }
    throw new Error('Claude Code: ' + msg);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '', snapshot = '', done = null;
  for (;;) {
    const { value, done: eof } = await reader.read();
    if (eof) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch (e) { continue; }
      if (ev.type === 'init') { state.cliSession = ev.session_id; $('chat-cli-info').textContent = ev.model ? `model ${ev.model}` : ''; }
      else if (ev.type === 'delta') { snapshot += ev.text; onText(snapshot); }
      else if (ev.type === 'done') { done = ev; state.cliSession = ev.session_id || state.cliSession; }
      else if (ev.type === 'error') throw new Error('Claude Code: ' + ev.message);
    }
  }
  if (!done) throw new Error('Claude Code: stream ended without a result');
  if (done.is_error) throw new Error('Claude Code: ' + (done.text || 'request failed'));
  if (typeof done.cost_usd === 'number') $('chat-cli-info').textContent += `  ·  ~$${done.cost_usd.toFixed(3)} this turn`;
  return { text: done.text || snapshot, note: done.stop_reason === 'max_tokens' ? 'The reply was cut off. Ask Claude to continue or simplify.' : null };
}

async function send(userText) {
  addBubble('user', userText);
  const bubble = addBubble('assistant', '…');
  setBusy(true);

  try {
    const onText = snapshot => {
      bubble.textContent = snapshot.replace(/```[\s\S]*$/, '').trim() + (snapshot.includes('```') ? '\n⟶ writing code…' : '');
      $('chat-log').scrollTop = $('chat-log').scrollHeight;
    };
    const { text: full, note } = state.backend === 'cli' ? await requestCli(userText, onText) : await requestApi(userText, onText);
    renderAssistant(bubble, full);
    if (note) addBubble('sys', note);

    const code = extractCode(full);
    if (code) {
      const { def, errors } = await loadGenerated(code);
      state.lastErrors = errors;
      if (def) {
        state.lastCode = code;
        state.lastName = def.name;
        $('chat-save').disabled = false;
        $('chat-save').textContent = state.server ? `Save ${fileNameFor(def.name)}` : `Download ${fileNameFor(def.name)}`;
      }
      if (errors.length) {
        const b = addBubble('sys', 'The animation has errors:\n' + errors.join('\n'));
        const fix = document.createElement('button');
        fix.textContent = 'Ask Claude to fix';
        fix.onclick = () => send('The animation threw these errors when running in the simulator. Fix them and return the whole file again:\n\n' + errors.join('\n'));
        b.appendChild(document.createElement('br'));
        b.appendChild(fix);
      } else if (def) {
        let note = `Loaded "${def.name}" (${def.frames} frames @ ${def.fps} fps). It is playing now.`;
        if (state.server && $('chat-autosave').checked) {
          try {
            const file = await saveToDisk(true);
            note += ` Saved as animations/${file}.`;
          } catch (e) { note += ` Auto-save failed: ${e.message}`; }
        }
        addBubble('sys', note);
        if (state.server && $('chat-push').checked) {
          const cur = window.SimApp.registry.find(a => a.name === def.name) || def;
          const j = await window.SimApp.pushToBoard(cur);
          addBubble('sys', j ? `Pushed to the board (${j.free_kb} KB free there)${$('chk-board-play').checked ? ', playing' : ''}.` : 'Push to the board failed, see the log on the right.');
        }
      }
    }
  } catch (e) {
    bubble.remove();
    addBubble('sys', describeError(e));
    console.error(e);
  } finally {
    setBusy(false);
  }
}

// ---- save --------------------------------------------------------------------

/** Write the last generated animation to sim/animations/ (serve.py) and reload it from disk. */
async function saveToDisk(quiet) {
  const file = fileNameFor(state.lastName);
  const r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file, code: state.lastCode }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  if (!quiet) addBubble('sys', `Saved animations/${file}${j.added_to_index ? ' and added it to index.js' : ''}${j.overwritten ? ' (overwrote the previous version)' : ''}.`);
  await window.SimApp.reload(state.lastName);
  return file;
}

async function save() {
  if (!state.lastCode) return;
  const file = fileNameFor(state.lastName);
  if (state.server) {
    try { await saveToDisk(false); }
    catch (e) { addBubble('sys', 'Save failed: ' + e.message); }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([state.lastCode], { type: 'text/javascript' }));
    a.download = file;
    a.click();
    addBubble('sys', `Downloaded ${file}. Put it in sim/animations/ and add it to index.js (or run ./serve.sh to save directly).`);
  }
}

// ---- wiring -----------------------------------------------------------------

function applyBackend() {
  const cli = state.backend === 'cli';
  $('chat-api-row').style.display = cli ? 'none' : '';
  $('chat-cli-row').style.display = cli ? '' : 'none';
  $('chat-backend').value = state.backend;
  localStorage.setItem(BACKEND_STORE, state.backend);
}

async function init() {
  for (const m of MODELS) { const o = document.createElement('option'); o.value = o.textContent = m; $('chat-model').appendChild(o); }
  for (const m of CLI_MODELS) { const o = document.createElement('option'); o.value = m; o.textContent = m === 'default' ? 'default model' : m; $('chat-cli-model').appendChild(o); }
  $('chat-model').value = localStorage.getItem(MODEL_STORE) || MODELS[0];
  $('chat-cli-model').value = localStorage.getItem(CLI_MODEL_STORE) || 'default';
  $('chat-key').value = localStorage.getItem(KEY_STORE) || '';
  try {
    const j = await (await fetch('/api/ping')).json();
    state.server = j.ok === true;
    state.cli = !!j.claude;
  } catch (e) { state.server = false; }
  $('chat-save').textContent = state.server ? 'Save' : 'Download';
  $('chat-mode').textContent = state.server ? 'auto-saves to sim/animations/' : 'no serve.py: generated files are downloaded';
  $('chat-autosave').checked = localStorage.getItem('sim.chat.autosave') !== '0';
  $('chat-push').checked = localStorage.getItem('sim.chat.push') === '1';
  $('chat-autosave').onchange = e => localStorage.setItem('sim.chat.autosave', e.target.checked ? '1' : '0');
  $('chat-push').onchange = e => localStorage.setItem('sim.chat.push', e.target.checked ? '1' : '0');
  if (!state.server) { $('chat-autosave').disabled = true; $('chat-push').disabled = true; }
  const saved = localStorage.getItem(BACKEND_STORE);
  state.backend = state.cli ? (saved === 'api' ? 'api' : 'cli') : 'api';
  $('chat-backend').querySelector('option[value=cli]').disabled = !state.cli;
  $('chat-backend').querySelector('option[value=cli]').textContent = state.cli ? 'Claude Code (your login)' : 'Claude Code (needs ./serve.sh + claude CLI)';
  $('chat-backend').onchange = e => { state.backend = e.target.value; applyBackend(); };
  applyBackend();

  $('chat-send').onclick = () => {
    const t = $('chat-input').value.trim();
    if (!t || state.busy) return;
    $('chat-input').value = '';
    send(t);
  };
  $('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('chat-send').click(); }
  });
  $('chat-save').onclick = save;
  $('chat-test').onclick = testKey;
  $('chat-new').onclick = () => {
    state.messages = [];
    state.cliSession = null;
    $('chat-cli-info').textContent = '';
    state.lastCode = null; state.lastName = null;
    $('chat-log').innerHTML = '';
    $('chat-save').disabled = true;
    addBubble('sys', 'New conversation. Describe an animation, e.g. "a wink", "angry face", "confetti loop".');
  };
  $('chat-new').click();
  // load the SDK early so a CDN problem shows up before the first message
  if (state.backend === 'api') loadSdk().catch(e => addBubble('sys', e.message));
}

init();
