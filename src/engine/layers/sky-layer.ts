/**
 * `ILayer` wrapper around the 1:1 ported `Sky` renderer (stars + Milky Way glow). Same shape as K4.
 * Exposure is driven by the engine (`inner.setExposure(...)` needs the fade-in tween and the Earth zoom,
 * neither of which is part of `LayerUpdateContext`), so `update` has nothing to do.
 */
import type { Object3D } from "three";
import type { ILayer, LayerFactory } from "@/engine/contract";
import { Sky } from "@/engine/render/sky";

export class SkyLayer implements ILayer {
  readonly id = "sky";
  readonly name = "Sky";
  readonly object3d: Object3D;
  visible = true;
  /** Typed access for cross-cutting engine code (`setExposure`). */
  readonly inner: Sky;
  private disposed = false;

  constructor(inner: Sky) {
    this.inner = inner;
    this.object3d = inner.group;
    inner.setExposure(0, 0);
  }

  /** Milky Way texture + star catalog. Rejects when assets are missing (the engine only warns). */
  init(): Promise<void> {
    return this.inner.load();
  }

  /** Intentionally empty: exposure is set explicitly by the engine each frame (see file header). */
  update(): void {}

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.object3d.visible = visible;
  }

  setDetail(detail: number): void {
    this.inner.setDetail(detail);
  }

  setViewport(_width: number, _height: number, _fov: number, pixelRatio: number): void {
    this.inner.setPixelRatio(pixelRatio);
  }

  /** Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.inner.dispose();
  }
}

export const createSkyLayer: LayerFactory = ({ tier }) => new SkyLayer(new Sky({ tier }));
