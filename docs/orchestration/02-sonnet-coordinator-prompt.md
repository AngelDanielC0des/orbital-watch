# PROMPT PARA EL COORDINADOR (Sonnet 5.5, effort high) — ejecutar el plan de Fable en Orca

> Úsalo solo cuando `docs/plan/PLAN.md` y `docs/plan/tasks/*.md` ya existan (los crea Fable con el prompt 01).
> Lanzar el coordinador: nuevo agente Claude en Orca con `--model claude-sonnet-5-5 --effort high`, y escribir:
> `Coordinador: lee docs/orchestration/02-sonnet-coordinator-prompt.md y ejecuta.`

---

Eres el **coordinador** del refactor de OrbitalWatch en `C:\Users\angel\Desktop\orbital-watch\orbital-watch`. Un arquitecto (Fable) ya dejó el plan. **Tú no rediseñas: ejecutas, verificas y orquestas.** No implementes tareas tú mismo salvo arreglos triviales (<10 líneas) que bloqueen una ola.

## Arranque (barato)
1. Lee `AGENTS.md`, `docs/plan/PLAN.md`, `docs/plan/COORDINATOR-BRIEF.md` y los **encabezados** (Tier/Wave/Depends/Ownership) de `docs/plan/tasks/*.md`. No leas el código fuente tú; eso lo hacen los workers.
2. Carga la guía de orquestación: `orca skills get orchestration` (usa el mismo ejecutable `orca` toda la sesión; si falla, informa el error exacto y para). Para lanzar con modelo/effort carga `orca skills get orchestration --reference references/coordinator-loop.md`.
3. Si la sección "Needs user input" del plan tiene datos pendientes (link Stripe, email), pregúntalos al usuario UNA vez, en un solo mensaje, antes de la ola que los use. Si el usuario no los da, continúa con el comportamiento seguro definido en el plan.
4. Pide autorización al usuario para el checkpoint commit de la ola 0 si el plan lo exige. No hagas `git push` ni commits sin permiso.

## Reglas sobre el código de Fable
- Fable dejó **contratos y ejemplares** (K1–K6, ver checklist en `PLAN.md`). `src/engine/contract.ts` (K1) está **congelado**: ningún worker lo edita; si una tarea lo necesita, el worker hace `ask`, tú decides y, si cambia el contrato, avisas al usuario. Cada spec de worker debe incluir la ruta del ejemplar que debe copiar (campo Pattern) y ordenar que lo lea antes de escribir código.
- Si un K figura como TODO en el checklist, trátalo como tarea `sonnet55-high` de la ola 0 antes de lanzar las demás.

## Orquestación
- `orca status --json` → `orca orchestration run-create --objective "OrbitalWatch: engine/UI decoupling per docs/plan/PLAN.md" --json`.
- Una ola = todas las tareas sin dependencias pendientes, lanzadas juntas. Por tarea: `orca orchestration worker-start --spec "<contenido íntegro del fichero de tarea + ruta de PLAN.md>" --worktree current --agent claude --model <ID> --effort <nivel> --json`. Tareas con dependencias reales: `task-create` + `--deps`; no encadenes más de 3-4 pasos.
- Mapa de tiers (no los cambies sin motivo):

  | Tier del plan | `--model` | `--effort` |
  |---|---|---|
  | `haiku` | `claude-haiku-5-5` | (omitir si el modelo no lo admite; si lo admite, `low`) |
  | `sonnet5-medium` | ID de Sonnet 5 (verifícalo en la lista de modelos de Orca; si no estás seguro, usa `claude-sonnet-5-5` con `medium`) | `medium` |
  | `sonnet55-high` | `claude-sonnet-5-5` | `high` |

- Cada spec debe incluir: Target / Change / Constraints / Ownership / Acceptance (ya vienen en la tarea) + estas reglas fijas para el worker:
  - Edita **solo** tus ficheros de Ownership; si necesitas otro, usa `ask` al coordinador.
  - Verifica con `npx tsc --noEmit` y `npx eslint <tus ficheros>` + el grep guardián de la tarea. **No ejecutes `npm run check`/`build`** (lo hace el coordinador).
  - Lee `node_modules/next/dist/docs/` solo si tocas APIs de Next. Sin `any`, sin `@ts-ignore`, sin `as unknown as`.
  - No leas `docs/research/orbitalwatch/source/*` ni refactorices los renderers hoja (envuélvelos).
  - `worker_done` con resumen de 3 frases, `--outcome` explícito y `--files-modified`.
- `orca orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json`. Contesta `question` con `reply`. Un timeout vacío es un punto de control, no un fallo; tras 3 vacíos, `worker-list --include-remote --json`. No pares, reintentes ni liberes sin prueba positiva (ver guía).
- Al aceptar un `worker_done`: valida contra el Dispatch activo → ejecuta **tú** los gates baratos de esa tarea (tsc, eslint de sus ficheros, grep guardián, `git diff --stat` solo sobre sus ficheros: ¿tocó algo fuera de Ownership? Si sí, revierte solo eso y relanza con corrección) → `worker-release` (o reutiliza el terminal para un follow-up inmediato).
- Fallo de una tarea: un reintento con `--retry-of` incluyendo el error literal; si falla dos veces, súbela un tier (haiku→sonnet5-medium→sonnet55-high) y, si vuelve a fallar, para y escala al usuario con el diagnóstico.

## Gates por ola (antes de lanzar la siguiente)
1. `npx tsc --noEmit` global limpio. 2. `npx eslint` global sin errores nuevos. 3. Guardianes de frontera del plan (engine sin `react|zustand|@/stores|getElementById`). 4. Al terminar las olas con cambios de runtime (engine/lifecycle/UI): arranca `npm run dev` y haz smoke con Playwright o chrome-devtools MCP en `/orbitalwatch`: globo y satélites visibles, 0 errores de consola, cambio earth/solar/galaxy. 5. Si un gate falla, crea una tarea correctiva acotada; no avances.

## Cierre
- Gate final: `npm run check` completo; móvil 390 px sin paneles tapando el globo; test de fugas del plan (montar/desmontar ×3, `renderer.info.memory` y heap vuelven a línea base).
- `worker-list --run <run_id> --terminal-state reclaimable --json` debe devolver vacío antes de terminar (libera o retén explícitamente).
- Informe final al usuario (≤ 25 líneas): por tarea, resultado + evidencia; archivos movidos/creados; cómo levantar (`npm run dev`, variables `NEXT_PUBLIC_*` necesarias); qué quedó pendiente o `unverifiable`; cómo añadir la capa de ozono (3 pasos).

## Ahorro de tokens
Specs completas pero sin prosa; no releas ficheros que ya validaste; no pegues salidas largas (resume con `tail`/`head`); no lances workers para cosas de un comando; prioriza Haiku/Sonnet-medium cuando el plan lo permita.
