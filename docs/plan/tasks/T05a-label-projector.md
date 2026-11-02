# T05a — Pure label projector in the engine
Tier: sonnet55-high · Wave: 1 · Depends: —

**Target**: new `src/engine/label-projector.ts`. Source of truth: `E/space-ui.ts:196-295` (`addLabels`, `updateLabels`); read only those lines.
**Change**: port the *math* of `updateLabels` (world → screen, sphere occlusion, distance scale/fade, focus handling) into a pure function:
```ts
export type LabelGroup = "earth" | "solar" | "galaxy";
export interface LabelDef { key: string; name: string; color: string; group: LabelGroup }
export interface Occluder { center: Vector3; radius: number }
export function projectLabels(defs: readonly LabelDef[], resolve: (key: string) => Vector3 | null,
  camera: PerspectiveCamera, width: number, height: number, occluders: readonly Occluder[],
  focusKey: string | undefined, out: LabelProjection[]): void; // mutates `out`, zero allocation per frame
export const EARTH_LABELS: readonly LabelDef[];           // mirrors E/main.ts:469-477 (Luna, Sol)
export function solarLabels(focusables: ...): LabelDef[]; // from solar.focusables (key, def.name, def.color)
export function galaxyLabels(labels: ...): LabelDef[];
```
`LabelProjection` is defined in `src/engine/contract.ts` (K1): reuse it, do not redefine.
**Pattern**: K1 `FrameSnapshot.labels` doc comment.
**Constraints**: no DOM, no React; identical visual result to `SpaceUi.updateLabels` (same thresholds and eases).
**Ownership**: `src/engine/label-projector.ts` only.
**Acceptance**: `npx tsc --noEmit` → 0; `npx eslint src/engine/label-projector.ts` → 0; boundary guard `rg` (PLAN §7) → 0.
**HINTS**: `E/main.ts:864-867` resolvers; call sites `:902`, `:934`, `:940` show `occluders` and `universe.focus` arguments; `LabelProjection` fields in `src/engine/contract.ts`.
**Pitfalls**: allocating `Vector3`/arrays per frame (module-level temps, reuse `out[i]`); changing fade thresholds "to look better"; editing `space-ui.ts` (it keeps running until T11).
