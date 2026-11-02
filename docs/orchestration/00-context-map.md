# Context map (verified facts — read this INSTEAD of exploring)

Paths relative to repo root. `E/` = `src/components/sites/orbitalwatch/engine/`. Line numbers refer to `E/main.ts` (1101 lines) unless noted.

## Stack
Next 16.3.5 (`next build --webpack`; read `node_modules/next/dist/docs/` before touching Next APIs), React 19.2, TS strict, Tailwind v4, zustand 5, three 0.186, gsap 3.15, satellite.js 7. `tsc --noEmit` currently passes. Everything is uncommitted over one initial commit. Route: `src/app/orbitalwatch/page.tsx` → `<OrbitalWatch/>`.

## Current data flow (what is actually wrong)
```
OrbitalWatch.tsx (React shell, renders static markup WITH the original DOM ids)
  └ useOrbitalEngine(canvasRef)  ── import("E/main").startOrbitalWatch()  (no args, no canvas, no callbacks)
        └ main.ts finds everything via document.getElementById/querySelector
             ├ new Hud()      (E/hud.ts, 297 l)   writes textContent/classes on React-rendered ids AND useEngineStore.getState().set*()
             ├ new SpaceUi()  (E/space-ui.ts, 361 l) DOM labels, body panel, [data-view] buttons, #warp, #stat-space
             ├ new PlaceSearch(earth.group) (E/places.ts, 416 l) 3D country mesh + mounts <input> into #place-search
             └ initDonate()   (E/donate.ts) empty stub, still imported at main.ts:19,65,1086
  Hook "facade": built ONLY if URL has ?debug (main.ts:1035 sets window.orbitalwatch). Otherwise engineRef.current === null and every React command (setSpeed, togglePlay, setFilter…) is a silent no-op; the UI works only because main.ts attaches its OWN DOM listeners to the React-rendered ids (main.ts:~700-742, 582, 621).
  Store is written from INSIDE the engine (hud.ts:168-267 imports @/stores/engine-store) and per frame: hud.setClock (main.ts:879 → hud.ts:236 `setTimeState({ms,…})`, ms changes every frame) and hud.updatePanel (main.ts:~880 → `updateSatelliteReadout`) → React re-renders at ~60 Hz. hud.setFps is throttled (0.5 s). Also `hud.showPanel` stores `index: 0` (wrong, real index is lost).
  Result: two writers (imperative Hud + React) on the same DOM nodes, engine→store dependency, dead facade in prod.
```
`LayerManager` (`src/lib/engine/layer-manager.ts`) + `ILayer` (`src/types/engine.ts`) exist but NOTHING implements/uses them. Existing contracts to reuse: `EngineUIState`, `EngineCommandFacade` (`src/types/engine.ts`), store actions (`src/stores/engine-store.ts`, 126 l, `resetAll` exists).

## main.ts anatomy (anchors)
- 59 `startOrbitalWatch()`; 64-80 hud/donate/listen helper/`cleanups[]`/canvas lookup; 81-112 renderer, tier (`lo|hi`), `FrameGovernor`; 114-175 scene, camera, OrbitControls, `Sky`, `Earth`, `PlaceSearch`, `SolarSystem`, lazy `Galaxy`, `SatelliteLayer sats` (lazy, built in `boot`), `OrbitTrack`, `sim={ms,speed,playing,scrubbing}`, `universe={view,focus,busy}`.
- 181-440 camera flights (gsap): `flyTo`, `focusBody`, `solarOverview`, `goEarth`, `enterGalaxy/exitGalaxy`, `flyToPlace`, `setView(view,{focus})`.
- 441-483 `onLabel`, `new SpaceUi({onView,onLabel,onCloseBody})`, `addLabels`, `places.mount(#place-search)`, `places.onSelect`.
- 485-575 follow/select satellite (`select(index)`, `unfollow`, `updateFollow`); 577-613 `setFilter`, `setNightMode`, `refreshCount`.
- 615-742 pointer/wheel/keyboard + HUD button listeners (`hud.el.*`, `hud.speedButtons`, `hud.filterButtons`, scrubber).
- 743-860 viewport/resize/lift/ResizeObserver(`.timeline`)/governor/clip planes.
- 870-960 `frame()` + `loop()` (per-frame: governor, sim time, `hud.setClock`, solar/earth/sats updates, `spaceUi.updateLabels`, render; fps every 0.5 s).
- 977-1065 `loadCatalog` (CelesTrak or synthetic) + `boot()` (async, `disposed` checks, `hud.setLoading` stages, `renderer.compileAsync`, idle-loaded solar textures/galaxy).
- 1066-1101 `dispose()` — already kills gsap tweens, calls each module's `dispose()`, `renderer.dispose()`; but no `forceContextLoss`, document.body classes `view-*`/`is-alarm` are toggled globally, `pagehide` listener.

## DOM contract the imperative classes rely on (ids/selectors)
Hud: `stat-visible stat-source stat-fps panel panel-{kind,name,norad,cospar,alt,vel,country,launch,inc,period,perigee,apogee,lat,lon,epoch,close} play scrubber clock-date clock-rel now toggle-night hint loader loader-text loader-bar mark-{start,end,now}` + `[data-speed]`, `[data-filter]` buttons.
SpaceUi: `body-{panel,close,name,kind,day,diameter,dist,dist-unit,gravity,light,light-unit,moons,moons-label,temp,year} hint labels stat-space warp` + `[data-view]`. PlaceSearch: `#place-search #place-q #place-results`. main: `#scene`, `.timeline`.

## Public surfaces (black boxes — do not read internals)
Hud: `setLoading/setLoadingError/hideLoader/setSource/setVisibleCount/setFps/setClock/setPlaying/setPressed/showPanel/updatePanel/hidePanel/dismissHint/dispose`. SpaceUi: `setView/addLabels/updateLabels/showBody/updateBodyDistance/hideBody/fadeOut/fadeIn/dispose` (`updateLabels` positions DOM nodes every frame — must stay imperative/ref-based). PlaceSearch: `load/search/setHighlight/clear/mount/onSelect/dispose` (extends 3D: needs `earth.group`).
Leaf renderers (faithful 1:1 ports; keep public method names; GLSL verbatim; see `docs/research/orbitalwatch/porting-brief.md` §Rules): `earth.ts, sky.ts, sun.ts, bodies.ts, solar.ts (1256 l), galaxy.ts, satellites.ts (SatelliteLayer), gpu-propagator.ts, sat-models.ts, track.ts, governor.ts`. All have `dispose()`. Pure math: `src/lib/orbital/{catalog,orbit-math}.ts` (E/{catalog,orbit-math,types}.ts are re-exports).

## Config / brand
`E/config.ts`: `assetUrl`, `ASSET_BASE=/sites/orbitalwatch/`, `STRIPE_PAYMENT_LINK` (env `NEXT_PUBLIC_STRIPE_PAYMENT_LINK`, fallback test URL — placeholder), `CONTACT_EMAIL="contact@orbitalwatch.space"` (placeholder), `QualityTier`. `DonateSheet.tsx` (166 l) is the React donate UI. `package.json` name/description/keywords/repository still the template's. `README.md` still the template README (references archived images). No "kyvera" strings in `src/` or `public/`. Styles: `orbitalwatch.css` (176 l) + `globals.css` (129 l).

## Out of scope / archived
Original bundle + original HTML/CSS moved to `C:\Users\angel\Desktop\orbital-watch\_archive\research\source` (not needed: leaf renderers are not rewritten). Template files (`.github/`, `Dockerfile*`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.agents/`, `.claude/`) are irrelevant to this task — ignore, don't read, don't edit (except README/package.json metadata if the plan says so).

## Pre-baked hints (so you don't have to look them up)
- `eslint.config.mjs`: flat config `defineConfig([...nextVitals, ...nextTs, globalIgnores([".next/**","out/**","build/**","next-env.d.ts","docs/**"])])`. Add a new config object with `files: ["src/engine/**"]` + `no-restricted-imports` (patterns: `react`, `react-dom`, `next/*`, `zustand`, `@/stores/*`, `@/components/*`, `@/hooks/*`). `tsconfig` has `strict` and alias `@/*` → `./src/*`.
- Layer-wrapper exemplar target = `Earth` (`E/earth.ts`): `new Earth({ renderer, tier, segments, atmosphereSteps })`; public `group: Group`, `uniforms.uNightMode.value`, `load(onProgress?) → Promise`, `update…`/`dispose()` (grep the class for the rest). In main.ts it is created at 134-140, added with `scene.add(earth.group)`, loaded at 147-152 with progress `ratio * 0.7`, night mode via `gsap` on `uNightMode` (main.ts:601), disposed at 1081.
- Boot order that must be preserved: renderer → governor → scene/camera/controls → sky → earth → solar → (lazy galaxy) → catalog + earth load in parallel → `SatelliteLayer` → `compileAsync` → hide loader → idle-load solar textures → idle-load galaxy.
- Env: Windows + Git Bash/PowerShell. Dev server `npm run dev`. Playwright and chrome-devtools MCP are available for smoke tests.
