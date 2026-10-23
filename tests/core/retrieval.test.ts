import { describe, expect, it } from "vitest";

import {
  compareConfigs,
  evaluateRetrieval,
  isMetricName,
  perQueryScores,
  hitRateAtK,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  relevantSet,
} from "../../src/core/index.js";

/*
 * Hand-worked fixture.
 *
 * q1 judgements: a=2, b=1, c=0 (c is judged but not relevant)
 * q1 ranking:    d, a, e, b, c
 *   relevant hits at ranks 2 (a, grade 2) and 4 (b, grade 1)
 *
 * q2 judgements: x=1          ranking: y, z, w   (no hit)
 * q3 judgements: z=0          -> no relevant docs, skipped
 * q4 judgements: m=1          -> absent from the run, scored as empty
 */
const qrels = {
  q1: { a: 2, b: 1, c: 0 },
  q2: { x: 1 },
  q3: { z: 0 },
  q4: { m: 1 },
};
const run = {
  q1: ["d", "a", "e", "b", "c"],
  q2: ["y", "z", "w"],
  q3: ["z"],
};
const q1 = run.q1;
const rel1 = relevantSet(qrels.q1);

describe("per-query metrics (q1)", () => {
  it("treats grade 0 as not relevant", () => {
    expect([...rel1].sort()).toEqual(["a", "b"]);
  });

  it("recall@k = hits in top k / relevant", () => {
    expect(recallAtK(q1, rel1, 1)).toBe(0);
    expect(recallAtK(q1, rel1, 3)).toBe(0.5);
    expect(recallAtK(q1, rel1, 5)).toBe(1);
  });

  it("precision@k = hits in top k / k (k, not ranking length)", () => {
    expect(precisionAtK(q1, rel1, 1)).toBe(0);
    expect(precisionAtK(q1, rel1, 3)).toBeCloseTo(1 / 3, 10);
    expect(precisionAtK(q1, rel1, 5)).toBe(0.4);
    expect(precisionAtK(q1, rel1, 10)).toBe(0.2);
  });

  it("hit rate@k is 1 when any relevant doc is in the top k", () => {
    expect(hitRateAtK(q1, rel1, 1)).toBe(0);
    expect(hitRateAtK(q1, rel1, 2)).toBe(1);
  });

  it("reciprocal rank uses the first relevant doc", () => {
    expect(reciprocalRank(q1, rel1)).toBe(0.5);
    expect(reciprocalRank(["y"], rel1)).toBe(0);
  });

  it("nDCG@3: DCG = 2/log2(3) = 1.26186, IDCG = 2/log2(2) + 1/log2(3) = 2.63093", () => {
    expect(ndcgAtK(q1, qrels.q1, 3)).toBeCloseTo(1.2618595 / 2.6309298, 6);
    expect(ndcgAtK(q1, qrels.q1, 3)).toBeCloseTo(0.479625, 5);
  });

  it("nDCG@5: DCG = 2/log2(3) + 1/log2(5) = 1.69254, same IDCG", () => {
    expect(ndcgAtK(q1, qrels.q1, 5)).toBeCloseTo(0.643325, 5);
  });

  it("nDCG of a single binary hit at rank 3 is 1/log2(4) = 0.5", () => {
    expect(ndcgAtK(["n1", "n2", "hit"], { hit: 1 }, 10)).toBe(0.5);
  });

  it("nDCG is 1 for the ideal ordering and 0 with no relevant docs", () => {
    expect(ndcgAtK(["a", "b"], qrels.q1, 5)).toBe(1);
    expect(ndcgAtK(["a"], { a: 0 }, 5)).toBe(0);
  });
});

describe("evaluateRetrieval (averages over q1, q2, q4)", () => {
  const result = evaluateRetrieval(qrels, run, [3, 5]);

  it("skips queries without relevant docs and reports missing ones", () => {
    expect(result.queries).toBe(3);
    expect(result.skippedQueries).toEqual(["q3"]);
    expect(result.missingFromRun).toEqual(["q4"]);
  });

  it("averages the hand-computed values", () => {
    // q2 and q4 score 0 on everything, so each mean is q1 / 3.
    expect(result.metrics["recall@3"]).toBeCloseTo(0.5 / 3, 4);
    expect(result.metrics["recall@5"]).toBeCloseTo(1 / 3, 4);
    expect(result.metrics["precision@5"]).toBeCloseTo(0.4 / 3, 4);
    expect(result.metrics["hit_rate@3"]).toBeCloseTo(1 / 3, 4);
    expect(result.metrics.mrr).toBeCloseTo(0.5 / 3, 4);
    expect(result.metrics["ndcg@3"]).toBeCloseTo(0.479625 / 3, 4);
    expect(result.metrics["ndcg@5"]).toBeCloseTo(0.643325 / 3, 4);
  });

  it("returns per-query values in stable order", () => {
    expect(result.perQuery.map((p) => p.queryId)).toEqual(["q1", "q2", "q4"]);
    expect(result.perQuery[0]?.metrics["ndcg@5"]).toBeCloseTo(0.6433, 4);
  });
});

describe("robustness", () => {
  it("keeps only the first occurrence of a repeated doc id (trec_eval)", () => {
    const qrels2 = { q1: { d1: 1, d2: 1 } };
    const r = evaluateRetrieval(qrels2, { q1: ["d1", "d1", "d1"] }, [3]);
    // Deduplicated ranking is just [d1]: 1 of 2 relevant found, 1 hit in 3 slots.
    expect(r.metrics["recall@3"]).toBe(0.5);
    expect(r.metrics["precision@3"]).toBeCloseTo(1 / 3, 4);
    expect(r.metrics["ndcg@3"]).toBeCloseTo(1 / (1 + 1 / Math.log2(3)), 4);
    // Without deduplication the top 2 would be d1, d1 and precision@2 would be 1.
    expect(perQueryScores(qrels2, { q1: ["d1", "d1"] }, "precision@2")).toEqual([0.5]);
    for (const v of Object.values(r.metrics)) expect(v).toBeLessThanOrEqual(1);
  });

  it("deduplicates inside compare_configs as well", () => {
    const qrels2 = { q1: { d1: 1, d2: 1 } };
    const res = compareConfigs(
      qrels2,
      [
        { name: "dupes", run: { q1: ["d1", "d1", "d1"] } },
        { name: "clean", run: { q1: ["d1", "d2", "d3"] } },
      ],
      "recall@3",
      { samples: 100, seed: 1, confidence: 0.95 },
    );
    expect(res.winner).toBe("clean");
    expect(res.configs.find((c) => c.name === "dupes")?.interval.mean).toBe(0.5);
  });

  it("rejects a cut-off of 0", () => {
    expect(isMetricName("recall@0")).toBe(false);
    expect(isMetricName("ndcg@01")).toBe(false);
    expect(isMetricName("ndcg@10")).toBe(true);
  });

  it("ignores doc ids that collide with Object.prototype keys", () => {
    expect(ndcgAtK(["constructor", "a"], { a: 1 }, 2)).toBeCloseTo(1 / Math.log2(3), 6);
  });
});
