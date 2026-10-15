"use client";

/**
 * Browser side of the Jev behaviour policy:
 *   memory cache → IndexedDB cache → POST /api/ai/jev/policy → pre-baked
 *   table shipped in /public/jev (offline demo / API failure) → null (heuristics).
 * Every step is best-effort and time-boxed, so a run is never blocked for long.
 */

import type { ScenarioConfig } from "@/lib/world/types";
import { policyCacheKey, type JevPolicy } from "@/lib/sim/policy";

const mem = new Map<string, JevPolicy>();
const DB = "praesidium-jev";
const STORE = "policies";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    return await new Promise<T | null>((resolve) => {
      const r = fn(db.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve((r.result as T) ?? null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export interface PolicyFetchInfo {
  policy: JevPolicy | null;
  from: "memory" | "indexeddb" | "jev" | "prebaked" | "none";
  latencyMs: number;
}

let lastInfo: PolicyFetchInfo | null = null;
export const lastPolicyInfo = () => lastInfo;

/** Resolve a policy table for this world + scenario (never throws). */
export async function getJevPolicy(
  worldTag: string,
  scenario: ScenarioConfig,
  opts: { timeoutMs?: number; preferPrebaked?: boolean } = {}
): Promise<PolicyFetchInfo> {
  const t0 = performance.now();
  const key = policyCacheKey(worldTag, scenario);
  const done = (policy: JevPolicy | null, from: PolicyFetchInfo["from"]) =>
    (lastInfo = { policy: policy ? { ...policy, key } : null, from, latencyMs: Math.round(performance.now() - t0) });

  const m = mem.get(key);
  if (m) return done(m, "memory");
  // Demo worlds use the shipped table first so every viewer sees the identical night
  // (live Jev distributions drift slightly between calls).
  if (opts.preferPrebaked) {
    const pre = await loadPrebaked(scenario.id);
    if (pre) {
      mem.set(key, pre);
      return done(pre, "prebaked");
    }
  }
  const stored = await idb<JevPolicy>("readonly", (s) => s.get(key));
  if (stored?.table) {
    mem.set(key, stored);
    return done(stored, "indexeddb");
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000);
    const res = await fetch("/api/ai/jev/policy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        site: worldTag,
        scenario: {
          name: scenario.name,
          description: scenario.description,
          startTime: scenario.startTime,
          perpCount: scenario.perpCount,
          guardFatigue: scenario.guardFatigue,
          ambientVisibility: scenario.ambientVisibility,
          incidentMix: scenario.incidentMix,
        },
      }),
    }).finally(() => clearTimeout(timer));
    const json = (await res.json()) as { ok: boolean; data?: { policy: JevPolicy } };
    if (json.ok && json.data?.policy && Object.keys(json.data.policy.table).length) {
      mem.set(key, json.data.policy);
      void idb("readwrite", (s) => s.put(json.data!.policy, key));
      return done(json.data.policy, "jev");
    }
  } catch {
    /* fall through to the pre-baked table */
  }
  const pre = await loadPrebaked(scenario.id);
  if (pre) {
    mem.set(key, pre);
    return done(pre, "prebaked");
  }
  return done(null, "none");
}

export async function loadPrebaked(id: string): Promise<JevPolicy | null> {
  const file = id === "low_visibility_night" || id === "high_risk_night" ? id : "typical_night";
  try {
    const r = await fetch(`/jev/policy-${file}.json`);
    if (!r.ok) return null;
    const p = (await r.json()) as JevPolicy;
    return p?.table ? { ...p, source: "prebaked" } : null;
  } catch {
    return null;
  }
}
