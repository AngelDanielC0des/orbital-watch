/**
 * Shared shell of the environmental overlay layers (ADR-15). Rides on the Earth group (like
 * `PlaceLayer`) so it inherits Earth visibility/transform, spins with `gmstRad`, hides beyond
 * `nearEarth`, and owns nothing but its root group. Subclasses add meshes and free them in `disposeResources`.
 */
import { Group } from "three";
import type { DataLayer, ILayer, LayerDataPayload, LayerUpdateContext } from "@/engine/contract";
import { closeImage } from "@/lib/layers/payload";
import { EarthLayer } from "./earth-layer";

export { closeImage };

export abstract class OverlayLayerBase implements DataLayer {
  readonly id: string;
  readonly name: string;
  readonly object3d: Group;
  visible = false;
  protected opacity: number;
  protected hasData = false;
  protected disposed = false;
  private readonly host: EarthLayer | null;

  protected constructor(id: string, name: string, host: ILayer | undefined, opacity: number) {
    this.id = id;
    this.name = name;
    this.opacity = opacity;
    this.host = host instanceof EarthLayer ? host : null;
    this.object3d = new Group();
    this.object3d.name = name;
    this.object3d.visible = false;
  }

  /** Re-parents under the Earth group (`LayerManager.register` added it to the scene). */
  init(): void {
    if (!this.disposed) this.host?.inner.group.add(this.object3d);
  }

  /** Only called while `visible` (LayerManager skips hidden layers). */
  update(ctx: LayerUpdateContext): void {
    this.object3d.rotation.y = ctx.gmstRad;
    this.object3d.visible = ctx.nearEarth && this.hasData;
    if (this.object3d.visible) this.tick(ctx);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) this.object3d.visible = false;
  }

  setOpacity(opacity: number): void {
    if (!Number.isFinite(opacity)) return;
    this.opacity = Math.min(1, Math.max(0, opacity));
    this.applyOpacity(this.opacity);
  }

  setData(payload: LayerDataPayload): void {
    if (this.disposed) {
      closeImage(payload);
      return;
    }
    this.hasData = this.accept(payload);
  }

  clearData(): void {
    this.hasData = false;
    this.object3d.visible = false;
    if (!this.disposed) this.release();
  }

  /** Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hasData = false;
    this.release();
    this.disposeResources();
    this.object3d.removeFromParent();
  }

  /** Per-frame work while shown (uniforms only, no allocations). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- hook for subclasses
  protected tick(ctx: LayerUpdateContext): void {}
  /** Pushes opacity into materials. */
  protected abstract applyOpacity(opacity: number): void;
  /** Uploads a payload; returns true when there is something to draw. Must close raster images it does not keep. */
  protected abstract accept(payload: LayerDataPayload): boolean;
  /** Frees data-dependent GPU resources (textures, attribute data); layer stays usable. */
  protected abstract release(): void;
  /** Frees permanent resources (geometry, materials, LUT). */
  protected abstract disposeResources(): void;
}
