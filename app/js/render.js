// ---------- render ----------
// the app draws on #stage; the embed points cv and ctx at its own canvas
let cv = document.getElementById("stage"), ctx = cv && cv.getContext("2d");
// only the canvases read back with getImageData ask for a CPU backing; the rest stay on the GPU
const mk = (read = false) => { const c = document.createElement("canvas"); return [c, c.getContext("2d", read ? { willReadFrequently: true } : undefined)]; };
const [scene, sc] = mk(), [grid, gc] = mk(true), [cells, cc] = mk(), [dots, dc] = mk(), [b1, b1c] = mk(), [b2, b2c] = mk(), [b3, b3c] = mk();
let bgRGB = [0, 0, 0];
let W = 1920, H = 1080, cols = 0, rows = 0, noise = new Float32Array(0), frame = 0, t = 0;
let sizeOverride = null;   // [w, h] that replaces the format's size (the embed sets it)
let media = null, mediaW = 0, mediaH = 0, mediaCam = false, stream = null;
// on: the pointer is over the stage; back: it left, and the shape glides from where it was (fx, fy) to its drift
const mouse = { x: 0, y: 0, tx: 0, ty: 0, on: false, back: false, fx: 0, fy: 0, at: 0 };
const BACK_SECS = 0.8;
function releasePointer() {
  if (!mouse.on) return;
  Object.assign(mouse, { on: false, back: true, fx: mouse.x, fy: mouse.y, at: performance.now() });
  dirty = true;
}
const following = () => S.followMouse && (mouse.on || mouse.back);
function driftPos() {
  return [S.shapeX * W + S.drift * W * Math.sin(t * 2 * Math.PI / 7), S.shapeY * H + S.drift * H * 0.5 * Math.cos(t * 2 * Math.PI / 9)];
}
const svgs = { light: { img: null, w: 1, h: 1, ver: 0, stretch: false, src: null }, cell: { img: null, w: 1, h: 1, ver: 0, stretch: false, src: null } };
const [lightBuf, lb] = mk(), [lightSq, lq] = mk();
// a stretched shape keeps its four quarters as corners and stretches the line through its middle (nine
// slices), so a round light becomes a rounded bar with the same falloff. lightAspect is the stamp's width
// and height over its unstretched size
let lightAspect = [1, 1];
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
function setPress(down) {
  if (down === press.down) return;
  press.from = pressLevel(); press.down = down; press.at = performance.now();
}
const burstLevel = () => Math.max(pulseLevel(), pressLevel());
const bursting = () => performance.now() - burstAt < S.burstSecs * 1000 + 100 || performance.now() - press.at < S.burstSecs * 1000 + 100;
const [maskBuf, mb] = mk(true);
const maskCache = new Map(); let maskVer = -1;
let cellImg = null, dotImg = null, cell32 = null, dot32 = null;
function syncSvgs() { for (const target of ["light", "cell"]) { const txt = svgText(target); if (txt !== svgs[target].src) loadSvg(target, txt); } }

function loadSvg(target, text) {
  const o = svgs[target], report = reports[target]; reports[target] = null;
  o.src = text;
  let doc = null;
  try { doc = new DOMParser().parseFromString(text || "", "image/svg+xml"); } catch {}
  const el = doc && doc.documentElement;
  if (!el || el.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
    report?.("That isn't a valid SVG. The code must start with <svg …> and end with </svg>.");
    return;
  }
  if (!el.getAttribute("xmlns")) el.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  let w = parseFloat(el.getAttribute("width")), h = parseFloat(el.getAttribute("height"));
  const vb = (el.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  if (!(w > 0 && h > 0)) { if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { w = vb[2]; h = vb[3]; } else { w = h = 512; } }
  if (vb.length !== 4) el.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const k = 512 / Math.max(w, h); w *= k; h *= k;
  el.setAttribute("width", w); el.setAttribute("height", h);
  const stretch = el.getAttribute("preserveAspectRatio") === "none";
  const im = new Image();
  im.onload = () => { if (o.src !== text) return; Object.assign(o, { img: im, w, h, stretch }); o.ver++; dirty = true; report?.("SVG applied."); };
  im.onerror = () => report?.("The browser couldn't draw that SVG. Remove images, fonts and external links and try again.");
  im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(el));
}
function fitSvg(g, o, bw, bh) {
  let w = bw, h = bh;
  if (!o.stretch) { const ar = o.w / o.h; if (ar > bw / bh) h = bw / ar; else w = bh * ar; }
  g.drawImage(o.img, (bw - w) / 2, (bh - h) / 2, w, h);
}
function drawLight(x, y, r, glow = 1) {
  if (!prepLight(r)) return;
  stampLight(x, y, r, glow, dfm);
}
// the shape is rasterized once per frame; the trail stamps the same image many times
function prepLight(r) {
  if (!svgs.light.img) return false;
  const k = scene.width / W, half = Math.max(1, Math.ceil(r * k)), size = 2 * half + 1;   // odd: one column and row in the middle
  lightSq.width = size; lightSq.height = size;
  fitSvg(lq, svgs.light, size, size);
  if (S.svgMode === "silhouette") {
    lq.globalCompositeOperation = "source-in";
    const g = lq.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.6);
    g.addColorStop(0, "#fff"); g.addColorStop(1, "#6a6a6a");
    lq.fillStyle = g; lq.fillRect(0, 0, size, size);
  }
  const m = Math.min(W, H), ex = Math.round(Math.max(0, S.stretchX) * m * k), ey = Math.round(Math.max(0, S.stretchY) * m * k);
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
function stampLight(x, y, r, alpha = 1, d = null, [ax, ay] = lightAspect) {
  sc.save();
  sc.translate(x, y);
  if (d && d.s > 1.001) { sc.rotate(d.ang); sc.scale(d.s, 1 / d.s); sc.rotate(-d.ang); }   // stretch along the movement, keep the area
  sc.rotate(t * S.spin * 2 * Math.PI);
  for (let a = alpha; a > 0.001; a -= 1) { sc.globalAlpha = Math.min(1, a); sc.drawImage(lightBuf, -r * ax, -r * ay, 2 * r * ax, 2 * r * ay); }
  sc.restore();
}
// the cell SVG as an alpha mask, rasterized once per size and kept until the SVG changes
function mask(w, h) {
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
function paint(px, x, y, w, h, r, g, b) {
  if (w < 1 || h < 1) return;
  const m = mask(w, h), px32 = px === cellImg.data ? cell32 : dot32, solid = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;   // opaque pixels go in one 32-bit write (little-endian RGBA)
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
let lut = new Uint8Array(768), lutDim = new Uint8Array(768);   // rgb per luminance level, lit and core
// horizontal bands with a palette of their own, for a page whose sections have different backgrounds:
// bandSrc is [{ y, bg, c0…c4 }] with y in drawing pixels, top to bottom; above the first band, the main palette
let bandSrc = [], bands = [];

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const isLight = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
function paletteLut(p) {
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
  bands = bandSrc.map(b => ({ y: b.y, ...paletteLut({ ...S, ...b }) }));
}
// the stretches of the drawing and the palette of each, the main one first
function segments() {
  const main = { y: -Infinity, lut, dim: lutDim, bg: S.bg, light: isLight(hex(S.bg)) };
  const list = [main, ...bands.filter(b => b.y < H)].sort((a, b) => a.y - b.y);
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
    const r = Math.max(1, S.shapeSize * Math.min(W, H) * (1 + S.pulse * Math.sin(t * 2 * Math.PI / 2.4)) * (1 + S.burstSize * b));
    let x, y;
    if (following()) { x = mouse.x; y = mouse.y; }
    else [x, y] = driftPos();
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
  if (S.followMouse && mouse.back) {
    // a fixed-length glide: chasing the moving drift with the follow delay would always lag behind it
    const e = S.animate ? Math.min(1, (performance.now() - mouse.at) / 1000 / BACK_SECS) : 1, s = e * e * (3 - 2 * e);
    const [dx, dy] = driftPos();
    mouse.x = mouse.fx + (dx - mouse.fx) * s; mouse.y = mouse.fy + (dy - mouse.fy) * s;
    if (e >= 1) mouse.back = false;
  } else if (following()) {
    const k = S.animate ? 1 - S.smoothing : 1;
    mouse.x += (mouse.tx - mouse.x) * k; mouse.y += (mouse.ty - mouse.y) * k;
  }
  const data = drawScene();
  const cpx = cellImg.data, dpx = dotImg.data;   // dim dots on their own layer: they stay out of the glow
  cell32.fill(0); dot32.fill(0);
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
  cc.putImageData(cellImg, 0, 0); dc.putImageData(dotImg, 0, 0);
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
const motion = { px: null, py: null, at: 0, vx: 0, vy: 0 };
let dfm = null;
function updateMotion(x, y) {
  const now = performance.now() / 1000, dt = now - motion.at;
  if (motion.px === null || dt > 0.5) { motion.vx = motion.vy = 0; }
  else if (dt > 0) {
    const k = 1 - Math.exp(-dt * 12);
    motion.vx += ((x - motion.px) / dt - motion.vx) * k; motion.vy += ((y - motion.py) / dt - motion.vy) * k;
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
const trail = [];
function drawTrail(x, y, r, glow = 1) {
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
