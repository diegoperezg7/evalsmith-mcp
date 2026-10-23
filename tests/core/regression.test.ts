import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  createOpenAICompatibleJudge,
  detectPromptRegression,
  JudgeError,
  combineVerdicts,
  parsePreference,
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
  const reply = (preferred: string) =>
    Response.json({
      choices: [{ message: { content: `{"preferred":"${preferred}","reason":"r"}` } }],
    });
  const userContent = (init: RequestInit) =>
    (JSON.parse(init.body as string) as { messages: { content: string }[] }).messages[1]!.content;
  const one = golden.filter((c) => c.id === "extract-invoice-id");
  const baseline = { "extract-invoice-id": "INV-2041" };
  const candidate = { "extract-invoice-id": "Invoice INV-2041" };

  it("judges both orderings and maps a consistent preference to the right side", async () => {
    // Prefers whichever answer mentions "Invoice", wherever it is placed.
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) =>
      reply(/Answer A:\nInvoice/.test(userContent(init)) ? "A" : "B"),
    );
    const judge = createOpenAICompatibleJudge({
      baseUrl: "http://judge.test/v1/",
      model: "tiny",
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const r = await detectPromptRegression(one, baseline, candidate, judge);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://judge.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
    expect(JSON.parse(init.body as string).temperature).toBe(0);
    expect(userContent(init)).toMatch(/Answer A:\nINV-2041/);
    expect(userContent(fetchImpl.mock.calls[1]![1])).toMatch(/Answer A:\nInvoice INV-2041/);
    expect(r.judge).toEqual({ model: "tiny", baseline: 0, candidate: 1, tie: 0 });
  });

  it("turns a purely positional preference into a tie", async () => {
    const fetchImpl = vi.fn(async () => reply("A"));
    const judge = createOpenAICompatibleJudge({
      baseUrl: "http://judge.test/v1",
      model: "tiny",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const r = await detectPromptRegression(one, baseline, candidate, judge);
    expect(r.perCase[0]?.judge?.preferred).toBe("tie");
    expect(r.perCase[0]?.judge?.reason).toMatch(/inconsistent across orderings/);
  });

  it("combines verdicts and parses replies defensively", () => {
    const p = (preferred: "A" | "B" | "tie") => ({ preferred, reason: "" });
    expect(combineVerdicts(p("A"), p("B")).preferred).toBe("baseline");
    expect(combineVerdicts(p("B"), p("A")).preferred).toBe("candidate");
    expect(combineVerdicts(p("tie"), p("tie")).preferred).toBe("tie");
    expect(combineVerdicts(p("A"), p("tie")).preferred).toBe("tie");
    expect(parsePreference("I think B is better")).toEqual({
      preferred: "tie",
      reason: "judge reply was not valid JSON",
    });
    expect(parsePreference('Sure: {"preferred": "A", "reason": "complete"}').preferred).toBe("A");
  });

  it("raises JudgeError on HTTP errors and unreachable endpoints", async () => {
    const down = createOpenAICompatibleJudge({
      baseUrl: "http://judge.test/v1",
      model: "tiny",
      fetchImpl: (async () => new Response("boom", { status: 503 })) as unknown as typeof fetch,
    });
    await expect(down.compare(one[0]!, "a", "b")).rejects.toThrow(JudgeError);
    await expect(down.compare(one[0]!, "a", "b")).rejects.toThrow(/HTTP 503/);

    const offline = createOpenAICompatibleJudge({
      baseUrl: "http://judge.test/v1",
      model: "tiny",
      fetchImpl: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    });
    await expect(offline.compare(one[0]!, "a", "b")).rejects.toThrow(/unreachable: fetch failed/);
  });
});
