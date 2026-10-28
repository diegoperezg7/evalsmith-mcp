import { runAction } from "./run.js";

// Entry point of the bundled action (dist/action/index.js).
const result = await runAction(process.env, {
  log: (line) => process.stdout.write(`${line}\n`),
});
process.exitCode = result.exitCode;
