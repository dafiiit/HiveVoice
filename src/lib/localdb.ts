"use client";
// The device's own database (IndexedDB): what the app keeps to show at once and without a connection (chats), and the
// changes made offline that wait for the connection (queue). Deleted when signing out (forgetDevice), like the kept pages.
// Without IndexedDB (a private window in some browsers) every call quietly does nothing.

const NAME = "hivevoice";
const VERSION = 1;
export type Store = "chats" | "queue";

let opening: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        for (const s of ["chats", "queue"]) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => {
        const d = req.result;
        // Another tab deleting the database (signing out) closes this one.
        d.onversionchange = () => { d.close(); opening = null; };
        resolve(d);
      };
      req.onerror = () => { opening = null; resolve(null); };
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return opening;
}

function run<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return db().then((d) => new Promise<T | undefined>((resolve) => {
    if (!d) return resolve(undefined);
    try {
      const req = fn(d.transaction(store, mode).objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

export const localGet = <T>(store: Store, key: string) => run<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>);
export const localPut = (store: Store, key: string, value: unknown) => run(store, "readwrite", (s) => s.put(value, key)).then(() => undefined);
export const localDelete = (store: Store, key: string) => run(store, "readwrite", (s) => s.delete(key)).then(() => undefined);
/** Every entry of a store, oldest key first. */
export async function localAll<T>(store: Store): Promise<{ key: string; value: T }[]> {
  const [keys, values] = await Promise.all([
    run<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys()),
    run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>),
  ]);
  return (keys ?? []).map((k, i) => ({ key: String(k), value: (values ?? [])[i] }));
}

/** Signing out: the whole database goes. */
export function forgetLocal() {
  opening = null;
  try { indexedDB.deleteDatabase(NAME); } catch { /* not available */ }
}
