# UX / UI design — environmental layers

Principles: scientific, spatial, dark, non-invasive, responsive, legible, honest about data age. Reuse the HUD tokens in `orbitalwatch.css` (`--panel`, `--rule`, `--ink`, `--ink-dim`, `--signal`, `--alarm`, `--font-ui`, `--font-data`, radius 10 px, `--ease-out`). Tailwind utilities for layout; shader-coupled or token CSS stays in `orbitalwatch.css`.

## 1. Information architecture
- **Layers drawer** (replaces the current popover). Trigger: existing "Capas" button in `ViewControls` (keeps `aria-expanded`/`aria-controls`), badge with the number of active layers.
  - Header: "Capas" · close ×.
  - Section "Órbita": existing toggles (Satélites, Órbita seguida, Estrellas, Etiquetas) as `LayerToggle` rows (no opacity).
  - Section "Atmósfera y superficie": `LayerRow` × 3 (Ozono, Calidad del aire, Incendios activos).
  - Footer `AttributionFooter`: "Fuentes: NASA GIBS · NASA FIRMS · Open-Meteo/CAMS" with a disclosure that shows the full acknowledgement texts and licences.
- **Active legend strip** (`ActiveLegendStrip`): a slim card bottom-left, above the timeline inset, showing the legend of the most recently enabled layer, its date badge and a tiny "×". It never overlaps the timeline (it reads the same inset the engine uses) and hides when the drawer is open on mobile.
- Only in Earth view: the drawer section and the strip are disabled (greyed, with "Disponible en la vista Tierra") in solar/galaxy views; the engine already culls by `nearEarth`.

## 2. `LayerRow` anatomy (desktop 320 px wide drawer)
```
[●] Ozono (columna total)                          ( switch )
    NASA GIBS · OMI/Aura        ● 29 oct 2026 UTC     ↻   ⓘ
    ── opacidad ───────────────●───── 75 %             (only when on)
    [ Info ▾ ]  description · legend · source · licence
```
- Status dot colours: green `#4ae9f9` (--signal) fresh ≤2 d, amber `#f4c352` (--payload) ≤7 d or model estimate, grey `--ink-dim` snapshot/demo, red `--alarm` error.
- Contextual control replaces the opacity line's right side: `PollutantSelector` (segmented on desktop: PM2.5 · PM10 · NO₂ · O₃ · SO₂ · CO · EAQI · US AQI, wraps to 2 rows; native `<select>` under 480 px), `FireWindowSelector` (24 h · 48 h · 7 d).
- Refresh button: icon only with `aria-label="Actualizar ozono"`, disabled while loading or within 60 s of the last refresh (tooltip "Actualizado hace 20 s").
- Info disclosure: 2-line description, `LayerLegend`, `DataSourceBadge` (link to source), `LastUpdatedBadge` (absolute UTC + relative), warning line "Estimación de modelo" / "Datos con retraso de satélite (~4 días)" / "Instantánea de demostración del 29 oct 2026" when applicable, and "La capa no sigue la línea temporal" when the sim is scrubbed > 2 days.

## 3. States
| State | Row | Globe | Strip |
|---|---|---|---|
| idle (off) | switch off, dim text | nothing | hidden |
| loading | switch on, animated 2 px progress line under the row (`LayerLoadingState`), controls disabled, "Cargando…" in `--ink-dim` | nothing yet (or previous data) | skeleton bar (shimmer, reduced-motion → static) |
| ready | status dot + date | layer visible | legend |
| empty | `LayerEmptyState`: "Sin datos para este periodo" + hint ("Prueba 48 h") | nothing | hidden |
| error | `LayerErrorCard`: plain message ("No se pudo cargar FIRMS. Mostrando los últimos datos / Reintentar") + "Reintentar" | last good data stays | legend with red dot |
| fallback | ready + grey dot + "Demo" chip | snapshot visible | "Demo · 29 oct 2026" |

Error copy is human: never raw status codes. Technical detail goes to `console.warn` once.

## 4. Responsive
- ≥ 860 px: drawer anchored right, 320 px, full height minus header, glass panel (`--panel`, 1 px `--rule`), scrolls internally.
- < 860 px: bottom sheet. Collapsed chip "Capas · 2" sits above the timeline (right). Expanded snap at 45 % and 85 % of the viewport; drag handle; backdrop does not block globe drag when collapsed. The strip hides while the sheet is expanded. `PollutantSelector` becomes `<select>`.
- 390 px check: no element covers the globe centre when the sheet is collapsed (compare with `docs/design-references/qa-layers-mobile-390.webp`).

## 5. Accessibility
- Every control has a visible label or `aria-label`; switches are `<button role="switch" aria-checked>`; sliders are native `<input type="range">` styled (keyboard arrows work), `aria-valuetext="75 %"`.
- Focus order: header → rows → footer; Escape closes; focus returns to the trigger.
- Contrast: `--ink` on `--panel` ≥ 12:1; `--ink-dim` ≥ 4.6:1; legend tick labels `--ink`.
- Touch targets ≥ 44×44 px; slider thumb 24 px.
- Legends are not colour-only: ticks with numbers and category names; status dots paired with text.
- `prefers-reduced-motion`: no shimmer, no fire pulse, no slide animation.

## 6. Legend specs
- **Ozone**: horizontal gradient from the GIBS colormap (purple → red), ticks 100 · 220 · 300 · 400 · 500 DU, a small marker at 220 "agujero".
- **Pollution**: gradient per pollutant with EAQI band labels; for EAQI/US AQI, discrete swatches with category names.
- **Fires**: gradient "densidad de focos (escala log)" + legend item "● foco > 100 MW".
Implemented as CSS `linear-gradient` from the same TS stops used by the LUT (single source of truth in `*-scale.ts`).

## 7. Assets
No raster assets required. Icons from Lucide: `Layers`, `Wind` (pollution), `Flame` (fires), `CircleDashed` (ozone), `RefreshCw`, `Info`, `X`, `AlertTriangle`. Legends are CSS gradients.
Optional illustration prompt (only if the user wants an onboarding card): "Minimal dark scientific HUD illustration, Earth globe seen from orbit with three translucent data overlays: a violet-to-amber ozone column gradient, teal glowing air-quality sample points over cities, and small orange fire detections across Africa and South America; thin cyan UI rules, no text, no logos, 16:9, matte, high contrast, no lens flare."
Claude Design request: "Dark HUD layers drawer, 320 px, glassmorphism on #040c15 at 90 %, rows for three scientific layers with toggle, opacity slider, status dot, date badge and collapsible legend; mobile bottom-sheet variant at 390 px; use Saira Semi Condensed for UI and JetBrains Mono for data."
