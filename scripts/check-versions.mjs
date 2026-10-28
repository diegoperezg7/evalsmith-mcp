// Fails when package.json, server.json and src/shared/version.ts disagree on
// the version, or when they do not match the version passed as an argument
// (the release tag without its leading "v").
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const pkg = JSON.parse(read("package.json"));
const server = JSON.parse(read("server.json"));
const source = read("src/shared/version.ts").match(/VERSION = "([^"]+)"/)?.[1];

const found = {
  "package.json": pkg.version,
  "server.json version": server.version,
  "server.json packages[0].version": server.packages?.[0]?.version,
  "src/shared/version.ts": source,
};
const expected = process.argv[2] ?? pkg.version;
const wrong = Object.entries(found).filter(([, version]) => version !== expected);

if (wrong.length > 0) {
  for (const [where, version] of wrong) console.error(`${where}: ${version}, expected ${expected}`);
  process.exit(1);
}
console.log(`versions match: ${expected}`);
