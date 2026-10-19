// every README code block marked <!-- example: path --> must match that file, so the README cannot drift
import { readFileSync } from "node:fs";

const readme = readFileSync("README.md", "utf8");
const blocks = [...readme.matchAll(/<!-- example: (\S+) -->\n```\w*\n([\s\S]*?)\n```/g)];
// on GitHub Actions the failure is also an annotation, so it shows in the run's summary
const fail = (title, message, file) => {
  console.error(process.env.GITHUB_ACTIONS ? `::error${file ? ` file=${file},` : " "}title=${title}::${message}` : message);
};
let bad = 0;
for (const [, path, code] of blocks) {
  if (readFileSync(path, "utf8").trimEnd() !== code.trimEnd()) {
    fail("README example differs", `the README block marked <!-- example: ${path} --> differs from ${path}. Copy the file into that block (or the block into the file) so they match, then run npm run check:readme.`, "README.md");
    bad++;
  }
}
if (!blocks.length) { fail("No README examples", "no <!-- example: path --> blocks found in README.md; each example needs that marker right above its code block."); bad++; }
console.log(`${blocks.length} README examples checked`);
process.exit(bad ? 1 : 0);
