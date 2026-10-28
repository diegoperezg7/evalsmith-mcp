import { createHash } from "node:crypto";

import { VERSION } from "../shared/version.js";
import { pairedBootstrap } from "./compare.js";
import { suitePassed } from "./gates.js";
import { HTML_CLIENT, HTML_STYLE } from "./reportHtmlAssets.js";
import { round } from "./retrieval.js";
import type { BootstrapOptions, SuiteResult } from "./schemas.js";

interface Interval {
  value: number;
  low: number;
  high: number;
}

/** What the page script receives. Built from the suite result only; every string is data. */
export interface HtmlReportData {
  meta: { name: string; version: string; verdict: "pass" | "fail"; reasons: string[] };
  gates: { metric: string; threshold: number; actual: number | null; passed: boolean }[];
  retrieval: {
    queries: number;
    missing: string[];
    skipped: string[];
    confidence: number;
    samples: number;
    ks: number[];
    families: Record<string, Record<string, Interval>>;
    mrr: Interval | null;
  } | null;
  comparison: {
    metric: string;
    confidence: number;
    samples: number;
    seed: number;
    configs: { name: string; rank: number; value: number; low: number; high: number }[];
    winner: string;
    runnerUp: string;
    delta: Interval;
    significant: boolean;
    summary: string;
  } | null;
  toolCalls: {
    order: "strict" | "lax";
    passed: boolean;
    score: number;
    summary: string;
    expected: { tool: string; matchedIndex: number | null; passed: boolean; reasons: string[] }[];
    calls: { tool: string; status: "matched" | "mismatch" | "unexpected" | "extra" }[];
  } | null;
  regression: {
    verdict: "pass" | "regressed";
    cases: number;
    baselinePassRate: number;
    candidatePassRate: number;
    summary: string;
    judge: { model: string; baseline: number; candidate: number; tie: number } | null;
    perCase: {
      id: string;
      status: "regressed" | "improved" | "pass" | "fail";
      baseline: { passed: boolean; failures: string[] };
      candidate: { passed: boolean; failures: string[] };
      judge: { preferred: string; reason: string } | null;
    }[];
  } | null;
}

const DEFAULT_BOOTSTRAP: BootstrapOptions = { samples: 1000, seed: 42, confidence: 0.95 };
const FAMILIES = ["recall", "precision", "ndcg", "hit_rate"];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i] ?? 0;
}

/** Why the suite failed, in the order the gates and checks are listed. */
export function failureReasons(suite: SuiteResult): string[] {
  const reasons: string[] = [];
  const failed = suite.gates.filter((g) => !g.passed);
  if (failed.length)
    reasons.push(`${failed.length} gate${failed.length === 1 ? "" : "s"} below threshold`);
  if (suite.regression?.verdict === "regressed")
    reasons.push(`prompt regression on ${suite.regression.regressions.length} case(s)`);
  if (suite.toolCalls?.passed === false) reasons.push("tool calls do not match");
  return reasons;
}

/** Bootstrap intervals for every retrieval metric, resampling the judged queries. */
function retrievalData(suite: SuiteResult): HtmlReportData["retrieval"] {
  const r = suite.retrieval;
  if (!r) return null;
  const opts = suite.comparison?.bootstrap ?? DEFAULT_BOOTSTRAP;
  const names = Object.keys(r.metrics);
  const series = names.map((n) => r.perQuery.map((q) => q.metrics[n] ?? 0));
  const means = r.perQuery.length ? pairedBootstrap(series, opts) : names.map(() => []);
  const alpha = (1 - opts.confidence) / 2;
  const intervals: Record<string, Interval> = {};
  names.forEach((name, i) => {
    const sorted = [...(means[i] ?? [])].sort((a, b) => a - b);
    const value = r.metrics[name] ?? 0;
    intervals[name] = sorted.length
      ? {
          value,
          low: round(percentile(sorted, alpha)),
          high: round(percentile(sorted, 1 - alpha)),
        }
      : { value, low: value, high: value };
  });

  const ks = [
    ...new Set(names.map((n) => Number(n.split("@")[1])).filter((k) => Number.isInteger(k))),
  ].sort((a, b) => a - b);
  const families: Record<string, Record<string, Interval>> = {};
  for (const f of FAMILIES) {
    const row: Record<string, Interval> = {};
    for (const k of ks) {
      const v = intervals[`${f}@${k}`];
      if (v) row[String(k)] = v;
    }
    if (Object.keys(row).length) families[f] = row;
  }
  return {
    queries: r.queries,
    missing: r.missingFromRun,
    skipped: r.skippedQueries,
    confidence: opts.confidence,
    samples: opts.samples,
    ks,
    families,
    mrr: intervals.mrr ?? null,
  };
}

function toolCallData(suite: SuiteResult): HtmlReportData["toolCalls"] {
  const t = suite.toolCalls;
  if (!t) return null;
  const matched = new Set(t.steps.map((s) => s.matchedIndex).filter((j) => j !== null));
  const unexpected = new Set(t.unexpected.map((u) => u.index));
  // Results produced before `calls` existed: rebuild what is known of the trace.
  const names =
    t.calls ??
    (() => {
      const out: string[] = [];
      t.steps.forEach((s) => {
        if (s.matchedIndex !== null) out[s.matchedIndex] = s.expected;
      });
      t.unexpected.forEach((u) => (out[u.index] = u.tool));
      return Array.from(out, (n) => n ?? "?");
    })();
  return {
    order: t.order,
    passed: t.passed,
    score: t.score,
    summary: t.summary,
    expected: t.steps.map((s) => ({
      tool: s.expected,
      matchedIndex: s.matchedIndex,
      passed: s.passed,
      reasons: s.reasons,
    })),
    calls: names.map((tool, i) => ({
      tool,
      status: matched.has(i)
        ? "matched"
        : unexpected.has(i)
          ? t.order === "strict"
            ? "unexpected"
            : "extra"
          : "mismatch",
    })),
  };
}

export function htmlReportData(suite: SuiteResult): HtmlReportData {
  const c = suite.comparison;
  const g = suite.regression;
  return {
    meta: {
      name: suite.name,
      version: VERSION,
      verdict: suitePassed(suite) ? "pass" : "fail",
      reasons: failureReasons(suite),
    },
    gates: suite.gates.map((x) => ({ ...x })),
    retrieval: retrievalData(suite),
    comparison: c
      ? {
          metric: c.metric,
          confidence: c.bootstrap.confidence,
          samples: c.bootstrap.samples,
          seed: c.bootstrap.seed,
          configs: c.configs.map((row) => ({
            name: row.name,
            rank: row.rank,
            value: row.interval.mean,
            low: row.interval.low,
            high: row.interval.high,
          })),
          winner: c.winner,
          runnerUp: c.runnerUp,
          delta: { value: c.delta.mean, low: c.delta.low, high: c.delta.high },
          significant: c.significant,
          summary: c.summary,
        }
      : null,
    toolCalls: toolCallData(suite),
    regression: g
      ? {
          verdict: g.verdict,
          cases: g.cases,
          baselinePassRate: g.baselinePassRate,
          candidatePassRate: g.candidatePassRate,
          summary: g.summary,
          judge: g.judge ?? null,
          perCase: g.perCase.map((row) => ({
            id: row.id,
            status:
              row.baseline.passed && !row.candidate.passed
                ? "regressed"
                : !row.baseline.passed && row.candidate.passed
                  ? "improved"
                  : row.candidate.passed
                    ? "pass"
                    : "fail",
            baseline: row.baseline,
            candidate: row.candidate,
            judge: row.judge ?? null,
          })),
        }
      : null,
  };
}

/** JSON that cannot end the surrounding <script> element or break out of it. */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * A self-contained HTML report: one file, no network, CSS and JS inline.
 *
 * Dataset text (case ids, tool names, failure messages) never becomes markup.
 * It travels as JSON inside a non-executable <script type="application/json">
 * block, escaped so it cannot close the block, and the page script renders it
 * with textContent only. A Content-Security-Policy meta tag allows no network
 * access and only the one inline script, by hash.
 */
export function toHtml(suite: SuiteResult): string {
  const json = embedJson(htmlReportData(suite));
  const scriptHash = createHash("sha256").update(HTML_CLIENT).digest("base64");
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `script-src 'sha256-${scriptHash}'`,
    "img-src data:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>evalsmith report</title>
<style>${HTML_STYLE}</style>
</head>
<body>
<noscript><p class="noscript">This report renders with JavaScript. The raw results are in the JSON block of this file, or run evalsmith with --format json.</p></noscript>
<div id="app"></div>
<script type="application/json" id="report-data">${json}</script>
<script>${HTML_CLIENT}</script>
</body>
</html>
`;
}
