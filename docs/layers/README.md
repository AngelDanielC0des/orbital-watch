# Capas ambientales (ozono, calidad del aire, incendios)

Guía técnica de las tres capas de datos del globo. Describe lo que hay en el código; el diseño
original está en [`docs/plan/PLAN.md`](../plan/PLAN.md) (ADR-15) y en `.agent/development-plan.md`.
Las fuentes, licencias y atribuciones están resumidas en
[README.md, "Fuentes de datos"](../../README.md#fuentes-de-datos).

## 1. Ruta de los datos

```text
 Upstream                  Servidor (Route Handlers)            Cliente
 ---------                 -------------------------            -------
 NASA GIBS  (WMTS/WMS) --> /api/orbital/ozone     --+
 Open-Meteo (CAMS)     --> /api/orbital/pollution --+--> memo (TTL + in-flight dedupe)
 NASA FIRMS (CSV)      --> /api/orbital/fires     --+    + Cache-Control s-maxage/SWR
                                                         + snapshot si el upstream falla
                                  |
                                  v   JSON ApiEnvelope { ok, data, meta }
                       src/lib/layers/<capa>/<capa>.service.ts   (DataProvider)
                       validate (guards) -> GeoCache (TTL+LRU) + dedupe -> decode
                                  |       Result<ProviderLoad, LayerError>, nunca lanza
                                  v
                       src/hooks/useLayerData.ts   (una instancia por capa)
                       AbortController - refresco - backoff - pausa en pestaña oculta
                          |                                   |
                          v status (idle/loading/ready/       v payload decodificado
                    src/stores/layers-store.ts         EngineHandle.setLayerData(id, payload)
                    empty/error, fechas, fuente)       / clearLayerData(id)
                          |  (solo UI, nunca por frame)       |
                          v                                   v
                      HUD (FilterBar + card)       DataLayer en el motor (src/engine/layers/*)
                                                    NUNCA hace fetch; solo sube a GPU
```

Reglas de frontera:

- `src/engine/**` no importa React, zustand, `@/stores`, `@/components` ni `@/hooks` (ESLint). Las capas reciben
  datos solo por `setLayerData`.
- Los servicios del cliente devuelven `Result<ProviderLoad, LayerError>`; los fallos no cruzan capas como excepciones.
- `useEnvironmentalLayers` sincroniza visibilidad y opacidad con una suscripción al store (sin renders de React) y
  monta un `useLayerData` por capa. Se monta en un componente que no renderiza nada
  (`src/components/sites/orbitalwatch/HUD/layers/EnvironmentalLayersController.tsx`).
- El store solo recibe cambios de estado; el motor recibe los datos. Los overlays se crean ocultos
  (`visible: false`) y `LayerManager.update` no llama a las capas ocultas.

### Route Handlers

| Ruta | Parámetros | TTL servidor (`memo` y `s-maxage`) | Fallback |
| --- | --- | --- | --- |
| `GET /api/orbital/ozone` | `product` (`OMI_TOMS`, `OMI_DOAS`, `OMPS`), `size` (`2048`, `4096`), `mock` | 6 h (300 s si responde snapshot) | cadena de productos, luego PNG empaquetado |
| `GET /api/orbital/pollution` | `mock` | 1 h (300 s si responde snapshot) | JSON empaquetado |
| `GET /api/orbital/fires` | `window` (`24h`, `48h`, `7d`), `mock` | 1 h por ventana (300 s si responde snapshot) | JSON empaquetado |

Todas devuelven `ApiEnvelope` (`src/types/layers.ts`), validan los parámetros contra listas permitidas
(`src/lib/server/envelope.ts`; un valor inválido da 400) y emiten
`Cache-Control: public, s-maxage=<ttl>, stale-while-revalidate=<2*ttl>`. Los errores usan `no-store`. Las respuestas con
fallback añaden la cabecera `X-Orbital-Fallback: snapshot`. `memo` (`src/lib/server/memo.ts`) comparte la promesa en
vuelo y no retiene resultados fallidos (`shouldCache`).

## 2. Las tres capas

| | Ozono | Calidad del aire | Incendios |
| --- | --- | --- | --- |
| Id / clase del motor | `ozone` / `RasterOverlayLayer` | `pollution` / `PointsOverlayLayer` | `fires` / `HeatmapLayer` |
| Fichero | `src/engine/layers/raster-overlay-layer.ts` | `src/engine/layers/points-overlay-layer.ts` | `src/engine/layers/heatmap-layer.ts` |
| Radio | 1.009 | 1.011 | rejilla 1.0095, hotspots 1.0105 |
| `renderOrder` | 2 | 4 | rejilla 3, hotspots 4 |
| Modo de render | esfera con textura equirectangular ya coloreada (GIBS) | `THREE.Points` con LUT 256x1 | esfera con `DataTexture` RG8 + LUT de calor, y sprites de hotspots con pulso |
| Draw calls | 1 | 1 | 2 |
| Payload (`kind`) | `raster` (`RasterPayload`: `ImageBitmap`) | `points` (`PointsPayload`: `latLon`, `values` 0-1, NaN = sin dato) | `heatmap` (`HeatmapPayload`: `density`, `intensity`, `hotspots` stride 4) |
| Upstream | NASA GIBS WMS (`OMI_Ozone_TOMS_Total_Column`, luego DOAS y OMPS) | Open-Meteo Air Quality (`current=`), lotes de 150 puntos | FIRMS CSV global VIIRS NOAA-20 y NOAA-21 |
| Refresco (`refreshIntervalMs`) | 6 h | 1 h | 1 h |
| Opacidad inicial | 0.75 | 0.9 | 0.85 |
| Controles | opacidad | opacidad, contaminante | opacidad, ventana |

### Ozono

- El cliente pide el descriptor (`OzoneDescriptor`: `imageUrl`, `date`, `product`, tamaño) y descarga la imagen. Solo
  acepta URLs de `https://gibs.earthdata.nasa.gov/` o de `/sites/orbitalwatch/data/` (`isAllowedImageUrl`).
- Tamaño de textura por `tier`: `lo` 2048x1024, `hi` 4096x2048. Segmentos de la esfera: 96 (`lo`) o 128 (`hi`).
- Cadena de fallback del servidor: producto pedido, luego el resto de `OMI_TOMS -> OMI_DOAS -> OMPS`; hasta 3 días hacia
  atrás por producto; una imagen de 5000 bytes o menos se considera "día vacío" de GIBS. Si todo falla, instantánea
  `ozone-snapshot-omi-2026-10-29.png` (`product: "snapshot"`, `fallback: true`).
- En el cliente: si la descarga falla, se reintenta con la instantánea local; un blob de menos de 5 kB da el error
  `empty`; una imagen con menos del 1 % de píxeles no transparentes (medido en 256x128) devuelve `empty: true` y la
  UI muestra el estado vacío.
- Caché de blobs en el cliente: `GeoCache` con TTL 6 h y 4 entradas.
- Decodificación: `createImageBitmap(..., { imageOrientation: "flipY" })` (`flipped: true`); en Safari se usa
  `HTMLImageElement` (`flipped: false`). Si la textura es potencia de dos se generan mipmaps; anisotropía hasta 8.
- El ozono es columna total en DU (rango 100-500, umbral de agujero 220 DU). El `o3` de la capa de calidad del aire es
  ozono de superficie en ug/m3, no DU.

### Calidad del aire

- ~430 puntos de muestreo (ciudades + rejilla, `src/lib/layers/pollution/sample-points.ts`); un solo
  contaminante o índice activo (`pm2_5`, `pm10`, `no2`, `o3`, `so2`, `co`, `eaqi`, `usaqi`). La URL de la petición no
  incluye el contaminante: el DTO trae todos, así que cambiar de contaminante reutiliza la caché y solo reconstruye
  el payload.
- Servidor: `fetchPollution` (`src/lib/server/open-meteo.ts`), lotes de 150 puntos, timeout 15 s,
  `next.revalidate` 3600.
- Cliente: `GeoCache` TTL 1 h (2 entradas) y caché aparte para snapshot (TTL 5 min), de modo que los datos reales
  vuelven pronto. Las peticiones concurrentes a la misma URL se comparten con `dedupe`.
- Fallback: si la ruta falla con `network` o `upstream` (y no es `mockError`), el cliente pide
  `snapshots.json` y el JSON empaquetado (`pollution-snapshot-<fecha>.json`).
- Sin límite por tier; los buffers crecen en potencias de 2 desde 512 puntos.
- Es una estimación de modelo, no estaciones (la UI lo indica con `latencyNote`).

### Incendios

- Servidor: CSV global por sensor y ventana en streaming (tope de 40 MB), binning a una rejilla de 0.5 grados
  (720x360) y hasta 2000 hotspots ordenados por FRP; timeout 25 s (55 s para `7d`). Si falla un solo sensor la
  respuesta es parcial (queda fuera de `sources`); si fallan los dos, error `upstream` y snapshot.
- Cliente: la rejilla dispersa (`FiresDTO.grid.cells`, stride 3) se expande a `density` e `intensity` densas; el
  filtro día/noche y el tope de hotspots se aplican en el cliente (`toHeatmapPayload`).
- Límites de hotspots por tier (`HOTSPOT_CAP` en `src/lib/layers/fires/fires-scale.ts`): `hi` 2000, `lo` 800. El
  snapshot empaquetado se recorta a 800 hotspots.
- `GeoCache` TTL 1 h con 3 entradas (una por ventana) y caché de snapshot de 5 min.
- Textura de rejilla 720x360 RG8 (~0.5 MB), reutilizada entre payloads del mismo tamaño. El pulso de los hotspots
  se desactiva con `prefers-reduced-motion`.

## 3. Cómo añadir una capa nueva en 5 pasos

Ejemplo: `lightning` (descargas eléctricas), una capa raster que reutiliza `RasterOverlayLayer` y no toca el bucle del
motor. Se asume un descriptor de imagen equirectangular servido por una ruta propia `/api/orbital/lightning`.

1. **Tipos** (`src/types/layers.ts`).
   - Añadir `"lightning"` a `LayerId` y al `Extract` de `EnvironmentalLayerId`; `OrbitLayerId` se ajusta solo.
   - Definir `LightningLayerConfig` y añadirlo a `LayerConfigMap`.
   - Añadir `lightning: RasterPayload` a `LayerPayloadMap`.
   - Si hay ruta: DTO de la respuesta (como `OzoneDescriptor`).
   - TypeScript marcará ahora los `Record<LayerId, ...>` y `satisfies` incompletos.
2. **Catálogo** (`src/lib/layers/catalog.ts`).
   - Entrada en `LAYER_CATALOG` (`group: "environment"`, `kind: "raster"`, `source`, `attribution`,
     `defaultVisible: false`, `refreshIntervalMs`, `controls`, `latencyNote`).
   - Añadir el id a `ENVIRONMENTAL_LAYER_IDS` (orden del cajón) y a `DEFAULT_LAYER_CONFIG`.
   - Si la atribución es nueva, añadirla a `src/lib/layers/attribution.ts`.
3. **Motor** (`src/engine/layers/registry.ts`).
   - Crear una fábrica que reutilice la clase, por ejemplo junto a `createOzoneLayer`:
     `export const createLightningLayer: LayerFactory = ({ layers, renderer, tier }) => new RasterOverlayLayer("lightning", "Lightning", layers.get("earth"), 0.8, renderer, tier === "hi" ? 128 : 96)`.
   - Registrarla en `LAYER_REGISTRY` (`lightning: createLightningLayer`) y añadir
     `{ id: "lightning", visible: false }` a `DEFAULT_LAYERS`, después de `earth`.
   - Radio: `RasterOverlayLayer` acepta el radio como último argumento del constructor (por defecto
     `OZONE_RADIUS` = 1.009). Elegir uno libre para no hacer z-fighting con el ozono, por ejemplo 1.0102 (entre
     1.0095 de la rejilla de incendios y 1.011 de los puntos): `new RasterOverlayLayer(…, 128, 1.0102)`.
     No hace falta tocar ninguna clase del motor.
   - `LayerManager`, `create-engine.ts` y el contrato (`setLayerData`, `setLayerOpacity`) no cambian.
4. **Proveedor** (`src/lib/layers/providers.ts`).
   - Implementar `DataProvider<LightningLayerConfig, RasterPayload>` en
     `src/lib/layers/lightning/lightning.service.ts` (`fetchEnvelope` + guard + caché + decodificación; partir de
     `src/lib/layers/ozone/ozone.service.ts`). Debe devolver `Result`, resolver `aborted` ante cancelación y entregar
     un `ImageBitmap` nuevo en cada carga.
   - Registrarlo en `PROVIDERS`.
   - Opcional: ruta `src/app/api/orbital/lightning/route.ts` con `memo`, `okJson`/`errorJson` y parseo con listas
     permitidas (`src/lib/server/envelope.ts`), y el acceso al upstream en `src/lib/server/`.
5. **UI**. El código fija hoy los tres ids en estos puntos, que hay que extender a mano:
   - `src/hooks/useEnvironmentalLayers.ts`: añadir `useLayerData("lightning", handle, flags.lightning)` (los hooks no
     se pueden iterar).
   - `src/components/sites/orbitalwatch/HUD/layers/EnvironmentalLayersController.tsx`: añadir `lightning` al mapa de
     `flagsFor(...)` (`LayerFlagsMap` exige todas las claves).
   - `src/stores/layers-store.ts`: `LAYER_IDS`, `INITIAL_OPACITY`, `INITIAL_CONFIG`, `freshLayers()`,
     `freshNonce()`, los `switch` de `patchLayer` y `patchConfig`, y la hidratación de `config` en `hydrate`
     (`config?.ozone`, `config?.pollution`, `config?.fires`).
   - Modo y tarjeta: las capas se activan con los botones de modo de `HUD/FilterBar.tsx` («Incendios»,
     «Atmósfera»); `EnvMode`/`AtmosphereLayerId` (`src/types/layers.ts`), `setMode`/`layerForMode`/`hydrate` en
     `layers-store.ts` y `HUD/layers/EnvironmentModeCard.tsx` (icono, leyenda, selectores) tienen ramas por id; también
     `LayerEmptyState.tsx`. Una capa nueva necesita un modo (o entrar en uno existente). La leyenda sale de un `LegendSpec`.
   - Deep link: `layers=lightning` ya funciona porque `src/lib/layers/url-state.ts` filtra con
     `ENVIRONMENTAL_LAYER_IDS` (lista permitida). Solo hay que tocar `LayerUrlState.config`, `parseLayerUrlState`,
     `writeLayerParams` y `MANAGED_KEYS` en `src/hooks/useUrlState.ts` si la capa añade parámetros propios.
   - Tests: `src/lib/layers/catalog.test.ts`, `src/lib/layers/url-state.test.ts` y `src/stores/layers-store.test.ts`.

## 4. Fuentes, refresco y utilidades

Licencias y atribución: véase [README.md, "Fuentes de datos"](../../README.md#fuentes-de-datos); el texto literal
vive en `src/lib/layers/attribution.ts` (pie del panel Capas y tarjeta del modo).

| Capa | Refresco cliente (`useLayerData`) | `s-maxage` de la ruta | `revalidate` del fetch upstream | Caché cliente |
| --- | --- | --- | --- | --- |
| Ozono | 6 h | 6 h | 6 h (DescribeDomains) | blobs 6 h, 4 entradas |
| Calidad del aire | 1 h | 1 h | 1 h | 1 h, 2 entradas |
| Incendios | 1 h | 1 h | 1 h | 1 h, 3 entradas |

Comportamiento de `useLayerData`:

- Tras una carga correcta programa la siguiente en `refreshIntervalMs`. Tras un error conserva los últimos datos en
  el motor y reintenta con backoff de 1, 2 y 4 minutos (se queda en 4).
- Un temporizador vencido con la pestaña oculta no lanza red: espera a `visibilitychange`.
- Al reactivar una capa con datos vigentes en el motor (misma config y edad menor que el refresco) no hay petición.
- El refresco manual (`requestRefresh` incrementa `refreshNonce`) fuerza `force: true`: salta la caché del cliente;
  la caché del servidor sigue aplicando.
- Desactivar la capa o desmontar aborta la petición (`AbortController`) y devuelve la fila a su estado anterior.

### Deep links y flags de desarrollo

| Parámetro | Valores | Efecto |
| --- | --- | --- |
| `layers` | `ozone,pollution,fires` (lista separada por comas; se ignora lo desconocido) | capas visibles al abrir |
| `pollutant` | `pm2_5` (por defecto), `pm10`, `no2`, `o3`, `so2`, `co`, `eaqi`, `usaqi` | contaminante activo |
| `fires` | `24h` (por defecto), `48h`, `7d` | ventana de incendios |
| `mockError=<id>` | `ozone`, `pollution`, `fires` | esa capa falla (la ruta recibe `mock=error`); solo lectura, nunca se escribe en la URL |
| `mock=snapshot` | literal | todas las capas piden su instantánea; solo lectura |

Los valores por defecto no se escriben en la URL (`writeLayerParams`). La fecha de archivo (fase 2) no está
implementada: la ruta de ozono solo acepta `product` y `size`.

### Regenerar instantáneas y leyenda

- Calidad del aire e incendios: con un servidor en marcha (dev o prod),
  `SNAPSHOT_BASE=http://localhost:3200 node scripts/snapshot-layers.mjs` (`SNAPSHOT_BASE` por defecto
  `http://localhost:3200`). Escribe `pollution-snapshot-<fecha>.json` y `fires-snapshot-<fecha>.json` en
  `public/sites/orbitalwatch/data/` y actualiza `snapshots.json`. Se niega a guardar respuestas que ya sean fallback,
  limita cada fichero a 400 KB y los hotspots de incendios a 800. No borra ficheros de fechas anteriores.
- Ozono: la instantánea es un PNG manual (`ozone-snapshot-omi-2026-10-29.png`); su fecha está fija en
  `src/lib/server/gibs.ts` (`OZONE_SNAPSHOT`) y en `src/lib/layers/ozone/ozone.service.ts` (`OZONE_SNAPSHOT_URL`).
- Leyenda de ozono: `node scripts/gen-legend.mjs` lee
  `public/sites/orbitalwatch/data/colormap-OMI_Ozone_TOMS_Total_Column.xml` y regenera
  `src/lib/layers/ozone/legend-ozone.ts` (12 paradas, 100-500 DU). El fichero está marcado "generated, do not edit".

Las claves opcionales (`FIRMS_MAP_KEY`, `OPENAQ_API_KEY`) no se usan todavía; véase `.env.example`.

## 4b. Modos de la HUD

Los botones «Incendios» y «Atmósfera» están junto a los filtros de satélites (Todo · Basura espacial · Starlink ·
Previstos) y son excluyentes con ellos: cada modo muestra solo lo suyo. En «Incendios» o «Atmósfera» se ocultan los
satélites y la órbita seguida (las preferencias del panel Capas se conservan), se deselecciona el satélite y el filtro
vuelve a «Todo». «Atmósfera» muestra una sola capa a la vez: calidad del aire (por defecto) u ozono, con un selector en
la tarjeta. Pulsar un filtro de satélites, el × de la tarjeta, el botón del modo activo o seleccionar un satélite vuelve
al modo órbita. Los deep links `layers=` se traducen a un modo (incendios > calidad del aire > ozono).

## 4c. Interactividad de los puntos (ADR-16, plan v2)

- **Hover** (ratón): el punto crece y aparece el anillo de selección; un tooltip de una línea resume el dato
  («El Cairo · PM2.5 43 µg/m³ · Mala», «Foco · 486 MW · Intenso», «271 DU · Normal»). Sobre el ozono el cursor es una cruz:
  cualquier punto del globo es consultable.
- **Clic / toque**: tarjeta de información (`HUD/layers/PointInfoCard.tsx`, estilo del panel de satélite):
  calidad del aire con los 8 indicadores, categoría en palabras y comparación con la guía de la OMS; foco con potencia,
  hora UTC, satélite, día/noche y confianza; zona (celda 0,5°) con nº aproximado de detecciones; ozono con DU y clase.
  País/estado por geocodificación inversa local (`src/lib/orbital/reverse-geocode.ts`, nombres en español).
- **Motor**: hit-test en CPU dentro de cada capa (`pick`), énfasis por `gl_VertexID` (`setHovered`/`setSelected`),
  eventos `onLayerHover`/`onLayerPick` → `layers-store` (`hoveredPick`, `selectedPick`). Datos de la tarjeta:
  `src/lib/layers/pick-resolver.ts` sobre el último DTO/payload de cada servicio (sin peticiones nuevas).
- **Rankings**: «Peores ciudades» (calidad del aire) y «Regiones con más focos» en la tarjeta del modo; cada fila vuela
  al punto y abre su tarjeta. Deep link `pt=<id>` para un punto de calidad del aire.
- **Focos**: 7 valores por foco (`FIRE_HOTSPOT_STRIDE`): lat, lon, FRP, día, confianza, minutos antes de la generación,
  satélite. Los snapshots antiguos (4 valores) siguen aceptándose.

## 5. Memoria, liberación y presupuesto

### Reglas

- **Propiedad del `ImageBitmap`**: el proveedor entrega un bitmap nuevo en cada `setLayerData`. Al llamar, la
  propiedad pasa al motor: `RasterOverlayLayer` lo sube con `renderer.initTexture` y lo cierra (`closeImage`). Si el
  resultado llega tarde (`alive === false`), está vacío, o el motor no expone `setLayerData`, lo cierra
  `useLayerData`. Una capa ya liberada cierra el payload que recibe. No se reutiliza un bitmap entre llamadas.
- **`dispose()` idempotente** (`OverlayLayerBase`): la segunda llamada no hace nada; libera datos (`release`),
  recursos permanentes (`disposeResources`) y se quita del padre (`removeFromParent`), porque cuelga del grupo de la
  Tierra.
- **`clearData()`** libera solo lo dependiente de datos (textura, rango de dibujo) y deja la capa reutilizable.
- **Los buffers solo crecen**: puntos y hotspots parten de 512 y 256 elementos y se duplican al hacer falta; no se
  reducen ni se reasignan por payload. La rejilla de incendios se reutiliza mientras no cambie `cols x rows`. La
  textura de ozono anterior se libera después del intercambio.
- Los arrays de `PointsPayload` y `HeatmapPayload` se leen, no se retienen.
- Las capas ocultas no consumen CPU por frame (`LayerManager` las salta); una capa visible se oculta si la cámara
  está lejos (`nearEarth`) o no tiene datos.
- Ningún dato de capa entra en el store por frame: solo estados y fechas.

### Presupuesto de rendimiento

| Concepto | Presupuesto | En el código |
| --- | --- | --- |
| Draw calls añadidos con las tres capas | <= 4 | ozono 1 + aire 1 + incendios 2 = 4 |
| Hotspots | <= 2000 (`hi`) / 800 (`lo`) | `HOTSPOT_CAP` |
| Textura de ozono | 2048 (`lo`) / 4096 (`hi`) | ~8 MB (11 con mips) en `lo`; ~45 MB en `hi` (estimación del plan) |
| Rejilla de incendios | 720x360 RG8 | ~0.5 MB |
| Commits de React a frecuencia de frame | 0 | el store no se escribe por frame |

Medido (dev, Chromium headless con GL por software, tier `hi`, ver `.agent/STATUS.md` ola 5): draw calls 14 → 18
(+4); texturas 21 → 25; 441 puntos + 2 000 hotspots; 0 mutaciones del DOM del panel en reposo (medido antes de los modos); tras `clearData`
en las tres capas las texturas vuelven a 23 (21 + 2 LUT permanentes). Los tamaños de GPU de la tabla son
estimaciones del plan (no medibles desde el navegador).
