import { suitePassed, type SuiteResult } from "../../core/index.js";
import { formatTable } from "./table.js";

const num = (v: number | null | undefined) =>
  v === null || v === undefined ? "n/a" : v.toFixed(4);

/** Human-oriented terminal summary of a suite run. */
export function formatSuiteTable(suite: SuiteResult): string {
  const out: string[] = [`evalsmith · ${suite.name}`, ""];

  if (suite.retrieval) {
    const m = suite.retrieval.metrics;
    const ks = [
      ...new Set(
        Object.keys(m)
          .map((k) => k.split("@")[1])
          .filter(Boolean),
      ),
    ] as string[];
    out.push(`Retrieval (${suite.retrieval.queries} queries, MRR ${num(m.mrr)})`);
    out.push(
      formatTable(ks, [
        { header: "k", value: (k) => k, align: "right" },
        { header: "recall", value: (k) => num(m[`recall@${k}`]), align: "right" },
        { header: "precision", value: (k) => num(m[`precision@${k}`]), align: "right" },
        { header: "nDCG", value: (k) => num(m[`ndcg@${k}`]), align: "right" },
        { header: "hit rate", value: (k) => num(m[`hit_rate@${k}`]), align: "right" },
      ]),
      "",
    );
  }

  if (suite.comparison) {
    const c = suite.comparison;
    const pct = Math.round(c.bootstrap.confidence * 100);
    out.push(
      `Comparison on ${c.metric} (paired bootstrap, ${c.bootstrap.samples} samples, seed ${c.bootstrap.seed})`,
    );
    out.push(
      formatTable(c.configs, [
        { header: "#", value: (r) => r.rank, align: "right" },
        { header: "config", value: (r) => r.name },
        { header: c.metric, value: (r) => num(r.interval.mean), align: "right" },
        { header: `${pct}% CI`, value: (r) => `[${num(r.interval.low)}, ${num(r.interval.high)}]` },
      ]),
      c.summary,
      "",
    );
  }

  if (suite.toolCalls) {
    const t = suite.toolCalls;
    out.push(`Agent tool calls (${t.order})`);
    out.push(
      formatTable(t.steps, [
        { header: "expected", value: (s) => s.expected },
        {
          header: "matched",
          value: (s) => (s.matchedIndex === null ? "-" : `#${s.matchedIndex + 1}`),
        },
        { header: "status", value: (s) => (s.passed ? "pass" : "FAIL") },
        { header: "notes", value: (s) => s.reasons.join("; ") || "" },
      ]),
      t.summary,
      "",
    );
  }

  if (suite.regression) {
    const g = suite.regression;
    out.push("Prompt regression");
    out.push(
      formatTable(g.perCase, [
        { header: "case", value: (c) => c.id },
        { header: "baseline", value: (c) => (c.baseline.passed ? "pass" : "fail") },
        { header: "candidate", value: (c) => (c.candidate.passed ? "pass" : "FAIL") },
        { header: "candidate failures", value: (c) => c.candidate.failures.join("; ") },
      ]),
      g.summary,
      "",
    );
  }

  if (suite.gates.length > 0) {
    out.push("Gates");
    out.push(
      formatTable(suite.gates, [
        { header: "metric", value: (g) => g.metric },
        { header: "min", value: (g) => num(g.threshold), align: "right" },
        { header: "actual", value: (g) => num(g.actual), align: "right" },
        { header: "status", value: (g) => (g.passed ? "pass" : "FAIL") },
      ]),
      "",
    );
  }

  const failed = suite.gates.filter((g) => !g.passed).length;
  out.push(
    suitePassed(suite)
      ? "PASS"
      : `FAIL${failed ? ` · ${failed} gate(s) below threshold` : ""}${
          suite.regression?.verdict === "regressed" ? " · prompt regression" : ""
        }${suite.toolCalls?.passed === false ? " · tool calls" : ""}`,
  );
  return out.join("\n");
}
