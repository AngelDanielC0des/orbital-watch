import { create } from "zustand";
import type { BodyDef, SatelliteFilter, ViewMode, SelectedSatelliteState } from "@/types/orbital";
import type { EngineUIState } from "@/types/engine";

export interface EngineStoreState extends EngineUIState {
  /** UI-side layer visibility by layer id (missing = visible). `labels` is UI-only (hides LabelOverlay). */
  layersVisible: Record<string, boolean>;
  setLayerVisible: (id: string, visible: boolean) => void;
  // Actions to mutate UI state from engine events or user interactions
  setView: (view: ViewMode) => void;
  setFocusBody: (focus: string) => void;
  setIsBusy: (isBusy: boolean) => void;
  setFilter: (filter: SatelliteFilter) => void;
  setNightMode: (active: boolean) => void;
  setFps: (fps: number) => void;
  setVisibleCount: (count: number) => void;
  setCatalogSource: (source: string, isSynthetic: boolean) => void;
  setLoadingProgress: (ratio: number, text?: string) => void;
  setLoadingDone: () => void;
  setLoadingError: (error: string) => void;
  setTimeState: (time: Partial<EngineUIState["time"]>) => void;
  setSelectedSatellite: (satellite: SelectedSatelliteState | null) => void;
  setSelectedBody: (body: BodyDef | null) => void;
  setBodyDistance: (distance: EngineUIState["bodyDistance"]) => void;
  setHint: (hint: string) => void;
  dismissHint: () => void;
  setEngineError: (error: EngineUIState["engineError"]) => void;
  resetAll: () => void;
}

const initialUIState: EngineUIState & { layersVisible: Record<string, boolean> } = {
  layersVisible: {},
  view: "earth",
  focusBody: "earth",
  isBusy: false,
  filter: "all",
  nightMode: false,
  fps: 0,
  visibleCount: 0,
  catalogSource: "catálogo sintético",
  isSynthetic: true,
  loading: {
    ratio: 0,
    text: "Cargando texturas de la Tierra…",
    isDone: false,
    error: null,
  },
  time: {
    ms: Date.now(),
    speed: 1,
    playing: true,
    offsetMs: 0,
    isLive: true,
    clockUtc: "—",
    clockRel: "en vivo",
    daysOffset: 0,
  },
  selectedSatellite: null,
  selectedBody: null,
  bodyDistance: null,
  hint: "Arrastra para rotar · rueda o pellizco para zoom · toca un objeto para seguir su órbita",
  isHintDismissed: false,
  engineError: null,
};

export const useEngineStore = create<EngineStoreState>((set) => ({
  ...initialUIState,

  setLayerVisible: (id, visible) => set((state) => ({ layersVisible: { ...state.layersVisible, [id]: visible } })),
  setView: (view) => set({ view }),
  setFocusBody: (focusBody) => set({ focusBody }),
  setIsBusy: (isBusy) => set({ isBusy }),
  setFilter: (filter) => set({ filter }),
  setNightMode: (nightMode) => set({ nightMode }),
  setFps: (fps) => set({ fps }),
  setVisibleCount: (visibleCount) => set({ visibleCount }),
  setCatalogSource: (catalogSource, isSynthetic) => set({ catalogSource, isSynthetic }),

  setLoadingProgress: (ratio, text) =>
    set((state) => ({
      loading: {
        ...state.loading,
        ratio: Math.max(0, Math.min(1, ratio)),
        text: text ?? state.loading.text,
      },
    })),

  setLoadingDone: () =>
    set((state) => ({
      loading: {
        ...state.loading,
        ratio: 1,
        isDone: true,
      },
    })),

  setLoadingError: (error) =>
    set((state) => ({
      loading: {
        ...state.loading,
        error,
      },
    })),

  setTimeState: (timeUpdate) =>
    set((state) => ({
      time: {
        ...state.time,
        ...timeUpdate,
      },
    })),

  setSelectedSatellite: (selectedSatellite) => set({ selectedSatellite }),

  setSelectedBody: (selectedBody) => set({ selectedBody }),
  setBodyDistance: (bodyDistance) => set({ bodyDistance }),
  setHint: (hint) => set({ hint }),
  dismissHint: () => set({ isHintDismissed: true }),

  setEngineError: (engineError) => set({ engineError }),
  resetAll: () => set(initialUIState),
}));
