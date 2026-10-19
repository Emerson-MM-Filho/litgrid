// the README's images cover every exported preset and shape, stay within budget, and nothing in docs/media is stale
import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CELL_SHAPES, LIGHT_SHAPES, PRESETS } from "../src/config";
import { ANIMATIONS, BUDGET, MEDIA_DIR, MEDIA_URL, stillFile } from "../scripts/media-names.mjs";

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
      // a table row: the image by its absolute URL, then the name exactly as code spells it
      const row = readme.split("\n").find((l) => l.startsWith("|") && l.includes(`"${MEDIA_URL}/${file}"`));
      expect(row, `the README has no row showing ${MEDIA_URL}/${file}. ${fix}`).toBeTruthy();
      expect(row, `the README row for ${file} does not name ${kind} \`${JSON.stringify(key)}\``).toContain(`\`${JSON.stringify(key)}\``);
    }
  });
}

test("the hero and magnet GIFs are in the README and within budget", () => {
  for (const file of Object.values(ANIMATIONS)) {
    expect(existsSync(join(MEDIA_DIR, file)), `${MEDIA_DIR}/${file} is missing. ${fix}`).toBe(true);
    expect(statSync(join(MEDIA_DIR, file)).size, `${file} is over the 1.5 MB budget`).toBeLessThanOrEqual(BUDGET.gif);
    expect(readme, `the README does not show ${MEDIA_URL}/${file}`).toContain(`"${MEDIA_URL}/${file}"`);
  }
});

test("docs/media holds only images the README uses", () => {
  const stale = readdirSync(MEDIA_DIR).filter((f) => !expected.includes(f));
  expect(stale, `files in ${MEDIA_DIR} for names the code no longer exports. Run \`npm run docs:media\`.`).toEqual([]);
});
