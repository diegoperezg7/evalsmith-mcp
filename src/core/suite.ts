import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { compareConfigs } from "./compare.js";
import { evaluateGates, isGateName } from "./gates.js";
import { createOpenAICompatibleJudge } from "./judge.js";
import { detectPromptRegression } from "./regression.js";
import { DEFAULT_KS, evaluateRetrieval, metricK } from "./retrieval.js";
import {
  BootstrapOptionsSchema,
  ExpectedCallSchema,
  GoldenCaseSchema,
  KListSchema,
  OrderModeSchema,
  OutputsSchema,
  QrelsSchema,
  RunSchema,
  ToolCallSchema,
  type SuiteResult,
} from "./schemas.js";
import { checkToolCalls } from "./toolCalls.js";

const path = z.string().min(1);

export const SuiteConfigSchema = z
  .object({
    name: z.string().default("evalsmith"),
    retrieval: z.object({ qrels: path, run: path, k: KListSchema.default(DEFAULT_KS) }).optional(),
    compare: z
      .object({
        qrels: path.optional(),
        metric: z.string().default("ndcg@10"),
        configs: z
          .array(z.object({ name: z.string().min(1), run: path }))
          .min(2)
          .max(3),
        bootstrap: BootstrapOptionsSchema.default({ samples: 1000, seed: 42, confidence: 0.95 }),
      })
      .optional(),
    agent: z
      .object({ trace: path, expected: path, order: OrderModeSchema.default("strict") })
      .optional(),
    prompts: z
      .object({
        golden: path,
        baseline: path,
        candidate: path,
        judge: z
          .object({
            enabled: z.boolean().default(false),
            baseUrl: z.string().url().optional(),
            model: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
    gates: z.record(z.string(), z.number().min(0).max(1)).default({}),
  })
  .superRefine((cfg, ctx) => {
    for (const name of Object.keys(cfg.gates)) {
      if (!isGateName(name))
        ctx.addIssue({ code: "custom", path: ["gates", name], message: "unknown gate metric" });
    }
    if (cfg.compare && !cfg.compare.qrels && !cfg.retrieval) {
      ctx.addIssue({
        code: "custom",
        path: ["compare", "qrels"],
        message: "required when there is no retrieval section",
      });
    }
  });

export type SuiteConfig = z.infer<typeof SuiteConfigSchema>;

export function loadSuiteConfig(file: string): { config: SuiteConfig; baseDir: string } {
  const raw: unknown = parseYaml(readFileSync(file, "utf8"));
  const parsed = SuiteConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid config ${file}:\n${issues}`);
  }
  return { config: parsed.data, baseDir: dirname(resolve(file)) };
}

function readJson<T>(baseDir: string, file: string, schema: z.ZodType<T>): T {
  const full = resolve(baseDir, file);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(full, "utf8"));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read ${full}: ${reason}`, { cause: err });
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new Error(
      `${full} does not match the expected shape: ${parsed.error.issues[0]?.message}`,
    );
  return parsed.data;
}

export interface RunSuiteOptions {
  /** Gates from the command line; they override gates with the same name in the file. */
  gates?: Record<string, number>;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export async function runSuite(
  config: SuiteConfig,
  baseDir: string,
  opts: RunSuiteOptions = {},
): Promise<SuiteResult> {
  const gates = { ...config.gates, ...opts.gates };
  const env = opts.env ?? process.env;
  const result: Omit<SuiteResult, "gates"> = { name: config.name };

  if (config.retrieval) {
    const qrels = readJson(baseDir, config.retrieval.qrels, QrelsSchema);
    const run = readJson(baseDir, config.retrieval.run, RunSchema);
    // Make sure every gated cut-off is computed, e.g. recall@20 with k: [5, 10].
    const ks = new Set(config.retrieval.k);
    for (const name of Object.keys(gates)) {
      const k = metricK(name);
      if (k) ks.add(k);
    }
    result.retrieval = evaluateRetrieval(qrels, run, [...ks]);
  }

  if (config.compare) {
    const qrelsFile = config.compare.qrels ?? config.retrieval?.qrels ?? "";
    const qrels = readJson(baseDir, qrelsFile, QrelsSchema);
    const configs = config.compare.configs.map((c) => ({
      name: c.name,
      run: readJson(baseDir, c.run, RunSchema),
    }));
    result.comparison = compareConfigs(
      qrels,
      configs,
      config.compare.metric,
      config.compare.bootstrap,
      config.retrieval?.k,
    );
  }

  if (config.agent) {
    const trace = readJson(baseDir, config.agent.trace, z.array(ToolCallSchema));
    const expected = readJson(baseDir, config.agent.expected, z.array(ExpectedCallSchema));
    result.toolCalls = checkToolCalls(trace, expected, config.agent.order);
  }

  if (config.prompts) {
    const golden = readJson(baseDir, config.prompts.golden, z.array(GoldenCaseSchema));
    const baseline = readJson(baseDir, config.prompts.baseline, OutputsSchema);
    const candidate = readJson(baseDir, config.prompts.candidate, OutputsSchema);
    const j = config.prompts.judge;
    const judge = j?.enabled
      ? createOpenAICompatibleJudge({
          baseUrl: j.baseUrl ?? env.EVALSMITH_JUDGE_BASE_URL ?? "http://localhost:11434/v1",
          model: j.model ?? env.EVALSMITH_JUDGE_MODEL ?? "llama3.1:8b",
          apiKey: env.EVALSMITH_JUDGE_API_KEY || undefined,
          fetchImpl: opts.fetchImpl,
        })
      : undefined;
    result.regression = await detectPromptRegression(golden, baseline, candidate, judge);
  }

  return { ...result, gates: evaluateGates(gates, result) };
}
