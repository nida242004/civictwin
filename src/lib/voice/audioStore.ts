"use client";

/**
 * Persistent clip store (IndexedDB) for synthesized voice audio.
 * key -> encoded audio bytes (WAV/MP3), with a size-capped LRU. Every call is
 * best-effort: any failure (private mode, quota, no IDB) resolves to null.
 */

const DB_NAME = "praesidium-voice";
const CLIPS = "clips";
const META = "meta";
export const STORE_CAP_BYTES = 30 * 1024 * 1024;

let dbp: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CLIPS)) db.createObjectStore(CLIPS);
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

function wrap<T>(r: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    r.onsuccess = () => resolve(r.result ?? null);
    r.onerror = () => resolve(null);
  });
}

export async function idbGet(key: string): Promise<ArrayBuffer | null> {
  try {
    const db = await open();
    if (!db) return null;
    const tx = db.transaction([CLIPS, META], "readwrite");
    const bytes = await wrap<ArrayBuffer>(tx.objectStore(CLIPS).get(key));
    if (bytes) {
      const meta = await wrap<{ size: number; at: number }>(tx.objectStore(META).get(key));
      tx.objectStore(META).put({ size: meta?.size ?? bytes.byteLength, at: Date.now() }, key);
    }
    return bytes;
  } catch {
    return null;
  }
}

export async function idbPut(key: string, bytes: ArrayBuffer): Promise<void> {
  try {
    const db = await open();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction([CLIPS, META], "readwrite");
      tx.objectStore(CLIPS).put(bytes, key);
      tx.objectStore(META).put({ size: bytes.byteLength, at: Date.now() }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
    await evict(db);
  } catch {
    /* ignore */
  }
}

/** Drop least-recently-used clips until the total is under the cap. */
async function evict(db: IDBDatabase): Promise<void> {
  try {
    const rows = await new Promise<{ key: string; size: number; at: number }[]>((resolve) => {
      const out: { key: string; size: number; at: number }[] = [];
      const req = db.transaction(META, "readonly").objectStore(META).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out);
        out.push({ key: String(c.key), ...(c.value as { size: number; at: number }) });
        c.continue();
      };
      req.onerror = () => resolve(out);
    });
    let total = rows.reduce((s, r) => s + r.size, 0);
    if (total <= STORE_CAP_BYTES) return;
    rows.sort((a, b) => a.at - b.at);
    const tx = db.transaction([CLIPS, META], "readwrite");
    for (const r of rows) {
      if (total <= STORE_CAP_BYTES * 0.9) break;
      tx.objectStore(CLIPS).delete(r.key);
      tx.objectStore(META).delete(r.key);
      total -= r.size;
    }
  } catch {
    /* ignore */
  }
}
