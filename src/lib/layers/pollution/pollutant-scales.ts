/**
 * Single source of truth for pollutant units, band breakpoints, legends and LUT colour stops.
 * Six equal-width bands (European AQI bands); the last breakpoint is the display cap.
 */
import type { ColorStop, LegendSpec, Pollutant } from "@/types/layers";

/** Every pollutant/index offered by the layer, in drawer order. */
export const POLLUTANTS: readonly Pollutant[] = ["pm2_5", "pm10", "no2", "o3", "so2", "co", "eaqi", "usaqi"];

/** Display metadata, bands and legend of one pollutant. */
export interface PollutantScale {
  id: Pollutant;
  label: string;
  shortLabel: string;
  unit: "µg/m³" | "índice";
  /** 7 values = 6 bands; the last is the display cap. */
  breakpoints: readonly number[];
  /** Category names per band (indices only). */
  categories?: readonly string[];
  /** WHO 2021 guideline in µg/m³, when one exists. */
  guideline?: number;
  legend: LegendSpec;
  /** Step colours per category instead of a smooth gradient. */
  categorical: boolean;
}

const BANDS = 6;

/** Shared sequential ramp (light teal to deep magenta) for the six µg/m³ pollutants. */
const SEQUENTIAL_COLORS = ["#d7f9f1", "#7fe0c8", "#f6e05e", "#f6a04d", "#e8505b", "#9e2a8a", "#5c1a6b"] as const;
const EAQI_COLORS = ["#50f0e6", "#50ccaa", "#f0e641", "#ff5050", "#960032", "#7d2181"] as const;
const USAQI_COLORS = ["#00e400", "#ffff00", "#ff7e00", "#ff0000", "#8f3f97", "#7e0023"] as const;
const EAQI_CATEGORIES = ["Buena", "Razonable", "Moderada", "Mala", "Muy mala", "Extremadamente mala"] as const;
const USAQI_CATEGORIES = ["Buena", "Moderada", "Dañina para sensibles", "Dañina", "Muy dañina", "Peligrosa"] as const;

interface ScaleSpec {
  label: string;
  shortLabel: string;
  unit: PollutantScale["unit"];
  breakpoints: readonly number[];
  guideline?: number;
  colors: readonly string[];
  categories?: readonly string[];
}

const SPECS: Readonly<Record<Pollutant, ScaleSpec>> = {
  pm2_5: { label: "PM2.5", shortLabel: "PM2.5", unit: "µg/m³", breakpoints: [0, 10, 20, 25, 50, 75, 150], guideline: 15, colors: SEQUENTIAL_COLORS },
  pm10: { label: "PM10", shortLabel: "PM10", unit: "µg/m³", breakpoints: [0, 20, 40, 50, 100, 150, 300], guideline: 45, colors: SEQUENTIAL_COLORS },
  no2: { label: "NO₂", shortLabel: "NO₂", unit: "µg/m³", breakpoints: [0, 40, 90, 120, 230, 340, 500], guideline: 25, colors: SEQUENTIAL_COLORS },
  o3: { label: "O₃ superficie", shortLabel: "O₃", unit: "µg/m³", breakpoints: [0, 50, 100, 130, 240, 380, 500], guideline: 100, colors: SEQUENTIAL_COLORS },
  so2: { label: "SO₂", shortLabel: "SO₂", unit: "µg/m³", breakpoints: [0, 100, 200, 350, 500, 750, 1000], guideline: 40, colors: SEQUENTIAL_COLORS },
  co: { label: "CO", shortLabel: "CO", unit: "µg/m³", breakpoints: [0, 2000, 4000, 7000, 10000, 15000, 20000], guideline: 4000, colors: SEQUENTIAL_COLORS },
  eaqi: { label: "Índice europeo (EAQI)", shortLabel: "EAQI", unit: "índice", breakpoints: [0, 20, 40, 60, 80, 100, 150], colors: EAQI_COLORS, categories: EAQI_CATEGORIES },
  usaqi: { label: "Índice EE. UU. (US AQI)", shortLabel: "US AQI", unit: "índice", breakpoints: [0, 50, 100, 150, 200, 300, 500], colors: USAQI_COLORS, categories: USAQI_CATEGORIES },
};

function buildScale(id: Pollutant, spec: ScaleSpec): PollutantScale {
  const categorical = spec.categories !== undefined;
  const stops: ColorStop[] = spec.colors.map((color, i) => ({ at: i / BANDS, color }));
  const ticks = spec.breakpoints.map((value, i) => ({ at: i / BANDS, label: String(value) }));
  const notes: string[] = [];
  if (spec.guideline !== undefined) notes.push(`Guía OMS: ${spec.guideline} µg/m³`);
  if (spec.categories) notes.push(spec.categories.map((name, i) => `${name} (${spec.breakpoints[i]}–${spec.breakpoints[i + 1]})`).join(" · "));
  const legend: LegendSpec = {
    title: spec.label,
    unit: spec.unit,
    stops,
    ticks,
    ...(categorical ? { categorical: true } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
  return {
    id,
    label: spec.label,
    shortLabel: spec.shortLabel,
    unit: spec.unit,
    breakpoints: spec.breakpoints,
    ...(spec.categories ? { categories: spec.categories } : {}),
    ...(spec.guideline !== undefined ? { guideline: spec.guideline } : {}),
    legend,
    categorical,
  };
}

/** Scale (labels, units, bands, legend) for every pollutant. */
export const POLLUTANT_SCALES: Readonly<Record<Pollutant, PollutantScale>> = {
  pm2_5: buildScale("pm2_5", SPECS.pm2_5),
  pm10: buildScale("pm10", SPECS.pm10),
  no2: buildScale("no2", SPECS.no2),
  o3: buildScale("o3", SPECS.o3),
  so2: buildScale("so2", SPECS.so2),
  co: buildScale("co", SPECS.co),
  eaqi: buildScale("eaqi", SPECS.eaqi),
  usaqi: buildScale("usaqi", SPECS.usaqi),
};

/**
 * Maps a raw value to its 0–1 position on the pollutant's scale: piecewise linear (band `i` maps
 * to `[i/6, (i+1)/6]`), clamped at the cap. Categorical scales return the centre of the band so a
 * step LUT samples the right category. `null`/non-finite gives `NaN` (point hidden).
 */
export function normalizeValue(pollutant: Pollutant, value: number | null): number {
  if (value === null || !Number.isFinite(value)) return NaN;
  const scale = POLLUTANT_SCALES[pollutant];
  const bp = scale.breakpoints;
  if (value <= bp[0]) return scale.categorical ? 1 / (2 * BANDS) : 0;
  if (value >= bp[BANDS]) return scale.categorical ? (BANDS - 0.5) / BANDS : 1;
  let band = 0;
  while (band < BANDS - 1 && value >= bp[band + 1]) band += 1;
  if (scale.categorical) return (band + 0.5) / BANDS;
  return (band + (value - bp[band]) / (bp[band + 1] - bp[band])) / BANDS;
}
