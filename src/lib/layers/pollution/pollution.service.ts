/**
 * Client pollution data service: fetches the sampled air-quality DTO from `/api/orbital/pollution`
 * once (cached 60 min) and rebuilds the engine `PointsPayload` for whichever pollutant is selected,
 * so switching pollutant never refetches. Never throws.
 */
import type {
  ApiMeta,
  DataProvider,
  LayerError,
  PointsPayload,
  PollutionDTO,
  PollutionLayerConfig,
  ProviderContext,
  PollutionPointDTO,
  Pollutant,
  ProviderLoad,
  Result,
} from "@/types/layers";
import { GeoCache, dedupe } from "../geo-cache.service";
import { fetchEnvelope, withFlags } from "../http";
import { err, layerError, ok, toLayerError } from "../result";
import { fetchSnapshot } from "../snapshot-client";
import { isFiniteNumber, isIsoDateTime, isNullableFiniteNumber, isRecord, isString } from "../validate";
import { POLLUTANTS, POLLUTANT_SCALES, normalizeValue } from "./pollutant-scales";

const MAX_POINTS = 600;
const TTL_MS = 60 * 60_000;
const SNAPSHOT_TTL_MS = 5 * 60_000;
const SNAPSHOT_SUFFIX = " · instantánea";

function isPollutionPointDTO(value: unknown): value is PollutionPointDTO {
  if (!isRecord(value)) return false;
  if (!isString(value.id) || !isString(value.name)) return false;
  if (!isFiniteNumber(value.lat) || value.lat < -90 || value.lat > 90) return false;
  if (!isFiniteNumber(value.lon) || value.lon < -180 || value.lon > 180) return false;
  return POLLUTANTS.every((p) => isNullableFiniteNumber(value[p]));
}

/** Runtime guard for the `/api/orbital/pollution` data payload. */
export function isPollutionDTO(value: unknown): value is PollutionDTO {
  return (
    isRecord(value) &&
    isIsoDateTime(value.time) &&
    Array.isArray(value.points) &&
    value.points.length <= MAX_POINTS &&
    value.points.every((point) => isPollutionPointDTO(point))
  );
}

/** Builds the engine payload for one pollutant: lat/lon pairs and values normalised on its scale. */
export function toPointsPayload(dto: PollutionDTO, pollutant: Pollutant): PointsPayload {
  const count = dto.points.length;
  const latLon = new Float32Array(count * 2);
  const values = new Float32Array(count);
  dto.points.forEach((point, i) => {
    latLon[2 * i] = point.lat;
    latLon[2 * i + 1] = point.lon;
    values[i] = normalizeValue(pollutant, point[pollutant]);
  });
  const scale = POLLUTANT_SCALES[pollutant];
  return { kind: "points", latLon, values, count, scale: scale.legend.stops, categorical: scale.categorical, date: dto.time };
}

interface CachedPollution {
  dto: PollutionDTO;
  meta: ApiMeta;
  /** True when the client-bundled snapshot was used because the route was unreachable. */
  fromSnapshot: boolean;
}

const cache = new GeoCache<CachedPollution>({ ttlMs: TTL_MS, maxEntries: 2 });
/** Client-snapshot results live in their own short-TTL cache so live data returns soon. */
const snapshotCache = new GeoCache<CachedPollution>({ ttlMs: SNAPSHOT_TTL_MS, maxEntries: 2 });

/** Test helper: empties the module-level DTO cache. */
export function __resetPollutionCacheForTests(): void {
  cache.clear();
  snapshotCache.clear();
}

/** Dependencies of {@link createPollutionProvider} (optional, for tests). */
export interface PollutionProviderDeps {
  now?: () => number;
}

/**
 * Builds the pollution provider.
 *
 * The in-flight request is shared by URL (`dedupe`) and uses the first caller's abort signal. If
 * that caller aborts, the shared fetch resolves `aborted` for every waiter; a waiter whose own
 * signal is still live retries once with its own signal.
 */
export function createPollutionProvider(deps: PollutionProviderDeps = {}): DataProvider<PollutionLayerConfig, PointsPayload> {
  const now = deps.now ?? Date.now;

  async function loadDto(url: string, key: string, ctx: ProviderContext): Promise<Result<CachedPollution & { fetchedAt: number }, LayerError>> {
    const { signal, flags, force } = ctx;
    if (!force) {
      const hit = cache.getEntry(key) ?? snapshotCache.getEntry(key);
      if (hit) return ok({ ...hit.value, fetchedAt: hit.storedAt });
    }
    const envelope = await dedupe(url, () => fetchEnvelope(url, signal, isPollutionDTO));
    if (!envelope.ok) {
      const { code } = envelope.error;
      if (flags.mockError || (code !== "network" && code !== "upstream")) return envelope;
      const snapshot = await fetchSnapshot("pollution", signal, isPollutionDTO);
      if (!snapshot.ok) return envelope;
      const meta: ApiMeta = { source: "CAMS (Open-Meteo)", dataDate: snapshot.value.data.time, fetchedAt: new Date(now()).toISOString(), fallback: true };
      const value: CachedPollution = { dto: snapshot.value.data, meta, fromSnapshot: true };
      snapshotCache.set(key, value);
      return ok({ ...value, fetchedAt: now() });
    }
    const value: CachedPollution = { dto: envelope.value.data, meta: envelope.value.meta, fromSnapshot: false };
    cache.set(key, value);
    return ok({ ...value, fetchedAt: now() });
  }

  return {
    id: "pollution",
    async load(config, ctx): Promise<Result<ProviderLoad<PointsPayload>, LayerError>> {
      try {
        const { signal } = ctx;
        const url = withFlags("/api/orbital/pollution", ctx.flags);
        const key = `pollution|${url}`;
        let loaded = await loadDto(url, key, ctx);
        if (!loaded.ok && loaded.error.code === "aborted" && !signal.aborted) loaded = await loadDto(url, key, ctx);
        if (signal.aborted) return err(layerError("aborted"));
        if (!loaded.ok) return loaded;
        const { dto, meta, fetchedAt, fromSnapshot } = loaded.value;
        const payload = toPointsPayload(dto, config.pollutant);
        const empty = !dto.points.some((point) => Number.isFinite(point[config.pollutant]));
        return ok({ payload, dataDate: dto.time, fetchedAt, isFallback: meta.fallback, source: fromSnapshot ? `CAMS (Open-Meteo)${SNAPSHOT_SUFFIX}` : "CAMS (Open-Meteo)", empty });
      } catch (cause) {
        return err(toLayerError(cause));
      }
    },
  };
}

/** Default pollution provider. */
export const pollutionProvider = createPollutionProvider();
