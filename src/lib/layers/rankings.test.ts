import { describe, expect, it } from "vitest";
import type { FiresDTO, HeatmapPayload, PollutionDTO, PollutionPointDTO } from "@/types/layers";
import { fireSummary, topFireRegions, worstCities } from "./rankings";

function point(id: string, pm2_5: number | null): PollutionPointDTO {
  return { id, name: id, lat: 1, lon: 2, pm2_5, pm10: null, no2: null, o3: null, so2: null, co: null, eaqi: null, usaqi: null };
}

describe("worstCities", () => {
  it("excludes grid points and nulls, sorts descending and limits", () => {
    const dto: PollutionDTO = {
      time: "2026-11-02T12:00Z",
      points: [point("a", 10), point("grid-1", 500), point("b", 80), point("c", null), point("d", 30)],
    };
    const r = worstCities(dto, "pm2_5", 2);
    expect(r.map((x) => x.id)).toEqual(["b", "d"]);
    expect(r[0].index).toBe(2);
    expect(r[0].category?.band).toBe(5);
  });
});

describe("topFireRegions", () => {
  it("groups by country, skips unknown and reports the strongest hotspot", async () => {
    const hotspots = new Float32Array([
      10, 10, 90, 1,
      11, 11, 50, 1,
      -5, -5, 40, 1,
      50, 50, 30, 1,
      12, 12, 20, 1,
    ]);
    const payload: HeatmapPayload = {
      kind: "heatmap",
      cols: 1,
      rows: 1,
      density: new Uint8Array(1),
      intensity: new Uint8Array(1),
      hotspots,
      hotspotCount: 5,
      hotspotStride: 4,
      date: "2026-11-02",
    };
    const geocode = async (lat: number): Promise<string | null> => (lat > 40 ? null : lat > 0 ? "Brasil" : "Chile");
    const r = await topFireRegions(payload, 5, geocode);
    expect(r.map((x) => x.name)).toEqual(["Brasil", "Chile"]);
    expect(r[0]).toMatchObject({ count: 3, maxFrp: 90, index: 0 });
  });
});

describe("fireSummary", () => {
  it("labels the window", () => {
    const dto: FiresDTO = {
      window: "24h",
      generatedAt: "2026-11-02T12:00:00Z",
      acqRange: null,
      sources: ["NOAA-20"],
      grid: { cols: 1, rows: 1, cells: [] },
      hotspots: [],
      total: 12,
    };
    expect(fireSummary(dto)).toEqual({ total: 12, sources: ["NOAA-20"], windowLabel: "últimas 24 h" });
  });
});
