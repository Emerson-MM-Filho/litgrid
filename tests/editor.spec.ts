// the editor as built for GitHub Pages (dist-app/): it renders, exports, takes the webcam and registers its agent tools
import { test, expect } from "@playwright/test";

test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] }, permissions: ["camera"] });

test.beforeEach(async ({ page }) => {
  // a stand-in for WebMCP, so the tools the page registers can be called
  await page.addInitScript(() => {
    const tools: Record<string, any> = {};
    (window as any).__tools = tools;
    (navigator as any).modelContext = { registerTool: (t: any) => { tools[t.name] = t; } };
  });
});

test("the editor renders and exports a PNG", async ({ page }) => {
  await page.goto("/dist-app/index.html");
  await expect(page.locator("#stat")).toContainText("cells");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG" }).click();
  expect((await download).suggestedFilename()).toMatch(/^litgrid-\d+\.png$/);
  await expect(page.locator("#snapBody img")).toBeVisible();
  await page.screenshot({ path: "test-results/evidence/editor.png" });
});

test("the panel drives the stage and Copy settings carries every setting", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/dist-app/index.html");
  await page.getByRole("button", { name: "Violet dusk" }).click();
  await page.getByRole("button", { name: "Copy settings" }).click();
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied.bg).toBe("#05060c");
  expect(copied).toHaveProperty("followMouse");
});

test("the webcam becomes the scene", async ({ page }) => {
  await page.goto("/dist-app/index.html");
  await page.getByRole("button", { name: "Use webcam" }).click();
  await expect(page.getByRole("button", { name: "Stop webcam" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take photo" })).toBeVisible();
  await page.getByRole("button", { name: "Take photo" }).click();
  await expect(page.locator("#note")).toContainText("Photo taken");
});

test("WebMCP tools change settings and export", async ({ page }) => {
  await page.goto("/dist-app/index.html");
  await page.waitForFunction(() => Object.keys((window as any).__tools).length === 6);
  const res = await page.evaluate(() => (window as any).__tools.set_settings.execute({ followMouse: true, stepX: 999, nope: 1 }));
  expect(res.applied).toEqual({ followMouse: true, stepX: 48 });
  expect(res.ignored).toEqual({ nope: "unknown setting" });
  await expect(page.locator("#f-followMouse")).toBeChecked();
  const info = await page.evaluate(() => (window as any).__tools.get_settings.execute());
  expect(info.size).toMatchObject({ width: 1920, height: 1080 });
  const png = await page.evaluate(() => (window as any).__tools.export_media.execute({ format: "png" }));
  expect(png.ok).toBe(true);
});

test("the embed page renders through the library", async ({ page }) => {
  await page.goto("/dist-app/embed.html");
  await page.waitForTimeout(800);
  const colors = await page.evaluate(() => {
    const c = document.getElementById("lit") as HTMLCanvasElement, d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data, s = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) s.add(d[i] * 65536 + d[i + 1] * 256 + d[i + 2]);
    return s.size;
  });
  expect(colors).toBeGreaterThan(10);
});

test("magnet and anchor controls drive the stage and land in Copy settings", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/dist-app/index.html");
  await page.locator("summary", { hasText: "Magnets" }).click();
  await page.getByRole("button", { name: "Try them on the demo buttons" }).click();
  await expect(page.locator("#demo")).toBeVisible();
  // before the pointer comes, the anchor holds the light
  await expect(page.locator("#lightStat")).toContainText("anchored · ");
  await expect(page.locator("#lightStat")).toContainText("#demo-cta");
  await page.locator("#f-magnetReach").fill("60");
  const pricing = page.getByRole("button", { name: "Pricing" });
  await pricing.hover();
  await expect(page.locator("#lightStat")).toContainText('held');
  await expect(page.locator("#lightStat")).toContainText('button "Pricing"');
  await page.waitForTimeout(600);
  await page.locator("#f-magnetTime").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/evidence/editor-magnets.png" });
  await page.getByRole("button", { name: "Copy settings" }).click();
  const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied).toMatchObject({ magnets: ".demo button", anchor: "#demo-cta", magnetMode: "wrap", magnetReach: 60, magnetBorder: 56, magnetTime: 0.35 });
});
