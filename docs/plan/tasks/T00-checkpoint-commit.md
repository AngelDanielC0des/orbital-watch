# T00 — Checkpoint commit
Tier: haiku · Wave: 0 · Depends: — · **Run only if the user explicitly authorizes a commit.**

**Target**: whole working tree (uncommitted over `799d173`).
**Change**: `git add -A && git commit -m "chore: checkpoint before engine/facade refactor"`. No code edits.
**Pattern**: none.
**Constraints**: do not touch files; do not push; no `--no-verify`.
**Ownership**: git index only.
**Acceptance**: `git status --short` → empty; `git log --oneline -1` shows the new commit.
**HINTS**: the generated AGENTS.md block is re-added by `next dev`; commit it as-is.
**Pitfalls**: committing without authorization; amending the initial commit.
