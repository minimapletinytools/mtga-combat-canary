import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface KVStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** In-memory store for tests and non-browser environments. */
export class MemoryStore implements KVStore {
  private map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
}

const DB_NAME = 'mtgatricks';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

interface MtgaTricksSchema extends DBSchema {
  kv: {
    key: string;
    value: string;
  };
}

/**
 * IndexedDB-backed store (single database `mtgatricks`, single object store
 * `kv`, via the `idb` package). Opens lazily on first get/set call.
 */
export class IndexedDbStore implements KVStore {
  private dbPromise: Promise<IDBPDatabase<MtgaTricksSchema>> | null = null;

  private open(): Promise<IDBPDatabase<MtgaTricksSchema>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<MtgaTricksSchema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        },
      });
    }
    return this.dbPromise;
  }

  async get(key: string): Promise<string | null> {
    const db = await this.open();
    const value = await db.get(STORE_NAME, key);
    return value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const db = await this.open();
    await db.put(STORE_NAME, value, key);
  }
}
