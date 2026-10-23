import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    env: { LOG_LEVEL: "silent" },
  },
});
