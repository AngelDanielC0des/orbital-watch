# OrbitalWatch — project status (2026-11-02)

Branch `refactor/engine-react-facade` (PR to `master`). Source of truth for the design: [`docs/plan/PLAN.md`](plan/PLAN.md). Evidence: [`docs/plan/QA-REPORT.md`](plan/QA-REPORT.md) and `docs/design-references/*.webp`.

## 1. Where we are
The strangler refactor is **complete**: the Three.js engine no longer knows about React and the HUD no longer touches the scene. 22 tasks (T00 skipped on purpose: no commit before this branch) ran in 9 waves with gates; `npm run check` (eslint + tsc + vitest 21/21 + `next build --webpack`) is green.

```
src/engine/            create-engine.ts (lifecycle, ~1250 lines, the former main.ts), contract.ts (frozen K1),
                       label-projector.ts, config.ts, layers/ (earth sky solar galaxy satellites track places hover + registry),
                       render/ (leaf renderers moved 1:1: earth sky sun bodies solar galaxy satellites gpu-propagator sat-models track governor)
src/lib/               frame-bus.ts (60 Hz pub/sub outside React), orbital/ (catalog, orbit-math, place-index), engine/layer-manager.ts
src/stores/            engine-store.ts (low-frequency UI state), engine-bridge.ts (EngineEvents -> store, throttled; the only writer)
src/hooks/             useEngine.ts (StrictMode-safe mount, pauses on hidden tab), useUrlState.ts (deep links)
src/components/sites/orbitalwatch/   OrbitalWatch.tsx shell + HUD/* + DonateSheet + HUDErrorBoundary + orbitalwatch.css
```
Boundary rule (ESLint-enforced, K6): `src/engine/**` cannot import react / zustand / `@/stores` / `@/components` / `@/hooks`. Only allowed `document.` use: `render/track.ts:25` (offscreen canvas texture).

## 2. How data moves
- **Commands** React → engine through `EngineHandle` (`setView`, `setFilter`, `select`, `toggleLayer`, `flyToPlace`, `findSatellites`, `setTimelineInset`, `setRenderingPaused`…).
- **Events ≤ 4 Hz** engine → `engine-bridge` → zustand → React re-render (view, filter, selection, loading, errors, clock string).
- **FrameBus 60 Hz** (clock, telemetry, label xy, body distance) is consumed only by ref-based adapters (`ClockReadout`, `LabelOverlay`, `SatellitePanel`, `BodyPanel`, `Timeline`): measured **0 React commits** in those components during 5 s idle.

## 3. Bugs found and fixed on the way
| Bug | Root cause | Fix |
|---|---|---|
| Click selected an object on the other side of the globe (user report) | `renderer.setViewport` got physical px, three multiplies by pixelRatio again → scene drawn scaled/offset on DPR>1 while pick/labels projected unscaled | `setViewport(0,0,size.w,size.h)` (T21) |
| Sub-pixel pick error at DPR 1.5 | layout rect is fractional (1181.333) while `size` uses integer `clientWidth` | `toCanvas` normalises by `size.w/rect.width` (T22); drift ≤ 0.25 px |
| `?quality=lo|hi` ignored | never wired | read in `create-engine.ts` (`options.quality` wins) |
| Console error "Computed radius is NaN" | `SatelliteLayer.pointsGeometry` has a dummy 1-component position attribute and no bounding sphere; three computes it for sorting. **Pre-existing in legacy** | mitigated in `create-engine.ts` (preset sphere); root fix in `satellites.ts` deliberately not applied (renderer bodies frozen) |
| Cursor never `pointer` | OrbitControls writes inline `style.cursor` | engine sets `canvas.style.cursor` itself; re-applied on `pointerup` (no `!important`) |
| `?focus=mars` dropped; `night=1` ignored | transition busy / engine never emitted the initial night event | applied when the engine is idle; `setNightMode(true)` on mount |
| Dev server 500 / `next dev` failing | `next.config.ts` has a webpack config (satellite.js) and Turbopack is the default | `dev` and `build` use `--webpack` |
| `THREE.Clock` deprecation warning | — | local clock replacing it |

## 4. Verification summary (all in QA-REPORT)
Real headed Chrome at **DPR 1.5** (Windows 150 %): 6/6 picks in 5 cases (hi/lo quality, windowed, fractional rect, offset canvas). Leak test (mount ×4): geometries 14 / textures 21 constant; heap +0.4 % in the first run (T15), **+31 % at the 2nd mount then stable (+4 %)** in T15b — treated as warm-up, **not proven**. Production smoke on `next start` OK. Guards: boundary rg (1 allowed hit), no `any` / `@ts-ignore` / `as unknown as`.

## 5. What remains
**A. Needs your decision (cannot be inferred)**
1. `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` and `NEXT_PUBLIC_CONTACT_EMAIL` (empty → donate button disabled, email row hidden). Set them in Vercel/`.env.local`.
2. Domain → `metadataBase` in `src/app/layout.tsx` (build warns), canonical URLs, JSON-LD publisher URL (removed for now).
3. Licence/author: `LICENSE`, `package.json` author and the README placeholder still come from the cloner template (MIT / JCodesMore). Choose the real licence.
4. Docker: `Dockerfile` copies `.next/standalone`, but `output: "standalone"` is not in `next.config.ts` (it was removed before this work). Re-add it (and test `docker build`) only if you deploy with Docker; Vercel does not need it.

**B. Technical debt, in priority order**
1. Real-world validation I could not do: live CelesTrak catalog (sandbox only had the synthetic one), DPR 1.25 and a physically docked DevTools, Stripe flow, real tab switch (`visibilitychange`).
2. Confirm the heap warm-up (+31 %) with two `take_heapsnapshot` diffs on a production build.
3. Move the satellites bounding-sphere fix into `render/satellites.ts` (one line, then drop the workaround) and fix `[OrbitCompute] readback failed` properly (guard exists; not reproduced).
4. `LayerUpdateContext` lacks time/earthZoom/readout, so solar/sats/track/sky still have explicit per-frame updates in `create-engine.ts`; extend the context additively and let `LayerManager.update` drive all layers.
5. `Timeline` has no "scrubbing" signal in the contract (local pointer guard used); warp fade has no `onTransition` event. Both need an additive optional contract field.
6. Tailwind migration is partial: `orbitalwatch.css` still holds most HUD rules (only loader/panels/layer panel are utilities). `SatelliteSearch` uses inline styles.
7. `vitest.config.ts` → rename to `.mts` to silence the CJS notice; webpack warnings from `satellite.js` (`topLevelAwait`, circular chunks) are upstream — revisit Turbopack when the package ships a compatible build.
8. Cleanup of template leftovers: `CONTRIBUTING.md`, `SECURITY.md`, `docker-compose.yml`, `.github/FUNDING.yml`, `.agents/` and `.claude/commands/clone-website.md` still talk about the cloner template.
9. Mobile polish: status text wraps to two lines at 390 px; Hint dismissal relies on the canvas `pointerdown` in React.

**C. Add the ozone layer (3 steps)**
1. `src/engine/layers/ozone-layer.ts` copying `earth-layer.ts` (K4: `ILayer` wrapper, `dispose()` frees geometry/material/textures).
2. One line in `src/engine/layers/registry.ts` (`ozone: createOzoneLayer`).
3. Add the id to `DEFAULT_LAYERS` and a row in `HUD/LayerPanel.tsx`.

## 6. Deployment
Vercel project `orbital-watch` (team angels-projects-42933b02), deployed from the CLI (`vercel deploy`) on 2026-11-02; the first deployment was auto-assigned to production: https://orbital-watch-sable.vercel.app/orbitalwatch (0 console errors, evidence `docs/design-references/vercel-prod.webp`). The project is **not** connected to the GitHub repo yet, so pushes do not deploy (`vercel git connect` would enable it). No env vars are set in Vercel (Stripe link / contact email empty by design).
**Catalog source:** the engine uses the synthetic catalog by default and only fetches CelesTrak with `?data=celestrak` (read in `create-engine.ts`, inherited from the original). The live site therefore shows "catálogo sintético (demo)" unless that param is used. Decide whether production should default to the real catalog.

## 7. How to run
`npm install` · `npm run dev` (http://localhost:3000/orbitalwatch; first load ~30 s with webpack; reload after editing engine files, Fast Refresh keeps the old engine) · `npm run check` · `npm run start` after a build. Deep links: `?view=earth|solar|galaxy&focus=<body>&filter=&speed=&t=&sat=<NORAD>&night=1&quality=lo|hi&debug`.
