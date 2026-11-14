/* partmap.js: a build's flash map as a bar (address 0 on the left), a table of the partitions,
 * and an estimate of how many animations fit in its LittleFS partition. Shared by the Build page
 * (partitions from the server, /api/plan "layout") and the Flash page (read from the image or the
 * board). Partitions are { label, type, subtype, offset, size } with ESP-IDF's numeric types. */
window.PartMap = (() => {
  const KIND = {
    boot:     { color: '#64748b', name: 'bootloader',      what: 'starts the chip, then the app' },
    table:    { color: '#94a3b8', name: 'partition table', what: 'this map' },
    nvs:      { color: '#f59e0b', name: 'settings',        what: 'Wi-Fi, name, theme, Bluetooth pairings' },
    otadata:  { color: '#a855f7', name: 'OTA state',       what: 'which app slot starts' },
    app:      { color: '#3b82f6', name: 'app',             what: 'the firmware' },
    app2:     { color: '#7ea6f8', name: 'update slot',     what: 'takes the next update over Wi-Fi, then starts' },
    fs:       { color: '#22c55e', name: 'animations',      what: 'LittleFS: the animations pushed to the buddy' },
    coredump: { color: '#ef4444', name: 'crash dump',      what: 'kept after a crash, for debugging' },
    other:    { color: '#8b5cf6', name: '',                what: '' },
    unused:   { color: '',        name: 'unused',          what: 'not in any partition' },
  };
  const BLOCK = 4096, TYPICAL_BLOCKS = 3.6;     // 4 KB blocks per animation when there is no library to measure

  function kindOf(p) {
    if (p.type === 0) return p.subtype > 0x10 && p.subtype < 0x20 ? 'app2' : 'app';
    if (p.type === 1) return ({ 0x02: 'nvs', 0x00: 'otadata', 0x03: 'coredump', 0x81: 'fs', 0x82: 'fs', 0x83: 'fs' })[p.subtype] || 'other';
    return 'other';
  }

  /* Regions covering the whole flash: bootloader, table, the partitions, and the gaps between. */
  function regions(parts, flashSize) {
    const out = [{ kind: 'boot', label: 'bootloader', offset: 0, size: 0x8000 }, { kind: 'table', label: 'partition table', offset: 0x8000, size: 0x1000 }];
    for (const p of [...parts].sort((a, b) => a.offset - b.offset)) out.push({ ...p, kind: kindOf(p) });
    const full = [];
    let at = 0;
    for (const r of out) {
      if (r.offset > at) full.push({ kind: 'unused', label: 'unused', offset: at, size: r.offset - at });
      full.push(r);
      at = Math.max(at, r.offset + r.size);
    }
    if (flashSize && at < flashSize) full.push({ kind: 'unused', label: 'unused', offset: at, size: flashSize - at });
    return full;
  }

  /* How many animations fit in a LittleFS partition of fsBytes. lib: { count, bytes, blocks, margin }
     from /api/library (the local animation library, what the buddy stores), or null. Each file takes
     whole 4 KB blocks; the directories take a few blocks; uploads keep `margin` free. */
  function estimate(fsBytes, lib) {
    const n = lib && lib.count ? lib.count : 0, margin = (lib && lib.margin) || 16384;
    const meta = 2 + 2 * Math.max(1, Math.ceil(Math.max(n, 100) / 40));
    const usable = Math.floor(fsBytes / BLOCK) - meta - Math.ceil(margin / BLOCK);
    const avg = n ? lib.blocks / n : TYPICAL_BLOCKS;
    const capacity = Math.max(0, Math.floor(usable / avg));
    const res = { usableBytes: usable * BLOCK, avgBlocks: avg, avgBytes: n ? lib.bytes / n : null, capacity, count: n };
    if (n) Object.assign(res, { needBytes: lib.blocks * BLOCK, fitsAll: lib.blocks <= usable, more: Math.max(0, Math.floor((usable - lib.blocks) / avg)) });
    return res;
  }

  const size = n => n >= 1048576 ? (n / 1048576).toFixed(2).replace(/\.?0+$/, '') + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
  const hex = n => '0x' + n.toString(16);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Draw into `box`. lay: { flash_size, partitions }. opts: { appUsed: bytes of the firmware,
     lib (see estimate), compact: bar only }. Returns the estimate (or null without a file system). */
  function render(box, lay, opts = {}) {
    box.textContent = '';
    if (!lay || !lay.partitions || !lay.partitions.length) { box.innerHTML = '<div class="sub">No partition table.</div>'; return null; }
    const flash = lay.flash_size || 4 * 1048576, regs = regions(lay.partitions, flash);
    const fs = regs.find(r => r.kind === 'fs'), est = fs ? estimate(fs.size, opts.lib) : null;
    let firstApp = true;
    let bar = '<div class="pm-bar" role="img" aria-label="flash map">';
    for (const r of regs) {
      const k = KIND[r.kind], frac = r.size / flash;
      let fill = 0, over = false;
      if ((r.kind === 'app' && firstApp) && opts.appUsed) fill = Math.min(1, opts.appUsed / r.size);
      if (r.kind === 'fs' && est && est.needBytes) { fill = Math.min(1, est.needBytes / r.size); over = !est.fitsAll; }
      if (r.kind === 'app') firstApp = false;
      const text = frac >= 0.16 ? (k.name || r.label) + ' · ' + size(r.size) : frac >= 0.07 ? size(r.size) : '';
      const tip = (r.label !== k.name ? r.label + ': ' : '') + (k.name || r.label) + ', ' + size(r.size) + ' at ' + hex(r.offset);
      bar += `<div class="pm-seg pm-${r.kind}${over ? ' pm-over' : ''}" style="flex-grow:${r.size};${k.color ? 'background:' + k.color : ''}" title="${esc(tip)}">`
        + (fill ? `<div class="pm-used" style="width:${(fill * 100).toFixed(1)}%"></div>` : '') + `<span>${esc(text)}</span></div>`;
    }
    bar += '</div><div class="pm-ticks">';
    const mb = flash / 1048576;
    for (let i = 0; i <= mb; i++) bar += `<span>${i ? i + ' MB' : '0'}</span>`;
    bar += '</div>';
    let html = bar;
    if (!opts.compact) {
      html += '<div class="pm-legend sub">Address 0 on the left. Darker: in use (the firmware; your animations).'
        + (est && est.needBytes && !est.fitsAll ? ' Stripes: your animations need more than there is.' : '') + ' Hover a part for its address.</div>';
      if (est) {
        const lib = opts.lib && opts.lib.count ? opts.lib : null;
        let line;
        if (lib && est.fitsAll) line = `All ${lib.count} animations in your library fit (${size(est.needBytes)} on the buddy), with room for about <b>${est.more}</b> more.`;
        else if (lib) line = `About ${est.capacity} of the ${lib.count} in your library fit at once (they need ${size(est.needBytes)}). The apps and the bridge upload the others when one is played, deleting the least recently played.`;
        else line = 'For a typical animation of about 12 KB. With an animation library (sim/test/library.sh) the estimate uses your own sizes.';
        html += `<div class="pm-est"><div class="pm-big">≈ ${est.capacity}</div><div><b>animations fit</b> in ${size(est.usableBytes)} of usable space`
          + (est.avgBytes ? ` (average ${size(Math.round(est.avgBytes))}, ${est.avgBlocks.toFixed(1)} blocks of 4 KB each)` : '') + `.<br><span class="sub">${line}</span></div></div>`;
      }
      html += '<table class="pm-table"><tr><th></th><th>Partition</th><th>Offset</th><th>Size</th><th>Holds</th></tr>';
      firstApp = true;
      for (const r of regs) {
        const k = KIND[r.kind];
        let what = k.what;
        if (r.kind === 'app' && firstApp && opts.appUsed) what += ` (${size(opts.appUsed)} used, ${Math.round(opts.appUsed / r.size * 100)} %)`;
        if (r.kind === 'app') firstApp = false;
        if (r.kind === 'fs' && est) what += `: ≈ ${est.capacity} animations`;
        html += `<tr><td><span class="pm-sw pm-${r.kind}" style="${k.color ? 'background:' + k.color : ''}"></span></td><td>${esc(r.label === k.name || r.kind === 'boot' || r.kind === 'table' || r.kind === 'unused' ? (k.name || r.label) : r.label + ' (' + (k.name || '?') + ')')}</td>`
          + `<td class="mono">${hex(r.offset)}</td><td class="mono">${size(r.size)}</td><td>${esc(what)}</td></tr>`;
      }
      html += '</table>';
    }
    box.innerHTML = html;
    return est;
  }

  return { KIND, kindOf, regions, estimate, render };
})();
