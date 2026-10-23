import { JudgeVerdictSchema, type GoldenCase, type JudgeVerdict } from "./schemas.js";
import type { Judge } from "./regression.js";

export interface JudgeConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const SYSTEM_PROMPT = `You compare two answers to the same input and decide which one is better.
Judge correctness first, then completeness, then concision. Ignore which answer is labelled A or B.
Reply with JSON only: {"preferred": "A" | "B" | "tie", "reason": "<one sentence>"}`;

/**
 * Pairwise LLM judge over any OpenAI-compatible /chat/completions endpoint
 * (Ollama exposes one at http://localhost:11434/v1). Never called unless the
 * caller opts in; deterministic checks remain the gate.
 */
export function createOpenAICompatibleJudge(cfg: JudgeConfig): Judge {
  const doFetch = cfg.fetchImpl ?? fetch;
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  return {
    model: cfg.model,
    async compare(c: GoldenCase, baseline: string, candidate: string): Promise<JudgeVerdict> {
      const res = await doFetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Input:\n${c.input}\n\nAnswer A:\n${baseline}\n\nAnswer B:\n${candidate}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 60_000),
      });
      if (!res.ok) throw new Error(`Judge endpoint returned HTTP ${res.status}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return parseVerdict(body.choices?.[0]?.message?.content ?? "");
    },
  };
}

export function parseVerdict(text: string): JudgeVerdict {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  try {
    const raw = JSON.parse(json ?? "") as { preferred?: string; reason?: string };
    const mapped = raw.preferred === "A" ? "baseline" : raw.preferred === "B" ? "candidate" : "tie";
    return JudgeVerdictSchema.parse({ preferred: mapped, reason: raw.reason ?? "" });
  } catch {
    return { preferred: "tie", reason: "judge reply was not valid JSON" };
  }
}
