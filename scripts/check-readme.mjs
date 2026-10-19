// every README code block marked <!-- example: path --> must match that file, so the README cannot drift
import { readFileSync } from "node:fs";

const readme = readFileSync("README.md", "utf8");
const blocks = [...readme.matchAll(/<!-- example: (\S+) -->\n```\w*\n([\s\S]*?)\n```/g)];
let bad = 0;
for (const [, path, code] of blocks) {
  if (readFileSync(path, "utf8").trimEnd() !== code.trimEnd()) { console.error(`README differs from ${path}`); bad++; }
}
if (!blocks.length) { console.error("no examples found in README.md"); bad++; }
console.log(`${blocks.length} README examples checked`);
process.exit(bad ? 1 : 0);
