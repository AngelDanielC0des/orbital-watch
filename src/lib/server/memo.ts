/**
 * Module-level memo with TTL and in-flight de-duplication for the Route Handlers. Concurrent callers
 * of the same key share one promise; rejected or `shouldCache === false` results are not retained.
 */

interface Entry {
  expiresAt: number;
  promise: Promise<unknown>;
}

const entries = new Map<string, Entry>();

/**
 * Runs `run` at most once per `ttlMs` for `key`. In-flight calls are shared; a result that fails
 * `shouldCache` (or a rejection) is dropped as soon as it settles so the next call retries.
 */
export function memo<T>(key: string, ttlMs: number, run: () => Promise<T>, shouldCache: (v: T) => boolean): Promise<T> {
  const hit = entries.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise as Promise<T>;
  const promise = run();
  const entry: Entry = { expiresAt: Date.now() + ttlMs, promise };
  entries.set(key, entry);
  const drop = (): void => {
    if (entries.get(key) === entry) entries.delete(key);
  };
  promise.then((value) => {
    if (!shouldCache(value)) drop();
  }, drop);
  return promise;
}

/** Test helper: forgets every memoised entry. */
export function __resetMemoForTests(): void {
  entries.clear();
}
