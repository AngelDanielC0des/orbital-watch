# QA-REPORT — T15 final gate (2026-11-02)

Env: Windows, Next 16.3.5 dev (`npm run dev`, webpack), chrome-devtools MCP, synthetic catalog "(demo)" (CelesTrak unreachable; 21 979 objects, NORAD from 10000). Screenshots: `docs/design-references/qa-*.webp`.

## 1. `npm run check` — PASS (exit 0, run twice: before and after the QA fixes)
- eslint: clean. `tsc --noEmit`: clean. vitest: `Test Files 3 passed (3) · Tests 21 passed (21)`.
- `next build --webpack`: OK; routes `○ /`, `○ /_not-found`, `○ /orbitalwatch`.
- Build warnings (pre-existing, from the `satellite.js` package, NOT fixed): `topLevelAwait` in `wasm-build/pthreads-release/index.js`; "Circular dependency between chunks with runtime (em-pthread)". Also `metadataBase not set` (dev/build notice).
- vitest prints a Vite notice: `vitest.config.ts` is ESM loaded as CJS (cosmetic; set `.mts` or `"type":"module"` to silence).

## 2. Smoke `/orbitalwatch?debug` — PASS (desktop 1400×934 and 390×844 mobile emulation)
- Globe + satellites visible; `body.view-earth`; 0 console errors. Warnings only: Stripe dev warning (allowed) + the satellite.js webpack warnings above (dev HMR echo).
- Views earth→solar→galaxy→earth OK (each transition takes ~4-5 s; URL follows). Filters: Todo 21.979 / Basura 11.240 / Starlink 5934 / Previstos 0 now, 1370 when scrubbed +300 d (projected objects only exist in the future). Night toggle OK.
- Timeline: pause/resume, ×1/×60/×600/1 h/s/1 día/s advance the clock as expected, scrub (+300 d), "Ahora" returns to live. Select satellite (search "STARLINK-100" → STARLINK-10005; panel + track) and close (X and deep link); Mars select (label click) and close (button, Escape). Place search "Espa" → Spain flies the camera. Layer toggles: satellites/track/sky (engine groups hide/show), labels (`#labels[hidden]`).
- Deep link `?view=solar&focus=mars` opens on Mars (panel "Marte", URL keeps `focus=mars`) — **after fix #2**; before the fix it opened the solar overview only. Mobile: sat panel, Mars deep link, layer panel OK, `scrollWidth` 390 (no horizontal overflow).
- Hidden tab (5.5 s on another tab): sim advanced 6.2 s vs 13 s wall → paused, no forward jump, 0 console errors. Side effect (by design, dt clamp): clock no longer "en vivo" until "Ahora". `visibilitychange` did not reach the page under CDP tab switching (unverifiable here); the pause was observed anyway.

## 3. Leak test — PASS
StrictMode dev double mount excluded (baseline taken after initial load). Route toggle `/orbitalwatch` ⇄ temporary `/qa-blank` via `next.router.push` (same document, marker kept; temp route deleted). Heap = `usedJSHeapSize` read right after `take_heapsnapshot` (forces GC).

| mount | geometries | textures | heap post-GC |
|---|---|---|---|
| baseline | 14 | 21 | 455.6 MB |
| #2 | 14 | 21 | 456.8 MB |
| #3 | 14 | 21 | 457.3 MB |
| #4 | 14 | 21 | 457.4 MB (+0.4 %) |
Old canvas removed, old WebGL context lost (`isContextLost()==true`), `window.orbitalwatch` deleted on unmount.
Note: `/` redirects to `/orbitalwatch` (drops `?debug`), so it cannot be used as the "other" route.

## 4. 60 Hz re-render check — PASS
React commits counted with an injected `__REACT_DEVTOOLS_GLOBAL_HOOK__` (fibers with PerformedWork), 5 s idle playback, clock advancing: 4 commits, only `HUDHeader`/`LayerPanel`/`IconMark` (fps readout, ~0.8 Hz). **Timeline, SatellitePanel, LabelOverlay: 0 renders.** With a satellite selected: 2 commits (HUDHeader, PanelToggle), SatellitePanel 0. Detector sanity: clicking ×60 → `Timeline` 1 render.

## 5. Guards — PASS
- `rg -n "from \"(react|react-dom|zustand|@/stores|@/components|@/hooks)|getElementById|querySelector|document\." src/engine/` → 1 allowed hit: `src/engine/render/track.ts:25` `document.createElement("canvas")` (offscreen texture, not DOM-by-id). Documented exception.
- `rg -n "\bany\b|@ts-ignore|as unknown as" src` → 1 false positive: the word "any" in a comment (`create-engine.ts:209`, "at any time"). 0 type uses.

## Fixes made by the gate (outside original task, minimal)
1. `src/lib/orbital/orbit-math.ts` — removed `as unknown as OMMJsonObject`; new `toOmm()` builds the stricter OMM object (EPHEMERIS_TYPE 0, CLASSIFICATION_TYPE U/C, ELEMENT_SET_NO default 0).
2. `src/hooks/useUrlState.ts` — `focus` was dropped because `initial.view=solar` already started a transition and `engine.setView` ignores calls while busy; now applied once the store reports idle (`!isBusy && loading.isDone`).
3. `src/engine/create-engine.ts` — replaced deprecated `THREE.Clock` (console warning `THREE.Clock: This module has been deprecated`) with an equivalent local clock (`getDelta`, `elapsedTime`; first delta 0). Warning gone.
4. `orbitalwatch.css` — "Copiar enlace" was hidden behind the place-search box; now inline on the fps row (`.perf` inline-block, `.perf + button`). Still tight to the search box (~3 px).
5. `HUD/LayerPanel.tsx` — layer popup overflowed 390 px viewport (right edge 429 px); `max-[860px]:left-auto max-[860px]:right-0` → 155–320 px.
"Capas"/"Copiar enlace" were not unstyled: they inherit the `.scales` look (Capas) / a muted link style; only the overlap was a bug.

## Open / unverified (not blocking)
- `[OrbitCompute] readback failed` console warning (2×) when the route unmounts while a `readRenderTargetPixelsAsync` is in flight (`src/engine/render/gpu-propagator.ts:264`, leaf renderer, not touched). Benign; suggest skipping the warn when the engine is disposed.
- Mobile 390: status text "catálogo sintético (demo)" runs under the donate "+" button; Next dev-tools badge overlaps the timeline (dev only).
- Dev-only: after a Fast Refresh, `window.orbitalwatch` was undefined until a reload (debug surface is not re-created on HMR).
- Unverifiable here: real CelesTrak catalog (offline), Stripe donate flow (env empty), production-mode `?debug` (disabled by design), true `visibilitychange` under a real window switch.
- Working tree: QA PNGs added in `docs/design-references/`; temp route and heap snapshots deleted; dev server stopped (port 3000 free). No commits made.

## T15b (post-T21) — 2026-11-02
Env: Next dev + Playwright MCP (real `page.mouse` / CDP touch), synthetic catalog. Screenshots: `docs/design-references/t15b-*.webp`. Expected object = CPU `positionAt` projection (independent of the GPU readback); selected = `sats.selected` + `#panel-name`/NORAD.
- **(1) Smoke — PASS.** 1400×934 (DPR 1; and DPR 2 with pixel ratio forced to 1.5, T21 regime) and 390×844 (DPR 3, mobile, touch): globe centred (desktop Earth centre 700,467 = viewport centre; mobile x=195, lifted above the timeline by design), `scrollWidth` 390, satellites visible. earth→solar→galaxy→earth OK. 0 app console errors (only the known satellite.js/Stripe/metadataBase warnings).
- **(2) Picking — PASS.** Mouse, DPR 1: 6/6 (STARLINK, SAT, FENGYUN/DEB…); mouse, DPR 2 @ ratio 1.5: 6/6; touch tap @390: 4/4 at ratio 1 and 3/3 at ratio 0.75. Click-vs-projection drift ≤0.9 px. Hover: `HoverMarker` visible + `#scene.is-pointing` in 12/12 (ring centred on the dot, `t15b-hover-marker.webp`); no marker on touch (mouse-only by design).
- **BUG (trivial, FIXED): cursor never became `pointer`.** three's OrbitControls leaves inline `style="cursor:auto"` on the canvas, which beat `#scene.is-pointing{cursor:pointer}`; computed cursor stayed `auto` while marker/class were correct. Fix: `!important` in `orbitalwatch.css:14` (computed → `pointer`, verified).
- **(3) Leak ×3 (+3 extra) — PASS (with caveat).** `/orbitalwatch`⇄temporary `/qa-blank` via `next.router.push` (route deleted; stale `.next/dev/types/app/qa-blank` removed too). Geometries 11 / textures 21 / programs 22 in all 7 mounts (hover-layer included, `HoverMarker` present), old canvas removed, `window.orbitalwatch` deleted on unmount. Heap post-GC (MB): 47.5 (baseline) → 62.6 → 63.2 → 63.7 → 64.3 → 65.0 → 64.8 → 65.1. Caveat: baseline→#2 is a one-time +31 % step (first mount in dev warming caches); from #2 on it plateaus (+0.4 %/mount, #2→#7 +4 % < 5 %). Strict "±5 % of the first baseline" is NOT met; no per-mount GPU leak.
- **(4) Deep links — PASS.** `?view=solar&focus=mars` → Marte panel, `view-solar`; `?sat=10005&night=1` → STARLINK-10005 / NORAD 10005 selected, night mode on (button pressed).
- **(5) Guards — PASS.** boundary rg: only `src/engine/render/track.ts:25` (documented). `any|@ts-ignore|as unknown as`: only the word "any" in a comment (`create-engine.ts:209`).
- **Dev-only artifacts (NOT app bugs):** (a) in `next dev` the URL write (`?night=1&filter=…`, at +356 ms) is overwritten ~300 ms later by Next's `HistoryUpdater` (`app-router.js:64`) during a continuous dev rebuild/refresh loop (hundreds of `GET /orbitalwatch` in the log; manifests under `.next/dev` rewritten constantly, probably fed back by `.playwright-mcp` logs inside the repo). In a production build (`next build --webpack` OK, `next start`) the URL follows: `?filter=starlink&night=1` → `?view=solar&…` → `?view=galaxy&…` → back to earth. (b) `Router action dispatched before initialization` console error right after an HMR echo (file edit/delete during load). (c) One `page.reload()` under CDP emulation hung at "Cargando texturas de la Tierra…" (>2 min, no console error); a fresh `goto` worked — not reproduced, unexplained.
- State left: temp route and prod server removed/stopped (port 3000 free), no commits. `npm run check` not run (as requested); a `next build` was run for (a).

## T22 — closing pass (2026-11-02)
Env: Windows 11, system DPI **144 = 150 % scaling** (`GetDpiForSystem`; primary screen 2560×1600 → 1707×1067 CSS). Browser: chrome-devtools MCP, **headed real Chrome 156**, NO `emulate` viewport/DPR override (only `prefers-reduced-motion` media emulation for one check). Synthetic catalog "(demo)". Screenshots: `docs/design-references/t22-*`.

### 1. Real-DPR verification — PASS (6/6 at every case, drift ≤ 0.25 px after the fix)
`window.devicePixelRatio` = **1.5** (matches the OS scale). DPR **1.25 is unverifiable on this machine** (same code path, only the rounding differs). Protocol: expected = CPU `positionAt` → `project(camera)` → client px (using the `rect`, fractional size included); 6 isolated, non-occluded satellites in a 3×2 grid of the canvas; per case: `pointermove` (hover) → `pointerdown/up` → compare `sats.selected` with the expected index. Drift probe = smallest `pickAsync` radius (0.25/0.5/1/1.5/2/3/5 px) that still returns the expected index when queried exactly at the CPU projection (a GPU-vs-CPU dot offset larger than the radius would fail it). Events are synthetic `PointerEvent`s on the canvas (the browser's own mouse→clientX mapping is not under test; the engine's rect/size/DPR maths is). Camera restored between clicks.

| # | case | quality | DPR | pixelRatio | canvas bitmap | CSS (clientW×H) | `getBoundingClientRect` (x,y,w,h) | picks | min pick radius |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1400×934 window (first run; camera restore imperfect, re-done as 2/3) | hi | 1.5 | 1.5 | 2100×1401 | 1400×934 | 0,0,1400,934 | 6/6 | 0.5 px |
| 2 | 1400×845 window | hi | 1.5 | 1.0 (governor) | 1400×845 | 1400×845 | 0,0,1400,**845.333** | 6/6 | 0.5 px |
| 3 | **not maximised** 1181×761 | hi | 1.5 | 1.5 | 1771×1141 | 1181×761 | 0,0,**1181.333**,**761.333** | 6/6 | 0.5 px |
| 4 | 1181×761 + canvas offset (docked-DevTools stand-in) | **lo** (`?quality=lo`) | 1.5 | 1.0 | 1110×708 | 1110×708 | **37.292, 23.594, 1109.625, 707.927** | 6/6 | **0.25 px** |
| 5 | same offset | **hi** | 1.5 | 1.5 | 1665×1062 (= floor(1110·1.5), floor(708·1.5)) | 1110×708 | 37.292, 23.594, 1109.625, 707.927 | 6/6 | **0.25 px** |

- Findings: (a) At DPR 1.5 the layout rect is **fractional** even in a plain window (1181.333×761.333) while `clientWidth/Height` (what `setSize` and `size.w/h` use) are integers; they differ by up to 0.4 px (case 4: 1109.625 vs 1110). Before the fix the pick used `clientX - rect.left` un-normalised → up to 0.27 px error (case 2: 0.27 px; case 3: 0.19 px; both inside the 1 px budget). **Fix (create-engine.ts `toCanvas`)**: local coords are now `(clientX - rect.left) · size.w / rect.width` (same for y), i.e. normalised by exactly the numbers used by `setSize`, the camera aspect and every projection; probe passes at 0.25 px (cases 4–5). Pick radius NOT touched (14 px mouse / 24 px touch).
  (b) Bitmap: three `setSize(w,h,false)` sets `canvas.width = floor(w·ratio)`; pick/projection/hover/labels work in CSS px (`size`), never in bitmap px, so the floor cannot desync them (case 5: 1665×1062 bitmap shown in 1109.625×707.927 css).
  (c) `?quality=lo|hi` was **not wired anywhere** (`tier` stayed `hi`); `create-engine.ts` now reads it like it already reads `?data=celestrak` (`options.quality` still wins). Verified `tier:"lo"`.
  (d) The frame governor lowers `pixelRatio` 1.5→1 on this machine (~28 fps), so "hi" cases alternate between 1.0 and 1.5; both were measured.
  (e) A first `lo` run executed while the browser window had been **minimised** (`outerWidth 159×27`, `screenX −21333`) → frames paused, hover marker false, one probe needed 5 px: discarded as invalid, window restored with `resize_page`, re-run = case 4.
- Not verified: OS-level mouse injection (SendInput) and a really docked DevTools panel (the MCP cannot dock it; replaced by a fractional canvas offset in the page, which exercises the same `rect.left/top` maths); DPR 1.25.

### 2. Hover affordance — PASS
- Ring kept; vertex shader `gl_PointSize = uSizePx · uPixelRatio · (1 + uPulse·(0.5+0.5·sin(2π·uTime)))`, `uPulse=0.15`, `uTime = clock.elapsedTime` written in `HoverLayer.place()` (uniform writes only, no allocations). Measured effective size over 1.2 s: **18.02 → 20.69 px** (1 → 1.15×), period ≈ 1 s. `prefers-reduced-motion: reduce` (emulated + reload): `uPulse = 0`, size constant **18.00** in 10/10 samples. `createHoverLayer(ctx)` reads `ctx.reducedMotion`; no contract change.
- Ring visible and `is-pointing` set in 6/6 hovers in cases 1–5; screenshots `t22-hover-ring-dpr1.5.webp` (dev) and `t22-prod-hover-ring.webp` (production).
- Labels: `.label{cursor:pointer}` + `.label:hover{scale:1.08}` (0.15 s transition on `scale`; the reduced-motion rule already kills transitions). Real hover (MCP `hover`): Júpiter `scale: 1.08`, `cursor: pointer`, inline `transform: translate3d(707.1px,291.9px,0)` untouched; Marte (not hovered) `scale: none`. Screenshot `t22-label-hover-scale.webp`. `LabelOverlay.tsx` needed no change.

### 3. Cursor without `!important` — PASS
`canvas.style.cursor = "pointer" | ""` in `setHover/clearHover`, re-applied at the start of the `pointerup` handler; `#scene.is-pointing{cursor:pointer}` (no `!important`, class kept as hook). Root cause of T15b: `OrbitControls.connect()` writes `style.cursor='auto'` once (OrbitControls.js:536); the inline style set by the engine now wins. `getComputedStyle(canvas).cursor === "pointer"` over a satellite in 6/6 hovers in each of cases 1–5 (also right after the previous pick/deselect/camera restore) and in production (3/3). OrbitControls only rewrites the cursor during a drag when `cursorStyle='grab'` (not used here), so the `pointerup` re-apply is defensive.

### 4. Open items
- (a) `[OrbitCompute] readback failed` — `src/engine/render/gpu-propagator.ts`: no `disposed` flag existed, so the minimal equivalent (3 lines): L161 `private disposed = false;`; in the `.catch`, before the `console.warn`: `if (this.disposed) return null;`; first line of `dispose()`: `this.disposed = true;`. A soft unmount could not be provoked here (`router.push` to an unknown route does a hard 404 navigation), so the warning's absence is **not reproduced either way**; tsc/eslint clean.
- (b) Mobile 390: `@media (max-width:480px){.masthead{max-width:calc(100vw - var(--gutter) - 40px - 16px - var(--gutter))}}`. Verified (Playwright viewport 390×844, layout only): status right edge 322 px < donate "+" left edge 338 px, status wraps to 2 lines, fps/"Copiar enlace" row (bottom 102 px) stays above the place-search (top 180 px), `scrollWidth` 390. Screenshot `t22-mobile-390-status.jpg`. Real Chrome cannot go below 501 px wide, hence Playwright for this CSS-only check.
- (c) Dev HMR: documented, no code change — `window.orbitalwatch` (`?debug`) is assigned when an engine is created; after a Fast Refresh the old engine keeps running and the surface is not rebuilt until a full reload. Reload after editing engine files when testing.

### 5. Hygiene
`.gitignore` += `.playwright-mcp/`; `.playwright-mcp/` deleted (Playwright used briefly for the 390 px check); no temp routes created. Dev server and prod server stopped, ports 3000/3001 free. New files vs. before T22: only `docs/design-references/t22-*` (5 screenshots; two PNGs ≈ 2–3 MB each) and the `.gitignore` edit. No commits.

### 6. Final gate — `npm run check` PASS (exit 0)
```
eslint: clean            tsc --noEmit: clean
 Test Files  3 passed (3)
      Tests  21 passed (21)
> next build --webpack
 Compiled with warnings (satellite.js topLevelAwait; metadataBase not set — pre-existing)
  Running TypeScript ... Finished TypeScript in 4.0s
 ✓ Generating static pages using 6 workers (5/5) in 738ms
Route (app)
┌ ○ /
├ ○ /_not-found
└ ○ /orbitalwatch
```
Production smoke (`npx next start -p 3000` on that build, real Chrome DPR 1.5; `window.orbitalwatch` is `undefined` as designed): earth → solar OK; solar → galaxy OK (a click sent right after the solar transition was ignored while the engine was busy; OK after ~8 s, same behaviour as dev) → earth OK; 3 satellite picks: hover set `is-pointing` + computed cursor `pointer`, click opened STARLINK-15115 (NORAD 15115), STARLINK-11614, IRIDIUM 33 DEB (NORAD 25763); hover ring visible (`t22-prod-hover-ring.webp`); deep link `?view=solar&focus=mars` → `view-solar`, panel "Marte", URL keeps `focus=mars` (`t22-prod-deeplink-mars.webp`). Production "correct object" ground truth is **unverifiable** (debug surface disabled by design); pick correctness is established by §1 on the dev build, same code.
