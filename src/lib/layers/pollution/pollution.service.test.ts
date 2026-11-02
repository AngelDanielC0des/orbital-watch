import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiMeta, PollutionDTO, PollutionPointDTO, ProviderContext } from "@/types/layers";
import { __resetDedupeForTests } from "../geo-cache.service";
import { __resetPollutionCacheForTests, createPollutionProvider, isPollutionDTO, toPointsPayload } from "./pollution.service";

function point(id: string, lat: number, lon: number, pm2_5: number | null, eaqi: number | null = null): PollutionPointDTO {
  return { id, name: id, lat, lon, pm2_5, pm10: 20, no2: null, o3: null, so2: null, co: null, eaqi, usaqi: null };
}

const DTO: PollutionDTO = {
  time: "2026-11-02T12:00Z",
  points: [point("a", 40.42, -3.7, 10, 30), point("b", -33.87, 151.21, null, 70), point("c", 0, 0, 150, 10)],
};

const META: ApiMeta = { source: "Open-Meteo", dataDate: "2026-11-02T12:00Z", fetchedAt: "2026-11-02T12:05:00Z", fallback: false };

function ctx(signal: AbortSignal = new AbortController().signal): ProviderContext {
  return { signal, tier: "hi", flags: { mockError: false, forceSnapshot: false } };
}

function envelopeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  __resetPollutionCacheForTests();
  __resetDedupeForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isPollutionDTO", () => {
  it("accepts a valid DTO", () => {
    expect(isPollutionDTO(DTO)).toBe(true);
  });
  it("rejects bad time, coordinates, values and sizes", () => {
    expect(isPollutionDTO({ ...DTO, time: "yesterday" })).toBe(false);
    expect(isPollutionDTO({ ...DTO, points: [point("x", 95, 0, 1)] })).toBe(false);
    expect(isPollutionDTO({ ...DTO, points: [point("x", 0, 181, 1)] })).toBe(false);
    expect(isPollutionDTO({ ...DTO, points: [{ ...point("x", 0, 0, 1), co: Number.NaN }] })).toBe(false);
    expect(isPollutionDTO({ ...DTO, points: [{ ...point("x", 0, 0, 1), co: undefined }] })).toBe(false);
    expect(isPollutionDTO({ ...DTO, points: Array.from({ length: 601 }, (_, i) => point(`p${i}`, 0, 0, 1)) })).toBe(false);
    expect(isPollutionDTO(null)).toBe(false);
  });
});

describe("toPointsPayload", () => {
  it("builds lat/lon pairs and normalised values", () => {
    const payload = toPointsPayload(DTO, "pm2_5");
    expect(payload.count).toBe(3);
    expect(Array.from(payload.latLon.slice(0, 2))).toEqual([Math.fround(40.42), Math.fround(-3.7)]);
    expect(payload.values[0]).toBeCloseTo(1 / 6, 5);
    expect(payload.values[1]).toBeNaN();
    expect(payload.values[2]).toBe(1);
    expect(payload.categorical).toBe(false);
    expect(payload.date).toBe("2026-11-02T12:00Z");
  });
  it("marks index scales categorical", () => {
    const payload = toPointsPayload(DTO, "eaqi");
    expect(payload.categorical).toBe(true);
    expect(payload.values[0]).toBeCloseTo(3 / 12, 5);
  });
});

describe("pollution provider", () => {
  it("reuses the cached DTO when the pollutant changes", async () => {
    const fetchMock = vi.fn(async () => envelopeResponse({ ok: true, data: DTO, meta: META }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createPollutionProvider({ now: () => 1234 });
    const first = await provider.load({ pollutant: "pm2_5" }, ctx());
    const second = await provider.load({ pollutant: "pm10" }, ctx());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.ok && first.value).toMatchObject({ dataDate: "2026-11-02T12:00Z", fetchedAt: 1234, isFallback: false, source: "CAMS (Open-Meteo)", empty: false });
    expect(second.ok && second.value.payload.values[0]).toBeCloseTo(1 / 6, 5);
  });

  it("flags a pollutant with no finite value as empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => envelopeResponse({ ok: true, data: DTO, meta: META })));
    const result = await createPollutionProvider().load({ pollutant: "so2" }, ctx());
    expect(result.ok && result.value.empty).toBe(true);
  });

  it("returns invalid for a malformed DTO", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => envelopeResponse({ ok: true, data: { time: "x", points: [] }, meta: META })));
    const result = await createPollutionProvider().load({ pollutant: "pm2_5" }, ctx());
    expect(!result.ok && result.error.code).toBe("invalid");
  });

  it("passes an error envelope through", async () => {
    const body = { ok: false, error: { code: "upstream", detail: "Fuente caída" }, meta: META };
    vi.stubGlobal("fetch", vi.fn(async () => envelopeResponse(body, 502)));
    const result = await createPollutionProvider().load({ pollutant: "pm2_5" }, ctx());
    expect(!result.ok && result.error).toMatchObject({ code: "upstream" });
  });

  it("resolves aborted when the signal is aborted", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        controller.abort();
        init?.signal?.throwIfAborted();
        return envelopeResponse({ ok: true, data: DTO, meta: META });
      }),
    );
    const result = await createPollutionProvider().load({ pollutant: "pm2_5" }, ctx(controller.signal));
    expect(!result.ok && result.error.code).toBe("aborted");
  });
});
