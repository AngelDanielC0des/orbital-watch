# Verification checklist — environmental layers

Tick every line or mark `unverifiable: <reason>`. Evidence goes to `docs/design-references/layers-*.webp` and `.agent/STATUS.md`.

## 1. Code
- [ ] `npm run lint` clean
- [ ] `npm run typecheck` clean
- [ ] `npm run test` green (existing 21 + new)
- [ ] `npm run build` (webpack) succeeds, no new warnings besides the known `satellite.js` ones
- [ ] Boundary grep in `src/engine/**`: no `react|zustand|@/stores|@/components|@/hooks|fetch(|getElementById|querySelector`; `document.` only in `render/track.ts`
- [ ] No `any`, `@ts-ignore`, `as unknown as`
- [ ] `git diff master -- src/engine/contract.ts` only adds optional members (ADR-15)
- [ ] `src/engine/render/*` frozen files unchanged except new `overlay-shaders.ts`, `lut.ts`

## 2. Functional
- [ ] Toggle on/off works for ozone, pollution, fires; off hides without disposing; on restores without a new request (cache)
- [ ] Opacity slider changes the overlay live; value persists across toggle
- [ ] Pollutant selector swaps colours and legend; 8 pollutants
- [ ] Fire window selector 24 h / 48 h / 7 d; 7 d served from cache
- [ ] Legend visible per active layer; strip follows the last toggled layer; dismissible
- [ ] Source badge and last-updated badge visible in every row
- [ ] Error state: `?mockError=fires` shows the card, keeps last data, "Reintentar" works
- [ ] Empty state: mocked empty payload shows "Sin datos"
- [ ] Fallback: DevTools offline → snapshot shown with grey dot + "Demo"
- [ ] Deep link `?layers=ozone,fires&fires=48h&pollutant=no2` restores state; URL updates on change
- [ ] Refresh button rate-limited (60 s) and disabled while loading
- [ ] Layers disabled in solar/galaxy views and re-enabled back in Earth view

## 3. Data
- [ ] Ozone legend in DU, 100–500, 220 marked; image date equals `meta.dataDate` from the route
- [ ] Pollution units µg/m³ for pollutants, EAQI/US AQI dimensionless; label "O₃ superficie" never "DU"
- [ ] Fires: `total` within 10 000–200 000 for 24 h; FRP ≥ 0; lat ∈ [-90, 90], lon ∈ [-180, 180]
- [ ] Attribution strings match `attribution.ts` (NASA GIBS acknowledgement, NASA FIRMS, Open-Meteo CC BY 4.0 + CAMS)
- [ ] All dates displayed in UTC with "UTC" label; relative time correct
- [ ] Ozone fallback chain: TOMS → DOAS → OMPS → snapshot (simulate by passing an unknown product in dev)
- [ ] Open-Meteo upstream calls per hour ≤ 4 (server log counter in dev)

## 4. Visual
- [ ] Desktop 1280×800: drawer open with all three layers, screenshot `layers-desktop.webp`
- [ ] Tablet 820 px: drawer still side-anchored? (decide at 860 breakpoint) screenshot
- [ ] Mobile 390 px: collapsed chip, globe centre uncovered, screenshot `layers-mobile-390.webp`; expanded sheet screenshot
- [ ] Dark mode only; contrast checks: `--ink`/`--panel` ≥ 4.5:1, `--ink-dim`/`--panel` ≥ 4.5:1
- [ ] Legends readable at 390 px; tick labels not clipped
- [ ] Night mode (`N`) keeps overlays readable (`uNightFade`)

## 5. 3D
- [ ] 0 WebGL errors/warnings in console with all layers on
- [ ] Leak test: mount/unmount ×4 with layers on → `renderer.info.memory.geometries/textures` baseline; heap diff stable (production build, two snapshots)
- [ ] No flicker/z-fighting between clouds (1.006), ozone (1.009), fire heatmap (1.0095), pollution points (1.011), place outlines (1.014) at grazing angles
- [ ] Texture orientation correct: Antarctic ozone hole over Antarctica; coastline-aligned fires (e.g., Australia, Amazon)
- [ ] Overlays rotate with the surface (gmst) during time scrub and speed ×1000
- [ ] Layers hidden beyond `nearEarth` (camera > 420) and in galaxy view
- [ ] Disposal: after `handle.dispose()` no `Texture`/`ImageBitmap` referenced by the client cache

## 6. Performance
- [ ] Added draw calls ≤ 4 (`renderer.info.render.calls` delta)
- [ ] Hotspot count ≤ 2 000 (`hi`) / 800 (`lo`)
- [ ] Ozone texture 2048 on `lo`, 4096 on `hi`
- [ ] Slider: engine updated on `input`, store ≤ 1 write per 150 ms
- [ ] Toggle spam (10× in 2 s) → 1 in-flight request, others aborted or cache hits
- [ ] Hidden tab → no layer requests, no timers firing
- [ ] fps: `hi` desktop ≥ 55, `lo` mobile emulation ≥ 30 with all layers on
- [ ] Payloads: ozone JSON < 2 KB, pollution < 60 KB gzip, fires 24 h < 350 KB gzip
