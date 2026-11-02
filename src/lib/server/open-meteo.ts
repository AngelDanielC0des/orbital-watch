/**
 * Server-side Open-Meteo Air Quality (CAMS) client: batch URL builder, response normaliser and
 * the sequential batch fetcher behind `GET /api/orbital/pollution`. Pure and injectable; never
 * import this from client code.
 */
import type { SamplePoint } from "@/lib/layers/pollution/sample-points";
import { err, layerError, ok, toLayerError } from "@/lib/layers/result";
import { isRecord } from "@/lib/layers/validate";
import type { LayerError, PollutionDTO, PollutionPointDTO, Result } from "@/types/layers";

/** Open-Meteo air-quality endpoint (CAMS Global / Europe, no API key). */
export const OPEN_METEO_AQ = "https://air-quality-api.open-meteo.com/v1/air-quality";

/** `current=` variables requested, in the order of {@link DTO_KEYS}. */
export const CURRENT_VARS = [
  "pm2_5",
  "pm10",
  "nitrogen_dioxide",
  "ozone",
  "sulphur_dioxide",
  "carbon_monoxide",
  "european_aqi",
  "us_aqi",
] as const;

type PollutantKey = "pm2_5" | "pm10" | "no2" | "o3" | "so2" | "co" | "eaqi" | "usaqi";

/** DTO key for each entry of {@link CURRENT_VARS} (same index) with its sane value range. */
const VAR_MAP: readonly { variable: (typeof CURRENT_VARS)[number]; key: PollutantKey; max: number }[] = [
  { variable: "pm2_5", key: "pm2_5", max: 2000 },
  { variable: "pm10", key: "pm10", max: 2000 },
  { variable: "nitrogen_dioxide", key: "no2", max: 50000 },
  { variable: "ozone", key: "o3", max: 50000 },
  { variable: "sulphur_dioxide", key: "so2", max: 50000 },
  { variable: "carbon_monoxide", key: "co", max: 50000 },
  { variable: "european_aqi", key: "eaqi", max: 500 },
  { variable: "us_aqi", key: "usaqi", max: 1000 },
];

const FETCH_TIMEOUT_MS = 15000;
const REVALIDATE_S = 3600;
const BATCH_SIZE = 150;

let upstreamCalls = 0;

/** Number of upstream Open-Meteo requests made by this process (dev log for the calls/hour budget). */
export function upstreamCallCount(): number {
  return upstreamCalls;
}

function coord(value: number): string {
  return value.toFixed(2);
}

/** One request URL per `batchSize` points (coordinates with 2 decimals, GMT time). */
export function buildBatchUrls(points: readonly SamplePoint[], batchSize = BATCH_SIZE): string[] {
  const urls: string[] = [];
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    const lat = batch.map((p) => coord(p.lat)).join(",");
    const lon = batch.map((p) => coord(p.lon)).join(",");
    urls.push(`${OPEN_METEO_AQ}?latitude=${lat}&longitude=${lon}&current=${CURRENT_VARS.join(",")}&timezone=GMT&domains=auto`);
  }
  return urls;
}

function items(json: unknown): unknown[] | null {
  if (Array.isArray(json)) return json;
  if (isRecord(json)) return [json];
  return null;
}

function cleanValue(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= 0 && value <= max ? value : null;
}

/**
 * Maps an Open-Meteo response (object for one coordinate, array for several) to DTO points in
 * input order. Returns `null` when the shape or the item count does not match `points`.
 */
export function normalizeBatch(json: unknown, points: readonly SamplePoint[]): PollutionPointDTO[] | null {
  const list = items(json);
  if (!list || list.length !== points.length) return null;
  const out: PollutionPointDTO[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const item = list[i];
    const point = points[i];
    if (!isRecord(item) || !isRecord(item.current)) return null;
    const current = item.current;
    const dto: PollutionPointDTO = {
      id: point.id,
      name: point.name,
      lat: point.lat,
      lon: point.lon,
      pm2_5: null,
      pm10: null,
      no2: null,
      o3: null,
      so2: null,
      co: null,
      eaqi: null,
      usaqi: null,
    };
    for (const { variable, key, max } of VAR_MAP) dto[key] = cleanValue(current[variable], max);
    out.push(dto);
  }
  return out;
}

/** Model hour of the first item as ISO UTC (`2026-11-02T12:00Z`), or `null` when absent/invalid. */
export function modelTime(json: unknown): string | null {
  const list = items(json);
  const first = list?.[0];
  if (!isRecord(first) || !isRecord(first.current)) return null;
  const time = first.current.time;
  if (typeof time !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)) return null;
  return Number.isFinite(Date.parse(`${time}Z`)) ? `${time}Z` : null;
}

type NextFetchInit = RequestInit & { next?: { revalidate?: number } };

/**
 * Fetches every batch sequentially and merges them. Any failing batch fails the whole call (no
 * partial results).
 */
export async function fetchPollution(
  points: readonly SamplePoint[],
  fetchImpl: typeof fetch = fetch,
): Promise<Result<PollutionDTO, LayerError>> {
  const urls = buildBatchUrls(points, BATCH_SIZE);
  const merged: PollutionPointDTO[] = [];
  let time: string | null = null;
  for (let b = 0; b < urls.length; b += 1) {
    const batch = points.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    let json: unknown;
    try {
      upstreamCalls += 1;
      const init: NextFetchInit = { next: { revalidate: REVALIDATE_S }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
      const response = await fetchImpl(urls[b], init);
      if (!response.ok) return err(layerError("upstream", `Open-Meteo HTTP ${response.status}`));
      json = await response.json();
    } catch (cause) {
      return err(toLayerError(cause));
    }
    const normalized = normalizeBatch(json, batch);
    if (!normalized) return err(layerError("invalid", `Open-Meteo batch ${b + 1} has an unexpected shape`));
    time ??= modelTime(json);
    merged.push(...normalized);
  }
  if (!time) return err(layerError("invalid", "Open-Meteo response has no model time"));
  return ok({ time, points: merged });
}
