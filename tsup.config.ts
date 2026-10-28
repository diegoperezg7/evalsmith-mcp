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
  // dist/action is the committed GitHub Action bundle, built by tsup.action.config.ts.
  clean: ["!action/**"],
  dts: { entry: { "core/index": "src/core/index.ts" } },
  banner: { js: "#!/usr/bin/env node" },
});
