import type { Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import type { QualityTier } from "@/engine/config";
import type { BodyDef, SelectedSatelliteState } from "./orbital";
import type { LayerDataPayload, LayerPick } from "./layers";

export type ViewMode = "earth" | "solar" | "galaxy";
export type SatelliteFilter = "all" | "debris" | "starlink" | "projected";

export interface LayerInitContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  tier: QualityTier;
  referenceMs: number;
}

export interface LayerUpdateContext {
  simMs: number;
  gmstRad: number;
  sunDir: Vector3;
  camera: PerspectiveCamera;
  cameraPosition: Vector3;
  elapsedTime: number;
  dt: number;
  detail: number;
  nearEarth: boolean;
}

/**
 * Open/Closed Principle:
 * Any visual layer (Satellites, Earth, SolarSystem, Galaxy, Ozone, Pollution)
 * implements this interface. The 3D Engine can accept arbitrary plugin layers
 * without engine rewrites.
 */
export interface ILayer {
  readonly id: string;
  readonly name: string;
  readonly object3d: Object3D;
  visible: boolean;

  /** Lifecycle: init async assets / textures */
  init?(ctx: LayerInitContext): Promise<void> | void;

  /** Per-frame update step */
  update(ctx: LayerUpdateContext): void;

  /** Visibility toggle */
  setVisible(visible: boolean): void;

  /** Adaptive detail adjustment */
  setDetail?(detail: number): void;

  /** Viewport resize hook */
  setViewport?(width: number, height: number, fov: number, pixelRatio: number): void;

  /** Resource cleanup */
  dispose(): void;
}

/**
 * Engine State managed by Store/Bridge and exposed reactively to React UI
 */
export interface EngineUIState {
  view: ViewMode;
  focusBody: string;
  isBusy: boolean;
  filter: SatelliteFilter;
  nightMode: boolean;
  fps: number;
  visibleCount: number;
  catalogSource: string;
  isSynthetic: boolean;
  loading: {
    ratio: number;
    text: string;
    isDone: boolean;
    error: string | null;
  };
  time: {
    ms: number;
    speed: number;
    playing: boolean;
    offsetMs: number;
    isLive: boolean;
    clockUtc: string;
    clockRel: string;
    daysOffset: number;
  };
  selectedSatellite: SelectedSatelliteState | null;
  selectedBody: BodyDef | null;
  bodyDistance: {
    km: number;
    formatted: string;
    lightTime: string;
  } | null;
  hint: string;
  isHintDismissed: boolean;
  /** Last fatal engine error (WebGL unsupported, context lost, boot failed); UI shows a fallback. */
  engineError: { code: string; message: string } | null;
}

export interface EngineCommandFacade {
  setView(view: ViewMode, focus?: string): Promise<void>;
  focusBody(key: string): Promise<void>;
  setFilter(filter: SatelliteFilter): void;
  setNightMode(active: boolean): void;
  selectSatellite(index: number): void;
  deselectSatellite(): void;
  togglePlay(): void;
  setSpeed(speed: number): void;
  seekNow(): void;
  scrubDays(days: number): void;
  flyToPlace(place: { name: string; center: Vector3; distance: number }): Promise<void>;
  dismissHint(): void;
  toggleLayer(layerId: string, visible: boolean): void;
  /** ADR-15: overlay opacity 0–1 of a `DataLayer`; no-op for other layers. */
  setLayerOpacity?(layerId: string, opacity: number): void;
  /** ADR-15: hands decoded data to a `DataLayer` (raster images are transferred and closed by the engine). */
  setLayerData?(layerId: string, payload: LayerDataPayload): void;
  /** ADR-15: drops the data of a `DataLayer` and frees its GPU resources (layer stays registered). */
  clearLayerData?(layerId: string): void;
  /** ADR-16: clears the selected overlay point (card closed by the UI); no event is emitted. */
  clearLayerPick?(): void;
  /** ADR-16: highlights point `index` of a data layer as selected (lists in the UI); no event is emitted. */
  selectLayerPoint?(layerId: string, index: number): void;
  dispose(): void;
}

/** ADR-15: a layer fed with external data through the facade. Never fetches by itself. */
export interface DataLayer extends ILayer {
  setOpacity(opacity: number): void;
  setData(payload: LayerDataPayload): void;
  clearData(): void;
  /** ADR-16: nearest hit under canvas-local px (x, y) within `radiusPx`, or null. Never allocates per call beyond the result. */
  pick?(x: number, y: number, camera: PerspectiveCamera, width: number, height: number, radiusPx: number): LayerPick | null;
  /** ADR-16: emphasised point (-1 = none); purely visual. */
  setHovered?(index: number): void;
  /** ADR-16: selected point (-1 = none); purely visual. */
  setSelected?(index: number): void;
  /** ADR-16: world position of point `index` (for the hover ring); false when not drawable. */
  pointWorld?(index: number, out: Vector3): boolean;
}
