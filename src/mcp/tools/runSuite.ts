import { join } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

import {
  JudgeError,
  SuiteResultSchema,
  createOpenAICompatibleJudge,
  generateReport,
  isGateName,
  loadSuiteConfig,
  runSuite,
  suitePassed,
} from "../../core/index.js";
import type { Config } from "../../shared/config.js";
import { toMcpError } from "../../shared/errors.js";
import { examplesDir } from "../../shared/paths.js";
import { toolResult } from "../result.js";

const FormatSchema = z.enum(["markdown", "json", "junit"]);

const InputSchema = z.object({
  config: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Path to an evalsmith.yaml suite, relative to the server's workspace root (EVALSMITH_ROOT, the directory the server started in by default). Every file the suite references must also be inside the root. Omit it to run the bundled example suite.",
    ),
  gates: z
    .record(z.string(), z.number().min(0).max(1))
    .default({})
    .describe(
      'Minimums that override the suite\'s gates of the same name, e.g. { "recall@5": 0.8, "tool_calls": 1 }.',
    ),
  judge: z
    .boolean()
    .default(false)
    .describe(
      "Run the LLM judge when the suite enables it, on the server's configured endpoint. Off by default; it never changes the verdict.",
    ),
  format: FormatSchema.default("markdown").describe(
    "Format of the report returned with the results: markdown, json or junit.",
  ),
});

const OutputSchema = z.object({
  passed: z.boolean().describe("True when every gate passes and no prompt regressed."),
  format: FormatSchema,
  report: z.string().describe("The suite rendered in the requested format."),
  suite: SuiteResultSchema.describe("Every section's results and the evaluated gates."),
});

export interface RunSuiteDeps {
  config: Pick<
    Config,
    | "EVALSMITH_ROOT"
    | "EVALSMITH_JUDGE_BASE_URL"
    | "EVALSMITH_JUDGE_MODEL"
    | "EVALSMITH_JUDGE_API_KEY"
  >;
  fetchImpl?: typeof fetch;
}

export function registerRunSuite(server: McpServer, deps: RunSuiteDeps): void {
  server.registerTool(
    "run_suite",
    {
      title: "Run an evalsmith suite",
      description:
        "Run a whole evalsmith.yaml suite from the workspace, the same as `evalsmith run` in CI: retrieval metrics, config comparison, tool-call checks and prompt regression, read from the files the suite points at, then the gates. Use it when the data lives in files rather than in the conversation. Reads files only inside the workspace root; with the judge on it reaches the configured model.",
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      // Open-world and non-idempotent for the same reason as detect_prompt_regression:
      // a suite that enables the judge reaches an external model when judge is true.
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ config: file, gates, judge, format }) => {
      try {
        const unknown = Object.keys(gates).filter((g) => !isGateName(g));
        if (unknown.length > 0) throw new Error(`unknown gate metric(s): ${unknown.join(", ")}`);

        const root = file ? deps.config.EVALSMITH_ROOT : examplesDir();
        const suiteFile = file ?? join(examplesDir(), "evalsmith.yaml");
        const { config, baseDir } = loadSuiteConfig(suiteFile, root);
        const suite = await runSuite(config, baseDir, {
          gates,
          root,
          judge: judge
            ? createOpenAICompatibleJudge({
                baseUrl: deps.config.EVALSMITH_JUDGE_BASE_URL,
                model: config.prompts?.judge?.model ?? deps.config.EVALSMITH_JUDGE_MODEL,
                apiKey: deps.config.EVALSMITH_JUDGE_API_KEY,
                fetchImpl: deps.fetchImpl,
              })
            : null,
        });
        const report = generateReport(suite, format);
        return toolResult({ passed: suitePassed(suite), format, report, suite }, report);
      } catch (err) {
        if (err instanceof JudgeError) {
          throw new McpError(ErrorCode.InternalError, `run_suite: ${err.message}`);
        }
        throw toMcpError(err, "run_suite");
      }
    },
  );
}
