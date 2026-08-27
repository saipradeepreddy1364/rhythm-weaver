import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

/**
 * MemoryStorage — in-memory cache backed by AsyncStorage.
 *
 * Key fix: setItem() queues writes in a serial promise chain so that even rapid
 * successive writes complete in order and aren't dropped when the app closes.
 */
class MemoryStorage {
  private cache: Record<string, string> = {};
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // Serial write queue: each write waits for the previous to finish
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.ensureInitialized();
  }

  async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.init();
    }
    await this.initPromise;
  }

  private async init() {
    if (!AsyncStorage) {
      console.warn("[MemoryStorage] AsyncStorage is undefined. Local storage will use memory fallback.");
      this.initialized = true;
      return;
    }
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

    if (!AsyncStorage) {
      console.warn("[MemoryStorage] AsyncStorage is undefined. setItem cached only in memory.");
      return;
    }

    // Write to AsyncStorage directly and instantly so writes are not lost on app suspension
    try {
      const p = (AsyncStorage as any).setItem(k, v);
      if (p && typeof p.catch === "function") {
        p.catch((err: any) => {
          console.warn("[MemoryStorage] setItem failed for key:", k, err);
        });
      }
    } catch (err: any) {
      console.warn("[MemoryStorage] setItem synchronous error for key:", k, err);
    }
  }

  removeItem(key: any): void {
    const k = key !== null && key !== undefined ? String(key) : "";
    delete this.cache[k];

    if (!AsyncStorage) {
      console.warn("[MemoryStorage] AsyncStorage is undefined. removeItem deleted from memory only.");
      return;
    }

    try {
      const p = (AsyncStorage as any).removeItem(k);
      if (p && typeof p.catch === "function") {
        p.catch((err: any) => {
          console.warn("[MemoryStorage] removeItem failed for key:", k, err);
        });
      }
    } catch (err: any) {
      console.warn("[MemoryStorage] removeItem synchronous error for key:", k, err);
    }
  }

  /**
   * Force-flush all pending writes. Call before app backgrounding if needed.
   */
  async flush(): Promise<void> {
    await this.writeQueue;
  }

  clear(): void {
    this.cache = {};

    if (!AsyncStorage) {
      console.warn("[MemoryStorage] AsyncStorage is undefined. clear cleared memory only.");
      return;
    }

    this.writeQueue = this.writeQueue.then(() => {
      try {
        const p = (AsyncStorage as any).clear();
        if (p && typeof p.catch === "function") {
          return p.catch((err: any) => {
            console.warn("[MemoryStorage] clear failed:", err);
          });
        }
      } catch (err: any) {
        console.warn("[MemoryStorage] clear synchronous error:", err);
      }
    });
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
if (typeof global !== "undefined" && Platform.OS !== "web") {
  (global as any).localStorage = localStorage;
  (global as any).sessionStorage = sessionStorage;
}
