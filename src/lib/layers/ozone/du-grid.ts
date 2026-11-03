/**
 * Dobson-unit lookup grid rebuilt from the colour-coded GIBS ozone image. Pure (no DOM): the caller
 * supplies RGBA pixels. Used by the point info card to read the total column under a clicked point.
 */
import { OZONE_COLORMAP } from "./legend-ozone";

/** Grid columns: one per degree of longitude, starting at 180°W. */
export const DU_GRID_COLS = 360;
/** Grid rows: one per degree of latitude, row 0 centred on 89.5°N. */
export const DU_GRID_ROWS = 180;

const ALPHA_MIN = 128;
const MAX_DISTANCE_SQ = 30 * 30;

type ColormapEntry = readonly [r: number, g: number, b: number, du: number];

/**
 * Builds a 360×180 grid of Dobson units (row 0 = 90°N, column 0 = 180°W). Each 1° cell centre is
 * sampled from the equirectangular image; transparent pixels or colours further than 30 RGB units
 * from every colormap entry give `NaN`.
 *
 * @param flippedY True when the image rows run bottom-up (south first).
 */
export function buildDuGrid(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  flippedY: boolean,
  colormap: readonly ColormapEntry[] = OZONE_COLORMAP,
): Float32Array {
  const grid = new Float32Array(DU_GRID_COLS * DU_GRID_ROWS).fill(Number.NaN);
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return grid;
  const cache = new Map<number, number>();
  const lookup = (r: number, g: number, b: number): number => {
    const key = (r << 16) | (g << 8) | b;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let best = Number.NaN;
    let bestDist = Infinity;
    for (const [cr, cg, cb, du] of colormap) {
      const dist = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = du;
      }
    }
    const value = bestDist > MAX_DISTANCE_SQ ? Number.NaN : best;
    cache.set(key, value);
    return value;
  };
  for (let row = 0; row < DU_GRID_ROWS; row++) {
    const v = (row + 0.5) / DU_GRID_ROWS;
    const y = Math.min(height - 1, Math.floor((flippedY ? 1 - v : v) * height));
    for (let col = 0; col < DU_GRID_COLS; col++) {
      const x = Math.min(width - 1, Math.floor(((col + 0.5) / DU_GRID_COLS) * width));
      const i = (y * width + x) * 4;
      if (rgba[i + 3] < ALPHA_MIN) continue;
      grid[row * DU_GRID_COLS + col] = lookup(rgba[i], rgba[i + 1], rgba[i + 2]);
    }
  }
  return grid;
}

/** Dobson units at a geographic point, or `NaN` when outside the grid or without data. */
export function sampleDu(grid: Float32Array, lat: number, lon: number): number {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) return Number.NaN;
  let wrapped = ((lon + 180) % 360 + 360) % 360;
  if (wrapped >= 360) wrapped = 0;
  const col = Math.min(DU_GRID_COLS - 1, Math.floor(wrapped));
  const row = Math.min(DU_GRID_ROWS - 1, Math.floor(90 - lat));
  return grid[row * DU_GRID_COLS + col] ?? Number.NaN;
}

/** Spanish classification of a total ozone column. */
export function ozoneClass(du: number): { label: string; tone: "hole" | "low" | "normal" | "high" } {
  if (du < 220) return { label: "Agujero de ozono", tone: "hole" };
  if (du < 250) return { label: "Bajo", tone: "low" };
  if (du <= 350) return { label: "Normal", tone: "normal" };
  return { label: "Alto", tone: "high" };
}
