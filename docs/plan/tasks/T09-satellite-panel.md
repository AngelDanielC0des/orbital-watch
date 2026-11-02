# T09 — SatellitePanel: static fields from store, live readouts via FrameBus
Tier: sonnet5-medium · Wave: 3 · Depends: T04

**Target**: `src/components/sites/orbitalwatch/HUD/SatellitePanel.tsx` (139 l).
**Change**: panel open/close + static fields (`name, norad, cospar, country, launch, inc, period, perigee, apogee, epoch, kind, synthetic badge`) come from store `selectedSatellite` (`{ index, entry, synthetic }`, set once per selection). `alt / vel / lat / lon` are written imperatively from `FrameSnapshot.readout` (`Sgp4Readout`) using the K5 pattern with `ref`s. Close button → `handle.deselectSatellite()`. Accessibility: `role="dialog" aria-labelledby=<name id>`; on open move focus to the close button and restore focus to the previously focused element on close; Escape closes. Formatting identical to `E/hud.ts:250-296` (`showPanel`, `updatePanel`; read only those lines).
**Pattern**: K5 `ClockReadout.tsx`.
**Constraints**: no readout in state or store; no engine edits; keep existing classNames/ids so `orbitalwatch.css` still applies.
**Ownership**: `HUD/SatellitePanel.tsx`.
**Acceptance**: `npx tsc --noEmit`; `npx eslint src/components/sites/orbitalwatch/HUD/SatellitePanel.tsx`; select a satellite: panel shows its data and alt/vel/lat/lon tick live; Profiler: 0 commits while following.
**HINTS**: `SelectedSatelliteState` in `src/types/orbital.ts`; snapshot `readout` is `null` when nothing is selected (clear the fields, do not throw).
**Pitfalls**: subscribing to the FrameBus while the panel is closed (subscribe only when `selectedSatellite` is non-null); `toFixed` on `null`; relying on `selectedSatellite.index === 0` (bug fixed in T03: trust the index now).
