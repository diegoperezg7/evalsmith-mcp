import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  ComparisonResultSchema,
  RegressionResultSchema,
  RetrievalResultSchema,
  ToolCallResultSchema,
  evaluateGates,
  generateReport,
  isGateName,
  suitePassed,
} from "../../core/index.js";
import { toMcpError } from "../../shared/errors.js";
import { toolResult } from "../result.js";

const InputSchema = z.object({
  format: z.enum(["markdown", "json", "junit"]).default("markdown"),
  name: z.string().default("evalsmith"),
  retrieval: RetrievalResultSchema.optional().describe("structuredContent of evaluate_retrieval."),
  comparison: ComparisonResultSchema.optional().describe("structuredContent of compare_configs."),
  toolCalls: ToolCallResultSchema.optional().describe("structuredContent of check_tool_calls."),
  regression: RegressionResultSchema.optional().describe(
    "structuredContent of detect_prompt_regression.",
  ),
  gates: z
    .record(z.string(), z.number().min(0).max(1))
    .default({})
    .describe('Minimum values, e.g. { "recall@5": 0.8, "tool_calls": 1 }.'),
});

const OutputSchema = z.object({
  format: z.enum(["markdown", "json", "junit"]),
  passed: z.boolean(),
  content: z.string(),
});

export function registerGenerateReport(server: McpServer): void {
  server.registerTool(
    "generate_report",
    {
      title: "Generate report",
      description:
        "Turn the results of the other evalsmith tools into a Markdown summary, a JSON document or JUnit XML for CI dashboards. Optional gates (metric -> minimum) decide the overall pass/fail.",
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ format, gates, ...results }) => {
      try {
        const unknown = Object.keys(gates).filter((g) => !isGateName(g));
        if (unknown.length > 0) throw new Error(`unknown gate metric(s): ${unknown.join(", ")}`);
        const suite = { ...results, gates: evaluateGates(gates, results) };
        const content = generateReport(suite, format);
        return toolResult({ format, passed: suitePassed(suite), content }, content);
      } catch (err) {
        throw toMcpError(err, "generate_report");
      }
    },
  );
}
