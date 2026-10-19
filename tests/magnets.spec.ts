// magnets and the anchor: hysteresis, the wrap bar and the straight-back release, keyboard focus, the event
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

const get = (page: Page) => page.evaluate(() => { const l = (window as any).lg.light.get(); return { ...l, element: l.element?.id ?? null }; });
const box = async (page: Page, id: string) => (await page.locator(`#${id}`).boundingBox())!;
// one light.get() per animation frame, for `ms`, while `act` runs at the start
const trace = (page: Page, ms: number, act = "") => page.evaluate(([ms, act]) => new Promise<any[]>((resolve) => {
  const out: any[] = [], end = performance.now() + (ms as number);
  if (act) new Function(act as string)();
  const tick = () => {
    const l = (window as any).lg.light.get(), f: any = { ...l, element: l.element?.id ?? null };
    out.push(f);
    if (performance.now() < end) requestAnimationFrame(tick); else resolve(out);
  };
  requestAnimationFrame(tick);
}), [ms, act] as const);
const settled = (page: Page, state: string, element: string | null) =>
  expect.poll(async () => { const l = await get(page); return `${l.state}:${l.element}`; }, { timeout: 15_000 }).toBe(`${state}:${element}`);

for (const build of ["esm", "iife"]) {
  test(`magnets, anchor and keyboard (${build} build)`, async ({ page }) => {
    const log: string[] = [];
    const note = (step: string, l: any) => log.push(`${step.padEnd(34)} -> ${l.state}, element = ${l.element}, stretchX = ${l.stretchX.toFixed(3)}`);
    await page.goto(`/fixtures/magnets.html?build=${build}`);
    await page.waitForFunction(() => (window as any).__ready);
    const reach = 40;

    // born on the anchor, wrapped round it
    await settled(page, "anchored", "cta");
    await page.waitForTimeout(800);
    const a = await get(page);
    expect(a.stretchX).toBeGreaterThan(0);
    const cta = await box(page, "cta");
    expect(Math.abs(a.x - (cta.x + cta.width / 2))).toBeLessThan(2);
    note("load", a);
    await page.screenshot({ path: `test-results/evidence/anchored-${build}.png` });

    // far from every button: following
    await page.mouse.move(640, 760, { steps: 4 });
    await settled(page, "following", null);
    note("mouse moves far from buttons", await get(page));

    // within reach of B2: held, the event fires once with B2
    const b2 = await box(page, "b2");
    const y = b2.y + b2.height / 2;
    await page.evaluate(() => { (window as any).events.length = 0; });
    await page.mouse.move(b2.x + b2.width + reach * 0.5, y, { steps: 6 });
    // the catch travels on the critically damped spring: no overshoot past the target
    const catching = await trace(page, 1200);
    const tx = b2.x + b2.width / 2;
    const start = catching[0].x;
    for (const f of catching) expect((f.x - tx) * Math.sign(start - tx)).toBeGreaterThan(-0.5);
    await settled(page, "held", "b2");
    expect(await page.evaluate(() => (window as any).events)).toEqual(["b2"]);
    const h = await get(page);
    note("mouse within reach of B2", h);
    // wrap: radius is half the shorter side plus the border, the stretch is the rest
    const ratio = await page.evaluate(() => { const c = document.getElementById("lit") as HTMLCanvasElement; return c.width / c.getBoundingClientRect().width; });
    const m = await page.evaluate(() => Math.min((document.getElementById("lit") as HTMLCanvasElement).width, (document.getElementById("lit") as HTMLCanvasElement).height));
    const bw = (b2.width + 56) * ratio, bh = (b2.height + 56) * ratio, r = Math.min(bw, bh) / 2;
    expect(h.size * m).toBeCloseTo(r, 0);
    expect(h.stretchX * m).toBeCloseTo(bw - 2 * r, 0);
    expect(h.stretchY * m).toBeCloseTo(bh - 2 * r, 0);
    await page.screenshot({ path: `test-results/evidence/held-${build}.png` });

    // hysteresis: at reach × 1.1 it stays held
    await page.mouse.move(b2.x + b2.width + reach * 1.1, y, { steps: 3 });
    await page.waitForTimeout(300);
    const hy = await get(page);
    expect(`${hy.state}:${hy.element}`).toBe("held:b2");
    note("mouse at reach x 1.1 from B2", hy);

    // beyond reach × 1.25 + 6 it lets go, and the very next frame is the sparkle again with no stretch
    const out = b2.x + b2.width + reach * 1.3 + 6;
    // the magnet event fires inside the frame that lets go; a microtask after it sees that frame as drawn
    await page.evaluate(() => {
      const w = window as any;
      const off = w.lg.on("magnet", (el: Element | null) => {
        if (el) return;
        off();
        queueMicrotask(() => { const l = w.lg.light.get(); w.__free = { ...l, element: null, canvas: (document.getElementById("lit") as HTMLCanvasElement).toDataURL() }; });
      });
    });
    const [after] = await Promise.all([trace(page, 400), page.mouse.move(out, y)]);
    const first = await page.evaluate(() => (window as any).__free);
    expect(first.state).toBe("following");
    expect(first.stretchX).toBe(0);
    expect(first.stretchY).toBe(0);
    const firstFree = after.findIndex((f) => f.state === "following");
    expect(firstFree).toBeGreaterThanOrEqual(0);
    for (const f of after.slice(firstFree)) expect(f.stretchX).toBe(0);
    note("mouse at reach x 1.3 + 6 (that frame)", first);
    fs.writeFileSync(`test-results/evidence/first-frame-after-release-${build}.png`, Buffer.from(first.canvas.split(",")[1], "base64"));
    await page.screenshot({ path: `test-results/evidence/released-${build}.png` });

    // keyboard: Tab to B3 holds it
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => document.activeElement?.id) === "b3") break;
    }
    await settled(page, "held", "b3");
    note("Tab to B3 (focus-visible)", await get(page));
    // a scroll under a still mouse does not take it back
    await page.mouse.wheel(0, 1);
    await page.waitForTimeout(300);
    expect((await get(page)).element).toBe("b3");
    // a real mouse move does
    await page.mouse.move(640, 760, { steps: 4 });
    await settled(page, "following", null);
    note("mouse moves", await get(page));

    // inert elements never catch the light
    const dead = await box(page, "dead");
    await page.mouse.move(dead.x + dead.width / 2, dead.y + dead.height / 2, { steps: 4 });
    await page.waitForTimeout(500);
    expect((await get(page)).element).toBe(null);
    console.log(`[${build}]\n` + log.join("\n"));
  });
}

test("pull mode moves the centre only", async ({ page }) => {
  await page.goto("/fixtures/magnets.html");
  await page.waitForFunction(() => (window as any).__ready);
  await page.evaluate(() => (window as any).lg.update({ magnetMode: "pull" }));
  const b1 = await box(page, "b1");
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2, { steps: 6 });
  await settled(page, "held", "b1");
  await page.waitForTimeout(800);
  const l = await get(page);
  expect(l.stretchX).toBe(0);
  expect(l.size).toBeCloseTo(0.06, 5);
  expect(Math.abs(l.x - (b1.x + b1.width / 2))).toBeLessThan(2);
});

test("the anchor off screen: the light waits at its position", async ({ page }) => {
  await page.goto("/fixtures/magnets.html");
  await page.waitForFunction(() => (window as any).__ready);
  await page.evaluate(() => window.scrollTo(0, 1500));
  await settled(page, "waiting", null);
  const cta = await box(page, "cta");
  const l = await get(page);
  expect(Math.abs(l.y - (cta.y + cta.height / 2))).toBeLessThan(2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await settled(page, "anchored", "cta");
});
