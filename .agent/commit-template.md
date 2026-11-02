# Commit template (one mission = one commit)

```
<type>(<scope>): <imperative summary ≤ 72 chars>

Mission: M0xx — <name>
Why: <1–2 lines: the user-visible or architectural reason>
What: <3–6 bullets of concrete changes, file-level>
Verification: <commands run and their result tail, e.g. "tsc clean · eslint 0 · vitest 29/29 · dev smoke: ozone aligned, 0 console errors">
Not verified: <explicit list or "none">

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

Types: `feat`, `fix`, `perf`, `test`, `docs`, `chore`, `refactor`. Scopes: `types`, `layers`, `engine`, `ozone`, `pollution`, `fires`, `api`, `ui`, `store`, `hooks`.

Rules
- Never commit without the user's authorization for the wave (ask once per phase; the answer covers all missions unless the user says otherwise).
- Do not commit generated snapshot files above 400 KB.
- `npm run check` must be green at every wave gate commit; per-mission commits need `tsc` + `eslint` + relevant `vitest` green.
- Keep the attribution trailer exactly as above when the committing agent is Claude; when a Sonnet worker's change is committed by Opus, keep the same trailer (Claude Code attribution policy).
