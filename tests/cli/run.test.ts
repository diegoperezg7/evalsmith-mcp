import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const CONFIG = join(ROOT, "examples/evalsmith.yaml");

function evalsmith(...args: string[]) {
  const res = spawnSync(
    process.execPath,
    ["--import", "tsx", join(ROOT, "src/cli/index.ts"), ...args],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, LOG_LEVEL: "silent" },
    },
  );
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

describe("evalsmith run", () => {
  it("exits 0 when every gate passes", () => {
    const { code, stdout } = evalsmith(
      "run",
      CONFIG,
      "--format",
      "json",
      "--fail-under",
      "recall@5=0.8",
    );
    expect(code).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.passed).toBe(true);
    expect(out.gates.find((g: { metric: string }) => g.metric === "recall@5")).toMatchObject({
      actual: 0.9167,
      passed: true,
    });
  });

  it("writes a self-contained HTML report from the .html extension", () => {
    const dir = mkdtempSync(join(tmpdir(), "evalsmith-"));
    const report = join(dir, "report.html");
    const { code } = evalsmith("run", CONFIG, "--format", "json", "-r", report);
    expect(code).toBe(0);
    const html = readFileSync(report, "utf8");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('"verdict":"pass"');
    expect(evalsmith("run", CONFIG, "--format", "html").stdout).toContain("<!doctype html>");
  });

  it("exits 1 when a --fail-under gate is not met, and writes JUnit", () => {
    const dir = mkdtempSync(join(tmpdir(), "evalsmith-"));
    const report = join(dir, "report.xml");
    const { code, stdout, stderr } = evalsmith(
      "run",
      CONFIG,
      "--format",
      "table",
      "--fail-under",
      "recall@5=0.95",
      "--report",
      report,
    );
    expect(code).toBe(1);
    expect(stdout).toContain("FAIL · 1 gate(s) below threshold");
    expect(stderr).toContain(`Report written to ${report}`);
    expect(readFileSync(report, "utf8")).toContain(
      '<failure message="recall@5 = 0.9167, below 0.95"/>',
    );
  });

  it("exits 1 on a prompt regression even without gates", () => {
    const dir = mkdtempSync(join(tmpdir(), "evalsmith-"));
    const cfg = join(dir, "regressed.yaml");
    const data = join(ROOT, "examples/datasets/prompts");
    writeFileSync(
      cfg,
      `prompts:\n  golden: ${data}/golden.json\n  baseline: ${data}/baseline.json\n  candidate: ${data}/candidate-regressed.json\n`,
    );
    const { code, stdout } = evalsmith("run", cfg, "--format", "markdown");
    expect(code).toBe(1);
    expect(stdout).toContain("**Result: FAIL**");
    expect(stdout).toContain("Candidate regressed on 2 case(s)");
  });

  it("exits 2 on invalid input", () => {
    expect(evalsmith("run", CONFIG, "--fail-under", "accuracy=0.9").code).toBe(2);
    expect(evalsmith("run", CONFIG, "--fail-under", "recall@0=0.5").code).toBe(2);
    expect(evalsmith("run", join(ROOT, "missing.yaml")).code).toBe(2);
  });

  it("exits 2 on usage errors, which commander would report as 1", () => {
    expect(evalsmith("run").code).toBe(2);
    expect(evalsmith("run", CONFIG, "--bogus").code).toBe(2);
    expect(evalsmith("run", CONFIG, "--format", "xml").code).toBe(2);
    expect(evalsmith("nope").code).toBe(2);
  });

  it("exits 0 for help and version", () => {
    expect(evalsmith("--help").code).toBe(0);
    expect(evalsmith("run", "--help").code).toBe(0);
    const version = evalsmith("--version");
    expect(version.code).toBe(0);
    expect(version.stdout.trim()).toBe(
      JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version,
    );
  });
});

describe("evalsmith doctor", () => {
  it("validates the example suite", () => {
    const { code, stdout } = evalsmith("doctor", CONFIG);
    expect(code).toBe(0);
    expect(stdout).toMatch(/ok\s+suite/);
  });
});
