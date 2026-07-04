import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * MemoryStorage — in-memory cache backed by AsyncStorage.
 *
 * Key fix: setItem() queues writes in a serial promise chain so that even rapid
 * successive writes complete in order and aren't dropped when the app closes.
 */
class MemoryStorage {
  private cache: Record<string, string> = {};
  private initialized = false;
  private initPromise: Promise<void>;

  // Serial write queue: each write waits for the previous to finish
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.initPromise = this.init();
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await Promise.race([
      this.initPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  }

  private async init() {
    try {
      const keys = await (AsyncStorage as any).getAllKeys();
      if (keys && keys.length > 0) {
        const pairs = await (AsyncStorage as any).multiGet(keys);
        for (const [key, value] of pairs) {
          if (value !== null) {
            this.cache[key] = value;
          }
        }
      }
      this.initialized = true;
    } catch (err: any) {
      console.warn("[MemoryStorage] Init failed:", err);
      this.initialized = true; // Mark initialized even on failure so app doesn't hang
    }
  }

  getItem(key: string): string | null {
    return this.cache[key] ?? null;
  }

  setItem(key: string, value: string): void {
    // Update in-memory cache immediately (synchronous read is always up to date)
    this.cache[key] = value;

    // Queue the AsyncStorage write serially — no writes are dropped or reordered
    this.writeQueue = this.writeQueue.then(() =>
      (AsyncStorage as any)
        .setItem(key, value)
        .catch((err: any) => {
          console.warn("[MemoryStorage] setItem failed for key:", key, err);
        })
    );
  }

  removeItem(key: string): void {
    delete this.cache[key];
    this.writeQueue = this.writeQueue.then(() =>
      (AsyncStorage as any)
        .removeItem(key)
        .catch((err: any) => {
          console.warn("[MemoryStorage] removeItem failed for key:", key, err);
        })
    );
  }

  /**
   * Force-flush all pending writes. Call before app backgrounding if needed.
   */
  async flush(): Promise<void> {
    await this.writeQueue;
  }

  clear(): void {
    this.cache = {};
    this.writeQueue = this.writeQueue.then(() =>
      (AsyncStorage as any).clear().catch((err: any) => {
        console.warn("[MemoryStorage] clear failed:", err);
      })
    );
  }
}

class SessionMemoryStorage {
  private cache: Record<string, string> = {};

  async ensureInitialized(): Promise<void> {
    return;
  }

  getItem(key: string): string | null {
    return this.cache[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.cache[key] = value;
  }

  removeItem(key: string): void {
    delete this.cache[key];
  }

  clear(): void {
    this.cache = {};
  }
}

export const localStorage = new MemoryStorage();
export const sessionStorage = new SessionMemoryStorage();

// Apply polyfills to global context so standard browser-focused libraries can also use them
if (typeof global !== "undefined") {
  (global as any).localStorage = localStorage;
  (global as any).sessionStorage = sessionStorage;
}
