# Plan v2 — Interactividad de Atmósfera e Incendios, rediseño visual y bugs

Fecha: 2026-11-02 · Rama: `feat/environmental-layers` (continúa) · Ejecutor: Opus 5.5 + workers Sonnet en las tareas de bajo riesgo.
Estado: decisiones del §8 **aceptadas por el usuario (2026-11-02)**: azul `#2f7dff`, Previstos opción **A** (autorizado tocar `gpu-propagator.ts` y `satellites.ts`, solo el uniform y las condiciones descritas), valor de ozono al pulsar: **sí**. Pendiente de la orden "ejecuta el plan".

---

## 0. Diagnóstico (verificado en el código)

| # | Petición | Qué pasa hoy | Evidencia |
|---|---|---|---|
| D1 | No se entiende qué es cada punto de Atmósfera | Cada punto es una **estimación del modelo CAMS** en una ciudad (278) o en un nodo de una rejilla de 15–20° (163). Nada en la UI lo dice; ciudades y rejilla se dibujan igual; el color solo se explica con una barra sin categorías para PM2.5. | `sample-points.ts`, `pollution.service.ts`, `EnvironmentModeCard.tsx` |
| D2 | Los puntos no se pueden pulsar ni crecen con hover | Hover y clic solo existen para satélites, y únicamente cuando la capa de satélites está visible. En los modos ambientales se oculta, así que **no hay picking**. | `create-engine.ts:782` (hover), `:857` (clic), `:872-887` (pointermove, throttle 120 ms) |
| D3 | Lo mismo en Incendios | Los hotspots son `THREE.Points` sin picking. Cada foco lleva solo lat, lon, FRP y día/noche (stride 4); faltan confianza, hora y satélite. La rejilla de densidad no es consultable. | `heatmap-layer.ts`, `firms.ts`, `types/layers.ts:210` |
| D4 | El azul claro está en casi todo | Un único token `--signal #4ae9f9` (≈ `lab(84.9 …)`) alimenta `--accent`, botones activos, sliders, focos y anillos. Hay **dos definiciones** de cada token (hex + bloque `@supports (color:lab())`). Bordes de 1 px `--rule #84d3e133`. En el motor: anillo de hover `#4ae9f9` (`hover-layer.ts:69`), órbita seguida `#5ff0ff` (`create-engine.ts:593`). | `orbitalwatch.css:2-3`, 22 usos de `--accent` y 12 de `--signal` |
| D5 | En Vía Láctea y Sistema Solar los puntos «se mueven muy rápido» con hover | **Bug de CSS.** `.label:hover{scale:1.08}` multiplica también el `transform: translate3d(x,y)` que coloca la etiqueta cada frame (origen en la esquina superior izquierda). La etiqueta salta ~1,08·(x,y), pierde el hover, vuelve y repite cada 0,15–0,3 s. Introducido en el pulido T22. Además, `LabelOverlay` recibe `defs={[]}` nuevo en cada render (recrea la suscripción). | `orbitalwatch.css:128-130`, `LabelOverlay.tsx:97-98`, `OrbitalWatch.tsx:182` |
| D6 | «Previstos» no muestra nada | El filtro funciona, pero un objeto previsto solo se dibuja **después** de su fecha de lanzamiento, y todos los previstos son futuros. A «ahora» siempre hay 0 (QA ya lo midió: 0 ahora, 1 370 a +300 d). Con `?data=celestrak` no hay previstos nunca. La HUD no da ninguna pista. | `catalog.ts:131,562-627`, `gpu-propagator.ts:101`, `satellites.ts:655,663`, `docs/plan/QA-REPORT.md:13` |

---

## 1. Objetivos y criterios de éxito

1. **Atmósfera clara**: un usuario sin formación entiende en menos de 5 s qué es un punto («estimación del modelo para esta ciudad»), qué significa su color (categoría en palabras) y cuándo es el dato.
2. **Interactividad igual que los satélites**: hover → el punto crece + anillo + tooltip corto. Clic/tap → tarjeta de información. Funciona con ratón, tacto y teclado (lista accesible).
3. **Incendios útiles**: al pulsar un foco: potencia (FRP) en palabras, hora UTC, satélite, día/noche, confianza y país/región. Al pulsar una zona caliente: nº de detecciones en esa celda.
4. **Rediseño**: azul neón más oscuro y tech, líneas finas (hairline), transparencias y blur donde aportan legibilidad sin tapar el globo. Contraste ≥ 4,5:1 en todo el texto.
5. **Bugs**: etiquetas estables con hover en Sistema Solar y Vía Láctea; «Previstos» muestra algo con sentido a «ahora».
6. **Sin regresiones**: `npm run check` en verde, 0 errores de consola, ≤ 4 draw calls añadidos, 0 commits de React por frame, test de fugas igual que en la fase anterior.

---

## 2. Arquitectura de la interactividad (núcleo técnico)

### 2.1 Contrato (aditivo, ADR-16 en `docs/plan/PLAN.md §3`)
```ts
// src/engine/contract.ts (solo re-export) · src/types/engine.ts / layers.ts
export interface LayerPick { layerId: "pollution" | "fires" | "ozone"; kind: "point" | "cell" | "surface";
  index: number; lat: number; lon: number; x: number; y: number }   // x,y = px CSS en el canvas
EngineEvents.onLayerHover?(pick: LayerPick | null): void   // ≤ 8 Hz (throttle existente de 120 ms)
EngineEvents.onLayerPick?(pick: LayerPick | null): void    // clic/tap; null = deseleccionar
EngineHandle.clearLayerPick?(): void                       // al cerrar la tarjeta / cambiar de modo
DataLayer.pick?(x, y, camera, w, h, radiusPx): LayerPick | null   // opcional en la interfaz de capa
DataLayer.setHovered?(index: number): void                  // -1 = ninguno
```
Todo opcional: el contrato K1 solo crece.

### 2.2 Motor
- **Hit-test en CPU, síncrono** dentro de cada capa (441 + 2 000 puntos, coste despreciable): proyectar cada punto con `matrixWorld` (el grupo cuelga de la Tierra y gira con gmst), descartar los ocultos tras la Tierra (mismo test rayo–esfera que `pickFrom`) y quedarse con el más cercano dentro del radio (14 px ratón / 24 px táctil, igual que los satélites).
- **Integración en `create-engine.ts`**: nueva rama en `runHover` y en `pointerup` cuando `universe.view === "earth"` y hay una capa de datos visible (antes de la de satélites). Reutiliza el throttle, el umbral de clic (≤ 6 px, ≤ 450 ms) y el manejo del cursor (`pointer` + clase `is-pointing`).
- **Crecer con hover**: uniform `uHovered` en `POINTS_VERTEX` y `HOTSPOT_VERTEX`; si `float(gl_VertexID) == uHovered`, el punto crece ×1,7 y se aclara el borde. Más el anillo pulsante existente (`hoverLayer.place`) con el nuevo color.
- **Seleccionado**: uniform `uSelected` (anillo fijo, más grande) mientras la tarjeta está abierta.
- **Rejilla de incendios** (`kind: "cell"`): si no hay foco cerca, se consulta la celda 0,5° bajo el cursor (raycast a la esfera r=1.0095 → lat/lon → índice de celda → densidad > 0).
- **Ozono** (`kind: "surface"`): clic en cualquier lugar → lat/lon (raycast a la esfera). El valor en DU lo resuelve la UI (§2.3).
- Se limpian hover y selección al cambiar de modo/vista, en `clearData` y en `dispose` (idempotente).

### 2.3 Datos para la tarjeta (sin peticiones nuevas)
- **Calidad del aire**: el índice coincide 1:1 con `dto.points` (el orden se conserva). `useLayerData` guarda en una ref no reactiva el último DTO/payload por capa; un `pick-resolver.ts` puro convierte `LayerPick` → modelo de tarjeta.
- **Incendios**: se amplía el hotspot de stride 4 a **stride 6** (lat, lon, frp, día, confianza 0/1/2, minutos UTC de adquisición) en `firms.ts` → DTO → payload. Hay que regenerar los snapshots (≈ +40 KB) y añadir el nombre del satélite como bit. La celda usa `density`/`intensity` decodificados (log) → «≈ N detecciones, FRP máx. ≈ M MW».
- **Ozono**: al decodificar la imagen, el servicio calcula una rejilla de **360×180 valores DU** por búsqueda inversa en la paleta GIBS (163 colores → DU), con `OffscreenCanvas` y sin coste para el motor. Clic → «≈ 285 DU · normal (220 = agujero)». Si el navegador no tiene `OffscreenCanvas`, se muestra solo la posición.
- **Lugar**: geocodificación inversa en el cliente con los polígonos de países y estados de EE. UU. que ya carga `place-index.ts` (punto en polígono; se cachea por celda de 1°). «Mato Grosso, Brasil», «Océano / sin país».

### 2.4 Estado y UI
- `layers-store`: `hoveredPick` (solo para el tooltip; escrito por evento ≤ 8 Hz, nunca por frame) y `selectedPick`.
- **Tooltip de hover** (`PointTooltip.tsx`): una línea, por ejemplo «Madrid · PM2.5 14 µg/m³ · Buena» o «Foco 312 MW · alto». Se posiciona con x/y del evento; en táctil no hay tooltip, solo la tarjeta.
- **Tarjeta de punto** (`PointInfoCard.tsx`), mismo estilo que el panel del satélite (`.panel`) para que se sienta «como los otros»:
  - *Calidad del aire*: nombre y país (o «Punto de rejilla 15°N 20°E»), categoría en palabras con su color, valor del contaminante activo frente a la guía de la OMS («×1,8 la guía»), mini tabla con los 8 indicadores, EAQI y US AQI con su categoría, hora del modelo UTC, aviso «estimación de modelo, no estación», fuente y licencia. Acciones: «Centrar en el globo», «Copiar enlace» (`?layers=pollution&pt=<id>`).
  - *Incendios*: potencia radiativa en MW con clase en palabras (baja < 10, moderada 10–100, intensa > 100, muy intensa > 500), hora UTC y «hace X h», satélite, día/noche, confianza, coordenadas, lugar, fuente. En una celda: nº de detecciones y FRP máximo.
  - *Ozono*: DU aproximado, clase (agujero < 220, bajo, normal 250–350, alto), fecha y producto.
- **Accesibilidad**: la tarjeta es un `role="dialog"` no modal, se cierra con Esc y devuelve el foco. Botón «Lista» en la tarjeta del modo → lista ordenable (peores ciudades, focos más intensos) navegable con teclado; cada elemento selecciona y centra.

---

## 3. Mejoras de UX por modo

### 3.1 Atmósfera
1. Encabezado explicativo en la tarjeta del modo: «Cada punto es la estimación del modelo CAMS para una ciudad o un punto de rejilla. El color indica la calidad del aire.» Se puede ocultar y se recuerda en `localStorage`.
2. **Ciudades frente a rejilla**: las ciudades, discos rellenos; la rejilla, más pequeña y en anillo (atributo `aKind`). Leyenda «● ciudad ○ rejilla».
3. **Categorías en palabras para todos los contaminantes**: Buena, Razonable, Moderada, Mala, Muy mala, Extremadamente mala (bandas EAQI) bajo la barra, más una marca de la guía OMS.
4. Selector de contaminante con nombres comprensibles en un tooltip («PM2.5 · partículas finas»).
5. **Top 5 peores ciudades** según el contaminante activo, pulsables (vuelan al punto y abren la tarjeta).
6. Ozono: leyenda con «agujero < 220 DU» destacada; clic en cualquier lugar → valor (§2.3).

### 3.2 Incendios
1. Tamaño del foco según la potencia (FRP en escala log); los intensos (> 100 MW) en amarillo con halo.
2. Control **Día / Noche / Todos** (`dayNight` ya existe en la config, sin UI).
3. **Regiones con más focos** (top 5 países por nº de detecciones), pulsables.
4. Resumen en la tarjeta del modo: «116 452 detecciones · 2 satélites · últimas 24 h».
5. Explicación corta: «Cada punto es una anomalía térmica detectada por satélite (puede ser un incendio, una quema agrícola o una fuente industrial).»

### 3.3 Comunes
- Las tarjetas del modo y del punto no se solapan: en escritorio, la del modo abajo a la derecha y la del punto arriba a la derecha (posición del panel de satélite). En móvil, la tarjeta del punto sustituye temporalmente a la del modo.
- Animación de entrada sutil (`clip-path`, como `.panel`) sin movimiento con `prefers-reduced-motion`.
- Deep links: `pt=<id>` para un punto de calidad del aire y `fire=<lat>,<lon>` para un foco (best-effort).

---

## 4. Rediseño visual

### 4.1 Paleta (por defecto; ver decisión §8-1)
| Token | Hoy | Propuesta «neón eléctrico» |
|---|---|---|
| `--signal` / `--accent` | `#4ae9f9` cian claro | **`#2f7dff`** azul eléctrico (texto sobre fondo oscuro ≥ 4,5:1 comprobado en ejecución) |
| `--signal-glow` (nuevo) | — | `#5b9dff` para halos `box-shadow`/`drop-shadow` y anillos 3D |
| `--signal-ink` | `#00151c` | `#f4f8ff` (texto claro sobre botón azul; el azul oscuro no admite texto negro) |
| `--rule` | `#84d3e133` | `rgba(80,130,255,.18)` |
| `--rule-strong` | `#6dd6e873` | `rgba(90,145,255,.42)` |
| `--panel` | `#040c15e6` (90 %) | `rgba(4,10,24,.62)` + `backdrop-filter: blur(14px) saturate(1.3)` |
| `--panel-solid` | `#07101a` | `#060c1c` (menús desplegables, móvil) |
| `--ink-dim` | `#9fb5c1` | `#9fb0cc` (se mantiene el contraste ≥ 4,6:1 sobre el panel nuevo) |
Se actualizan **las dos** definiciones (hex y el bloque `@supports lab()`).

### 4.2 Líneas y transparencias
- Bordes a **0,5 px** en pantallas ≥ 2× (`@media (min-resolution: 2dppx)`) y 1 px con alfa más bajo en 1×, para un efecto hairline.
- Esquinas: 10 px → 8 px en paneles y 6 px en botones; separadores internos con `linear-gradient` que se desvanece en los extremos.
- **Transparencias**: paneles (header, filtros, tarjetas, timeline, panel Capas) en vidrio con blur. Las tarjetas sobre el globo, algo más opacas (0,72) para legibilidad. Menús y listas desplegables opacos (`--panel-solid`). Botón activo con `background: color-mix(in oklab, var(--signal) 22%, transparent)` + borde de 1 px `--signal` + glow suave, en lugar de relleno sólido.
- Tipografía: `--font-data` para cifras; tracking +0,02em en etiquetas en mayúsculas.

### 4.3 Motor 3D (sin tocar renderers congelados)
- `src/engine/theme.ts` (nuevo): colores de acento del motor.
- `hover-layer.ts` (no congelado): `uColor` desde el tema.
- `create-engine.ts`: `trackColors.default` desde el tema.
- Contornos de lugar (`place-layer.ts`, no congelado): `#b8f4ff` → `#7fb0ff`.
- No se tocan la atmósfera terrestre (`earth.ts`, congelado) ni los colores de categoría de los satélites (son semánticos).

### 4.4 Alcance de componentes
`orbitalwatch.css` (tokens, `.segmented`, `.toggle`, `.panel`, `.timeline`, `.scales`, `.label`, `.place-search`, loader), HUD React (FilterBar, LayersDrawer, EnvironmentModeCard, PointInfoCard, badges, slider, selectores) y verificación visual de cada vista: Tierra, Sistema Solar, Vía Láctea, móvil 390, error y loader.

---

## 5. Bugs

### 5.1 Etiquetas que saltan con hover (D5)
- Quitar `scale` de `.label:hover` y escalar un hijo interno (`.label__inner`), sin tocar el transform de posición. Transición solo en opacidad, fondo y escala del hijo.
- `OrbitalWatch.tsx`: pasar una constante estable `EMPTY_DEFS` en lugar de `defs={[]}`.
- Verificación: con hover sobre Júpiter y Andrómeda, el centro del rectángulo no se mueve más de 1 px durante 2 s (Playwright).

### 5.2 «Previstos» vacío (D6) — por defecto la opción A
- **A (recomendada)**: con el filtro «Previstos», mostrar los objetos previstos **en su órbita planificada** aunque no se hayan lanzado: tenues, en verde `--projected` y con un pulso lento. Hay que tocar `gpu-propagator.ts` y `satellites.ts`, que son **renderers congelados** (requiere tu autorización, ver §8-2): un uniform `uShowPlanned` y la misma condición en `isVisible`/`countVisible`. La tarjeta del satélite indica «Lanzamiento previsto: <fecha>».
- **B (sin tocar renderers)**: estado vacío explicativo «Hay N lanzamientos previstos. Avanza la línea temporal» con un botón «Ver en +1 año» que hace `scrubDays(365)`. Necesita un evento aditivo `onUpcomingCount`.
- En ambos casos: con `?data=celestrak`, «Previstos» queda deshabilitado con el tooltip «El catálogo en vivo no incluye lanzamientos previstos».

---

## 6. Misiones (orden de ejecución)

| Ola | Misión | Contenido | Agente | Verificación |
|---|---|---|---|---|
| 1 | **N1** Bug de etiquetas | §5.1 | Opus | Playwright: deriva ≤ 1 px |
| 1 | **N2** Previstos | §5.2 (A o B según §8-2) | Opus | contador > 0 a «ahora»; captura |
| 1 | **N3** Tokens + tema | §4.1–4.3: tokens, hairlines, vidrio, `theme.ts` | Sonnet (+ revisión visual de Opus) | contraste, capturas de las 3 vistas |
| 2 | **N4** Contrato + picking del motor | §2.1–2.2: ADR-16, `pick`/`setHovered` en las capas, ramas en `create-engine`, `uHovered`/`uSelected`, cursor | Opus | tests puros de proyección; hover en dev |
| 2 | **N5** Datos para tarjetas | §2.3: hotspot stride 6 (parser, DTO, guards, tests, snapshots), rejilla DU de ozono, reverse geocode, `pick-resolver.ts` | Sonnet (parser/tests) + Opus (resolver) | vitest; tamaño del payload |
| 3 | **N6** Tooltip + PointInfoCard | §2.4: store, componentes, accesibilidad, deep link `pt=` | Sonnet | teclado, Esc, foco; capturas |
| 3 | **N7** UX Atmósfera | §3.1 (explicación, ciudad/rejilla con `aKind`, categorías, top 5, OMS) | Sonnet + Opus (`aKind` en el shader) | captura; prueba «5 segundos» |
| 3 | **N8** UX Incendios | §3.2 (tamaño por FRP, día/noche, top regiones, resumen) | Sonnet + Opus (shader) | captura |
| 4 | **N9** Rendimiento y fugas | draw calls (debe seguir +4), 0 renders por frame (tooltip ≤ 8 Hz), fugas con picking | Opus | números en STATUS |
| 4 | **N10** QA + docs + deploy | checklist, capturas escritorio/móvil/3 vistas, `docs/layers/README.md`, CHANGELOG, `npm run check`, push y deploy a producción con verificación | Opus | todo en verde |

Estimación: 10 commits. N1–N3 son independientes entre sí; N6–N8 dependen de N4–N5.

## 7. Riesgos
| Riesgo | Mitigación |
|---|---|
| El picking de overlays compite con el de satélites | En los modos ambientales los satélites están ocultos; en modo órbita, las capas lo están. La rama de capas solo corre si hay una capa visible. |
| `gl_VertexID` requiere WebGL2 | El motor ya exige WebGL2; sin él, solo anillo de hover (sin crecimiento). |
| El azul oscuro reduce el contraste del texto activo | Botón activo con texto claro; ningún texto azul por debajo de 4,5:1 (se mide). |
| `backdrop-filter` caro en móviles | Blur 14 px solo en paneles, ninguno en elementos animados; `@supports not (backdrop-filter)` → panel más opaco. |
| Los snapshots de incendios crecen | Stride 6 con valores redondeados: ≈ 160 KB (< 400 KB). |
| Previstos A toca renderers congelados | Solo con tu autorización; el cambio se limita a 1 uniform y 2 condiciones, con test visual. |

## 8. Decisiones abiertas (con valor por defecto)
1. **Tono de azul**: por defecto `#2f7dff` (azul eléctrico). Alternativas: `#1f5fff` (cobalto más profundo) o `#3d6bff` (índigo neón).
2. **Previstos**: por defecto **A** (en órbita planificada, tenues; requiere tocar 2 renderers congelados). Alternativa B (estado vacío + botón «Ver en +1 año»).
3. **Valor del ozono al pulsar el globo** (búsqueda inversa en la paleta): por defecto **sí**.
