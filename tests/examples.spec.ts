// the README's examples, as written there: plain HTML from the CDN URLs, React, Vue and server rendering
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

// the CDN URLs in the README answer with the local build
async function cdn(page: Page) {
  await page.route(/^https:\/\/unpkg\.com\/@ampulla\/litgrid@0\.1$/, (r) => r.fulfill({ path: "dist/litgrid.iife.js", contentType: "text/javascript" }));
  await page.route("https://cdn.jsdelivr.net/npm/@ampulla/litgrid@0.1/dist/litgrid.js", (r) => r.fulfill({ path: "dist/litgrid.js", contentType: "text/javascript", headers: { "access-control-allow-origin": "*" } }));
}
const lit = (page: Page) => expect.poll(() => page.evaluate(() => {
  const c = document.querySelector("canvas") as HTMLCanvasElement, d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data, s = new Set<number>();
  for (let i = 0; i < d.length; i += 4 * 97) s.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  return s.size;
}), { timeout: 10_000 }).toBeGreaterThan(10);
// animation frames the page asks for per displayed frame
const loops = (page: Page) => page.evaluate(() => new Promise<number>((resolve) => {
  let asked = 0, n = 0; const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => { asked++; return raf.call(window, cb); };
  const count = () => { n++; if (n < 30) raf.call(window, count); else { window.requestAnimationFrame = raf; resolve(asked / n); } };
  raf.call(window, count);
}));

for (const file of ["script", "module"]) {
  test(`plain HTML (${file}) from the CDN`, async ({ page }) => {
    await cdn(page);
    await page.goto(`/examples/html/${file}.html`);
    await lit(page);
  });
}

test("React: created in an effect, destroyed in the cleanup (StrictMode mounts twice)", async ({ page }) => {
  await page.goto("/examples/react/dist/index.html");
  await lit(page);
  expect(await loops(page)).toBeCloseTo(1, 0);   // the first mount's loop was destroyed
});

test("Vue: created in onMounted, destroyed in onBeforeUnmount", async ({ page }) => {
  await page.goto("/examples/vue/dist/index.html");
  await lit(page);
  await page.screenshot({ path: "test-results/evidence/vue.png" });
});

test("server rendering imports the package and renders a plain canvas", () => {
  expect(fs.existsSync("examples/ssr/dist/server.js")).toBe(true);
  const html = execFileSync(process.execPath, ["examples/ssr/dist/server.js"], { encoding: "utf8" });
  expect(html.trim()).toBe('<canvas style="width:100%;aspect-ratio:16 / 9"></canvas>');
});
