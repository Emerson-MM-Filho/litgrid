// renders every README image from the built package (dist/) in headless Chromium: `npm run docs:media`.
// The page's time only moves when this script says and Math.random is seeded, so the same code gives the same files.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { inflateSync } from "node:zlib";
import { CELL_SHAPES, LIGHT_SHAPES, PRESETS } from "../dist/litgrid.js";
import { encodeGif, packFrame } from "../app/src/export.js";
import { ANIMATIONS, MEDIA_DIR, budgetOf, stillFile } from "./media-names.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const ORIGIN = "http://litgrid.media";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const STILL = [640, 360];   // catalog stills, in drawing pixels: shown 320 px wide in the README, so sharp on a 2x display
// the GIFs, in CSS pixels: the hero and the click are wider than 16:9, a banner across the README's column. Their frames are taken
// at GIF_SCALE screenshot pixels per CSS pixel (960 wide, so they stay sharp shown at the column's full width) from
// a drawing at DRAW times the CSS size, the grid's density in the editor on a 2x display
const HERO = [640, 320], MAGNET = [640, 360];
const GIF_SCALE = 1.5, DRAW = 2;
// in the encoder's delta mode, colors this close (per channel, of 255) count as unchanged: faint flicker and slow
// glows no longer redraw most of the frame, which more than halves the files
const TOLERANCE = 8;
const FPS = 12.5;           // 80 ms a frame: a whole number of the GIF's hundredths of a second
const HERO_FPS = 10;        // the hero is about 8 s long: at 100 ms a frame it stays well within its budget

const written = [];
function save(name, bytes) {
  writeFileSync(join(MEDIA_DIR, name), bytes);
  written.push(name);
}

// ---------- the page: the repository served from a fake origin ----------
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
// scale: screenshot pixels per CSS pixel
async function openPage(scale = 1) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: scale, reducedMotion: "no-preference" });
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = join(ROOT, new URL(route.request().url()).pathname);
    try { route.fulfill({ body: readFileSync(path), contentType: TYPES[extname(path)] || "application/octet-stream" }); }
    catch { route.fulfill({ status: 404, body: "not found" }); }
  });
  await page.goto(`${ORIGIN}/scripts/docs-media.html`);
  await page.waitForFunction(() => window.loaded, null, { polling: 100 });   // the page's own requestAnimationFrame is stopped
  return page;
}
const advance = (page, ms) => page.evaluate((ms) => window.advance(ms), ms);
// starts an instance and moves it to its first frame
async function mount(page, size, scale, settings, options) {
  await page.evaluate(([w, h, k, s, o]) => window.mount(w, h, k, s, o), [...size, scale, settings, options]);
  // the SVGs decode in real time, so they get it before the clock moves: then the first frame is always the
  // ready one, and every run starts from the same frame count, time and random draws
  await new Promise((r) => setTimeout(r, 500));
  await advance(page, 16);
  if (!(await page.evaluate(() => window.isReady))) throw new Error("the SVGs were not loaded before the first frame, so the output would not be reproducible");
}

// ---------- stills: one per preset, light shape and cell shape ----------
async function still(page, name, settings) {
  await mount(page, STILL, 1, { ...settings, animate: false });
  // lossless WebP (quality 1): the same pixels as a PNG in about half the bytes
  const url = await page.evaluate(() => window.lg.snapshot("image/webp", 1));
  save(name, Buffer.from(url.split(",")[1], "base64"));
}

// ---------- GIFs: frames from screenshots of the stage, encoded with the editor's GIF encoder ----------
// a screenshot is a PNG: 8-bit RGB or RGBA, not interlaced, which is all this has to read
function decodePng(buf) {
  let i = 8, w = 0, h = 0, ch = 0;
  const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString("ascii", i + 4, i + 8), data = buf.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error("unexpected PNG format");
      ch = { 2: 3, 6: 4 }[data[9]];
    } else if (type === "IDAT") idat.push(data);
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch, out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      cur[x] = (line[x] + pred) & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) out[(y * w + x) * 4 + k] = k < ch ? cur[x * ch + k] : 255;
    prev = cur;
  }
  return { w, h, data: out };
}
// path(f) puts the pointer or the light where frame f wants it; the first `warm` frames are not kept,
// so the trail is already there when the loop starts
async function record(page, name, frames, warm, path, fps = FPS) {   // fps: frames per second
  const hist = new Uint32Array(32768), sums = new Float64Array(32768 * 3), kept = [], times = [];
  let w = 0, h = 0;
  for (let f = -warm; f < frames; f++) {
    await path(((f % frames) + frames) % frames);
    await advance(page, 1000 / fps);
    if (f < 0) continue;
    const shot = decodePng(await page.locator("#stage").screenshot({ animations: "allow", caret: "initial" }));
    w = shot.w; h = shot.h;
    kept.push(packFrame(shot.data, hist, sums)); times.push(f * 1000 / fps);
  }
  times.push(frames * 1000 / fps);
  // delta: each frame keeps only what changed, which is most of what keeps a long GIF within its budget
  save(name, await encodeGif(kept, times, w, h, hist, sums, () => {}, { delta: true, tolerance: TOLERANCE }));
}

rmSync(MEDIA_DIR, { recursive: true, force: true });
mkdirSync(MEDIA_DIR, { recursive: true });
const page = await openPage();

// the stills light up a sphere in its own tones: one light that runs through every level of the palette
const SPHERE = { text: "", light: "sphere", svgMode: "tones", shapeX: 0.5, shapeY: 0.5, shapeSize: 0.3 };
// each palette
for (const [key, p] of Object.entries(PRESETS)) await still(page, stillFile("preset", key), { ...SPHERE, ...p });
// each light shape, in the mode the editor picks for it
for (const [key, s] of Object.entries(LIGHT_SHAPES)) await still(page, stillFile("light", key), { ...SPHERE, light: key, svgMode: s.mode });
// each cell shape on a coarser grid, so the shape of one cell can be seen
for (const key of Object.keys(CELL_SHAPES)) await still(page, stillFile("cell", key), { ...SPHERE, cellShape: key, stepX: 20, stepY: 20, gapX: 4, gapY: 4, outline: 3, dot: 5 });

// ---------- the GIFs ----------
const gifPage = await openPage(GIF_SCALE);
// the word in the middle of the frame: the default textX (0.36) leaves room for the light on the right in the
// editor's 16:9 layout, but in a banner the word reads better centred, with the buttons' row centred below it
const CENTRE = 0.5;
const ease = (x) => x * x * (3 - 2 * x);
// a pointer path from stops ([x, y], seconds to get there, seconds to stay), eased between them: where(sec),
// its length and when it arrives at each stop
function glide(from, stops) {
  const keys = [[0, from]], arrivals = [];
  let t = 0;
  for (const [p, go, stay] of stops) { t += go; keys.push([t, p]); arrivals.push(t); t += stay; keys.push([t, p]); }
  const where = (sec) => {
    for (let k = 1; k < keys.length; k++) {
      const [t0, p0] = keys[k - 1], [t1, p1] = keys[k];
      if (sec <= t1) { const e = t1 > t0 ? ease((sec - t0) / (t1 - t0)) : 1; return [p0[0] + (p1[0] - p0[0]) * e, p0[1] + (p1[1] - p0[1]) * e]; }
    }
    return keys[keys.length - 1][1];
  };
  return { where, secs: t, arrivals };
}
const centre = async (page, sel) => { const r = await page.evaluate((s) => window.rect(s), sel); return [r.x + r.w / 2, r.y + r.h / 2]; };
// the mouse, and the click ring with it
async function move(page, xy) {
  await page.mouse.move(...xy);
  await page.evaluate(([x, y]) => window.pointerAt(x, y), xy);
}
// events at a time (seconds) in the loop: a caption, or a click ("burst()", "press(true)", "press(false)"),
// each written exactly as the code that does it. Returns a step(f) for record
function timeline(events, fps) {
  const at = new Map();
  for (const e of events) { const f = Math.round(e.at * fps); at.set(f, [...(at.get(f) || []), e]); }
  return async (page, f) => {
    for (const e of at.get(f) || []) {
      if (e.caption != null) await page.evaluate((c) => window.caption(c), e.caption);
      if (e.click) await page.evaluate((c) => window.click(c), e.click);
    }
  };
}

// hero: the default scene, its sparkle following the pointer along a figure eight over the word, and a row of
// buttons that catch it: the loop starts and ends with the middle one holding it, and visits the other two
{
  const page = gifPage;
  await mount(page, HERO, DRAW, { followMouse: true, textX: CENTRE }, { pointer: "window", magnets: "button" });
  const [b1, b2, b3] = [await centre(page, ".demo button:nth-child(1)"), await centre(page, ".demo button:nth-child(2)"), await centre(page, ".demo button:nth-child(3)")];
  const lift = (await page.evaluate(() => window.rect(".demo"))).y - 90;   // above the buttons, out of their reach
  const eight = (a) => [HERO[0] * (0.5 + 0.34 * Math.sin(a)), HERO[1] * (0.4 - 0.19 * Math.sin(2 * a))];
  const mix = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
  // the path, in segments of [seconds, position at u from 0 to 1]; each one eases in and out, so the joins are smooth
  const segments = [];
  const hold = (p, secs) => segments.push([secs, () => p]);
  const go = (p, q, secs) => segments.push([secs, (u) => mix(p, q, ease(u))]);
  hold(b2, 0.6);
  go(b2, eight(0), 0.7);
  segments.push([3.4, (u) => eight(2 * Math.PI * ease(u))]);
  go(eight(0), b1, 0.8);
  hold(b1, 0.5);
  go(b1, [(b1[0] + b3[0]) / 2, lift], 0.5); go([(b1[0] + b3[0]) / 2, lift], b3, 0.5);
  hold(b3, 0.5);
  go(b3, [(b2[0] + b3[0]) / 2, lift], 0.4); go([(b2[0] + b3[0]) / 2, lift], b2, 0.4);
  const secs = segments.reduce((n, [d]) => n + d, 0), N = Math.round(secs * HERO_FPS);
  const where = (sec) => {
    for (const [d, at] of segments) { if (sec < d) return at(sec / d); sec -= d; }
    return b2;
  };
  // the path is a loop: one round before the first kept frame, so the last frame leads into the first
  await record(page, ANIMATIONS.hero, N, N, (f) => move(page, where(f / HERO_FPS)), HERO_FPS);
}

// magnet: the pointer passes over the editor's demo buttons, and each one catches the light and wraps it
{
  const page = gifPage;
  await mount(page, MAGNET, DRAW, { text: "", followMouse: true }, { pointer: "window", magnets: "button", magnetMode: "wrap" });
  const [b1, b2, b3] = [await centre(page, ".demo button:nth-child(1)"), await centre(page, ".demo button:nth-child(2)"), await centre(page, ".demo button:nth-child(3)")];
  // free, then each button, then free again, back to the start
  const free = [MAGNET[0] * 0.2, MAGNET[1] * 0.3], high = [MAGNET[0] * 0.8, MAGNET[1] * 0.25];
  const { where, secs } = glide(free, [[free, 0, 0.4], [b1, 0.8, 0.8], [b2, 0.6, 0.7], [b3, 0.6, 0.8], [high, 0.8, 0.3], [free, 0.8, 0]]);
  const N = Math.round(secs * FPS);
  await record(page, ANIMATIONS.magnet, N, Math.round(FPS), (f) => move(page, where(f / FPS)));
}

// click: the light under a still pointer, swelling once on burst() and held big by press(true) until press(false)
{
  const page = gifPage;
  await mount(page, HERO, DRAW, { followMouse: true, textX: CENTRE }, { pointer: "window" });
  await move(page, [HERO[0] * 0.83, HERO[1] * 0.48]);   // right of the word, with room for the swell
  await advance(page, 2000);   // the light arrives and its trail fades before the first frame
  const step = timeline([
    { at: 0, caption: "burst()" }, { at: 0.4, click: "burst()" },
    { at: 1.6, caption: "press(true)", click: "press(true)" },
    { at: 2.8, caption: "press(false)", click: "press(false)" },
  ], FPS);
  await record(page, ANIMATIONS.click, Math.round(4.4 * FPS), 0, (f) => step(page, f));
}

await browser.close();

// ---------- the budget ----------
let over = 0;
for (const name of readdirSync(MEDIA_DIR).sort()) {
  const bytes = statSync(join(MEDIA_DIR, name)).size, limit = budgetOf(name);
  console.log(`${bytes > limit ? "OVER " : ""}${name.padEnd(36)} ${(bytes / 1024).toFixed(1)} kB`);
  if (bytes > limit) over++;
}
console.log(`${written.length} files in ${MEDIA_DIR}/`);
process.exit(over ? 1 : 0);
