# T10 — BodyPanel: body facts from store, distance via FrameBus
Tier: sonnet5-medium · Wave: 3 · Depends: T04

**Target**: `src/components/sites/orbitalwatch/HUD/BodyPanel.tsx` (108 l).
**Change**: body facts from store `selectedBody` (`BodyDef`), shown/hidden by its nullness; `dist` / `dist-unit` / `light` / `light-unit` written imperatively from `FrameSnapshot.bodyDistanceKm` using the K5 pattern (format exactly like `E/space-ui.ts:296-340` `showBody`/`updateBodyDistance`; read only those lines). Accessibility as in T09 (`role="dialog"`, focus to close on open, restore on close, Escape). Close → `handle.setView("solar")` (solar overview semantics of `onCloseBody`, `E/main.ts:464-469`). Remove `bodyDistance` from the store if nothing else reads it (coordinate with T04 owner: T04 owns the store; file a note instead of editing).
**Pattern**: K5 `ClockReadout.tsx`.
**Constraints**: no store/engine edits; keep classNames/ids for CSS.
**Ownership**: `HUD/BodyPanel.tsx`.
**Acceptance**: `npx tsc --noEmit`; `npx eslint src/components/sites/orbitalwatch/HUD/BodyPanel.tsx`; focus Mars: panel shows facts and the distance updates while time runs at 1000×.
**HINTS**: `BodyDef` in `src/types/orbital.ts:101-115`; snapshot field `bodyDistanceKm` (`NaN` when no body is focused).
**Pitfalls**: computing light-time in React per frame with allocations (precompute units once per selection; write only when the rounded value changes); forgetting to unsubscribe when the panel closes.
