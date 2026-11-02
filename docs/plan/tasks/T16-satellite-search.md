# T16 — Satellite search by name / NORAD id (new feature)
Tier: sonnet55-high · Wave: 6 · Depends: T13

**Target**: `src/engine/create-engine.ts` (`findSatellites` stub only), new `src/components/sites/orbitalwatch/HUD/SatelliteSearch.tsx`, `OrbitalWatch.tsx` (mount line only).
**Change**: engine: implement `findSatellites(query, limit = 8): SatelliteMatch[]` over the loaded catalog (`entry.omm.OBJECT_NAME`, `entry.omm.NORAD_CAT_ID`): trim + lower-case, prefix matches first then substring, `[]` when the catalog is not loaded or the query is < 2 chars; only indices visible under the current filter. UI: `<SatelliteSearch handle={handle} />` next to the place search (same `.place-search` styling, id `#sat-search`), debounce 120 ms, results list with name · NORAD · category swatch, Enter/click → `handle.selectSatellite(index)`; Escape clears; keyboard arrows move the active row (`aria-activedescendant`). Hidden unless `view === "earth"`.
**Pattern**: `HUD/PlaceSearch.tsx` (after T06) for markup/state; engine stub comment in `create-engine.ts`.
**Constraints**: K1 frozen (`SatelliteMatch` already defined); no per-frame work; engine search is synchronous and allocation-light (pre-lowercased names cached once after catalog load).
**Ownership**: `create-engine.ts` (`findSatellites` + a cached `searchIndex` built in `boot` after the catalog), `HUD/SatelliteSearch.tsx`, `OrbitalWatch.tsx` (one mount line).
**Acceptance**: `npx tsc --noEmit`; `npx eslint src/engine src/components/sites/orbitalwatch`; guard `rg` → 0; typing "iss" lists "ISS (ZARYA)" first and selecting it follows the station; "25544" also finds it.
**HINTS**: catalog type `CatalogEntry` in `src/types/orbital.ts:78-88`; `select(index)` already validates view/busy.
**Pitfalls**: building the index per keystroke; searching synthetic catalog names (fine, but mark results with the `synthetic` badge); selecting an index hidden by the current filter (filter first, or call `setFilter("all")` before `selectSatellite`).
