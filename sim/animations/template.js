/*
 * Copy this file to start a new animation. Then add it to index.js.
 *
 * g  - Gfx.Framebuffer (240x240 RGB565). Drawing persists between frames
 *      like on the real display, so clear what you need to.
 * f  - frame info: { i, n, t, dt, p, fps, state }
 *        i     frame index, 0..n-1
 *        n     total frames
 *        t     time in ms since start of loop
 *        dt    ms per frame (1000 / fps)
 *        p     progress 0..1 through the loop
 *        state scratch object shared with setup()
 *
 * frame() may return a number to hold that frame for a custom delay in ms
 * (e.g. return 500 to pause on a frame).
 *
 * Drawing API (all integer coordinates, colours are RGB565 numbers):
 *   g.clear(c) g.drawPixel(x,y,c) g.drawLine(x0,y0,x1,y1,c)
 *   g.drawRect/fillRect(x,y,w,h,c) g.drawRoundRect/fillRoundRect(x,y,w,h,r,c)
 *   g.drawCircle/fillCircle(cx,cy,r,c) g.drawEllipse/fillEllipse(cx,cy,rx,ry,c)
 *   g.drawTriangle/fillTriangle(x0,y0,x1,y1,x2,y2,c)
 *   g.drawArc(cx,cy,rOuter,rInner,startDeg,endDeg,c)   0deg = 12 o'clock, clockwise
 *   g.drawBitmap(x,y,bits,w,h,c[,bg]) g.drawRGB565(x,y,w,h,pixels[,transparentColour])
 *   g.text(x,y,str,c,{size,font,weight,align,baseline,bg,crisp})
 *   g.draw2d(ctx => {...})  full Canvas 2D, result quantised to RGB565
 *   g.drawImage(img,x,y,{w,h})  with img from await Sim.loadImage(url) in setup()
 *
 * Colours: Sim.C.RED, Sim.hex('#ff8800'), Sim.color565(r,g,b), Sim.hsv(h,s,v), Sim.lerp565(a,b,t)
 */
Sim.register({
  name: 'Template',
  fps: 30,
  duration: 2000,          // ms per loop (or use frames: N)

  setup(g, state) {
    state.hue = 0;
  },

  frame(g, f) {
    g.clear(Sim.C.BLACK);
    const r = 20 + Math.round(30 * (0.5 + 0.5 * Math.sin(f.p * Math.PI * 2)));
    g.fillCircle(120, 120, r, Sim.hsv(f.p * 360, 1, 1));
    g.text(120, 180, 'hello', Sim.C.WHITE, { size: 20, align: 'center' });
  },
});
