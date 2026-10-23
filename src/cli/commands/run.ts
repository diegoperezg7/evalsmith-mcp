import { writeFileSync } from "node:fs";
import { extname } from "node:path";
import { Command, Option } from "commander";

import {
  generateReport,
  loadSuiteConfig,
  parseGate,
  runSuite,
  suitePassed,
  type ReportFormat,
} from "../../core/index.js";
import { formatJson } from "../format/json.js";
import { formatMarkdown } from "../format/markdown.js";
import { formatSuiteTable } from "../format/suite.js";

export const EXIT = { pass: 0, fail: 1, error: 2 } as const;

const collectGate = (spec: string, acc: Record<string, number>) => {
  const [name, threshold] = parseGate(spec);
  return { ...acc, [name]: threshold };
};

function reportFormatFor(file: string, explicit?: ReportFormat): ReportFormat {
  if (explicit) return explicit;
  const ext = extname(file).toLowerCase();
  if (ext === ".xml") return "junit";
  if (ext === ".json") return "json";
  return "markdown";
}

export function buildRunCommand(): Command {
  return new Command("run")
    .description("Run an evalsmith suite and exit non-zero when a gate fails or prompts regress.")
    .argument("<config>", "path to evalsmith.yaml")
    .option(
      "--fail-under <metric=value>",
      "minimum for a metric, repeatable (e.g. recall@5=0.8, tool_calls=1)",
      collectGate,
      {} as Record<string, number>,
    )
    .addOption(
      new Option("-f, --format <format>", "stdout format")
        .choices(["table", "json", "markdown"])
        .default(process.stdout.isTTY ? "table" : "json", "table on a TTY, json otherwise"),
    )
    .option("-r, --report <file>", "also write a report (.md, .json or .xml for JUnit)")
    .addOption(
      new Option("--report-format <format>", "report format, overrides the file extension").choices(
        ["markdown", "json", "junit"],
      ),
    )
    .action(
      async (
        configPath: string,
        opts: {
          failUnder: Record<string, number>;
          format: "table" | "json" | "markdown";
          report?: string;
          reportFormat?: ReportFormat;
        },
      ) => {
        const { config, baseDir } = loadSuiteConfig(configPath);
        const suite = await runSuite(config, baseDir, { gates: opts.failUnder });

        const render = { table: formatSuiteTable, json: formatJson, markdown: formatMarkdown }[
          opts.format
        ];
        process.stdout.write(render(suite).trimEnd() + "\n");

        if (opts.report) {
          writeFileSync(
            opts.report,
            generateReport(suite, reportFormatFor(opts.report, opts.reportFormat)),
          );
          process.stderr.write(`Report written to ${opts.report}\n`);
        }
        process.exitCode = suitePassed(suite) ? EXIT.pass : EXIT.fail;
      },
    );
}
