/**
 * TypeSafe Jev ("System One") client — SERVER ONLY.
 *
 * Jev is a fast judgment model: given a JSON `state` and a map of questions
 * (Choice / Noul / Score) it answers all of them in parallel in ~0.3–0.5 s.
 * Praesidium uses it for instant agent judgments (behaviour policy tables,
 * quick-pick scoring). Gemini stays the primary generative model.
 *
 * The API key is read from TYPESAFE_API_KEY and never leaves the server.
 */

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-latest";
/**
 * Questions per HTTP request. The API documents no hard cap; 150 questions
 * were verified live at ~365 ms, so we chunk at 100 and send chunks in parallel.
 */
export const JEV_MAX_QUESTIONS = 100;

export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string }
  | { type: "score"; instructions: string; criteria: string[] };

export type JevAnswer =
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  /** `noul` is the probability (0..1) that the statement is true. */
  | { type: "noul"; noul: number }
  | { type: "score"; score: number; confidence: number; probabilities: Record<string, number> };

export interface JevResult {
  model: string;
  answers: Record<string, JevAnswer>;
  latencyMs: number;
  requests: number;
}

export class JevUnavailableError extends Error {}

export function jevConfigured(): boolean {
  return !!process.env.TYPESAFE_API_KEY;
}

async function postOnce(
  state: unknown,
  questions: Record<string, JevQuestion>,
  timeoutMs: number
): Promise<{ model: string; answers: Record<string, JevAnswer> }> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new JevUnavailableError("TYPESAFE_API_KEY is not configured.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: JEV_MODEL, state, questions }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      const err = new Error(`Jev HTTP ${res.status}: ${text}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    const json = (await res.json()) as { model?: string; answers?: Record<string, JevAnswer> };
    return { model: json.model ?? JEV_MODEL, answers: json.answers ?? {} };
  } finally {
    clearTimeout(timer);
  }
}

async function postWithRetry(
  state: unknown,
  questions: Record<string, JevQuestion>,
  timeoutMs: number
): Promise<{ model: string; answers: Record<string, JevAnswer> }> {
  try {
    return await postOnce(state, questions, timeoutMs);
  } catch (e) {
    if (e instanceof JevUnavailableError) throw e;
    const status = (e as { status?: number }).status;
    // client errors (bad request / auth) are not worth retrying
    if (status && status >= 400 && status < 500 && status !== 429) throw e;
    await new Promise((r) => setTimeout(r, status === 429 ? 600 : 150));
    return postOnce(state, questions, timeoutMs);
  }
}

/**
 * Ask Jev a batch of questions about one state. Large batches are split into
 * chunks of JEV_MAX_QUESTIONS sent in parallel. Each chunk: timeout + one retry.
 */
export async function judge(
  state: unknown,
  questions: Record<string, JevQuestion>,
  opts: { timeoutMs?: number } = {}
): Promise<JevResult> {
  const t0 = Date.now();
  const ids = Object.keys(questions);
  const chunks: Record<string, JevQuestion>[] = [];
  for (let i = 0; i < ids.length; i += JEV_MAX_QUESTIONS) {
    const c: Record<string, JevQuestion> = {};
    for (const id of ids.slice(i, i + JEV_MAX_QUESTIONS)) c[id] = questions[id];
    chunks.push(c);
  }
  const res = await Promise.all(chunks.map((c) => postWithRetry(state, c, opts.timeoutMs ?? 6000)));
  const answers: Record<string, JevAnswer> = {};
  for (const r of res) Object.assign(answers, r.answers);
  return { model: res[0]?.model ?? JEV_MODEL, answers, latencyMs: Date.now() - t0, requests: chunks.length };
}
