// Prints the CHANGELOG.md section of one version, used as release notes.
import { readFileSync } from "node:fs";

const version = process.argv[2];
const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const start = changelog.indexOf(`## [${version}]`);
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
const next = changelog.indexOf("\n## [", start + 1);
const section = changelog.slice(start, next === -1 ? undefined : next);
console.log(section.split("\n").slice(1).join("\n").trim());
