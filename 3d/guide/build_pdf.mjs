// Prints 3d/guide/assembly_guide.html to 3d/RoundBot_v8_Assembly_Guide.pdf with headless Chrome
// (A4, page header and "Page X of Y" footer). usage: node 3d/guide/build_pdf.mjs [out.pdf]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, 'assembly_guide.html');
const out = path.resolve(process.argv[2] || path.join(here, '..', 'RoundBot_v8_Assembly_Guide.pdf'));
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-pdf-'));
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${profile}`,
  '--remote-debugging-port=0', '--allow-file-access-from-files', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
try {
  const port = await new Promise((resolve, reject) => {
    proc.stderr.on('data', d => { const m = String(d).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) resolve(m[1]); });
    setTimeout(() => reject(new Error('chrome did not start')), 20000);
  });
  const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable');
  await send('Page.navigate', { url: pathToFileURL(src).href });
  for (let i = 0; i < 100; i++) {                       // wait until every image has loaded
    await new Promise(r => setTimeout(r, 200));
    const r = await send('Runtime.evaluate', { expression: "document.readyState === 'complete' && [...document.images].every(i => i.complete && i.naturalWidth)", returnByValue: true });
    if (r.result && r.result.result && r.result.result.value) break;
  }
  const style = 'font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 7.5px; color: #6b6a66; width: 100%; padding: 0 16mm;';
  const res = await send('Page.printToPDF', {
    printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: `<div style="${style}">RoundBot – Assembly Guide</div>`,
    footerTemplate: `<div style="${style} text-align: right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
  });
  if (!res.result) throw new Error('printToPDF failed: ' + JSON.stringify(res.error || res));
  fs.writeFileSync(out, Buffer.from(res.result.data, 'base64'));
  console.log(`wrote ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  ws.close();
} finally {
  proc.kill();
}
