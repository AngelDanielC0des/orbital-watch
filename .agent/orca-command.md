# Launching Opus 5.5 (effort medium) in ADE Orca

The Orca CLI installed here (`orca 1.4.244`) does not expose a one-shot "run an agent with a system prompt file" command in `orca --help`; agents are launched from the Orca app or through the orchestration commands used in the previous phase (`orca orchestration worker-start --spec … --agent claude --model <ID> --effort <level>`). Two working options:

## Option A — interactive agent in Orca (recommended)
1. In Orca open the workspace `C:\Users\angel\Desktop\orbital-watch\orbital-watch`.
2. New Claude agent with model **`claude-opus-5-5`**, effort **medium**.
3. First message:
   ```
   Lee .agent/system-prompt.md y adóptalo como tus reglas. Después lee .agent/initial-task.md y ejecútalo.
   ```
   (Orca injects the repo `CLAUDE.md`/`AGENTS.md` automatically; `.agent/Claude.md` is referenced from the initial task.)

## Option B — orchestration CLI (template with placeholders, verify flags with `orca agent-context`)
```
orca status --json
orca orchestration run-create --objective "OrbitalWatch: environmental layers per .agent/development-plan.md" --json
orca orchestration worker-start \
  --spec "$(cat .agent/system-prompt.md; echo; cat .agent/initial-task.md)" \
  --worktree current \
  --agent claude \
  --model claude-opus-5-5 \
  --effort medium \
  --json
orca orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json
```
Sonnet workers spawned by Opus use the same `worker-start` with `--model claude-sonnet-5-5 --effort medium` (or `low` for mechanical tasks) and the spec template from `.agent/delegation-policy.md`.

## Generic placeholder form (if the CLI differs)
```
[ORCA_CMD] \
  --model claude-opus-5-5 \
  --effort medium \
  --system .agent/system-prompt.md \
  --prompt .agent/initial-task.md \
  --workdir "C:\Users\angel\Desktop\orbital-watch\orbital-watch"
```
Check the exact schema with `orca agent-context` before running.
