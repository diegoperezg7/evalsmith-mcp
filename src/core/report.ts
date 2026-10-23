import { suitePassed } from "./gates.js";
import type { SuiteResult } from "./schemas.js";

export type ReportFormat = "markdown" | "json" | "junit";

const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? "n/a" : v.toFixed(4);

function table(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => String(v).replace(/\|/g, "\\|");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`),
  ].join("\n");
}

export function toMarkdown(suite: SuiteResult): string {
  const out: string[] = [
    `# ${suite.name}`,
    "",
    `**Result: ${suitePassed(suite) ? "PASS" : "FAIL"}**`,
  ];

  if (suite.gates.length > 0) {
    out.push(
      "",
      "## Gates",
      "",
      table(
        ["Metric", "Threshold", "Actual", "Status"],
        suite.gates.map((g) => [
          g.metric,
          fmt(g.threshold),
          fmt(g.actual),
          g.passed ? "pass" : "FAIL",
        ]),
      ),
    );
  }

  if (suite.retrieval) {
    const r = suite.retrieval;
    out.push(
      "",
      "## Retrieval",
      "",
      `${r.queries} judged queries` +
        (r.missingFromRun.length ? `, ${r.missingFromRun.length} missing from the run` : "") +
        ".",
      "",
      table(
        ["Metric", "Value"],
        Object.entries(r.metrics).map(([k, v]) => [k, fmt(v)]),
      ),
    );
  }

  if (suite.comparison) {
    const c = suite.comparison;
    out.push(
      "",
      `## Configuration comparison (${c.metric})`,
      "",
      table(
        ["Rank", "Config", c.metric, `${Math.round(c.bootstrap.confidence * 100)}% interval`],
        c.configs.map((row) => [
          row.rank,
          row.name,
          fmt(row.interval.mean),
          `[${fmt(row.interval.low)}, ${fmt(row.interval.high)}]`,
        ]),
      ),
      "",
      c.summary,
    );
  }

  if (suite.toolCalls) {
    const t = suite.toolCalls;
    out.push(
      "",
      "## Agent tool calls",
      "",
      table(
        ["#", "Expected", "Matched at", "Status", "Notes"],
        t.steps.map((s, i) => [
          i + 1,
          s.expected,
          s.matchedIndex === null ? "-" : s.matchedIndex + 1,
          s.passed ? "pass" : "FAIL",
          s.reasons.join("; ") || "-",
        ]),
      ),
      "",
      t.summary,
    );
  }

  if (suite.regression) {
    const g = suite.regression;
    out.push(
      "",
      "## Prompt regression",
      "",
      table(
        ["Case", "Baseline", "Candidate", "Candidate failures"],
        g.perCase.map((c) => [
          c.id,
          c.baseline.passed ? "pass" : "fail",
          c.candidate.passed ? "pass" : "FAIL",
          c.candidate.failures.join("; ") || "-",
        ]),
      ),
      "",
      g.summary,
    );
  }

  return out.join("\n") + "\n";
}

function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type Case = { name: string; failure?: string };

function suiteXml(name: string, cases: Case[]): string {
  const failures = cases.filter((c) => c.failure !== undefined).length;
  const body = cases
    .map((c) =>
      c.failure === undefined
        ? `    <testcase classname="${xml(name)}" name="${xml(c.name)}"/>`
        : `    <testcase classname="${xml(name)}" name="${xml(c.name)}">\n      <failure message="${xml(c.failure)}"/>\n    </testcase>`,
    )
    .join("\n");
  return `  <testsuite name="${xml(name)}" tests="${cases.length}" failures="${failures}">\n${body}\n  </testsuite>`;
}

/** JUnit XML understood by GitHub Actions reporters, GitLab and Jenkins. */
export function toJUnit(suite: SuiteResult): string {
  const suites: string[] = [];
  if (suite.gates.length > 0) {
    suites.push(
      suiteXml(
        "gates",
        suite.gates.map((g) => ({
          name: `${g.metric} >= ${g.threshold}`,
          failure: g.passed ? undefined : `${g.metric} = ${fmt(g.actual)}, below ${g.threshold}`,
        })),
      ),
    );
  }
  if (suite.toolCalls) {
    suites.push(
      suiteXml(
        "tool_calls",
        suite.toolCalls.steps.map((s, i) => ({
          name: `step ${i + 1}: ${s.expected}`,
          failure: s.passed ? undefined : s.reasons.join("; "),
        })),
      ),
    );
  }
  if (suite.regression) {
    suites.push(
      suiteXml(
        "prompt_regression",
        suite.regression.perCase.map((c) => ({
          name: c.id,
          failure:
            c.baseline.passed && !c.candidate.passed
              ? `regression: ${c.candidate.failures.join("; ")}`
              : undefined,
        })),
      ),
    );
  }
  const tests = suites.join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="${xml(suite.name)}">\n${tests}\n</testsuites>\n`;
}

export function generateReport(suite: SuiteResult, format: ReportFormat): string {
  if (format === "json")
    return JSON.stringify({ passed: suitePassed(suite), ...suite }, null, 2) + "\n";
  if (format === "junit") return toJUnit(suite);
  return toMarkdown(suite);
}
