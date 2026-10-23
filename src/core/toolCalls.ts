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
      ([key, value]) => key in act && isSubset(value, act[key]),
    );
  }
  return isDeepStrictEqual(expected, actual);
}

/** Returns null when the argument matches, otherwise a human-readable reason. */
export function matchArg(name: string, matcher: ArgMatcher, args: Record<string, unknown>) {
  const present = name in args;
  const actual = args[name];
  switch (matcher.type) {
    case "any":
      return present ? null : `missing argument "${name}"`;
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
 * strict: position i of the trace must match expected call i, and the trace
 *         must have no extra calls.
 * lax:    each expected call is matched to the first unused trace call that
 *         satisfies it; order is ignored and extra calls are only reported.
 */
export function checkToolCalls(
  trace: ToolCall[],
  expected: ExpectedCall[],
  order: OrderMode = "strict",
): ToolCallResult {
  const used = new Set<number>();
  const steps: ToolCallResult["steps"] = expected.map((exp, i) => {
    if (order === "strict") {
      const call = trace[i];
      const reasons = call ? matchCall(exp, call) : [`no call at position ${i + 1}`];
      if (reasons.length === 0) used.add(i);
      return {
        expected: exp.tool,
        matchedIndex: reasons.length === 0 ? i : null,
        passed: reasons.length === 0,
        reasons,
      };
    }
    let closest: string[] | undefined;
    for (let j = 0; j < trace.length; j++) {
      const call = trace[j];
      if (used.has(j) || !call) continue;
      const reasons = matchCall(exp, call);
      if (reasons.length === 0) {
        used.add(j);
        return { expected: exp.tool, matchedIndex: j, passed: true, reasons: [] };
      }
      if (call.tool === exp.tool && !closest) closest = reasons;
    }
    return {
      expected: exp.tool,
      matchedIndex: null,
      passed: false,
      reasons: closest ?? [`no call to "${exp.tool}" in the trace`],
    };
  });

  const unexpected = trace
    .map((call, index) => ({ index, tool: call.tool }))
    .filter(({ index }) => !used.has(index));

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
