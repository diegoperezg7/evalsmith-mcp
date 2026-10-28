import { z } from "zod";

/**
 * Data contracts shared by the core, the MCP tools and the CLI. Every input
 * that crosses a process boundary is parsed with one of these schemas.
 */

// ---------------------------------------------------------------- retrieval

export const QrelsSchema = z
  .record(z.string(), z.record(z.string(), z.number().int().min(0)))
  .describe(
    'Relevance judgements: { queryId: { docId: grade } }. Grade 0 means not relevant; higher grades are more relevant (used by nDCG). Example: { "q1": { "d3": 2, "d7": 1 } }',
  );

export const RunSchema = z
  .record(z.string(), z.array(z.string()))
  .describe(
    'Ranked retrieval output: { queryId: [docId, ...] }, best match first. Example: { "q1": ["d7", "d3", "d9"] }',
  );

export const KListSchema = z
  .array(z.number().int().min(1).max(1000))
  .min(1)
  .max(10)
  .describe("Cut-offs to evaluate. Defaults to [1, 3, 5, 10].");

export const MetricMapSchema = z
  .record(z.string(), z.number())
  .describe('Metric name to value, e.g. { "recall@5": 0.83, "mrr": 0.71 }');

export const RetrievalResultSchema = z.object({
  queries: z.number().int().describe("Queries with at least one relevant document."),
  skippedQueries: z
    .array(z.string())
    .describe("Queries in qrels with no relevant documents (excluded from averages)."),
  missingFromRun: z
    .array(z.string())
    .describe("Judged queries absent from the run (scored as an empty ranking)."),
  metrics: MetricMapSchema,
  perQuery: z.array(z.object({ queryId: z.string(), metrics: MetricMapSchema })),
});

// ---------------------------------------------------------------- comparison

export const ConfigRunSchema = z.object({
  name: z.string().min(1).describe("Label for this configuration, e.g. 'hybrid+rerank'."),
  run: RunSchema,
});

export const BootstrapOptionsSchema = z.object({
  samples: z
    .number()
    .int()
    .min(100)
    .max(20_000)
    .default(1000)
    .describe("Bootstrap resamples of the query set. More is slower and steadier."),
  seed: z
    .number()
    .int()
    .default(42)
    .describe("Random seed; the same seed gives the same intervals."),
  confidence: z
    .number()
    .gt(0.5)
    .lt(1)
    .default(0.95)
    .describe("Confidence level of the intervals, e.g. 0.95."),
});

export const IntervalSchema = z.object({
  mean: z.number(),
  low: z.number(),
  high: z.number(),
});

export const ComparisonResultSchema = z.object({
  metric: z.string(),
  bootstrap: z.object({ samples: z.number(), seed: z.number(), confidence: z.number() }),
  configs: z.array(
    z.object({
      name: z.string(),
      rank: z.number().int(),
      metrics: MetricMapSchema,
      interval: IntervalSchema.describe("Bootstrap interval for the primary metric."),
    }),
  ),
  winner: z.string(),
  runnerUp: z.string(),
  delta: IntervalSchema.describe("Paired bootstrap interval of winner minus runner-up."),
  significant: z.boolean().describe("True when the delta interval excludes zero."),
  summary: z.string(),
});

// ---------------------------------------------------------------- tool calls

export const ToolCallSchema = z.object({
  tool: z.string().min(1).describe("Name of the tool the agent called."),
  args: z.record(z.string(), z.unknown()).default({}).describe("Arguments it passed."),
});

export const ArgMatcherSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("exact"), value: z.unknown() })
    .describe("The argument must deep-equal value."),
  z
    .object({ type: z.literal("regex"), pattern: z.string(), flags: z.string().optional() })
    .describe("The argument, as a string, must match the JavaScript regex pattern."),
  z
    .object({ type: z.literal("subset"), value: z.unknown() })
    .describe("Every key in value must be present in the argument with an equal value."),
  z.object({ type: z.literal("any") }).describe("The argument must be present; any value passes."),
]);

export const ExpectedCallSchema = z.object({
  tool: z.string().min(1).describe("Name of the tool the agent should call."),
  args: z
    .record(z.string(), ArgMatcherSchema)
    .default({})
    .describe("Per-argument matchers. Arguments not listed are not checked."),
});

export const OrderModeSchema = z
  .enum(["strict", "lax"])
  .describe(
    "strict: the trace must be exactly the expected calls, in order. lax: every expected call must appear somewhere; order and extra calls are allowed.",
  );

export const ToolCallResultSchema = z.object({
  passed: z.boolean(),
  order: OrderModeSchema,
  score: z.number().describe("Matched expected calls / expected calls."),
  steps: z.array(
    z.object({
      expected: z.string(),
      matchedIndex: z.number().int().nullable(),
      passed: z.boolean(),
      reasons: z.array(z.string()),
    }),
  ),
  unexpected: z.array(z.object({ index: z.number().int(), tool: z.string() })),
  calls: z
    .array(z.string())
    .optional()
    .describe("Tool names of the trace, in call order. Used to draw the expected vs. actual view."),
  summary: z.string(),
});

// ---------------------------------------------------------------- prompts

export const CheckSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("exact"), value: z.string(), trim: z.boolean().default(true) })
    .describe("The output must equal value, trimmed unless trim is false."),
  z
    .object({ type: z.literal("regex"), pattern: z.string(), flags: z.string().optional() })
    .describe("The output must match the JavaScript regex pattern."),
  z
    .object({
      type: z.literal("contains"),
      value: z.string(),
      caseSensitive: z.boolean().default(false),
    })
    .describe("The output must contain value, case-insensitive by default."),
  z.object({
    type: z.literal("json_schema"),
    schema: z.record(z.string(), z.unknown()).describe("JSON Schema the output must satisfy."),
  }),
  z
    .object({
      type: z.literal("length"),
      min: z.number().int().min(0).optional(),
      max: z.number().int().min(0).optional(),
    })
    .describe("The output length in characters must be within min and max."),
]);

export const GoldenCaseSchema = z.object({
  id: z.string().min(1).describe("Case id; baseline and candidate outputs are keyed by it."),
  input: z.string().describe("The prompt or user message the outputs answer."),
  checks: z.array(CheckSchema).min(1).describe("Checks the output must pass, all of them."),
});

export const OutputsSchema = z
  .record(z.string(), z.string())
  .describe("Model outputs keyed by golden case id.");

export const JudgeVerdictSchema = z.object({
  preferred: z.enum(["baseline", "candidate", "tie"]),
  reason: z.string(),
});

export const RegressionResultSchema = z.object({
  verdict: z.enum(["pass", "regressed"]),
  cases: z.number().int(),
  baselinePassRate: z.number(),
  candidatePassRate: z.number(),
  regressions: z.array(z.string()).describe("Cases that pass on baseline and fail on candidate."),
  improvements: z.array(z.string()).describe("Cases that fail on baseline and pass on candidate."),
  perCase: z.array(
    z.object({
      id: z.string(),
      baseline: z.object({ passed: z.boolean(), failures: z.array(z.string()) }),
      candidate: z.object({ passed: z.boolean(), failures: z.array(z.string()) }),
      judge: JudgeVerdictSchema.optional(),
    }),
  ),
  judge: z
    .object({ model: z.string(), baseline: z.number(), candidate: z.number(), tie: z.number() })
    .optional(),
  summary: z.string(),
});

// ---------------------------------------------------------------- suite + gates

export const GateResultSchema = z.object({
  metric: z.string(),
  threshold: z.number(),
  actual: z.number().nullable(),
  passed: z.boolean(),
});

export const SuiteResultSchema = z.object({
  name: z.string().default("evalsmith"),
  retrieval: RetrievalResultSchema.optional(),
  comparison: ComparisonResultSchema.optional(),
  toolCalls: ToolCallResultSchema.optional(),
  regression: RegressionResultSchema.optional(),
  gates: z.array(GateResultSchema).default([]),
});

export type Qrels = z.infer<typeof QrelsSchema>;
export type Run = z.infer<typeof RunSchema>;
export type MetricMap = z.infer<typeof MetricMapSchema>;
export type RetrievalResult = z.infer<typeof RetrievalResultSchema>;
export type ConfigRun = z.infer<typeof ConfigRunSchema>;
export type BootstrapOptions = z.infer<typeof BootstrapOptionsSchema>;
export type ComparisonResult = z.infer<typeof ComparisonResultSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ArgMatcher = z.infer<typeof ArgMatcherSchema>;
export type ExpectedCall = z.infer<typeof ExpectedCallSchema>;
export type OrderMode = z.infer<typeof OrderModeSchema>;
export type ToolCallResult = z.infer<typeof ToolCallResultSchema>;
export type Check = z.infer<typeof CheckSchema>;
export type GoldenCase = z.infer<typeof GoldenCaseSchema>;
export type Outputs = z.infer<typeof OutputsSchema>;
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;
export type RegressionResult = z.infer<typeof RegressionResultSchema>;
export type GateResult = z.infer<typeof GateResultSchema>;
export type SuiteResult = z.infer<typeof SuiteResultSchema>;
