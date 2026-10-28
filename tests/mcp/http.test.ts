import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { MAX_BODY_BYTES, createHttpApp } from "../../src/mcp/server.js";
import { loadConfig } from "../../src/shared/config.js";

let app: Server;
let base: string;

beforeAll(async () => {
  app = createHttpApp({ config: loadConfig({}) });
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => app.close(() => resolve()));
});

describe("Streamable HTTP (stateless)", () => {
  it("serves several requests from one client without sessions", async () => {
    const client = new Client({ name: "http-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(6);

    // Two calls in a row: a reused stateless transport would reject the second one.
    for (const order of ["strict", "lax"] as const) {
      const res = await client.callTool({
        name: "check_tool_calls",
        arguments: { trace: [{ tool: "a", args: {} }], expected: [{ tool: "a" }], order },
      });
      expect(res.structuredContent).toMatchObject({ passed: true, order });
    }
    await client.close();
  });

  it("exposes a health check and rejects GET on /mcp", async () => {
    expect(await (await fetch(`${base}/healthz`)).json()).toMatchObject({ status: "ok" });
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });

  it("answers malformed JSON with a JSON-RPC parse error", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: -32700 } });
  });

  it("rejects bodies over the size limit with 413", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ padding: "x".repeat(MAX_BODY_BYTES) }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: { code: -32600 } });
  });
});
