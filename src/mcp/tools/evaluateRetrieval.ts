import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  DEFAULT_KS,
  KListSchema,
  QrelsSchema,
  RetrievalResultSchema,
  RunSchema,
  evaluateRetrieval,
} from "../../core/index.js";
import { toMcpError } from "../../shared/errors.js";
import { toolResult } from "../result.js";

const InputSchema = z.object({
  qrels: QrelsSchema,
  run: RunSchema,
  k: KListSchema.optional(),
});

export function registerEvaluateRetrieval(server: McpServer): void {
  server.registerTool(
    "evaluate_retrieval",
    {
      title: "Evaluate retrieval",
      description:
        "Score a ranked retrieval run against relevance judgements (qrels). Returns recall@k, precision@k, nDCG@k (graded, linear gain), hit rate@k and MRR, averaged over judged queries, plus per-query values. Deterministic; no model calls.",
      inputSchema: InputSchema,
      outputSchema: RetrievalResultSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ qrels, run, k }) => {
      try {
        const result = evaluateRetrieval(qrels, run, k ?? DEFAULT_KS);
        return toolResult(result);
      } catch (err) {
        throw toMcpError(err, "evaluate_retrieval");
      }
    },
  );
}
