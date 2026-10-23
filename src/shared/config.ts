import { z } from "zod";

const ConfigSchema = z.object({
  EVALSMITH_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
  EVALSMITH_HTTP_PORT: z.coerce.number().int().min(0).max(65535).default(3333),
  EVALSMITH_HTTP_HOST: z.string().default("127.0.0.1"),
  EVALSMITH_JUDGE_BASE_URL: z.string().url().default("http://localhost:11434/v1"),
  EVALSMITH_JUDGE_MODEL: z.string().default("llama3.1:8b"),
  EVALSMITH_JUDGE_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Treat empty strings from .env templates as unset.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ""));
  const parsed = ConfigSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuration error:\n${issues}`);
  }
  return parsed.data;
}
