import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  createOpenAICompatibleJudge,
  detectPromptRegression,
  parseVerdict,
  runCheck,
  type GoldenCase,
} from "../../src/core/index.js";

const load = (f: string) => JSON.parse(readFileSync(`examples/datasets/prompts/${f}`, "utf8"));
const golden: GoldenCase[] = load("golden.json");

describe("runCheck", () => {
  it("exact trims by default", () => {
    expect(runCheck({ type: "exact", value: "INV-1", trim: true }, " INV-1\n")).toBeNull();
    expect(runCheck({ type: "exact", value: "INV-1", trim: false }, " INV-1")).not.toBeNull();
  });

  it("contains is case-insensitive unless asked", () => {
    expect(
      runCheck({ type: "contains", value: "30 Days", caseSensitive: false }, "within 30 days"),
    ).toBeNull();
    expect(
      runCheck({ type: "contains", value: "30 Days", caseSensitive: true }, "within 30 days"),
    ).not.toBeNull();
  });

  it("regex and length", () => {
    expect(runCheck({ type: "regex", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, "2026-11-15")).toBeNull();
    expect(runCheck({ type: "length", min: 3, max: 5 }, "ab")).toBe("length: 2 < min 3");
    expect(runCheck({ type: "length", max: 5 }, "abcdef")).toBe("length: 6 > max 5");
  });

  it("json_schema parses and validates", () => {
    const schema = { type: "object", required: ["a"], properties: { a: { type: "number" } } };
    expect(runCheck({ type: "json_schema", schema }, '{"a": 1}')).toBeNull();
    expect(runCheck({ type: "json_schema", schema }, '{"a": "1"}')).toMatch(/\/a must be number/);
    expect(runCheck({ type: "json_schema", schema }, "here: {}")).toMatch(/not valid JSON/);
  });
});

describe("detectPromptRegression", () => {
  it("finds no regression and one improvement for the example candidate", async () => {
    const r = await detectPromptRegression(golden, load("baseline.json"), load("candidate.json"));
    expect(r.verdict).toBe("pass");
    expect(r.improvements).toEqual(["refund-policy-summary"]);
    expect(r.baselinePassRate).toBe(0.8333);
    expect(r.candidatePassRate).toBe(1);
    expect(r.judge).toBeUndefined();
  });

  it("flags the regressed candidate", async () => {
    const r = await detectPromptRegression(
      golden,
      load("baseline.json"),
      load("candidate-regressed.json"),
    );
    expect(r.verdict).toBe("regressed");
    expect(r.regressions).toEqual(["classify-intent", "due-date-format"]);
    expect(r.perCase.find((c) => c.id === "classify-intent")?.candidate.failures[0]).toMatch(
      /not valid JSON/,
    );
  });

  it("treats a missing output as a failure", async () => {
    const r = await detectPromptRegression(golden.slice(0, 1), load("baseline.json"), {});
    expect(r.perCase[0]?.candidate.failures).toEqual(["missing output"]);
  });
});

describe("LLM judge", () => {
  it("calls the OpenAI-compatible endpoint and maps A/B to baseline/candidate", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: '{"preferred":"B","reason":"shorter"}' } }],
      }),
    );
    const judge = createOpenAICompatibleJudge({
      baseUrl: "http://judge.test/v1/",
      model: "tiny",
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const r = await detectPromptRegression(
      golden.slice(0, 2),
      load("baseline.json"),
      load("candidate.json"),
      judge,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://judge.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
    expect(JSON.parse(init.body as string).temperature).toBe(0);
    expect(r.judge).toEqual({ model: "tiny", baseline: 0, candidate: 2, tie: 0 });
    expect(r.verdict).toBe("pass");
  });

  it("falls back to a tie on unparseable replies", () => {
    expect(parseVerdict("I think B is better")).toEqual({
      preferred: "tie",
      reason: "judge reply was not valid JSON",
    });
    expect(parseVerdict('Sure: {"preferred": "A", "reason": "complete"}').preferred).toBe(
      "baseline",
    );
  });
});
