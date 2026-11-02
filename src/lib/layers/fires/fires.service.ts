/**
 * Fires data service (client): fetches `/api/orbital/fires`, validates the sparse DTO, caches it per
 * window for an hour and expands it into the dense `HeatmapPayload` the engine consumes.
 */
import type { ApiMeta, FireWindow, FiresDTO, FiresLayerConfig, HeatmapPayload, DataProvider, LayerError, ProviderContext, ProviderLoad, Result } from "@/types/layers";
import { GeoCache, dedupe } from "@/lib/layers/geo-cache.service";
import { fetchEnvelope, withFlags } from "@/lib/layers/http";
import { err, layerError, ok } from "@/lib/layers/result";
import { fetchSnapshot } from "@/lib/layers/snapshot-client";
import { inRange, isFiniteNumber, isRecord, isString } from "@/lib/layers/validate";
import { FIRE_WINDOWS, HOTSPOT_CAP, FIRE_HEAT_STOPS } from "./fires-scale";

const COLS = 720;
const ROWS = 360;
const CELLS = COLS * ROWS;
const MAX_HOTSPOTS = 2000;
const TTL_MS = 60 * 60 * 1000;
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const SNAPSHOT_SUFFIX = " · instantánea";

function isFireWindow(value: unknown): value is FireWindow {
  return FIRE_WINDOWS.some((w) => w === value);
}

/** Runtime guard for the `/api/orbital/fires` data payload. */
export function isFiresDTO(value: unknown): value is FiresDTO {
  if (!isRecord(value) || !isFireWindow(value.window) || !isString(value.generatedAt)) return false;
  const { acqRange, sources, grid, hotspots, total } = value;
  if (acqRange !== null && !(isRecord(acqRange) && isString(acqRange.from) && isString(acqRange.to))) return false;
  if (!Array.isArray(sources) || !sources.every(isString)) return false;
  if (!isFiniteNumber(total) || total < 0) return false;
  if (!isRecord(grid) || grid.cols !== COLS || grid.rows !== ROWS) return false;
  const cells = grid.cells;
  if (!Array.isArray(cells) || cells.length % 3 !== 0 || cells.length > 3 * CELLS) return false;
  for (let i = 0; i < cells.length; i += 3) {
    const index: unknown = cells[i];
    if (!Number.isInteger(index) || !inRange(index, 0, CELLS - 1)) return false;
    if (!inRange(cells[i + 1], 0, 255) || !inRange(cells[i + 2], 0, 255)) return false;
  }
  if (!Array.isArray(hotspots) || hotspots.length % 4 !== 0 || hotspots.length > 4 * MAX_HOTSPOTS) return false;
  for (let i = 0; i < hotspots.length; i += 4) {
    const frp: unknown = hotspots[i + 2];
    if (!inRange(hotspots[i], -90, 90) || !inRange(hotspots[i + 1], -180, 180)) return false;
    if (!isFiniteNumber(frp) || frp < 0) return false;
  }
  return true;
}

/** Expands the sparse DTO into dense grids and a day/night-filtered, capped hotspot buffer. */
export function toHeatmapPayload(dto: FiresDTO, opts: { cap: number; dayNight: "all" | "day" | "night" }): HeatmapPayload {
  const density = new Uint8Array(CELLS);
  const intensity = new Uint8Array(CELLS);
  const { cells } = dto.grid;
  for (let i = 0; i < cells.length; i += 3) {
    const index = cells[i];
    density[index] = cells[i + 1];
    intensity[index] = cells[i + 2];
  }
  const wanted = opts.dayNight === "all" ? -1 : opts.dayNight === "day" ? 1 : 0;
  const max = Math.min(opts.cap, MAX_HOTSPOTS);
  const out = new Float32Array(max * 4);
  let count = 0;
  const { hotspots } = dto;
  for (let i = 0; i < hotspots.length && count < max; i += 4) {
    if (wanted !== -1 && hotspots[i + 3] !== wanted) continue;
    out.set([hotspots[i], hotspots[i + 1], hotspots[i + 2], hotspots[i + 3]], count * 4);
    count += 1;
  }
  return {
    kind: "heatmap",
    cols: COLS,
    rows: ROWS,
    density,
    intensity,
    hotspots: out.slice(0, count * 4),
    hotspotCount: count,
    scale: FIRE_HEAT_STOPS,
    date: dto.acqRange?.to ?? dto.generatedAt,
  };
}

interface CachedFires {
  dto: FiresDTO;
  meta: ApiMeta;
  /** True when the client-bundled snapshot replaced an unreachable route. */
  fromSnapshot: boolean;
}

/** Creates the fires provider (own clock hook for tests; the cache is module-level). */
export function createFiresProvider(deps: { now?: () => number } = {}): DataProvider<FiresLayerConfig, HeatmapPayload> {
  const now = deps.now ?? Date.now;
  return {
    id: "fires",
    async load(config: FiresLayerConfig, ctx: ProviderContext): Promise<Result<ProviderLoad<HeatmapPayload>, LayerError>> {
      try {
        if (ctx.signal.aborted) return err(layerError("aborted"));
        const { window } = config;
        const key = `fires|${window}|${ctx.flags.mockError ? 1 : 0}${ctx.flags.forceSnapshot ? 1 : 0}`;
        let cached = ctx.force ? undefined : (cache.get(key) ?? snapshotCache.get(key));
        if (!cached) {
          const url = withFlags(`/api/orbital/fires?window=${window}`, ctx.flags);
          const result = await dedupe(key, () => fetchEnvelope(url, ctx.signal, isFiresDTO));
          if (result.ok) {
            cached = { dto: result.value.data, meta: result.value.meta, fromSnapshot: false };
            cache.set(key, cached);
          } else {
            const { code } = result.error;
            if (ctx.flags.mockError || (code !== "network" && code !== "upstream")) return result;
            const snapshot = await fetchSnapshot("fires", ctx.signal, isFiresDTO);
            if (!snapshot.ok) return result;
            const { data } = snapshot.value;
            const meta: ApiMeta = {
              source: data.sources.join(" + ") || "FIRMS",
              dataDate: data.acqRange?.to ?? null,
              fetchedAt: new Date(now()).toISOString(),
              fallback: true,
            };
            cached = { dto: data, meta, fromSnapshot: true };
            snapshotCache.set(key, cached);
          }
        }
        if (ctx.signal.aborted) return err(layerError("aborted"));
        const { dto, meta, fromSnapshot } = cached;
        const payload = toHeatmapPayload(dto, { cap: HOTSPOT_CAP[ctx.tier], dayNight: config.dayNight });
        const parsed = Date.parse(meta.fetchedAt);
        return ok({
          payload,
          dataDate: payload.date,
          fetchedAt: Number.isFinite(parsed) ? parsed : now(),
          isFallback: meta.fallback,
          source: `${dto.sources.join(" + ") || "FIRMS"}${fromSnapshot ? SNAPSHOT_SUFFIX : ""}`,
          empty: dto.total === 0,
        });
      } catch (cause) {
        return err(layerError("invalid", cause instanceof Error ? cause.message : String(cause)));
      }
    },
  };
}

const cache = new GeoCache<CachedFires>({ ttlMs: TTL_MS, maxEntries: 3 });
/** Client-snapshot results use a short TTL so live data returns soon. */
const snapshotCache = new GeoCache<CachedFires>({ ttlMs: SNAPSHOT_TTL_MS, maxEntries: 3 });

/** Shared fires provider. */
export const firesProvider = createFiresProvider();

/** Test helper: empties the module-level cache. */
export function __resetFiresCacheForTests(): void {
  cache.clear();
  snapshotCache.clear();
}
