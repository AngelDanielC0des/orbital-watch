# OrbitalWatch — Architecture Plan (strangler migration to a React↔Three facade)

Author: Fable 5.1 (architect). Executors: Sonnet 5.5 coordinator + Sonnet 5 / Haiku workers.
Context: `docs/orchestration/00-context-map.md` (verified facts). Porting rules: `docs/research/orbitalwatch/porting-brief.md` §Rules.

## 1. Target tree
```
src/
  engine/                      # NO react / zustand / @/stores / @/components / @/hooks / DOM-by-id (ESLint-enforced)
    contract.ts                # K1 frozen contract: EngineOptions/Events/Handle, LayerSpec/Factory, FrameSnapshot, EngineError
    create-engine.ts           # K2 lifecycle skeleton -> receives main.ts 59-1101 (T03)
    index.ts                   # public barrel (createOrbitalEngine, LAYER_REGISTRY, DEFAULT_LAYERS, types)
    config.ts                  # moved from E/config.ts (T01)
    label-projector.ts         # pure projection of label positions (T05a, port of space-ui.ts updateLabels math)
    layers/
      earth-layer.ts           # K4 exemplar ILayer wrapper
      registry.ts              # EXISTS: id -> LayerFactory (T06 adds places; T13 adds the rest)
      place-layer.ts           # T06 (3D half of places.ts)
      {sky,solar,galaxy,satellites,track}-layer.ts   # T13, copy K4
    render/                    # leaf renderers moved 1:1 from E/ (T01): earth sky sun bodies solar galaxy
                               # satellites gpu-propagator sat-models track governor
  lib/
    frame-bus.ts               # K3 typed pub/sub, outside React
    orbital/{catalog,orbit-math,place-index}.ts
    engine/layer-manager.ts    # existing, finally used
  stores/
    engine-store.ts            # low-frequency UI state only (no per-frame ms/readouts) + engineError
    engine-bridge.ts           # K3 EngineEvents -> store, throttled; the ONLY store writer
  hooks/useEngine.ts           # K3 StrictMode-safe mount (replaces useOrbitalEngine.ts in T04); pauses on hidden tab
  hooks/useUrlState.ts         # T20 deep links
  components/sites/orbitalwatch/
    OrbitalWatch.tsx           # shell: canvas ref + useEngine + HUD; single DOM writer = React
    HUDErrorBoundary.tsx       # T19
    HUD/ClockReadout(K5) LabelOverlay(stub→T05b) PlaceSearch(stub→T06) SatelliteSearch(T16) LayerPanel(T17)
        EngineErrorOverlay(T19) Timeline SatellitePanel BodyPanel FilterBar ViewControls HUDHeader Hint Loader
    DonateSheet.tsx, orbitalwatch.css (shader-coupled CSS only)
vitest.config.ts + src/**/*.test.ts   # T18
```
Deleted at the end (T11): `E/main.ts hud.ts space-ui.ts places.ts donate.ts catalog.ts orbit-math.ts types.ts`, `src/hooks/useOrbitalEngine.ts`, `HUD/PlaceSearchUI.tsx` (T06).

## 2. Data flow
```
            commands (EngineHandle: setView/setFilter/select/setSpeed/flyToPlace/toggleLayer/setTimelineInset/
                      pickLabel/findSatellites/setRenderingPaused ...)
 React  ───────────────────────────────────────────────────────────────────────────────►  createOrbitalEngine()
 (DOM)  ◄───────── EngineEvents (≤4 Hz; onLoading/onCatalog/onViewChange/onSatelliteSelected/   (canvas + three)
        │          onBodySelected/onFilterChange/onNightMode/onVisibleCount/onTimeTick/onFps/onError)
        │                 └─ engine-bridge.ts ──► zustand store ──► React re-render (low frequency only)
        ◄───────── FrameBus<FrameSnapshot> (60 Hz; clock, readout alt/vel/lat/lon, label xy, body distance)
                          └─ consumed ONLY by ref-based imperative adapters (ClockReadout, LabelOverlay,
                             SatellitePanel readouts, BodyPanel distance). Never setState, never the store.
```

## 3. ADRs
- **ADR-1 Folders**: engine core lives in `src/engine/`; leaf renderers move 1:1 to `src/engine/render/` so the boundary lint rule covers them. Until T01 lands, `earth-layer.ts` carries one `eslint-disable-next-line` import (removed by T01).
- **ADR-2 Two data speeds**: per-frame data travels on `FrameBus` (snapshot mutated in place); the store receives ≤4 Hz ticks and clock strings. `hud.setClock`/`hud.updatePanel` 60 Hz store writes are removed.
- **ADR-3 Strangler, not rewrite**: `create-engine.ts` is filled by moving `main.ts` regions verbatim (block labels in K2). Solar/sky/galaxy/sats keep direct typed references in wave 2; they become `ILayer` wrappers in wave 5 (T13) exposing `inner`.
- **ADR-4 Label projection**: the math of `SpaceUi.updateLabels` becomes a pure engine function (`label-projector.ts`); DOM positioning becomes `LabelOverlay.tsx` reading `FrameSnapshot.labels` via refs.
- **ADR-5 Single DOM writer**: React owns `document.body` classes via one `useEffect`; keyboard shortcuts live in React; canvas pointer/wheel stay in the engine (canvas is injected).
- **ADR-6 Place search**: data+search → `src/lib/orbital/place-index.ts`; mesh/highlight → `place-layer.ts`; input → `<PlaceSearch/>`; highlight set by the engine inside `flyToPlace`.
- **ADR-7 Timeline inset**: the `.timeline` ResizeObserver leaves the engine; the React Timeline measures itself and calls `handle.setTimelineInset(px)`.
- **ADR-8 Shader-coupled CSS** (labels glow, warp, loader bar) may stay in `orbitalwatch.css`; everything else migrates to Tailwind without visual change.
- **ADR-9 Debug surface**: `window.orbitalwatch` only when `options.debug` and `process.env.NODE_ENV !== "production"`.
- **ADR-10 Typed errors + fallback UI**: `onError(EngineError{code})`; fatal codes (`webgl-unsupported`, `webgl-context-lost`, `boot-failed`, `import-failed`) show a full-screen fallback; `catalog-failed` is a toast. The engine listens `webglcontextlost` itself (it owns the canvas).
- **ADR-11 Hidden tab**: the hook calls `setRenderingPaused(true)` on `visibilitychange`; the engine stops the animation loop and resets the clock delta on resume (no time jump, no battery drain).
- **ADR-12 Stubs with final props**: `LabelOverlay`/`PlaceSearch` exist as stubs so the shell mounts them in wave 2 and wave-3 workers never share `OrbitalWatch.tsx`.
- **ADR-13 Tests in the gate**: vitest covers the pure modules (frame bus, bridge, projector); `npm run check` runs them (T18).
- **ADR-14 Shareable state**: URL query is the serialisation of low-frequency store state (`replaceState`, throttled); never from the FrameBus (T20).
- **ADR-15 Environmental data layers**: ozone/pollution/fires are `ILayer`s that also implement `DataLayer` (`setOpacity`, `setData(LayerDataPayload)`, `clearData`). The facade gains three **optional** members only — `setLayerOpacity`, `setLayerData`, `clearLayerData` — delegating to `LayerManager.getDataLayer(id)`. Layers are created at boot hidden (`visible: false`), ride on the Earth group, rotate with `gmstRad`, and never fetch: data comes from `src/lib/layers/*` services via `useLayerData` and enters only through `setLayerData`. No `removeLayer`, no new `LayerUpdateContext` fields.
- **ADR-16 Overlay picking**: optional `EngineEvents.onLayerHover/onLayerPick(LayerPick|null)`, `EngineHandle.clearLayerPick?()`, and optional `DataLayer.pick/setHovered/setSelected/pointWorld`. Hit tests run on the CPU inside each overlay (screen-space nearest point through `matrixWorld`, far-side culling; ray–sphere for fire cells and the ozone surface), reuse the satellite hover throttle (120 ms) and click threshold, and run only in Earth view while satellites are hidden (environmental modes). The UI resolves picks against the services' latest data (`pick-resolver.ts`).

## 4. Risks
| Risk | Prob. | Mitigation |
|---|---|---|
| T03 (main.ts move) breaks behaviour silently | high | Verbatim moves per labelled block; smoke test at wave gate; `?debug` surface kept in dev |
| Labels/places disappear between waves | med | Stubs mounted in wave 2; gate C runs only after T05b/T06 |
| 60 Hz re-renders sneak back (store writes per frame) | med | Guard `rg` in §7 + profiler check in T15; bridge is the only store writer |
| StrictMode double mount leaks a WebGL context | med | K3 hook: cancel token + dispose in cleanup; T15 leak test ×3 |
| Workers "improve" GLSL or rename port methods | med | Pitfalls in every task; porting-brief §Rules; wrappers only |
| Parallel workers edit the same file | low | Ownership lists disjoint per wave; coordinator rejects out-of-ownership diffs |
| Stripe/email placeholders ship | low | env-only config, disabled button without link, "Needs user input" |
| `npm install` (T18) drifts the lockfile | low | Only T18 may touch `package-lock.json`; coordinator checks `git diff --stat` |

## 5. Waves and dependencies
| Wave | Tasks (parallel within wave) | Gate |
|---|---|---|
| 0 | T00 checkpoint commit (**only if the user authorizes**) | — |
| 1 | T01 haiku move renderers · T02 haiku package/README/env · T05a sonnet55 label-projector | A |
| 2 | T03 sonnet55 main.ts → create-engine → then T04 sonnet55 hook+bridge+stubs mounted | B |
| 3 | T06 sonnet55 places · T05b medium LabelOverlay · T07 medium shell/a11y/keys · T08 medium Timeline · T09 medium SatellitePanel · T10 medium BodyPanel | C |
| 4 | T11 haiku delete legacy · T12 medium brand/env/Donate · T18 haiku vitest · T19 medium error overlay | C |
| 5 | T13 sonnet55 remaining ILayer wrappers · T14 medium Tailwind/skeleton/390 px | C + 390 px |
| 6 | T16 sonnet55 satellite search ∥ T17 medium layer panel → T20 medium deep links (after T16) | C |
| 7 | T15 sonnet55 QA gate (check, smoke, leak test, 60 Hz profiler, new features) | all green |
| 8 | T21 sonnet55 picking accuracy + hover marker (user-reported; done, see QA-REPORT T15b) | T15b |
| 9 | T22 sonnet55 closing pass: real-DPR verification, hover affordance, open items, `npm run check` green, clean tree | final |

## 6. Needs user input (do not invent, do not block)
- `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` (real Stripe link): without it the donate button is disabled and a dev warning logs.
- `NEXT_PUBLIC_CONTACT_EMAIL`, final product name/domain for `package.json`/README/metadata.
- Authorization for the wave-0 checkpoint commit (and any later commit).

## 7. Verification protocol
Per task (worker, cheap): `npx tsc --noEmit` · `npx eslint <owned files>` · boundary guard:
`rg -n "from \"(react|react-dom|zustand|@/stores|@/components|@/hooks)|getElementById|querySelector|document\." src/engine/` → **0 hits**.
Workers never run `npm run check`.
Global (coordinator, end of wave and close): `npm run check` (lint + typecheck + vitest after T18 + build); Playwright/chrome-devtools smoke on `/orbitalwatch` (globe + satellites visible, 0 console errors, earth/solar/galaxy views, filters, timeline, selection, place/satellite search, layer toggles, deep link) and at 390 px; leak test: mount/unmount ×3 → `renderer.info.memory` and heap return to baseline; Timeline/SatellitePanel/LabelOverlay do not re-render at 60 Hz (React Profiler).

## 8. Key-code checklist (K1–K6)
| Piece | File | Status |
|---|---|---|
| K1 contract | `src/engine/contract.ts` | EXISTS |
| K2 lifecycle skeleton | `src/engine/create-engine.ts`, `src/engine/index.ts`, `src/engine/layers/registry.ts` | EXISTS |
| K3 frame bus / bridge / hook | `src/lib/frame-bus.ts`, `src/stores/engine-bridge.ts`, `src/hooks/useEngine.ts` | EXISTS |
| K4 layer exemplar | `src/engine/layers/earth-layer.ts` | EXISTS |
| K5 per-frame UI exemplar | `src/components/sites/orbitalwatch/HUD/ClockReadout.tsx` (+ stubs `LabelOverlay.tsx`, `PlaceSearch.tsx`) | EXISTS |
| K6 boundary lint rule | `eslint.config.mjs` | EXISTS |
