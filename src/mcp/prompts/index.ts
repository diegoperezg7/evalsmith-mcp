import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const userMessage = (text: string) => ({
  messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
});

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "compare_rag_configs",
    {
      title: "Compare RAG configurations",
      description: "Pick the best retrieval configuration and say whether the lead is real.",
      argsSchema: { metric: z.string().optional().describe("Primary metric, default ndcg@5.") },
    },
    ({ metric }) =>
      userMessage(
        `I want to choose between retrieval configurations.\n\n` +
          `1. If I have not given you qrels and runs, read evalsmith://examples/rag-qrels and the runs evalsmith://examples/rag-run-bm25, rag-run-hybrid and rag-run-hybrid-rerank.\n` +
          `2. Call compare_configs with metric "${metric ?? "ndcg@5"}".\n` +
          `3. Call evaluate_retrieval on the winner and list the 3 queries with the lowest nDCG.\n` +
          `4. Answer in five bullets max: winner, size of the gap with its interval, whether it is significant, the weakest queries, and one next step. Quote numbers exactly as the tools return them.`,
      ),
  );

  server.registerPrompt(
    "audit_agent_trace",
    {
      title: "Audit an agent trace",
      description:
        "Check that an agent called the right tools, in order, with the right arguments.",
      argsSchema: {
        order: z.enum(["strict", "lax"]).optional().describe("Order mode, default strict."),
      },
    },
    ({ order }) =>
      userMessage(
        `Audit this agent run.\n\n` +
          `1. If I have not given you a trace and expectations, read evalsmith://examples/agent-trace and evalsmith://examples/agent-expected.\n` +
          `2. Call check_tool_calls with order "${order ?? "strict"}".\n` +
          `3. For every failed step, explain the mismatch in one line and propose the smallest change to the agent's instructions or tool description that would fix it.`,
      ),
  );

  server.registerPrompt(
    "review_prompt_change",
    {
      title: "Review a prompt change",
      description: "Decide whether a prompt or model change is safe to ship.",
      argsSchema: {
        candidate: z
          .string()
          .optional()
          .describe("Example candidate to use: candidate or candidate-regressed."),
      },
    },
    ({ candidate }) =>
      userMessage(
        `Review this prompt change before it ships.\n\n` +
          `1. If I have not given you a golden set and outputs, read evalsmith://examples/prompts-golden, prompts-baseline and prompts-${candidate ?? "candidate-regressed"}.\n` +
          `2. Call detect_prompt_regression.\n` +
          `3. Call generate_report with format "markdown" and the regression result.\n` +
          `4. Give a ship / do not ship decision first, then the regressed cases and the failing check for each.`,
      ),
  );
}
