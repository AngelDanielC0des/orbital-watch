/**
 * `ILayer` wrapper around the 1:1 ported `SatelliteLayer` renderer. Differences from K4:
 * - The renderer needs the catalog, which loads after boot, so the wrapper is registered up front with
 *   an empty holder group and `attach(catalog)` builds the renderer later (`inner` is `null` until then).
 * - `setVisible(false)` hides the points/meshes without disposing anything; `true` restores them.
 * - `SatelliteLayer.update` needs the camera position and clock seconds, which the engine already has
 *   in hand and gates on `nearEarth`; it calls `inner.update(...)` explicitly, so `update` here is a no-op.
 */
import { Group, Sphere, Vector3 } from "three";
import type { WebGLRenderer } from "three";
import type { ILayer, LayerFactory, QualityTier } from "@/engine/contract";
import { SatelliteLayer } from "@/engine/render/satellites";
import type { CatalogEntry } from "@/types/orbital";

export interface SatellitesAttachParams {
  referenceMs: number;
  /** Canvas height in CSS px. */
  height: number;
  /** Vertical field of view in degrees. */
  fov: number;
  pixelRatio: number;
  detail?: number;
}

export class SatellitesLayer implements ILayer {
  readonly id = "satellites";
  readonly name = "Satellites";
  readonly object3d: Group;
  visible = true;
  /** `null` until `attach(catalog)` (after the catalog loads). */
  inner: SatelliteLayer | null = null;
  private readonly renderer: WebGLRenderer;
  private readonly tier: QualityTier;
  private disposed = false;

  constructor(renderer: WebGLRenderer, tier: QualityTier) {
    this.renderer = renderer;
    this.tier = tier;
    this.object3d = new Group();
    this.object3d.name = "SatellitesLayer";
  }

  /** Builds the GPU propagator + points/meshes for `catalog` and mounts them under this layer's group. */
  attach(catalog: Iterable<CatalogEntry>, params: SatellitesAttachParams): SatelliteLayer {
    if (this.inner) throw new Error("SatellitesLayer.attach called twice");
    if (this.disposed) throw new Error("SatellitesLayer.attach called after dispose");
    const inner = new SatelliteLayer(catalog, { renderer: this.renderer, referenceMs: params.referenceMs, tier: this.tier });
    inner.setViewport(params.height, params.fov, params.pixelRatio);
    if (params.detail !== undefined) inner.setDetail(params.detail);
    // satellites.ts never presets a boundingSphere on its attribute-less points geometry (position is a
    // 1-component dummy). WebGLRenderer.projectObject computes it for depth sorting even with
    // frustumCulled=false → "Computed radius is NaN". Pre-existing legacy bug; patched here (render/* is frozen).
    inner.pointsGeometry.boundingSphere = new Sphere(new Vector3(), 1e6);
    this.object3d.add(inner.object3d);
    this.inner = inner;
    return inner;
  }

  /** Intentionally empty: the engine drives `inner.update(ms, cameraPos, sunDir, time)` (see file header). */
  update(): void {}

  /** The engine also gates `object3d.visible` on `nearEarth` each frame; it must honour `visible` too. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.object3d.visible = visible;
  }

  setDetail(detail: number): void {
    this.inner?.setDetail(detail);
  }

  setViewport(_width: number, height: number, fov: number, pixelRatio: number): void {
    this.inner?.setViewport(height, fov, pixelRatio);
  }

  /** Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.inner?.dispose();
    this.inner = null;
  }
}

export const createSatellitesLayer: LayerFactory = ({ renderer, tier }) => new SatellitesLayer(renderer, tier);
