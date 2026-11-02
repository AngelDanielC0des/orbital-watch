# T08 — Timeline: per-frame clock via FrameBus, scrub via facade, inset via `setTimelineInset`
Tier: sonnet5-medium · Wave: 3 · Depends: T04

**Target**: `src/components/sites/orbitalwatch/HUD/Timeline.tsx` (119 l), `HUD/ClockReadout.tsx` (K5, reuse as-is).
**Change**: clock date/relative text and the scrubber thumb position are written imperatively from `FrameSnapshot` (`simMs`, `offsetMs`, `live`, `scrubbing`) using the K5 pattern; play/speed/now buttons read `time.playing/speed` from the store (≤4 Hz) and call `handle.togglePlay/setSpeed/seekNow`; scrubber `pointerdown/input/change` → `handle.scrubDays(days)` with the same mapping as `E/main.ts:735-742` (read only those lines); a `ResizeObserver` on the timeline root calls `handle.setTimelineInset(height)` (ADR-7) and cleans up. Marks (`mark-start/end/now`) are static or updated on tick, never per frame via state.
**Pattern**: K5 `ClockReadout.tsx`.
**Constraints**: no `useState` written from the FrameBus; `time.ms` must not be read for display (it is ≤1 Hz); do not edit the engine or the store.
**Ownership**: `HUD/Timeline.tsx`.
**Acceptance**: `npx tsc --noEmit`; `npx eslint src/components/sites/orbitalwatch/HUD/Timeline.tsx`; React Profiler: Timeline commits 0 times during 5 s of idle playback at 1×; scrubbing moves the sim and `live` text flips to "en vivo" on Now.
**HINTS**: old DOM writes `E/hud.ts:212-249` (`setClock`) for formats (read only those lines); facade methods in `src/types/engine.ts` `EngineCommandFacade`; `FrameSnapshot` in `src/engine/contract.ts`.
**Pitfalls**: formatting dates with `Intl` per frame (cache the formatter; skip writes when the second did not change); writing the scrubber value while the user drags (`scrubbing` flag in snapshot); forgetting `ResizeObserver.disconnect()`; keeping `useEngineStore((s) => s.time)` whole-object selector (re-render on every tick: select fields).
