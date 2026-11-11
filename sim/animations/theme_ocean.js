/* Ocean theme: the buddy underwater with bubbles and seaweed, and a pulsing jellyfish. */
const or_ = (n => (Math.sin(n * 55.31) * 43758.5453) % 1);

function water(g, t) {
  const deep = Sim.hex('#04304a'), shallow = Sim.hex('#0a5e8a');
  for (let y = 0; y < 240; y += 4) g.fillRect(0, y, 240, 4, Sim.lerp565(shallow, deep, y / 240));
  // still light rays (moving ones would make every frame a full-screen change)
  for (let k = 0; k < 4; k++) {
    const x = 40 + k * 50;
    g.fillTriangle(x, 0, x + 14, 0, x + 40, 120, Sim.lerp565(shallow, Sim.hex('#5fb5d8'), 0.25));
  }
}

function bubbles(g, t, n) {
  for (let k = 0; k < n; k++) {
    const u = ((t / (3 + 2 * or_(k + 9))) + or_(k + 1)) % 1;
    const x = Math.round(or_(k + 3) * 240 + 5 * Math.sin(u * 10 + k)), y = Math.round(250 - 260 * u);
    const r = 2 + (k % 3);
    g.drawCircle(x, y, r, Sim.hex('#bfe9ff'));
    g.drawPixel(x - 1, y - 1, Sim.C.WHITE);
  }
}

Sim.register({
  name: 'Ocean: diver',
  theme: 'ocean',
  fps: 16,
  duration: 5000,

  frame(g, f) {
    const F = Face, t = f.t / 1000;
    water(g, t);
    // seaweed
    for (let k = 0; k < 6; k++) {
      const bx = 20 + k * 40;
      for (let i = 0; i < 6; i++) {
        const y = 236 - i * 12, sway = Math.round((i + 1) * 3 * Math.sin(t * 1.5 + k + i * 0.5));
        g.fillEllipse(bx + sway, y, 6, 8, Sim.hex(i % 2 ? '#1f8a4c' : '#176b3a'));
      }
    }
    const dy = Math.round(6 * Math.sin(t * Math.PI * 2 / 5));
    const blink = F.kf(t, [[3.0, 1], [3.15, 0.05], [3.3, 1]]);
    F.eyes(g, { open: blink, lookX: Math.round(5 * Math.sin(t * 0.9)), iris: 16 }, 0, dy);
    const puff = F.kf(t, [[1.0, 0], [1.3, 1], [1.6, 0]]);
    if (puff > 0.1) F.oMouth(g, 120, F.MY + dy + 4, Math.round(6 + 6 * puff), Math.round(6 + 8 * puff));
    else F.smile(g, 120, F.MY + dy, 26, 0.7, 6);
    // mask strap + goggles
    g.drawArc(120, F.EY + dy, 98, 92, 230, 310, Sim.hex('#ffb13b'));
    g.drawEllipse(F.LX, F.EY + dy, 38, 46, Sim.hex('#ffb13b'));
    g.drawEllipse(F.RX, F.EY + dy, 38, 46, Sim.hex('#ffb13b'));
    g.fillRect(F.LX + 36, F.EY + dy - 3, 28, 6, Sim.hex('#ffb13b'));
    bubbles(g, t, 10);
  },
});

Sim.register({
  name: 'Ocean: jellyfish',
  theme: 'ocean',
  fps: 16,
  duration: 4000,

  frame(g, f) {
    const t = f.t / 1000;
    water(g, t);
    bubbles(g, t, 8);
    // bell pulses, body rises and falls with the pulse
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI);          // 2 s cycle
    const cx = 120 + Math.round(10 * Math.sin(t * 0.8)), cy = 96 - Math.round(12 * pulse);
    const rx = Math.round(48 + 10 * (1 - pulse)), ry = Math.round(34 + 10 * pulse);
    const pink = Sim.hex('#ff8fd0'), inner = Sim.hex('#ffc6e8');
    // tentacles first (behind the bell)
    for (let k = 0; k < 7; k++) {
      const x0 = cx - 36 + k * 12;
      let px = x0, py = cy + 10;
      for (let i = 1; i <= 9; i++) {
        const nx = x0 + Math.round(10 * Math.sin(t * 2.5 + k * 0.8 + i * 0.6) * i / 9), ny = cy + 10 + i * 12;
        g.drawLine(px, py, nx, ny, k % 2 ? pink : inner);
        g.drawLine(px + 1, py, nx + 1, ny, k % 2 ? pink : inner);
        px = nx; py = ny;
      }
    }
    g.fillEllipse(cx, cy, rx, ry, pink);
    g.fillEllipse(cx, cy + 6, rx - 8, ry - 10, inner);
    g.fillEllipse(cx, cy + 8, rx - 2, 8, pink);
    // face
    g.fillCircle(cx - 14, cy + 2, 5, Sim.hex('#30204a'));
    g.fillCircle(cx + 14, cy + 2, 5, Sim.hex('#30204a'));
    g.fillCircle(cx - 12, cy, 2, Sim.C.WHITE);
    g.fillCircle(cx + 16, cy, 2, Sim.C.WHITE);
    g.drawArc(cx, cy + 4, 12, 9, 150, 210, Sim.hex('#30204a'));
  },
});

Sim.register({
  name: 'Ocean: fish',
  theme: 'ocean',
  fps: 16,
  duration: 5000,

  frame(g, f) {
    const t = f.t / 1000;
    water(g, t);
    bubbles(g, t, 6);
    // a fish swims across and back
    const dir = f.p < 0.5 ? 1 : -1, u = f.p < 0.5 ? f.p * 2 : (1 - f.p) * 2;
    const x = Math.round(-40 + 320 * u), y = 120 + Math.round(16 * Math.sin(t * 2));
    const body = Sim.hex('#ffa03c'), fin = Sim.hex('#ff6a1a');
    const tail = Math.round(6 * Math.sin(t * 10));
    g.fillTriangle(x - dir * 26, y, x - dir * 46, y - 16 + tail, x - dir * 46, y + 16 + tail, fin);
    g.fillEllipse(x, y, 30, 18, body);
    g.fillTriangle(x - dir * 4, y - 14, x + dir * 10, y - 26, x + dir * 14, y - 12, fin);
    g.fillTriangle(x - dir * 4, y + 14, x + dir * 6, y + 24, x + dir * 14, y + 12, fin);
    for (let i = 0; i < 3; i++) g.drawArc(x - dir * (4 + i * 8), y, 12, 10, dir > 0 ? 160 : 340, dir > 0 ? 200 : 380, fin);
    g.fillCircle(x + dir * 14, y - 4, 6, Sim.C.WHITE);
    g.fillCircle(x + dir * 15, y - 4, 3, Sim.hex('#101018'));
    g.drawArc(x + dir * 20, y + 6, 6, 4, dir > 0 ? 90 : 180, dir > 0 ? 180 : 270, Sim.hex('#c84a10'));
  },
});
