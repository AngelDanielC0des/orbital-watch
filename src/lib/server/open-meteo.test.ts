import { describe, expect, it, vi } from "vitest";
import { SAMPLE_POINTS, type SamplePoint } from "@/lib/layers/pollution/sample-points";
import { buildBatchUrls, fetchPollution, modelTime, normalizeBatch, upstreamCallCount } from "./open-meteo";

const TWO: SamplePoint[] = [
  { id: "city-a", name: "A", country: "X", lat: 40.42, lon: -3.7, kind: "city" },
  { id: "city-b", name: "B", country: "X", lat: 35.68, lon: 139.69, kind: "city" },
];

function item(current: Record<string, unknown>): Record<string, unknown> {
  return {
    latitude: 40.4,
    longitude: -3.7,
    current_units: { pm2_5: "μg/m³" },
    current: { time: "2026-11-02T12:00", interval: 3600, ...current },
  };
}

const FULL = { pm2_5: 12.3, pm10: 20.1, nitrogen_dioxide: 30, ozone: 80, sulphur_dioxide: 5, carbon_monoxide: 250, european_aqi: 35, us_aqi: 52 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("sample points", () => {
  it("stays within 3 batches and has unique ids", () => {
    expect(SAMPLE_POINTS.length).toBeLessThanOrEqual(450);
    expect(new Set(SAMPLE_POINTS.map((p) => p.id)).size).toBe(SAMPLE_POINTS.length);
    expect(SAMPLE_POINTS.filter((p) => p.kind === "city").length).toBeGreaterThanOrEqual(250);
  });
});

describe("normalizeBatch", () => {
  it("maps an array response in input order", () => {
    const out = normalizeBatch([item(FULL), item({ ...FULL, pm2_5: 1 })], TWO);
    expect(out).toHaveLength(2);
    expect(out?.[0]).toMatchObject({ id: "city-a", name: "A", lat: 40.42, lon: -3.7, pm2_5: 12.3, no2: 30, o3: 80, so2: 5, co: 250, eaqi: 35, usaqi: 52 });
    expect(out?.[1].id).toBe("city-b");
    expect(out?.[1].pm2_5).toBe(1);
  });

  it("accepts a single object for one coordinate", () => {
    const out = normalizeBatch(item(FULL), [TWO[0]]);
    expect(out).toHaveLength(1);
    expect(out?.[0].pm10).toBe(20.1);
  });

  it("keeps nulls", () => {
    const out = normalizeBatch([item({ ...FULL, pm2_5: null }), item({})], TWO);
    expect(out?.[0].pm2_5).toBeNull();
    expect(out?.[0].pm10).toBe(20.1);
    expect(out?.[1].usaqi).toBeNull();
  });

  it("nulls out-of-range and non-finite values", () => {
    const out = normalizeBatch([item({ ...FULL, pm2_5: 5000, ozone: -1, european_aqi: 900, us_aqi: "x" }), item(FULL)], TWO);
    expect(out?.[0].pm2_5).toBeNull();
    expect(out?.[0].o3).toBeNull();
    expect(out?.[0].eaqi).toBeNull();
    expect(out?.[0].usaqi).toBeNull();
    expect(out?.[0].pm10).toBe(20.1);
  });

  it("returns null on length mismatch or bad shape", () => {
    expect(normalizeBatch([item(FULL)], TWO)).toBeNull();
    expect(normalizeBatch("nope", TWO)).toBeNull();
    expect(normalizeBatch([{}, {}], TWO)).toBeNull();
  });
});

describe("modelTime", () => {
  it("appends Z", () => {
    expect(modelTime([item(FULL)])).toBe("2026-11-02T12:00Z");
    expect(modelTime(item(FULL))).toBe("2026-11-02T12:00Z");
  });
  it("returns null when missing", () => {
    expect(modelTime([])).toBeNull();
    expect(modelTime({ current: {} })).toBeNull();
  });
});

describe("buildBatchUrls", () => {
  it("splits into batches of 150 with short URLs", () => {
    const urls = buildBatchUrls(SAMPLE_POINTS);
    expect(urls).toHaveLength(Math.ceil(SAMPLE_POINTS.length / 150));
    expect(urls.length).toBeLessThanOrEqual(3);
    for (const url of urls) {
      expect(url.length).toBeLessThan(8000);
      expect(url).toContain("timezone=GMT");
      expect(url).toContain("domains=auto");
      expect(url).toContain("current=pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide,european_aqi,us_aqi");
    }
  });

  it("formats coordinates with 2 decimals", () => {
    const [url] = buildBatchUrls(TWO);
    expect(url).toContain("latitude=40.42,35.68&longitude=-3.70,139.69");
  });
});

describe("fetchPollution", () => {
  it("merges batches and reports the model time", async () => {
    const points = SAMPLE_POINTS.slice(0, 160);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const lat = new URL(String(input)).searchParams.get("latitude") ?? "";
      return jsonResponse(lat.split(",").map(() => item(FULL)));
    });
    const before = upstreamCallCount();
    const result = await fetchPollution(points, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(upstreamCallCount() - before).toBe(2);
    expect(result.ok && result.value.points).toHaveLength(160);
    expect(result.ok && result.value.time).toBe("2026-11-02T12:00Z");
  });

  it("fails as a whole when a batch is not ok", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: true }, 500));
    const result = await fetchPollution(TWO, fetchImpl);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("upstream");
  });

  it("fails on network errors and bad shapes", async () => {
    const down = await fetchPollution(TWO, vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(!down.ok && down.error.code).toBe("network");
    const bad = await fetchPollution(TWO, vi.fn(async () => jsonResponse([item(FULL)])));
    expect(!bad.ok && bad.error.code).toBe("invalid");
  });
});
