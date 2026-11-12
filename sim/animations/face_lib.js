/*
 * face_lib.js - shared parts for the buddy's face. Loaded before the face
 * animations (see index.js). Exposes window.Face.
 *
 * The face is two big eyes at (Face.LX, Face.EY) and (Face.RX, Face.EY) and a
 * mouth around (120, Face.MY). Everything is drawn with integer primitives so
 * exports stay small.
 */
window.Face = (() => {
  const C = Sim.C;
  const F = {
    BG: C.BLACK,
    SCLERA: C.WHITE,
    IRIS: Sim.hex('#2a6cff'),
    PUPIL: C.BLACK,
    MOUTH: Sim.hex('#ff4f7a'),
    MOUTH_IN: Sim.hex('#7a1030'),
    BLUSH: Sim.hex('#ff8fa3'),
    BROW: Sim.hex('#cfd8e3'),
    LX: 70, RX: 170, EY: 112, MY: 160,
    background: null,   // set this at the start of frame() when the animation does not use a black background
  };
  const bg = () => (F.background == null ? F.BG : F.background);

  /** Keyframe interpolation: pts = [[t0, v0], [t1, v1], ...] (t ascending), smoothstep between keys. */
  F.kf = (t, pts) => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i][0]) {
        const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
        const u = (t - t0) / (t1 - t0), e = u * u * (3 - 2 * u);
        return v0 + (v1 - v0) * e;
      }
    }
    return pts[pts.length - 1][1];
  };

  /**
   * One eye. o: { rx, ry, open (0..1 vertical squash), lookX, lookY, iris (radius),
   * pupil (fraction of iris), topLid (0..1 of eye height covered from above),
   * squint (0..1 -> crescent "happy" eye), sclera }
   */
  F.eye = (g, cx, cy, o = {}) => {
    const rx = o.rx ?? 32, ry0 = o.ry ?? 40;
    const ry = Math.max(1, Math.round(ry0 * (o.open ?? 1)));
    g.fillEllipse(cx, cy, rx, ry, o.sclera ?? F.SCLERA);
    const closed = (o.topLid ?? 0) >= 0.95;
    const irisScale = Math.min(1, ry / 18) * Math.max(0, 1 - (o.squint ?? 0) * 1.6);
    if (ry > 5 && irisScale > 0.15 && !closed) {
      const px = cx + Math.round(o.lookX ?? 0), py = cy + Math.round((o.lookY ?? 0) * Math.min(1, ry / ry0));
      const ir = Math.max(2, Math.round((o.iris ?? 16) * irisScale));
      g.fillCircle(px, py, ir, F.IRIS);
      g.fillCircle(px, py, Math.max(1, Math.round(ir * (o.pupil ?? 0.5))), F.PUPIL);
      g.fillCircle(px + (ir >> 1) + 1, py - (ir >> 1) - 1, Math.max(1, ir >> 2), F.SCLERA);
    }
    if (closed) {
      g.fillEllipse(cx, cy, rx + 1, ry + 1, bg());
      g.fillRoundRect(cx - rx + 4, cy + ry - 4, 2 * rx - 8, 4, 2, F.SCLERA);
    } else if (o.topLid > 0) {
      g.fillRect(cx - rx - 1, cy - ry - 1, 2 * rx + 3, Math.round(2 * ry * o.topLid) + 1, bg());
    }
    if (o.squint > 0) {
      // cover the lower part with a background ellipse -> upward crescent. Only the rows
      // of the eye itself are painted: at small squints the ellipse sits mostly below the
      // eye and would otherwise erase whatever is drawn there (props, backgrounds).
      const off = Math.round((2 * ry + 6) * (1 - o.squint) + ry * 0.55 * o.squint);
      const ecy = cy + off, erx = rx + 4, ery = ry + 2;
      for (let y = Math.max(cy - ry - 1, ecy - ery); y <= Math.min(cy + ry + 1, ecy + ery); y++) {
        const d = (y - ecy) / ery;
        const hw = Math.floor(erx * Math.sqrt(Math.max(0, 1 - d * d)));
        g.drawFastHLine(cx - hw, y, 2 * hw + 1, bg());
      }
    }
  };

  /** Both eyes with the same options (per-eye overrides via l / r objects). */
  F.eyes = (g, o = {}, dx = 0, dy = 0) => {
    F.eye(g, F.LX + dx, F.EY + dy, { ...o, ...(o.l || {}) });
    F.eye(g, F.RX + dx, F.EY + dy, { ...o, ...(o.r || {}) });
  };

  /** Eyebrow: a short thick arc above an eye. raise = px above the eye, tilt = degrees. */
  F.brow = (g, cx, cy, raise = 0, tilt = 0, w = 5) => {
    const r = 46;
    g.drawArc(cx, cy + 10 - raise, r, r - w, -28 + tilt, 28 + tilt, F.BROW);
  };

  /** Smile (curve > 0) or frown (curve < 0). width = half width in px, thick = stroke. */
  F.smile = (g, cx, cy, width = 30, curve = 1, thick = 5) => {
    const r = Math.max(width, 8);
    const span = Math.round(60 * Math.min(1, Math.abs(curve)) + 10);
    if (curve >= 0) g.drawArc(cx, cy - r + 6, r, r - thick, 180 - span, 180 + span, F.MOUTH);
    else g.drawArc(cx, cy + r - 6, r, r - thick, -span, span, F.MOUTH);
  };

  /** Flat mouth. */
  F.flat = (g, cx, cy, width = 24, thick = 4) => g.fillRoundRect(cx - width, cy - (thick >> 1), 2 * width, thick, thick >> 1, F.MOUTH);

  /** Open grin: flat top lip, round bottom ("D" on its side). w = half width, h = depth. */
  F.grin = (g, cx, cy, w, h) => {
    // lower half-ellipse only, so nothing above the lip is painted over (eyes, coloured backgrounds)
    const half = (rw, rh, col) => {
      for (let y = 0; y <= rh; y++) {
        const hw = Math.round(rw * Math.sqrt(Math.max(0, 1 - (y / rh) * (y / rh))));
        g.drawFastHLine(cx - hw, cy + y, 2 * hw + 1, col);
      }
    };
    half(w, h, F.MOUTH);
    if (w > 5 && h > 5) half(w - 4, h - 4, F.MOUTH_IN);
    g.fillRoundRect(cx - w, cy - 2, 2 * w + 1, 4, 2, F.MOUTH);
  };

  /** Open "o" mouth. */
  F.oMouth = (g, cx, cy, rx, ry) => {
    g.fillEllipse(cx, cy, rx, ry, F.MOUTH);
    if (rx > 5 && ry > 5) g.fillEllipse(cx, cy + 1, rx - 3, ry - 3, F.MOUTH_IN);
  };

  F.blush = (g, amount = 1, dx = 0, dy = 0) => {
    if (amount <= 0) return;
    const col = Sim.lerp565(bg(), F.BLUSH, Math.min(1, amount));
    g.fillEllipse(F.LX - 18 + dx, F.EY + 40 + dy, 14, 7, col);
    g.fillEllipse(F.RX + 18 + dx, F.EY + 40 + dy, 14, 7, col);
  };

  return F;
})();
