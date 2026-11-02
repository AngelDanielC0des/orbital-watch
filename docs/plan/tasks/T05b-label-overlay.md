# T05b — `LabelOverlay.tsx` (imperative, ref-based)
Tier: sonnet5-medium · Wave: 3 · Depends: T04, T05a

**Target**: fill the stub `src/components/sites/orbitalwatch/HUD/LabelOverlay.tsx` (already mounted by T04 with final props; `defs` are passed by the shell from `label-projector.ts` exports — if the shell passes `[]`, build `defs` inside the component from `EARTH_LABELS` + `solarLabels(...)`/`galaxyLabels(...)` exported by `src/engine/label-projector.ts`).
**Change**: props `{ frames: FrameBus<FrameSnapshot>; defs: readonly LabelDef[]; onPick(key: string): void }`. Renders one `<button class="label" data-key>` per def once (React), then subscribes to `frames` in a `useEffect` and writes `style.transform/opacity` and `hidden` on the DOM nodes it owns via a `Map<key, HTMLElement>` of refs, reading `snapshot.labels` (same key order). Clicks call `onPick(key)` → `handle.focusBody` / `setView` like `onLabel` did (`E/main.ts:443-459` semantics are already inside the engine as `handle.pickLabel(key)` if T03 exposed it; otherwise use `setView`/`focusBody`). CSS for `.label` stays in `orbitalwatch.css` (ADR-8).
**Pattern**: K5 `ClockReadout.tsx` (subscribe in effect, write DOM, no setState).
**Constraints**: zero `useState` per frame; unsubscribe in cleanup; the markup/classes must match `E/space-ui.ts:196-224` output (read those lines only) so CSS is unchanged.
**Ownership**: `HUD/LabelOverlay.tsx` only (do not edit `OrbitalWatch.tsx`).
**Acceptance**: `npx tsc --noEmit`; `npx eslint src/components/sites/orbitalwatch/HUD/LabelOverlay.tsx`; in `/orbitalwatch` solar view: planet labels follow bodies and hide when occluded; React DevTools profiler shows 0 commits from the overlay while idle.
**HINTS**: `FrameSnapshot.labels` shape in `src/engine/contract.ts`; `LabelDef` lists exported by `src/engine/label-projector.ts`.
**Pitfalls**: re-rendering on every frame (storing labels in state); creating a second writer on `#labels` (delete the old static div); subscribing in render instead of effect; forgetting to re-subscribe when `frames` changes (StrictMode remount).
