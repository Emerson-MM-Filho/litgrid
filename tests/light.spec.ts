// the light-control API: light.get, light.set, light.release and pointer, on an oversized, scroll-offset canvas
import { test, expect, type Page } from "@playwright/test";

const get = (page: Page) => page.evaluate(() => (window as any).lg.light.get());
// one light.get() per animation frame, for `ms`
const trace = (page: Page, ms: number) => page.evaluate((ms) => new Promise<{ x: number; y: number; state: string }[]>((resolve) => {
  const out: any[] = [], end = performance.now() + ms;
  const tick = () => { out.push((window as any).lg.light.get()); if (performance.now() < end) requestAnimationFrame(tick); else resolve(out); };
  requestAnimationFrame(tick);
}), ms);
// waits until the light settles within 2 px of (x, y): the follow delay is per frame, so slow machines take longer
const settle = async (page: Page, x: number, y: number) => {
  await expect.poll(async () => { const l = await get(page); return Math.max(Math.abs(l.x - x), Math.abs(l.y - y)); }, { timeout: 20_000 }).toBeLessThan(2);
  return get(page);
};
// the size of a cell on screen, in client pixels
const cell = (page: Page) => page.evaluate(() => { const c = document.getElementById("lit") as HTMLCanvasElement; return 16 * c.getBoundingClientRect().width / c.width; });

test("light.get, set and release on an oversized, scroll-offset canvas", async ({ page }) => {
  const log: string[] = [];
  const note = (step: string, l: any) => log.push(`${step.padEnd(40)} -> ${JSON.stringify({ state: l.state, x: Math.round(l.x), y: Math.round(l.y) })}`);
  await page.goto("/fixtures/light.html");
  await page.waitForFunction(() => (window as any).__ready);

  // waiting: follow is on and the pointer has not been seen; drift is set, and the light does not move
  const w1 = await get(page);
  expect(w1.state).toBe("waiting");
  await page.waitForTimeout(1000);
  const w2 = await get(page);
  expect(Math.hypot(w2.x - w1.x, w2.y - w1.y)).toBeLessThan(0.5);
  note("load", w1);

  // scrolled, so the canvas is offset; the pointer comes in and the light settles under it
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.mouse.move(380, 280);
  await page.mouse.move(400, 300, { steps: 5 });
  const f = await settle(page, 400, 300);
  expect(f.state).toBe("following");
  note("mouse moves to (400,300)", f);
  const p = await page.evaluate(() => (window as any).lg.pointer);
  expect(p).toEqual({ x: 400, y: 300, on: true });

  // the page scrolls under a still mouse: the light stays under the pointer
  await page.evaluate(() => window.scrollTo(0, 820));
  await page.waitForTimeout(300);
  const s = await settle(page, 400, 300);
  note("page scrolled 320 px more, mouse still", s);

  // the pointer leaves the window: the light rests where it left, and stays
  await page.mouse.move(400, -40);
  const r1 = await get(page);
  await page.waitForTimeout(2000);
  const r2 = await get(page);
  expect(r2.state).toBe("resting");
  expect(Math.hypot(r2.x - r1.x, r2.y - r1.y)).toBeLessThan(0.5);
  expect(Math.abs(r2.x - 400)).toBeLessThan(2);
  expect(Math.abs(r2.y - 300)).toBeLessThan(2);
  expect((await page.evaluate(() => (window as any).lg.pointer)).on).toBe(false);
  note("mouse leaves the window (2 s later)", r2);

  // manual control
  await page.evaluate(() => (window as any).lg.light.set({ x: 100, y: 120, stretchX: 0.2 }));
  await page.waitForTimeout(300);
  const m = await get(page);
  expect(m.state).toBe("manual");
  expect(Math.abs(m.x - 100)).toBeLessThan(1);
  expect(Math.abs(m.y - 120)).toBeLessThan(1);
  note("light.set({ x: 100, y: 120, stretchX: 0.2 })", m);
  await page.screenshot({ path: "test-results/evidence/light-manual.png" });

  // the pointer comes back while the page drives the light: it does not take over
  await page.mouse.move(500, 200, { steps: 4 });
  await page.waitForTimeout(300);
  expect((await get(page)).state).toBe("manual");

  // release: following resumes from where the light is, with no frame moving more than one cell
  const [, frames] = await Promise.all([page.evaluate(() => (window as any).lg.light.release()), trace(page, 2500)]);
  const size = await cell(page);
  let worst = 0;
  for (let i = 1; i < frames.length; i++) worst = Math.max(worst, Math.hypot(frames[i].x - frames[i - 1].x, frames[i].y - frames[i - 1].y));
  expect(Math.hypot(frames[0].x - 100, frames[0].y - 120)).toBeLessThan(size);
  expect(worst).toBeLessThan(size);
  const end = await settle(page, 500, 200);
  expect(end.state).toBe("following");
  note("light.release(), mouse at (500,200)", end);
  log.push(`largest move in one frame after release: ${worst.toFixed(1)} px (one cell is ${size.toFixed(1)} px)`);
  console.log(log.join("\n"));
});

test("reduced motion reports still and draws one still frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/fixtures/light.html");
  await page.waitForFunction(() => (window as any).__ready);
  await page.mouse.move(400, 300, { steps: 5 });
  const shot = () => page.evaluate(() => (document.getElementById("lit") as HTMLCanvasElement).toDataURL());
  const a = await shot();
  await page.mouse.move(600, 400, { steps: 5 });
  await page.waitForTimeout(800);
  expect(await shot()).toBe(a);
  const l = await get(page);
  expect(l.state).toBe("still");
  console.log(`reduced motion emulated -> ${JSON.stringify({ state: l.state })}`);
});

// ---------- what the light is tied to while the page scrolls or moves the canvas ----------
// runs `act(i)` after each of `n` frames the loop draws (or every turn with `every`), and returns what `look()`
// read right after each one: the first look is before any act
const frames = <T>(page: Page, n: number, act: string, look: string, every = false) => page.evaluate(([n, act, look, every]) => new Promise<T[]>((resolve) => {
  const a = new Function("i", act as string), l = new Function(look as string), out: any[] = [];
  let i = 0;
  (window as any).__frame = (drew: boolean) => {
    if (!drew && !every) return;
    out.push({ ...l(), drew });
    if (i < (n as number)) a(i++); else { (window as any).__frame = null; resolve(out); }
  };
}), [n, act, look, every] as const);
// the page moves the canvas, with no scroll, by whole cells (12 px on screen) so the cells line up again,
// the way a page repositions a canvas taller than the viewport
const MOVE = `if (i % 8 === 7) document.getElementById("lit").style.top = [192, -96, 0][(i >> 3) % 3] + "px";`;
// the page scrolls 7 px a frame for 40 frames, then stops
const SCROLL = `if (i < 40) scrollBy(0, 7);`;
const LIGHT = `const l = lg.light.get(), b = document.getElementById("lit").getBoundingClientRect(); return { x: l.x, y: l.y, state: l.state, top: b.top, left: b.left, scroll: scrollY };`;
// the pixels on screen brighter than `min`: the farthest one from the light, the farthest from the pointer, how
// many, and their centre
const LIT = (min = 120) => `const c = document.getElementById("lit"), b = c.getBoundingClientRect(), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, l = lg.light.get();
  let far = 0, fromPointer = 0, n = 0, sx = 0, sy = 0;
  for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
    const p = (y * c.width + x) * 4;
    if (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2] < ${min}) continue;
    const cx = b.left + (x + 0.5) / c.width * b.width, cy = b.top + (y + 0.5) / c.height * b.height;
    far = Math.max(far, Math.hypot(cx - l.x, cy - l.y)); fromPointer = Math.max(fromPointer, Math.hypot(cx - 400, cy - 300)); n++; sx += cx; sy += cy;
  }
  return { far, fromPointer, n, cx: sx / n, cy: sy / n, x: l.x, y: l.y, state: l.state, top: b.top, scroll: scrollY };`;
// the largest jump of the canvas on screen between two looks
const jumps = (f: { top: number }[]) => Math.max(...f.slice(1).map((s, i) => Math.abs(s.top - f[i].top)));
const off = (f: { x: number; y: number }[], x: number, y: number) => Math.max(...f.map((s) => Math.hypot(s.x - x, s.y - y)));
const open = async (page: Page, query = "", settings: object = {}) => {
  await page.goto(`/fixtures/tied.html${query}`);
  await page.waitForFunction(() => (window as any).__ready);
  await page.evaluate((s) => (window as any).lg.update(s), settings);
  await page.mouse.move(380, 280);
  await page.mouse.move(400, 300, { steps: 5 });
  await settle(page, 400, 300);
};
// scrolling under a still pointer: the light stays on the page and eases back to the pointer, never faster
// than the page moved it away, and the trail it leaves on the page shows
const lags = (f: { x: number; y: number; scroll: number }[]) => {
  let worst = -Infinity;
  for (let i = 1; i < f.length; i++) worst = Math.max(worst, Math.hypot(f[i].x - 400, f[i].y - 300) - Math.hypot(f[i - 1].x - 400, f[i - 1].y - 300) - Math.abs(f[i].scroll - f[i - 1].scroll));
  return worst;
};

test("following: a page moving the canvas under a still pointer moves nothing on screen, trail included", async ({ page }) => {
  await open(page, "", { trail: true, trailStrength: 1, deform: true });
  await page.waitForTimeout(2000);   // the trail of the way in fades out
  const f = await frames<{ x: number; y: number; state: string; top: number; n: number; cx: number; cy: number; fromPointer: number }>(page, 48, MOVE, LIT());
  const drift = Math.max(...f.map((s) => Math.max(Math.hypot(s.cx - f[0].cx, s.cy - f[0].cy), Math.abs(s.fromPointer - f[0].fromPointer))));
  console.log(`following, canvas moved up to ${jumps(f).toFixed(0)} px with no scroll: light at most ${off(f, 400, 300).toFixed(2)} px from the pointer, lit pixels moved at most ${drift.toFixed(2)} px (${f[0].n} to ${Math.min(...f.map((s) => s.n))}-${Math.max(...f.map((s) => s.n))} lit)`);
  expect(jumps(f)).toBeGreaterThan(150);
  for (const s of f) expect(s.state).toBe("following");
  expect(off(f, 400, 300)).toBeLessThan(0.5);
  expect(drift).toBeLessThan(0.5);
});

for (const canvas of ["page", "fixed"]) {
  test(`following: the page scrolling under a still pointer leaves the light behind, and it eases back (${canvas} canvas)`, async ({ page }) => {
    await open(page, canvas === "fixed" ? "?canvas=fixed" : "");
    const f = await frames<{ x: number; y: number; state: string; scroll: number }>(page, 100, SCROLL, LIGHT);
    const lag = off(f, 400, 300), worst = lags(f);
    console.log(`following on a ${canvas} canvas, page scrolled ${f[f.length - 1].scroll} px: light up to ${lag.toFixed(1)} px behind the pointer, a frame moved it away at most ${worst.toFixed(2)} px more than the scroll did`);
    for (const s of f) expect(s.state).toBe("following");
    expect(lag).toBeGreaterThan(10);
    expect(worst).toBeLessThan(0.5);
    await settle(page, 400, 300);
  });
}

test("following: the trail shows on the page while it scrolls, and only the trail", async ({ page }) => {
  const reach: Record<string, number> = {};
  for (const trail of [true, false]) {
    await open(page, "", { trail, trailStrength: 1 });
    await page.waitForTimeout(2000);   // the trail of the way in fades out
    // the trail's stamps are faint each, so the dimmer lit cells count here
    const f = await frames<{ far: number }>(page, 30, SCROLL, LIT(60));
    reach[String(trail)] = Math.max(...f.map((s) => s.far)) - f[0].far;
  }
  console.log(`page scrolled 7 px a frame: lit pixels reach ${reach.true.toFixed(0)} px beyond the light at rest with the trail, ${reach.false.toFixed(0)} px without`);
  expect(reach.true).toBeGreaterThan(60);
  expect(reach.false).toBeLessThan(24);   // two cells
});

test("drifting: with following off the light keeps its place on a canvas that scrolls with the page", async ({ page }) => {
  await page.goto("/fixtures/tied.html?follow=0");
  await page.waitForFunction(() => (window as any).__ready);
  await page.mouse.move(400, 300, { steps: 5 });
  await page.waitForTimeout(300);
  const f = await frames<{ x: number; y: number; state: string; top: number; left: number }>(page, 64, `scrollBy(0, 7); ${MOVE}`, LIGHT);
  // shapeX 0.3 and shapeY 0.2 of a 1280 × 2400 px canvas
  const worst = Math.max(...f.map((s) => Math.hypot(s.x - s.left - 384, s.y - s.top - 480)));
  console.log(`following off, canvas moved up to ${jumps(f).toFixed(0)} px: light at most ${worst.toFixed(2)} px from its place on the canvas`);
  expect(jumps(f)).toBeGreaterThan(150);
  for (const s of f) expect(s.state).toBe("resting");
  expect(worst).toBeLessThan(1);
});

test("animate off: a page moving the canvas is drawn again with the light under the pointer; a scroll leaves it on the page", async ({ page }) => {
  await open(page, "?animate=0");
  expect((await get(page)).state).toBe("still");
  // every turn of the loop, drawn or not
  const moved = await frames<{ x: number; y: number; top: number }>(page, 48, MOVE, LIGHT, true);
  console.log(`animate off, canvas moved up to ${jumps(moved).toFixed(0)} px: light at most ${off(moved, 400, 300).toFixed(2)} px from the pointer`);
  expect(jumps(moved)).toBeGreaterThan(150);
  expect(off(moved, 400, 300)).toBeLessThan(0.5);
  const scrolled = await frames<{ x: number; y: number; scroll: number }>(page, 48, SCROLL, LIGHT, true);
  const away = Math.max(...scrolled.map((s) => Math.abs(s.y + s.scroll - 300)));
  console.log(`animate off, page scrolled ${scrolled[scrolled.length - 1].scroll} px: light at most ${away.toFixed(2)} px from where it was on the page`);
  expect(away).toBeLessThan(0.5);
});
