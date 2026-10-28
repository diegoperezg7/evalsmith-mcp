import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  checkToolCalls,
  compareConfigs,
  detectPromptRegression,
  embedJson,
  evaluateGates,
  evaluateRetrieval,
  generateReport,
  htmlReportData,
  loadSuiteConfig,
  runSuite,
  toHtml,
  type SuiteResult,
} from "../../src/core/index.js";
import { HTML_CLIENT } from "../../src/core/reportHtmlAssets.js";

const LS = String.fromCharCode(0x2028);
const ESC = String.fromCharCode(0x1b);
const hostile =
  `</script><script>window.__pwned=1</script><img src=x onerror="window.__pwned=2">` +
  `<a href="javascript:window.__pwned=3">x</a>${LS}${ESC}[31m`;

/** A failing suite where every dataset-supplied string carries markup. */
async function hostileSuite(): Promise<SuiteResult> {
  const qrels: Record<string, Record<string, number>> = {
    [hostile]: { d1: 1, d2: 1 },
    q2: { d3: 2 },
  };
  const run = { [hostile]: ["d1", "d9"], q2: ["d3"] };
  const tool = `search${hostile}`;
  const regression = await detectPromptRegression(
    [
      {
        id: hostile,
        input: "x",
        checks: [{ type: "contains", value: hostile, caseSensitive: false }],
      },
    ],
    { [hostile]: `ok ${hostile}` },
    { [hostile]: "nope" },
  );
  const base: Omit<SuiteResult, "gates"> = {
    name: hostile,
    retrieval: evaluateRetrieval(qrels, run, [1, 5]),
    comparison: compareConfigs(
      qrels,
      [
        { name: `a${hostile}`, run },
        { name: "b", run: { q2: ["d3"] } },
      ],
      "ndcg@5",
      { samples: 200, seed: 1, confidence: 0.9 },
    ),
    toolCalls: checkToolCalls(
      [
        { tool, args: { q: hostile } },
        { tool: "wrong_tool", args: {} },
        { tool: hostile, args: {} },
      ],
      [
        { tool, args: { q: { type: "exact", value: hostile } } },
        { tool: "get_invoice", args: {} },
      ],
      "strict",
    ),
    regression,
  };
  return { ...base, gates: evaluateGates({ "recall@5": 0.99, tool_calls: 1 }, base) };
}

describe("HTML report: structure and policy", async () => {
  const suite = await hostileSuite();
  const html = toHtml(suite);

  it("has exactly the two script elements it defines, whatever the datasets contain", () => {
    expect(html.match(/<script/gi)).toHaveLength(2);
    expect(html.match(/<\/script/gi)).toHaveLength(2);
    expect(html).not.toMatch(/<img|<a\s/i);
    expect(html).toContain("\\u003cimg src=x onerror=");
    expect(html).not.toContain(LS);
    expect(html).not.toContain(ESC);
  });

  it("allows no network and only its own inline script, by hash", () => {
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "";
    const hash = createHash("sha256").update(HTML_CLIENT).digest("base64");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain(`script-src 'sha256-${hash}'`);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("base-uri 'none'");
    expect(html).not.toMatch(/https?:\/\/(?!github\.com\/diegoperezg7|www\.w3\.org\/2000\/svg)/);
  });

  it("embeds data as JSON that cannot close its element and round-trips exactly", () => {
    const value = { s: `</script><!--${LS}&` };
    const embedded = embedJson(value);
    expect(embedded).not.toMatch(/[<>&]/);
    expect(JSON.parse(embedded)).toEqual(value);
  });

  it("page script never turns strings into markup or code", () => {
    expect(HTML_CLIENT).not.toMatch(
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/,
    );
    expect(HTML_CLIENT).not.toContain("`");
  });

  it("derives the verdict, intervals and call statuses from the suite", () => {
    const data = htmlReportData(suite);
    expect(data.meta.verdict).toBe("fail");
    expect(data.meta.reasons).toEqual([
      "2 gates below threshold",
      "prompt regression on 1 case(s)",
      "tool calls do not match",
    ]);
    const recall = data.retrieval!.families.recall!["5"]!;
    expect(recall.low).toBeLessThanOrEqual(recall.value);
    expect(recall.high).toBeGreaterThanOrEqual(recall.value);
    expect(data.toolCalls!.calls.map((c) => c.status)).toEqual([
      "matched",
      "mismatch",
      "unexpected",
    ]);
    expect(data.regression!.perCase[0]!.status).toBe("regressed");
  });

  it("is what generateReport returns for the html format", () => {
    expect(generateReport(suite, "html")).toBe(html);
  });
});

describe("HTML report in a real browser", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  });
  afterAll(async () => {
    await browser?.close();
  });

  async function open(html: string) {
    const file = join(mkdtempSync(join(tmpdir(), "evalsmith-html-")), "report.html");
    writeFileSync(file, html);
    const page = await browser.newPage();
    const errors: string[] = [];
    let dialogs = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("dialog", (d) => {
      dialogs++;
      void d.dismiss();
    });
    await page.goto(pathToFileURL(file).href);
    await page.waitForSelector("footer");
    return { page, errors, dialogs: () => dialogs };
  }

  it("renders dataset text as inert text and executes nothing from it", async () => {
    const { page, errors, dialogs } = await open(toHtml(await hostileSuite()));
    expect(errors).toEqual([]);
    expect(dialogs()).toBe(0);
    expect(await page.evaluate(() => (globalThis as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(await page.locator("img").count()).toBe(0);
    expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
    expect(await page.locator("script").count()).toBe(2);
    expect(await page.locator(".brand-sub").textContent()).toContain("</script><script>");
    expect(await page.locator(".verdict-value").textContent()).toBe("FAIL");

    // The strict mismatch is drawn as a failing link; the extra call is flagged.
    expect(await page.locator(".links line.bad").count()).toBe(1);
    expect(await page.locator(".links line.ok").count()).toBe(1);
    expect(await page.locator(".seq-col.right .node.fail-c").count()).toBe(2);

    // A case expands to show its failing checks, as text.
    const kase = page.locator("details.case").first();
    expect(await kase.locator(".case-body").isVisible()).toBe(false);
    await kase.locator("summary").click();
    expect(await kase.locator(".checks li").last().textContent()).toContain("<img src=x");
  });

  it("renders the example suite as a pass", async () => {
    const { config, baseDir } = loadSuiteConfig("examples/evalsmith.yaml");
    const { page, errors } = await open(toHtml(await runSuite(config, baseDir)));
    expect(errors).toEqual([]);
    expect(await page.locator(".verdict-value").textContent()).toBe("PASS");
    expect(await page.locator(".gate").count()).toBe(3);
    expect(await page.locator(".cmp-row.winner .cfg").textContent()).toContain("hybrid+rerank");
    expect(await page.locator(".links line.ok").count()).toBe(4);
    expect(await page.locator("details.case").count()).toBe(6);
  });

  it("renders an empty suite", async () => {
    const { page, errors } = await open(toHtml({ name: "empty", gates: [] }));
    expect(errors).toEqual([]);
    expect(await page.locator(".verdict-value").textContent()).toBe("PASS");
    expect(await page.locator(".empty").first().textContent()).toContain("No gates");
  });
});
