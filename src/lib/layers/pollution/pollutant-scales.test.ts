import { describe, expect, it } from "vitest";
import { POLLUTANTS, POLLUTANT_SCALES, normalizeValue } from "./pollutant-scales";

describe("pollutant scales", () => {
  it("has labels and units", () => {
    expect(POLLUTANT_SCALES.o3.label).toContain("superficie");
    expect(POLLUTANT_SCALES.no2.label).toBe("NO₂");
    expect(POLLUTANT_SCALES.eaqi.shortLabel).toBe("EAQI");
    expect(POLLUTANT_SCALES.usaqi.shortLabel).toBe("US AQI");
    for (const p of POLLUTANTS) {
      const unit: string = POLLUTANT_SCALES[p].unit;
      expect(unit).not.toBe("DU");
      expect(unit).toBe(p === "eaqi" || p === "usaqi" ? "índice" : "µg/m³");
      expect(POLLUTANT_SCALES[p].legend.unit).toBe(unit);
      expect(POLLUTANT_SCALES[p].breakpoints).toHaveLength(7);
    }
  });

  it("every legend has at least 6 stops sorted by `at` and starts at 0", () => {
    for (const p of POLLUTANTS) {
      const { stops } = POLLUTANT_SCALES[p].legend;
      expect(stops.length).toBeGreaterThanOrEqual(6);
      expect(stops[0].at).toBe(0);
      for (let i = 1; i < stops.length; i += 1) expect(stops[i].at).toBeGreaterThan(stops[i - 1].at);
    }
  });

  it("adds the WHO guideline note", () => {
    expect(POLLUTANT_SCALES.pm2_5.legend.notes).toContain("Guía OMS: 15 µg/m³");
    expect(POLLUTANT_SCALES.eaqi.legend.notes?.some((n) => n.includes("OMS"))).toBe(false);
  });

  it("flags categorical scales", () => {
    expect(POLLUTANT_SCALES.eaqi.legend.categorical).toBe(true);
    expect(POLLUTANT_SCALES.usaqi.categories).toHaveLength(6);
    expect(POLLUTANT_SCALES.pm10.legend.categorical).toBeUndefined();
  });
});

describe("normalizeValue", () => {
  it("maps breakpoints to band edges", () => {
    for (const p of ["pm2_5", "pm10", "no2", "o3", "so2", "co"] as const) {
      const bp = POLLUTANT_SCALES[p].breakpoints;
      bp.forEach((value, i) => expect(normalizeValue(p, value)).toBeCloseTo(i / 6, 6));
    }
  });

  it("interpolates inside a band", () => {
    expect(normalizeValue("pm2_5", 5)).toBeCloseTo(0.5 / 6, 6);
    expect(normalizeValue("pm2_5", 22.5)).toBeCloseTo(2.5 / 6, 6);
  });

  it("returns NaN for null and non-finite", () => {
    expect(normalizeValue("pm2_5", null)).toBeNaN();
    expect(normalizeValue("o3", Number.NaN)).toBeNaN();
    expect(normalizeValue("o3", Number.POSITIVE_INFINITY)).toBeNaN();
  });

  it("clamps above the cap and below zero", () => {
    expect(normalizeValue("pm2_5", 9999)).toBe(1);
    expect(normalizeValue("co", 1e6)).toBe(1);
    expect(normalizeValue("pm10", -5)).toBe(0);
  });

  it("returns band centres for categorical scales", () => {
    expect(normalizeValue("eaqi", 10)).toBeCloseTo(1 / 12, 6);
    expect(normalizeValue("eaqi", 20)).toBeCloseTo(3 / 12, 6);
    expect(normalizeValue("eaqi", 70)).toBeCloseTo(7 / 12, 6);
    expect(normalizeValue("usaqi", 250)).toBeCloseTo(9 / 12, 6);
    expect(normalizeValue("usaqi", 900)).toBeCloseTo(11 / 12, 6);
    expect(normalizeValue("usaqi", 0)).toBeCloseTo(1 / 12, 6);
  });
});
