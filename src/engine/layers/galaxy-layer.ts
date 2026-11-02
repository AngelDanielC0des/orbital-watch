/**
 * `ILayer` wrapper around the 1:1 ported `Galaxy` renderer. Differences from K4:
 * - The galaxy is built lazily (`ensure`) because it is heavy and only needed in galaxy view.
 * - `Galaxy` owns its own `Scene` and the engine renders it in a dedicated pass (`renderPass`), so
 *   `object3d` is an empty placeholder group: adding `inner.scene` to the main scene would draw it twice.
 */
import { Group } from "three";
import type { Object3D, PerspectiveCamera, WebGLRenderer } from "three";
import type { ILayer, LayerFactory, QualityTier } from "@/engine/contract";
import { Galaxy } from "@/engine/render/galaxy";

export interface GalaxyEnsureParams {
  /** Canvas height in CSS px. */
  height: number;
  /** Vertical field of view in degrees. */
  fov: number;
  pixelRatio: number;
  detail: number;
}

export class GalaxyLayer implements ILayer {
  readonly id = "galaxy";
  readonly name = "Galaxy";
  readonly object3d: Object3D;
  visible = true;
  /** `null` until `ensure()` runs (first entry to galaxy view, or browser idle time after boot). */
  inner: Galaxy | null = null;
  private readonly tier: QualityTier;
  private disposed = false;

  constructor(tier: QualityTier) {
    this.tier = tier;
    const placeholder = new Group();
    placeholder.name = "GalaxyLayer";
    this.object3d = placeholder;
  }

  /** Nothing to preload: the galaxy is generated procedurally by `ensure()`. */
  init(): void {}

  /** Builds the galaxy once and applies the current viewport/detail. Safe to call repeatedly. */
  ensure(params: GalaxyEnsureParams): Galaxy | null {
    if (this.disposed) return null;
    if (!this.inner) {
      const galaxy = new Galaxy({ tier: this.tier });
      galaxy.setViewport(params.height, params.fov, params.pixelRatio);
      galaxy.setDetail(params.detail);
      this.inner = galaxy;
    }
    return this.inner;
  }

  /** The galaxy has no per-frame simulation; everything camera-dependent happens in the render pass. */
  update(): void {}

  /**
   * Dedicated galaxy render pass (replaces the main scene while in galaxy view).
   * Returns `false` when nothing was drawn (not built yet, or the layer is hidden).
   */
  renderPass(renderer: WebGLRenderer, camera: PerspectiveCamera): boolean {
    if (!this.inner || !this.visible) return false;
    renderer.render(this.inner.scene, camera);
    return true;
  }

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

  /** Idempotent: `Galaxy.dispose` frees every disposable it registered and must run once. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.inner?.dispose();
    this.inner = null;
  }
}

export const createGalaxyLayer: LayerFactory = ({ tier }) => new GalaxyLayer(tier);
