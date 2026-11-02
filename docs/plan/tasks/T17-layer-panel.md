# T17 — Layer toggles panel (Open/Closed showcase, new feature)
Tier: sonnet5-medium · Wave: 6 · Depends: T13

**Target**: new `src/components/sites/orbitalwatch/HUD/LayerPanel.tsx`; mounted inside `HUD/ViewControls.tsx` (a small "Capas" popover button at the end of the view segmented control).
**Change**: a popover listing toggleable layers with checkboxes: `satellites` ("Satélites"), `track` ("Órbita seguida"), `sky` ("Estrellas"), plus `labels` (UI-only: hides `LabelOverlay` via a store flag `layersVisible` — add `layersVisible: Record<string, boolean>` + `setLayerVisible(id, visible)` to the store; this is the one allowed store edit). Each toggle calls `handle.toggleLayer(id, visible)` and the store action; `LabelOverlay` reads `layersVisible.labels`. Popover closes on Escape/outside click; `aria-expanded`, `role="group" aria-label="Capas"`.
**Pattern**: `HUD/FilterBar.tsx` (segmented buttons, store selectors); shadcn `Popover` is allowed if already in `src/components/ui`, otherwise plain markup.
**Constraints**: no engine edits; ids come from `src/engine/layers/registry.ts` keys (do not hard-code others); earth is not toggleable.
**Ownership**: `HUD/LayerPanel.tsx`, `HUD/ViewControls.tsx`, `src/stores/engine-store.ts` (`layersVisible` only), `HUD/LabelOverlay.tsx` (read the flag only).
**Acceptance**: `npx tsc --noEmit`; `npx eslint src/components/sites/orbitalwatch src/stores`; unchecking "Satélites" hides them and the visible-count line keeps its value; re-checking restores; keyboard operable.
**HINTS**: `EngineCommandFacade.toggleLayer` in `src/types/engine.ts`; `LayerManager.setVisible` in `src/lib/engine/layer-manager.ts`.
**Pitfalls**: disposing layers instead of hiding; store whole-object selectors; forgetting `resetAll` compatibility (add the default to `initialUIState`).
