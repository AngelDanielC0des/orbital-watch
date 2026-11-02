/**
 * `ILayer` wrapper around the 1:1 ported `SolarSystem` renderer. Same shape as K4.
 * `SolarSystem.update` needs `time` (clock seconds), `earthZoom` and `flare`, which are not part of
 * `LayerUpdateContext`; the engine therefore calls `inner.updatePositions(...)` / `inner.update(...)`
 * explicitly at the points the legacy frame loop did, and `update` here is a no-op.
 */
import type { Object3D } from "three";
import type { ILayer, LayerFactory } from "@/engine/contract";
import { SolarSystem } from "@/engine/render/solar";

export class SolarLayer implements ILayer {
  readonly id = "solar";
  readonly name = "Solar system";
  readonly object3d: Object3D;
  visible = true;
  /** Typed access for cross-cutting engine code (`byKey`, `focusables`, `viewMix`, `sunPosition`, picking). */
  readonly inner: SolarSystem;
  private disposed = false;

  constructor(inner: SolarSystem) {
    this.inner = inner;
    this.object3d = inner.group;
  }

  /** Planet textures (low tier first). The engine defers this to browser idle time after boot. */
  init(): Promise<void> {
    return this.inner.loadTextures();
  }

  /** Intentionally empty: the engine drives `updatePositions`/`update` explicitly (see file header). */
  update(): void {}

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.object3d.visible = visible;
  }

  setDetail(detail: number): void {
    this.inner.setDetail(detail);
  }

  setViewport(width: number, height: number, fov: number, pixelRatio: number): void {
    this.inner.setViewport(width, height, fov, pixelRatio);
  }

  /** Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.inner.dispose();
  }
}

export const createSolarLayer: LayerFactory = ({ renderer, tier }) => new SolarLayer(new SolarSystem({ renderer, tier }));
