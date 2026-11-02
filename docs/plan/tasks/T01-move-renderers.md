# T01 — Move leaf renderers into `src/engine/render/`
Tier: haiku · Wave: 1 · Depends: —

**Target**: `E/` = `src/components/sites/orbitalwatch/engine/`. Files `earth sky sun bodies solar galaxy satellites gpu-propagator sat-models track governor` `.ts` → `src/engine/render/<same>.ts`; `E/config.ts` → `src/engine/config.ts`; delete `E/{catalog,orbit-math,types}.ts` (pure re-exports of `src/lib/orbital/*`).
**Change**: `git mv` each file (content untouched). Fix imports only: inside moved files `./config` → `@/engine/config`, `./catalog|./orbit-math|./types` → `@/lib/orbital/<name>`; in `E/main.ts`, `E/hud.ts`, `E/space-ui.ts`, `E/places.ts`, `src/types/engine.ts`, `src/components/sites/orbitalwatch/OrbitalWatch.tsx:15` (`./engine/config` → `@/engine/config`) point to `@/engine/render/*` / `@/engine/config`. In `src/engine/layers/earth-layer.ts` remove the `eslint-disable-next-line no-restricted-imports` line and import from `@/engine/render/earth`. Same for `src/engine/contract.ts` and `src/engine/create-engine.ts` if they carry such a line.
**Pattern**: n/a (mechanical).
**Constraints**: zero changes inside renderer bodies (GLSL, method names, exports). Do not rename files.
**Ownership**: the moved files, `E/main.ts` `E/hud.ts` `E/space-ui.ts` `E/places.ts` (import lines only), `src/types/engine.ts` (import line only), `OrbitalWatch.tsx` (line 15 only), `src/engine/{contract,create-engine}.ts` + `src/engine/layers/earth-layer.ts` (import lines only).
**Acceptance**: `npx tsc --noEmit` → 0 errors; `npx eslint src/engine` → 0 errors; `rg -n "orbitalwatch/engine/(earth|sky|sun|bodies|solar|galaxy|satellites|gpu-propagator|sat-models|track|governor|config)" src` → 0 hits.
**HINTS**: import list at the top of `E/main.ts` lines 1-40; `src/types/engine.ts:2` imports `QualityTier` from E/config; `rg -n "engine/catalog\"|engine/orbit-math\"|engine/types\"" src` lists re-export consumers.
**Pitfalls**: "cleaning up" code while moving; moving `hud/space-ui/places/donate/main` (they die in T11); forgetting consumers of the deleted re-exports; editing `package-lock.json`.
