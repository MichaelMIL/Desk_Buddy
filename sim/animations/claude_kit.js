/*
 * claude_kit.js - shared drawing for the Claude theme files (theme_claude*.js).
 * Exposes window.ClaudeKit; each animation file takes what it needs:
 *   const { CORAL, CREAM, spark, terminal, ... } = ClaudeKit;
 */
window.ClaudeKit = (() => {
const CORAL = Sim.hex('#d97757'), CREAM = Sim.hex('#f0eee6'), INK = Sim.hex('#1f1e1d'), STONE = Sim.hex('#8c8a83');
const COLORS = { bg: '#1f1e1d', iris: '#d97757', mouth: '#d97757', blush: '#e8a088', sclera: '#f0eee6' };

/* Radial spark: tapered rays of slightly uneven length around a small core.
 * o: { vary (ray length variation, 0.3), width (ray base, fraction of r, 0.12), core (fraction of r, 0.2),
 *      inner (rays start at this fraction of r: a sunburst ring instead of a star, 0) } */
function spark(g, x, y, r, rot, col, rays = 12, o = {}) {
  const vary = o.vary ?? 0.3, wf = o.width ?? 0.12, core = o.core ?? 0.2, inner = (o.inner ?? 0) * r;
  for (let k = 0; k < rays; k++) {
    const a = rot + k * Math.PI * 2 / rays;
    const len = inner + (r - inner) * (1 - vary + vary * (((k * 7) % 5) / 4));
    const w = Math.max(1.5, r * wf);
    const ca = Math.cos(a), sa = Math.sin(a), bx = x + ca * inner, by = y + sa * inner;
    g.fillTriangle(Math.round(bx - sa * w), Math.round(by + ca * w), Math.round(bx + sa * w), Math.round(by - ca * w),
                   Math.round(x + ca * len), Math.round(y + sa * len), col);
  }
  if (!inner) g.fillCircle(x, y, Math.max(2, Math.round(r * core)), col);
}

const TERM = Sim.hex('#141413'), EDGE = Sim.hex('#3a3936');
const GREEN = Sim.hex('#7ec98f'), RED = Sim.hex('#e06c6c'), YELLOW = Sim.hex('#e5c07b'), BLUE = Sim.hex('#7aa2f7');
const MONO = 'Menlo, Monaco, Consolas, monospace';
const CODE_FACE = { headY: [[0, -18]], eyeSize: [[0, 0.9]] };            // face up, terminal below

function terminal(g, x, y, w, h) {
  g.fillRoundRect(x, y, w, h, 7, TERM);
  g.drawRoundRect(x, y, w, h, 7, EDGE);
  for (let k = 0; k < 3; k++) g.fillCircle(x + 10 + k * 8, y + 7, 2, [RED, YELLOW, GREEN][k]);
}
function mono(g, x, y, s, col, size = 11, weight = 'normal') {
  g.text(x, y, s, col, { size, font: MONO, weight, baseline: 'middle' });
}
function check(g, x, y, s, col) {                                          // a drawn ✓ (fonts vary)
  for (let d = 0; d < 3; d++) {
    g.drawLine(x - s, y + d - 1, x - Math.round(s / 3), y + Math.round(s * 0.6) + d - 1, col);
    g.drawLine(x - Math.round(s / 3), y + Math.round(s * 0.6) + d - 1, x + s, y - Math.round(s * 0.7) + d - 1, col);
  }
}

/* The CLI spinner: · ✢ ✳ ✶ ✻ ✽ back and forth. */
const GLYPHS = [{ r: 3 }, { r: 9, rays: 4, w: 0.24 }, { r: 10, rays: 8, w: 0.1 }, { r: 10, rays: 6, w: 0.16 }, { r: 11, rays: 10, w: 0.12 }, { r: 10, rays: 8, w: 0.2 }];
function cliSpinner(g, x, y, step, col) {
  const n = GLYPHS.length, k = step % (2 * n - 2), s = GLYPHS[k < n ? k : 2 * n - 2 - k];
  if (!s.rays) g.fillCircle(x, y, s.r, col);
  else spark(g, x, y, s.r, Math.PI / 8, col, s.rays, { vary: 0.08, width: s.w, core: 0.16 });
}


/* A drawn ✗ to match check(). */
function cross(g, x, y, s, col) {
  for (let d = -1; d <= 1; d++) {
    g.drawLine(x - s + d, y - s, x + s + d, y + s, col);
    g.drawLine(x + s + d, y - s, x - s + d, y + s, col);
  }
}

const SANS = 'Arial, Helvetica, sans-serif';
function label(g, x, y, s, col, size = 14, align = 'left') {
  g.text(x, y, s, col, { size, weight: 'bold', font: SANS, align, baseline: 'middle' });
}

/* A row of syntax-coloured token bars: tokens = [[width, colour|null], ...]; limit = px to show. */
function codeBars(g, x, y, tokens, limit = Infinity) {
  let cx = x;
  for (const [w, col] of tokens) {
    const vis = Math.max(0, Math.min(w, limit - (cx - x)));
    if (col && vis > 0) g.fillRect(cx, y - 1, vis, 3, col);
    cx += w + 2;
  }
  return cx - x;
}

/* A tiny buddy (for subagents etc.): coral body with two eyes. */
function miniBuddy(g, x, y, r, col, look = 0, happy = false) {
  g.fillCircle(x, y, r, col);
  const ex = Math.round(r * 0.38), ey = Math.round(r * 0.1), er = Math.max(1, Math.round(r * 0.18));
  for (const s of [-1, 1]) {
    if (happy) g.drawArc(x + s * ex, y - ey + 1, er + 1, er - 1, 270, 360, INK), g.drawArc(x + s * ex, y - ey + 1, er + 1, er - 1, 0, 90, INK);
    else g.fillCircle(x + s * ex + look, y - ey, er, INK);
  }
}

return { CORAL, CREAM, INK, STONE, COLORS, TERM, EDGE, GREEN, RED, YELLOW, BLUE, MONO, SANS, CODE_FACE,
         spark, terminal, mono, check, cross, label, codeBars, cliSpinner, miniBuddy };
})();
