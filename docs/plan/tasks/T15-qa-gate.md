# T15 — Final QA gate
Tier: sonnet55-high · Wave: 7 · Depends: T12, T13, T14, T16, T17, T18, T19, T20

**Target**: whole app; fixes limited to what the gate finds (report before editing files outside `src/components/sites/orbitalwatch`, `src/engine`, `src/hooks`, `src/stores`).
**Change**: run and record in `docs/plan/QA-REPORT.md` (≤60 lines): (1) `npm run check` output summary (includes `vitest run` after T18); (2) smoke on `/orbitalwatch` (Playwright or chrome-devtools MCP): globe + satellites visible, 0 console errors/warnings except the Stripe dev warning, earth → solar → galaxy → earth, each filter, play/pause/speed/scrub/now, select a satellite and close, select Mars and close, place search; satellite search ("ISS" → select); layer toggles; deep link `/orbitalwatch?view=solar&focus=mars` opens on Mars; hidden-tab pause (switch tab 5 s, come back: no time jump, no console error); repeat at 390×844; (3) leak test: mount/unmount `<OrbitalWatch/>` ×3 (navigate to `/` and back, or toggle a route) → `window.orbitalwatch.renderer.info.memory` (`?debug`) geometries/textures and JS heap return to the first-mount baseline ±5 %; (4) 60 Hz check: React Profiler on Timeline/SatellitePanel/LabelOverlay → 0 commits during 5 s idle playback; (5) boundary guard `rg` and `rg -n "\bany\b|@ts-ignore|as unknown as" src` → 0 (except `any` inside `node_modules` types).
**Pattern**: PLAN.md §7.
**Constraints**: fixes must be minimal and inside the ownership of the task that introduced the bug (reassign via the coordinator if not trivial).
**Ownership**: `docs/plan/QA-REPORT.md`; bug-fix edits by exception, listed in the report.
**Acceptance**: all five checks green and documented; `git status` shows only intended files.
**HINTS**: debug surface fields (`renderer`, `scene`, `sats`) per ADR-9; dev server `npm run dev` on Windows.
**Pitfalls**: counting the StrictMode dev double-mount as a leak (compare after the second mount); measuring heap without forcing GC (use chrome-devtools `take_heapsnapshot` twice); reporting "passes" without pasted command output.
