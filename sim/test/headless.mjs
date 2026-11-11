// Opens a URL in headless Chrome and waits (in real time, so long network
// transfers are fine) until the page's #result no longer starts with "running".
// usage: node test/headless.mjs <url> [timeoutSec]      exit 0 when the result contains " OK"
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const [url, timeoutSec = '600'] = process.argv.slice(2);
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-headless-'));
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let port = null;
await new Promise((resolve, reject) => {
  proc.stderr.on('data', d => { const m = String(d).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) { port = m[1]; resolve(); } });
  setTimeout(() => reject(new Error('chrome did not start')), 20000);
});
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Page.navigate', { url });
const deadline = Date.now() + Number(timeoutSec) * 1000;
let text = '';
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 1000));
  const res = await send('Runtime.evaluate', { expression: "(document.getElementById('result')||{}).textContent||''", returnByValue: true });
  text = res.result?.result?.value || '';
  if (text && !text.startsWith('running')) break;
}
console.log(text || '(no result)');
ws.close(); proc.kill();
await new Promise(r => setTimeout(r, 500));
try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* profile dir may still be busy */ }
process.exit(text.includes(' OK') ? 0 : 1);
