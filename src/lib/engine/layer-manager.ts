import type { Scene } from "three";
import type { ILayer, LayerInitContext, LayerUpdateContext } from "@/types/engine";

export class LayerManager {
  private layers: Map<string, ILayer> = new Map();
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Registers a layer plugin into the scene and lifecycle.
   */
  async register(layer: ILayer, initCtx?: LayerInitContext): Promise<void> {
    if (this.layers.has(layer.id)) {
      console.warn(`[LayerManager] Layer with id '${layer.id}' is already registered.`);
      return;
    }

    this.layers.set(layer.id, layer);
    this.scene.add(layer.object3d);

    if (initCtx && layer.init) {
      await layer.init(initCtx);
    }
  }

  get(id: string): ILayer | undefined {
    return this.layers.get(id);
  }

  getAll(): ILayer[] {
    return Array.from(this.layers.values());
  }

  setVisible(id: string, visible: boolean): void {
    const layer = this.layers.get(id);
    if (layer) {
      layer.setVisible(visible);
    }
  }

  setDetail(detail: number): void {
    for (const layer of this.layers.values()) {
      layer.setDetail?.(detail);
    }
  }

  setViewport(width: number, height: number, fov: number, pixelRatio: number): void {
    for (const layer of this.layers.values()) {
      layer.setViewport?.(width, height, fov, pixelRatio);
    }
  }

  update(ctx: LayerUpdateContext): void {
    for (const layer of this.layers.values()) {
      if (layer.visible) {
        layer.update(ctx);
      }
    }
  }

  unregister(id: string): void {
    const layer = this.layers.get(id);
    if (!layer) return;

    this.scene.remove(layer.object3d);
    layer.dispose();
    this.layers.delete(id);
  }

  dispose(): void {
    for (const layer of this.layers.values()) {
      this.scene.remove(layer.object3d);
      layer.dispose();
    }
    this.layers.clear();
  }
}
