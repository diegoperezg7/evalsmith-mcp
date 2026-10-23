import {
  DEFAULT_KS,
  evaluateRetrieval,
  isMetricName,
  mean,
  metricK,
  perQueryScores,
  round,
  scoredQueries,
} from "./retrieval.js";
import type { BootstrapOptions, ComparisonResult, ConfigRun, Qrels } from "./schemas.js";

/** mulberry32: tiny seeded PRNG so bootstrap intervals are reproducible across runs and machines. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx] ?? 0;
}

/**
 * Paired bootstrap over queries: every resample draws the same query indices
 * for all series, so per-config intervals and the winner-vs-runner-up delta
 * come from the same resampled sets.
 */
export function pairedBootstrap(series: number[][], opts: BootstrapOptions): number[][] {
  const n = series[0]?.length ?? 0;
  const rand = seededRandom(opts.seed);
  const means = series.map(() => [] as number[]);
  for (let s = 0; s < opts.samples; s++) {
    const sums = series.map(() => 0);
    for (let i = 0; i < n; i++) {
      const pick = Math.floor(rand() * n);
      series.forEach((values, c) => (sums[c] = (sums[c] ?? 0) + (values[pick] ?? 0)));
    }
    sums.forEach((sum, c) => means[c]?.push(n === 0 ? 0 : sum / n));
  }
  return means;
}

function interval(point: number, samples: number[], confidence: number) {
  const sorted = [...samples].sort((a, b) => a - b);
  const alpha = (1 - confidence) / 2;
  return {
    mean: round(point),
    low: round(percentile(sorted, alpha)),
    high: round(percentile(sorted, 1 - alpha)),
  };
}

export function compareConfigs(
  qrels: Qrels,
  configs: ConfigRun[],
  metric: string,
  opts: BootstrapOptions,
  ks: number[] = DEFAULT_KS,
): ComparisonResult {
  if (!isMetricName(metric)) throw new Error(`Unknown metric "${metric}"`);
  if (configs.length < 2) throw new Error("compare_configs needs at least 2 configurations");
  const names = new Set(configs.map((c) => c.name));
  if (names.size !== configs.length) throw new Error("Configuration names must be unique");
  if (scoredQueries(qrels).length === 0) throw new Error("qrels contain no relevant documents");

  const k = metricK(metric);
  const allKs = k && !ks.includes(k) ? [...ks, k] : ks;

  const series = configs.map((c) => perQueryScores(qrels, c.run, metric));
  const points = series.map(mean);
  const means = pairedBootstrap(series, opts);

  const order = configs
    .map((c, i) => ({ c, i, point: points[i] ?? 0 }))
    .sort((a, b) => b.point - a.point || a.c.name.localeCompare(b.c.name));
  const [best, second] = order as [(typeof order)[0], (typeof order)[0]];

  const deltaSamples = (means[best.i] ?? []).map((m, s) => m - (means[second.i]?.[s] ?? 0));
  const delta = interval(best.point - second.point, deltaSamples, opts.confidence);
  const significant = delta.low > 0;

  const rows = order.map(({ c, i }, rank) => ({
    name: c.name,
    rank: rank + 1,
    metrics: evaluateRetrieval(qrels, c.run, allKs).metrics,
    interval: interval(points[i] ?? 0, means[i] ?? [], opts.confidence),
  }));

  const pct = Math.round(opts.confidence * 100);
  const summary = significant
    ? `${best.c.name} wins on ${metric} (${round(best.point)}), +${delta.mean} over ${second.c.name}; ${pct}% interval of the gap [${delta.low}, ${delta.high}] excludes zero.`
    : `${best.c.name} leads on ${metric} (${round(best.point)}) by ${delta.mean} over ${second.c.name}, but the ${pct}% interval of the gap [${delta.low}, ${delta.high}] includes zero: not significant on this set.`;

  return {
    metric,
    bootstrap: { samples: opts.samples, seed: opts.seed, confidence: opts.confidence },
    configs: rows,
    winner: best.c.name,
    runnerUp: second.c.name,
    delta,
    significant,
    summary,
  };
}
