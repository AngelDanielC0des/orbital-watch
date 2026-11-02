# `.agent/` — environmental layers phase (ozone · air quality · fires)

Planning artefacts produced by Fable 5.1 on 2026-11-02 for execution by Opus 5.5 (effort medium) with Sonnet workers in ADE Orca. No application code was written in this phase except demo assets under `public/sites/orbitalwatch/data/`.

| File | Purpose |
|---|---|
| `Claude.md` | Phase rules complementing the repo `AGENTS.md` |
| `system-prompt.md` | System prompt for Opus 5.5 |
| `initial-task.md` | First task prompt for Opus 5.5 (waves, gates, outputs) |
| `development-plan.md` | Verified starting point, data architecture, layer design, technical architecture, budgets, open questions |
| `missions.md` | M001–M021 with ownership, agent, done criteria, verification, commit |
| `delegation-policy.md` | Opus ↔ Sonnet matrix and worker spec template |
| `api-research.md` | Verified API comparison, GIBS identifiers, FIRMS/Open-Meteo facts, recommendations |
| `ux-design.md` | Drawer, rows, states, responsive, accessibility, legends, asset prompts |
| `risk-matrix.md` | 30 risks with probability, impact, mitigation, owner, signal |
| `verification-checklist.md` | Code, functional, data, visual, 3D, performance checks |
| `commit-template.md` | Commit message template and rules |
| `branch-strategy.md` | Branch/worktree/PR/preview plan |
| `orca-command.md` | How to launch Opus in Orca (interactive and CLI template) |
| `STATUS.md` | Created by Opus at M001; running log of gates, numbers, unverified items |

Demo assets saved today: `public/sites/orbitalwatch/data/ozone-snapshot-omi-2026-10-29.png` (GIBS WMS 2048×1024), `ozone-snapshot-omps-2026-10-30.png`, `colormap-OMI_Ozone_TOMS_Total_Column.xml`, `colormap-OMI_Nitrogen_Dioxide_Tropo_Column.xml`.
