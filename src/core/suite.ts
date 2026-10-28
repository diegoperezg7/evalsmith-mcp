import { readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { compareConfigs } from "./compare.js";
import { evaluateGates, isGateName } from "./gates.js";
import { createOpenAICompatibleJudge } from "./judge.js";
import { detectPromptRegression, type Judge } from "./regression.js";
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
  type SuiteResult,
} from "./schemas.js";
import { checkToolCalls } from "./toolCalls.js";
import { TraceSchema, normalizeTrace } from "./traces.js";

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

/**
 * Resolves file against baseDir and, when root is given, refuses anything that
 * lands outside it once symlinks are followed. The MCP server passes its
 * workspace root so a suite cannot read arbitrary files on the machine.
 */
export function resolveInside(baseDir: string, file: string, root?: string): string {
  const full = resolve(baseDir, file);
  if (!root) return full;
  let real: string;
  try {
    real = realpathSync(full);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot read ${full}: ${reason}`, { cause: err });
  }
  const rel = relative(realpathSync(root), real);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`${file} is outside the workspace root ${root}`);
  }
  return real;
}

export function loadSuiteConfig(
  file: string,
  root?: string,
): { config: SuiteConfig; baseDir: string } {
  const full = resolveInside(root ?? process.cwd(), file, root);
  const raw: unknown = parseYaml(readFileSync(full, "utf8"));
  const parsed = SuiteConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid config ${file}:\n${issues}`);
  }
  return { config: parsed.data, baseDir: dirname(full) };
}

function readJson<T>(baseDir: string, file: string, schema: z.ZodType<T>, root?: string): T {
  const full = resolveInside(baseDir, file, root);
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
  /** Every file the suite references must resolve inside this directory. */
  root?: string;
  /**
   * Judge for a suite that enables one, instead of the endpoint named in the
   * file. null skips the judge even when the file enables it.
   */
  judge?: Judge | null;
}

export async function runSuite(
  config: SuiteConfig,
  baseDir: string,
  opts: RunSuiteOptions = {},
): Promise<SuiteResult> {
  const gates = { ...config.gates, ...opts.gates };
  const env = opts.env ?? process.env;
  const read = <T>(file: string, schema: z.ZodType<T>) =>
    readJson(baseDir, file, schema, opts.root);
  const result: Omit<SuiteResult, "gates"> = { name: config.name };

  if (config.retrieval) {
    const qrels = read(config.retrieval.qrels, QrelsSchema);
    const run = read(config.retrieval.run, RunSchema);
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
    const qrels = read(qrelsFile, QrelsSchema);
    const configs = config.compare.configs.map((c) => ({
      name: c.name,
      run: read(c.run, RunSchema),
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
    const trace = normalizeTrace(read(config.agent.trace, TraceSchema));
    const expected = read(config.agent.expected, z.array(ExpectedCallSchema));
    result.toolCalls = checkToolCalls(trace, expected, config.agent.order);
  }

  if (config.prompts) {
    const golden = read(config.prompts.golden, z.array(GoldenCaseSchema));
    const baseline = read(config.prompts.baseline, OutputsSchema);
    const candidate = read(config.prompts.candidate, OutputsSchema);
    const j = config.prompts.judge;
    const judge = !j?.enabled
      ? undefined
      : opts.judge !== undefined
        ? (opts.judge ?? undefined)
        : createOpenAICompatibleJudge({
            baseUrl: j.baseUrl ?? env.EVALSMITH_JUDGE_BASE_URL ?? "http://localhost:11434/v1",
            model: j.model ?? env.EVALSMITH_JUDGE_MODEL ?? "llama3.1:8b",
            apiKey: env.EVALSMITH_JUDGE_API_KEY || undefined,
            fetchImpl: opts.fetchImpl,
          });
    result.regression = await detectPromptRegression(golden, baseline, candidate, judge);
  }

  return { ...result, gates: evaluateGates(gates, result) };
}
