import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FiresDTO, ProviderContext } from "@/types/layers";
import { __resetDedupeForTests } from "@/lib/layers/geo-cache.service";
import { HOTSPOT_CAP } from "./fires-scale";
import { __resetFiresCacheForTests, createFiresProvider, isFiresDTO, toHeatmapPayload } from "./fires.service";

function makeDto(over: Partial<FiresDTO> = {}): FiresDTO {
  const hotspots: number[] = [];
  for (let i = 0; i < 1000; i += 1) hotspots.push(10 + (i % 50) * 0.1, 20, 500 - i * 0.4, i % 2);
  return {
    window: "24h",
    generatedAt: "2026-11-02T12:00:00.000Z",
    acqRange: { from: "2026-11-01T12:00:00Z", to: "2026-11-02T11:55:00Z" },
    sources: ["NOAA-20", "NOAA-21"],
    grid: { cols: 720, rows: 360, cells: [0, 10, 20, 719, 255, 128, 259199, 1, 2] },
    hotspots,
    total: 1234,
    ...over,
  };
}

function envelope(data: unknown): Response {
  return new Response(
    JSON.stringify({ ok: true, data, meta: { source: "FIRMS", dataDate: null, fetchedAt: "2026-11-02T12:00:01.000Z", fallback: false } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function ctx(tier: "lo" | "hi" = "hi"): ProviderContext {
  return { signal: new AbortController().signal, tier, flags: { mockError: false, forceSnapshot: false } };
}

describe("toHeatmapPayload", () => {
  it("expands sparse cells", () => {
    const p = toHeatmapPayload(makeDto(), { cap: 2000, dayNight: "all" });
    expect(p.density).toHaveLength(720 * 360);
    expect(p.density[0]).toBe(10);
    expect(p.intensity[0]).toBe(20);
    expect(p.density[719]).toBe(255);
    expect(p.intensity[719]).toBe(128);
    expect(p.density[259199]).toBe(1);
    expect(p.density[1]).toBe(0);
    expect(p.date).toBe("2026-11-02T11:55:00Z");
  });

  it("filters day/night and caps", () => {
    const day = toHeatmapPayload(makeDto(), { cap: 2000, dayNight: "day" });
    expect(day.hotspotCount).toBe(500);
    for (let i = 0; i < day.hotspotCount; i += 1) expect(day.hotspots[i * 4 + 3]).toBe(1);
    const night = toHeatmapPayload(makeDto(), { cap: 2000, dayNight: "night" });
    expect(night.hotspotCount).toBe(500);
    expect(night.hotspots[3]).toBe(0);
    const capped = toHeatmapPayload(makeDto(), { cap: 10, dayNight: "all" });
    expect(capped.hotspotCount).toBe(10);
    expect(capped.hotspots).toHaveLength(40);
  });

  it("falls back to generatedAt without acqRange", () => {
    expect(toHeatmapPayload(makeDto({ acqRange: null }), { cap: 5, dayNight: "all" }).date).toBe("2026-11-02T12:00:00.000Z");
  });
});

describe("isFiresDTO", () => {
  it("accepts a valid DTO and rejects broken ones", () => {
    expect(isFiresDTO(makeDto())).toBe(true);
    expect(isFiresDTO(null)).toBe(false);
    expect(isFiresDTO(makeDto({ window: "1h" as FiresDTO["window"] }))).toBe(false);
    expect(isFiresDTO(makeDto({ grid: { cols: 720, rows: 360, cells: [0, 1] } }))).toBe(false);
    expect(isFiresDTO(makeDto({ grid: { cols: 720, rows: 360, cells: [259200, 1, 1] } }))).toBe(false);
    expect(isFiresDTO(makeDto({ grid: { cols: 720, rows: 360, cells: [1.5, 1, 1] } }))).toBe(false);
    expect(isFiresDTO(makeDto({ grid: { cols: 720, rows: 360, cells: [1, 256, 1] } }))).toBe(false);
    expect(isFiresDTO(makeDto({ hotspots: [1, 2, 3] }))).toBe(false);
    expect(isFiresDTO(makeDto({ hotspots: [95, 2, 3, 1] }))).toBe(false);
    expect(isFiresDTO(makeDto({ hotspots: [1, 2, -3, 1] }))).toBe(false);
    expect(isFiresDTO(makeDto({ total: -1 }))).toBe(false);
  });
});

describe("firesProvider", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    __resetFiresCacheForTests();
    __resetDedupeForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads, caps per tier and reuses the cache when only dayNight changes", async () => {
    fetchMock.mockImplementation(async () => envelope(makeDto()));
    const provider = createFiresProvider();
    const hi = await provider.load({ window: "24h", dayNight: "all" }, ctx("hi"));
    expect(hi.ok).toBe(true);
    if (hi.ok) {
      expect(hi.value.payload.hotspotCount).toBe(Math.min(1000, HOTSPOT_CAP.hi));
      expect(hi.value.source).toBe("NOAA-20 + NOAA-21");
      expect(hi.value.empty).toBe(false);
      expect(hi.value.isFallback).toBe(false);
      expect(hi.value.fetchedAt).toBe(Date.parse("2026-11-02T12:00:01.000Z"));
    }
    const lo = await provider.load({ window: "24h", dayNight: "night" }, ctx("lo"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lo.ok && lo.value.payload.hotspotCount).toBe(500);
    await provider.load({ window: "48h", dayNight: "all" }, ctx("hi"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("window=48h");
  });

  it("caps at the lo tier", async () => {
    const dto = makeDto({ hotspots: Array.from({ length: 1000 }, (_, i) => [1, 2, 1000 - i, 1]).flat() });
    // 1000 hotspots exceed the lo cap of 800.
    fetchMock.mockImplementation(async () => envelope(dto));
    const lo = await createFiresProvider().load({ window: "7d", dayNight: "all" }, ctx("lo"));
    expect(lo.ok && lo.value.payload.hotspotCount).toBe(HOTSPOT_CAP.lo);
  });

  it("reports invalid data", async () => {
    fetchMock.mockImplementation(async () => envelope({ nope: true }));
    const result = await createFiresProvider().load({ window: "24h", dayNight: "all" }, ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid");
  });

  it("flags an empty window", async () => {
    fetchMock.mockImplementation(async () =>
      envelope(makeDto({ total: 0, sources: [], acqRange: null, hotspots: [], grid: { cols: 720, rows: 360, cells: [] } })),
    );
    const result = await createFiresProvider().load({ window: "24h", dayNight: "all" }, ctx());
    expect(result.ok && result.value.empty).toBe(true);
    expect(result.ok && result.value.source).toBe("FIRMS");
  });

  it("resolves aborted when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await createFiresProvider().load(
      { window: "24h", dayNight: "all" },
      { signal: controller.signal, tier: "hi", flags: { mockError: false, forceSnapshot: false } },
    );
    expect(!result.ok && result.error.code).toBe("aborted");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("client snapshot fallback", () => {
    function routing(live: () => Response | Promise<Response>): void {
      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("snapshots.json")) {
          return new Response(JSON.stringify({ fires: { date: "2026-11-01", path: "/sites/orbitalwatch/data/fires-snapshot-2026-11-01.json" } }));
        }
        if (url.includes("fires-snapshot")) return new Response(JSON.stringify(makeDto()));
        return live();
      });
    }

    it("uses the snapshot when the route answers 500", async () => {
      routing(() => new Response("boom", { status: 500 }));
      const result = await createFiresProvider().load({ window: "24h", dayNight: "all" }, ctx());
      expect(result.ok && result.value).toMatchObject({ isFallback: true, source: "NOAA-20 + NOAA-21 · instantánea", dataDate: "2026-11-02T11:55:00Z" });
      await createFiresProvider().load({ window: "24h", dayNight: "night" }, ctx());
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("uses the snapshot on a network error", async () => {
      routing(() => Promise.reject(new TypeError("offline")));
      const result = await createFiresProvider().load({ window: "24h", dayNight: "all" }, ctx());
      expect(result.ok && result.value.isFallback).toBe(true);
    });

    it("surfaces the error when mockError is set", async () => {
      routing(() => new Response("boom", { status: 500 }));
      const result = await createFiresProvider().load(
        { window: "24h", dayNight: "all" },
        { ...ctx(), flags: { mockError: true, forceSnapshot: false } },
      );
      expect(!result.ok && result.error.code).toBe("upstream");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("force skips the client cache", async () => {
      fetchMock.mockImplementation(async () => envelope(makeDto()));
      const provider = createFiresProvider();
      await provider.load({ window: "24h", dayNight: "all" }, ctx());
      await provider.load({ window: "24h", dayNight: "all" }, ctx());
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await provider.load({ window: "24h", dayNight: "all" }, { ...ctx(), force: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
