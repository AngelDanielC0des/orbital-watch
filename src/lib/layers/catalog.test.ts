import { describe, it, expect } from "vitest";
import { ATTRIBUTION, ATTRIBUTION_FOOTER_SHORT } from "./attribution";
import {
  ENVIRONMENTAL_LAYER_IDS,
  LAYER_CATALOG,
  ORBIT_LAYER_IDS,
  getEnvironmentalMetadata,
  isEnvironmentalLayerId,
} from "./catalog";

describe("LAYER_CATALOG", () => {
  it("every key matches its id and covers all ids", () => {
    for (const [key, meta] of Object.entries(LAYER_CATALOG)) {
      expect(meta.id).toBe(key);
    }
    expect(Object.keys(LAYER_CATALOG).sort()).toEqual(
      [...ORBIT_LAYER_IDS, ...ENVIRONMENTAL_LAYER_IDS].sort(),
    );
  });

  it("environmental entries have sane defaults", () => {
    for (const id of ENVIRONMENTAL_LAYER_IDS) {
      const meta = getEnvironmentalMetadata(id);
      expect(meta.group).toBe("environment");
      expect(meta.defaultVisible).toBe(false);
      expect(meta.defaultOpacity).toBeGreaterThan(0);
      expect(meta.defaultOpacity).toBeLessThanOrEqual(1);
      expect(meta.refreshIntervalMs).toBeGreaterThan(0);
      expect(meta.controls).toContain("opacity");
    }
  });

  it("attribution texts are non-empty", () => {
    expect(ATTRIBUTION_FOOTER_SHORT.length).toBeGreaterThan(0);
    for (const a of Object.values(ATTRIBUTION)) {
      expect(a.short.length).toBeGreaterThan(0);
      expect(a.full.length).toBeGreaterThan(0);
      expect(a.licence.length).toBeGreaterThan(0);
    }
  });

  it("isEnvironmentalLayerId narrows correctly", () => {
    expect(isEnvironmentalLayerId("ozone")).toBe(true);
    expect(isEnvironmentalLayerId("fires")).toBe(true);
    expect(isEnvironmentalLayerId("satellites")).toBe(false);
    expect(isEnvironmentalLayerId("")).toBe(false);
  });
});
