import type { GoldenCase, JudgeVerdict } from "./schemas.js";
import type { Judge } from "./regression.js";

export interface JudgeConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** The judge endpoint failed (network, timeout, non-2xx). An infrastructure problem, not bad input. */
export class JudgeError extends Error {}

const SYSTEM_PROMPT = `You compare two answers to the same input and decide which one is better.
Judge correctness first, then completeness, then concision.
Reply with JSON only: {"preferred": "A" | "B" | "tie", "reason": "<one sentence>"}`;

type Pick = "A" | "B" | "tie";

/** Reads {"preferred": "A"|"B"|"tie"} from a reply; anything unparseable is a tie. */
export function parsePreference(text: string): { preferred: Pick; reason: string } {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  try {
    const raw = JSON.parse(json ?? "") as { preferred?: unknown; reason?: unknown };
    const preferred = raw.preferred === "A" || raw.preferred === "B" ? raw.preferred : "tie";
    return { preferred, reason: typeof raw.reason === "string" ? raw.reason : "" };
  } catch {
    return { preferred: "tie", reason: "judge reply was not valid JSON" };
  }
}

/**
 * Combines the two orderings. Pass 1 shows baseline as A, pass 2 shows it as
 * B. A side wins only if both passes prefer it; a disagreement means the
 * preference followed the position, not the content, so it counts as a tie.
 */
export function combineVerdicts(
  first: { preferred: Pick; reason: string },
  second: { preferred: Pick; reason: string },
): JudgeVerdict {
  const toSide = (p: Pick, baselineLabel: "A" | "B") =>
    p === "tie" ? "tie" : p === baselineLabel ? "baseline" : "candidate";
  const a = toSide(first.preferred, "A");
  const b = toSide(second.preferred, "B");
  if (a === b) return { preferred: a, reason: first.reason || second.reason };
  return {
    preferred: "tie",
    reason: `inconsistent across orderings (${a} when baseline was A, ${b} when it was B)`,
  };
}

/**
 * Pairwise LLM judge over any OpenAI-compatible /chat/completions endpoint
 * (Ollama exposes one at http://localhost:11434/v1). Each case is judged in
 * both orders to cancel position bias, so it costs two requests per case.
 * Never called unless the caller opts in; deterministic checks remain the gate.
 */
export function createOpenAICompatibleJudge(cfg: JudgeConfig): Judge {
  const doFetch = cfg.fetchImpl ?? fetch;
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  async function ask(input: string, answerA: string, answerB: string) {
    let res: Response;
    try {
      res = await doFetch(url, {
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
              content: `Input:\n${input}\n\nAnswer A:\n${answerA}\n\nAnswer B:\n${answerB}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 60_000),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new JudgeError(`Judge endpoint ${url} unreachable: ${reason}`, { cause: err });
    }
    if (!res.ok) throw new JudgeError(`Judge endpoint ${url} returned HTTP ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parsePreference(body.choices?.[0]?.message?.content ?? "");
  }

  return {
    model: cfg.model,
    async compare(c: GoldenCase, baseline: string, candidate: string): Promise<JudgeVerdict> {
      const first = await ask(c.input, baseline, candidate);
      const second = await ask(c.input, candidate, baseline);
      return combineVerdicts(first, second);
    },
  };
}
