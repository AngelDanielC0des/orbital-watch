import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEnvelope, withFlags } from "./http";
import { isRecord } from "./validate";

const meta = { source: "test", dataDate: "2026-10-30", fetchedAt: "2026-10-30T00:00:00Z", fallback: false };

function isData(value: unknown): value is { n: number } {
  return isRecord(value) && typeof value.n === "number";
}

function stubFetch(response: Response) {
  const fn = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("withFlags", () => {
  it("returns the path untouched without flags", () => {
    expect(withFlags("/api/x", { mockError: false, forceSnapshot: false })).toBe("/api/x");
  });

  it("appends mock=error or mock=snapshot", () => {
    expect(withFlags("/api/x", { mockError: true, forceSnapshot: false })).toBe("/api/x?mock=error");
    expect(withFlags("/api/x", { mockError: false, forceSnapshot: true })).toBe("/api/x?mock=snapshot");
  });

  it("mockError wins over forceSnapshot", () => {
    expect(withFlags("/api/x", { mockError: true, forceSnapshot: true })).toBe("/api/x?mock=error");
  });

  it("uses & when the path already has a query", () => {
    expect(withFlags("/api/x?a=1", { mockError: false, forceSnapshot: true })).toBe("/api/x?a=1&mock=snapshot");
  });
});

describe("fetchEnvelope", () => {
  const signal = new AbortController().signal;

  it("returns data and meta for a valid envelope", async () => {
    const fn = stubFetch(json({ ok: true, data: { n: 1 }, meta }));
    const result = await fetchEnvelope("/api/x", signal, isData);
    expect(result).toEqual({ ok: true, value: { data: { n: 1 }, meta } });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("is invalid when the guard fails", async () => {
    stubFetch(json({ ok: true, data: { n: "x" }, meta }));
    const result = await fetchEnvelope("/api/x", signal, isData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid");
  });

  it("is upstream for a non-JSON 500", async () => {
    stubFetch(new Response("<html>oops</html>", { status: 500 }));
    const result = await fetchEnvelope("/api/x", signal, isData);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("upstream");
      expect(result.error.detail).toContain("500");
    }
  });

  it("propagates an error envelope code and message", async () => {
    stubFetch(json({ ok: false, error: { code: "invalid", message: "bad thing" }, meta }, 502));
    const result = await fetchEnvelope("/api/x", signal, isData);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid");
      expect(result.error.detail).toBe("bad thing");
    }
  });

  it("maps an aborted error envelope to upstream", async () => {
    stubFetch(json({ ok: false, error: { code: "aborted", message: "gone" }, meta }));
    const result = await fetchEnvelope("/api/x", signal, isData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("upstream");
  });

  it("is aborted when fetch rejects with AbortError", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new DOMException("x", "AbortError"))));
    const result = await fetchEnvelope("/api/x", signal, isData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("aborted");
  });

  it("is network when fetch rejects with another error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const result = await fetchEnvelope("/api/x", signal, isData);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("network");
      expect(result.error.detail).toBe("Failed to fetch");
    }
  });

  it("is invalid when meta is missing or malformed", async () => {
    stubFetch(json({ ok: true, data: { n: 1 } }));
    const missing = await fetchEnvelope("/api/x", signal, isData);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("invalid");

    stubFetch(json({ ok: true, data: { n: 1 }, meta: { ...meta, fallback: "no" } }));
    const bad = await fetchEnvelope("/api/x", signal, isData);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("invalid");
  });
});
