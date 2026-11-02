/**
 * Typed pub/sub for per-frame data. Lives outside React: subscribers write DOM via refs,
 * never `setState`. `publish` is allocation-free; listener errors are isolated.
 */
export type FrameListener<T> = (frame: T) => void;

export interface FrameBus<T> {
  subscribe(listener: FrameListener<T>): () => void;
  publish(frame: T): void;
  /** Last published frame, for a subscriber that mounts between frames. */
  readonly last: T | null;
  clear(): void;
}

export function createFrameBus<T>(): FrameBus<T> {
  const listeners = new Set<FrameListener<T>>();
  let last: T | null = null;
  return {
    get last() {
      return last;
    },
    subscribe(listener) {
      listeners.add(listener);
      if (last !== null) listener(last);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(frame) {
      last = frame;
      for (const listener of listeners) {
        try {
          listener(frame);
        } catch (err) {
          console.error("[FrameBus] listener failed", err);
        }
      }
    },
    clear() {
      listeners.clear();
      last = null;
    },
  };
}
