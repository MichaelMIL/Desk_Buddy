/* Pages served by the device. Plain HTML, no external assets.
 *   /          faces: pick what plays, screen on/off
 *   /settings  device, Wi-Fi, MQTT, stored animations, firmware update */
#pragma once
#include <pgmspace.h>

static const char WEB_CSS[] PROGMEM = R"CSS(
body{font:15px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#15171a;color:#e6e6e6;margin:0;padding:16px;max-width:520px;margin:auto}
h1{font-size:18px;margin:8px 0 2px;display:flex;justify-content:space-between;align-items:baseline}h1 a{font-size:13px;color:#4fb3ff;text-decoration:none}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#8a919c;margin:22px 0 8px}
.card{background:#1f2227;border-radius:10px;padding:12px 14px;margin-bottom:10px}
.faces{display:flex;flex-wrap:wrap;gap:8px}
button{background:#2a2e35;color:#e6e6e6;border:1px solid #3a3f47;border-radius:8px;padding:9px 12px;font:inherit;cursor:pointer}
button.on,button.primary{background:#4fb3ff;color:#000;border-color:transparent}button.danger{border-color:#7a2a2a}
label{display:block;color:#8a919c;font-size:12px;margin:8px 0 3px}
label.chk{display:inline-flex;align-items:center;gap:6px;color:#e6e6e6;font-size:14px;margin:6px 12px 0 0}
input,select{width:100%;box-sizing:border-box;background:#15171a;color:#e6e6e6;border:1px solid #3a3f47;border-radius:6px;padding:8px;font:inherit}
input[type=checkbox]{width:auto}input[type=file]{padding:4px}input[type=range]{padding:0;accent-color:#4fb3ff}
.row{display:flex;gap:8px;align-items:flex-end}.row>*{flex:1}
#st{color:#8a919c;font-size:13px}#msg{color:#4fb3ff;min-height:1.2em;font-size:13px;margin-top:8px}
small{color:#8a919c}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:5px 4px;border-bottom:1px solid #2a2e35}td:last-child{text-align:right}
progress{width:100%}
)CSS";

static const char FACES_PAGE[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Desk Buddy</title><link rel="stylesheet" href="/style.css"></head><body>
<h1><span id="title">Desk Buddy</span><a href="/settings">Settings ›</a></h1><div id="st">…</div>
<h2>Face</h2><div class="card"><div class="faces" id="faces"></div>
<div class="row" style="margin-top:10px"><button id="scr" onclick="screen()">Screen</button><div style="flex:3"><label>Brightness <span id="bv"></span>%</label><input id="bri" type="range" min="10" max="100" step="5"></div></div>
<div id="msg"></div></div>
<p><small id="dev"></small></p>
<script>
const $=s=>document.querySelector(s);let anims=[],cur='',scrOn=true;
async function j(u,o){const r=await fetch(u,o);if(!r.ok)throw new Error(r.status+' '+await r.text());return r.json()}
const nice=n=>n.replace(/^[a-z0-9]+__/,'').replace(/^face_/,'').replace(/_/g,' ');let theme='';
const themeOf=n=>{const m=n.match(/^([a-z0-9]+)__/);return m?m[1]:''};
function faces(){$('#faces').innerHTML='';for(const n of ['cycle',...anims]){const th=themeOf(n);if(th&&th!==theme)continue;const b=document.createElement('button');b.textContent=nice(n)+(th?' ✦':'');if(n===cur)b.className='on';b.onclick=()=>play(n);$('#faces').appendChild(b)}
$('#scr').textContent='Screen: '+(scrOn?'on':'off');$('#scr').className=scrOn?'on':''}
async function play(n){try{await j('/api/play?name='+encodeURIComponent(n),{method:'POST'});cur=n;faces();$('#msg').textContent='playing '+nice(n)}catch(e){$('#msg').textContent=e.message}}
async function screen(){try{const r=await j('/api/screen?on='+(scrOn?0:1),{method:'POST'});scrOn=r.on;faces()}catch(e){$('#msg').textContent=e.message}}
let briT=null;$('#bri').oninput=e=>{$('#bv').textContent=e.target.value;clearTimeout(briT);briT=setTimeout(()=>fetch('/api/brightness?value='+e.target.value,{method:'POST'}).catch(()=>{}),150)};
async function load(){const s=await j('/api/status');anims=s.animations;cur=s.current;scrOn=s.screen;theme=s.theme||'';faces();if(document.activeElement!==$('#bri')){$('#bri').value=s.brightness;$('#bv').textContent=s.brightness}
$('#title').textContent=s.config.name||'Desk Buddy';document.title=$('#title').textContent;
$('#st').textContent=(s.wifi.connected?'Wi-Fi: '+s.wifi.ssid+' ('+s.wifi.ip+')':'Wi-Fi: not connected')+(s.ap?'  ·  setup AP '+s.ap:'')+'  ·  MQTT: '+s.mqtt+'  ·  theme: '+(theme||'none');
$('#dev').textContent='device '+s.id+'  ·  http://'+s.host+'.local  ·  '+s.animations.length+' animations';}
load().catch(e=>$('#st').textContent=e.message);setInterval(()=>load().catch(()=>{}),10000);
</script></body></html>)HTML";

static const char SETTINGS_PAGE[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Desk Buddy settings</title><link rel="stylesheet" href="/style.css"></head><body>
<h1><span>Settings</span><a href="/">‹ Faces</a></h1><div id="st">…</div>

<h2>Device</h2><div class="card"><form id="set">
<label>Device name</label><input name="name">
<div class="row">
<div><label>Display rotation</label><select name="rotation"><option value="0">0°</option><option value="1">90°</option><option value="2">180°</option><option value="3">270°</option></select></div>
<div><label>Loops per face (cycling)</label><input name="loops" type="number" min="1" max="50"></div>
<div><label>Speed %</label><input name="speed" type="number" min="25" max="400" step="5"></div>
</div>
<label>Theme <small>(themed animations ✦ play only in their theme; common ones always)</small></label><select name="theme" id="themesel"></select>
<label>Faces in the cycle (none checked = all)</label><div id="cyc"></div>
<label>Start with</label><select name="anim" id="startsel"></select>
<div class="row"><div><label>Setup AP password <small>(empty = open)</small></label><input name="apPass" type="password" autocomplete="off" placeholder="at least 8 characters"></div>
<div><label>Firmware update password <small>(empty = none)</small></label><input name="otaPass" type="password" autocomplete="off"></div></div>
</form></div>

<h2>Wi-Fi</h2><div class="card"><form id="wifi">
<div class="row"><div><label>Network (SSID)</label><input name="ssid" id="ssid" autocapitalize="off"></div><button type="button" onclick="scan()" style="flex:0">Scan</button></div>
<div id="nets"></div>
<label>Password <small>(leave empty to keep the saved one)</small></label><input name="pass" type="password" autocomplete="off">
</form></div>

<h2>MQTT</h2><div class="card"><form id="mqtt">
<div class="row"><div><label>Broker host <small>(empty = MQTT off)</small></label><input name="mqttHost" placeholder="192.168.1.10 or broker.local"></div><div style="flex:0 0 90px"><label>Port</label><input name="mqttPort" value="1883"></div></div>
<div class="row"><div><label>User</label><input name="mqttUser" autocapitalize="off"></div><div><label>Password <small>(empty = keep)</small></label><input name="mqttPass" type="password" autocomplete="off"></div></div>
<label>Topic prefix</label><input name="mqttPrefix">
<label class="chk"><input type="checkbox" name="haDiscovery"> Home Assistant discovery</label>
<p><small>Topics: <span id="tp"></span>/set (face name or "cycle"), /state, /screen/set (on|off), /screen/state, /brightness/set (10-100), /brightness/state, /theme/set (name|none), /theme/state, /availability, /animations</small></p>
</form></div>

<div class="row"><button class="primary" onclick="save()">Save &amp; reboot</button><button onclick="reboot()">Reboot</button><button class="danger" onclick="factory()">Factory reset</button></div>
<div id="msg"></div>

<h2>Animations on the device</h2><div class="card">
<table id="anims"></table>
<p><small id="fs"></small></p>
<label>Upload a .dba (exported by the simulator; the simulator's "→ board" button does this directly)</label>
<div class="row"><input type="file" id="dbafile" accept=".dba"><button type="button" onclick="upAnim()" style="flex:0">Upload</button></div>
<progress id="aprog" value="0" max="100" style="display:none"></progress>
</div>

<h2>Firmware</h2><div class="card">
<p><small>Version <span id="ver"></span>. Upload a <code>firmware.bin</code> built with PlatformIO (hardware/.pio/build/esp32s3_supermini/firmware.bin), or run <code>hardware/ota.sh &lt;address&gt;</code>. The screen shows progress; the device reboots when done.</small></p>
<div class="row"><input type="file" id="fwfile" accept=".bin"><button type="button" class="primary" onclick="upFw()" style="flex:0">Update</button></div>
<progress id="fprog" value="0" max="100" style="display:none"></progress>
<div id="fmsg"></div>
</div>
<p><small id="dev"></small></p>
<script>
const $=s=>document.querySelector(s);let anims=[],cur='';
async function j(u,o){const r=await fetch(u,o);if(!r.ok)throw new Error(r.status+' '+await r.text());return r.json()}
const nice=n=>n.replace(/^face_/,'').replace(/_/g,' ');const kb=b=>(b/1024).toFixed(1)+' KB';const themeOf=n=>{const m=n.match(/^([a-z0-9]+)__/);return m?m[1]:''};
async function load(){const s=await j('/api/status');anims=s.animations;cur=s.current;
$('#st').textContent=(s.wifi.connected?'Wi-Fi: '+s.wifi.ssid+' ('+s.wifi.ip+', '+s.wifi.rssi+' dBm)':'Wi-Fi: not connected')+(s.ap?'  ·  setup AP '+s.ap:'')+'  ·  MQTT: '+s.mqtt;
$('#dev').textContent='device '+s.id+'  ·  http://'+s.host+'.local  ·  '+s.heap+' bytes free  ·  up '+Math.round(s.uptime/60)+' min';$('#ver').textContent=s.version;
const c=s.config,f=$('#wifi');f.ssid.value=c.ssid;const m=$('#mqtt');m.mqttHost.value=c.mqttHost;m.mqttPort.value=c.mqttPort;m.mqttUser.value=c.mqttUser;m.mqttPrefix.value=c.mqttPrefix;m.haDiscovery.checked=c.haDiscovery;$('#tp').textContent=c.mqttPrefix;m.mqttPrefix.oninput=()=>$('#tp').textContent=m.mqttPrefix.value;
const t=$('#set');t.name.value=c.name;t.rotation.value=c.rotation;t.loops.value=c.loops;t.speed.value=c.speed;t.apPass.value=c.apPass;t.otaPass.value=c.otaPass;
const ts=$('#themesel');ts.innerHTML='';for(const t of ['',...(s.themes||[])]){const o=document.createElement('option');o.value=t;o.textContent=t||'none (common animations only)';ts.appendChild(o)}ts.value=s.theme||'';
ts.onchange=()=>fetch('/api/theme?name='+ts.value,{method:'POST'}).then(()=>{$('#msg').textContent='theme: '+(ts.value||'none')}).catch(()=>{});
const inCyc=c.cycleList?c.cycleList.split(','):[];$('#cyc').innerHTML='';for(const n of anims){const th=themeOf(n);const l=document.createElement('label');l.className='chk';const i=document.createElement('input');i.type='checkbox';i.value=n;i.checked=inCyc.includes(n);l.appendChild(i);l.appendChild(document.createTextNode((th?th+': ':'')+nice(n.replace(/^[a-z0-9]+__/,''))+(th?' ✦':'')));$('#cyc').appendChild(l)}
const ss=$('#startsel');ss.innerHTML='';for(const n of ['cycle',...anims]){const o=document.createElement('option');o.value=n;const th=themeOf(n);o.textContent=(th?th+': ':'')+nice(n.replace(/^[a-z0-9]+__/,''));ss.appendChild(o)}ss.value=c.anim||'cycle';
await loadAnims()}
async function loadAnims(){const r=await j('/api/anim');const t=$('#anims');t.innerHTML='';for(const a of r.animations){const th=themeOf(a.name);const tr=document.createElement('tr');tr.innerHTML='<td>'+(th?'<small>'+th+': </small>':'')+nice(a.name.replace(/^[a-z0-9]+__/,''))+'</td><td><small>'+(a.builtin?'built-in':'stored')+'</small></td><td>'+kb(a.bytes)+'</td><td></td>';
if(!a.builtin){const b=document.createElement('button');b.textContent='delete';b.className='danger';b.onclick=()=>del(a.name);tr.lastChild.appendChild(b)}t.appendChild(tr)}
$('#fs').textContent=kb(r.free)+' free of '+kb(r.total)+' for stored animations'}
async function del(n){if(!confirm('Delete '+nice(n)+' from the device?'))return;try{await j('/api/anim?name='+n,{method:'DELETE'});await loadAnims()}catch(e){$('#msg').textContent=e.message}}
function put(url,file,prog,done,hdr){prog.style.display='';prog.value=0;const x=new XMLHttpRequest();x.open('PUT',url);if(hdr)for(const k in hdr)x.setRequestHeader(k,hdr[k]);x.upload.onprogress=e=>{if(e.lengthComputable)prog.value=100*e.loaded/e.total};
x.onload=()=>{prog.style.display='none';done(x.status,x.responseText)};x.onerror=()=>{prog.style.display='none';done(0,'connection lost')};x.send(file)}
function upAnim(){const f=$('#dbafile').files[0];if(!f){$('#msg').textContent='choose a .dba file';return}const name=f.name.replace(/\.dba$/,'').replace(/^anim_/,'').toLowerCase().replace(/[^a-z0-9_]/g,'_');
put('/api/anim',f,$('#aprog'),(s,t)=>{$('#msg').textContent=s===200?'stored '+name:'upload failed: '+t;loadAnims().catch(()=>{})},{'X-Anim-Name':name})}
function upFw(){const f=$('#fwfile').files[0];if(!f){$('#fmsg').textContent='choose firmware.bin';return}if(!confirm('Flash '+f.name+' ('+kb(f.size)+') to the device?'))return;
put('/api/update',f,$('#fprog'),(s,t)=>{$('#fmsg').textContent=s===200?'update written, rebooting… reload this page in ~10 s':'update failed: '+t})}
async function scan(){$('#nets').textContent='scanning…';try{const r=await j('/api/scan');$('#nets').innerHTML='';for(const n of r){const b=document.createElement('button');b.textContent=n.ssid+' ('+n.rssi+' dBm'+(n.open?', open':'')+')';b.style.margin='4px 4px 0 0';b.onclick=()=>{$('#ssid').value=n.ssid};$('#nets').appendChild(b)}if(!r.length)$('#nets').textContent='no networks found'}catch(e){$('#nets').textContent=e.message}}
async function save(){const t=$('#set');if(t.apPass.value&&t.apPass.value.length<8){$('#msg').textContent='AP password needs at least 8 characters';return}
const d=new URLSearchParams();for(const f of ['#set','#wifi','#mqtt'])for(const [k,v] of new FormData($(f)))d.append(k,v);
d.set('haDiscovery',$('#mqtt').haDiscovery.checked?'1':'0');d.set('cycleList',[...$('#cyc').querySelectorAll('input:checked')].map(i=>i.value).join(','));d.set('apPassSet','1');d.set('otaPassSet','1');
try{await j('/api/config',{method:'POST',body:d});$('#msg').textContent='saved, rebooting… if you changed Wi-Fi, reconnect to your network and open http://'+(t.name.value||'deskbuddy').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.local'}catch(e){$('#msg').textContent=e.message}}
async function reboot(){await fetch('/api/reboot',{method:'POST'});$('#msg').textContent='rebooting…'}
async function factory(){if(!confirm('Erase all settings (Wi-Fi, MQTT, display) and reboot into setup mode? Stored animations are kept.'))return;await fetch('/api/reset',{method:'POST'});$('#msg').textContent='settings erased, rebooting into setup AP…'}
load().catch(e=>$('#st').textContent=e.message);
</script></body></html>)HTML";
