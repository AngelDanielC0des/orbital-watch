import { describe, expect, it } from "vitest";
import type { FiresDTO, HeatmapPayload, PollutionDTO } from "@/types/layers";
import { airCategory, fireIntensity, resolveFire, resolveFireCell, resolveOzone, resolvePollution } from "./pick-resolver";

const POLLUTION: PollutionDTO = {
  time: "2026-11-02T12:00Z",
  points: [
    { id: "city-madrid", name: "Madrid", lat: 40.42, lon: -3.7, pm2_5: 30, pm10: 41, no2: 50, o3: 60, so2: 3, co: 300, eaqi: 45, usaqi: 89 },
    { id: "grid-15-20", name: "Rejilla 15°N 20°E", lat: 15, lon: 20, pm2_5: null, pm10: null, no2: null, o3: null, so2: null, co: null, eaqi: null, usaqi: null },
  ],
};

describe("pick-resolver", () => {
  it("bands pollutants with plain names and the WHO ratio", () => {
    expect(airCategory("pm2_5", 5)?.label).toBe("Buena");
    expect(airCategory("pm2_5", 30)?.label).toBe("Mala");
    expect(airCategory("pm2_5", 999)?.label).toBe("Extremadamente mala");
    expect(airCategory("pm2_5", null)).toBeNull();
    const info = resolvePollution(POLLUTION, 0, "pm2_5", false);
    expect(info).toMatchObject({ name: "Madrid", isGrid: false, active: { value: 30, category: { label: "Mala" } } });
    expect(info?.active.guidelineRatio).toBeCloseTo(2);
    expect(info?.readings).toHaveLength(8);
  });

  it("uses index category names and marks grid nodes", () => {
    expect(airCategory("eaqi", 45)?.label).toBe("Moderada");
    const grid = resolvePollution(POLLUTION, 1, "no2", true);
    expect(grid).toMatchObject({ isGrid: true, isFallback: true, active: { value: null, category: null } });
    expect(resolvePollution(POLLUTION, 9, "no2", false)).toBeNull();
  });

  it("classifies fire power", () => {
    expect(fireIntensity(5).label).toBe("Débil");
    expect(fireIntensity(50).tone).toBe("moderate");
    expect(fireIntensity(150).tone).toBe("high");
    expect(fireIntensity(800).tone).toBe("extreme");
  });

  it("decodes rich and legacy hotspots", () => {
    const dto = { generatedAt: "2026-11-02T12:00:00.000Z" } as FiresDTO;
    const rich = {
      hotspots: new Float32Array([-10, 130, 312.5, 1, 2, 90, 21]),
      hotspotCount: 1,
      hotspotStride: 7,
    } as HeatmapPayload;
    expect(resolveFire(dto, rich, 0, false)).toMatchObject({
      frp: 312.5,
      intensity: { tone: "high" },
      day: true,
      confidence: "Alta",
      satellite: "NOAA-21",
      acquiredAt: "2026-11-02T10:30:00.000Z",
    });
    const legacy = { hotspots: new Float32Array([1, 2, 3, 0]), hotspotCount: 1 } as HeatmapPayload;
    expect(resolveFire(dto, legacy, 0, false)).toMatchObject({ day: false, confidence: null, acquiredAt: null, satellite: null });
    expect(resolveFire(dto, legacy, 1, false)).toBeNull();
  });

  it("inverts the log-scaled cell values", () => {
    const n = 10;
    const d = Math.round((255 * Math.log10(1 + n)) / Math.log10(101));
    const payload = { density: new Uint8Array([0, d, 255]), intensity: new Uint8Array([0, 0, 255]) } as HeatmapPayload;
    expect(resolveFireCell(payload, 0, 0, 0, false)).toBeNull();
    expect(resolveFireCell(payload, 1, 0, 0, false)?.detections).toBe(10);
    expect(resolveFireCell(payload, 2, 0, 0, false)).toMatchObject({ saturated: true });
  });

  it("samples ozone when a grid exists", () => {
    expect(resolveOzone(0, 0, null)).toMatchObject({ du: null, label: null });
    const grid = new Float32Array(360 * 180).fill(285);
    expect(resolveOzone(10, 10, { grid, date: "2026-10-29", product: "OMI_TOMS" })).toMatchObject({ du: 285, tone: "normal" });
  });
});
