import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeatmapPayload } from "@/types/layers";
import { closeImage, configKey } from "./payload";

const heatmap: HeatmapPayload = {
  kind: "heatmap",
  cols: 0,
  rows: 0,
  density: new Uint8Array(0),
  intensity: new Uint8Array(0),
  hotspots: new Float32Array(0),
  hotspotCount: 0,
  date: "2026-10-30",
};

/** Stand-in for an HTMLImageElement (no DOM in node); only identity matters to `closeImage`. */
function fakeImage(close: () => void): HTMLImageElement {
  return Object.assign(Object.create(null) as HTMLImageElement, { close });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("closeImage", () => {
  it("is a no-op for non-raster payloads", () => {
    expect(() => closeImage(heatmap)).not.toThrow();
  });

  it("is a no-op when ImageBitmap is undefined (node)", () => {
    expect(typeof ImageBitmap).toBe("undefined");
    const close = vi.fn();
    closeImage({ kind: "raster", image: fakeImage(close), flipped: true, date: "d" });
    expect(close).not.toHaveBeenCalled();
  });

  it("closes an ImageBitmap of a raster payload", () => {
    vi.stubGlobal("ImageBitmap", class {
      close = vi.fn();
    });
    const image = new ImageBitmap();
    closeImage({ kind: "raster", image, flipped: true, date: "d" });
    expect(image.close).toHaveBeenCalledTimes(1);
  });

  it("does not close non-ImageBitmap images when ImageBitmap exists", () => {
    vi.stubGlobal("ImageBitmap", class {
      close = vi.fn();
    });
    const close = vi.fn();
    closeImage({ kind: "raster", image: fakeImage(close), flipped: true, date: "d" });
    expect(close).not.toHaveBeenCalled();
  });
});

describe("configKey", () => {
  it("is stable under key order", () => {
    expect(configKey({ b: 2, a: 1 })).toBe("a=1&b=2");
    expect(configKey({ a: 1, b: 2 })).toBe(configKey({ b: 2, a: 1 }));
  });

  it("skips undefined values but keeps null/false/0", () => {
    expect(configKey({ a: undefined, b: null, c: false, d: 0 })).toBe("b=null&c=false&d=0");
  });

  it("returns an empty string for an empty config", () => {
    expect(configKey({})).toBe("");
  });
});
