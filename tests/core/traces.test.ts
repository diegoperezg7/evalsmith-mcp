import { describe, expect, it } from "vitest";

import { normalizeTrace } from "../../src/core/traces.js";

const expected = [
  { tool: "search_customers", args: { query: "Acme" } },
  { tool: "get_invoice", args: { invoice_id: "INV-1" } },
];

describe("normalizeTrace", () => {
  it("keeps evalsmith calls as they are", () => {
    expect(normalizeTrace(expected)).toEqual(expected);
  });

  it("reads Anthropic Messages, skipping text, user turns and tool results", () => {
    const messages = [
      { role: "user", content: "Refund Acme's last invoice" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Looking up the customer." },
          { type: "tool_use", id: "t1", name: "search_customers", input: { query: "Acme" } },
        ],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "c_9" }] },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t2", name: "get_invoice", input: { invoice_id: "INV-1" } },
        ],
      },
    ];
    expect(normalizeTrace(messages)).toEqual(expected);
  });

  it("reads bare Anthropic content blocks", () => {
    const blocks = [
      { type: "tool_use", name: "search_customers", input: { query: "Acme" } },
      { type: "text", text: "..." },
      { type: "tool_use", name: "get_invoice", input: { invoice_id: "INV-1" } },
    ];
    expect(normalizeTrace(blocks)).toEqual(expected);
  });

  it("reads OpenAI Chat messages and parses their JSON arguments", () => {
    const messages = [
      { role: "system", content: "You are a billing agent." },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: { name: "search_customers", arguments: '{"query":"Acme"}' },
          },
          {
            id: "c2",
            type: "function",
            function: { name: "get_invoice", arguments: '{"invoice_id":"INV-1"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "c1", content: "c_9" },
    ];
    expect(normalizeTrace(messages)).toEqual(expected);
  });

  it("reads OpenAI Responses items", () => {
    const items = [
      { type: "reasoning", summary: [] },
      {
        type: "function_call",
        call_id: "c1",
        name: "search_customers",
        arguments: '{"query":"Acme"}',
      },
      { type: "function_call_output", call_id: "c1", output: "c_9" },
      {
        type: "function_call",
        call_id: "c2",
        name: "get_invoice",
        arguments: '{"invoice_id":"INV-1"}',
      },
      { type: "message", role: "assistant", content: [] },
    ];
    expect(normalizeTrace(items)).toEqual(expected);
  });

  it("treats empty arguments as no arguments", () => {
    expect(normalizeTrace([{ type: "function_call", name: "ping", arguments: "" }])).toEqual([
      { tool: "ping", args: {} },
    ]);
  });

  it("rejects arguments that are not a JSON object", () => {
    expect(() =>
      normalizeTrace([{ type: "function_call", name: "ping", arguments: "{oops" }]),
    ).toThrow("trace[0]: arguments are not valid JSON");
    expect(() => normalizeTrace([{ type: "tool_use", name: "ping", input: [1, 2] }])).toThrow(
      "must be a JSON object",
    );
  });

  it("rejects items it cannot place and traces with no tool calls", () => {
    expect(() => normalizeTrace([{ foo: 1 }])).toThrow("trace[0]: not a tool call");
    expect(() => normalizeTrace([{ role: "user", content: "hi" }])).toThrow("no tool calls");
    expect(normalizeTrace([])).toEqual([]);
  });
});
