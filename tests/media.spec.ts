// the README's images cover every exported preset and shape, stay within budget, and nothing in docs/media is stale
import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CELL_SHAPES, LIGHT_SHAPES, PRESETS } from "../src/config";
import { ANIMATIONS, BUDGET, MEDIA_DIR, budgetOf, stillFile } from "../scripts/media-names.mjs";

const readme = readFileSync("README.md", "utf8");
const CATALOGS = { preset: PRESETS, light: LIGHT_SHAPES, cell: CELL_SHAPES } as const;
const expected = [
  ...Object.values(ANIMATIONS),
  ...Object.entries(CATALOGS).flatMap(([kind, list]) => Object.keys(list).map((key) => stillFile(kind, key))),
];
const fix = "Run `npm run docs:media` and add the row to the README.";

for (const [kind, list] of Object.entries(CATALOGS)) {
  test(`every ${kind} has an image and a README row with its exact name`, () => {
    for (const key of Object.keys(list)) {
      const file = stillFile(kind, key);
      expect(existsSync(join(MEDIA_DIR, file)), `${kind} "${key}" has no ${MEDIA_DIR}/${file}. ${fix}`).toBe(true);
      expect(statSync(join(MEDIA_DIR, file)).size, `${file} is over the ${BUDGET.still / 1024} kB budget`).toBeLessThanOrEqual(BUDGET.still);
      // a table row: the image by its path in the repository, then the name exactly as code spells it
      const row = readme.split("\n").find((l) => l.startsWith("|") && l.includes(`"${MEDIA_DIR}/${file}"`));
      expect(row, `the README has no row showing ${MEDIA_DIR}/${file}. ${fix}`).toBeTruthy();
      expect(row, `the README row for ${file} does not name ${kind} \`${JSON.stringify(key)}\``).toContain(`\`${JSON.stringify(key)}\``);
    }
  });
}

test("the hero, magnet and click GIFs are in the README, at the column's full width, and within budget", () => {
  for (const [key, file] of Object.entries(ANIMATIONS)) {
    expect(existsSync(join(MEDIA_DIR, file)), `${MEDIA_DIR}/${file} is missing. ${fix}`).toBe(true);
    const limit = budgetOf(file);
    expect(limit, `${file} has no budget of its own`).toBe(BUDGET[key as keyof typeof BUDGET]);
    expect(statSync(join(MEDIA_DIR, file)).size, `${file} is over its ${limit / 1024 / 1024} MB budget`).toBeLessThanOrEqual(limit);
    const tag = readme.split("\n").find((l) => l.includes(`"${MEDIA_DIR}/${file}"`));
    expect(tag, `the README does not show ${MEDIA_DIR}/${file}`).toBeTruthy();
    expect(tag, `the README shows ${file} narrower than its column`).toContain('width="100%"');
  }
});

test("the hero is the README's first image, and runs within its length", () => {
  const first = readme.match(/<img [^>]*src="([^"]+)"/)?.[1];
  expect(first).toBe(`${MEDIA_DIR}/${ANIMATIONS.hero}`);
  // the frame delays, in hundredths of a second, from each graphic control extension, walking the GIF's blocks
  const gif = readFileSync(join(MEDIA_DIR, ANIMATIONS.hero));
  const table = (flags: number) => (flags & 0x80 ? 3 << ((flags & 7) + 1) : 0);
  const skipSubBlocks = (i: number) => { while (gif[i]) i += gif[i] + 1; return i + 1; };
  let i = 13 + table(gif[10]), hundredths = 0;
  while (gif[i] !== 0x3b) {
    if (gif[i] === 0x21) { if (gif[i + 1] === 0xf9) hundredths += gif.readUInt16LE(i + 4); i = skipSubBlocks(i + 2); }
    else if (gif[i] === 0x2c) i = skipSubBlocks(i + 10 + table(gif[i + 9]) + 1);
    else throw new Error(`unexpected GIF block 0x${gif[i].toString(16)} at ${i}`);
  }
  expect(hundredths / 100).toBeGreaterThanOrEqual(6);
  expect(hundredths / 100).toBeLessThanOrEqual(10);
});

// the encoder behind every GIF: in delta mode only the changed rectangle is written, with unchanged pixels
// transparent, and a browser decoding it must still see every frame exactly as it was given
test("the GIF encoder's delta mode decodes to the frames it was given", async ({ page }) => {
  await page.goto("/package.json");
  const result = await page.evaluate(async () => {
    const { encodeGif, packFrame } = await import("/app/src/export.js" as string);
    const w = 40, h = 30;
    const A = [16, 24, 40], B = [248, 128, 0], C = [0, 200, 96], NEAR = [24, 24, 40];   // NEAR is within a tolerance of 8 from A
    const fill = (base: number[][], paint: [number, number, number, number, number[]][]) => {
      const px = base.map((c) => [...c]);
      for (const [x0, y0, x1, y1, c] of paint) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px[y * w + x] = c;
      return px;
    };
    const f0 = Array.from({ length: w * h }, () => A);
    const f1 = fill(f0, [[5, 5, 10, 10, B]]);
    const f2 = f1;                                             // nothing changes
    const f3 = fill(f0, [[39, 29, 40, 30, C]]);                // the block goes, a corner pixel comes
    const f4 = fill(f3, [[0, 0, 20, 30, NEAR]]);               // a faint change: under the tolerance, still A on screen
    const given = [f0, f1, f2, f3, f4];
    const encode = async (opts: object) => {
      const hist = new Uint32Array(32768), sums = new Float64Array(32768 * 3);
      const packed = given.map((f) => packFrame(new Uint8Array(f.flatMap((c) => [...c, 255])), hist, sums));
      return encodeGif(packed, given.map((_, i) => i * 100).concat(given.length * 100), w, h, hist, sums, () => {}, opts);
    };
    const decode = async (bytes: Uint8Array) => {
      const dec = new (window as any).ImageDecoder({ data: bytes, type: "image/gif" });
      await dec.tracks.ready;
      const cv = new OffscreenCanvas(w, h), g = cv.getContext("2d")!, out: number[][][] = [];
      for (let i = 0; i < dec.tracks.selectedTrack.frameCount; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        g.clearRect(0, 0, w, h); g.drawImage(image, 0, 0); image.close();
        const d = g.getImageData(0, 0, w, h).data, px: number[][] = [];
        for (let j = 0; j < d.length; j += 4) px.push([d[j], d[j + 1], d[j + 2]]);
        out.push(px);
      }
      return out;
    };
    const full = await encode({}), exact = await encode({ delta: true }), loose = await encode({ delta: true, tolerance: 8 });
    return { given, full: full.length, exact: await decode(exact), exactBytes: exact.length, loose: await decode(loose) };
  });
  expect(result.exact).toEqual(result.given);
  expect(result.exactBytes).toBeLessThan(result.full);
  // with a tolerance, the faint change is not drawn: the last frame shows what the one before it showed
  expect(result.loose.slice(0, 4)).toEqual(result.given.slice(0, 4));
  expect(result.loose[4]).toEqual(result.given[3]);
});

// relative paths, so each branch and pull request shows its own images
test("the README shows every image by its path in the repository", () => {
  const srcs = [...readme.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1]);
  expect(srcs.length).toBe(expected.length);
  expect(srcs.filter((s) => !s.startsWith(`${MEDIA_DIR}/`)), "images not loaded from docs/media/ by a relative path").toEqual([]);
});

test("docs/media holds only images the README uses", () => {
  const stale = readdirSync(MEDIA_DIR).filter((f) => !expected.includes(f));
  expect(stale, `files in ${MEDIA_DIR} for names the code no longer exports. Run \`npm run docs:media\`.`).toEqual([]);
});
