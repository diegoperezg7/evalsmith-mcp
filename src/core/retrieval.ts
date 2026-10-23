import type { MetricMap, Qrels, RetrievalResult, Run } from "./schemas.js";

/**
 * Classic IR metrics over TREC-style qrels and ranked runs.
 *
 * Conventions (documented in the README):
 * - A document is relevant when its grade is > 0.
 * - Queries with no relevant documents are skipped, as trec_eval does.
 * - Judged queries missing from the run count as an empty ranking (all zeros).
 * - nDCG uses linear gain: DCG@k = sum(rel_i / log2(i + 1)) for i = 1..k.
 */

export const DEFAULT_KS = [1, 3, 5, 10];

export function relevantSet(judgements: Record<string, number>): Set<string> {
  return new Set(
    Object.entries(judgements)
      .filter(([, grade]) => grade > 0)
      .map(([doc]) => doc),
  );
}

function hitsAtK(ranking: string[], relevant: Set<string>, k: number): number {
  let hits = 0;
  for (const doc of ranking.slice(0, k)) if (relevant.has(doc)) hits++;
  return hits;
}

export function recallAtK(ranking: string[], relevant: Set<string>, k: number): number {
  return relevant.size === 0 ? 0 : hitsAtK(ranking, relevant, k) / relevant.size;
}

export function precisionAtK(ranking: string[], relevant: Set<string>, k: number): number {
  return hitsAtK(ranking, relevant, k) / k;
}

export function hitRateAtK(ranking: string[], relevant: Set<string>, k: number): number {
  return hitsAtK(ranking, relevant, k) > 0 ? 1 : 0;
}

export function reciprocalRank(ranking: string[], relevant: Set<string>): number {
  const idx = ranking.findIndex((doc) => relevant.has(doc));
  return idx === -1 ? 0 : 1 / (idx + 1);
}

export function ndcgAtK(ranking: string[], judgements: Record<string, number>, k: number): number {
  const dcg = ranking
    .slice(0, k)
    .reduce((sum, doc, i) => sum + (judgements[doc] ?? 0) / Math.log2(i + 2), 0);
  const ideal = Object.values(judgements)
    .filter((g) => g > 0)
    .sort((a, b) => b - a)
    .slice(0, k)
    .reduce((sum, grade, i) => sum + grade / Math.log2(i + 2), 0);
  return ideal === 0 ? 0 : dcg / ideal;
}

const METRIC_PATTERN = /^(recall|precision|ndcg|hit_rate)@(\d+)$|^mrr$/;

export function isMetricName(name: string): boolean {
  return METRIC_PATTERN.test(name);
}

/** Cut-off referenced by a metric name, e.g. "ndcg@10" -> 10. */
export function metricK(name: string): number | undefined {
  const m = METRIC_PATTERN.exec(name);
  return m?.[2] ? Number(m[2]) : undefined;
}

export function metricNames(ks: number[]): string[] {
  const sorted = [...new Set(ks)].sort((a, b) => a - b);
  const names = ["mrr"];
  for (const family of ["recall", "precision", "ndcg", "hit_rate"]) {
    for (const k of sorted) names.push(`${family}@${k}`);
  }
  return names;
}

export function queryMetric(name: string, ranking: string[], judgements: Record<string, number>) {
  const m = METRIC_PATTERN.exec(name);
  if (!m) throw new Error(`Unknown metric "${name}"`);
  const relevant = relevantSet(judgements);
  if (!m[1]) return reciprocalRank(ranking, relevant);
  const k = Number(m[2]);
  switch (m[1]) {
    case "recall":
      return recallAtK(ranking, relevant, k);
    case "precision":
      return precisionAtK(ranking, relevant, k);
    case "ndcg":
      return ndcgAtK(ranking, judgements, k);
    default:
      return hitRateAtK(ranking, relevant, k);
  }
}

/** Judged query ids that have at least one relevant document, in stable order. */
export function scoredQueries(qrels: Qrels): string[] {
  return Object.keys(qrels)
    .filter((q) => relevantSet(qrels[q] ?? {}).size > 0)
    .sort();
}

export function round(value: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function perQueryScores(qrels: Qrels, run: Run, metric: string): number[] {
  return scoredQueries(qrels).map((q) => queryMetric(metric, run[q] ?? [], qrels[q] ?? {}));
}

export function evaluateRetrieval(
  qrels: Qrels,
  run: Run,
  ks: number[] = DEFAULT_KS,
): RetrievalResult {
  const names = metricNames(ks);
  const queries = scoredQueries(qrels);
  const perQuery = queries.map((queryId) => {
    const ranking = run[queryId] ?? [];
    const judgements = qrels[queryId] ?? {};
    const metrics: MetricMap = {};
    for (const name of names) metrics[name] = round(queryMetric(name, ranking, judgements));
    return { queryId, metrics };
  });

  const metrics: MetricMap = {};
  for (const name of names) {
    metrics[name] = round(
      mean(queries.map((q) => queryMetric(name, run[q] ?? [], qrels[q] ?? {}))),
    );
  }

  return {
    queries: queries.length,
    skippedQueries: Object.keys(qrels)
      .filter((q) => !queries.includes(q))
      .sort(),
    missingFromRun: queries.filter((q) => !(q in run)),
    metrics,
    perQuery,
  };
}
