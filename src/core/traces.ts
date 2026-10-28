import { z } from "zod";

import { ToolCallSchema, type ToolCall } from "./schemas.js";

/**
 * Agent traces arrive in whatever shape the agent framework logged. These are
 * read as-is and reduced to evalsmith's { tool, args } calls, in order:
 *
 * - evalsmith:            { "tool": "search", "args": { ... } }
 * - Anthropic Messages:   messages whose content has { "type": "tool_use", "name", "input" } blocks,
 *                         or the content blocks themselves
 * - OpenAI Chat:          assistant messages with "tool_calls": [{ "function": { "name", "arguments" } }]
 * - OpenAI Responses:     output items { "type": "function_call", "name", "arguments" }
 *
 * Everything else that is clearly part of a conversation (user and tool
 * messages, text, tool results, reasoning) is skipped.
 */
export const TraceSchema = z
  .array(z.record(z.string(), z.unknown()))
  .describe(
    'Tool calls the agent made, in order. Accepts evalsmith calls ({ "tool", "args" }), Anthropic Messages (messages or content blocks with type "tool_use"), OpenAI Chat messages with "tool_calls" and OpenAI Responses items with type "function_call"; other conversation items are skipped.',
  );

const SKIPPED_TYPES = new Set([
  "text",
  "thinking",
  "redacted_thinking",
  "tool_result",
  "message",
  "reasoning",
  "function_call_output",
  "input_text",
  "output_text",
]);

type Item = Record<string, unknown>;

const isObject = (value: unknown): value is Item =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseArguments(raw: unknown, where: string): Record<string, unknown> {
  if (raw === undefined || raw === null || raw === "") return {};
  if (isObject(raw)) return raw;
  if (typeof raw === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`${where}: arguments are not valid JSON`);
    }
    if (isObject(parsed)) return parsed;
  }
  throw new Error(`${where}: arguments must be a JSON object`);
}

function callsFromItem(item: Item, where: string): ToolCall[] {
  if (typeof item.tool === "string") {
    const parsed = ToolCallSchema.safeParse(item);
    if (!parsed.success) throw new Error(`${where}: ${parsed.error.issues[0]?.message}`);
    return [parsed.data];
  }

  if (item.type === "tool_use" && typeof item.name === "string") {
    return [{ tool: item.name, args: parseArguments(item.input, where) }];
  }

  if (item.type === "function_call" && typeof item.name === "string") {
    return [{ tool: item.name, args: parseArguments(item.arguments, where) }];
  }

  if (typeof item.role === "string") {
    const calls: ToolCall[] = [];
    if (Array.isArray(item.content)) {
      item.content.forEach((block, i) => {
        if (isObject(block) && block.type === "tool_use") {
          calls.push(...callsFromItem(block, `${where}.content[${i}]`));
        }
      });
    }
    if (Array.isArray(item.tool_calls)) {
      item.tool_calls.forEach((tc, i) => {
        const fn = isObject(tc) ? tc.function : undefined;
        if (!isObject(fn) || typeof fn.name !== "string") {
          throw new Error(`${where}.tool_calls[${i}]: expected { function: { name, arguments } }`);
        }
        calls.push({
          tool: fn.name,
          args: parseArguments(fn.arguments, `${where}.tool_calls[${i}]`),
        });
      });
    }
    return calls;
  }

  if (typeof item.type === "string" && SKIPPED_TYPES.has(item.type)) return [];

  throw new Error(
    `${where}: not a tool call or a conversation item (expected "tool", "role" or a known "type")`,
  );
}

/** Reduces a trace in any supported format to evalsmith tool calls, in order. */
export function normalizeTrace(items: readonly unknown[]): ToolCall[] {
  const calls = items.flatMap((item, i) => {
    if (!isObject(item)) throw new Error(`trace[${i}]: expected an object`);
    return callsFromItem(item, `trace[${i}]`);
  });
  if (items.length > 0 && calls.length === 0) {
    throw new Error("trace has items but no tool calls in a supported format");
  }
  return calls;
}
