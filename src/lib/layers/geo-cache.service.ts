/**
 * In-memory TTL + LRU cache for decoded geo payloads, plus shared in-flight request de-duplication.
 */

/** Options of a {@link GeoCache}. */
export interface GeoCacheOptions<T> {
  /** Entries older than this (ms) are treated as missing. */
  ttlMs: number;
  /** Least-recently-used entries are evicted beyond this size. */
  maxEntries: number;
  /** Called whenever an entry leaves the cache (replace, delete, clear, expiry, LRU). */
  onEvict?: (value: T, key: string) => void;
  /** Clock override (tests). Defaults to `Date.now`. */
  now?: () => number;
}

/** A cached value and the time it was stored. */
export interface GeoCacheEntry<T> {
  value: T;
  storedAt: number;
}

/** TTL + LRU cache backed by a `Map` (insertion order = recency order). */
export class GeoCache<T> {
  private readonly entries = new Map<string, GeoCacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly onEvict?: (value: T, key: string) => void;
  private readonly now: () => number;

  constructor(options: GeoCacheOptions<T>) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries;
    this.onEvict = options.onEvict;
    this.now = options.now ?? Date.now;
  }

  /** Returns the live entry for `key`, evicting it when expired. */
  private live(key: string): GeoCacheEntry<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.storedAt >= this.ttlMs) {
      this.entries.delete(key);
      this.onEvict?.(entry.value, key);
      return undefined;
    }
    return entry;
  }

  /** Value for `key`, or undefined if missing/expired. A hit refreshes LRU order. */
  get(key: string): T | undefined {
    const entry = this.live(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /** Like {@link GeoCache.get} but returns the entry with its store time (no LRU bump). */
  getEntry(key: string): GeoCacheEntry<T> | undefined {
    return this.live(key);
  }

  /** Stores `value`, evicting the replaced value and least-recently-used overflow. */
  set(key: string, value: T): void {
    const old = this.entries.get(key);
    if (old) {
      this.entries.delete(key);
      if (old.value !== value) this.onEvict?.(old.value, key);
    }
    this.entries.set(key, { value, storedAt: this.now() });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.entries().next();
      if (oldest.done) break;
      const [oldKey, oldEntry] = oldest.value;
      this.entries.delete(oldKey);
      this.onEvict?.(oldEntry.value, oldKey);
    }
  }

  /** True when a non-expired entry exists. */
  has(key: string): boolean {
    return this.live(key) !== undefined;
  }

  /** Removes `key`; returns whether it existed. */
  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.onEvict?.(entry.value, key);
    return true;
  }

  /** Removes every entry, calling `onEvict` for each. */
  clear(): void {
    const all = [...this.entries];
    this.entries.clear();
    for (const [key, entry] of all) this.onEvict?.(entry.value, key);
  }

  /** Number of stored entries (expired ones count until touched). */
  get size(): number {
    return this.entries.size;
  }
}

const inflight = new Map<string, Promise<unknown>>();

/** Concurrent callers with the same key share one promise until it settles. */
export function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = (async () => {
    try {
      return await run();
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/** Test helper: forgets every in-flight request. */
export function __resetDedupeForTests(): void {
  inflight.clear();
}
