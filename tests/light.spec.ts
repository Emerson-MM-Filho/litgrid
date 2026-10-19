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
