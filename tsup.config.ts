import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "mcp/server": "src/mcp/server.ts",
    "cli/index": "src/cli/index.ts",
    "core/index": "src/core/index.ts",
  },
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: { entry: { "core/index": "src/core/index.ts" } },
  banner: { js: "#!/usr/bin/env node" },
});
