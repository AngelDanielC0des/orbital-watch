/**
 * Pure rankings behind the mode cards: worst cities for a pollutant and fire regions by detections.
 * Indices refer to the arrays currently pushed to the engine (`dto.points[i]`, hotspot `i` of the payload).
 */
import { airCategory, type AirCategory } from "@/lib/layers/pick-resolver";
import { isGridPoint } from "@/lib/layers/pollution/pollution.service";
import type { FiresDTO, HeatmapPayload, Pollutant, PollutionDTO } from "@/types/layers";

export interface CityRank {
  index: number;
  id: string;
  name: string;
  lat: number;
  lon: number;
  value: number;
  category: AirCategory | null;
}

export interface FireRegionRank {
  name: string;
  count: number;
  maxFrp: number;
  lat: number;
  lon: number;
  index: number;
}

export interface FireSummary {
  total: number;
  sources: string[];
  windowLabel: string;
}

/** Max hotspots geocoded per ranking (the strongest ones; the payload is sorted by FRP desc). */
export const MAX_GEOCODED_HOTSPOTS = 600;

export function worstCities(dto: PollutionDTO, pollutant: Pollutant, n = 5): CityRank[] {
  const rows: CityRank[] = [];
  dto.points.forEach((p, index) => {
    if (isGridPoint(p.id)) return;
    const value = p[pollutant];
    if (value === null || !Number.isFinite(value)) return;
    rows.push({ index, id: p.id, name: p.name, lat: p.lat, lon: p.lon, value, category: airCategory(pollutant, value) });
  });
  rows.sort((a, b) => b.value - a.value);
  return rows.slice(0, Math.max(0, n));
}

export async function topFireRegions(
  payload: HeatmapPayload,
  n = 5,
  geocode: (lat: number, lon: number) => Promise<string | null>,
): Promise<FireRegionRank[]> {
  const stride = payload.hotspotStride && payload.hotspotStride >= 4 ? payload.hotspotStride : 4;
  const count = Math.min(payload.hotspotCount, MAX_GEOCODED_HOTSPOTS);
  const h = payload.hotspots;
  const names = await Promise.all(
    Array.from({ length: count }, (_, i) => geocode(h[i * stride], h[i * stride + 1]).catch(() => null)),
  );
  const groups = new Map<string, FireRegionRank>();
  for (let i = 0; i < count; i++) {
    const name = names[i];
    if (!name) continue;
    const frp = h[i * stride + 2];
    const g = groups.get(name);
    if (!g) {
      groups.set(name, { name, count: 1, maxFrp: frp, lat: h[i * stride], lon: h[i * stride + 1], index: i });
    } else {
      g.count += 1;
      if (frp > g.maxFrp) Object.assign(g, { maxFrp: frp, lat: h[i * stride], lon: h[i * stride + 1], index: i });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.maxFrp - a.maxFrp).slice(0, Math.max(0, n));
}

const WINDOW_LABEL: Record<FiresDTO["window"], string> = {
  "24h": "últimas 24 h",
  "48h": "últimas 48 h",
  "7d": "últimos 7 días",
};

export function fireSummary(dto: FiresDTO): FireSummary {
  return { total: dto.total, sources: dto.sources, windowLabel: WINDOW_LABEL[dto.window] ?? dto.window };
}
