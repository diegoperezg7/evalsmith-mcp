import { createServer as createHttpServer, type IncomingMessage, type Server } from "node:http";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { loadConfig, type Config } from "../shared/config.js";
import { logger } from "../shared/logger.js";
import { VERSION } from "../shared/version.js";
import { registerPrompts } from "./prompts/index.js";
import { registerExampleResources } from "./resources/examples.js";
import { registerCheckToolCalls } from "./tools/checkToolCalls.js";
import { registerCompareConfigs } from "./tools/compareConfigs.js";
import { registerDetectPromptRegression } from "./tools/detectPromptRegression.js";
import { registerEvaluateRetrieval } from "./tools/evaluateRetrieval.js";
import { registerGenerateReport } from "./tools/generateReport.js";

const INSTRUCTIONS = `
evalsmith scores retrieval-augmented generation and agents with deterministic
metrics. Nothing here calls a model unless the caller enables the optional
judge in detect_prompt_regression.

- evaluate_retrieval: recall@k, precision@k, nDCG@k, hit rate@k and MRR from qrels + a run.
- compare_configs: 2-3 runs on the same qrels, winner + seeded bootstrap intervals.
- check_tool_calls: agent trace vs expected calls with argument matchers.
- detect_prompt_regression: golden set checks on baseline vs candidate outputs.
- generate_report: Markdown, JSON or JUnit XML from the results above, with gates.

No data of your own yet? Read the evalsmith://examples/{name} resources.
Report numbers exactly as returned; do not round or recompute them.
`.trim();

export interface ServerDeps {
  config: Config;
  fetchImpl?: typeof fetch;
}

export function buildServer(deps: ServerDeps): McpServer {
  const server = new McpServer(
    { name: "evalsmith", version: VERSION },
    { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: INSTRUCTIONS },
  );

  registerEvaluateRetrieval(server);
  registerCompareConfigs(server);
  registerCheckToolCalls(server);
  registerDetectPromptRegression(server, { config: deps.config, fetchImpl: deps.fetchImpl });
  registerGenerateReport(server);
  registerExampleResources(server);
  registerPrompts(server);

  return server;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req)
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.trim() ? JSON.parse(raw) : undefined;
}

/**
 * Streamable HTTP, stateless. A stateless transport cannot be reused across
 * requests, so each POST gets its own McpServer + transport pair. Building
 * one only registers handlers, which is cheap next to the client round-trip.
 */
export function createHttpApp(deps: ServerDeps): Server {
  return createHttpServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if (path === "/healthz") {
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ status: "ok", version: VERSION }));
      return;
    }
    if (path !== "/mcp") {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    if (req.method !== "POST") {
      // No sessions, so there is no server-initiated stream to GET and nothing to DELETE.
      res.writeHead(405, { allow: "POST", "content-type": "application/json" }).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Method not allowed: this server is stateless, use POST",
          },
          id: null,
        }),
      );
      return;
    }

    const server = buildServer(deps);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      const body = await readJsonBody(req);
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      const parseError = err instanceof SyntaxError;
      if (parseError) logger.warn("Rejected request with malformed JSON body");
      else logger.error({ err }, "HTTP request failed");
      if (!res.headersSent) {
        res.writeHead(parseError ? 400 : 500, { "content-type": "application/json" }).end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: parseError
              ? { code: -32700, message: "Parse error" }
              : { code: -32603, message: "Internal error" },
            id: null,
          }),
        );
      }
    }
  });
}

export async function startServer(config: Config = loadConfig()): Promise<void> {
  if (config.EVALSMITH_TRANSPORT === "stdio") {
    await buildServer({ config }).connect(new StdioServerTransport());
    logger.info({ version: VERSION }, "evalsmith MCP server ready on stdio");
    return;
  }
  const app = createHttpApp({ config });
  await new Promise<void>((resolve) =>
    app.listen(config.EVALSMITH_HTTP_PORT, config.EVALSMITH_HTTP_HOST, resolve),
  );
  const endpoint = `http://${config.EVALSMITH_HTTP_HOST}:${config.EVALSMITH_HTTP_PORT}/mcp`;
  logger.info({ endpoint, version: VERSION }, "evalsmith MCP server listening (Streamable HTTP)");
}

function isEntryPoint(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  startServer().catch((err: unknown) => {
    logger.fatal({ err }, "evalsmith MCP server failed to start");
    process.exit(1);
  });
}
