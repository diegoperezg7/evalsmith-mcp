import pino from "pino";

/**
 * Every log line goes to stderr (fd 2). Over stdio, any byte on stdout that is
 * not JSON-RPC breaks the MCP connection; the CLI keeps stdout for results.
 */
export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: "evalsmith" },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.destination(2),
);
