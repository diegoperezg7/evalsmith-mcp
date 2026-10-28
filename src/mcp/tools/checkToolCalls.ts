import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  ExpectedCallSchema,
  OrderModeSchema,
  ToolCallResultSchema,
  TraceSchema,
  checkToolCalls,
  normalizeTrace,
} from "../../core/index.js";
import { toMcpError } from "../../shared/errors.js";
import { toolResult } from "../result.js";

const InputSchema = z.object({
  trace: TraceSchema,
  expected: z
    .array(ExpectedCallSchema)
    .min(1)
    .describe(
      'Expected calls. Argument matchers: {"type":"exact","value":...}, {"type":"regex","pattern":"..."}, {"type":"subset","value":{...}}, {"type":"any"}.',
    ),
  order: OrderModeSchema.default("strict"),
});

export function registerCheckToolCalls(server: McpServer): void {
  server.registerTool(
    "check_tool_calls",
    {
      title: "Check agent tool calls",
      description:
        "Compare an agent's tool-call trace (evalsmith, Anthropic Messages or OpenAI format, as logged) with the expected calls: right tool, right order (strict or lax) and arguments that satisfy exact / regex / subset / any matchers. Use it to test an agent change against a known-good trace. Returns a pass flag, a score and a reason for every mismatch.",
      inputSchema: InputSchema,
      outputSchema: ToolCallResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ trace, expected, order }) => {
      try {
        return toolResult(checkToolCalls(normalizeTrace(trace), expected, order));
      } catch (err) {
        throw toMcpError(err, "check_tool_calls");
      }
    },
  );
}
