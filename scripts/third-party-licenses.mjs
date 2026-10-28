// Writes dist/action/licenses.txt with the license of every package that esbuild
// bundled into dist/action/index.js, read from the build metafile, then removes
// the metafile so only the bundle and the licenses are committed.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = "dist/action";
const metafile = join(out, "metafile-esm.json");
const { inputs } = JSON.parse(readFileSync(metafile, "utf8"));
rmSync(metafile);

const dirs = new Set();
for (const file of Object.keys(inputs)) {
  const m = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(file);
  if (m) dirs.add(m[1]);
}

let text = "Third-party software bundled in dist/action/index.js\n\n";
for (const dir of [...dirs].sort()) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
  text +=
    `${"=".repeat(72)}\n${pkg.name}@${pkg.version} (${pkg.license ?? "see file"})\n${"=".repeat(72)}\n` +
    (file ? readFileSync(join(dir, file), "utf8").trim() : "(no license file shipped)") +
    "\n\n";
}
if (!existsSync(out)) throw new Error(`${out} is missing; run tsup first`);
writeFileSync(join(out, "licenses.txt"), text);
console.log(`licenses.txt: ${dirs.size} packages`);
