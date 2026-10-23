import { describe, expect, it } from "vitest";

import {
  evaluateGates,
  generateReport,
  loadSuiteConfig,
  parseGate,
  runSuite,
  suitePassed,
  type SuiteResult,
} from "../../src/core/index.js";

async function exampleSuite(gates: Record<string, number> = {}): Promise<SuiteResult> {
  const { config, baseDir } = loadSuiteConfig("examples/evalsmith.yaml");
  return runSuite(config, baseDir, { gates });
}

describe("gates", () => {
  it("parses metric=value", () => {
    expect(parseGate("recall@5=0.8")).toEqual(["recall@5", 0.8]);
    expect(parseGate(" tool_calls = 1 ")).toEqual(["tool_calls", 1]);
  });

  it("rejects unknown metrics and out-of-range thresholds", () => {
    expect(() => parseGate("f1=0.5")).toThrow(/Unknown gate metric/);
    expect(() => parseGate("recall@5=1.5")).toThrow(/\[0, 1\]/);
    expect(() => parseGate("recall@5")).toThrow(/Expected metric=value/);
  });

  it("a gate on a missing section fails with a null actual", () => {
    expect(evaluateGates({ tool_calls: 1 }, { name: "x" })).toEqual([
      { metric: "tool_calls", threshold: 1, actual: null, passed: false },
    ]);
  });
});

describe("suite + reports", () => {
  it("the example suite passes its own gates", async () => {
    const suite = await exampleSuite();
    expect(suite.retrieval?.metrics["recall@5"]).toBe(0.9167);
    expect(suite.comparison?.winner).toBe("hybrid+rerank");
    expect(suite.gates.every((g) => g.passed)).toBe(true);
    expect(suitePassed(suite)).toBe(true);
  });

  it("computes cut-offs that only a gate references", async () => {
    const suite = await exampleSuite({ "recall@2": 0.1 });
    expect(suite.retrieval?.metrics["recall@2"]).toBeTypeOf("number");
  });

  it("command-line gates override file gates", async () => {
    const suite = await exampleSuite({ "recall@5": 0.95 });
    const gate = suite.gates.find((g) => g.metric === "recall@5");
    expect(gate).toMatchObject({ threshold: 0.95, passed: false });
    expect(suitePassed(suite)).toBe(false);
  });

  it("renders well-formed JUnit with failures", async () => {
    const suite = await exampleSuite({ "recall@5": 0.95 });
    const xml = generateReport(suite, "junit");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<testsuite name="gates" tests="3" failures="1">');
    expect(xml).toContain('<failure message="recall@5 = 0.9167, below 0.95"/>');
    expect(xml).toContain('<testsuite name="prompt_regression" tests="6" failures="0">');
    expect((xml.match(/<testsuite /g) ?? []).length).toBe(
      (xml.match(/<\/testsuite>/g) ?? []).length,
    );
  });

  it("escapes XML special characters", () => {
    const xml = generateReport(
      { name: 'a<b & "c"', gates: [{ metric: "mrr", threshold: 0.5, actual: 0.1, passed: false }] },
      "junit",
    );
    expect(xml).toContain('<testsuites name="a&lt;b &amp; &quot;c&quot;">');
  });

  it("renders Markdown and JSON", async () => {
    const suite = await exampleSuite();
    const md = generateReport(suite, "markdown");
    expect(md).toContain("**Result: PASS**");
    expect(md).toContain("| recall@5 | 0.8000 | 0.9167 | pass |");
    expect(JSON.parse(generateReport(suite, "json")).passed).toBe(true);
  });
});
