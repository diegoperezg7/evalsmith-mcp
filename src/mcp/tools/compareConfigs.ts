import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  BootstrapOptionsSchema,
  ComparisonResultSchema,
  ConfigRunSchema,
  DEFAULT_KS,
  KListSchema,
  QrelsSchema,
  compareConfigs,
} from "../../core/index.js";
import { toMcpError } from "../../shared/errors.js";
import { toolResult } from "../result.js";

const InputSchema = z.object({
  qrels: QrelsSchema,
  configs: z
    .array(ConfigRunSchema)
    .min(2)
    .max(3)
    .describe("Two or three runs over the same queries."),
  metric: z
    .string()
    .default("ndcg@10")
    .describe("Primary metric that decides the winner, e.g. ndcg@10, recall@5, mrr."),
  k: KListSchema.optional(),
  bootstrap: BootstrapOptionsSchema.optional().describe(
    "Paired bootstrap over queries. Defaults: 1000 samples, seed 42, 95% confidence.",
  ),
});

export function registerCompareConfigs(server: McpServer): void {
  server.registerTool(
    "compare_configs",
    {
      title: "Compare retrieval configurations",
      description:
        "Compare 2-3 retrieval configurations on the same qrels. Ranks them on a primary metric, attaches seeded paired-bootstrap confidence intervals, and says whether the winner's lead over the runner-up is significant (interval of the gap excludes zero). Use it before switching retriever, chunking or reranker, so a small gap on a few queries is not mistaken for a win.",
      inputSchema: InputSchema,
      outputSchema: ComparisonResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ qrels, configs, metric, k, bootstrap }) => {
      try {
        const opts = bootstrap ?? BootstrapOptionsSchema.parse({});
        const result = compareConfigs(qrels, configs, metric, opts, k ?? DEFAULT_KS);
        return toolResult(result);
      } catch (err) {
        throw toMcpError(err, "compare_configs");
      }
    },
  );
}
