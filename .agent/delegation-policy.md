# Delegation policy — Opus 5.5 (medium) ↔ Sonnet workers

## Rules
1. Opus owns every decision that, if wrong, contaminates other files: contracts, engine integration, render loop, memory, performance, security of routes, final QA.
2. Sonnet receives **self-contained specs**: target files (Ownership), the exemplar to copy, the exact types to implement, acceptance commands. Never the whole plan. A Sonnet task must be verifiable with `npx tsc --noEmit`, `npx eslint <files>` and, when applicable, `npx vitest run <path>`.
3. Sonnet never edits: `src/engine/create-engine.ts`, `src/engine/render/**` (frozen renderers; only `overlay-shaders.ts` and `lut.ts` are new files owned by Opus), `src/engine/contract.ts`, `src/lib/engine/layer-manager.ts`, `src/hooks/useEngine.ts`, `src/stores/engine-bridge.ts`, `package.json`/lockfile, `next.config.ts`, `eslint.config.mjs`.
4. Opus reviews every Sonnet diff with `git diff --stat` against the Ownership list; out-of-scope edits are reverted and the task relaunched with the correction.
5. A failed Sonnet task gets one retry with the literal error; a second failure is taken over by Opus.
6. Opus does not implement what a Sonnet can do from an exemplar (components, mappers, tests, docs). Opus time goes to M001, M003 (registry/stubs), M004 (hook state machine), M009, M010, M017, M018, M021 and reviews.

## Matrix

| Task | Agent | Risk | Context needed | Validation |
|---|---|---|---|---|
| ADR-15 + architecture verification (M001) | Opus | high | contract, registry, create-engine anchors | note in `.agent/STATUS.md` |
| `src/types/layers.ts` from the sketch (M002) | Sonnet | low | `development-plan.md §4.2`, `src/types/engine.ts` | `tsc`, no `any` |
| Additive facade members in `types/engine.ts`/`contract.ts` (M002) | Opus review | medium | K1 rules | diff ≤ 15 lines, optional fields only |
| `LAYER_CATALOG`, `attribution.ts` (M003) | Sonnet | low | `api-research.md §5`, `ux-design.md` copy | `tsc`, `satisfies Record<LayerId,…>` |
| Registry entries + stub layers (M003) | Opus | medium | registry, earth-layer exemplar | app boots, 0 console errors |
| `result.ts`, `validate.ts`, `geo-cache.service.ts` + tests (M004) | Sonnet | low | sketch | vitest |
| `layers-store.ts` + test (M004) | Sonnet | low | `engine-store.ts` exemplar | vitest |
| `useLayerData` / `useEnvironmentalLayers` state machine (M004) | Opus | high | hooks, FrameBus rules, StrictMode | manual + profiler |
| GIBS server helper + ozone service + legend generator (M005) | Sonnet | medium | `api-research.md §2`, exact URLs | vitest + node smoke |
| Sample points list, Open-Meteo normaliser, pollutant scales (M006) | Sonnet | low | `api-research.md §4`, WHO/EAQI breakpoints | vitest + live dry run |
| FIRMS streaming parser + binner (M007) | Sonnet | medium | CSV schema, memory limits | vitest + 24 h file timing |
| Review of FIRMS memory behaviour (M007) | Opus | medium | parser code | RSS < 150 MB |
| Route Handlers (M008) | Sonnet | medium | Next 16 `route.md`, envelope spec | `curl` smoke, 400 on bad params |
| Raster overlay renderer + facade one-liners (M009) | Opus | high | earth.ts shader, LayerManager | screenshot alignment, memory baseline |
| Points + heatmap renderers (M010) | Opus | high | satellites-layer pitfalls, DPR | draw calls, fps |
| Drawer, rows, toggles, sliders, selectors (M011) | Sonnet | medium | `ux-design.md`, LayerPanel/FilterBar exemplars | keyboard, store wiring |
| Deep links for layers (M011) | Sonnet | low | `useUrlState.ts` | round-trip test |
| Mount wiring in `OrbitalWatch.tsx` (M011) | Opus review | medium | shell | no extra re-renders |
| Legends + strip (M012) | Sonnet | low | scale modules | visual |
| Loading/error/empty components (M013) | Sonnet | low | copy in `ux-design.md §3` | forced error flag |
| Badges, footer, README sources (M014) | Sonnet | low | attribution texts | visual |
| Responsive sheet (M015) | Sonnet (+Opus visual check) | medium | 390 px references | screenshots |
| Snapshot script + fallback chain (M016) | Sonnet | low | server helpers | offline test |
| Performance pass (M017) | Opus | high | budgets | numbers in STATUS |
| Disposal / leak test (M018) | Opus | high | dispose paths | heap diffs |
| Unit tests (M019) | Sonnet | low | fixtures in `api-research.md` | `npm run test` |
| Documentation (M020) | Sonnet | low | plan | review |
| Final QA + handoff (M021) | Opus | high | checklist | all ticks |

## Sonnet worker spec template
```
Task: <M0xx name>
Target: <files to create/edit — Ownership>
Pattern: read <exemplar path> first and copy its shape
Change: <bullet list, exact types/function signatures>
Constraints: TypeScript strict, no `any`/`@ts-ignore`/`as unknown as`, named exports, 2-space indent, Spanish UI copy from ux-design.md, no edits outside Ownership (ask instead), no network in tests (mock fetch), read node_modules/next/dist/docs/ before any Next API.
Acceptance: npx tsc --noEmit · npx eslint <files> · npx vitest run <path> · <manual check>
Report: 3 sentences + files modified + anything unverified.
```
