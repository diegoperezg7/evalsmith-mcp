import { Command } from "commander";

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

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(EXIT.error);
});
