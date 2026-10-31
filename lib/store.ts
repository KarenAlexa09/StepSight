// Tiny IndexedDB key/value store for images (step strips, replays): localStorage caps at ~5 MB, this at hundreds.
const DB = "stepsight";
const STORE = "blobs";

let db: Promise<IDBDatabase> | null = null;
function open() {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return db;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return open()
    .then(
      (d) =>
        new Promise<T>((resolve, reject) => {
          const req = fn(d.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => reject(req.error);
        }),
    )
    .catch(() => undefined); // private mode or blocked storage: behave as empty
}

export const getItem = <T>(key: string) => run<T>("readonly", (s) => s.get(key));
export const setItem = (key: string, value: unknown) => run("readwrite", (s) => s.put(value, key));
