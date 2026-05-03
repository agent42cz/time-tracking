/**
 * Storage adapter — abstracts chrome.storage.local so the offline queue
 * can be tested in Node. The popup creates a ChromeStorageAdapter; tests
 * use InMemoryStorageAdapter.
 */
export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export class InMemoryStorageAdapter implements StorageAdapter {
  private map = new Map<string, unknown>();

  get<T>(key: string): Promise<T | null> {
    return Promise.resolve((this.map.get(key) as T | undefined) ?? null);
  }
  set<T>(key: string, value: T): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }
  remove(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }
}

export function createChromeStorageAdapter(): StorageAdapter {
  return {
    async get<T>(key: string): Promise<T | null> {
      const out = await chrome.storage.local.get(key);
      return (out[key] as T | undefined) ?? null;
    },
    async set<T>(key: string, value: T): Promise<void> {
      await chrome.storage.local.set({ [key]: value });
    },
    async remove(key: string): Promise<void> {
      await chrome.storage.local.remove(key);
    },
  };
}
