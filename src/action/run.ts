import { randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname } from "node:path";

import { formatSuiteTable } from "../cli/format/suite.js";
import {
  generateReport,
  loadSuiteConfig,
  parseGate,
  runSuite,
  suitePassed,
  type ReportFormat,
  type SuiteResult,
} from "../core/index.js";
import { failureReasons } from "../core/reportHtml.js";

/**
 * The GitHub Action entry point, without the runner toolkit: inputs come from
 * INPUT_* variables, outputs and the job summary go to the files named by
 * GITHUB_OUTPUT and GITHUB_STEP_SUMMARY, exactly as the runner defines them.
 * It calls the same core as the CLI; nothing is run through a shell.
 */

type Env = Record<string, string | undefined>;

export interface ActionIO {
  /** Plain log lines for the step log (stdout). */
  log: (line: string) => void;
}

export interface ActionResult {
  exitCode: 0 | 1;
  suite?: SuiteResult;
}

class InputError extends Error {}

const FORMATS: ReportFormat[] = ["markdown", "json", "junit", "html"];

/** Same lookup as @actions/core: spaces become underscores, the name is upper-cased, hyphens stay. */
function input(env: Env, name: string): string {
  return (env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] ?? "").trim();
}

/** One value per line; blank lines and # comments are ignored. */
function lines(env: Env, name: string): string[] {
  return input(env, name)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

function bool(env: Env, name: string, fallback: boolean): boolean {
  const v = input(env, name).toLowerCase();
  if (v === "") return fallback;
  if (v === "true") return true;
  if (v === "false") return false;
  throw new InputError(`input ${name} must be true or false, got "${v}"`);
}

function reportFormat(env: Env, file: string): ReportFormat {
  const explicit = input(env, "report-format").toLowerCase();
  if (explicit) {
    if ((FORMATS as string[]).includes(explicit)) return explicit as ReportFormat;
    throw new InputError(`input report-format must be one of ${FORMATS.join(", ")}`);
  }
  const ext = extname(file).toLowerCase();
  if (ext === ".xml") return "junit";
  if (ext === ".json") return "json";
  if (ext === ".html" || ext === ".htm") return "html";
  return "markdown";
}

/** Escapes a message for a workflow command, so it cannot end the command or start another line. */
export function escapeCommandData(s: string): string {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

async function writeOutputs(env: Env, values: Record<string, string>): Promise<void> {
  const file = env.GITHUB_OUTPUT;
  if (!file) return;
  let body = "";
  for (const [name, value] of Object.entries(values)) {
    const delimiter = `ghadelimiter_${randomUUID()}`;
    body += `${name}<<${delimiter}\n${value}\n${delimiter}\n`;
  }
  await appendFile(file, body, "utf8");
}

async function writeFileWithDirs(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export function verdictLine(suite: SuiteResult): string {
  if (suitePassed(suite))
    return suite.gates.length
      ? `**Verdict: PASS**: ${suite.gates.length} gate(s) passed and nothing regressed.`
      : "**Verdict: PASS**: nothing regressed (no gates set).";
  return `**Verdict: FAIL**: ${failureReasons(suite).join(", ")}.`;
}

export async function runAction(env: Env, io: ActionIO): Promise<ActionResult> {
  try {
    return await evaluate(env, io);
  } catch (err) {
    // Messages can quote dataset paths and values: the escaping keeps them in this one annotation.
    const message = err instanceof Error ? err.message : String(err);
    io.log(`::error title=evalsmith::${escapeCommandData(message)}`);
    return { exitCode: 1 };
  }
}

async function evaluate(env: Env, io: ActionIO): Promise<ActionResult> {
  const configPath = input(env, "config") || "evalsmith.yaml";
  const reportFile = input(env, "report-file");
  const format = reportFormat(env, reportFile);
  const htmlReport = input(env, "html-report");
  const uploadSummary = bool(env, "upload-summary", true);
  let gates: Record<string, number> = {};
  for (const spec of lines(env, "fail-under")) {
    try {
      const [name, threshold] = parseGate(spec);
      gates = { ...gates, [name]: threshold };
    } catch (err) {
      throw new InputError(`input fail-under: ${(err as Error).message}`, { cause: err });
    }
  }

  const { config, baseDir } = loadSuiteConfig(configPath);
  const suite = await runSuite(config, baseDir, { gates, env });
  const passed = suitePassed(suite);

  if (reportFile) await writeFileWithDirs(reportFile, generateReport(suite, format));
  if (htmlReport) await writeFileWithDirs(htmlReport, generateReport(suite, "html"));

  if (uploadSummary && env.GITHUB_STEP_SUMMARY) {
    const markdown = generateReport(suite, "markdown").replace(
      /^\*\*Result: (PASS|FAIL)\*\*$/m,
      verdictLine(suite),
    );
    await appendFile(env.GITHUB_STEP_SUMMARY, `${markdown}\n`, "utf8");
  }

  await writeOutputs(env, {
    verdict: passed ? "pass" : "fail",
    "failed-gates": String(suite.gates.filter((g) => !g.passed).length),
    metrics: JSON.stringify(suite.retrieval?.metrics ?? {}),
    mrr: num(suite.retrieval?.metrics.mrr),
    "tool-calls": num(suite.toolCalls?.score),
    "prompt-pass-rate": num(suite.regression?.candidatePassRate),
    "prompt-regressions": num(suite.regression?.regressions.length),
    winner: suite.comparison?.winner ?? "",
    "report-file": reportFile,
    "html-report": htmlReport,
  });

  // The table quotes dataset text (case ids, tool names, config names). The
  // runner treats any stdout line that starts with "::" as a workflow command,
  // so command processing is suspended with a one-time token while it prints.
  const token = randomUUID();
  io.log(`::stop-commands::${token}`);
  io.log(formatSuiteTable(suite).trimEnd());
  io.log(`::${token}::`);

  const written = [
    reportFile && `${format} report to ${reportFile}`,
    htmlReport && `HTML report to ${htmlReport}`,
  ]
    .filter(Boolean)
    .join(", ");
  if (written) io.log(`Wrote the ${written}.`);
  if (!passed) {
    io.log(
      `::error title=evalsmith::${escapeCommandData(`Evaluation failed: ${failureReasons(suite).join(", ")}. See the job summary for details.`)}`,
    );
    return { exitCode: 1, suite };
  }
  io.log("evalsmith: every gate passed and nothing regressed.");
  return { exitCode: 0, suite };
}
