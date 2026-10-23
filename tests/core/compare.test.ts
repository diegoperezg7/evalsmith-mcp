import { describe, expect, it } from "vitest";

import { compareConfigs, seededRandom } from "../../src/core/index.js";

const qrels: Record<string, Record<string, number>> = {};
const good: Record<string, string[]> = {};
const bad: Record<string, string[]> = {};
for (let i = 0; i < 20; i++) {
  qrels[`q${i}`] = { [`rel${i}`]: 1 };
  good[`q${i}`] = [`rel${i}`, "x", "y"];
  bad[`q${i}`] = i % 4 === 0 ? [`rel${i}`, "x"] : ["x", "y", "z", `rel${i}`];
}
const opts = { samples: 500, seed: 7, confidence: 0.95 };

describe("seededRandom", () => {
  it("is reproducible for a seed and differs across seeds", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const c = seededRandom(43);
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe("compareConfigs", () => {
  const configs = [
    { name: "bad", run: bad },
    { name: "good", run: good },
  ];

  it("ranks by the primary metric and flags a clear win as significant", () => {
    const r = compareConfigs(qrels, configs, "mrr", opts);
    expect(r.winner).toBe("good");
    expect(r.runnerUp).toBe("bad");
    expect(r.configs[0]?.interval.mean).toBe(1);
    // bad: 5 queries with RR 1, 15 with RR 1/4 -> (5 + 3.75) / 20 = 0.4375
    expect(r.configs[1]?.interval.mean).toBe(0.4375);
    expect(r.delta.mean).toBe(0.5625);
    expect(r.significant).toBe(true);
    expect(r.delta.low).toBeGreaterThan(0);
  });

  it("is deterministic for a fixed seed", () => {
    const a = compareConfigs(qrels, configs, "ndcg@3", opts);
    const b = compareConfigs(qrels, configs, "ndcg@3", opts);
    expect(a).toEqual(b);
  });

  it("intervals contain the point estimate", () => {
    const r = compareConfigs(qrels, configs, "recall@1", opts);
    for (const c of r.configs) {
      expect(c.interval.low).toBeLessThanOrEqual(c.interval.mean);
      expect(c.interval.high).toBeGreaterThanOrEqual(c.interval.mean);
    }
  });

  it("does not call identical runs significant", () => {
    const r = compareConfigs(
      qrels,
      [
        { name: "a", run: good },
        { name: "b", run: good },
      ],
      "mrr",
      opts,
    );
    expect(r.delta).toEqual({ mean: 0, low: 0, high: 0 });
    expect(r.significant).toBe(false);
  });

  it("computes the cut-off of the primary metric even if not in k", () => {
    const r = compareConfigs(qrels, configs, "recall@4", opts, [1]);
    expect(r.configs[1]?.metrics["recall@4"]).toBe(1);
  });

  it("rejects bad input", () => {
    expect(() => compareConfigs(qrels, configs, "f1@5", opts)).toThrow(/Unknown metric/);
    expect(() => compareConfigs(qrels, [configs[0]!, configs[0]!], "mrr", opts)).toThrow(/unique/);
    expect(() => compareConfigs({ q: { d: 0 } }, configs, "mrr", opts)).toThrow(/no relevant/);
  });
});
