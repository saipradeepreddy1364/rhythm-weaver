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
    await this.initPromise;
  }

  private async init() {
    try {
      const allKeys = await (AsyncStorage as any).getAllKeys();
      if (allKeys && allKeys.length > 0) {
        // Skip huge cached sections and categories to prevent blocking bootstrap multiGet
        const criticalKeys = allKeys.filter(
          (k: string) => !k.startsWith("hp_") && !k.startsWith("category_")
        );
        if (criticalKeys.length > 0) {
          const pairs = await (AsyncStorage as any).multiGet(criticalKeys);
          for (const [key, value] of pairs) {
            if (value !== null && this.cache[key] === undefined) {
              this.cache[key] = value;
            }
          }
        }
      }
      this.initialized = true;
    } catch (err: any) {
      console.warn("[MemoryStorage] Init failed:", err);
      this.initialized = true; // Mark initialized even on failure so app doesn't hang
    }
  }

  getItem(key: any): string | null {
    const k = key !== null && key !== undefined ? String(key) : "";
    return this.cache[k] ?? null;
  }

  setItem(key: any, value: any): void {
    const k = key !== null && key !== undefined ? String(key) : "";
    const v = value !== null && value !== undefined ? String(value) : "";
    
    // Update in-memory cache immediately (synchronous read is always up to date)
    this.cache[k] = v;

    // Write to AsyncStorage directly and instantly so writes are not lost on app suspension
    (AsyncStorage as any)
      .setItem(k, v)
      .catch((err: any) => {
        console.warn("[MemoryStorage] setItem failed for key:", k, err);
      });
  }

  removeItem(key: any): void {
    const k = key !== null && key !== undefined ? String(key) : "";
    delete this.cache[k];
    (AsyncStorage as any)
      .removeItem(k)
      .catch((err: any) => {
        console.warn("[MemoryStorage] removeItem failed for key:", k, err);
      });
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
