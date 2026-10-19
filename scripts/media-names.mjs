// where each README image lives: shared by the generator (docs-media.mjs) and the coverage test
export const MEDIA_DIR = "docs/media";
// absolute URLs, so the images render on npm as well as on GitHub
export const MEDIA_URL = "https://raw.githubusercontent.com/ampulla-tech/litgrid/main/docs/media";
export const ANIMATIONS = { hero: "hero.gif", magnet: "magnet.gif" };
// size budget, in bytes
export const BUDGET = { gif: 1.5 * 1024 * 1024, still: 80 * 1024 };

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** The file of one catalog still: kind is "preset", "light" or "cell", key the exact name in code. */
export const stillFile = (kind, key) => `${kind}-${slug(key)}.webp`;
