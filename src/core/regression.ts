import { Ajv } from "ajv";
import type { Check, GoldenCase, JudgeVerdict, Outputs, RegressionResult } from "./schemas.js";

const ajv = new Ajv({ allErrors: true, strict: false });

/** Returns null when the output satisfies the check, otherwise why it failed. */
export function runCheck(check: Check, output: string): string | null {
  switch (check.type) {
    case "exact": {
      const a = check.trim ? output.trim() : output;
      const b = check.trim ? check.value.trim() : check.value;
      return a === b ? null : `exact: output differs from ${JSON.stringify(check.value)}`;
    }
    case "regex":
      return new RegExp(check.pattern, check.flags).test(output)
        ? null
        : `regex: no match for /${check.pattern}/${check.flags ?? ""}`;
    case "contains": {
      const hay = check.caseSensitive ? output : output.toLowerCase();
      const needle = check.caseSensitive ? check.value : check.value.toLowerCase();
      return hay.includes(needle) ? null : `contains: missing ${JSON.stringify(check.value)}`;
    }
    case "json_schema": {
      let parsed: unknown;
      try {
        parsed = JSON.parse(output);
      } catch {
        return "json_schema: output is not valid JSON";
      }
      const validate = ajv.compile(check.schema);
      if (validate(parsed)) return null;
      const first = validate.errors?.[0];
      return `json_schema: ${first?.instancePath || "/"} ${first?.message ?? "invalid"}`;
    }
    case "length": {
      const n = output.length;
      if (check.min !== undefined && n < check.min) return `length: ${n} < min ${check.min}`;
      if (check.max !== undefined && n > check.max) return `length: ${n} > max ${check.max}`;
      return null;
    }
  }
}

export function evaluateOutput(c: GoldenCase, output: string | undefined) {
  if (output === undefined) return { passed: false, failures: ["missing output"] };
  const failures = c.checks.map((ch) => runCheck(ch, output)).filter((f): f is string => !!f);
  return { passed: failures.length === 0, failures };
}

export type Judge = {
  model: string;
  compare: (c: GoldenCase, baseline: string, candidate: string) => Promise<JudgeVerdict>;
};

export async function detectPromptRegression(
  golden: GoldenCase[],
  baseline: Outputs,
  candidate: Outputs,
  judge?: Judge,
): Promise<RegressionResult> {
  const perCase: RegressionResult["perCase"] = [];
  for (const c of golden) {
    const row: RegressionResult["perCase"][number] = {
      id: c.id,
      baseline: evaluateOutput(c, baseline[c.id]),
      candidate: evaluateOutput(c, candidate[c.id]),
    };
    if (judge && baseline[c.id] !== undefined && candidate[c.id] !== undefined) {
      row.judge = await judge.compare(c, baseline[c.id] ?? "", candidate[c.id] ?? "");
    }
    perCase.push(row);
  }

  const rate = (side: "baseline" | "candidate") =>
    golden.length === 0
      ? 1
      : Math.round((perCase.filter((r) => r[side].passed).length / golden.length) * 10_000) /
        10_000;
  const regressions = perCase
    .filter((r) => r.baseline.passed && !r.candidate.passed)
    .map((r) => r.id);
  const improvements = perCase
    .filter((r) => !r.baseline.passed && r.candidate.passed)
    .map((r) => r.id);

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const result: RegressionResult = {
    verdict: regressions.length > 0 ? "regressed" : "pass",
    cases: golden.length,
    baselinePassRate: rate("baseline"),
    candidatePassRate: rate("candidate"),
    regressions,
    improvements,
    perCase,
    summary:
      regressions.length > 0
        ? `Candidate regressed on ${regressions.length} case(s): ${regressions.join(", ")}. Pass rate ${pct(rate("baseline"))} -> ${pct(rate("candidate"))}.`
        : `No regressions across ${golden.length} case(s). Pass rate ${pct(rate("baseline"))} -> ${pct(rate("candidate"))}.`,
  };

  if (judge) {
    const votes = { baseline: 0, candidate: 0, tie: 0 };
    for (const r of perCase) if (r.judge) votes[r.judge.preferred]++;
    result.judge = { model: judge.model, ...votes };
  }
  return result;
}
