"use client";

/**
 * Background Local Intel loader: one fetch per project location, cached in
 * memory + IndexedDB keyed by rounded lat/lng. Never throws, never blocks UI.
 * Works when grounding is unavailable (the API returns an ungrounded briefing).
 */

import { useEffect } from "react";
import type { PraesidiumProject } from "@/lib/world/types";
import type { LocalIntel } from "./context";
import { useIntel } from "./intelStore";
import { useEditor } from "@/lib/store/editor";

/** Shanti Vihar demo locality (matches the Local Intel panel default). */
export const DEMO_GEO = { lat: 12.9918, lng: 77.5937, placeName: "Vasanth Nagar, Bengaluru" };

export function intelGeoOf(p: PraesidiumProject | null | undefined) {
  if (!p) return null;
  const g = p.source.geo;
  if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) {
    return { lat: g.lat, lng: g.lng, placeName: g.placeName ?? p.name, societyType: g.societyType };
  }
  if (p.source.kind === "demo") return { ...DEMO_GEO, societyType: undefined as string | undefined };
  return null;
}

export const intelKey = (lat: number, lng: number) => `intel_${lat.toFixed(3)}_${lng.toFixed(3)}`;

const mem = new Map<string, LocalIntel>();
const inflight = new Map<string, Promise<LocalIntel | null>>();
const DB = "praesidium-intel";
const STORE = "intel";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
      req.onsuccess = () => {
        try {
          const r = fn(req.result.transaction(STORE, mode).objectStore(STORE));
          r.onsuccess = () => resolve((r.result as T) ?? null);
          r.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

/** Persist intel (also used by the panel's manual Refresh). */
export function cacheIntel(key: string, intel: LocalIntel) {
  mem.set(key, intel);
  void idb("readwrite", (s) => s.put(intel, key));
}

async function fetchIntel(key: string, geo: NonNullable<ReturnType<typeof intelGeoOf>>): Promise<LocalIntel | null> {
  const m = mem.get(key);
  if (m) return m;
  const stored = await idb<LocalIntel>("readonly", (s) => s.get(key));
  if (stored?.summary && Date.now() - Date.parse(stored.generatedAt) < MAX_AGE_MS) {
    mem.set(key, stored);
    return stored;
  }
  try {
    const res = await fetch("/api/ai/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: geo.lat, lng: geo.lng, placeName: geo.placeName, societyType: geo.societyType }),
    });
    const json = await res.json();
    if (json?.ok && json.data?.summary) {
      cacheIntel(key, json.data as LocalIntel);
      return json.data as LocalIntel;
    }
  } catch {
    /* ungrounded / offline: callers just see no intel */
  }
  return null;
}

/** Load (once per location) and publish into the store. */
export async function ensureIntel(project: PraesidiumProject | null | undefined): Promise<LocalIntel | null> {
  const geo = intelGeoOf(project);
  const st = useIntel.getState();
  if (!geo) {
    st.setIntel(null);
    st.setStatus("idle", null);
    return null;
  }
  const key = intelKey(geo.lat, geo.lng);
  if (st.key === key && st.intel) return st.intel;
  useIntel.setState({ intel: null, key, status: "loading" });
  let p = inflight.get(key);
  if (!p) {
    p = fetchIntel(key, geo).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  const intel = await p;
  if (useIntel.getState().key !== key) return intel; // project changed meanwhile
  if (intel) useIntel.setState({ intel, status: "ready" });
  else useIntel.setState({ status: "error" });
  return intel;
}

/** Wait (bounded) for an in-flight load, e.g. before building a policy table. */
export async function intelSoon(ms = 4000) {
  const t0 = Date.now();
  while (useIntel.getState().status === "loading" && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 100));
  return useIntel.getState().intel;
}

/** Mount once in the editor shell: fetch intel when a project opens or relocates. */
export function useAutoIntel() {
  // primitive selectors: re-render only when the project or its location changes
  const pid = useEditor((s) => s.project?.projectId);
  const key = useEditor((s) => {
    const g = intelGeoOf(s.project);
    return g ? intelKey(g.lat, g.lng) : null;
  });
  useEffect(() => {
    if (pid) void ensureIntel(useEditor.getState().project);
  }, [pid, key]);
}
