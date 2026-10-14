/**
 * Pure helpers shared by the browser voice system and scripts/bake-voice.ts
 * (no DOM, no React) so both sides derive identical cache keys.
 */

/** cyrb53 string hash -> 14 hex chars. */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, "0");
}

/** Normalise text exactly as /api/ai/tts does (whitespace, 240 chars). */
export function normalizeSpeech(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

/** Cache key for one spoken clip: hash(voice + text). */
export function clipHash(voice: string, text: string): string {
  return hashString(`${voice}|${normalizeSpeech(text)}`);
}

export const NARRATE_MAX_BEATS = 40;

/** Choose the beats worth rewriting (highest severity first, then time order). */
export function pickBeats<T extends { severity: number }>(beats: T[], max = NARRATE_MAX_BEATS): T[] {
  if (beats.length <= max) return beats;
  return beats
    .map((b, i) => ({ b, i }))
    .sort((a, c) => c.b.severity - a.b.severity || a.i - c.i)
    .slice(0, max)
    .sort((a, c) => a.i - c.i)
    .map((x) => x.b);
}

/** Key for a baked narration set: language + the (default-line) beats it rewrites. */
export function narrationKey(lang: string, beats: { tSec: number; kind: string; line: string }[]): string {
  return hashString(`${lang}#` + beats.map((b) => `${Math.round(b.tSec * 10)}|${b.kind}|${b.line}`).join("\n"));
}
