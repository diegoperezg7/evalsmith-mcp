// Copies the package.json version into server.json and src/shared/version.ts.
// Runs from the npm "version" lifecycle, so `npm version <bump>` keeps them in step.
import { readFileSync, writeFileSync } from "node:fs";

const path = (file) => new URL(`../${file}`, import.meta.url);
const { version } = JSON.parse(readFileSync(path("package.json"), "utf8"));

const server = JSON.parse(readFileSync(path("server.json"), "utf8"));
server.version = version;
for (const pkg of server.packages ?? []) pkg.version = version;
writeFileSync(path("server.json"), `${JSON.stringify(server, null, 2)}\n`);

writeFileSync(path("src/shared/version.ts"), `export const VERSION = "${version}";\n`);
console.log(`synced ${version}`);
