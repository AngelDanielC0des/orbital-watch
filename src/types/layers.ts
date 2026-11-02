/**
 * Environmental data layers (ozone, surface air quality, active fires): metadata, UI state,
 * engine payloads, provider contract and the JSON shapes served by `/api/orbital/*` (ADR-15).
 * Types only (plus `Result`), no runtime imports: the engine, the services and the UI all read it.
 */
import type { QualityTier } from "@/engine/config";

/** Every toggleable layer the HUD knows about. `labels` is UI-only; the rest match engine registry ids. */
export type LayerId = "satellites" | "track" | "sky" | "labels" | "ozone" | "pollution" | "fires";

/** Layers that carry external data (services + `DataLayer` renderers). */
export type EnvironmentalLayerId = Extract<LayerId, "ozone" | "pollution" | "fires">;

/** Orbit-section toggles (no data, no opacity). */
export type OrbitLayerId = Exclude<LayerId, EnvironmentalLayerId>;

/** How an environmental layer is drawn on the globe. */
export type LayerKind = "raster" | "points" | "heatmap";

/** Contextual controls a row shows when the layer is on. */
export type LayerControl = "opacity" | "pollutant" | "window";

/** Surface pollutants and indices served by Open-Meteo (CAMS). `o3` is surface ozone in µg/m³, never DU. */
export type Pollutant = "pm2_5" | "pm10" | "no2" | "o3" | "so2" | "co" | "eaqi" | "usaqi";

/** FIRMS rolling windows. */
export type FireWindow = "24h" | "48h" | "7d";

/** GIBS ozone products in fallback order. */
export type OzoneProduct = "OMI_TOMS" | "OMI_DOAS" | "OMPS";

/** Lifecycle of one environmental layer in the UI. */
export type LayerStatus = "idle" | "loading" | "ready" | "empty" | "error";

/** Machine-readable failure class; the UI maps it to plain Spanish copy. */
export type LayerErrorCode = "network" | "upstream" | "invalid" | "empty" | "aborted";

/** Failure surfaced to the UI. `message` is user-presentable Spanish; `detail` goes to `console.warn` only. */
export interface LayerError {
  code: LayerErrorCode;
  message: string;
  detail?: string;
}

/** Discriminated success/failure value returned by services (no throwing across layers). */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// ---- Static metadata (catalog) ---------------------------------------------------

/** One colour stop of a scale: `at` in 0–1 along the scale, `color` as `#rrggbb`. */
export interface ColorStop {
  at: number;
  color: string;
}

/** Legend tick: a value in the layer unit and its position 0–1 along the bar. */
export interface LegendTick {
  at: number;
  label: string;
}

/** Legend description shared by the drawer, the active strip and (through the stops) the LUT. */
export interface LegendSpec {
  title: string;
  unit: string;
  stops: readonly ColorStop[];
  ticks: readonly LegendTick[];
  /** Discrete categories (EAQI / US AQI) instead of a smooth gradient. */
  categorical?: boolean;
  /** Extra legend notes, e.g. "● foco > 100 MW" or the 220 DU ozone-hole marker. */
  notes?: readonly string[];
}

/** Source of the data shown by a layer. */
export interface LayerSource {
  name: string;
  url: string;
  product: string;
}

/** Attribution block: short credit for rows, full acknowledgement for the footer. */
export interface LayerAttribution {
  short: string;
  full: string;
  licence: string;
  licenceUrl?: string;
}

/** Catalog entry of an orbit-section toggle (existing satellites/track/sky/labels). */
export interface OrbitLayerMetadata {
  group: "orbit";
  id: OrbitLayerId;
  title: string;
  /** False for UI-only toggles (`labels`). */
  engine: boolean;
}

/** Catalog entry of an environmental data layer. */
export interface EnvironmentalLayerMetadata {
  group: "environment";
  id: EnvironmentalLayerId;
  title: string;
  description: string;
  kind: LayerKind;
  source: LayerSource;
  attribution: LayerAttribution;
  defaultOpacity: number;
  defaultVisible: false;
  refreshIntervalMs: number;
  supportsTimeline: boolean;
  controls: readonly LayerControl[];
  /** Plain-language honesty note ("Estimación de modelo", "retraso ~4 días"). */
  latencyNote: string;
}

/** Static description of any toggleable layer. */
export type LayerMetadata = OrbitLayerMetadata | EnvironmentalLayerMetadata;

// ---- Per-layer configuration ----------------------------------------------------------

/** Ozone: product chain head and optional archive date (phase 2). */
export interface OzoneLayerConfig {
  product: OzoneProduct;
  date?: string;
}

/** Pollution: the single active pollutant/index. */
export interface PollutionLayerConfig {
  pollutant: Pollutant;
}

/** Fires: rolling window and day/night mask. */
export interface FiresLayerConfig {
  window: FireWindow;
  dayNight: "all" | "day" | "night";
}

/** Config type per environmental layer id. */
export interface LayerConfigMap {
  ozone: OzoneLayerConfig;
  pollution: PollutionLayerConfig;
  fires: FiresLayerConfig;
}

// ---- UI state ----------------------------------------------------------------------

/** Low-frequency UI state of one environmental layer (written only on status changes). */
export interface LayerState<C = unknown> {
  id: EnvironmentalLayerId;
  visible: boolean;
  opacity: number;
  status: LayerStatus;
  error: LayerError | null;
  /** Date of the data itself (`YYYY-MM-DD` or ISO time), not the fetch time. */
  dataDate: string | null;
  /** Epoch ms of the last successful load. */
  fetchedAt: number | null;
  isFallback: boolean;
  /** Resolved upstream product/source label (e.g. "OMI_TOMS", "NOAA-20 + NOAA-21"). */
  source: string | null;
  config: C;
}

// ---- Engine payloads (decoded, no JSON) -------------------------------------------------

/** Decoded image accepted by `Texture` (ImageBitmap normally, HTMLImageElement on Safari). */
export type RasterImage = ImageBitmap | HTMLImageElement;

/**
 * Equirectangular raster (ozone). Ownership of `image` transfers to the engine, which uploads it
 * and closes ImageBitmaps; callers must decode a fresh image for every `setLayerData` call.
 */
export interface RasterPayload {
  kind: "raster";
  image: RasterImage;
  /** Bitmap already flipped with `imageOrientation: "flipY"` (texture.flipY must stay false). */
  flipped: boolean;
  date: string;
}

/** Sample points (pollution). Arrays are read, never retained, by the engine. */
export interface PointsPayload {
  kind: "points";
  /** lat, lon pairs in degrees (length = 2 × count). */
  latLon: Float32Array;
  /** Normalised 0–1 position on `scale`; NaN = no data (point hidden). */
  values: Float32Array;
  count: number;
  /** Colour ramp used to build the LUT (same stops as the legend). */
  scale: readonly ColorStop[];
  categorical: boolean;
  date: string;
}

/** Fire density grid + strongest hotspots. Arrays are read, never retained, by the engine. */
export interface HeatmapPayload {
  kind: "heatmap";
  cols: number;
  rows: number;
  /** Row-major from north-west (row 0 = 90°N, col 0 = 180°W), log-scaled detection count 0–255. */
  density: Uint8Array;
  /** Same layout, log-scaled max FRP 0–255. */
  intensity: Uint8Array;
  /** Stride 4: lat, lon, frp (MW), day (1 = day, 0 = night). Sorted by FRP desc. */
  hotspots: Float32Array;
  hotspotCount: number;
  date: string;
}

/** Anything `EngineHandle.setLayerData` accepts. */
export type LayerDataPayload = RasterPayload | PointsPayload | HeatmapPayload;

/** Payload type per environmental layer id. */
export interface LayerPayloadMap {
  ozone: RasterPayload;
  pollution: PointsPayload;
  fires: HeatmapPayload;
}

// ---- Providers (client services) ----------------------------------------------------------

/** Dev flags forwarded from the URL (`?mockError=<id>`, `?mock=snapshot`). */
export interface ProviderFlags {
  mockError: boolean;
  forceSnapshot: boolean;
}

/** Context of one load. */
export interface ProviderContext {
  signal: AbortSignal;
  tier: QualityTier;
  flags: ProviderFlags;
  /** Manual refresh: bypass the client cache (the server ISR cache still applies). */
  force?: boolean;
}

/** Successful load: payload for the engine + metadata for the UI. */
export interface ProviderLoad<P extends LayerDataPayload> {
  payload: P;
  dataDate: string;
  fetchedAt: number;
  isFallback: boolean;
  source: string;
  /** True when there is nothing to draw (UI shows the empty state, engine gets `clearLayerData`). */
  empty: boolean;
}

/** Fetch + validate + decode for one environmental layer. Never throws; aborts resolve `aborted`. */
export interface DataProvider<C, P extends LayerDataPayload> {
  id: EnvironmentalLayerId;
  load(config: C, ctx: ProviderContext): Promise<Result<ProviderLoad<P>, LayerError>>;
}

// ---- Route Handler JSON (`/api/orbital/*`) -------------------------------------------------

/** Metadata on every route response. */
export interface ApiMeta {
  source: string;
  dataDate: string | null;
  /** ISO time the server produced the data. */
  fetchedAt: string;
  fallback: boolean;
}

/** Uniform envelope of the three routes. */
export type ApiEnvelope<T> =
  | { ok: true; data: T; meta: ApiMeta }
  | { ok: false; error: { code: LayerErrorCode; message: string }; meta: ApiMeta };

/** `GET /api/orbital/ozone` data: where to fetch the image (GIBS WMS or bundled snapshot). */
export interface OzoneDescriptor {
  /** GIBS layer identifier actually resolved, e.g. `OMI_Ozone_TOMS_Total_Column`. */
  layer: string;
  product: OzoneProduct | "snapshot";
  date: string;
  imageUrl: string;
  width: number;
  height: number;
  attribution: string;
}

/** One pollution sample point; `null` where the model returned no value. */
export interface PollutionPointDTO {
  id: string;
  name: string;
  lat: number;
  lon: number;
  pm2_5: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
  so2: number | null;
  co: number | null;
  eaqi: number | null;
  usaqi: number | null;
}

/** `GET /api/orbital/pollution` data. */
export interface PollutionDTO {
  /** Model hour, ISO UTC (`2026-11-02T12:00Z`). */
  time: string;
  points: PollutionPointDTO[];
}

/** `GET /api/orbital/fires` data. Grid is sparse: only non-empty cells are listed. */
export interface FiresDTO {
  window: FireWindow;
  generatedAt: string;
  acqRange: { from: string; to: string } | null;
  /** Sensors that loaded, e.g. `["NOAA-20", "NOAA-21"]`. */
  sources: string[];
  grid: {
    cols: number;
    rows: number;
    /** Stride 3: cell index (row-major from NW), density 0–255 (log count), intensity 0–255 (log max FRP). */
    cells: number[];
  };
  /** Stride 4: lat, lon, frp, day (1|0), sorted by FRP desc, capped server-side (2 000). */
  hotspots: number[];
  /** Total valid detections in the window (before binning). */
  total: number;
}
