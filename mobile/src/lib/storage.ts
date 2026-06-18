import AsyncStorage from "@react-native-async-storage/async-storage";

class MemoryStorage {
  private cache: Record<string, string> = {};
  private initialized = false;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.init();
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await Promise.race([
      this.initPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 2000))
    ]);
  }

  private async init() {
    try {
      const keys = await (AsyncStorage as any).getAllKeys();
      const pairs = await (AsyncStorage as any).multiGet(keys);
      for (const [key, value] of pairs) {
        if (value !== null) {
          this.cache[key] = value;
        }
      }
      this.initialized = true;
    } catch (err: any) {
      console.warn("[MemoryStorage] Init failed:", err);
    }
  }

  getItem(key: string): string | null {
    return this.cache[key] || null;
  }

  setItem(key: string, value: string): void {
    this.cache[key] = value;
    (AsyncStorage as any).setItem(key, value).catch((err: any) => {
      console.warn("[MemoryStorage] setItem failed:", err);
    });
  }

  removeItem(key: string): void {
    delete this.cache[key];
    (AsyncStorage as any).removeItem(key).catch((err: any) => {
      console.warn("[MemoryStorage] removeItem failed:", err);
    });
  }

  clear(): void {
    this.cache = {};
    (AsyncStorage as any).clear().catch((err: any) => {
      console.warn("[MemoryStorage] clear failed:", err);
    });
  }
}

class SessionMemoryStorage {
  private cache: Record<string, string> = {};

  async ensureInitialized(): Promise<void> {
    return;
  }

  getItem(key: string): string | null {
    return this.cache[key] || null;
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
