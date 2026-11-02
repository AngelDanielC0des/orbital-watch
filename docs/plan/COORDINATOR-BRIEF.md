# Coordinator brief (Sonnet 5.5 high)

Read `docs/plan/PLAN.md` (whole) and `docs/orchestration/00-context-map.md`. Tasks live in `docs/plan/tasks/`. Workers receive **only** their task file + the K exemplars it names + the fixed worker rules; never the whole plan.

## Tiers → models
- `haiku` → Haiku (mechanical, objective acceptance). `sonnet5-medium` → Sonnet 5 medium. `sonnet55-high` → Sonnet 5.5 high (fills the architect's skeleton).
- Escalate a task one tier up if it fails acceptance twice.

## Wave order and parallelism
| Wave | Run in parallel | Then |
|---|---|---|
| 0 | T00 (only with explicit user authorization; otherwise skip) | — |
| 1 | T01 · T02 · T05a | gate A |
| 2 | T03 | T04 (sequential after T03) → gate B |
| 3 | T06 · T05b · T07 · T08 · T09 · T10 (ownership disjoint; only T07 edits `OrbitalWatch.tsx`) | gate C |
| 4 | T11 · T12 · T18 · T19 (T18 is the only one touching `package-lock.json`) | gate C |
| 5 | T13 · T14 | gate C + 390 px |
| 6 | T16 · T17 → T20 (depends on T16) | gate C |
| 7 | T15 | final |
| 8 | T21 (done) | T15b |
| 9 | T22 — last task; mandatory `npm run check` green + clean `git status` before the final report | final |

Gates: **A** = `npx tsc --noEmit` + `npx eslint src` + boundary `rg` (PLAN §7). **B** = A + `npm run dev`, `/orbitalwatch` renders globe and satellites, 0 console errors. **C** = B + `npm run check` + smoke list in PLAN §7. Only you run `npm run check`.

## Control points
1. Before wave 2: `git diff --stat src/engine/contract.ts` must be empty. Any worker wanting to change K1 must `ask`; approve only additive optional fields and record the change in PLAN §3 as a new ADR line.
2. After T03: `rg -n "MOVE main.ts" src/engine/create-engine.ts` must be empty; every `E/main.ts` region 59-1101 is accounted for (T03 owns all except 480-483 → T06, 805-811 → T08, 693-742 → dropped/T07).
3. After each wave: reject diffs touching files outside the task's Ownership, anything under `docs/` (except T15's report) or `src/engine/render/*` bodies.
4. Keep the app runnable between waves; if gate B fails, fix within T03/T04 before starting wave 3.
5. Wave 4+: `npm run check` includes `vitest run` once T18 lands; a red test blocks the gate.

## When to escalate (via `ask` to your coordinator / the user)
- Authorization for T00 (commit) and for any later commit. Never commit or push on your own.
- A worker needs a K1 contract change that is not purely additive.
- `npm run check` fails for a reason outside the plan (Next/webpack config, dependency versions).
- Missing data: Stripe link, contact email, product name/domain (PLAN §6). Ask once, in one message, before wave 4; if unanswered, proceed with the safe defaults (empty env, disabled button).

## Reporting
After each gate, one message: wave, tasks done, gate output (pasted tail), open issues. At the end: PLAN §8 checklist state + T15 report path + the 3 steps to add an ozone layer (new `src/engine/layers/ozone-layer.ts` copying K4 → one line in `registry.ts` → id in `DEFAULT_LAYERS`/`LayerPanel`).
