/**
 * `ILayer` wrapper around the 1:1 ported `OrbitTrack` (selected-satellite trajectory + reticle).
 * `OrbitTrack.update` returns the SGP4 readout the engine needs for the follow camera and the HUD, so the
 * engine calls `inner.update(ms, gmstRad)` explicitly; `update` here is a no-op.
 */
import { Vector2 } from "three";
import type { Object3D } from "three";
import type { ILayer, LayerFactory } from "@/engine/contract";
import { OrbitTrack } from "@/engine/render/track";

export class TrackLayer implements ILayer {
  readonly id = "track";
  readonly name = "Orbit track";
  readonly object3d: Object3D;
  visible = true;
  /** Typed access for cross-cutting engine code (`setTarget`, `state`, `position`, `clear`). */
  readonly inner: OrbitTrack;
  private disposed = false;

  constructor(inner: OrbitTrack) {
    this.inner = inner;
    this.object3d = inner.group;
  }

  /** Intentionally empty: the engine calls `inner.update(ms, gmstRad)` and uses its readout (see file header). */
  update(): void {}

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.object3d.visible = visible;
  }

  setViewport(width: number, height: number): void {
    this.inner.setResolution(width, height);
  }

  /** Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.inner.dispose();
  }
}

/** The initial resolution is overwritten by the first `setViewport` (engine `syncViewports`). */
export const createTrackLayer: LayerFactory = () => new TrackLayer(new OrbitTrack(new Vector2(1, 1)));
