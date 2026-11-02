import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeoCache, dedupe, __resetDedupeForTests } from "./geo-cache.service";

describe("GeoCache", () => {
  let t = 0;
  const now = () => t;
  beforeEach(() => {
    t = 1000;
  });

  it("expires entries after ttl and calls onEvict", () => {
    const onEvict = vi.fn();
    const c = new GeoCache<string>({ ttlMs: 100, maxEntries: 5, onEvict, now });
    c.set("a", "A");
    t += 99;
    expect(c.get("a")).toBe("A");
    t += 1;
    expect(c.get("a")).toBeUndefined();
    expect(onEvict).toHaveBeenCalledWith("A", "a");
    expect(c.size).toBe(0);
  });

  it("getEntry and has respect expiry", () => {
    const c = new GeoCache<string>({ ttlMs: 100, maxEntries: 5, now });
    c.set("a", "A");
    expect(c.getEntry("a")).toEqual({ value: "A", storedAt: 1000 });
    expect(c.has("a")).toBe(true);
    t += 100;
    expect(c.has("a")).toBe(false);
    expect(c.getEntry("a")).toBeUndefined();
  });

  it("evicts least-recently-used first, hits refresh order", () => {
    const onEvict = vi.fn();
    const c = new GeoCache<number>({ ttlMs: 1e6, maxEntries: 2, onEvict, now });
    c.set("a", 1);
    c.set("b", 2);
    expect(c.get("a")).toBe(1);
    c.set("c", 3);
    expect(onEvict).toHaveBeenCalledWith(2, "b");
    expect(c.has("a")).toBe(true);
    expect(c.has("b")).toBe(false);
    expect(c.size).toBe(2);
  });

  it("calls onEvict on replace (only if different), delete and clear", () => {
    const onEvict = vi.fn();
    const c = new GeoCache<string>({ ttlMs: 1e6, maxEntries: 5, onEvict, now });
    c.set("a", "A1");
    c.set("a", "A1");
    expect(onEvict).not.toHaveBeenCalled();
    c.set("a", "A2");
    expect(onEvict).toHaveBeenCalledWith("A1", "a");
    c.set("b", "B");
    expect(c.delete("b")).toBe(true);
    expect(c.delete("b")).toBe(false);
    expect(onEvict).toHaveBeenCalledWith("B", "b");
    onEvict.mockClear();
    c.set("c", "C");
    c.clear();
    expect(onEvict).toHaveBeenCalledTimes(2);
    expect(c.size).toBe(0);
  });
});

describe("dedupe", () => {
  beforeEach(() => __resetDedupeForTests());

  it("shares one call between concurrent callers and clears after settle", async () => {
    const run = vi.fn(async () => 42);
    const [a, b] = await Promise.all([dedupe("k", run), dedupe("k", run)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(run).toHaveBeenCalledTimes(1);
    await dedupe("k", run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("clears after rejection", async () => {
    const run = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(dedupe("k", run)).rejects.toThrow("boom");
    await expect(dedupe("k", run)).rejects.toThrow("boom");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps different keys independent", async () => {
    const run = vi.fn(async () => 1);
    await Promise.all([dedupe("x", run), dedupe("y", run)]);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
