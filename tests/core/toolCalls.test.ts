import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  type ArgMatcher,
  checkToolCalls,
  isSubset,
  matchArg,
  type ExpectedCall,
  type ToolCall,
} from "../../src/core/index.js";

const load = (f: string) => JSON.parse(readFileSync(`examples/datasets/agent/${f}`, "utf8"));
const trace: ToolCall[] = load("trace.json");
const expected: ExpectedCall[] = load("expected.json");

describe("argument matchers", () => {
  const args = { q: "Acme Robotics", n: 5, meta: { a: 1, b: { c: [1, 2, 3] } } };

  it("exact uses deep equality", () => {
    expect(matchArg("n", { type: "exact", value: 5 }, args)).toBeNull();
    expect(matchArg("n", { type: "exact", value: "5" }, args)).toMatch(/expected "5"/);
  });

  it("regex only matches strings", () => {
    expect(matchArg("q", { type: "regex", pattern: "^acme", flags: "i" }, args)).toBeNull();
    expect(matchArg("n", { type: "regex", pattern: "5" }, args)).toMatch(/does not match/);
  });

  it("subset matches nested objects and array members", () => {
    expect(matchArg("meta", { type: "subset", value: { b: { c: [3] } } }, args)).toBeNull();
    expect(matchArg("meta", { type: "subset", value: { b: { c: [4] } } }, args)).not.toBeNull();
    expect(isSubset({ a: 1 }, [{ a: 1 }])).toBe(false);
  });

  it("exact without a value does not accept a missing argument", () => {
    expect(matchArg("missing", { type: "exact" } as ArgMatcher, args)).toBe(
      'missing argument "missing"',
    );
    expect(matchArg("missing", { type: "subset", value: undefined }, args)).toMatch(/missing/);
  });

  it("only looks at own properties, not the prototype chain", () => {
    expect(matchArg("constructor", { type: "any" }, {})).toBe('missing argument "constructor"');
    expect(isSubset({ toString: 1 }, {})).toBe(false);
  });

  it("any only requires presence", () => {
    expect(matchArg("q", { type: "any" }, args)).toBeNull();
    expect(matchArg("missing", { type: "any" }, args)).toMatch(/missing argument/);
  });
});

describe("checkToolCalls", () => {
  it("passes the example trace in strict order", () => {
    const r = checkToolCalls(trace, expected, "strict");
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
    expect(r.steps.map((s) => s.matchedIndex)).toEqual([0, 1, 2, 3]);
  });

  it("strict fails when two calls swap places; lax still passes", () => {
    const swapped = [trace[1]!, trace[0]!, trace[2]!, trace[3]!];
    const strict = checkToolCalls(swapped, expected, "strict");
    expect(strict.passed).toBe(false);
    expect(strict.score).toBe(0.5);
    expect(strict.steps[0]?.reasons[0]).toMatch(/expected tool "search_customers"/);

    const lax = checkToolCalls(swapped, expected, "lax");
    expect(lax.passed).toBe(true);
    expect(lax.steps.map((s) => s.matchedIndex)).toEqual([1, 0, 2, 3]);
  });

  it("strict rejects extra calls; lax reports them but passes", () => {
    const extra = [...trace, { tool: "log_event", args: {} }];
    expect(checkToolCalls(extra, expected, "strict").passed).toBe(false);
    const lax = checkToolCalls(extra, expected, "lax");
    expect(lax.passed).toBe(true);
    expect(lax.unexpected).toEqual([{ index: 4, tool: "log_event" }]);
  });

  it("explains argument mismatches on the right tool", () => {
    const wrongAmount = trace.map((c) =>
      c.tool === "create_refund" ? { ...c, args: { ...c.args, amount: 12 } } : c,
    );
    const r = checkToolCalls(wrongAmount, expected, "lax");
    expect(r.passed).toBe(false);
    expect(r.steps[2]?.reasons).toEqual(['"amount": expected 120, got 12']);
  });

  it("reports a missing call", () => {
    const r = checkToolCalls(trace.slice(0, 3), expected, "strict");
    expect(r.steps[3]?.reasons).toEqual(["no call at position 4"]);
    expect(r.score).toBe(0.75);
  });

  it("lax uses bipartite matching instead of greedy first-fit", () => {
    // Greedy pairs expected[0] (any) with call 0, leaving nothing for expected[1] (exact "a").
    const r = checkToolCalls(
      [
        { tool: "search", args: { q: "a" } },
        { tool: "search", args: { q: "b" } },
      ],
      [
        { tool: "search", args: { q: { type: "any" } } },
        { tool: "search", args: { q: { type: "exact", value: "a" } } },
      ],
      "lax",
    );
    expect(r.passed).toBe(true);
    expect(r.steps.map((s) => s.matchedIndex)).toEqual([1, 0]);
  });

  it("lax explains a call that exists but is needed elsewhere", () => {
    const r = checkToolCalls(
      [{ tool: "search", args: { q: "a" } }],
      [
        { tool: "search", args: { q: { type: "exact", value: "a" } } },
        { tool: "search", args: { q: { type: "any" } } },
      ],
      "lax",
    );
    expect(r.score).toBe(0.5);
    expect(r.steps[1]?.reasons[0]).toMatch(/already paired/);
  });

  it("strict counts only calls past the expected sequence as unexpected", () => {
    const swapped = [trace[1]!, trace[0]!, trace[2]!, trace[3]!, { tool: "log_event", args: {} }];
    const r = checkToolCalls(swapped, expected, "strict");
    expect(r.unexpected).toEqual([{ index: 4, tool: "log_event" }]);
  });
});
