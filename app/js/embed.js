// ---------- embed: the renderer without the editor, on a canvas of another page ----------
// Load config.js, render.js and this file, then:
//   const lg = Litgrid.mount(canvas, { settings, media, size, pointer });
// settings: the JSON from "Copy settings", whole or in part, over the defaults. Nothing is read from or
//   saved to localStorage, so the colors and everything else come only from here.
// media: an image or video URL (another origin needs CORS), or an <img>, <video> or <canvas>.
// size: [width, height] of the drawing in pixels. By default, the canvas' displayed size times the pixel ratio.
// pointer: where the light listens to the mouse or finger, the canvas by default. A canvas behind the page's
//   content passes window, and the coordinates still count from the canvas.
// It returns { ready, update(settings), bands(list), resize(size), redraw(), burst(), press(down), snapshot(type, quality), stop() };
// ready resolves after the first frame with the media and the SVGs loaded. bands takes [{ y, bg, c0…c4 }]:
// from y down (in drawing pixels) the grid uses that palette, until the next band. A <canvas> as media is
// read again on every frame; with animate off, call redraw() after changing it. burst() swells and
// brightens the shape once, as burstSize, burstGlow and burstSecs say (a click on a button, say).
// press(true) swells it the same way and holds it there; press(false) lets it settle.
// One canvas per page: the renderer keeps its state in globals.
let dirty = true;
const Litgrid = {
  mount(canvas, { settings = {}, media: src = null, size = null, pointer = canvas } = {}) {
    cv = canvas; ctx = canvas.getContext("2d");
    S = { ...DEFAULTS, ...settings };
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) S.animate = false;
    sizeOverride = size || (canvas.clientWidth
      ? [Math.round(canvas.clientWidth * devicePixelRatio), Math.round(canvas.clientHeight * devicePixelRatio)]
      : [canvas.width, canvas.height]);

    // the page keeps scrolling under a finger: vertical swipes scroll, a tap or a sideways drag moves the light
    const apply = () => {
      sizeAll(); buildLut(); syncSvgs(); dirty = true;
      if (pointer === canvas) canvas.style.touchAction = S.followMouse ? "pan-y" : "";
    };
    const move = (e) => {
      if (!S.followMouse || still) return;
      const b = canvas.getBoundingClientRect();
      mouse.tx = (e.clientX - b.left) / b.width * W; mouse.ty = (e.clientY - b.top) / b.height * H;
      if (!mouse.on) { if (!mouse.back) { mouse.x = mouse.tx; mouse.y = mouse.ty; } mouse.on = true; mouse.back = false; }
      dirty = true;
    };
    const on = [["pointermove", move], ["pointerdown", move], ["pointerleave", releasePointer], ["pointercancel", releasePointer]];
    if (pointer !== canvas) on.push(["pointerout", (e) => { if (!e.relatedTarget) releasePointer(); }]);   // left the window
    for (const [ev, fn] of on) pointer.addEventListener(ev, fn);

    let mediaReady = !src, resolve;
    const ready = new Promise(r => { resolve = r; });
    const use = (el, w, h) => { media = el; mediaW = w; mediaH = h; mediaCam = false; mediaReady = true; dirty = true; };
    if (typeof src === "string") {
      if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(src)) {
        const v = document.createElement("video");
        Object.assign(v, { muted: true, loop: true, playsInline: true, crossOrigin: "anonymous", src });
        v.onloadeddata = () => { use(v, v.videoWidth, v.videoHeight); if (!still) v.play().catch(() => {}); };
      } else {
        const im = new Image(); im.crossOrigin = "anonymous";
        im.onload = () => use(im, im.naturalWidth, im.naturalHeight); im.src = src;
      }
    } else if (src) {
      const w = src.naturalWidth || src.videoWidth || src.width, h = src.naturalHeight || src.videoHeight || src.height;
      if (w) use(src, w, h); else src.addEventListener(src.tagName === "VIDEO" ? "loadeddata" : "load", () => use(src, src.naturalWidth || src.videoWidth, src.naturalHeight || src.videoHeight), { once: true });
    }
    if (S.text && document.fonts) document.fonts.load('800 100px "Unbounded"').finally(() => { dirty = true; });

    const loaded = () => mediaReady && svgs.cell.img && (S.light === "none" || svgs.light.img);
    let visible = true, running = false, stopped = false, last = 0, acc = 0, done = false;
    function loop(now) {
      if (stopped || !visible) { running = false; return; }
      const dt = Math.min(0.25, (now - last) / 1000 || 0); last = now;
      let drew = false;
      if (S.animate) {
        acc += dt; t += dt;
        const step = S.fpsUnlimited ? 0 : 1 / S.fps;
        if (acc >= step - 0.002) {
          acc = Math.min(acc - step, step); frame++;
          if (frame % S.flickerEvery === 0) reroll();
          render(); drew = true; dirty = false;
        }
      } else if (dirty || bursting() || mouse.back || trail.length > 1 || (dfm && dfm.s > 1.01) || (media && media.tagName === "VIDEO" && !media.paused)) { render(); drew = true; dirty = false; }
      if (drew && !done && loaded()) { done = true; resolve(lg); }
      requestAnimationFrame(loop);
    }
    const start = () => { if (!running && !stopped) { running = true; last = performance.now(); requestAnimationFrame(loop); } };
    // nothing is drawn while the canvas is off screen
    const io = "IntersectionObserver" in window ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }) : null;
    io?.observe(canvas);

    const lg = {
      ready,
      update(next) { S = { ...S, ...next }; if (still) S.animate = false; apply(); },
      bands(list) { bandSrc = list || []; buildLut(); dirty = true; },
      resize(next) { sizeOverride = next; apply(); },
      redraw() { dirty = true; },
      burst() { if (!still) { burstAt = performance.now(); dirty = true; } },
      press(down) { if (!still) { setPress(!!down); dirty = true; } },
      snapshot(type = "image/png", quality) { render(); return canvas.toDataURL(type, quality); },
      stop() {
        stopped = true; io?.disconnect();
        for (const [ev, fn] of on) pointer.removeEventListener(ev, fn);
        if (media && media.tagName === "VIDEO") media.pause();
      },
    };
    apply(); start();
    return lg;
  },
};
