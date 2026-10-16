/**
 * Server-only helpers shared by the API routes: bounded JSON body parsing,
 * a small in-memory per-IP rate limiter (protects the shared Gemini/TypeSafe
 * keys on a public Cloud Run URL), and friendly upstream error messages.
 *
 * Never put secrets in anything returned from here.
 */

import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";

export type JsonResult<T> = { ok: true; data: T } | { ok: false; res: NextResponse };

export function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

/**
 * Read a JSON body with a hard byte cap (Next route handlers have no default
 * limit). Optionally validate it with a zod schema.
 */
export async function readJson<T = Record<string, unknown>>(
  req: NextRequest,
  maxBytes: number,
  schema?: z.ZodType<T>
): Promise<JsonResult<T>> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return { ok: false, res: jsonError(`Request is too large (max ${Math.round(maxBytes / 1024)} KB).`, 413) };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, res: jsonError("Could not read the request body.", 400) };
  }
  if (text.length > maxBytes) return { ok: false, res: jsonError(`Request is too large (max ${Math.round(maxBytes / 1024)} KB).`, 413) };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, res: jsonError("Invalid JSON body.", 400) };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, res: jsonError("Expected a JSON object body.", 400) };
  if (!schema) return { ok: true, data: raw as T };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.length ? `${first.path.join(".")}: ` : "";
    return { ok: false, res: jsonError(`Invalid request — ${where}${first?.message ?? "bad input"}.`, 400) };
  }
  return { ok: true, data: parsed.data };
}

/* ---------------------------- rate limiting ---------------------------- */

const buckets = new Map<string, { count: number; reset: number }>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/**
 * Fixed-window limiter per (route, ip). In-memory, so it is per instance —
 * good enough for max-instances 2. Returns a 429 response when exceeded.
 */
export function rateLimit(req: NextRequest, route: string, perMinute: number): NextResponse | null {
  const now = Date.now();
  const key = `${route}|${clientIp(req)}`;
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + 60_000 });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    return null;
  }
  b.count += 1;
  if (b.count > perMinute) {
    const retry = Math.max(1, Math.ceil((b.reset - now) / 1000));
    return NextResponse.json(
      { ok: false, error: `Too many requests — please wait ${retry}s and try again.`, retryAfterSec: retry, rateLimited: true },
      { status: 429, headers: { "Retry-After": String(retry) } }
    );
  }
  return null;
}

/* ---------------------------- upstream errors -------------------------- */

/** Turn a raw upstream (Gemini / TypeSafe / tiles) error into a short user-facing sentence. */
export function friendlyUpstreamError(err: unknown, provider: string): { message: string; status: number; rateLimited: boolean } {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = raw.toLowerCase();
  if (/\b429\b|resource_exhausted|quota|rate.?limit/.test(m))
    return { message: `${provider} is busy right now (rate limit reached). Please try again in a minute.`, status: 503, rateLimited: true };
  if (/timeout|timed out|abort|deadline/.test(m))
    return { message: `${provider} took too long to respond. Please try again.`, status: 504, rateLimited: false };
  if (/\b(401|403)\b|permission|api key|unauth/.test(m))
    return { message: `${provider} rejected the server's credentials. The rest of the app still works.`, status: 503, rateLimited: false };
  if (/no .*key|not configured/.test(m))
    return { message: `${provider} is not configured on this server.`, status: 503, rateLimited: false };
  if (/\b5\d\d\b|unavailable|overloaded/.test(m))
    return { message: `${provider} is temporarily unavailable. Please try again shortly.`, status: 503, rateLimited: false };
  if (/json/.test(m)) return { message: `${provider} returned an unreadable answer. Please try again.`, status: 502, rateLimited: false };
  return { message: `${provider} request failed. Please try again.`, status: 502, rateLimited: false };
}

/** Reject a promise after ms (keeps routes inside the platform request timeout). */
export function withTimeout<T>(p: Promise<T>, ms: number, label = "operation"): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<never>((_, rej) => {
      t = setTimeout(() => rej(new Error(`${label} timeout after ${ms} ms`)), ms);
    }),
  ]);
}
