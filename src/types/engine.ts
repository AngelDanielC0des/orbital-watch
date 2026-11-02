import type { Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import type { QualityTier } from "@/engine/config";
import type { BodyDef, SelectedSatelliteState } from "./orbital";

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
  dispose(): void;
}
