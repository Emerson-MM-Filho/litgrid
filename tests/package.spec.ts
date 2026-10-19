// the package as a consumer sees it: the IIFE and ESM builds, independent instances, destroy, Node import
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

// the canvas has drawn something other than one flat color
async function lit(page: Page, sel: string) {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel) as HTMLCanvasElement, g = c.getContext("2d")!;
    const d = g.getImageData(0, 0, c.width, c.height).data, seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  }, sel);
}

for (const kind of ["iife", "esm"]) {
  test(`${kind} build renders the grid with the default settings`, async ({ page }) => {
    await page.addInitScript(() => { (window as any).__before = Object.keys(window); });
    await page.goto(`/fixtures/${kind}.html`);
    await page.waitForFunction(() => (window as any).__ready);
    expect(await lit(page, "#lit")).toBeGreaterThan(20);
    const leaked = await page.evaluate(() => Object.keys(window).filter(k => !(window as any).__before.includes(k) && !["lg", "__ready", "__before"].includes(k)));
    // the IIFE exposes exactly one global, the ESM build none
    expect(leaked).toEqual(kind === "iife" ? ["Litgrid"] : []);
    await page.locator("#lit").screenshot({ path: `test-results/evidence/${kind}.png` });
  });
}

test("two instances are independent, and destroy leaves no loop and no listeners", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    // every listener added and not removed, and every animation frame requested
    w.__listeners = [] as { target: EventTarget; type: string; fn: unknown }[];
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type: string, fn: any, o?: any) { w.__listeners.push({ target: this, type, fn }); return add.call(this, type, fn, o); };
    EventTarget.prototype.removeEventListener = function (type: string, fn: any, o?: any) {
      const i = w.__listeners.findIndex((l: any) => l.target === this && l.type === type && l.fn === fn);
      if (i >= 0) w.__listeners.splice(i, 1);
      return remove.call(this, type, fn, o);
    };
    w.__raf = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => { w.__raf++; return raf(cb); };
  });
  await page.goto("/fixtures/two.html");
  await page.waitForFunction(() => (window as any).__ready);
  const shot = (sel: string) => page.evaluate((sel) => (document.querySelector(sel) as HTMLCanvasElement).toDataURL(), sel);
  // frames the loops ask for per displayed frame, over half a second
  const rate = () => page.evaluate(() => new Promise<number>((resolve) => {
    const w = window as any, r0 = w.__raf; let n = 0;
    const count = () => { n++; if (n < 30) requestAnimationFrame(count); else resolve((w.__raf - r0 - n) / n); };
    requestAnimationFrame(count);
  }));
  const listenersOn = (sel: string) => page.evaluate((sel) => (window as any).__listeners.filter((l: any) => l.target === document.querySelector(sel)).length, sel);

  // both animate, with different palettes
  const a1 = await shot("#a"), b1 = await shot("#b");
  await page.waitForTimeout(400);
  expect(await shot("#a")).not.toBe(a1);
  expect(await shot("#b")).not.toBe(b1);
  expect(await lit(page, "#a")).toBeGreaterThan(10);
  expect(await rate()).toBeCloseTo(2, 0);
  expect(await listenersOn("#a")).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/evidence/two-instances.png" });

  await page.evaluate(() => (window as any).a.destroy());
  const a2 = await shot("#a"), b2 = await shot("#b");
  await page.waitForTimeout(400);
  expect(await shot("#a")).toBe(a2);          // the destroyed one no longer draws
  expect(await shot("#b")).not.toBe(b2);      // the other keeps running
  expect(await rate()).toBeCloseTo(1, 0);     // one loop left
  expect(await listenersOn("#a")).toBe(0);    // nothing left on the destroyed canvas
});

test("importing the ESM build in Node does not throw", () => {
  const out = execFileSync(process.execPath, ["-e", "import('./dist/litgrid.js').then(m => console.log(typeof m.createLitgrid))"], { encoding: "utf8" });
  expect(out.trim()).toBe("function");
});
