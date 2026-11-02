# STATUS — environmental layers phase

## M001 note (architecture verified 2026-11-02, branch `feat/environmental-layers` from `refactor/engine-react-facade`)
1. (a) Facade additions (ADR-15), all optional on `EngineCommandFacade` (`src/types/engine.ts`, re-exported by `contract.ts`): `setLayerOpacity?(id, opacity)`, `setLayerData?(id, payload: LayerDataPayload)`, `clearLayerData?(id)`. Plus the `DataLayer extends ILayer` interface (`setOpacity`, `setData`, `clearData`). No `removeLayer`; `toggleLayer` already exists.
2. Implementation: 3 one-liners in `create-engine.ts` delegating to a new `LayerManager.getDataLayer(id)` (guard `"setData" in layer`).
3. (b) Radii: ozone 1.009 · fire heatmap 1.0095 · pollution points 1.011 (clouds 1.006, place outlines 1.014, atmosphere 1.045). renderOrder 2 (raster/heatmap), 3 (points); place outlines use 5.
4. Overlays re-parent under `EarthLayer.inner.group` in `init()` (same pattern as `PlaceLayer`), so they inherit Earth visibility/transform; rotation copied from `gmstRad` each frame (= `surface.rotation.y`).
5. (c) Confirmed: `LayerManager.update` skips layers with `visible === false` (`layer-manager.ts` `update()`), so hidden overlays cost nothing per frame.
6. `LayerManager.register` adds `object3d` to the scene; `addLayer` then calls `setVisible(spec.visible)`; overlays registered with `visible: false`.
7. Non-engine-init layers get `init(initCtx)` called by the loop over `created` in `create-engine.ts` (lines ~232–238) → overlays can re-parent there.
8. (d) `LayerUpdateContext` needs **no** new field: `gmstRad`, `sunDir` (night fade), `elapsedTime`/`dt` (fire pulse), `nearEarth` (hide when far) already exist. DPR comes from `setViewport(w,h,fov,pixelRatio)`; `reducedMotion` from `LayerFactoryContext`.
9. Dispose: engine `dispose()` → `layers.dispose()` → each layer `dispose()` once; overlays must also `removeFromParent()` (they live under the Earth group).
10. UI today: `HUD/LayerPanel.tsx` hard-coded options; `engine-store.layersVisible` (labels UI-only). `useUrlState` MANAGED_KEYS = view, focus, filter, speed, t, sat, night.
11. Precedent offscreen canvas: only `render/track.ts`. Overlays will not touch `document`.
12. ESLint boundary on `src/engine/**` forbids react/next/zustand/@/stores/@/components/@/hooks.
13. Tests: vitest node env, `src/**/*.test.ts`.
14. Commit trailer: `commit-template.md` says "Claude Fable 5.1"; the harness says the committing model is Opus 5.5 → using `Co-Authored-By: Claude Opus 5.5` (asked the user).
15. Open questions (§6) proceeding with defaults: non-commercial; deep links yes; OMI primary; Spanish-only.

## Gates
(see below, appended per wave)
