import { create } from "zustand";
import type { EnvironmentalLayerId, LayerConfigMap, LayerError, LayerState } from "@/types/layers";

/** Per-layer UI state, keyed by environmental layer id. */
export type EnvLayerStates = { [K in EnvironmentalLayerId]: LayerState<LayerConfigMap[K]> };

/** Metadata copied into the store after a successful load. */
export interface LoadMeta {
  dataDate: string;
  fetchedAt: number;
  isFallback: boolean;
  source: string;
}

/** State and actions of the environmental layers UI. Written only on low-frequency events. */
export interface LayersStoreState {
  layers: EnvLayerStates;
  /** Bumped by `requestRefresh`; the data hook reloads when it changes. */
  refreshNonce: Record<EnvironmentalLayerId, number>;
  /** Most recently switched-on layer (drives the active legend strip), null if none. */
  lastEnabled: EnvironmentalLayerId | null;
  legendDismissed: boolean;
  setVisible(id: EnvironmentalLayerId, visible: boolean): void;
  setOpacity(id: EnvironmentalLayerId, opacity: number): void;
  setConfig<K extends EnvironmentalLayerId>(id: K, patch: Partial<LayerConfigMap[K]>): void;
  setLoading(id: EnvironmentalLayerId): void;
  setReady(id: EnvironmentalLayerId, meta: LoadMeta): void;
  setEmpty(id: EnvironmentalLayerId, meta: LoadMeta): void;
  setError(id: EnvironmentalLayerId, error: LayerError): void;
  requestRefresh(id: EnvironmentalLayerId): void;
  dismissLegend(): void;
  /** Applies deep-link state once at boot (visible layers + configs). */
  hydrate(input: {
    visible?: readonly EnvironmentalLayerId[];
    config?: { [K in EnvironmentalLayerId]?: Partial<LayerConfigMap[K]> };
  }): void;
  resetAll(): void;
}

const LAYER_IDS: readonly EnvironmentalLayerId[] = ["ozone", "pollution", "fires"];

// Local copies of the catalog defaults (kept independent of `@/lib/layers/catalog`).
const INITIAL_OPACITY: { readonly [K in EnvironmentalLayerId]: number } = {
  ozone: 0.75,
  pollution: 0.9,
  fires: 0.85,
};

const INITIAL_CONFIG: { readonly [K in EnvironmentalLayerId]: LayerConfigMap[K] } = {
  ozone: { product: "OMI_TOMS" },
  pollution: { pollutant: "pm2_5" },
  fires: { window: "24h", dayNight: "all" },
};

function freshLayers(): EnvLayerStates {
  const base = {
    visible: false,
    status: "idle" as const,
    error: null,
    dataDate: null,
    fetchedAt: null,
    isFallback: false,
    source: null,
  };
  return {
    ozone: { ...base, id: "ozone", opacity: INITIAL_OPACITY.ozone, config: { ...INITIAL_CONFIG.ozone } },
    pollution: {
      ...base,
      id: "pollution",
      opacity: INITIAL_OPACITY.pollution,
      config: { ...INITIAL_CONFIG.pollution },
    },
    fires: { ...base, id: "fires", opacity: INITIAL_OPACITY.fires, config: { ...INITIAL_CONFIG.fires } },
  };
}

function freshNonce(): Record<EnvironmentalLayerId, number> {
  return { ozone: 0, pollution: 0, fires: 0 };
}

type CommonPatch = Partial<Omit<LayerState<unknown>, "id" | "config">>;

/** Applies a patch of the non-config fields to one layer, leaving the others untouched. */
function patchLayer(layers: EnvLayerStates, id: EnvironmentalLayerId, patch: CommonPatch): EnvLayerStates {
  switch (id) {
    case "ozone":
      return { ...layers, ozone: { ...layers.ozone, ...patch } };
    case "pollution":
      return { ...layers, pollution: { ...layers.pollution, ...patch } };
    case "fires":
      return { ...layers, fires: { ...layers.fires, ...patch } };
  }
}

function shallowEqualPatch<C extends object>(current: C, patch: Partial<C>): boolean {
  for (const key of Object.keys(patch) as (keyof C)[]) {
    if (patch[key] !== undefined && current[key] !== patch[key]) return false;
  }
  return true;
}

/** Applies a config patch to one layer; returns the same `layers` object if nothing changes. */
function patchConfig<K extends EnvironmentalLayerId>(
  layers: EnvLayerStates,
  id: K,
  patch: Partial<LayerConfigMap[K]>,
): EnvLayerStates {
  switch (id) {
    case "ozone": {
      const p: Partial<LayerConfigMap["ozone"]> = patch;
      if (shallowEqualPatch(layers.ozone.config, p)) return layers;
      return { ...layers, ozone: { ...layers.ozone, config: { ...layers.ozone.config, ...p } } };
    }
    case "pollution": {
      const p: Partial<LayerConfigMap["pollution"]> = patch;
      if (shallowEqualPatch(layers.pollution.config, p)) return layers;
      return { ...layers, pollution: { ...layers.pollution, config: { ...layers.pollution.config, ...p } } };
    }
    case "fires": {
      const p: Partial<LayerConfigMap["fires"]> = patch;
      if (shallowEqualPatch(layers.fires.config, p)) return layers;
      return { ...layers, fires: { ...layers.fires, config: { ...layers.fires.config, ...p } } };
    }
    default:
      return layers;
  }
}

function initialState() {
  return {
    layers: freshLayers(),
    refreshNonce: freshNonce(),
    lastEnabled: null,
    legendDismissed: false,
  };
}

/** Zustand store of the environmental layers UI state. */
export const useLayersStore = create<LayersStoreState>((set) => ({
  ...initialState(),

  setVisible: (id, visible) =>
    set((state) => {
      const layers = patchLayer(state.layers, id, { visible });
      if (visible) return { layers, lastEnabled: id, legendDismissed: false };
      if (state.lastEnabled !== id) return { layers };
      const other = LAYER_IDS.find((other) => other !== id && layers[other].visible) ?? null;
      return { layers, lastEnabled: other };
    }),

  setOpacity: (id, opacity) => {
    if (Number.isNaN(opacity)) return;
    const clamped = Math.max(0, Math.min(1, opacity));
    set((state) => ({ layers: patchLayer(state.layers, id, { opacity: clamped }) }));
  },

  setConfig: (id, patch) => set((state) => {
    const layers = patchConfig(state.layers, id, patch);
    return layers === state.layers ? state : { layers };
  }),

  setLoading: (id) => set((state) => ({ layers: patchLayer(state.layers, id, { status: "loading", error: null }) })),

  setReady: (id, meta) =>
    set((state) => ({ layers: patchLayer(state.layers, id, { status: "ready", error: null, ...meta }) })),

  setEmpty: (id, meta) =>
    set((state) => ({ layers: patchLayer(state.layers, id, { status: "empty", error: null, ...meta }) })),

  setError: (id, error) => set((state) => ({ layers: patchLayer(state.layers, id, { status: "error", error }) })),

  requestRefresh: (id) =>
    set((state) => ({ refreshNonce: { ...state.refreshNonce, [id]: state.refreshNonce[id] + 1 } })),

  dismissLegend: () => set({ legendDismissed: true }),

  hydrate: (input) =>
    set((state) => {
      let layers = state.layers;
      const config = input.config;
      if (config?.ozone) layers = patchConfig(layers, "ozone", config.ozone);
      if (config?.pollution) layers = patchConfig(layers, "pollution", config.pollution);
      if (config?.fires) layers = patchConfig(layers, "fires", config.fires);
      let lastEnabled = state.lastEnabled;
      for (const id of input.visible ?? []) {
        layers = patchLayer(layers, id, { visible: true });
        lastEnabled = id;
      }
      return { layers, lastEnabled };
    }),

  resetAll: () => set(initialState()),
}));

/** Non-hook accessor for one layer (used by hooks/effects). */
export function getLayerState<K extends EnvironmentalLayerId>(id: K): LayerState<LayerConfigMap[K]> {
  const layers = useLayersStore.getState().layers;
  const state: EnvLayerStates[EnvironmentalLayerId] = layers[id];
  // The mapped type guarantees `layers[id]` carries `LayerConfigMap[K]`; TS cannot correlate it.
  return state as LayerState<LayerConfigMap[K]>;
}
