// Regenerates the HTML report screenshots in docs/assets. Run after `npm run build`:
//   npm run docs:screenshots
// Runs the example suite against the regressed prompt candidate, opens the HTML
// report in Chromium at 1440x900 @2x and fails if the page logs an error or a
// CSP violation.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const out = "docs/assets";
const dir = mkdtempSync(join(tmpdir(), "evalsmith-shots-"));
const html = join(dir, "report.html");
const suite = join(dir, "evalsmith.yaml");
const datasets = resolve("examples/datasets");
writeFileSync(
  suite,
  readFileSync("examples/evalsmith.yaml", "utf8")
    .replaceAll("datasets/", `${datasets}/`)
    .replace("candidate.json", "candidate-regressed.json"),
);
try {
  execFileSync(
    process.execPath,
    ["dist/cli/index.js", "run", suite, "--format", "json", "-r", html],
    {
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
} catch (err) {
  if (err.status !== 1) throw err; // 1 = the regression fails the suite, expected here
}

const browser = await chromium.launch();
const problems = [];
async function page(colorScheme) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme,
  });
  const p = await context.newPage();
  p.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  p.on("pageerror", (e) => problems.push(e.message));
  await p.goto(pathToFileURL(html).href);
  await p.waitForSelector("footer");
  return p;
}

const light = await page("light");
await light.screenshot({ path: `${out}/report.png` });

const dark = await page("dark");
await dark.screenshot({ path: `${out}/report-dark.png` });

// The prompt regression section with a regressed case opened.
const kase = light.locator("details.case", { hasText: "classify-intent" });
await kase.locator("summary").click();
const section = light.locator("section", { has: kase });
await section.scrollIntoViewIfNeeded();
await light.mouse.move(0, 0); // no cursor or hover state in the picture
await section.screenshot({ path: `${out}/report-regression.png` });

await browser.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`screenshots written to ${out}`);
