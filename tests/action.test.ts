import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { escapeCommandData, runAction } from "../src/action/run.js";

const CONFIG = "examples/evalsmith.yaml";

/** Runs the action as the runner would: INPUT_* variables and the two command files. */
async function act(inputs: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "evalsmith-action-"));
  const env: Record<string, string> = {
    GITHUB_OUTPUT: join(dir, "output"),
    GITHUB_STEP_SUMMARY: join(dir, "summary"),
  };
  writeFileSync(env.GITHUB_OUTPUT!, "");
  writeFileSync(env.GITHUB_STEP_SUMMARY!, "");
  for (const [k, v] of Object.entries(inputs)) env[`INPUT_${k.toUpperCase()}`] = v;
  const log: string[] = [];
  const result = await runAction(env, { log: (l) => log.push(l) });
  const outputs: Record<string, string> = {};
  const re = /^([\w-]+)<<(ghadelimiter_[\w-]+)\n([\s\S]*?)\n\2$/gm;
  for (const m of readFileSync(env.GITHUB_OUTPUT!, "utf8").matchAll(re)) outputs[m[1]!] = m[3]!;
  return {
    dir,
    result,
    outputs,
    log: log.join("\n"),
    summary: readFileSync(env.GITHUB_STEP_SUMMARY!, "utf8"),
  };
}

describe("GitHub Action", () => {
  it("passes on the example suite and reports the metrics as outputs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evalsmith-action-"));
    const r = await act({
      config: CONFIG,
      "fail-under": "recall@5=0.8\nmrr=0.8\n",
      "report-file": join(dir, "out/report.xml"),
      "html-report": join(dir, "out/report.html"),
    });
    expect(r.result.exitCode).toBe(0);
    expect(r.outputs).toMatchObject({
      verdict: "pass",
      "failed-gates": "0",
      mrr: "0.8403",
      "tool-calls": "1",
      "prompt-pass-rate": "1",
      "prompt-regressions": "0",
      winner: "hybrid+rerank",
      "report-file": join(dir, "out/report.xml"),
      "html-report": join(dir, "out/report.html"),
    });
    expect(JSON.parse(r.outputs.metrics!)["recall@5"]).toBe(0.9167);
    expect(readFileSync(join(dir, "out/report.xml"), "utf8")).toContain("<testsuites");
    expect(readFileSync(join(dir, "out/report.html"), "utf8")).toContain("<!doctype html>");
    expect(r.summary).toContain("**Verdict: PASS**: 4 gate(s) passed");
    expect(r.summary).not.toContain("**Result:");
    expect(r.log).not.toContain("::error");
  });

  it("fails when a gate is below its threshold", async () => {
    const r = await act({ config: CONFIG, "fail-under": "recall@5=0.95\nmrr=0.9" });
    expect(r.result.exitCode).toBe(1);
    expect(r.outputs).toMatchObject({
      verdict: "fail",
      "failed-gates": "2",
      "report-file": "",
      "html-report": "",
    });
    expect(r.summary).toContain("**Verdict: FAIL**: 2 gates below threshold.");
    expect(r.log).toContain(
      "::error title=evalsmith::Evaluation failed: 2 gates below threshold. See the job summary for details.",
    );
  });

  it("fails on a prompt regression even without gates, and skips the summary when asked", async () => {
    const dir = mkdtempSync(join(tmpdir(), "evalsmith-action-"));
    const cfg = join(dir, "suite.yaml");
    const data = join(process.cwd(), "examples/datasets/prompts");
    writeFileSync(
      cfg,
      `prompts:\n  golden: ${data}/golden.json\n  baseline: ${data}/baseline.json\n  candidate: ${data}/candidate-regressed.json\n`,
    );
    const r = await act({ config: cfg, "upload-summary": "false" });
    expect(r.result.exitCode).toBe(1);
    expect(r.outputs).toMatchObject({
      verdict: "fail",
      "prompt-regressions": "2",
      mrr: "",
      winner: "",
      metrics: "{}",
    });
    expect(r.summary).toBe("");
  });

  it("rejects bad inputs with a clear error and no outputs", async () => {
    const cases: Record<string, string>[] = [
      { config: "missing.yaml" },
      { config: CONFIG, "fail-under": "accuracy=0.9" },
      { config: CONFIG, "fail-under": "recall@5" },
      { config: CONFIG, "upload-summary": "yes" },
      { config: CONFIG, "report-file": "r.txt", "report-format": "pdf" },
    ];
    for (const inputs of cases) {
      const r = await act(inputs);
      expect(r.result.exitCode).toBe(1);
      expect(r.log).toMatch(/^::error title=evalsmith::/);
      expect(r.outputs).toEqual({});
    }
  });

  it("keeps dataset text from opening a workflow command", async () => {
    expect(escapeCommandData("a\n::add-mask::x\r%")).toBe("a%0A::add-mask::x%0D%25");
    const dir = mkdtempSync(join(tmpdir(), "evalsmith-action-"));
    writeFileSync(join(dir, "trace.json"), JSON.stringify([{ tool: "::add-mask::secret" }]));
    writeFileSync(
      join(dir, "expected.json"),
      JSON.stringify([{ tool: "::set-env name=X::1" }, { tool: "\n::warning::injected" }]),
    );
    writeFileSync(
      join(dir, "suite.yaml"),
      "name: '::error::fake'\nagent:\n  trace: trace.json\n  expected: expected.json\n",
    );
    const r = await act({ config: join(dir, "suite.yaml"), "upload-summary": "false" });
    expect(r.result.exitCode).toBe(1);
    const lines = r.log.split("\n");
    const start = lines.findIndex((l) => l.startsWith("::stop-commands::"));
    const token = lines[start]!.slice("::stop-commands::".length);
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    const end = lines.indexOf(`::${token}::`);
    expect(end).toBeGreaterThan(start);
    expect(lines.slice(start, end).join("\n")).toContain("::add-mask::secret");
    // Outside the suspended block, every command line is one the action wrote itself.
    const commands = lines.filter((l, i) => (i < start || i > end) && l.trim().startsWith("::"));
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((l) => l.startsWith("::error title=evalsmith::"))).toBe(true);
  });
});
