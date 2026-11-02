/**
 * FROZEN CONTRACT (K1) between the React shell and the Three.js engine.
 * Commands flow down through `EngineHandle`; low-frequency state flows up through `EngineEvents`;
 * per-frame data flows up through `FrameBus<FrameSnapshot>` and never touches React state.
 * Workers must not edit this file without coordinator approval (additive optional fields only).
 */
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { FrameBus } from "@/lib/frame-bus";
import type { EngineCommandFacade, ILayer, LayerInitContext, SatelliteFilter, ViewMode } from "@/types/engine";
import type { BodyDef, CategoryId, SelectedSatelliteState, Sgp4Readout } from "@/types/orbital";

export type { DataLayer, EngineCommandFacade, ILayer, LayerInitContext, LayerUpdateContext, SatelliteFilter, ViewMode } from "@/types/engine";
export type { LayerDataPayload } from "@/types/layers";

export type QualityTier = LayerInitContext["tier"];

// ---- Layers (Open/Closed) ------------------------------------------------------

/** Declarative request from the UI: which registered layers to create and their initial visibility. */
export interface LayerSpec {
  id: string;
  visible?: boolean;
}

/** Everything a layer factory may need; created synchronously, async assets go in `ILayer.init`. */
export interface LayerFactoryContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  tier: QualityTier;
  reducedMotion: boolean;
  /** Layers created earlier in `EngineOptions.layers` order (e.g. places needs the earth group). */
  layers: ReadonlyMap<string, ILayer>;
}

export type LayerFactory = (ctx: LayerFactoryContext) => ILayer;
export type LayerRegistry = Readonly<Record<string, LayerFactory>>;

// ---- Events (low frequency, ≤ 4 Hz) -------------------------------------------

export interface LoadingState {
  ratio: number;
  text?: string;
  error?: string;
  done: boolean;
}

export interface CatalogInfo {
  label: string;
  synthetic: boolean;
  count: number;
}

export interface TimeTick {
  ms: number;
  speed: number;
  playing: boolean;
  offsetMs: number;
  live: boolean;
}

/** All optional: the bridge subscribes to what the store needs. Never called per frame. */
export interface EngineEvents {
  onLoading?(state: LoadingState): void;
  onCatalog?(info: CatalogInfo): void;
  onViewChange?(view: ViewMode, focus: string, busy: boolean): void;
  onSatelliteSelected?(sat: SelectedSatelliteState | null): void;
  onBodySelected?(body: BodyDef | null): void;
  onFilterChange?(filter: SatelliteFilter): void;
  onNightModeChange?(on: boolean): void;
  onVisibleCount?(count: number): void;
  /** ≈1–4 Hz, or immediately after a command (play/speed/seek). */
  onTimeTick?(tick: TimeTick): void;
  /** Every 0.5 s. */
  onFps?(fps: number): void;
  onError?(error: EngineError): void;
}

export type EngineErrorCode = "webgl-unsupported" | "webgl-context-lost" | "catalog-failed" | "boot-failed" | "import-failed";

/** Typed, user-presentable failure. The UI maps `code` to a fallback screen or a toast. */
export interface EngineError {
  code: EngineErrorCode;
  message: string;
  cause?: unknown;
}

/** Result row of `EngineHandle.findSatellites` (name / NORAD lookup, e.g. "ISS", "25544"). */
export interface SatelliteMatch {
  index: number;
  name: string;
  noradId: string;
  category: CategoryId;
}

// ---- Per-frame snapshot (60 Hz, mutated in place, zero allocation) -------------

export type LabelGroup = "earth" | "solar" | "galaxy";

export interface LabelProjection {
  key: string;
  group: LabelGroup;
  /** CSS pixels relative to the canvas. */
  x: number;
  y: number;
  scale: number;
  opacity: number;
  visible: boolean;
}

/**
 * Published on `EngineHandle.frames` once per rendered frame. Consumers read fields inside the
 * subscription callback and write DOM through refs; they must not retain the object.
 */
export interface FrameSnapshot {
  simMs: number;
  offsetMs: number;
  live: boolean;
  scrubbing: boolean;
  fps: number;
  /** Live SGP4 readout of the followed satellite, `null` when none is selected. */
  readout: Sgp4Readout | null;
  /** Distance Earth→focused body in km, `NaN` when no body is focused. */
  bodyDistanceKm: number;
  /** Projected label positions for the active view; array identity is stable, length may change. */
  labels: LabelProjection[];
}

// ---- Options and handle ------------------------------------------------------

export interface EngineInitialState {
  view?: ViewMode;
  filter?: SatelliteFilter;
  nightMode?: boolean;
  simMs?: number;
  speed?: number;
  playing?: boolean;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  events?: EngineEvents;
  layers?: readonly LayerSpec[];
  registry?: LayerRegistry;
  initial?: EngineInitialState;
  /** Force a quality tier (defaults to device heuristics). */
  quality?: QualityTier;
  reducedMotion?: boolean;
  /** Enables the dev-only `window.orbitalwatch` surface (never in production builds). */
  debug?: boolean;
}

/** Commands + per-frame bus + lifecycle. `dispose()` is idempotent and StrictMode-safe. */
export interface EngineHandle extends EngineCommandFacade {
  readonly frames: FrameBus<FrameSnapshot>;
  readonly tier: QualityTier;
  /** Click on a projected label (`LabelProjection.key`); mirrors the legacy `onLabel`. */
  pickLabel(key: string): Promise<void>;
  /** Height in CSS px of the timeline overlay so the engine lifts the globe above it. */
  setTimelineInset(px: number): void;
  /** Case-insensitive search over the loaded catalog by name or NORAD id; empty before the catalog loads. */
  findSatellites(query: string, limit?: number): SatelliteMatch[];
  /** Stops the render loop (hidden tab) without disposing; sim time does not advance while paused. */
  setRenderingPaused(paused: boolean): void;
}
