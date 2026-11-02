# Missions — execution plan for Opus 5.5 (effort medium)

Conventions: one mission = one commit (template in `commit-template.md`). Worker model per `delegation-policy.md`. Each mission lists files it may touch (**Ownership**); anything else requires an `ask`. Per-mission gate: `npx tsc --noEmit` + `npx eslint <files>` + boundary grep `rg -n "from \"(react|react-dom|zustand|@/stores|@/components|@/hooks)|fetch\(|getElementById|querySelector" src/engine/` → only the pre-existing `document.createElement` in `render/track.ts` and the new `document.createElement("canvas")`-free code (overlay layers must not touch `document`). Wave gates run `npm run check`.

| Wave | Missions (parallel inside a wave) | Gate |
|---|---|---|
| 0 | M001 | A (`tsc`, `eslint`, grep) |
| 1 | M002 · M003 · M004 | A + `npm run check` |
| 2 | M005 · M006 · M007 (pure services + server helpers) · M008 (routes) | A + route smoke (`curl localhost:3000/api/orbital/*`) |
| 3 | M009 · M010 (engine renderers, Opus) ∥ M011 · M012 · M013 · M014 (UI, Sonnet) | B (`npm run dev`, layers visible, 0 console errors) |
| 4 | M015 · M016 | B + 390 px |
| 5 | M017 · M018 | leak test |
| 6 | M019 · M020 | `npm run check` |
| 7 | M021 | final |

---

## M001 — Verify the existing layer architecture
- **Objective**: confirm the facts in `development-plan.md §0` against the code, decide the exact additive contract fields, and record ADR-15 in `docs/plan/PLAN.md §3`.
- **Dependencies**: none.
- **Probable files**: read `src/engine/contract.ts`, `src/types/engine.ts`, `src/engine/layers/registry.ts`, `src/engine/layers/earth-layer.ts`, `src/engine/layers/place-layer.ts` (head), `src/engine/create-engine.ts` (`addLayer`, `requireLayer`, `frame()`, `dispose()`, `toggleLayer`), `src/lib/engine/layer-manager.ts`, `src/hooks/useUrlState.ts`, `src/components/sites/orbitalwatch/HUD/LayerPanel.tsx`; write `docs/plan/PLAN.md` (ADR-15 line only).
- **Risks**: over-reading the 1 250-line engine; proposing a non-additive contract change.
- **Agent**: **Opus**.
- **Done when**: a 15-line note at the top of `.agent/STATUS.md` lists (a) the three facade methods to add, (b) overlay radii chosen, (c) confirmation that `LayerManager.update` skips invisible layers, (d) whether `LayerUpdateContext` needs any new optional field (expected: none).
- **Verification**: none beyond the note; no code changes.
- **Commit**: `docs(layers): ADR-15 environmental layers contract additions`.

## M002 — Base layer types
- **Objective**: create `src/types/layers.ts` from the sketch in `development-plan.md §4.2`, and add the optional `DataLayer` interface + facade members to `src/types/engine.ts` / `src/engine/contract.ts` (additive, optional).
- **Dependencies**: M001.
- **Files**: `src/types/layers.ts` (new), `src/types/engine.ts` (append `DataLayer`, optional `setLayerOpacity/setLayerData/clearLayerData` on `EngineCommandFacade`), `src/engine/contract.ts` (re-export types only).
- **Risks**: `any`; circular imports (`types/layers.ts` must import only from `three` types and `@/engine/config`).
- **Agent**: **Sonnet** (types from a written sketch) with Opus reviewing the contract diff.
- **Done when**: `npx tsc --noEmit` passes; no `any`; TSDoc on every exported type.
- **Verification**: `rg -n "any\b" src/types/layers.ts` → 0.
- **Commit**: `feat(types): layer metadata, state, payload and DataProvider contracts`.

## M003 — Layer catalog and engine registry entries
- **Objective**: `src/lib/layers/catalog.ts` (`LAYER_CATALOG` with metadata for ozone/pollution/fires + the four existing toggles), `src/lib/layers/attribution.ts`; register `ozone`, `pollution`, `fires` factories in `src/engine/layers/registry.ts` pointing at **stub** layers (empty `Group`, `setData` no-op) so the shell boots before renderers exist; add them to `DEFAULT_LAYERS` with `visible: false`.
- **Dependencies**: M002.
- **Files**: `src/lib/layers/catalog.ts`, `src/lib/layers/attribution.ts`, `src/engine/layers/registry.ts`, `src/engine/layers/raster-overlay-layer.ts` / `points-overlay-layer.ts` / `heatmap-layer.ts` (stubs only, class skeletons with TODO-free bodies).
- **Risks**: breaking boot order (keep new ids after `hover`); forgetting `visible: false`.
- **Agent**: Sonnet for catalog/attribution; **Opus** for registry + stubs (10 lines each).
- **Done when**: app boots unchanged; `LAYER_CATALOG` keys === new `LayerId` union (type-level check `satisfies Record<LayerId, LayerMetadata>`).
- **Verification**: `npm run dev`, `/orbitalwatch` renders, 0 console errors.
- **Commit**: `feat(layers): catalog, attribution and registered stub layers`.

## M004 — DataProvider contract and shared service utilities
- **Objective**: `result.ts`, `validate.ts`, `geo-cache.service.ts`, `providers.ts` (empty map typed), hook skeletons `useLayerData.ts` and `useEnvironmentalLayers.ts` with the state machine (idle → loading → ready|empty|error, backoff, abort, refresh timer, pause on hidden tab), and `src/stores/layers-store.ts`.
- **Dependencies**: M002.
- **Files**: `src/lib/layers/{result,validate,geo-cache.service,providers}.ts`, `src/hooks/{useLayerData,useEnvironmentalLayers}.ts`, `src/stores/layers-store.ts`, tests `src/lib/layers/geo-cache.service.test.ts`, `src/stores/layers-store.test.ts`.
- **Risks**: store written per frame (forbidden); forgetting `AbortController` on unmount; timers surviving StrictMode remount.
- **Agent**: **Opus** for the hook state machine; Sonnet for `result/validate/geo-cache` + tests.
- **Done when**: vitest green for cache TTL/eviction and store actions; hook compiles with providers map empty.
- **Verification**: `npx vitest run src/lib/layers src/stores`.
- **Commit**: `feat(layers): DataProvider contract, cache, store and data hooks`.

## M005 — Ozone service
- **Objective**: `src/lib/server/gibs.ts` (describeDomains → newest date; wmsUrl; headSize) and `src/lib/layers/ozone/ozone.service.ts` (client: GET `/api/orbital/ozone` → validate → fetch image from allow-listed host → `createImageBitmap({ imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" })` → payload), `legend-ozone.ts` generated by `scripts/gen-legend.mjs` from `public/sites/orbitalwatch/data/colormap-OMI_Ozone_TOMS_Total_Column.xml`.
- **Dependencies**: M004.
- **Files**: as listed + `src/lib/server/gibs.test.ts` (DescribeDomains parser with the fixture string from `api-research.md`).
- **Risks**: BBOX axis order (lat first in WMS 1.3.0); empty PNG treated as data (check byte size > 5 000 and, client-side, alpha coverage > 1 %); Safari `createImageBitmap` quirks (fallback to `HTMLImageElement` like `Earth.loadTexture`).
- **Agent**: Sonnet (contract fully specified) with Opus review of the fallback chain.
- **Done when**: `node -e` smoke prints the resolved date for `OMI_Ozone_TOMS_Total_Column`; unit tests green.
- **Commit**: `feat(ozone): GIBS date resolver and ozone data service`.

## M006 — Pollution service
- **Objective**: `sample-points.ts` (≈280 cities with name/country/lat/lon + ≈150 grid points, generated by a Sonnet from a public cities list, deduplicated, sorted by population), `src/lib/server/open-meteo.ts` (batch ≤150 coords, normalise, validate ranges, null-safe), `pollutant-scales.ts` (units, breakpoints, labels, LUT stops), `pollution.service.ts`.
- **Dependencies**: M004.
- **Files**: as listed + `src/lib/server/open-meteo.test.ts` (fixture: the two-location JSON captured in `api-research.md §4`).
- **Risks**: URL > 8 KB (cap batch at 150); `ozone` confusion with DU (label it "O₃ superficie µg/m³"); Open-Meteo returns `null` for missing values.
- **Agent**: Sonnet.
- **Done when**: tests green; a dry run against the live API returns ≥ 400 valid points.
- **Commit**: `feat(pollution): sample points, Open-Meteo normaliser and service`.

## M007 — Fires service
- **Objective**: `src/lib/server/firms.ts` streaming CSV parser (header-driven column mapping, tolerant to column order, rejects rows with NaN/out-of-range lat/lon/frp), binner (0.5° grid, counts + FRP, log-scaled uint8 export) and top-N hotspot selection; `fires-scale.ts`; `fires.service.ts` (client).
- **Dependencies**: M004.
- **Files**: as listed + `src/lib/server/firms.test.ts` (fixture: the 3 CSV lines in `api-research.md §3` + malformed lines).
- **Risks**: loading 29 MB into memory (stream with `TextDecoderStream` and line splitting); timezone of `acq_date/acq_time` (UTC); duplicate detections across NOAA-20/21 (accepted, they are different overpasses).
- **Agent**: Sonnet for parser/binner with tests; **Opus** reviews memory behaviour.
- **Done when**: parsing the real 24 h file in a Node script takes < 1.5 s and < 150 MB RSS.
- **Commit**: `feat(fires): FIRMS CSV streaming parser, binning and service`.

## M008 — Route Handlers (proxy/cache)
- **Objective**: `src/app/api/orbital/{ozone,pollution,fires}/route.ts` with `export const revalidate`, allow-listed params, uniform JSON envelope `{ ok, data | error, meta: { source, dataDate, fetchedAt, fallback } }`, `Cache-Control` headers, snapshot fallback.
- **Dependencies**: M005, M006, M007.
- **Files**: the three routes; `.env.example` (comment block for optional future keys).
- **Risks**: Next 16 route conventions (read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` first); `revalidate` ignored when the handler reads `request.url` dynamically (read `searchParams` from `new URL(request.url)` only; keep `dynamic` default); Vercel function timeout on the 29 MB file (set `export const maxDuration = 60` on the fires route).
- **Agent**: Sonnet (contract is exact) + Opus smoke.
- **Done when**: `curl -s localhost:3000/api/orbital/ozone | jq .meta` shows a real date; `…/fires?window=24h` returns `total > 1000`; `…/fires?window=bogus` returns 400.
- **Commit**: `feat(api): orbital ozone, pollution and fires route handlers with ISR cache`.

## M009 — Raster/tile overlay renderer (engine)
- **Objective**: replace the `RasterOverlayLayer` stub: textured sphere r=1.009, `overlay-shaders.ts`, `lut.ts`, `setOpacity`, `setData(raster)`, `clearData`, `update` (rotation = gmst), full `dispose`. Used by ozone (and later satellite NO2/AOD/fire raster fallback via `LAYER_CATALOG` product field).
- **Dependencies**: M003.
- **Files**: `src/engine/layers/raster-overlay-layer.ts`, `src/engine/render/overlay-shaders.ts`, `src/engine/render/lut.ts`, `src/engine/create-engine.ts` (facade one-liners), `src/lib/engine/layer-manager.ts` (`getDataLayer`).
- **Risks**: z-fighting with clouds (radius ≥ 1.009), texture upside-down/mirrored (test with a labelled test image), colour space wrong (sRGB), forgetting `depthWrite=false`, night side hiding the overlay (uNightFade).
- **Agent**: **Opus**.
- **Done when**: a dev-only `?layers=ozone` shows the snapshot PNG aligned with coastlines (Antarctic ozone hole centred on Antarctica), opacity slider changes alpha live, toggling off/on costs no new texture upload.
- **Verification**: screenshot `docs/design-references/layers-ozone-desktop.webp`; `renderer.info.memory.textures` returns to baseline after toggle off + `clearData`.
- **Commit**: `feat(engine): raster overlay layer with LUT and opacity for ozone`.

## M010 — Points and heatmap renderers (engine)
- **Objective**: `PointsOverlayLayer` (pollution, `Points` + shader, LUT by value) and `HeatmapLayer` (fires: `DataTexture` overlay reusing the raster material path + hotspot `Points` with pulse uniform; `reducedMotion` disables pulse).
- **Dependencies**: M009.
- **Files**: `src/engine/layers/points-overlay-layer.ts`, `src/engine/layers/heatmap-layer.ts`, `src/engine/render/overlay-shaders.ts` (append).
- **Risks**: point size on DPR (use `pixelRatio` from `setViewport`); sorting/`frustumCulled`; bounding sphere NaN (preset like `satellites-layer.ts`); re-creating geometry per payload (reuse buffers, grow only).
- **Agent**: **Opus**.
- **Done when**: both layers render the snapshot JSON; ≤ 4 added draw calls total (`renderer.info.render.calls` delta); 60 fps on tier `hi` desktop, ≥ 30 fps on `lo` mobile emulation.
- **Commit**: `feat(engine): points overlay (air quality) and fire heatmap layers`.

## M011 — Layer UI controls
- **Objective**: `LayersDrawer`, `LayerRow`, `LayerToggle`, `LayerOpacitySlider`, `PollutantSelector`, `FireWindowSelector`; mount in `ViewControls` replacing `LayerPanel` (keep the `labels` and orbit toggles); wire to `layers-store` and `useEnvironmentalLayers`; deep links `layers=`, `pollutant=`, `fires=` in `useUrlState` via `src/lib/layers/url-state.ts`.
- **Dependencies**: M004 (store/hooks), M003 (catalog). Can start before M009 using stubs.
- **Files**: `src/components/sites/orbitalwatch/HUD/layers/*` (new), `HUD/ViewControls.tsx`, `HUD/LayerPanel.tsx` (delete or reduce to the orbit section), `src/hooks/useUrlState.ts`, `src/lib/layers/url-state.ts`, `OrbitalWatch.tsx` (mount hook + drawer only).
- **Risks**: whole-store selectors causing re-renders; slider writing the store on every `input` event (write engine on input, store debounced on change); focus trap missing.
- **Agent**: Sonnet (spec in `ux-design.md`), Opus reviews wiring in `OrbitalWatch.tsx`.
- **Done when**: toggling a layer changes `layers-store` and calls `handle.toggleLayer`; opacity reaches the engine; keyboard operable; `?layers=ozone,fires&fires=48h` restores state.
- **Commit**: `feat(ui): layers drawer with toggles, opacity, pollutant and window selectors`.

## M012 — Legends
- **Objective**: `LayerLegend` (gradient from scale stops, ticks, categorical swatches) and `ActiveLegendStrip`; scale modules are the single source of truth.
- **Dependencies**: M005–M007 (scales), M011.
- **Files**: `HUD/layers/LayerLegend.tsx`, `HUD/layers/ActiveLegendStrip.tsx`, `orbitalwatch.css` (strip positioning only).
- **Risks**: legend colours diverging from the LUT (import the same stops); overlapping the timeline (use the inset).
- **Agent**: Sonnet.
- **Done when**: legends render for the three layers and all 8 pollutants; strip never overlaps the timeline at 1280 px and 390 px.
- **Commit**: `feat(ui): dynamic legends and active legend strip`.

## M013 — Loading / error / empty states
- **Objective**: `LayerLoadingState`, `LayerErrorCard`, `LayerEmptyState`; integrate with `LayerRow`; copy from `ux-design.md §3`.
- **Dependencies**: M011.
- **Files**: the three components, `LayerRow.tsx`.
- **Risks**: showing raw errors; hiding last good data on error (must keep it).
- **Agent**: Sonnet.
- **Done when**: forcing `/api/orbital/fires` to 500 (dev flag `?mockError=fires`) shows the card and keeps previous data; empty window shows the empty state.
- **Commit**: `feat(ui): layer loading, error and empty states`.

## M014 — Attribution and last-updated
- **Objective**: `DataSourceBadge`, `LastUpdatedBadge` (absolute UTC via `Intl.DateTimeFormat("es-ES", { timeZone: "UTC" })` + relative), `AttributionFooter`, README section "Fuentes de datos", freshness dot logic, timeline-mismatch warning line.
- **Dependencies**: M011.
- **Files**: `HUD/layers/{DataSourceBadge,LastUpdatedBadge,AttributionFooter}.tsx`, `README.md`.
- **Risks**: local timezone leaking (always UTC with label); forgetting the GIBS acknowledgement wording.
- **Agent**: Sonnet.
- **Done when**: every layer row shows source + date; footer shows the three attributions and licences.
- **Commit**: `feat(ui): data source, last-updated badges and attribution footer`.

## M015 — Responsive drawer and collapse
- **Objective**: bottom-sheet behaviour < 860 px with collapsed chip, snap points, drag handle, hide strip when expanded; drawer disabled state outside Earth view.
- **Dependencies**: M011–M014.
- **Files**: `HUD/layers/LayersDrawer.tsx`, `orbitalwatch.css`.
- **Risks**: blocking globe gestures with an invisible backdrop; `100vh` on mobile (use `dvh`).
- **Agent**: Sonnet, Opus visual check.
- **Done when**: 390 px screenshot shows the globe centre uncovered with the sheet collapsed; expanded sheet scrolls; Escape/backdrop closes.
- **Commit**: `feat(ui): responsive layers sheet and collapse`.

## M016 — Fallback / demo data
- **Objective**: `scripts/snapshot-layers.mjs` (writes `public/sites/orbitalwatch/data/pollution-snapshot-<date>.json` and `fires-snapshot-<date>.json` using the server helpers), manifest `public/sites/orbitalwatch/data/snapshots.json` consumed by the routes and services; "Demo" chip wiring; `?mock=snapshot` dev flag forcing fallback.
- **Dependencies**: M008.
- **Files**: `scripts/snapshot-layers.mjs`, `public/sites/orbitalwatch/data/*`, routes (fallback branch), services (`isFallback`).
- **Risks**: repo weight (keep snapshots < 400 KB each, gzip-friendly; fires snapshot = binned grid + 800 hotspots).
- **Agent**: Sonnet.
- **Done when**: with network blocked (DevTools offline after first load) every layer still renders the snapshot with the grey dot and "Demo".
- **Commit**: `feat(layers): versioned demo snapshots and fallback chain`.

## M017 — Performance pass
- **Objective**: measure and enforce the budget in `development-plan.md §4.5`: draw calls, texture sizes per tier, hotspot caps, slider debounce, no React commits at frame rate (React Profiler), no duplicate requests when toggling quickly (abort + cache), `lo` tier settings on mobile.
- **Dependencies**: M009–M016.
- **Files**: engine layers, hooks (tuning only).
- **Risks**: premature optimisation; changing GLSL of frozen renderers (forbidden).
- **Agent**: **Opus**.
- **Done when**: numbers recorded in `.agent/STATUS.md` (fps hi/lo, draw calls, memory, request counts).
- **Commit**: `perf(layers): tier budgets, debounce and request de-duplication`.

## M018 — Dispose and resource cleanup
- **Objective**: leak test: mount/unmount ×4 with all layers on; `renderer.info.memory` (geometries/textures) and heap return to baseline; `ImageBitmap.close()` on cache eviction; `AbortController` on unmount; timers cleared; StrictMode double mount clean.
- **Dependencies**: M017.
- **Files**: engine layers, `geo-cache.service.ts`, hooks.
- **Risks**: textures held by the cache after engine disposal (cache must drop payload references on `resetAll`).
- **Agent**: **Opus**.
- **Done when**: two `take_heapsnapshot` diffs on a production build show no growth of `Texture`/`ImageBitmap`/`Float32Array` counts across remounts; `renderer.info.memory.textures` baseline restored.
- **Commit**: `fix(layers): deterministic disposal of textures, bitmaps, timers and fetches`.

## M019 — Tests
- **Objective**: vitest for pure modules: `gibs.ts` (DescribeDomains parsing, date pick), `firms.ts` (parser, binner, hotspots), `open-meteo.ts` (normaliser), `pollutant-scales.ts` (breakpoint → colour), `url-state.ts`, `layers-store.ts`, `geo-cache.service.ts`; a route test invoking the handler functions with mocked `fetch`.
- **Dependencies**: M005–M008, M011.
- **Files**: `src/**/*.test.ts`.
- **Risks**: tests hitting the network (mock `fetch`); DOM-dependent code in node tests (keep services DOM-free except `createImageBitmap` behind an injectable decoder).
- **Agent**: Sonnet.
- **Done when**: `npm run test` green, ≥ 25 new assertions, no network.
- **Commit**: `test(layers): services, parsers, scales, store and url state`.

## M020 — Documentation
- **Objective**: `docs/layers/README.md` (architecture diagram, how to add a fourth layer in 5 steps, data sources, licences, refresh policy, deep-link params), update `docs/STATUS.md §5.C`, `README.md` "Fuentes de datos", `CHANGELOG.md` entry, `.env.example` comments.
- **Dependencies**: M011–M016.
- **Files**: docs only.
- **Agent**: Sonnet.
- **Done when**: a new reader can add a "lightning" raster layer following the 5 steps without touching the engine loop.
- **Commit**: `docs(layers): architecture, data sources and how to add a layer`.

## M021 — Final QA and handoff
- **Objective**: run `verification-checklist.md` end to end; screenshots to `docs/design-references/layers-*.webp` (desktop, 390 px, each layer, error state, demo state); `npm run check` green; `git status` clean; `.agent/STATUS.md` final report (what was verified, what was not, open questions).
- **Dependencies**: all.
- **Agent**: **Opus**.
- **Done when**: every checklist line is ticked or explicitly marked "unverifiable" with a reason.
- **Commit**: `chore(layers): QA evidence and status for environmental layers`.
