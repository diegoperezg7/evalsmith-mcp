import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

/**
 * Input problems the caller can fix (unknown metric, duplicate config names,
 * empty qrels) surface as InvalidParams with the original message, so the
 * model on the other side can correct its arguments and retry.
 */
export function toMcpError(err: unknown, tool: string): McpError {
  if (err instanceof McpError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new McpError(ErrorCode.InvalidParams, `${tool}: ${message}`);
}
