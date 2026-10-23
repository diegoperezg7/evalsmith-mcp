import { isMetricName } from "./retrieval.js";
import type { GateResult, SuiteResult } from "./schemas.js";

/**
 * Gate names:
 *   recall@5, precision@3, ndcg@10, hit_rate@1, mrr  -> retrieval metrics
 *   tool_calls                                         -> check_tool_calls score
 *   prompt_pass_rate                                   -> candidate pass rate
 * A gate passes when actual >= threshold.
 */
export const EXTRA_GATES = ["tool_calls", "prompt_pass_rate"] as const;

export function isGateName(name: string): boolean {
  return isMetricName(name) || (EXTRA_GATES as readonly string[]).includes(name);
}

/** Parses "recall@5=0.8" into a [name, threshold] pair. */
export function parseGate(spec: string): [string, number] {
  const m = /^\s*([a-z_@0-9]+)\s*=\s*([0-9]*\.?[0-9]+)\s*$/.exec(spec);
  if (!m?.[1] || !m[2]) {
    throw new Error(`Invalid gate "${spec}". Expected metric=value, e.g. recall@5=0.8`);
  }
  if (!isGateName(m[1])) {
    throw new Error(
      `Unknown gate metric "${m[1]}". Use recall@k, precision@k, ndcg@k, hit_rate@k, mrr, tool_calls or prompt_pass_rate.`,
    );
  }
  const threshold = Number(m[2]);
  if (threshold < 0 || threshold > 1) throw new Error(`Gate threshold must be in [0, 1]: ${spec}`);
  return [m[1], threshold];
}

export function actualFor(name: string, suite: Omit<SuiteResult, "gates">): number | null {
  if (name === "tool_calls") return suite.toolCalls?.score ?? null;
  if (name === "prompt_pass_rate") return suite.regression?.candidatePassRate ?? null;
  return suite.retrieval?.metrics[name] ?? null;
}

export function evaluateGates(
  gates: Record<string, number>,
  suite: Omit<SuiteResult, "gates">,
): GateResult[] {
  return Object.entries(gates).map(([metric, threshold]) => {
    const actual = actualFor(metric, suite);
    return { metric, threshold, actual, passed: actual !== null && actual >= threshold };
  });
}

/** A suite fails when any gate fails or the prompt candidate regressed. */
export function suitePassed(suite: SuiteResult): boolean {
  return (
    suite.gates.every((g) => g.passed) &&
    suite.regression?.verdict !== "regressed" &&
    suite.toolCalls?.passed !== false
  );
}
