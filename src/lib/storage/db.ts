/**
 * Minimal IndexedDB wrapper (no external dependency).
 * Database: praesidium | store: projects (key = projectId)
 */

const DB_NAME = "praesidium";
const DB_VERSION = 1;
const STORE = "projects";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "projectId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB."));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed."));
    });
  } finally {
    db.close();
  }
}

export interface ProjectRecord {
  projectId: string;
  name: string;
  modifiedAt: string;
  projectJson: unknown;
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const all = await tx<ProjectRecord[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
}

export async function getProject(id: string): Promise<ProjectRecord | undefined> {
  return tx<ProjectRecord | undefined>("readonly", (s) => s.get(id));
}

export async function putProject(record: ProjectRecord): Promise<void> {
  await tx("readwrite", (s) => s.put(record));
}

export async function deleteProject(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export const storageAvailable = (() => {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
})();
