// ---------- engine: the renderer, its frame loop and its pointer, one per canvas ----------
// Everything that used to be a global lives in this closure, so two canvases on one page are independent.
// Nothing here runs at import time: the browser is touched only inside createEngine.
import { DEFAULTS, FORMATS, LIGHT_SHAPES, svgText } from "./config";
import type { Band, LightInfo, LightState, LightTarget, LitgridOptions, MediaInput, PointerInfo, Settings, ShapeTarget } from "./types";

export interface EngineOptions extends LitgridOptions {
  /** Size the drawing from `settings.format` (the editor) instead of the canvas. */
  formatSize?: boolean;
  /** Override the reduced-motion preference (the editor lets the user animate anyway). */
  reducedMotion?: boolean;
  /** Hears how loading an SVG went. */
  onSvgReport?: (target: ShapeTarget, message: string) => void;
  /** Called on every animation frame the loop runs, after drawing (if it drew). */
  onFrame?: (now: number, drew: boolean) => void;
}

type Ctx = CanvasRenderingContext2D;
interface SvgSlot { img: HTMLImageElement | null; w: number; h: number; ver: number; stretch: boolean; src: string | null }
interface Deform { ang: number; s: number }
interface TrailPoint { x: number; y: number; at: number; d: Deform | null; a: [number, number] }
interface Lut { lut: Uint8Array; dim: Uint8Array; bg: string; light: boolean }
type Drawable = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

// the magnet options can also be passed next to `settings`
const MAGNET_KEYS = ["magnets", "magnetMode", "magnetReach", "magnetBorder", "magnetTime", "anchor"] as const;
const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const isLight = ([r, g, b]: number[]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;

export function createEngine(canvas: HTMLCanvasElement, opts: EngineOptions = {}) {
  const { media: src = null, size = null, pointer = canvas, formatSize = false } = opts;
  const cv = canvas, ctx = canvas.getContext("2d") as Ctx;
  let S: Settings = { ...DEFAULTS, ...opts.settings };
  for (const k of MAGNET_KEYS) if (opts[k] !== undefined) (S as any)[k] = opts[k];
  const still = opts.reducedMotion ?? (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (still) S.animate = false;
  const dpr = devicePixelRatio || 1;
  let sizeOverride: [number, number] | null = formatSize ? null : size || (canvas.clientWidth
    ? [Math.round(canvas.clientWidth * dpr), Math.round(canvas.clientHeight * dpr)]
    : [canvas.width, canvas.height]);

  // only the canvases read back with getImageData ask for a CPU backing; the rest stay on the GPU
  const mk = (read = false): [HTMLCanvasElement, Ctx] => { const c = document.createElement("canvas"); return [c, c.getContext("2d", read ? { willReadFrequently: true } : undefined) as Ctx]; };
  const [scene, sc] = mk(), [grid, gc] = mk(true), [cells, cc] = mk(), [dots, dc] = mk(), [b1, b1c] = mk(), [b2, b2c] = mk(), [b3, b3c] = mk();
  let bgRGB = [0, 0, 0];
  let W = 1920, H = 1080, cols = 0, rows = 0, noise = new Float32Array(0), frame = 0, t = 0;
  let media: Drawable | null = null, mediaW = 0, mediaH = 0, mediaCam = false;
  let dirty = true;
  // ---------- the light: where it is and who drives it ----------
  // the pointer in client pixels (cx, cy), and the light's smoothed follow position (x, y) in drawing pixels.
  // on: the pointer is on the page; seen: it has been, at least once
  const mouse = { cx: 0, cy: 0, x: 0, y: 0, on: false, seen: false };
  // where the light was drawn last, in drawing pixels, and the size and stretch it was drawn with
  const lit = { x: 0, y: 0, size: S.shapeSize, sx: S.stretchX, sy: S.stretchY };
  // light.set: the page drives the light; any field left out keeps its value
  let manual: { x: number; y: number; size: number | null; sx: number | null; sy: number | null } | null = null;
  // after light.release (or a magnet letting go without following), what was left out glides back from where it was
  let glide: { at: number; x: number; y: number; size: number | null; sx: number | null; sy: number | null } | null = null;
  const GLIDE_SECS = 0.8;
  function releasePointer() {
    if (!mouse.on) return;
    mouse.on = false;   // the light rests where the pointer left
    if (!byKeyboard) magnet = null;
    dirty = true;
  }
  function driftPos(): [number, number] {
    return [S.shapeX * W + S.drift * W * Math.sin(t * 2 * Math.PI / 7), S.shapeY * H + S.drift * H * 0.5 * Math.cos(t * 2 * Math.PI / 9)];
  }
  // client pixels to drawing pixels and back, through the canvas' rectangle on screen, so a canvas larger
  // than the viewport, offset by scroll or drawn at another resolution still lands where the pointer is
  const rect = () => canvas.getBoundingClientRect();
  const toDrawing = (x: number, y: number, b = rect()): [number, number] => [(x - b.left) / b.width * W, (y - b.top) / b.height * H];
  const toClient = (x: number, y: number, b = rect()): [number, number] => [b.left + x / W * b.width, b.top + y / H * b.height];

  // ---------- magnets and the anchor ----------
  // magnet: the element the pointer (or the keyboard focus) picked; holder: who holds the light this frame,
  // the magnet or, before the pointer is first seen, the anchor
  let magnet: Element | null = null, byKeyboard = false, lastMove: [number, number] | null = null;
  let holder: Element | null = null;
  const handlers = new Set<(el: Element | null) => void>();
  const magnetList = (): Element[] => {
    const m = S.magnets;
    if (!m) return [];
    if (typeof m === "string") { try { return [...document.querySelectorAll(m)]; } catch { return []; } }
    return [...m];
  };
  // the magnet an element belongs to (itself or the magnet around it)
  const magnetOf = (el: Element | null): Element | null => {
    if (!el || !S.magnets) return null;
    if (typeof S.magnets === "string") { try { return el.closest(S.magnets); } catch { return null; } }
    return [...S.magnets].find(m => m.contains(el)) || null;
  };
  const anchorEl = (): Element | null => {
    const a = S.anchor;
    if (!a) return null;
    if (typeof a === "string") { try { return document.querySelector(a); } catch { return null; } }
    return a;
  };
  // usable: in the page, not inside [inert] or [hidden], with a size; onScreen: some of it in the viewport
  const usable = (el: Element) => el.isConnected && !el.closest("[inert], [hidden]") && el.getBoundingClientRect().width > 0;
  const onScreen = (el: Element) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
  // distance from the pointer to the element's edge, in client pixels; 0 inside it
  const distance = (el: Element, px: number, py: number) => {
    const r = el.getBoundingClientRect();
    return r.width ? Math.hypot(Math.max(r.left - px, 0, px - r.right), Math.max(r.top - py, 0, py - r.bottom)) : Infinity;
  };
  // the nearest magnet within reach of its edge catches the light; to let go, the pointer has to move a bit
  // further than that (reach × 1.25 + 6), or the light would catch and drop at every pixel on the boundary
  function findMagnet() {
    if (!S.magnets || !mouse.on || byKeyboard || still) return;
    let near: Element | null = null, d = Infinity;
    for (const el of magnetList()) {
      if (el.closest("[inert], [hidden]")) continue;
      const de = distance(el, mouse.cx, mouse.cy); if (de < d) { d = de; near = el; }
    }
    let next = d <= S.magnetReach ? near : null;
    if (magnet) { const now = distance(magnet, mouse.cx, mouse.cy); if (now <= S.magnetReach * 1.25 + 6 && (!next || now <= d)) next = magnet; }
    if (next !== magnet) dirty = true;
    magnet = next;
  }
  // travel: a critically damped spring, in short sub-steps so a long frame cannot blow it up
  const vel = { x: 0, y: 0, r: 0, ex: 0, ey: 0 };
  function spring(from: number, to: number, v: keyof typeof vel, w: number, dt: number) {
    for (let n = Math.ceil(dt * w / 0.3), h = dt / n; n > 0; n--) { vel[v] += (w * w * (to - from) - 2 * w * vel[v]) * h; from += vel[v] * h; }
    return from;
  }
  // the held light's centre, and its radius and stretch while a magnet shapes it (drawing pixels);
  // shaping stays on after the release until they have sprung back to the settings
  let centre: { x: number; y: number } | null = null;
  const form = { r: 0, ex: 0, ey: 0, on: false };
  // wrapped round a magnet, a non-round light is drawn as the round one, so a stretched sparkle never shows as a cross
  let barred = false;
  const ROUND = "sphere";
  let springAt = 0;

  function lightState(): LightState {
    if (manual) return "manual";
    if (still || !S.animate) return "still";
    if (holder) return holder === magnet ? "held" : "anchored";
    if (S.followMouse && mouse.on) return "following";
    if (S.followMouse && !mouse.seen) return "waiting";
    return "resting";
  }
  // moves the light one frame: where it is, and the size and stretch it is drawn with
  function stepLight() {
    const now = performance.now(), dt = Math.min(0.1, (now - springAt) / 1000); springAt = now;
    const m = Math.min(W, H), b = rect(), kx = W / b.width, ky = H / b.height;
    // who holds the light: a magnet still usable and on screen, or the anchor until the pointer is first seen
    if (magnet && !(S.magnets && usable(magnet) && onScreen(magnet))) { magnet = null; byKeyboard = false; }
    const anchor = anchorEl(), anchoring = !mouse.seen && !!anchor && usable(anchor) && onScreen(anchor);
    const next = manual || still ? null : magnet || (anchoring ? anchor : null);
    if (next !== holder) {
      if (next && !holder) { centre = { x: lit.x, y: lit.y }; vel.x = vel.y = 0; }   // caught: it sets off from where it is
      if (!next && holder) {
        // let go: following picks up from where the light is; without following, it glides back to its place
        mouse.x = lit.x; mouse.y = lit.y;
        if (!S.followMouse) glide = { at: now, x: lit.x, y: lit.y, size: null, sx: null, sy: null };
      }
      holder = next;
      for (const fn of handlers) fn(holder);
    }
    const state = lightState();
    let x: number, y: number, size = S.shapeSize, sx = S.stretchX, sy = S.stretchY;
    if (manual) {
      ({ x, y } = manual);
      size = manual.size ?? size; sx = manual.sx ?? sx; sy = manual.sy ?? sy;
    } else if (holder) {
      const r = holder.getBoundingClientRect(), w = 6 / S.magnetTime;
      const [tx, ty] = toDrawing(r.left + r.width / 2, r.top + r.height / 2, b);
      centre!.x = spring(centre!.x, tx, "x", w, dt); centre!.y = spring(centre!.y, ty, "y", w, dt);
      x = centre!.x; y = centre!.y;
    } else if (state === "following" || (state === "still" && S.followMouse && mouse.on)) {
      const [tx, ty] = toDrawing(mouse.cx, mouse.cy, b);
      const k = S.animate ? 1 - S.smoothing : 1;
      mouse.x += (tx - mouse.x) * k; mouse.y += (ty - mouse.y) * k;
      x = mouse.x; y = mouse.y;
    } else if (S.followMouse && mouse.seen) { x = mouse.x; y = mouse.y; }   // resting where the pointer left
    else if (S.followMouse && anchor && !mouse.seen) {                      // waiting at the anchor, off screen
      const r = anchor.getBoundingClientRect();
      [x, y] = toDrawing(r.left + r.width / 2, r.top + r.height / 2, b);
    }
    else if (S.followMouse) { x = S.shapeX * W; y = S.shapeY * H; }      // waiting, without drifting
    else [x, y] = driftPos();

    // wrap: the radius is half the element's shorter side with the border, and the stretch is the rest of each side
    const wrap = !!holder && S.magnetMode === "wrap";
    if (wrap || form.on) {
      let target = { r: size * m, ex: sx * m, ey: sy * m };
      if (wrap) {
        const e = holder!.getBoundingClientRect(), bw = (e.width + S.magnetBorder) * kx, bh = (e.height + S.magnetBorder) * ky, r = Math.min(bw, bh) / 2;
        target = { r, ex: bw - 2 * r, ey: bh - 2 * r };
      }
      if (!form.on) { Object.assign(form, { r: lit.size * m, ex: lit.sx * m, ey: lit.sy * m, on: true }); vel.r = vel.ex = vel.ey = 0; }
      // let go: back to the light's own shape at once, with no stretch, or the stretched shape shows as a cross
      if (!wrap && barred && S.light !== ROUND) { form.ex = target.ex; form.ey = target.ey; vel.ex = vel.ey = 0; }
      const w = 6 / S.magnetTime;
      form.r = Math.max(0, spring(form.r, target.r, "r", w, dt));
      form.ex = Math.max(0, spring(form.ex, target.ex, "ex", w, dt));
      form.ey = Math.max(0, spring(form.ey, target.ey, "ey", w, dt));
      size = form.r / m; sx = form.ex / m; sy = form.ey / m;
      // settled back: the settings drive the shape again
      if (!wrap && Math.abs(form.r - target.r) + Math.abs(form.ex - target.ex) + Math.abs(form.ey - target.ey) < 0.5 && Math.abs(vel.r) + Math.abs(vel.ex) + Math.abs(vel.ey) < 1) form.on = false;
    }
    if (wrap !== barred) { barred = wrap; dirty = true; }
    if (glide) {
      const e = S.animate ? Math.min(1, (now - glide.at) / 1000 / GLIDE_SECS) : 1, s = e * e * (3 - 2 * e);
      if (!(S.followMouse && mouse.seen) && !holder) { x = glide.x + (x - glide.x) * s; y = glide.y + (y - glide.y) * s; }
      if (glide.size !== null) size = glide.size + (size - glide.size) * s;
      if (glide.sx !== null) sx = glide.sx + (sx - glide.sx) * s;
      if (glide.sy !== null) sy = glide.sy + (sy - glide.sy) * s;
      if (e >= 1) glide = null;
    }
    Object.assign(lit, { x, y, size, sx, sy });
  }
  // the light is moving on its own (a spring or a glide), so a paused loop still has to draw
  const moving = () => !!holder || form.on || !!glide;
  const slot = (): SvgSlot => ({ img: null, w: 1, h: 1, ver: 0, stretch: false, src: null });
  // bar: the round light a non-round one turns into while it wraps a magnet
  const svgs: Record<ShapeTarget | "bar", SvgSlot> = { light: slot(), cell: slot(), bar: slot() };
  const barSvg = () => S.svgMagnet || LIGHT_SHAPES[ROUND].svg;
  const asBar = () => barred && S.light !== ROUND;
  const [lightBuf, lb] = mk(), [lightSq, lq] = mk();
  // a stretched shape keeps its four quarters as corners and stretches the line through its middle (nine
  // slices), so a round light becomes a rounded bar with the same falloff. lightAspect is the stamp's width
  // and height over its unstretched size
  let lightAspect: [number, number] = [1, 1];
  // a single pulse the page asks for (a click, say): the shape swells and brightens once, then settles
  let burstAt = -1e9;
  function pulseLevel() {
    const p = (performance.now() - burstAt) / 1000 / S.burstSecs;
    if (p < 0 || p >= 1) return 0;
    return p < 0.25 ? Math.sin(Math.PI / 2 * p / 0.25) : 0.5 + 0.5 * Math.cos(Math.PI * (p - 0.25) / 0.75);
  }
  // a held press (a mouse button kept down): the shape swells in the pulse's first quarter and stays big
  // until the release, then settles in the other three quarters, from wherever it was
  const press = { down: false, at: -1e9, from: 0 };
  function pressLevel() {
    const q = (performance.now() - press.at) / 1000 / S.burstSecs;
    if (press.down) return press.from + (1 - press.from) * Math.sin(Math.PI / 2 * Math.min(1, q / 0.25));
    return q >= 0.75 ? 0 : press.from * (0.5 + 0.5 * Math.cos(Math.PI * q / 0.75));
  }
  function setPress(down: boolean) {
    if (down === press.down) return;
    press.from = pressLevel(); press.down = down; press.at = performance.now();
  }
  const burstLevel = () => Math.max(pulseLevel(), pressLevel());
  const bursting = () => performance.now() - burstAt < S.burstSecs * 1000 + 100 || performance.now() - press.at < S.burstSecs * 1000 + 100;
  const [maskBuf, mb] = mk(true);
  const maskCache = new Map<number, Uint8Array>(); let maskVer = -1;
  let cellImg: ImageData | null = null, dotImg: ImageData | null = null, cell32: Uint32Array | null = null, dot32: Uint32Array | null = null;
  function syncSvgs() {
    for (const target of ["light", "cell"] as const) { const txt = svgText(S, target); if (txt !== svgs[target].src) loadSvg(target, txt); }
    if (S.magnets || S.anchor || svgs.bar.src) { const txt = barSvg(); if (txt !== svgs.bar.src) loadSvg("bar", txt); }
  }

  function loadSvg(target: ShapeTarget | "bar", text: string) {
    const o = svgs[target], report = (m: string) => { if (target !== "bar") opts.onSvgReport?.(target, m); };
    o.src = text;
    let doc: Document | null = null;
    try { doc = new DOMParser().parseFromString(text || "", "image/svg+xml"); } catch {}
    const el = doc && doc.documentElement;
    if (!el || el.nodeName.toLowerCase() !== "svg" || doc!.querySelector("parsererror")) {
      report("That isn't a valid SVG. The code must start with <svg …> and end with </svg>.");
      return;
    }
    if (!el.getAttribute("xmlns")) el.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    let w = parseFloat(el.getAttribute("width") || ""), h = parseFloat(el.getAttribute("height") || "");
    const vb = (el.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    if (!(w > 0 && h > 0)) { if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { w = vb[2]; h = vb[3]; } else { w = h = 512; } }
    if (vb.length !== 4) el.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const k = 512 / Math.max(w, h); w *= k; h *= k;
    el.setAttribute("width", String(w)); el.setAttribute("height", String(h));
    const stretch = el.getAttribute("preserveAspectRatio") === "none";
    const im = new Image();
    im.onload = () => { if (o.src !== text) return; Object.assign(o, { img: im, w, h, stretch }); o.ver++; dirty = true; report("SVG applied."); };
    im.onerror = () => report("The browser couldn't draw that SVG. Remove images, fonts and external links and try again.");
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(el));
  }
  function fitSvg(g: Ctx, o: SvgSlot, bw: number, bh: number) {
    let w = bw, h = bh;
    if (!o.stretch) { const ar = o.w / o.h; if (ar > bw / bh) h = bw / ar; else w = bh * ar; }
    g.drawImage(o.img!, (bw - w) / 2, (bh - h) / 2, w, h);
  }
  function drawLight(x: number, y: number, r: number, glow = 1) {
    if (!prepLight(r)) return;
    stampLight(x, y, r, glow, dfm);
  }
  // the shape is rasterized once per frame; the trail stamps the same image many times
  function prepLight(r: number) {
    const bar = asBar() && svgs.bar.img, src = bar ? svgs.bar : svgs.light;
    if (!src.img) return false;
    const k = scene.width / W, half = Math.max(1, Math.ceil(r * k)), size = 2 * half + 1;   // odd: one column and row in the middle
    lightSq.width = size; lightSq.height = size;
    fitSvg(lq, src, size, size);
    if (!bar && S.svgMode === "silhouette") {
      lq.globalCompositeOperation = "source-in";
      const g = lq.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.6);
      g.addColorStop(0, "#fff"); g.addColorStop(1, "#6a6a6a");
      lq.fillStyle = g; lq.fillRect(0, 0, size, size);
    }
    const m = Math.min(W, H), ex = Math.round(Math.max(0, lit.sx) * m * k), ey = Math.round(Math.max(0, lit.sy) * m * k);
    const w = size + ex, h = size + ey;
    lightBuf.width = w; lightBuf.height = h;
    if (!ex && !ey) lb.drawImage(lightSq, 0, 0);
    else {
      // source and target columns: left quarter, the middle column stretched, right quarter (rows the same)
      const sx = [0, half, half + 1], sw = [half, 1, half], dx = [0, half, half + ex + 1], dw = [half, ex + 1, half];
      const dy = [0, half, half + ey + 1], dh = [half, ey + 1, half];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) lb.drawImage(lightSq, sx[i], sx[j], sw[i], sw[j], dx[i], dy[j], dw[i], dh[j]);
    }
    lightAspect = [w / size, h / size];
    return true;
  }
  // alpha above 1 stamps again on top ("lighter" adds), which is how a burst brightens the shape
  function stampLight(x: number, y: number, r: number, alpha = 1, d: Deform | null = null, [ax, ay] = lightAspect) {
    sc.save();
    sc.translate(x, y);
    if (d && d.s > 1.001) { sc.rotate(d.ang); sc.scale(d.s, 1 / d.s); sc.rotate(-d.ang); }   // stretch along the movement, keep the area
    sc.rotate(t * S.spin * 2 * Math.PI);
    for (let a = alpha; a > 0.001; a -= 1) { sc.globalAlpha = Math.min(1, a); sc.drawImage(lightBuf, -r * ax, -r * ay, 2 * r * ax, 2 * r * ay); }
    sc.restore();
  }
  // the cell SVG as an alpha mask, rasterized once per size and kept until the SVG changes
  function mask(w: number, h: number) {
    if (maskVer !== svgs.cell.ver) { maskCache.clear(); maskVer = svgs.cell.ver; }
    const key = w * 65536 + h;
    let m = maskCache.get(key);
    if (!m) {
      m = new Uint8Array(w * h).fill(255);
      if (svgs.cell.img) {
        maskBuf.width = w; maskBuf.height = h;
        fitSvg(mb, svgs.cell, w, h);
        const px = mb.getImageData(0, 0, w, h).data;
        for (let i = 0; i < m.length; i++) m[i] = px[i * 4 + 3];
      }
      maskCache.set(key, m);
    }
    return m;
  }
  // paints a cell straight into a pixel buffer (source-over, so the core of a hollow cell sits on its shell)
  function paint(px: Uint8ClampedArray, x: number, y: number, w: number, h: number, r: number, g: number, b: number) {
    if (w < 1 || h < 1) return;
    const m = mask(w, h), px32 = px === cellImg!.data ? cell32! : dot32!, solid = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;   // opaque pixels go in one 32-bit write (little-endian RGBA)
    const i0 = Math.max(0, -x), i1 = Math.min(w, W - x), j0 = Math.max(0, -y), j1 = Math.min(h, H - y);
    for (let j = j0; j < j1; j++) {
      let p = ((y + j) * W + x + i0) * 4, o = j * w + i0;
      for (let i = i0; i < i1; i++, p += 4, o++) {
        const a = m[o];
        if (!a) continue;
        if (a === 255) { px32[p >> 2] = solid; continue; }
        const da = px[p + 3];
        if (!da) { px[p] = r; px[p + 1] = g; px[p + 2] = b; px[p + 3] = a; continue; }
        const sa = a / 255, ba = (da / 255) * (1 - sa), oa = sa + ba;
        px[p] = (r * sa + px[p] * ba) / oa; px[p + 1] = (g * sa + px[p + 1] * ba) / oa; px[p + 2] = (b * sa + px[p + 2] * ba) / oa;
        px[p + 3] = oa * 255;
      }
    }
  }
  let lut: Uint8Array = new Uint8Array(768), lutDim: Uint8Array = new Uint8Array(768);   // rgb per luminance level, lit and core
  // horizontal bands with a palette of their own, for a page whose sections have different backgrounds:
  // bandSrc is [{ y, bg, c0…c4 }] with y in drawing pixels, top to bottom; above the first band, the main palette
  let bandSrc: Band[] = [], bandLuts: (Lut & { y: number })[] = [];

  function paletteLut(p: Palette6): Lut {
    const stops = [p.c0, p.c1, p.c2, p.c3, p.c4].map(hex), pos = [0, 0.3, 0.55, 0.8, 1], bg = hex(p.bg);
    const l = new Uint8Array(768), dim = new Uint8Array(768);
    for (let i = 0; i < 256; i++) {
      const v = i / 255; let j = 0; while (j < 3 && v > pos[j + 1]) j++;
      const f = (v - pos[j]) / (pos[j + 1] - pos[j]);
      const rgb = [0, 1, 2].map(n => Math.round(stops[j][n] + (stops[j + 1][n] - stops[j][n]) * f));
      for (let n = 0; n < 3; n++) {
        l[i * 3 + n] = rgb[n];
        dim[i * 3 + n] = Math.round(bg[n] + (rgb[n] - bg[n]) * S.core);   // the core pulls toward the background, on dark and on light
      }
    }
    return { lut: l, dim, bg: p.bg, light: isLight(bg) };
  }
  function buildLut() {
    ({ lut, dim: lutDim } = paletteLut(S));
    bandLuts = bandSrc.map(b => ({ y: b.y, ...paletteLut({ ...S, ...b }) }));
  }
  // the stretches of the drawing and the palette of each, the main one first
  function segments() {
    const main = { y: -Infinity, lut, dim: lutDim, bg: S.bg, light: isLight(hex(S.bg)) };
    const list = [main, ...bandLuts.filter(b => b.y < H)].sort((a, b) => a.y - b.y);
    return list.map((s, i) => ({ ...s, y: Math.max(0, s.y), end: i + 1 < list.length ? Math.max(0, list[i + 1].y) : H })).filter(s => s.end > s.y);
  }
  function sizeAll() {
    [W, H] = sizeOverride || (FORMATS[S.format] || FORMATS[DEFAULTS.format]).size;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    cols = Math.max(1, Math.floor(W / S.stepX)); rows = Math.max(1, Math.floor(H / S.stepY));
    scene.width = cols * 3; scene.height = rows * 3;
    grid.width = cols; grid.height = rows;
    cells.width = W; cells.height = H; dots.width = W; dots.height = H;
    b1.width = Math.ceil(W / 2); b1.height = Math.ceil(H / 2);
    b2.width = Math.ceil(W / 8); b2.height = Math.ceil(H / 8);
    b3.width = Math.ceil(W / 32); b3.height = Math.ceil(H / 32);
    if (!cellImg || cellImg.width !== W || cellImg.height !== H) {
      cellImg = new ImageData(W, H); dotImg = new ImageData(W, H);
      cell32 = new Uint32Array(cellImg.data.buffer); dot32 = new Uint32Array(dotImg.data.buffer);
    }
    if (noise.length !== cols * rows) { noise = new Float32Array(cols * rows); reroll(); }
  }
  function reroll() { for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1; }

  function drawScene() {
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = "source-over";
    sc.fillStyle = "#000"; sc.fillRect(0, 0, scene.width, scene.height);
    sc.setTransform(scene.width / W, 0, 0, scene.height / H, 0, 0);
    sc.imageSmoothingQuality = "high";
    // a canvas source can be resized after it was handed over (a page that redraws it to fit), so its size is read live
    if (media && media.tagName === "CANVAS") { mediaW = (media as HTMLCanvasElement).width; mediaH = (media as HTMLCanvasElement).height; }
    if (media && mediaW) {
      const s = Math.max(W / mediaW, H / mediaH), w = mediaW * s, h = mediaH * s;
      sc.save();
      if (mediaCam && S.mirror) { sc.translate(W, 0); sc.scale(-1, 1); }
      sc.drawImage(media, (W - w) / 2, (H - h) / 2, w, h);
      sc.restore();
    }
    const overlay = !media || S.overlay;
    sc.globalCompositeOperation = "lighter";
    if (S.ambient > 0) {
      const g = sc.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgba(255,255,255,${S.ambient})`); g.addColorStop(1, `rgba(255,255,255,${S.ambient * 0.3})`);
      sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    }
    if (overlay && S.light !== "none") {
      const b = burstLevel();
      const r = Math.max(1, lit.size * Math.min(W, H) * (1 + S.pulse * Math.sin(t * 2 * Math.PI / 2.4)) * (1 + S.burstSize * b));
      const { x, y } = lit;
      updateMotion(x, y);
      if (S.trail) drawTrail(x, y, r, 1 + S.burstGlow * b);   // any movement leaves a trail: the mouse, the drift or whatever moves the shape
      else { trail.length = 0; drawLight(x, y, r, 1 + S.burstGlow * b); }
    }
    if (overlay && S.text) {
      const size = S.textSize * Math.min(W, H), y = S.textY * H;
      sc.font = `800 ${size}px Unbounded, "Arial Black", sans-serif`;
      sc.textAlign = "center"; sc.textBaseline = "middle";
      const g = sc.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
      const lo = Math.round(255 * (1 - S.volume));
      g.addColorStop(0, "#fff"); g.addColorStop(1, `rgb(${lo},${lo},${lo})`);
      sc.fillStyle = g; sc.fillText(S.text, S.textX * W, y);
    }
    gc.imageSmoothingQuality = "high";
    gc.clearRect(0, 0, cols, rows);
    gc.drawImage(scene, 0, 0, cols, rows);
    return gc.getImageData(0, 0, cols, rows).data;
  }

  // each cell is the SVG silhouette in its color; a hollow cell is the same silhouette with the core shrunk inside it
  function render() {
    stepLight();
    const data = drawScene();
    const cpx = cellImg!.data, dpx = dotImg!.data;   // dim dots on their own layer: they stay out of the glow
    cell32!.fill(0); dot32!.fill(0);
    bgRGB = hex(S.bg);
    const px = S.stepX, py = S.stepY;
    const bw = Math.max(1, px - S.gapX), bh = Math.max(1, py - S.gapY);
    const ox = Math.floor((W - cols * px) / 2) + Math.floor(S.gapX / 2), oy = Math.floor((H - rows * py) / 2) + Math.floor(S.gapY / 2);
    const cw = Math.min(S.outline, Math.floor(bw / 2), Math.floor(bh / 2));
    const dot = Math.min(S.dot, bw, bh);
    const fromMedia = S.colorSource === "media";
    const segs = segments();
    let seg = 0, lut = segs[0].lut, lutDim = segs[0].dim;
    for (let r = 0; r < rows; r++) {
      const mid = oy + r * py + bh / 2;   // a row takes the palette of the band its middle falls in
      while (seg + 1 < segs.length && mid >= segs[seg + 1].y) { seg++; lut = segs[seg].lut; lutDim = segs[seg].dim; }
      for (let k = 0; k < cols; k++) {
        const i = r * cols + k, d = i * 4;
        const R = data[d], G = data[d + 1], B = data[d + 2];
        let v = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
        v = Math.pow(v, S.contrast) * (1 + noise[i] * S.flicker);
        v = v < 0 ? 0 : v > 1 ? 1 : v;
        const li = (v * 255) | 0;
        let cr, cg, cb;
        if (fromMedia) {
          const m = Math.max(R, G, B) || 1, f = 0.6 + Math.min(2.2, 255 / m) * 0.55 + 0.45 * v;
          cr = Math.min(255, Math.round(R * f)); cg = Math.min(255, Math.round(G * f)); cb = Math.min(255, Math.round(B * f));
        } else { cr = lut[li * 3]; cg = lut[li * 3 + 1]; cb = lut[li * 3 + 2]; }
        const x = ox + k * px, y = oy + r * py;
        if (S.mode === "solid") { paint(cpx, x, y, bw, bh, cr, cg, cb); continue; }
        if (S.mode === "variable") {
          const w = Math.round(bw * v), h = Math.round(bh * v);
          paint(cpx, x + ((bw - w) >> 1), y + ((bh - h) >> 1), w, h, cr, cg, cb); continue;
        }
        if (v < S.offBelow) {
          if (dot >= 1) paint(dpx, x + ((bw - dot) >> 1), y + ((bh - dot) >> 1), dot, dot, cr, cg, cb);
        } else if (v < S.hollowAbove || cw < 1) {
          paint(cpx, x, y, bw, bh, cr, cg, cb);
        } else {
          paint(cpx, x, y, bw, bh, cr, cg, cb);
          let dr, dg, db;
          if (fromMedia) {
            dr = Math.round(bgRGB[0] + (cr - bgRGB[0]) * S.core); dg = Math.round(bgRGB[1] + (cg - bgRGB[1]) * S.core); db = Math.round(bgRGB[2] + (cb - bgRGB[2]) * S.core);
          } else { dr = lutDim[li * 3]; dg = lutDim[li * 3 + 1]; db = lutDim[li * 3 + 2]; }
          paint(cpx, x + cw, y + cw, bw - 2 * cw, bh - 2 * cw, dr, dg, db);
        }
      }
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    cc.putImageData(cellImg!, 0, 0); dc.putImageData(dotImg!, 0, 0);
    for (const s of segs) { ctx.fillStyle = s.bg; ctx.fillRect(0, s.y, W, s.end - s.y); }
    ctx.drawImage(dots, 0, 0);
    ctx.drawImage(cells, 0, 0);
    if (S.bloom > 0 || S.bloomWide > 0) {
      for (const c of [b1c, b2c, b3c]) { c.imageSmoothingQuality = "high"; }
      b1c.clearRect(0, 0, b1.width, b1.height); b1c.drawImage(cells, 0, 0, b1.width, b1.height);
      b2c.clearRect(0, 0, b2.width, b2.height); b2c.drawImage(b1, 0, 0, b2.width, b2.height);
      b3c.clearRect(0, 0, b3.width, b3.height); b3c.drawImage(b2, 0, 0, b3.width, b3.height);
      ctx.imageSmoothingQuality = "high";
      for (const s of segs) {   // the glow darkens on a light background and lights up on a dark one, band by band
        ctx.save();
        if (segs.length > 1) { ctx.beginPath(); ctx.rect(0, s.y, W, s.end - s.y); ctx.clip(); }
        ctx.globalCompositeOperation = s.light ? "multiply" : "lighter";
        let a = S.bloom; while (a > 0) { ctx.globalAlpha = Math.min(1, a); ctx.drawImage(b2, 0, 0, W, H); a -= 1; }
        a = S.bloomWide; while (a > 0) { ctx.globalAlpha = Math.min(1, a); ctx.drawImage(b3, 0, 0, W, H); a -= 1; }
        ctx.restore();
      }
    }
    if (S.scanlines > 0) {
      ctx.fillStyle = `rgba(0,0,0,${S.scanlines})`;
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    }
  }

  // ---------- deformation ----------
  // smoothed velocity of the shape (mouse, drift or whatever moves it); becomes a stretch along the movement
  const motion = { px: null as number | null, py: null as number | null, at: 0, vx: 0, vy: 0 };
  let dfm: Deform | null = null;
  function updateMotion(x: number, y: number) {
    const now = performance.now() / 1000, dt = now - motion.at;
    if (motion.px === null || dt > 0.5) { motion.vx = motion.vy = 0; }
    else if (dt > 0) {
      const k = 1 - Math.exp(-dt * 12);
      motion.vx += ((x - motion.px) / dt - motion.vx) * k; motion.vy += ((y - motion.py!) / dt - motion.vy) * k;
    }
    motion.px = x; motion.py = y; motion.at = now;
    if (!S.deform) { dfm = null; return; }
    const speed = Math.hypot(motion.vx, motion.vy) / W;   // screen widths per second
    dfm = { ang: Math.atan2(motion.vy, motion.vx), s: 1 + Math.min(S.deformMax - 1, S.deformAmount * speed * 0.8) };
  }

  // ---------- trail ----------
  // points the shape went through, spaced by distance (a still mouse doesn't pile up) and filled in
  // between frames so the tail comes out continuous. With "lighter" the stamps add up, so each one
  // only carries the share of brightness that fits the overlap.
  const trail: TrailPoint[] = [];
  function drawTrail(x: number, y: number, r: number, glow = 1) {
    const now = performance.now() / 1000, dur = S.trailDur, gap = Math.max(2, r * S.trailSpacing);
    const lastP = trail[trail.length - 1];
    if (!lastP) trail.push({ x, y, at: now, d: dfm, a: lightAspect });
    else {
      const d = Math.hypot(x - lastP.x, y - lastP.y), n = Math.min(60, Math.floor(d / gap));
      for (let i = 1; i <= n; i++) {
        const f = i / n;
        trail.push({ x: lastP.x + (x - lastP.x) * f, y: lastP.y + (y - lastP.y) * f, at: lastP.at + (now - lastP.at) * f, d: dfm, a: lightAspect });
      }
    }
    while (trail.length && now - trail[0].at > dur) trail.shift();
    if (trail.length > 600) trail.splice(0, trail.length - 600);
    if (!prepLight(r)) return;
    const k = S.trailStrength * Math.min(1, gap / (2 * r));   // separate stamps don't add up: each carries the full strength
    for (let i = 0; i < trail.length - 1; i++) {
      const p = trail[i], a = 1 - (now - p.at) / dur;
      if (a <= 0) continue;
      stampLight(p.x, p.y, r * (1 - S.trailTaper * (1 - a)), Math.min(1, k * a * a), p.d, p.a);   // each one as stretched as the shape was there
    }
    stampLight(x, y, r, glow, dfm);
  }

  // ---------- pointer ----------
  // the page keeps scrolling under a finger: vertical swipes scroll, a tap or a sideways drag moves the light
  const listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];
  const listen = (target: EventTarget, ev: string, fn: (e: any) => void, o?: AddEventListenerOptions) => { target.addEventListener(ev, fn, o); listeners.push([target, ev, fn, o]); };
  const move = (e: PointerEvent) => {
    if (still) return;
    mouse.cx = e.clientX; mouse.cy = e.clientY;
    // coming onto the page, the light sets off from where it is: no jump
    if (!mouse.on) { mouse.x = lit.x; mouse.y = lit.y; mouse.on = mouse.seen = true; }
    // a pointer that really moves takes control back from the keyboard (a scroll under a still mouse doesn't)
    if (!lastMove || e.clientX !== lastMove[0] || e.clientY !== lastMove[1]) byKeyboard = false;
    lastMove = [e.clientX, e.clientY];
    findMagnet();
    if (S.followMouse || S.magnets) dirty = true;
  };
  listen(pointer, "pointermove", move);
  listen(pointer, "pointerdown", move);
  listen(pointer, "pointerleave", releasePointer);
  listen(pointer, "pointercancel", releasePointer);
  if (pointer !== canvas) listen(pointer, "pointerout", (e: PointerEvent) => { if (!e.relatedTarget) releasePointer(); });   // left the window
  // scrolling brings magnets to a still pointer; keyboard focus on a magnet holds the light
  if (typeof window !== "undefined") {
    listen(window, "scroll", () => findMagnet(), { passive: true });
    listen(window, "focusin", (e: FocusEvent) => {
      if (still || !S.magnets) return;
      let fv = false; try { fv = (e.target as Element).matches(":focus-visible"); } catch {}
      if (!fv) return;
      magnet = magnetOf(e.target as Element); byKeyboard = !!magnet; dirty = true;
    });
    listen(window, "focusout", (e: FocusEvent) => { if (magnet && magnet === magnetOf(e.target as Element)) { magnet = null; dirty = true; } });
  }

  // ---------- media ----------
  let mediaReady = !src;
  let resolveReady!: () => void;
  const readyP = new Promise<void>(r => { resolveReady = r; });
  function setMedia(el: Drawable | null, w = 0, h = 0, cam = false) {
    media = el; mediaW = w; mediaH = h; mediaCam = cam; mediaReady = true; dirty = true;
  }
  if (typeof src === "string") {
    if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(src)) {
      const v = document.createElement("video");
      Object.assign(v, { muted: true, loop: true, playsInline: true, crossOrigin: "anonymous", src });
      v.onloadeddata = () => { setMedia(v, v.videoWidth, v.videoHeight); if (!still) v.play().catch(() => {}); };
    } else {
      const im = new Image(); im.crossOrigin = "anonymous";
      im.onload = () => setMedia(im, im.naturalWidth, im.naturalHeight); im.src = src;
    }
  } else if (src) {
    const el = src as any;
    const w = el.naturalWidth || el.videoWidth || el.width, h = el.naturalHeight || el.videoHeight || el.height;
    if (w) setMedia(src, w, h);
    else listen(src, src.tagName === "VIDEO" ? "loadeddata" : "load", () => setMedia(src, el.naturalWidth || el.videoWidth, el.naturalHeight || el.videoHeight), { once: true });
  }
  if (S.text && document.fonts) document.fonts.load('800 100px "Unbounded"').finally(() => { dirty = true; });

  // ---------- loop ----------
  const loaded = () => mediaReady && svgs.cell.img && (S.light === "none" || svgs.light.img);
  let visible = true, running = false, stopped = false, last = 0, acc = 0, done = false, raf = 0;
  function loop(now: number) {
    raf = 0;
    if (stopped || !visible) { running = false; return; }
    const dt = Math.min(0.25, (now - last) / 1000 || 0); last = now;
    let drew = false;
    if (S.animate) {
      acc += dt; t += dt;
      const step = S.fpsUnlimited ? 0 : 1 / S.fps;
      if (acc >= step - 0.002) {   // keep the remainder, so the cap is reached on any refresh rate
        acc = Math.min(acc - step, step); frame++;
        if (frame % S.flickerEvery === 0) reroll();
        render(); drew = true; dirty = false;
      }
    } else if (dirty || bursting() || moving() || trail.length > 1 || (dfm && dfm.s > 1.01) || (media && media.tagName === "VIDEO" && !(media as HTMLVideoElement).paused)) { render(); drew = true; dirty = false; }
    if (drew && !done && loaded()) { done = true; resolveReady(); }
    opts.onFrame?.(now, drew);
    raf = requestAnimationFrame(loop);
  }
  const start = () => { if (!running && !stopped) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); } };
  // nothing is drawn while the canvas is off screen
  const io = typeof IntersectionObserver === "function" ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }) : null;
  io?.observe(canvas);

  function apply() {
    sizeAll(); buildLut(); syncSvgs(); dirty = true;
    if (pointer === canvas) canvas.style.touchAction = S.followMouse ? "pan-y" : "";
  }
  apply(); start();

  return {
    ready: readyP,
    still,
    /** The current settings (a copy). */
    settings: (): Settings => ({ ...S }),
    update(next: Partial<Settings>) {
      if ("magnets" in next && next.magnets !== S.magnets) magnet = null;
      S = { ...S, ...next }; if (still) S.animate = false; apply();
    },
    /** Hears when the element holding the light changes (a magnet, the anchor, or null). */
    on(type: "magnet", fn: (el: Element | null) => void) {
      if (type !== "magnet") return () => {};
      handlers.add(fn);
      return () => { handlers.delete(fn); };
    },
    bands(list: Band[] | null) { bandSrc = list || []; buildLut(); dirty = true; },
    resize(next: [number, number]) { sizeOverride = next; apply(); },
    redraw() { dirty = true; },
    burst() { if (!still) { burstAt = performance.now(); dirty = true; } },
    press(down: boolean) { if (!still) { setPress(!!down); dirty = true; } },
    render,
    snapshot(type = "image/png", quality?: number) { render(); return canvas.toDataURL(type, quality); },
    setMedia,
    info: () => ({ width: W, height: H, cols, rows }),
    light: {
      get(): LightInfo {
        const [x, y] = toClient(lit.x, lit.y);
        return { state: lightState(), x, y, element: holder, size: lit.size, stretchX: lit.sx, stretchY: lit.sy };
      },
      set(p: LightTarget = {}) {
        if (still) return;   // with reduced motion the light doesn't move
        const b = rect(), cur = manual ?? { x: lit.x, y: lit.y, size: null, sx: null, sy: null };
        let { x, y } = cur;
        if (p.x != null || p.y != null) {
          const [cx, cy] = toClient(cur.x, cur.y, b);
          [x, y] = toDrawing(p.x ?? cx, p.y ?? cy, b);
        }
        manual = { x, y, size: p.size ?? cur.size, sx: p.stretchX ?? cur.sx, sy: p.stretchY ?? cur.sy };
        glide = null; dirty = true;
      },
      release() {
        if (!manual) return;
        // following picks up from where the light is; the rest glides back to the settings
        glide = { at: performance.now(), x: lit.x, y: lit.y, size: lit.size, sx: lit.sx, sy: lit.sy };
        mouse.x = lit.x; mouse.y = lit.y;
        if (S.followMouse) mouse.seen = true;
        manual = null; dirty = true;
      },
    },
    pointer: (): PointerInfo => ({ x: mouse.cx, y: mouse.cy, on: mouse.on }),
    destroy() {
      stopped = true; running = false; io?.disconnect();
      if (raf) cancelAnimationFrame(raf); raf = 0;
      for (const [target, ev, fn, o] of listeners) target.removeEventListener(ev, fn, o);
      listeners.length = 0; handlers.clear();
      if (media && media.tagName === "VIDEO") (media as HTMLVideoElement).pause();
    },
  };
}
export type Engine = ReturnType<typeof createEngine>;
type Palette6 = Pick<Settings, "bg" | "c0" | "c1" | "c2" | "c3" | "c4">;
export type { MediaInput };
