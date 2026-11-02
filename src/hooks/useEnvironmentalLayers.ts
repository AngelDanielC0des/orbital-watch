"use client";
/**
 * Binds the layers store to the engine in one place: visibility and opacity are mirrored through a
 * store subscription (no React renders), data through one `useLayerData` per environmental layer.
 * Mount it in a null-rendering component so timer ticks never re-render the HUD.
 */
import { useEffect } from "react";
import type { EngineHandle } from "@/engine/contract";
import { ENVIRONMENTAL_LAYER_IDS } from "@/lib/layers/catalog";
import { useEngineStore } from "@/stores/engine-store";
import { useLayersStore, type LayersStoreState } from "@/stores/layers-store";
import type { EnvMode, EnvironmentalLayerId, ProviderFlags } from "@/types/layers";
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

  // Modes are exclusive: satellites and the followed orbit show only in "orbit" (the user's toggles are kept as preferences).
  useEffect(() => {
    if (!handle) return;
    const syncOrbitLayers = () => {
      const orbit = useLayersStore.getState().mode === "orbit";
      const prefs = useEngineStore.getState().layersVisible;
      handle.toggleLayer("satellites", orbit && prefs.satellites !== false);
      handle.toggleLayer("track", orbit && prefs.track !== false);
    };
    const enterMode = (mode: EnvMode, prev: EnvMode) => {
      if (mode !== "orbit" && prev === "orbit") {
        handle.deselectSatellite();
        if (useEngineStore.getState().filter !== "all") handle.setFilter("all");
      }
      syncOrbitLayers();
    };
    const initial = useLayersStore.getState().mode;
    if (initial !== "orbit") enterMode(initial, "orbit");
    const offLayers = useLayersStore.subscribe((s, prev) => {
      if (s.mode !== prev.mode) enterMode(s.mode, prev.mode);
    });
    const offEngine = useEngineStore.subscribe((s, prev) => {
      // Picking a satellite (search, deep link) brings the orbital view back.
      if (s.selectedSatellite && !prev.selectedSatellite && useLayersStore.getState().mode !== "orbit") {
        useLayersStore.getState().setMode("orbit");
      }
      if (s.layersVisible !== prev.layersVisible) syncOrbitLayers();
    });
    return () => {
      offLayers();
      offEngine();
    };
  }, [handle]);

  useLayerData("ozone", handle, flags.ozone);
  useLayerData("pollution", handle, flags.pollution);
  useLayerData("fires", handle, flags.fires);
}
