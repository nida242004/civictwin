/**
 * Browser-side fetch helper for the app's own /api routes. Always resolves to
 * a readable message: non-JSON gateway pages (Cloud Run 504/502), network
 * drops and rate limits never surface as "Unexpected token <" or blank errors.
 */

export class ApiError extends Error {
  status: number;
  rateLimited: boolean;
  constructor(message: string, status = 0, rateLimited = false) {
    super(message);
    this.status = status;
    this.rateLimited = rateLimited;
  }
}

function statusMessage(status: number): string {
  if (status === 429) return "Too many requests right now — please wait a moment and try again.";
  if (status === 413) return "That request was too large for the server.";
  if (status === 504 || status === 408) return "The server took too long to respond. Please try again.";
  if (status >= 500) return "The server had a problem handling that request. Please try again.";
  if (status === 404) return "That feature is not available on this server.";
  return `Request failed (HTTP ${status}).`;
}

export async function postApi<T = unknown>(url: string, body: unknown, init: { signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: init.signal });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError("Could not reach the server — check your connection and try again.");
  }
  let json: { ok?: boolean; error?: string; data?: T; rateLimited?: boolean } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!json) throw new ApiError(statusMessage(res.status), res.status, res.status === 429);
  if (!json.ok) {
    const msg = typeof json.error === "string" && json.error.trim() ? json.error : statusMessage(res.status);
    throw new ApiError(msg, res.status, Boolean(json.rateLimited) || res.status === 429);
  }
  return json.data as T;
}
