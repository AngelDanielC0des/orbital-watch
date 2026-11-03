import { describe, expect, it } from "vitest";
import { DU_GRID_COLS, buildDuGrid, ozoneClass, sampleDu } from "./du-grid";

const MAP = [
  [255, 0, 0, 200],
  [0, 255, 0, 300],
  [0, 0, 255, 400],
] as const;

/** 4×2 image: top row red, green, blue, transparent; bottom row all green. */
function image(): Uint8ClampedArray {
  const px = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 250, 255],
    [255, 0, 0, 0],
    [0, 255, 0, 255],
    [0, 255, 0, 255],
    [0, 255, 0, 255],
    [128, 128, 128, 255],
  ];
  return new Uint8ClampedArray(px.flat());
}

describe("buildDuGrid / sampleDu", () => {
  it("maps columns and rows of an upright image", () => {
    const grid = buildDuGrid(image(), 4, 2, false, MAP);
    expect(grid).toHaveLength(DU_GRID_COLS * 180);
    expect(sampleDu(grid, 45, -135)).toBe(200);
    expect(sampleDu(grid, 45, -45)).toBe(300);
    expect(sampleDu(grid, 45, 45)).toBe(400);
    expect(Number.isNaN(sampleDu(grid, 45, 135))).toBe(true);
    expect(sampleDu(grid, -45, -135)).toBe(300);
    expect(Number.isNaN(sampleDu(grid, -45, 135))).toBe(true);
  });

  it("reads rows bottom-up when flipped", () => {
    const grid = buildDuGrid(image(), 4, 2, true, MAP);
    expect(sampleDu(grid, -45, -135)).toBe(200);
    expect(sampleDu(grid, 45, -135)).toBe(300);
  });

  it("rejects out-of-range input", () => {
    const grid = buildDuGrid(image(), 4, 2, false, MAP);
    expect(Number.isNaN(sampleDu(grid, 91, 0))).toBe(true);
    expect(Number.isNaN(sampleDu(grid, Number.NaN, 0))).toBe(true);
    expect(sampleDu(grid, 45, 225)).toBe(200);
  });
});

describe("ozoneClass", () => {
  it("classifies by column", () => {
    expect(ozoneClass(150).tone).toBe("hole");
    expect(ozoneClass(220).tone).toBe("low");
    expect(ozoneClass(250).tone).toBe("normal");
    expect(ozoneClass(350).tone).toBe("normal");
    expect(ozoneClass(351)).toEqual({ label: "Alto", tone: "high" });
    expect(ozoneClass(150).label).toBe("Agujero de ozono");
  });
});
