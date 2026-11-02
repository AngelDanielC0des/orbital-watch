# T11 — Delete the legacy imperative layer
Tier: haiku · Wave: 4 · Depends: T05b, T06, T07, T08, T09, T10

**Target**: delete `src/components/sites/orbitalwatch/engine/{main,hud,space-ui,places,donate}.ts` and the now-empty `engine/` directory; delete `src/hooks/useOrbitalEngine.ts`; delete `src/engine/layers/earth-layer.ts`'s leftover eslint-disable line if any remains.
**Change**: removals only, plus removing any import that referenced them (`rg -n "engine/(main|hud|space-ui|places|donate)\"|useOrbitalEngine" src`). Then run the guards.
**Pattern**: none.
**Constraints**: no other edits; if a reference survives in a file you do not own, stop and report to the coordinator.
**Ownership**: the deleted files; import lines in files that referenced them.
**Acceptance**: `npx tsc --noEmit` → 0; `npx eslint src` → 0; guard `rg` (PLAN §7) → 0; `rg -n "window\.orbitalwatch" src` → only inside `create-engine.ts` behind `NODE_ENV !== "production"`; `ls src/components/sites/orbitalwatch/engine` → does not exist.
**HINTS**: context map §Current data flow lists all consumers of the dead modules.
**Pitfalls**: deleting `src/engine/render/*` (those are the live renderers); deleting `DonateSheet.tsx` (React UI, stays); running `npm run check` (coordinator only).
