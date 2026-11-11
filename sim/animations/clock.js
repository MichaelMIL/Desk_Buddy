/* Analog clock face using the Canvas 2D escape hatch (anti-aliased hands). */
Sim.register({
  name: 'Clock',
  fps: 10,
  frames: 100, // ten seconds of the seconds hand (exports ~150 KB; 600 frames would be ~1 MB)

  frame(g, f) {
    const sec = f.t / 1000;
    g.clear(Sim.C.BLACK);
    g.draw2d(ctx => {
      ctx.translate(120, 120);
      ctx.strokeStyle = '#444'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 112, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ddd';
      for (let i = 0; i < 60; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 30);
        ctx.fillRect(-1, -110, i % 5 ? 2 : 3, i % 5 ? 6 : 14);
        ctx.restore();
      }
      const hand = (ang, len, w, col) => {
        ctx.save(); ctx.rotate(ang);
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -len); ctx.stroke();
        ctx.restore();
      };
      hand(Math.PI * 2 * (10.25 / 12), 55, 7, '#fff');          // hour
      hand(Math.PI * 2 * ((15 + sec / 60) / 60), 85, 5, '#fff'); // minute
      hand(Math.PI * 2 * (sec / 60), 100, 2, '#ff3b30');        // second
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    });
  },
});
