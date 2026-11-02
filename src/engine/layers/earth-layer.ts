/**
 * K4 — exemplar `ILayer` wrapper. Wraps the 1:1 ported `Earth` renderer without touching it:
 * no GLSL edits, no renamed methods. Copy this shape for sky/solar/galaxy/satellites/track (T13).
 */
import type { Object3D } from "three";
import type { ILayer, LayerFactory, LayerInitContext, LayerUpdateContext } from "@/engine/contract";
import { Earth } from "@/engine/render/earth";

export class EarthLayer implements ILayer {
  readonly id = "earth";
  readonly name = "Earth";
  readonly object3d: Object3D;
  visible = true;
  /** Typed access for cross-cutting engine code (uniforms, alarm, group for child layers). */
  readonly inner: Earth;
  private disposed = false;

  constructor(inner: Earth) {
    this.inner = inner;
    this.object3d = inner.group;
  }

  /** Async assets. Progress is forwarded by the engine as the 0–0.7 loading segment. */
  init(_ctx: LayerInitContext, onProgress?: (ratio: number) => void): Promise<void> {
    return this.inner.load(onProgress);
  }

  update(ctx: LayerUpdateContext): void {
    this.inner.update(ctx.gmstRad, ctx.sunDir, ctx.elapsedTime);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.object3d.visible = visible;
  }

  /** Idempotent: the renderer owns geometries/materials/textures and frees them in `Earth.dispose()`. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.inner.dispose();
  }
}

export const createEarthLayer: LayerFactory = ({ renderer, tier }) =>
  new EarthLayer(
    new Earth({
      renderer,
      tier,
      segments: tier === "hi" ? 160 : 96,
      atmosphereSteps: tier === "hi" ? 6 : 4,
    }),
  );
