# T18 — Unit tests for the pure modules (vitest)
Tier: haiku · Wave: 4 · Depends: T05a, T04

**Target**: `package.json` (devDependency `vitest`, scripts `"test": "vitest run"`, `"check": "npm run lint && npm run typecheck && npm run test && npm run build"`), new `vitest.config.ts` (alias `@` → `./src`, `environment: "node"`, include `src/**/*.test.ts`), new tests: `src/lib/frame-bus.test.ts`, `src/stores/engine-bridge.test.ts`, `src/engine/label-projector.test.ts`.
**Change**: run `npm install -D vitest` (this is the only task allowed to change `package-lock.json`). Tests: FrameBus — subscribe receives `last` immediately, publish fans out, a throwing listener does not break others, `clear` drops listeners. Bridge — `formatRelative` ("en vivo", "+1.5 d", "−3.0 h"), `onTimeTick` throttles to ≤1 write/s unless `playing/speed/live` changed, `onError("catalog-failed")` does not set a loading error. Label projector — a label in front of the camera lands near the screen centre; one behind the camera is `visible === false`; occluded by a sphere → not visible; `out` array identity preserved. Use a fake store (`{ getState: () => actions }`) and `three` real classes (`PerspectiveCamera`).
**Pattern**: none; plain `describe/it/expect`.
**Constraints**: no DOM environment (node); do not test React components; do not touch the modules under test.
**Ownership**: `package.json` (scripts/devDependencies), `package-lock.json`, `vitest.config.ts`, the three test files.
**Acceptance**: `npm run test` → all green; `npx tsc --noEmit` → 0 (tests are type-checked; add `"types": ["vitest/globals"]` only if you use globals — prefer explicit imports).
**HINTS**: `formatRelative` is exported from `src/stores/engine-bridge.ts`; `projectLabels` signature in `docs/plan/tasks/T05a-label-projector.md`.
**Pitfalls**: `environment: "jsdom"` (not installed, not needed); `performance.now` exists in node ≥16 — use `vi.spyOn(performance, "now")` to drive the throttle; Windows path aliases in vitest config (`fileURLToPath(new URL("./src", import.meta.url))`).
