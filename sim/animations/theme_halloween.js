/* Halloween theme: a flickering jack-o'-lantern, and a ghost drifting past the moon. */
const hw = (n => (Math.sin(n * 12.9898) * 43758.5453) % 1);   // deterministic "random" 0..1

Sim.register({
  name: 'Halloween: pumpkin',
  theme: 'halloween',
  fps: 20,
  duration: 4000,

  frame(g, f) {
    const t = f.t / 1000;
    g.clear(Sim.C.BLACK);
    // candle flicker drives the glow colour
    const flick = 0.7 + 0.3 * Math.abs(Math.sin(t * 9) * Math.sin(t * 3.7 + 1));
    const glow = Sim.lerp565(Sim.hex('#ff7a00'), Sim.hex('#ffe066'), flick);
    const body = Sim.lerp565(Sim.hex('#c2500c'), Sim.hex('#f06a10'), 0.5 + 0.5 * flick);
    const ridge = Sim.lerp565(body, Sim.C.BLACK, 0.3);
    // stem and body; the ridges are ellipses kept inside the body outline
    g.fillRoundRect(112, 36, 16, 26, 5, Sim.hex('#3e7a2a'));
    g.fillEllipse(120, 132, 92, 76, body);
    for (const [dx, rx] of [[-56, 30], [-28, 44], [0, 50], [28, 44], [56, 30]]) g.drawEllipse(120 + dx, 132, rx, 72, ridge);
    // eyes, nose, jagged mouth, lit from inside
    g.fillTriangle(70, 118, 102, 118, 86, 92, glow);
    g.fillTriangle(138, 118, 170, 118, 154, 92, glow);
    g.fillTriangle(110, 146, 130, 146, 120, 130, glow);
    const mx = [52, 70, 86, 104, 120, 136, 154, 170, 188];
    for (let i = 0; i < mx.length - 1; i++) {
      const up = i % 2 === 0;
      g.fillTriangle(mx[i], 164, mx[i + 1], 164, (mx[i] + mx[i + 1]) / 2 | 0, up ? 182 : 150, glow);
    }
    g.fillRect(52, 160, 137, 8, glow);
    // a few drifting embers
    for (let k = 0; k < 6; k++) {
      const u = ((t * 0.4) + k / 6) % 1;
      const x = 120 + Math.round(60 * Math.sin(k * 2.1 + u * 3)), y = 215 - Math.round(150 * u);
      g.fillCircle(x, y, u < 0.5 ? 2 : 1, Sim.lerp565(Sim.C.BLACK, Sim.C.ORANGE, 1 - u));
    }
  },
});

Sim.register({
  name: 'Halloween: ghost',
  theme: 'halloween',
  fps: 24,
  duration: 4000,

  frame(g, f) {
    const t = f.t / 1000;
    g.clear(Sim.hex('#06041a'));
    // moon and stars
    g.fillCircle(170, 60, 28, Sim.hex('#f2e9b0'));
    g.fillCircle(182, 52, 24, Sim.hex('#06041a'));
    for (let k = 0; k < 14; k++) {
      const x = Math.round(20 + 200 * hw(k + 1)), y = Math.round(20 + 120 * hw(k + 40));
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + k);
      g.drawPixel(x, y, Sim.lerp565(Sim.hex('#06041a'), Sim.C.WHITE, tw));
    }
    // ghost: bobbing body with a wavy hem
    const gx = 120 + Math.round(18 * Math.sin(t * Math.PI / 2)), gy = 118 + Math.round(8 * Math.sin(t * Math.PI));
    const white = Sim.hex('#eef2ff');
    g.fillCircle(gx, gy - 20, 44, white);
    g.fillRect(gx - 44, gy - 20, 88, 56, white);
    for (let i = 0; i < 4; i++) {
      const bx = gx - 44 + 11 + i * 22;
      g.fillCircle(bx, gy + 36 + Math.round(4 * Math.sin(t * 4 + i)), 11, white);
    }
    // face: eyes follow the drift, mouth "oooo"
    const look = Math.round(4 * Math.sin(t * Math.PI / 2));
    g.fillEllipse(gx - 16 + look, gy - 24, 7, 10, Sim.hex('#06041a'));
    g.fillEllipse(gx + 16 + look, gy - 24, 7, 10, Sim.hex('#06041a'));
    const o = 6 + Math.round(4 * Math.abs(Math.sin(t * 2.5)));
    g.fillEllipse(gx, gy + 4, 8, o, Sim.hex('#06041a'));
    // arms
    g.fillEllipse(gx - 50, gy - 2 + Math.round(5 * Math.sin(t * 3)), 12, 8, white);
    g.fillEllipse(gx + 50, gy - 2 - Math.round(5 * Math.sin(t * 3)), 12, 8, white);
  },
});
