/** Ozone overlay (ADR-15). Stub until its renderer lands: accepts nothing, draws nothing. */
import type { ILayer, LayerDataPayload, LayerFactory } from "@/engine/contract";
import { closeImage, OverlayLayerBase } from "./overlay-base";

export class RasterOverlayLayer extends OverlayLayerBase {
  constructor(id: string, name: string, host: ILayer | undefined, opacity: number) {
    super(id, name, host, opacity);
  }

  protected applyOpacity(): void {}

  protected accept(payload: LayerDataPayload): boolean {
    closeImage(payload);
    return false;
  }

  protected release(): void {}

  protected disposeResources(): void {}
}

export const createOzoneLayer: LayerFactory = ({ layers }) => new RasterOverlayLayer("ozone", "Ozone", layers.get("earth"), 0.75);
