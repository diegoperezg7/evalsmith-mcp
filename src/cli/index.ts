import { Command, CommanderError } from "commander";

import { VERSION } from "../shared/version.js";
import { buildDoctorCommand } from "./commands/doctor.js";
import { buildRunCommand, EXIT } from "./commands/run.js";

const program = new Command()
  .name("evalsmith")
  .description(
    "Evaluate RAG retrieval, agent tool calls and prompt changes. Same core as the evalsmith MCP server.",
  )
  .version(VERSION);

program.addCommand(buildRunCommand());
program.addCommand(buildDoctorCommand());

// Commander exits with 1 on usage errors, which CI would read as "gate failed".
// Throw instead, so every usage error maps to 2 as documented.
for (const cmd of [program, ...program.commands]) cmd.exitOverride();

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof CommanderError) {
    // Commander has already printed the message, help text or version.
    process.exit(err.exitCode === 0 ? EXIT.pass : EXIT.error);
  }
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(EXIT.error);
});
