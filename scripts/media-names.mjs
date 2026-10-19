// where each README image lives: shared by the generator (docs-media.mjs) and the coverage test
export const MEDIA_DIR = "docs/media";
// absolute URLs, so the images render on npm as well as on GitHub
export const MEDIA_URL = "https://raw.githubusercontent.com/ampulla-tech/litgrid/main/docs/media";
export const ANIMATIONS = { hero: "hero.gif", magnet: "magnet.gif", click: "click.gif" };
// size budget, in bytes: the hero is a long showcase, so it gets twice the magnet's
const MB = 1024 * 1024;
export const BUDGET = { hero: 3 * MB, magnet: 1.5 * MB, click: 1.5 * MB, still: 80 * 1024 };
/** The budget of one file in docs/media: its animation's, or a still's. */
export const budgetOf = (file) => BUDGET[Object.keys(ANIMATIONS).find((k) => ANIMATIONS[k] === file)] ?? BUDGET.still;

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** The file of one catalog still: kind is "preset", "light" or "cell", key the exact name in code. */
export const stillFile = (kind, key) => `${kind}-${slug(key)}.webp`;
