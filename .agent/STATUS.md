# STATUS — environmental layers phase

## M001 note (architecture verified 2026-11-02, branch `feat/environmental-layers` from `refactor/engine-react-facade`)
1. (a) Facade additions (ADR-15), all optional on `EngineCommandFacade` (`src/types/engine.ts`, re-exported by `contract.ts`): `setLayerOpacity?(id, opacity)`, `setLayerData?(id, payload: LayerDataPayload)`, `clearLayerData?(id)`. Plus the `DataLayer extends ILayer` interface (`setOpacity`, `setData`, `clearData`). No `removeLayer`; `toggleLayer` already exists.
2. Implementation: 3 one-liners in `create-engine.ts` delegating to a new `LayerManager.getDataLayer(id)` (guard `"setData" in layer`).
3. (b) Radii: ozone 1.009 · fire heatmap 1.0095 · pollution points 1.011 (clouds 1.006, place outlines 1.014, atmosphere 1.045). renderOrder as built: ozone 2, fire grid 3, pollution points + fire hotspots 4; place outlines 5.
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

### Wave 6 — M019 · M020 ✅ (cbd74f4, f3d03c0)
- vitest 215/215 (21 at phase start → 215). `npm run check` green after M020.

### Wave 7 — M021 final QA (2026-11-02)
Fixes found during QA (in the M021 commit):
- `orbitalwatch.css:6` unlayered `*{margin:0;padding:0}` beat Tailwind's layered utilities → drawer/strip had no padding. Reset kept for the rest of the HUD (pixel-perfect header untouched) and scoped out of `[data-layers-ui]` via `:where()` (specificity 0).
- Legend strip lifted above the desktop hint line; `RasterOverlayLayer` radius is now a constructor argument (a second raster needs no engine change); catalog ozone product label human-readable.

Checklist (✅ verified · ⚠ partial · ⛔ unverifiable here):
1. Code — ✅ lint/typecheck/test/build (`npm run check`, only known satellite.js + metadataBase warnings) · ✅ boundary grep (only pre-existing `render/sky.ts` fetch, `render/track.ts` canvas) · ✅ no `any`/`@ts-ignore`/`as unknown as` in changed files · ✅ contract: +2 type re-export lines vs branch base 5c64bee (`contract.ts` does not exist on `master`; it was created by the unmerged refactor branch) · ✅ frozen renderers untouched (render/ only gains lut.ts, lut.test.ts, overlay-shaders.ts).
2. Functional — ✅ toggle spam 10× in 2 s → 0 new requests, layer ends on with data · ✅ opacity 40 % persists across off/on (engine 0.4) · ⚠ 8 pollutants switch colours/legend/URL; 1 request observed during the switches, attributed to the initial pollution load completing (not conclusively separated) · ⛔ 7 d window not fetched live (29 MB × 2; covered by memo unit test) · ✅ legend strip follows last enabled layer, dismissible · ✅ source + last-updated badges in every row · ✅ `?mockError=fires` → card "No se pudo cargar NASA FIRMS (incendios)…" + red dot (`layers-error-desktop.webp`) · ⚠ empty state: unit-tested paths only · ✅ demo: `?mock=snapshot` → "Demo" chips (`layers-demo-desktop.webp`); ⛔ DevTools-offline run not done (client snapshot fallback unit-tested) · ✅ deep link `?layers=ozone,pollution,fires&pollutant=no2&fires=48h` restores and URL keeps updating · ✅ refresh disabled while loading and for 60 s (code) · ✅ section disabled in solar view, re-enabled in Earth view.
3. Data — ✅ ozone legend DU 100–500 with 220 marker; route `meta.dataDate` 2026-10-29 = image TIME · ✅ "O₃ superficie" µg/m³ (unit test) · ✅ fires 24 h total 110 909, ranges validated in parser · ✅ attribution from `attribution.ts` (GIBS wording verbatim) · ✅ UTC labels · ✅ ozone chain TOMS→DOAS→OMPS→snapshot (unit tests) · ✅ Open-Meteo upstream calls 3 per memo window (≤ 4/h).
4. Visual — ✅ `layers-desktop.webp` (1280×800) · ✅ `layers-tablet-820.webp` (side-anchored ≥ 860 only; 820 gets the sheet) · ✅ `layers-mobile-390.webp` + `-expanded` (globe centre = canvas in both) · ✅ per-layer shots (`layers-ozone-desktop`, `layers-pollution-desktop` EAQI, `layers-fires-desktop`, `layers-ozone-antarctica`) · ⛔ formal contrast measurement and night-mode (`N`) screenshot not taken.
5. 3D — ✅ 0 console errors with all layers · ✅ same-engine leak test + StrictMode remount (see wave 5); ⚠ 4× production remount not possible without a second route · ✅ Antarctic low-ozone region centred on Antarctica; fires on land (Brazil, western US) · ⛔ grazing-angle z-fight inspection and ×1000 scrub rotation not screenshotted (rotation = gmst each frame, same as Earth).
6. Performance — ✅ +4 draw calls · ✅ 2 000 hotspots on hi (800 cap on lo by service) · ✅ ozone 4096 on hi · ✅ slider engine-on-input, store debounced 150 ms · ✅ toggle spam de-duplicated · ✅ hidden tab: timers mark reload due and wait for `visibilitychange` (code review; not observed) · ⛔ fps on real GPU / mobile lo (headless software GL: 26–28 fps with or without layers) · ✅ payloads: ozone JSON < 1 KB; pollution ~15 KB gzip; fires 24 h ~52 KB gzip.

Open items: real-GPU fps on desktop/mobile; offline DevTools run; 7 d live fetch on Vercel (maxDuration 60); NOAA-21/OMPS-NOAA ozone switch when GIBS publishes it; WAQI stays rejected.

### Deploy (2026-11-02, user-authorised push + production)
- Pushed `feat/environmental-layers` to origin. Preview 1 (`orbital-watch-m6na55xur…`) exposed a Vercel-only bug: fires `total` 54 670 = NOAA-20 rows only while NOAA-21 was listed in `sources` (the second CSV body came back empty). Fixed in two commits: `cache: "no-store"` + empty-body guard (made the failure honest), then sequential download/parse per sensor with its own timeout (fixed it). Preview 3 (`orbital-watch-1mxn0xu2v…`): total 111 188, sources NOAA-20 + NOAA-21.
- Production `vercel deploy --prod` → https://orbital-watch-sable.vercel.app (deployment `orbital-watch-1k7c4bf05…`). Checked with Playwright: `/orbitalwatch?layers=ozone,pollution,fires` 0 console errors, drawer dates 29 oct (ozone) / 2 nov 13:00 UTC (CAMS) / 2 nov 11:12 UTC (FIRMS), fires total 116 452; fires 24 h 53 KB gzip at the CDN. Evidence `docs/design-references/layers-vercel-prod.webp`. Rollback: `vercel rollback`.
- Vercel returns `Cache-Control: public` to clients (it consumes `s-maxage` at the edge) — expected.

### HUD modes «Incendios» / «Atmósfera» (2026-11-02, user request) — commit 1e0be78, deployed to production
- Production check (https://orbital-watch-sable.vercel.app/orbitalwatch, deployment `orbital-watch-23w8knoca…`): start = orbit mode, no card; Incendios → card "Modo incendios", data 2 nov 13:05 UTC; Atmósfera → air quality, 2 nov 13:00 UTC; Ozono → 29 oct 2026 UTC (4096 px image takes a few seconds); Todo → back to satellites, card gone; 0 console errors. Evidence `docs/design-references/mode-*-vercel-prod.webp`.

## Plan v2 (2026-11-03) — interactividad, rediseño y bugs — executed (`.agent/plan-v2-interaccion-y-rediseno.md`)
Commits: ff6f6cd N1 · 79d6b39 N2 · 72439f1 N3 · eb06225 N4 · bd07d75 N5 · c0d4d9c N6 · 64b1a2a N7+N8 · b8ecfb9 N10 docs. Production: https://orbital-watch-sable.vercel.app (deployment `orbital-watch-46ldgholt…`).
- N1 labels: hovered label drift **0 px** over 2 s (Júpiter/Urano in solar, «Brazo de Sagitario» in galaxy; prod Urano 0 px).
- N2 Previstos: 0 → **6 406** objects at «ahora» (dimmed, planned orbit) in dev and prod.
- N3 theme: `#2f7dff`, hairlines, glass; engine accents in `src/engine/theme.ts` (hover ring, track + reticle, place outline).
- N4/N6 picking: hover grows the point + ring + tooltip; click opens the card (pollution, fire point, fire cell, ozone surface). Examples: «El Cairo · PM2.5 43 µg/m³ · Mala»; Faisalabad (Pakistán) ×8,6 OMS; fire 486 MW Tanzania NOAA-21; ozone 271 DU Normal (Libia). `pt=` deep link restores the card in ~2 s. 0 console errors.
- N9 numbers (dev, headless software GL, tier hi): draw calls orbit 14 · fires 9 · pollution 8 · ozone 8 (satellites hidden in modes); textures 21 → 25, geometries 14 → 18 and **stable after 5 mode/pick cycles**; 26–28 fps.
- Tests 246/246; `npm run check` green.
- Environment note: at one point the headless browser throttled every page (prod too) to 4 fps and the solar warp stayed on; `bringToFront()` restored 28 fps and the transition finishes in 3–4 s. Not a regression (identical on the previous production build).
- Unverified: real-GPU/mobile-device fps; touch behaviour on a physical phone; `placeAt` coverage for small islands (110m polygons).
