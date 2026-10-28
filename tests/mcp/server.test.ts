import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { buildServer } from "../../src/mcp/server.js";
import { loadConfig } from "../../src/shared/config.js";

/**
 * In-process integration: a real Client talks JSON-RPC to the real server over
 * InMemoryTransport.createLinkedPair(). No network, no model.
 */

const judgeFetch = vi.fn(async () =>
  Response.json({ choices: [{ message: { content: '{"preferred":"tie","reason":"same"}' } }] }),
);

let client: Client;

beforeAll(async () => {
  const server = buildServer({
    config: loadConfig({}),
    fetchImpl: judgeFetch as unknown as typeof fetch,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
});

async function example(name: string): Promise<unknown> {
  const res = await client.readResource({ uri: `evalsmith://examples/${name}` });
  const first = res.contents[0];
  if (!first || !("text" in first)) throw new Error(`no text for ${name}`);
  return JSON.parse(first.text);
}

async function call(name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  return res as {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content: { text: string }[];
  };
}

describe("MCP surface", () => {
  it("lists six tools, each with input and output schemas", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "check_tool_calls",
      "compare_configs",
      "detect_prompt_regression",
      "evaluate_retrieval",
      "generate_report",
      "run_suite",
    ]);
    for (const t of tools) {
      expect(t.outputSchema?.type).toBe("object");
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.annotations?.destructiveHint).toBe(false);
      // Only the tools that can call an external judge are open-world and non-idempotent.
      const judged = t.name === "detect_prompt_regression" || t.name === "run_suite";
      expect(t.annotations?.openWorldHint).toBe(judged);
      expect(t.annotations?.idempotentHint).toBe(!judged);
    }
  });

  it("lists the example resources and three prompts", async () => {
    const { resources } = await client.listResources();
    expect(resources).toHaveLength(13);
    expect(resources.map((r) => r.uri)).toContain("evalsmith://examples/rag-qrels");

    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([
      "audit_agent_trace",
      "compare_rag_configs",
      "review_prompt_change",
    ]);
    const prompt = await client.getPrompt({
      name: "compare_rag_configs",
      arguments: { metric: "mrr" },
    });
    expect(JSON.stringify(prompt.messages)).toContain('metric \\"mrr\\"');
  });

  it("returns an error for an unknown example", async () => {
    await expect(client.readResource({ uri: "evalsmith://examples/nope" })).rejects.toThrow(
      /Unknown example/,
    );
  });
});

describe("tools", () => {
  it("evaluate_retrieval scores the example run", async () => {
    const res = await call("evaluate_retrieval", {
      qrels: await example("rag-qrels"),
      run: await example("rag-run-hybrid"),
      k: [5],
    });
    expect(res.isError).toBeFalsy();
    const metrics = res.structuredContent?.metrics as Record<string, number>;
    expect(metrics["recall@5"]).toBe(0.9167);
    expect(metrics["ndcg@5"]).toBe(0.8059);
    expect(JSON.parse(res.content[0]!.text)).toEqual(res.structuredContent);
  });

  it("compare_configs picks the reranked configuration", async () => {
    const qrels = await example("rag-qrels");
    const res = await call("compare_configs", {
      qrels,
      metric: "ndcg@5",
      configs: [
        { name: "bm25", run: await example("rag-run-bm25") },
        { name: "hybrid+rerank", run: await example("rag-run-hybrid-rerank") },
      ],
    });
    expect(res.structuredContent).toMatchObject({ winner: "hybrid+rerank", significant: true });
    expect(res.structuredContent?.bootstrap).toEqual({ samples: 1000, seed: 42, confidence: 0.95 });
  });

  it("compare_configs reports bad input as a tool error", async () => {
    const res = await call("compare_configs", {
      qrels: { q: { d: 1 } },
      metric: "f1",
      configs: [
        { name: "a", run: {} },
        { name: "b", run: {} },
      ],
    });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/Unknown metric "f1"/);
  });

  it("check_tool_calls validates the example agent trace", async () => {
    const res = await call("check_tool_calls", {
      trace: await example("agent-trace"),
      expected: await example("agent-expected"),
    });
    expect(res.structuredContent).toMatchObject({ passed: true, order: "strict", score: 1 });
  });

  it("detect_prompt_regression keeps the judge off by default", async () => {
    const res = await call("detect_prompt_regression", {
      golden: await example("prompts-golden"),
      baseline: await example("prompts-baseline"),
      candidate: await example("prompts-candidate-regressed"),
    });
    expect(res.structuredContent).toMatchObject({
      verdict: "regressed",
      regressions: ["classify-intent", "due-date-format"],
    });
    expect(res.structuredContent?.judge).toBeUndefined();
    expect(judgeFetch).not.toHaveBeenCalled();
  });

  it("detect_prompt_regression uses the judge only when enabled", async () => {
    const res = await call("detect_prompt_regression", {
      golden: await example("prompts-golden"),
      baseline: await example("prompts-baseline"),
      candidate: await example("prompts-candidate"),
      judge: { enabled: true, model: "qwen2.5:7b" },
    });
    // Two orderings per case to cancel position bias.
    expect(judgeFetch).toHaveBeenCalledTimes(12);
    expect(res.structuredContent?.judge).toEqual({
      model: "qwen2.5:7b",
      baseline: 0,
      candidate: 0,
      tie: 6,
    });
  });

  it("generate_report turns tool results into JUnit with gates", async () => {
    const retrieval = (
      await call("evaluate_retrieval", {
        qrels: await example("rag-qrels"),
        run: await example("rag-run-bm25"),
      })
    ).structuredContent;
    const res = await call("generate_report", {
      format: "junit",
      name: "bm25 nightly",
      retrieval,
      gates: { "recall@5": 0.8 },
    });
    expect(res.structuredContent?.passed).toBe(false);
    expect(res.structuredContent?.content).toContain(
      '<testsuite name="gates" tests="1" failures="1">',
    );
  });

  it("generate_report rejects unknown gates", async () => {
    const res = await call("generate_report", { gates: { accuracy: 0.9 } });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/unknown gate metric/);
  });

  it("reports a failing judge endpoint as an internal error, not bad input", async () => {
    const server = buildServer({
      config: loadConfig({}),
      fetchImpl: (async () => new Response("down", { status: 502 })) as unknown as typeof fetch,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const other = new Client({ name: "judge-down", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), other.connect(clientTransport)]);
    const res = (await other.callTool({
      name: "detect_prompt_regression",
      arguments: {
        golden: await example("prompts-golden"),
        baseline: await example("prompts-baseline"),
        candidate: await example("prompts-candidate"),
        judge: { enabled: true },
      },
    })) as { isError?: boolean; content: { text: string }[] };
    await other.close();
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/-32603/);
    expect(res.content[0]!.text).toMatch(/HTTP 502/);
  });
});

describe("run_suite", () => {
  let workspace: string;
  let outside: string;
  let local: Client;

  beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), "evalsmith-ws-"));
    outside = mkdtempSync(join(tmpdir(), "evalsmith-out-"));
    mkdirSync(join(workspace, "evals"));
    writeFileSync(join(workspace, "evals/qrels.json"), '{"q1":{"d1":1},"q2":{"d2":1}}');
    writeFileSync(join(workspace, "evals/run.json"), '{"q1":["d1"],"q2":["d9","d2"]}');
    // An OpenAI Chat transcript, as an agent framework would log it.
    writeFileSync(
      join(workspace, "evals/trace.json"),
      JSON.stringify([
        { role: "user", content: "Find Acme" },
        {
          role: "assistant",
          tool_calls: [{ function: { name: "search_customers", arguments: '{"query":"Acme"}' } }],
        },
      ]),
    );
    writeFileSync(
      join(workspace, "evals/expected.json"),
      '[{"tool":"search_customers","args":{"query":{"type":"exact","value":"Acme"}}}]',
    );
    writeFileSync(
      join(workspace, "evals/evalsmith.yaml"),
      [
        "name: workspace-suite",
        "retrieval: { qrels: qrels.json, run: run.json, k: [1, 2] }",
        "agent: { trace: trace.json, expected: expected.json }",
        "gates: { recall@1: 0.5, tool_calls: 1 }",
      ].join("\n"),
    );
    writeFileSync(join(outside, "qrels.json"), '{"q1":{"d1":1}}');
    writeFileSync(
      join(workspace, "evals/escape.yaml"),
      `retrieval: { qrels: ${join(outside, "qrels.json")}, run: run.json }`,
    );
    symlinkSync(join(outside, "qrels.json"), join(workspace, "evals/linked.json"));
    writeFileSync(
      join(workspace, "evals/linked.yaml"),
      "retrieval: { qrels: linked.json, run: run.json }",
    );

    const server = buildServer({ config: loadConfig({ EVALSMITH_ROOT: workspace }) });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    local = new Client({ name: "workspace-client", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), local.connect(clientTransport)]);
  });

  afterAll(async () => {
    await local.close();
    rmSync(workspace, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  const run = async (args: Record<string, unknown>) =>
    (await local.callTool({ name: "run_suite", arguments: args })) as {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content: { text: string }[];
    };

  it("runs the bundled example suite when no config is given", async () => {
    const res = await call("run_suite", {});
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as { passed: boolean; suite: { name: string } };
    expect(out.suite.name).toBe("ledgerly-support-assistant");
    expect(out.passed).toBe(true);
    expect(judgeFetch).not.toHaveBeenCalled();
  });

  it("runs a suite from the workspace, reading an OpenAI trace as logged", async () => {
    const res = await run({ config: "evals/evalsmith.yaml", format: "junit" });
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as {
      passed: boolean;
      format: string;
      report: string;
      suite: { toolCalls: { passed: boolean }; retrieval: { metrics: Record<string, number> } };
    };
    expect(out.passed).toBe(true);
    expect(out.suite.toolCalls.passed).toBe(true);
    expect(out.suite.retrieval.metrics["recall@1"]).toBe(0.5);
    expect(out.report).toMatch(/^<\?xml/);
  });

  it("lets gates passed in the call override the suite's", async () => {
    const res = await run({ config: "evals/evalsmith.yaml", gates: { "recall@1": 0.9 } });
    expect((res.structuredContent as { passed: boolean }).passed).toBe(false);
  });

  it("refuses files outside the workspace root, including through symlinks", async () => {
    for (const config of ["../evalsmith.yaml", "evals/escape.yaml", "evals/linked.yaml"]) {
      const res = await run({ config });
      expect(res.isError, config).toBe(true);
      expect(res.content[0]!.text, config).toMatch(/outside the workspace root|Cannot read/);
    }
  });

  it("rejects unknown gates", async () => {
    const res = await run({ config: "evals/evalsmith.yaml", gates: { f1: 0.5 } });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/unknown gate metric/);
  });
});
