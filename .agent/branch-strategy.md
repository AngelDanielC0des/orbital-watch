# Branch / worktree strategy

Current state: branch `refactor/engine-react-facade` (clean, PR target `master`), deployed to Vercel from the CLI (not Git-connected).

## Recommended
1. Merge or rebase `refactor/engine-react-facade` into `master` first if the user agrees (it is complete and green). If not, branch from it.
2. Create `feat/environmental-layers` from the chosen base:
   ```
   git switch -c feat/environmental-layers
   ```
3. Orca workers run with `--worktree current` as in the previous phase (`docs/orchestration/02-sonnet-coordinator-prompt.md`): disjoint Ownership per mission makes a shared worktree safe. Use a separate worktree only for M009/M010 if Opus wants to iterate on shaders while Sonnet UI tasks run:
   ```
   git worktree add ../orbital-watch-engine feat/environmental-layers-engine
   ```
   and merge back with a fast-forward after gate B.
4. One commit per mission (see `commit-template.md`); wave gates are the only points where `npm run check` must be green and are the natural squash boundaries if the user prefers fewer commits.
5. Open the PR `feat/environmental-layers → master` after M021 with the PR body: summary, evidence screenshots, measured numbers, data sources and licences, open questions, and the trailer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
6. Vercel: deploy a preview with `vercel deploy` (no env vars needed), check `/api/orbital/*` and `/orbitalwatch?layers=ozone,pollution,fires` on the preview URL before promoting.

## Never
- Push or commit without authorization.
- Rewrite history of `master`.
- Keep snapshot binaries > 400 KB in Git.
