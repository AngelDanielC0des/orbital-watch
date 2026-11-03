/**
 * ADR-16: turns an engine `LayerPick` into the plain-language model of the point card / tooltip.
 * Pure given the latest data snapshots (`getLatest*` from the services); no DOM, no React.
 */
import { getLatestFires } from "@/lib/layers/fires/fires.service";
import { getOzoneDuGrid } from "@/lib/layers/ozone/ozone.service";
import { ozoneClass, sampleDu } from "@/lib/layers/ozone/du-grid";
import { getLatestPollution, isGridPoint } from "@/lib/layers/pollution/pollution.service";
import { POLLUTANTS, POLLUTANT_SCALES } from "@/lib/layers/pollution/pollutant-scales";
import type { FiresDTO, HeatmapPayload, LayerPick, Pollutant, PollutionDTO } from "@/types/layers";

/** EAQI band names, used for every µg/m³ pollutant (their breakpoints are the European AQI bands). */
export const AIR_BAND_NAMES = ["Buena", "Razonable", "Moderada", "Mala", "Muy mala", "Extremadamente mala"] as const;

export interface AirCategory {
  /** 0 (best) … 5 (worst). */
  band: number;
  label: string;
  color: string;
}

export interface AirReading {
  pollutant: Pollutant;
  label: string;
  unit: string;
  value: number | null;
  category: AirCategory | null;
  /** value / WHO guideline (µg/m³ pollutants only). */
  guidelineRatio: number | null;
}

export interface PollutionInfo {
  kind: "pollution";
  id: string;
  name: string;
  isGrid: boolean;
  lat: number;
  lon: number;
  /** Model hour, ISO UTC. */
  time: string;
  active: AirReading;
  readings: AirReading[];
  isFallback: boolean;
}

export type FireIntensity = { label: string; tone: "low" | "moderate" | "high" | "extreme" };

export interface FireInfo {
  kind: "fire";
  lat: number;
  lon: number;
  frp: number;
  intensity: FireIntensity;
  day: boolean | null;
  confidence: string | null;
  /** ISO UTC acquisition time, null for legacy data. */
  acquiredAt: string | null;
  satellite: string | null;
  isFallback: boolean;
}

export interface FireCellInfo {
  kind: "fireCell";
  lat: number;
  lon: number;
  /** Approximate detections in the 0.5° cell (decoded from the log-scaled grid); `saturated` = 100 or more. */
  detections: number;
  saturated: boolean;
  maxFrp: number;
  isFallback: boolean;
}

export interface OzoneInfo {
  kind: "ozone";
  lat: number;
  lon: number;
  du: number | null;
  label: string | null;
  tone: "hole" | "low" | "normal" | "high" | null;
  date: string | null;
  product: string | null;
}

export type PointInfo = PollutionInfo | FireInfo | FireCellInfo | OzoneInfo;

/** Category of a value on a pollutant's banded scale (indices use their own category names). */
export function airCategory(pollutant: Pollutant, value: number | null): AirCategory | null {
  if (value === null || !Number.isFinite(value)) return null;
  const scale = POLLUTANT_SCALES[pollutant];
  const bp = scale.breakpoints;
  let band = 0;
  while (band < bp.length - 2 && value >= bp[band + 1]) band++;
  const names = scale.categories ?? AIR_BAND_NAMES;
  const stops = scale.legend.stops;
  // Categorical legends have one stop per band; sequential ones have stops at band starts too.
  const stop = stops[Math.min(band, stops.length - 1)];
  return { band, label: names[Math.min(band, names.length - 1)] ?? "", color: stop?.color ?? "#9fb0cc" };
}

function reading(pollutant: Pollutant, value: number | null): AirReading {
  const scale = POLLUTANT_SCALES[pollutant];
  const finite = value !== null && Number.isFinite(value) ? value : null;
  return {
    pollutant,
    label: scale.label,
    unit: scale.unit,
    value: finite,
    category: airCategory(pollutant, finite),
    guidelineRatio: finite !== null && scale.guideline ? finite / scale.guideline : null,
  };
}

export function resolvePollution(dto: PollutionDTO, index: number, pollutant: Pollutant, isFallback: boolean): PollutionInfo | null {
  const point = dto.points[index];
  if (!point) return null;
  const readings = POLLUTANTS.map((p) => reading(p, point[p]));
  return {
    kind: "pollution",
    id: point.id,
    name: point.name,
    isGrid: isGridPoint(point.id),
    lat: point.lat,
    lon: point.lon,
    time: dto.time,
    active: reading(pollutant, point[pollutant]),
    readings,
    isFallback,
  };
}

/** Plain-language class of fire radiative power (MW). */
export function fireIntensity(frp: number): FireIntensity {
  if (frp >= 500) return { label: "Muy intenso", tone: "extreme" };
  if (frp >= 100) return { label: "Intenso", tone: "high" };
  if (frp >= 10) return { label: "Moderado", tone: "moderate" };
  return { label: "Débil", tone: "low" };
}

const CONFIDENCE = ["Baja", "Nominal", "Alta"] as const;

export function resolveFire(dto: FiresDTO, payload: HeatmapPayload, index: number, isFallback: boolean): FireInfo | null {
  const stride = payload.hotspotStride && payload.hotspotStride >= 4 ? payload.hotspotStride : 4;
  if (index < 0 || index >= payload.hotspotCount) return null;
  const h = payload.hotspots;
  const o = index * stride;
  const frp = h[o + 2];
  const rich = stride >= 7;
  const conf = rich ? h[o + 4] : -1;
  const minutes = rich ? h[o + 5] : NaN;
  const sat = rich ? h[o + 6] : 0;
  const generated = Date.parse(dto.generatedAt);
  return {
    kind: "fire",
    lat: h[o],
    lon: h[o + 1],
    frp,
    intensity: fireIntensity(frp),
    day: h[o + 3] === 1 ? true : h[o + 3] === 0 ? false : null,
    confidence: conf >= 0 && conf <= 2 ? CONFIDENCE[conf] : null,
    acquiredAt: Number.isFinite(minutes) && Number.isFinite(generated) ? new Date(generated - minutes * 60_000).toISOString() : null,
    satellite: sat === 20 ? "NOAA-20" : sat === 21 ? "NOAA-21" : null,
    isFallback,
  };
}

/** Inverse of the server's log scaling: density = 255·log10(1+n)/log10(101); intensity = 255·log10(1+frp)/log10(1001). */
export function resolveFireCell(payload: HeatmapPayload, index: number, lat: number, lon: number, isFallback: boolean): FireCellInfo | null {
  const d = payload.density[index];
  if (!(d > 0)) return null;
  const detections = Math.max(1, Math.round(10 ** ((d * Math.log10(101)) / 255) - 1));
  const maxFrp = Math.max(0, 10 ** ((payload.intensity[index] * Math.log10(1001)) / 255) - 1);
  return { kind: "fireCell", lat, lon, detections, saturated: d >= 255, maxFrp, isFallback };
}

export function resolveOzone(lat: number, lon: number, grid: { grid: Float32Array; date: string; product: string } | null): OzoneInfo {
  const du = grid ? sampleDu(grid.grid, lat, lon) : NaN;
  const cls = Number.isFinite(du) ? ozoneClass(du) : null;
  return {
    kind: "ozone",
    lat,
    lon,
    du: Number.isFinite(du) ? Math.round(du) : null,
    label: cls?.label ?? null,
    tone: cls?.tone ?? null,
    date: grid?.date ?? null,
    product: grid?.product ?? null,
  };
}

/** Resolves a pick against the data currently on the globe; null when the data changed underneath. */
export function resolvePick(pick: LayerPick): PointInfo | null {
  if (pick.layerId === "pollution" && pick.kind === "point") {
    const latest = getLatestPollution();
    return latest ? resolvePollution(latest.dto, pick.index, latest.pollutant, latest.isFallback) : null;
  }
  if (pick.layerId === "fires") {
    const latest = getLatestFires();
    if (!latest) return null;
    return pick.kind === "point"
      ? resolveFire(latest.dto, latest.payload, pick.index, latest.isFallback)
      : resolveFireCell(latest.payload, pick.index, pick.lat, pick.lon, latest.isFallback);
  }
  if (pick.layerId === "ozone") return resolveOzone(pick.lat, pick.lon, getOzoneDuGrid());
  return null;
}
