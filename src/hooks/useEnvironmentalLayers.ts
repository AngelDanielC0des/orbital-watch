"use client";
/**
 * Binds the layers store to the engine in one place: visibility and opacity are mirrored through a
 * store subscription (no React renders), data through one `useLayerData` per environmental layer.
 * Mount it in a null-rendering component so timer ticks never re-render the HUD.
 */
import { useEffect } from "react";
import type { EngineHandle } from "@/engine/contract";
import { ENVIRONMENTAL_LAYER_IDS } from "@/lib/layers/catalog";
import { useLayersStore, type LayersStoreState } from "@/stores/layers-store";
import type { EnvironmentalLayerId, ProviderFlags } from "@/types/layers";
import { useLayerData } from "./useLayerData";

/** Dev flags per layer (`?mockError=<id>` only fails that layer). Must be referentially stable. */
export type LayerFlagsMap = Readonly<Record<EnvironmentalLayerId, ProviderFlags>>;

function syncEngine(handle: EngineHandle, state: LayersStoreState, prev: LayersStoreState | null): void {
  for (const id of ENVIRONMENTAL_LAYER_IDS) {
    const layer = state.layers[id];
    const before = prev?.layers[id];
    if (before === layer) continue;
    if (!before || before.visible !== layer.visible) handle.toggleLayer(id, layer.visible);
    if (!before || before.opacity !== layer.opacity) handle.setLayerOpacity?.(id, layer.opacity);
  }
}

export function useEnvironmentalLayers(handle: EngineHandle | null, flags: LayerFlagsMap): void {
  useEffect(() => {
    if (!handle) return;
    syncEngine(handle, useLayersStore.getState(), null);
    return useLayersStore.subscribe((state, prev) => syncEngine(handle, state, prev));
  }, [handle]);

  useLayerData("ozone", handle, flags.ozone);
  useLayerData("pollution", handle, flags.pollution);
  useLayerData("fires", handle, flags.fires);
}
