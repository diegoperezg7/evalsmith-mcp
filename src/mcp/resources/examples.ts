import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

import { examplesDir } from "../../shared/paths.js";

/** Synthetic datasets shipped in examples/, exposed so a client can try every tool without its own data. */
export const EXAMPLES: Record<string, { file: string; description: string; mimeType: string }> = {
  suite: {
    file: "evalsmith.yaml",
    description:
      "Example suite config used by `evalsmith run` (retrieval, comparison, agent, prompts, gates).",
    mimeType: "application/yaml",
  },
  "rag-corpus": {
    file: "datasets/rag/corpus.json",
    description: "20 help-center articles of a fictional invoicing app.",
    mimeType: "application/json",
  },
  "rag-queries": {
    file: "datasets/rag/queries.json",
    description: "12 user questions over the corpus.",
    mimeType: "application/json",
  },
  "rag-qrels": {
    file: "datasets/rag/qrels.json",
    description: "Graded relevance judgements (2 = answers the question, 1 = related).",
    mimeType: "application/json",
  },
  "rag-run-bm25": {
    file: "datasets/rag/runs/bm25.json",
    description: "Top-10 ranking per query from a lexical BM25 configuration.",
    mimeType: "application/json",
  },
  "rag-run-hybrid": {
    file: "datasets/rag/runs/hybrid.json",
    description: "Top-10 ranking per query from a BM25 + dense hybrid configuration.",
    mimeType: "application/json",
  },
  "rag-run-hybrid-rerank": {
    file: "datasets/rag/runs/hybrid-rerank.json",
    description:
      "Top-10 ranking per query from the hybrid configuration plus a cross-encoder reranker.",
    mimeType: "application/json",
  },
  "agent-trace": {
    file: "datasets/agent/trace.json",
    description: "Tool calls of a support agent handling a duplicate-charge refund.",
    mimeType: "application/json",
  },
  "agent-expected": {
    file: "datasets/agent/expected.json",
    description: "Expected calls for that task, with exact / regex / subset / any matchers.",
    mimeType: "application/json",
  },
  "prompts-golden": {
    file: "datasets/prompts/golden.json",
    description: "Six golden cases with deterministic checks.",
    mimeType: "application/json",
  },
  "prompts-baseline": {
    file: "datasets/prompts/baseline.json",
    description: "Outputs of the current prompt.",
    mimeType: "application/json",
  },
  "prompts-candidate": {
    file: "datasets/prompts/candidate.json",
    description: "Outputs of an improved prompt (no regressions).",
    mimeType: "application/json",
  },
  "prompts-candidate-regressed": {
    file: "datasets/prompts/candidate-regressed.json",
    description: "Outputs of a prompt change that breaks two cases.",
    mimeType: "application/json",
  },
};

export function registerExampleResources(server: McpServer): void {
  server.registerResource(
    "example",
    new ResourceTemplate("evalsmith://examples/{name}", {
      list: async () => ({
        resources: Object.entries(EXAMPLES).map(([name, e]) => ({
          uri: `evalsmith://examples/${name}`,
          name,
          description: e.description,
          mimeType: e.mimeType,
        })),
      }),
      complete: { name: (prefix) => Object.keys(EXAMPLES).filter((n) => n.startsWith(prefix)) },
    }),
    {
      title: "Example datasets",
      description: "Synthetic RAG, agent and prompt datasets to try every evalsmith tool.",
    },
    async (uri, { name }) => {
      const entry = typeof name === "string" ? EXAMPLES[name] : undefined;
      if (!entry) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Unknown example "${String(name)}". Available: ${Object.keys(EXAMPLES).join(", ")}`,
        );
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: entry.mimeType,
            text: readFileSync(join(examplesDir(), entry.file), "utf8"),
          },
        ],
      };
    },
  );
}
