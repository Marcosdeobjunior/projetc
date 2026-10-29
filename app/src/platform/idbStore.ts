import type { KeyValueStore } from "./kvFs";

const DB_NAME = "inkflow";
const STORE = "files";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Armazenamento no IndexedDB do navegador (usado no modo prévia). */
export class IdbStore implements KeyValueStore {
  private constructor(private db: IDBDatabase) {}

  static async open(): Promise<IdbStore> {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    return new IdbStore(await request(req));
  }

  private tx(mode: IDBTransactionMode) {
    return this.db.transaction(STORE, mode).objectStore(STORE);
  }

  async get(key: string) {
    return request(this.tx("readonly").get(key)) as Promise<string | Uint8Array | undefined>;
  }

  async set(key: string, value: string | Uint8Array) {
    await request(this.tx("readwrite").put(value, key));
  }

  async delete(keys: string[]) {
    if (keys.length === 0) return;
    const store = this.tx("readwrite");
    await Promise.all(keys.map((k) => request(store.delete(k))));
  }

  async keys(prefix: string) {
    // "￿" fecha o intervalo: pega todas as chaves que começam com o prefixo.
    const range = IDBKeyRange.bound(prefix, prefix + "￿");
    const all = await request(this.tx("readonly").getAllKeys(range));
    return all.map(String);
  }
}
