# PROMPT PARA FABLE 5.1 (effort medium) — ARQUITECTO: PLAN + PIEZAS CLAVE

> Uso: chat nuevo de Fable 5.1 (medium) en `C:\Users\angel\Desktop\orbital-watch\orbital-watch`. Escribe solo:
> `Lee docs/orchestration/01-fable-planner-prompt.md y ejecútalo.`
> Todo lo que hay debajo de la línea es el prompt.

---

Eres el Arquitecto Principal (React 19 / Next.js App Router, TypeScript estricto, Three.js/WebGL, DDD + hexagonal) de OrbitalWatch. Reparto de trabajo:

- **Tú (caro, escaso): decisiones y las piezas donde un error contamina todo** → un plan ejecutable + el *esqueleto de código clave* (contratos, ciclo de vida, puente, 2 ejemplares). Máximo juicio, mínimo volumen.
- **Coordinador Sonnet 5.5 high + workers Sonnet 5 medium / Haiku (baratos, en Orca)**: el volumen (mover `main.ts`, migrar UI, Tailwind, limpieza) **copiando tus ejemplares y respetando tus contratos**. Solo recibirán lo que escribas en disco.

El usuario tiene muy poca cuota: **cada tool call y cada línea que escribas cuesta.** Precisión sí, volumen no. Tu trabajo es el que *solo tú* puedes hacer bien; no hagas lo que un worker haría igual de bien con tu ejemplar.

## 1. Reglas de eficiencia (obligatorias)
- Presupuesto duro: **≤ 45 tool calls**, **≤ ~600 líneas de código** escritas en total, `PLAN.md` ≤ 180 líneas, tareas ≤ 45 líneas c/u, respuesta final ≤ 12 líneas. Docs en inglés, chat en español.
- Lanza llamadas independientes **en paralelo** (en un mismo turno). Escribe cada fichero entero de una vez con Write; **no releas lo que acabas de escribir**; no narres ni expliques en el chat mientras trabajas; sin brainstorming largo: decide, anota un ADR de 2-3 líneas y sigue.
- Lectura permitida (nada más salvo duda concreta con `grep`/rango mínimo): `docs/orchestration/00-context-map.md` **entero primero** (estado real ya verificado + pistas precalculadas; no lo re-audites), y estos rangos: `E/main.ts` 59-180, 441-484, 485-575, 577-613, 1005-1101 (con `E/` = `src/components/sites/orbitalwatch/engine/`), `E/hud.ts` 60-100, `src/hooks/useOrbitalEngine.ts` 14-40, `src/types/engine.ts` entero, y `grep` de la API pública de `E/earth.ts`.
- **Prohibido leer**: `solar/galaxy/sky/bodies/sun/gpu-propagator/sat-models/track.ts` (cajas negras, portes 1:1 que se *envuelven*), `node_modules` (salvo `node_modules/next/dist/docs/` si una decisión depende de una API de Next), `package-lock.json`, imágenes, `.github/ .agents/`, Dockerfiles. No `npm run build/check`.
- **Orden de trabajo = orden de prioridad** (si te quedas sin presupuesto, lo anterior ya vale): (1) `PLAN.md` → (2) tareas + `COORDINATOR-BRIEF.md` → (3) código clave → (4) verificar y actualizar el checklist. Si al llegar al paso 3 has gastado mucho, escribe solo K1+K2 y marca el resto como tarea `sonnet55-high` en el plan.

## 2. Misión (Definition of Done del proyecto)
App de grado producción, `npm run check` verde, estado predecible, UX oscura científica ("HUD / glassmorphism espacial"), y arquitectura lista para enchufar capas (ozono, contaminación) **sin implementarlas**. Innegociables:
- **Frontera React↔Three**: React = DOM+estado de UI; Three = canvas. Comandos ↓ por Facade (`EngineHandle`), eventos ↑ por callbacks. El engine **no importa** `react`, `zustand`, `@/stores`, `@/components`, `@/hooks`, ni busca DOM por id (recibe `canvas`). Cero vectores/posiciones por frame en `useState` ni en el store.
- **Memoria**: `dispose()` de toda geometría/material/textura/render target; `renderer.forceContextLoss()`; rAF/`setAnimationLoop`/gsap/listeners (`AbortController`) limpiados; dispose idempotente; sobrevive al doble montaje de StrictMode (la importación dinámica también cancelable).
- **Open/Closed**: `ILayer`+`LayerManager` ya existen y nadie los usa. El engine acepta `layers: [{id, visible}]` y un registro de factorías; los renderers hoja se envuelven (nunca se reescribe su GLSL ni se renombran sus métodos públicos: ver `docs/research/orbitalwatch/porting-brief.md` §Rules).
- Sin `any`/`@ts-ignore`/`as unknown as`; sin `window.orbitalwatch` fuera de desarrollo; sin `window/document` en top-level (SSR).

## 3. Diseño de partida (hipótesis: confírmala o corrígela en un ADR)
- **Carpetas**: `src/engine/` (core sin React) · `src/components/sites/orbitalwatch/` (solo UI) · `src/stores/` · `src/lib/orbital/` · `src/lib/frame-bus.ts`.
- **API**: `createOrbitalEngine({ canvas, events, layers, initial }): EngineHandle` (sustituye `startOrbitalWatch()`); `EngineHandle` = `EngineCommandFacade` existente + `dispose()`. `EngineEvents`: `onLoading, onCatalog, onViewChange, onSatelliteSelected, onBodySelected, onFilterChange, onTimeTick (≈1–4 Hz), onFps (0,5 s), onError`.
- **Dos velocidades de dato**: baja frecuencia → store zustand por un único puente con throttle; **por frame** (reloj, alt/vel/lat/lon, posición de etiquetas proyectadas) → `FrameBus` tipado fuera de React, consumido por adaptadores imperativos con `ref` (sin setState). Hoy `hud.setClock`/`hud.updatePanel` escriben el store a ~60 Hz: se corta.
- **Destino de lo imperativo**: `hud.ts` desaparece; `space-ui.ts` → paneles/botones/hint/warp a React, `updateLabels` a un `LabelOverlay` imperativo en la capa UI alimentado por proyección del engine; `places.ts` → `PlaceIndex` (datos+malla 3D, como capa) + `<PlaceSearch/>` React; `donate.ts` se borra; clases `view-*`/`is-alarm` de `document.body` pasan a React según `view`.
- **Un solo escritor del DOM** y **migración estrangulada**: cada ola deja la app funcionando (`tsc` verde, `/orbitalwatch` renderiza). Orden: contratos+esqueleto (tú) → mover `main.ts` al esqueleto → puente y hook → migrar UI pieza a pieza → borrar lo viejo → capas → Tailwind/UX → marca/README/env → QA.
- **UX**: Tailwind sin cambiar el aspecto; skeleton en `Loader`; paneles colapsables a 390 px sin tapar el globo (`docs/design-references/*mobile-390*`); contraste oscuro. Lo acoplado a shaders puede quedar en CSS acotado (ADR).
- **Marca/pagos**: todo por `NEXT_PUBLIC_*` + `.env.example`; link de Stripe y email son datos pendientes del usuario ("Needs user input"): no los inventes ni preguntes; sin link → botón deshabilitado + aviso en dev. Actualiza `package.json` (name/description/keywords/repository) y sustituye el `README.md` de plantilla.

## 4. Código clave que escribes TÚ (aditivo: no rompe lo existente; cada pieza compila sola)
Solo contratos, esqueleto y ejemplares. TSDoc de 1-3 líneas; sin lógica de relleno.
- **K1 `src/engine/contract.ts`** — `EngineOptions`, `EngineEvents`, `EngineHandle`, `LayerSpec`, `LayerFactory`/registro, `FrameSnapshot`, reutilizando/ajustando `src/types/engine.ts` (`ILayer`, `EngineCommandFacade`). Es el **contrato congelado**: los workers no lo modifican sin `ask`.
- **K2 `src/engine/create-engine.ts` (+ `index.ts`)** — esqueleto del ciclo de vida que compila: `AbortController` raíz, guardas `disposed`, `dispose()` idempotente (orden inverso de creación, `forceContextLoss`), puntos de emisión de eventos, bloques vacíos etiquetados `// MOVE main.ts Lxxx-yyy (Tnn)` que mapean cada región de `main.ts` a su sitio y **qué dependencia DOM sustituye por evento/callback**. Es el plano que sigue el worker que parte `main.ts`.
- **K3 `src/lib/frame-bus.ts` + `src/hooks/useEngine.ts` + `src/stores/engine-bridge.ts`** — `FrameBus` (pub/sub tipado sin React), puente evento→store con throttle (reloj como string ≈1 Hz, fps), y el hook final StrictMode-safe (import dinámico cancelable con token, `dispose` en cleanup, devuelve el `EngineHandle`). Archivos nuevos; el hook viejo se sustituye en una tarea posterior.
- **K4 Ejemplar de capa `src/engine/layers/earth-layer.ts`** — `ILayer` que envuelve `Earth` (pistas en el mapa de contexto): patrón exacto de init/update/visibilidad/dispose que replicarán las demás capas.
- **K5 Ejemplar de UI por frame `…/orbitalwatch/HUD/ClockReadout.tsx`** — lectura imperativa vía `ref` + `FrameBus`, sin setState a 60 Hz: patrón para reloj, lecturas del satélite y etiquetas.
- **K6 Regla de frontera** en `eslint.config.mjs` (objeto `files: ["src/engine/**"]` + `no-restricted-imports`; pistas en el mapa).
Al final: **una** ejecución de `npx tsc --noEmit` y **una** de `npx eslint` sobre tus ficheros nuevos; corrige lo que falle. Nada más.

## 5. Entregables de plan
1. `docs/plan/PLAN.md`: árbol final; diagrama ASCII comandos↓/eventos↑ y frecuencias de dato; ADRs; **tabla de riesgos** (riesgo · prob. · mitigación); olas y dependencias; "Needs user input"; protocolo de verificación (§7); **checklist K1–K6 (EXISTS / TODO)** actualizado al final.
2. `docs/plan/tasks/Tnn-<slug>.md`, una por fichero:
   `Tier:` haiku | sonnet5-medium | sonnet55-high · `Wave:` n · `Depends:` ids
   **Target** (ficheros con rangos) · **Change** (resultado + firmas TS) · **Pattern** (qué ejemplar K copiar) · **Constraints** (contratos K1 congelados; no tocar X) · **Ownership** (ficheros que SOLO ella edita; disjuntos entre paralelas) · **Acceptance** (comandos exactos + salida esperada) · **HINTS** (anclas `fichero:línea` para no explorar) · **Pitfalls** (dónde se equivocará el worker y cómo hacerlo bien).
   Pitfalls a cubrir donde apliquen: renombrar métodos públicos del port 1:1; "mejorar" GLSL; reescribir en vez de envolver; vectores/readouts a 60 Hz en store/useState; olvidar `dispose()`; doble init en StrictMode; `document/window` en top-level; dos escritores sobre el mismo nodo; ids DOM que el engine viejo aún busca; `showPanel` guarda `index: 0` (bug); `npm run check` por tarea (prohibido a workers); tocar `docs/` o ficheros fuera de Ownership.
3. `docs/plan/COORDINATOR-BRIEF.md` (≤ 45 líneas): orden de olas, paralelismo, puntos de control, cuándo escalar al usuario, tiers → modelos.

## 6. Reparto de tiers
- `haiku`: mecánico con criterio objetivo (mover/renombrar+imports, `.env.example`, borrar stubs/re-exports muertos, `package.json`, README, lint).
- `sonnet5-medium`: acotado con ejemplar (componentes React desde el markup/ids existentes, Tailwind, skeletons, responsive, selectores del store).
- `sonnet55-high`: lo que rellena tu esqueleto (mover `main.ts` a `create-engine.ts`, wrappers `ILayer` restantes copiando K4, `LabelOverlay`, `PlaceIndex`, migrar el hook, prueba de fugas, gate final).
- Tareas ≲400 líneas tocadas; ≥3 olas con paralelismo real; primera tarea de la ola 0 = checkpoint commit **solo si el usuario lo autoriza**.

## 7. Verificación que dejas definida
Por tarea (barata): `npx tsc --noEmit` + `npx eslint <sus ficheros>` + `rg` guardián (cero `react|zustand|@/stores|getElementById|document\.` en `src/engine/`). Global (solo coordinador, fin de ola y cierre): `npm run check`; smoke Playwright/chrome-devtools MCP en `/orbitalwatch` (globo y satélites visibles, 0 errores de consola, earth/solar/galaxy, filtros, timeline, selección) y a 390 px; **test de fugas**: montar/desmontar ×3 → `renderer.info.memory` y heap vuelven a la línea base; la timeline no re-renderiza a 60 Hz (profiler/contador).

## 8. Antes de terminar (autocomprobación, sin tool calls extra)
¿K1 compila y no importa React? ¿Cada tarea apunta a su ejemplar y a anclas de `main.ts`? ¿Ownerships paralelos disjuntos? ¿Hay un `rg` guardián por frontera? ¿Cada región de `main.ts` (59-1101) está asignada a exactamente una tarea? Corrige en el plan si algo falla.

## 9. Cierre (≤12 líneas)
Ficheros creados, nº de tareas por tier y ola, qué K quedó EXISTS/TODO, riesgo principal, datos que faltan al usuario (Stripe, email, nombre/dominio) y la frase de arranque: **"Coordinador: lee docs/orchestration/02-sonnet-coordinator-prompt.md y ejecuta."**
