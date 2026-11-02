import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSnapshot } from "./snapshot-client";

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === "number");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const MANIFEST = { fires: { date: "2026-11-02", path: "/sites/orbitalwatch/data/fires-snapshot-2026-11-02.json" } };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSnapshot", () => {
  it("loads manifest then file", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => (String(url).endsWith("snapshots.json") ? json(MANIFEST) : json([1, 2])));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchSnapshot("fires", new AbortController().signal, isNumberArray);
    expect(result).toEqual({ ok: true, value: { data: [1, 2], date: "2026-11-02" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects unsafe paths and missing kinds", async () => {
    const bad = { fires: { date: "d", path: "/sites/orbitalwatch/data/../../secret.json" } };
    vi.stubGlobal("fetch", vi.fn(async () => json(bad)));
    const unsafe = await fetchSnapshot("fires", new AbortController().signal, isNumberArray);
    expect(!unsafe.ok && unsafe.error.code).toBe("invalid");
    const missing = await fetchSnapshot("pollution", new AbortController().signal, isNumberArray);
    expect(!missing.ok && missing.error.code).toBe("invalid");
  });

  it("rejects data failing the guard and HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (url) => (String(url).endsWith("snapshots.json") ? json(MANIFEST) : json({ x: 1 }))));
    const invalid = await fetchSnapshot("fires", new AbortController().signal, isNumberArray);
    expect(!invalid.ok && invalid.error.code).toBe("invalid");
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 404)));
    const http = await fetchSnapshot("fires", new AbortController().signal, isNumberArray);
    expect(!http.ok && http.error.code).toBe("upstream");
  });

  it("maps network failures and aborts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    const net = await fetchSnapshot("fires", new AbortController().signal, isNumberArray);
    expect(!net.ok && net.error.code).toBe("network");
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        controller.abort();
        init?.signal?.throwIfAborted();
        return json(MANIFEST);
      }),
    );
    const aborted = await fetchSnapshot("fires", controller.signal, isNumberArray);
    expect(!aborted.ok && aborted.error.code).toBe("aborted");
  });
});
