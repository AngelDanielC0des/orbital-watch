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

### Wave 0 — M001 ✅ (e701bd4)
Read-only verification; ADR-15 in docs/plan/PLAN.md §3. User authorised local commits for the phase (no push), accepted all §6 defaults, trailer = Opus 5.5.

### Wave 1 — M002 · M003 · M004 ✅ (4523529, 3cfb46a, 454bc80)
- Deviation: M002 types + result/validate/http written by Opus (blocking dependency of every other mission). Facade one-liners + `LayerManager.getDataLayer` pulled forward into M003.
- Gate: `tsc` clean · `eslint` 0 · `vitest` 110/110 · boundary grep → only pre-existing `render/sky.ts:199 fetch(stars.bin)` (frozen renderer, pre-dates this phase) and `render/track.ts:25 document.createElement`.

### Wave 2 — M005 · M006 · M007 · M008 ✅ (978fb37, 3204283, cd86123, f540a9c)
- Ozone: DescribeDomains newest = 2026-10-29 (OMI_TOMS). Pollution live dry run: 3 upstream calls, 441/441 points with pm2_5. FIRMS bench (real NOAA-20 24 h, 4.55 MB): 54 531 rows, 0 rejected, 6 070 cells, **160 ms, 72 MB RSS** (budget 1.5 s / 150 MB).
- Route smoke (dev): ozone `meta.dataDate` 2026-10-29; fires 24 h 200, `total` 110 909, 7 848 cells, 2 000 hotspots, 148 788 B raw / ~52 KB gzip; `window=bogus` → 400; pollution 441 points, 65 609 B raw / ~15 KB gzip; Open-Meteo upstream counter 3, unchanged on repeats; `mock=error` → 500 envelope.
- Decision: handlers read `request.url` → dynamic; no route `revalidate` (not valid for dynamic handlers in this Next version per route segment docs). Caching = `Cache-Control: public, s-maxage, stale-while-revalidate` + per-instance memo with in-flight dedupe (Data Cache rejects > 2 MB FIRMS bodies).
- `npm run check` green (lint + tsc + vitest + `next build --webpack`, only the known satellite.js warnings).

### Wave 3 — M009 · M010 ∥ M011 ✅ (f2fd7be, 3fb48c8, 8e75ae9) — Gate B
- `?layers=ozone,pollution,fires`: all three render, **0 console errors** (warnings = pre-existing satellite.js/metadataBase/Stripe).
- Alignment: fire hotspots on land in Brazil (Cerrado/Amazon) and western US; ozone swath gaps transparent (night-side Earth with city lights visible through them, day-side ocean on the other limb). Antarctic-hole close-up not captured yet (M021).
- Opus fix: per-layer dev flags (`?mockError=<id>` fails only that layer).

### Wave 4 — M012 · M013 · M014 · M015 · M016 ✅ (a703188, f955f5e, 0c34004, 78eaa23, d967c01)
- Snapshots 2026-11-02: pollution 63.9 KB, fires 120.1 KB (800 hotspots); `?mock=snapshot` → `meta.fallback: true`, `X-Orbital-Fallback: snapshot` on both routes.
- 390×844 (M015 worker, Playwright): closed sheet leaves the globe centre uncovered; half sheet top y=464 > centre y=422; full shows backdrop; Escape closes + refocuses trigger.
- Opus integration in LayerRow: shared `freshnessOf`, categorical legend names, de-duplicated labels.

### Wave 5 — M017 · M018 ✅ (ee024c0 + this STATUS)
Measured in dev, Chromium headless (software GL), tier `hi`, DPR 1, 1280×800:
| Metric | Without env layers | With ozone + pollution + fires | Budget |
|---|---|---|---|
| `renderer.info.render.calls` | 14 | 18 (**+4**) | ≤ +4 |
| `renderer.info.memory.textures` | 21 | 25 (ozone, fire grid, 2 LUTs) | — |
| `renderer.info.memory.geometries` | 14 | 18 | — |
| Points drawn | — | 441 pollution + 2 000 hotspots | ≤ 2 000 hi / 800 lo |
| HUD fps (software GL) | 26–28 | 28 | real GPU not measurable here |
| Ozone request | — | `size=4096` on `hi` (2048 on `lo` by service) | 4096 hi / 2048 lo |
| Idle DOM mutations in drawer + strip (5 s) | — | **0** | 0 React commits at frame rate |
- Fixed in M017: `LastUpdatedBadge` subscribed to `time.ms` (~4 Hz re-renders of 3 badges) → boolean selector; timeline-mismatch line only when not live; human source labels.
- Leak test, same engine (dev `?debug`): 5 cycles of clearData/setData on all three layers incl. buffer growth to 3 000 hotspots and 1 000 points + 10× visibility toggles → textures **25 → 25**, geometries **18 → 18**; clearData on all → textures 23 (= 21 base + 2 permanent LUTs); transferred ImageBitmaps closed (`width === 0`).
- StrictMode remount (dev mount → dispose → mount in one document), after forced GC: **1** live `WebGL2RenderingContext`, **15** `ImageBitmap` (same as a single production mount) → the disposed engine retains neither context nor bitmaps. First StrictMode requests are aborted (0 B), second set completes.
- **Correction / unverified:** an attempted 4× remount in the production build via `window.next.router.push('/sin-pagina')` turned out to be a full document reload (window marker lost; Next hard-navigates to the 404), so its numbers (heap 22.3 MB mounted / 2.5 MB after, 0 contexts) measure reloads, not SPA remounts. A true 4× in-document remount needs a second client route, which the app does not have; not added (out of scope). Mount/unmount within one document is covered by StrictMode only (1 cycle per load).
- Pre-existing (not this phase): in headless Playwright the sim drifts from "live" and `useUrlState` writes `t=` (rendering paused/throttled when the page is not focused).
