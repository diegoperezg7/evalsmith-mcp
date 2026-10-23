import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves the package root by walking up from this module until package.json
 * is found. Works from src/ (tsx, vitest) and from the bundled dist/ alike.
 */
export function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Cannot locate the evalsmith-mcp package root");
    dir = parent;
  }
  return dir;
}

export const examplesDir = (): string => join(packageRoot(), "examples");
