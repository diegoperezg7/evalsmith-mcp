import { isDeepStrictEqual } from "node:util";
import type { ArgMatcher, ExpectedCall, OrderMode, ToolCall, ToolCallResult } from "./schemas.js";

/** True when every key/value in `expected` is present (recursively) in `actual`. */
export function isSubset(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((item) => actual.some((a) => isSubset(item, a)));
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
    const act = actual as Record<string, unknown>;
    return Object.entries(expected as Record<string, unknown>).every(
      ([key, value]) => Object.hasOwn(act, key) && isSubset(value, act[key]),
    );
  }
  return isDeepStrictEqual(expected, actual);
}

/**
 * Returns null when the argument matches, otherwise a human-readable reason.
 * Every matcher requires the argument to be present, so `exact` with no
 * value cannot pass on a missing argument by comparing undefined to undefined.
 */
export function matchArg(name: string, matcher: ArgMatcher, args: Record<string, unknown>) {
  if (!Object.hasOwn(args, name)) return `missing argument "${name}"`;
  const actual = args[name];
  switch (matcher.type) {
    case "any":
      return null;
    case "exact":
      return isDeepStrictEqual(actual, matcher.value)
        ? null
        : `"${name}": expected ${JSON.stringify(matcher.value)}, got ${JSON.stringify(actual)}`;
    case "regex": {
      const re = new RegExp(matcher.pattern, matcher.flags);
      return typeof actual === "string" && re.test(actual)
        ? null
        : `"${name}": ${JSON.stringify(actual)} does not match /${matcher.pattern}/${matcher.flags ?? ""}`;
    }
    case "subset":
      return isSubset(matcher.value, actual)
        ? null
        : `"${name}": ${JSON.stringify(actual)} does not contain ${JSON.stringify(matcher.value)}`;
  }
}

export function matchCall(expected: ExpectedCall, call: ToolCall): string[] {
  if (expected.tool !== call.tool) return [`expected tool "${expected.tool}", got "${call.tool}"`];
  return Object.entries(expected.args)
    .map(([name, matcher]) => matchArg(name, matcher, call.args))
    .filter((r): r is string => r !== null);
}

/**
 * Maximum bipartite matching between expected calls and trace calls (Kuhn's
 * augmenting paths). A greedy first-fit can miss a valid assignment, e.g. a
 * loose matcher taking the only call a stricter matcher accepts. Candidates
 * are tried in trace order, so the result is deterministic.
 */
function maxMatching(compatible: boolean[][], traceLength: number): (number | null)[] {
  const owner: (number | null)[] = Array.from({ length: traceLength }, () => null);
  const tryAssign = (i: number, seen: Set<number>): boolean => {
    for (let j = 0; j < traceLength; j++) {
      if (!compatible[i]?.[j] || seen.has(j)) continue;
      seen.add(j);
      const current = owner[j];
      if (current === null || current === undefined || tryAssign(current, seen)) {
        owner[j] = i;
        return true;
      }
    }
    return false;
  };
  compatible.forEach((_, i) => tryAssign(i, new Set()));
  const assigned: (number | null)[] = compatible.map(() => null);
  owner.forEach((i, j) => {
    if (i !== null && i !== undefined) assigned[i] = j;
  });
  return assigned;
}

/**
 * strict: position i of the trace must match expected call i, and the trace
 *         must have no extra calls.
 * lax:    expected calls are paired with trace calls by maximum bipartite
 *         matching; order is ignored and extra calls are only reported.
 */
export function checkToolCalls(
  trace: ToolCall[],
  expected: ExpectedCall[],
  order: OrderMode = "strict",
): ToolCallResult {
  let steps: ToolCallResult["steps"];
  if (order === "strict") {
    steps = expected.map((exp, i) => {
      const call = trace[i];
      const reasons = call ? matchCall(exp, call) : [`no call at position ${i + 1}`];
      const passed = reasons.length === 0;
      return { expected: exp.tool, matchedIndex: passed ? i : null, passed, reasons };
    });
  } else {
    const reasons = expected.map((exp) => trace.map((call) => matchCall(exp, call)));
    const assigned = maxMatching(
      reasons.map((row) => row.map((r) => r.length === 0)),
      trace.length,
    );
    steps = expected.map((exp, i) => {
      const j = assigned[i];
      if (j !== null && j !== undefined) {
        return { expected: exp.tool, matchedIndex: j, passed: true, reasons: [] };
      }
      const row = reasons[i] ?? [];
      const why = row.some((r) => r.length === 0)
        ? [`every call that matches "${exp.tool}" is already paired with another expected call`]
        : (row.find((_, k) => trace[k]?.tool === exp.tool) ?? [
            `no call to "${exp.tool}" in the trace`,
          ]);
      return { expected: exp.tool, matchedIndex: null, passed: false, reasons: why };
    });
  }

  // strict: a wrong call at an expected position already fails its step, so
  // only calls past the expected sequence count as unexpected.
  const used = new Set(steps.map((s) => s.matchedIndex).filter((j): j is number => j !== null));
  const unexpected = trace
    .map((call, index) => ({ index, tool: call.tool }))
    .filter(({ index }) => (order === "strict" ? index >= expected.length : !used.has(index)));

  const matched = steps.filter((s) => s.passed).length;
  const score = expected.length === 0 ? 1 : matched / expected.length;
  const passed = matched === expected.length && (order === "lax" || unexpected.length === 0);

  const summary = passed
    ? `All ${expected.length} expected call(s) matched (${order} order)` +
      (unexpected.length > 0 ? `; ${unexpected.length} extra call(s) allowed.` : ".")
    : `${matched}/${expected.length} expected call(s) matched (${order} order)` +
      (order === "strict" && unexpected.length > 0
        ? `; ${unexpected.length} call(s) outside the expected sequence.`
        : ".");

  return { passed, order, score: Math.round(score * 10_000) / 10_000, steps, unexpected, summary };
}
