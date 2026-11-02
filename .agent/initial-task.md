# Initial task for Opus 5.5 (effort medium)

Repository: `C:\Users\angel\Desktop\orbital-watch\orbital-watch`, branch `refactor/engine-react-facade` (create the work branch described in `.agent/branch-strategy.md` first).

## Goal
Add three environmental layers to OrbitalWatch (ozone column, surface air quality, active fires) as clean plugins over the existing `ILayer`/`LayerManager`/registry system, with data flowing through services and Route Handlers (never through the engine), a layers drawer UI with legends, attribution, freshness badges, loading/error/empty states, demo fallbacks, and verified performance and disposal. The project must stay green (`npm run check`) at every commit.

## Inputs (read in this order, nothing else first)
1. `.agent/Claude.md` — project rules for this phase.
2. `.agent/development-plan.md` — verified starting point, data architecture, layer design, technical architecture, budgets, open questions.
3. `.agent/missions.md` — M001…M021 with ownership, agent, done criteria, commits.
4. `.agent/delegation-policy.md` — what to delegate to Sonnet and how.
5. `.agent/api-research.md` — verified API facts, URLs, identifiers, fixtures.
6. `.agent/ux-design.md`, `.agent/risk-matrix.md`, `.agent/verification-checklist.md`, `.agent/commit-template.md`, `.agent/branch-strategy.md`.
Then only the code files each mission names.

## Procedure
1. **Wave 0 — M001**: verify the architecture facts, write the 15-line note in `.agent/STATUS.md`, add ADR-15 to `docs/plan/PLAN.md §3`. Ask the user once for commit authorization for this phase (one message, also listing the open questions in `development-plan.md §6` with your defaults). Do not block on the answers: proceed with the defaults.
2. **Wave 1 — M002, M003, M004** in parallel: delegate M002 types and M004 utilities/store/tests to Sonnet with the spec template; implement the registry stubs (M003) and the hook state machine (M004) yourself. Gate: `npm run check`, app boots unchanged.
3. **Wave 2 — M005, M006, M007 (Sonnet, parallel), then M008 (Sonnet)**. Review FIRMS parser memory and the ozone fallback chain. Gate: `curl` smoke on the three routes.
4. **Wave 3 — M009 and M010 yourself**, while Sonnet builds M011–M014 against the stub layers. Gate B: `npm run dev`, `?layers=ozone,pollution,fires` renders all three aligned with coastlines, 0 console errors.
5. **Wave 4 — M015, M016 (Sonnet)**. Gate: 390 px screenshot, offline fallback.
6. **Wave 5 — M017, M018 yourself**: budgets and leak test with numbers in STATUS.
7. **Wave 6 — M019, M020 (Sonnet)**. Gate: `npm run check`.
8. **Wave 7 — M021 yourself**: run the whole checklist, screenshots, final STATUS report.

## Output expected from you
- Commits per mission (only after authorization), messages per `.agent/commit-template.md`.
- `.agent/STATUS.md` updated at every gate: wave, missions done, gate output tail, open issues, unverified items.
- Final report to the user (≤ 30 lines): what shipped, evidence paths, measured numbers (fps, draw calls, memory, payloads), what remains, decisions taken under default assumptions.

## Hard limits
- No edits to frozen files (see system prompt rule 3) or to `src/engine/contract.ts` beyond ADR-15.
- No new dependencies without asking (the plan needs none).
- No API keys. No WAQI.
- If a verified fact in `api-research.md` turns out false (e.g., GIBS layer removed), switch to the documented fallback, note it in STATUS, continue.
