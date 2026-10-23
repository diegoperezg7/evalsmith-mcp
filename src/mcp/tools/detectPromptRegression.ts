import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  GoldenCaseSchema,
  OutputsSchema,
  RegressionResultSchema,
  createOpenAICompatibleJudge,
  detectPromptRegression,
} from "../../core/index.js";
import type { Config } from "../../shared/config.js";
import { toMcpError } from "../../shared/errors.js";
import { toolResult } from "../result.js";

const InputSchema = z.object({
  golden: z.array(GoldenCaseSchema).min(1).describe("Golden cases with deterministic checks."),
  baseline: OutputsSchema.describe("Outputs of the current prompt/model, keyed by case id."),
  candidate: OutputsSchema.describe("Outputs of the proposed prompt/model, keyed by case id."),
  judge: z
    .object({
      enabled: z.boolean().default(false),
      model: z.string().optional(),
    })
    .optional()
    .describe(
      "Optional pairwise LLM judge on the server's configured OpenAI-compatible endpoint (e.g. Ollama). Off by default; it never changes the verdict.",
    ),
});

export interface RegressionDeps {
  config: Pick<
    Config,
    "EVALSMITH_JUDGE_BASE_URL" | "EVALSMITH_JUDGE_MODEL" | "EVALSMITH_JUDGE_API_KEY"
  >;
  fetchImpl?: typeof fetch;
}

export function registerDetectPromptRegression(server: McpServer, deps: RegressionDeps): void {
  server.registerTool(
    "detect_prompt_regression",
    {
      title: "Detect prompt regression",
      description:
        "Run a golden set's deterministic checks (exact, regex, contains, JSON Schema, length) against baseline and candidate outputs. A regression is a case that passes on baseline and fails on candidate. An LLM judge can be enabled per call for a second opinion; the verdict only depends on the checks.",
      inputSchema: InputSchema,
      outputSchema: RegressionResultSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ golden, baseline, candidate, judge }) => {
      try {
        const llm = judge?.enabled
          ? createOpenAICompatibleJudge({
              baseUrl: deps.config.EVALSMITH_JUDGE_BASE_URL,
              model: judge.model ?? deps.config.EVALSMITH_JUDGE_MODEL,
              apiKey: deps.config.EVALSMITH_JUDGE_API_KEY,
              fetchImpl: deps.fetchImpl,
            })
          : undefined;
        return toolResult(await detectPromptRegression(golden, baseline, candidate, llm));
      } catch (err) {
        throw toMcpError(err, "detect_prompt_regression");
      }
    },
  );
}
