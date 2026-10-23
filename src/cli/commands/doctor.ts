import { Command } from "commander";

import { loadSuiteConfig, runSuite } from "../../core/index.js";
import { loadConfig } from "../../shared/config.js";
import { VERSION } from "../../shared/version.js";

type Check = { name: string; ok: boolean; detail: string };

async function judgeReachable(baseUrl: string): Promise<Check> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      signal: AbortSignal.timeout(3000),
    });
    return { name: "judge endpoint", ok: res.ok, detail: `${baseUrl} -> HTTP ${res.status}` };
  } catch (err) {
    return {
      name: "judge endpoint",
      ok: false,
      detail: `${baseUrl} unreachable (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

export function buildDoctorCommand(): Command {
  return new Command("doctor")
    .description("Check the runtime, the environment and, optionally, a suite config.")
    .argument("[config]", "suite config to validate and dry-run")
    .option("--judge", "also check that the LLM judge endpoint answers")
    .action(async (configPath: string | undefined, opts: { judge?: boolean }) => {
      const checks: Check[] = [];
      const major = Number(process.versions.node.split(".")[0]);
      checks.push({
        name: "node",
        ok: major >= 22,
        detail: `v${process.versions.node} (needs >= 22)`,
      });

      let env: ReturnType<typeof loadConfig> | undefined;
      try {
        env = loadConfig();
        checks.push({
          name: "environment",
          ok: true,
          detail: `transport=${env.EVALSMITH_TRANSPORT}`,
        });
      } catch (err) {
        checks.push({ name: "environment", ok: false, detail: (err as Error).message });
      }

      if (configPath) {
        try {
          const { config, baseDir } = loadSuiteConfig(configPath);
          const suite = await runSuite(config, baseDir);
          const sections = ["retrieval", "comparison", "toolCalls", "regression"].filter(
            (k) => suite[k as keyof typeof suite] !== undefined,
          );
          checks.push({ name: "suite", ok: true, detail: `${configPath}: ${sections.join(", ")}` });
        } catch (err) {
          checks.push({ name: "suite", ok: false, detail: (err as Error).message });
        }
      }

      if (opts.judge && env) checks.push(await judgeReachable(env.EVALSMITH_JUDGE_BASE_URL));

      process.stdout.write(`evalsmith ${VERSION}\n`);
      for (const c of checks)
        process.stdout.write(`  ${c.ok ? "ok  " : "FAIL"}  ${c.name.padEnd(15)} ${c.detail}\n`);
      process.exitCode = checks.every((c) => c.ok) ? 0 : 1;
    });
}
