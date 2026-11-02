# OrbitalWatch — environmental layers phase (complement to the repo `AGENTS.md`)

This file complements, never replaces, `AGENTS.md` (Next.js version notice, stack, commands, code style). Read both.

## Phase goal
Ozone column, surface air quality and active fires as plugin layers over the existing engine, with services + Route Handlers for data, a layers drawer with legends/attribution/freshness, fallbacks, tests and docs. Full plan in `.agent/`.

## Architecture rules for this phase
- **Boundary**: `src/engine/**` imports nothing from React, zustand, `@/stores`, `@/components`, `@/hooks`; no `fetch`, no DOM lookups. Enforced by `eslint.config.mjs` and the gate grep.
- **Data path**: Route Handler (`src/app/api/orbital/*`) or NASA CDN → `src/lib/layers/*/…service.ts` (pure, validated, `Result`) → `src/hooks/useLayerData.ts` (abort, timers, backoff) → `src/stores/layers-store.ts` (UI state) + `EngineHandle.setLayerData` (engine). The engine only receives decoded payloads (`ImageBitmap`, typed arrays).
- **Contract**: `src/engine/contract.ts` is frozen (K1); ADR-15 adds only optional `setLayerOpacity`, `setLayerData`, `clearLayerData` and the `DataLayer` interface.
- **Frozen renderers**: `src/engine/render/*` existing files are untouched; new `overlay-shaders.ts`, `lut.ts` are allowed.
- **Layers**: one file per layer in `src/engine/layers/`, registered in `registry.ts`, listed in `DEFAULT_LAYERS` with `visible: false`, described in `src/lib/layers/catalog.ts`. Radii: ozone 1.009, fire heatmap 1.0095, pollution points 1.011 (clouds 1.006, places 1.014). Overlays rotate with `gmstRad` each frame.
- **Memory**: every texture/geometry/material/`ImageBitmap`/timer/fetch has an owner; `dispose()` idempotent; StrictMode-safe. Leak test is part of Done.
- **Performance budget**: ≤ 4 added draw calls; hotspots ≤ 2 000 (`hi`) / 800 (`lo`); ozone 2048 (`lo`) / 4096 (`hi`); zero React commits at frame rate.
- **Security**: no keys in the client; routes validate params with allow-lists; payloads validated; image hosts allow-listed.
- **Data honesty**: every layer shows source, UTC date, latency/model/demo notes, and "no sigue la línea temporal" when the sim is scrubbed > 2 days.
- **Sources** (verified 2026-11-02): ozone = GIBS `OMI_Ozone_TOMS_Total_Column` (fallback DOAS → OMPS historical → bundled snapshot); pollution = Open-Meteo Air Quality (CAMS) over curated sample points (fallback snapshot); fires = FIRMS public CSV NOAA-20/21 via proxy with server-side binning (fallback GIBS WMS raster → snapshot). WAQI is rejected by licence.

## Commands
`npm run dev` · `npm run check` (lint + typecheck + test + build) · `npx vitest run <path>` · gate grep: `rg -n "from \"(react|react-dom|zustand|@/stores|@/components|@/hooks)|fetch\(|getElementById|querySelector" src/engine/`.

## Dev flags (add in this phase, never in production bundles beyond query parsing)
`?layers=ozone,pollution,fires` · `?pollutant=pm2_5` · `?fires=24h|48h|7d` · `?mockError=<layerId>` · `?mock=snapshot`.

## Delegation
See `.agent/delegation-policy.md`. Opus: contracts, engine, hooks, performance, disposal, QA. Sonnet: types from sketches, catalog, services with exact contracts, routes, UI components, legends, badges, tests, docs, snapshots.

## Where things are recorded
`.agent/STATUS.md` (gates, numbers, unverified), `docs/plan/PLAN.md §3` (ADR-15), `docs/layers/README.md` (how to add a layer), `docs/design-references/layers-*.webp` (evidence).
