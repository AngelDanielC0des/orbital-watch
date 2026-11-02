import { LinearFilter, NearestFilter, SRGBColorSpace } from "three";
import { describe, expect, it } from "vitest";
import { buildLutTexture, fillLut, LUT_SIZE, updateLutTexture } from "./lut";

const px = (lut: Uint8Array, i: number): number[] => Array.from(lut.slice(i * 4, i * 4 + 4));
const newLut = (): Uint8Array => new Uint8Array(LUT_SIZE * 4);

const bw = [
  { at: 0, color: "#000000" },
  { at: 1, color: "#ffffff" },
];

describe("fillLut", () => {
  it("interpolates smoothly between two stops", () => {
    const lut = fillLut(bw, false, newLut());
    expect(px(lut, 0)).toEqual([0, 0, 0, 255]);
    expect(px(lut, 255)).toEqual([255, 255, 255, 255]);
    expect(px(lut, 128)[0]).toBeGreaterThanOrEqual(127);
    expect(px(lut, 128)[0]).toBeLessThanOrEqual(129);
  });

  it("returns the same array it was given", () => {
    const out = newLut();
    expect(fillLut(bw, false, out)).toBe(out);
  });

  it("holds colours when categorical", () => {
    const stops = [
      { at: 0, color: "#ff0000" },
      { at: 0.5, color: "#00ff00" },
      { at: 1, color: "#0000ff" },
    ];
    const lut = fillLut(stops, true, newLut());
    expect(px(lut, 100)).toEqual([255, 0, 0, 255]);
    expect(px(lut, 200)).toEqual([0, 255, 0, 255]);
    expect(px(lut, 255)).toEqual([0, 0, 255, 255]);
  });

  it("sorts unsorted stops", () => {
    const lut = fillLut([...bw].reverse(), false, newLut());
    expect(px(lut, 0)).toEqual([0, 0, 0, 255]);
    expect(px(lut, 255)).toEqual([255, 255, 255, 255]);
  });

  it("falls back to magenta for invalid hex", () => {
    const lut = fillLut([{ at: 0, color: "nope" }], false, newLut());
    expect(px(lut, 0)).toEqual([255, 0, 255, 255]);
    expect(px(lut, 255)).toEqual([255, 0, 255, 255]);
  });

  it("accepts hex without a leading #", () => {
    expect(px(fillLut([{ at: 0, color: "336699" }], false, newLut()), 10)).toEqual([0x33, 0x66, 0x99, 255]);
  });

  it("keeps alpha at 255 everywhere", () => {
    const lut = fillLut(bw, false, newLut());
    for (let i = 0; i < LUT_SIZE; i++) expect(lut[i * 4 + 3]).toBe(255);
  });
});

describe("buildLutTexture", () => {
  it("builds a 256x1 sRGB texture with linear filters when smooth", () => {
    const tex = buildLutTexture(bw);
    expect(tex.image.width).toBe(LUT_SIZE);
    expect(tex.image.height).toBe(1);
    expect(tex.colorSpace).toBe(SRGBColorSpace);
    expect(tex.magFilter).toBe(LinearFilter);
    expect(tex.minFilter).toBe(LinearFilter);
    expect(tex.generateMipmaps).toBe(false);
    tex.dispose();
  });

  it("uses nearest filters when categorical", () => {
    const tex = buildLutTexture(bw, true);
    expect(tex.magFilter).toBe(NearestFilter);
    expect(tex.minFilter).toBe(NearestFilter);
    tex.dispose();
  });
});

describe("updateLutTexture", () => {
  it("rewrites the data in place and switches filters", () => {
    const tex = buildLutTexture(bw);
    const data = tex.image.data;
    updateLutTexture(tex, [{ at: 0, color: "#ff0000" }], true);
    expect(tex.image.data).toBe(data);
    expect(Array.from(tex.image.data?.slice(0, 4) ?? [])).toEqual([255, 0, 0, 255]);
    expect(tex.magFilter).toBe(NearestFilter);
    tex.dispose();
  });
});
