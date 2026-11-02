/**
 * 256×1 colour lookup textures built from the same `ColorStop[]` the legends render (single source
 * of truth). Bytes are sRGB; the texture is tagged sRGB so shaders sample linear and
 * `colorspace_fragment` re-encodes, giving exactly the legend colours on screen.
 */
import { DataTexture, LinearFilter, NearestFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from "three";
import type { ColorStop } from "@/types/layers";

export const LUT_SIZE = 256;

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [255, 0, 255];
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Fills `out` (RGBA × 256) from sorted stops; `categorical` holds each stop's colour until the next one. */
export function fillLut(stops: readonly ColorStop[], categorical: boolean, out: Uint8Array): Uint8Array {
  const sorted = [...stops].sort((a, b) => a.at - b.at);
  const rgb = sorted.map((s) => parseHex(s.color));
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    let k = 0;
    while (k < sorted.length - 1 && sorted[k + 1].at <= t) k++;
    const a = rgb[k] ?? [255, 0, 255];
    let r = a[0];
    let g = a[1];
    let b = a[2];
    if (!categorical && k < sorted.length - 1 && t > sorted[k].at) {
      const next = rgb[k + 1];
      const span = sorted[k + 1].at - sorted[k].at;
      const f = span > 0 ? (t - sorted[k].at) / span : 0;
      r = a[0] + (next[0] - a[0]) * f;
      g = a[1] + (next[1] - a[1]) * f;
      b = a[2] + (next[2] - a[2]) * f;
    }
    out[i * 4] = Math.round(r);
    out[i * 4 + 1] = Math.round(g);
    out[i * 4 + 2] = Math.round(b);
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** New LUT texture (caller owns and disposes it). */
export function buildLutTexture(stops: readonly ColorStop[], categorical = false): DataTexture {
  const texture = new DataTexture(fillLut(stops, categorical, new Uint8Array(LUT_SIZE * 4)), LUT_SIZE, 1, RGBAFormat, UnsignedByteType);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = categorical ? NearestFilter : LinearFilter;
  texture.minFilter = categorical ? NearestFilter : LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Rewrites an existing LUT in place (no reallocation) when the scale changes. */
export function updateLutTexture(texture: DataTexture, stops: readonly ColorStop[], categorical: boolean): void {
  const data = texture.image.data;
  if (!(data instanceof Uint8Array) || data.length !== LUT_SIZE * 4) return;
  fillLut(stops, categorical, data);
  texture.magFilter = categorical ? NearestFilter : LinearFilter;
  texture.minFilter = categorical ? NearestFilter : LinearFilter;
  texture.needsUpdate = true;
}
