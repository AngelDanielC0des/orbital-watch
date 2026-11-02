# Risk matrix — where Opus is likely to go wrong

P = probability, I = impact (L/M/H). "Owner" is who prevents it; "Signal" is how to notice early.

| # | Risk | P | I | Mitigation | Owner | Signal |
|---|---|---|---|---|---|---|
| 1 | Calling an API without CORS from the browser (FIRMS CSV has none) | M | H | FIRMS only via Route Handler; GIBS/Open-Meteo CORS verified `*`; allow-list of client-fetchable hosts in services | Opus (M008 review) | console `blocked by CORS policy` |
| 2 | Exposing a key in the client | L | H | no keys in MVP; any future key read only in `src/lib/server/**`; grep `NEXT_PUBLIC_.*KEY` → 0 | Opus | `.env.example` diff |
| 3 | `fetch` inside the engine or render loop | M | H | lint boundary + grep `fetch\(` in `src/engine/**` → 0; data arrives via `setLayerData` | Opus | grep in gate A |
| 4 | React re-renders per frame (slider → store on every `input`, store subscribed by the strip) | M | M | engine written on `input`, store on debounced `change`; selectors per field; React Profiler check in M017 | Opus | Profiler commits > 0 during idle |
| 5 | Fetch not cancelled on unmount / layer toggled off | M | M | `AbortController` per load in `useLayerData`; token check before `setLayerData` | Opus (M004) | warnings after unmount, StrictMode double requests |
| 6 | Textures not disposed (ozone swaps, heatmap re-uploads) | M | H | `dispose()` of previous texture after swap; `ImageBitmap.close()`; `renderer.info.memory` baseline test (M018) | Opus | textures count grows per toggle |
| 7 | Rendering tens of thousands of fire points | M | H | server-side binning + hotspot cap (2 000 / 800) | Opus/Sonnet (M007) | payload > 1 MB, fps drop |
| 8 | No clustering/binning strategy for dense regions | L | M | heatmap grid is the clustering; hotspots sorted by FRP | Opus | visual noise over Africa |
| 9 | Coupling the engine to business logic (catalog imports in engine, store imports) | M | H | engine imports only `@/types/*`, `@/lib/orbital`, `@/engine/*`; catalog lives in `src/lib/layers` and is read by UI/services only | Opus | lint error / grep |
| 10 | Ignoring the sim-time system (layers silently wrong when scrubbed) | H | M | explicit "no sigue la línea temporal" line when offset > 2 d; ozone service designed with `date` for phase 2 | Sonnet (M014) + Opus | user scrubs, badge unchanged |
| 11 | Misreading units (Open-Meteo `ozone` µg/m³ vs GIBS DU; CO µg/m³ vs mg/m³) | H | H | `pollutant-scales.ts` is the single unit table; legend shows unit; tests assert labels | Sonnet (M006) + Opus review | legend says DU on the pollution layer |
| 12 | Misleading colour scales (rainbow for sequential data, inverted heat) | M | M | reuse GIBS colormap for ozone; viridis-like for µg/m³; official EAQI/US AQI categories; legends with numbers | Sonnet (M012) | reviewer cannot read a value from the legend |
| 13 | Missing attribution | M | M | `attribution.ts` + footer + README; checklist item | Sonnet (M014) | footer empty |
| 14 | Empty data treated as error (or as success with a blank overlay) | H | M | GIBS empty PNG detection (size < 5 KB, alpha coverage < 1 %); `status: "empty"` path | Sonnet (M005) | layer "ready" but invisible |
| 15 | Network errors unhandled (hook throws, UI blank) | M | M | `Result` type, error card, keep last good data, backoff | Sonnet (M013) | unhandled promise rejection |
| 16 | No caching → rate limits burned (Open-Meteo 10 k/day per IP on Vercel shared egress) | M | H | ISR `revalidate = 3600`, ≤ 4 upstream calls/h; in-memory client cache; refresh button rate-limited 60 s | Sonnet (M008) | 429 from Open-Meteo |
| 17 | Not validating upstream shapes (CSV column drift, null values) | M | M | header-driven parsing, range checks, tests with malformed fixtures | Sonnet (M007/M006) | NaN positions on the globe |
| 18 | Assuming data is real-time | H | M | badges with UTC date + latency note per source | Sonnet (M014) | "en vivo" shown for a 4-day-old image |
| 19 | Not showing last-updated | M | L | `LastUpdatedBadge` mandatory in `LayerRow` | Sonnet | row without date |
| 20 | Breaking mobile performance (4096 textures on `lo`, 2 000 sprites) | M | H | tier budgets in services (`tier` param) and layers | Opus (M017) | fps < 30 at 390 px emulation |
| 21 | Texture orientation/mirroring wrong on the sphere | M | M | labelled test image in M009; compare Antarctic hole position | Opus | continents misaligned |
| 22 | Suomi NPP OMPS layer chosen as primary (dead since 2026-11-02) | H | M | primary = OMI TOMS; candidate chain; DescribeDomains freshness check | Opus (M005 review) | date frozen at 2026-11-02 |
| 23 | GIBS WMS BBOX axis order (lon,lat instead of lat,lon in 1.3.0) | M | M | fixed constant string, test | Sonnet | rotated/blank image |
| 24 | Vercel function timeout on the 29 MB 7-day FIRMS file | M | M | `maxDuration = 60`, stream parsing, 7 d served from ISR only | Sonnet (M008) | 504 on `?window=7d` |
| 25 | Non-additive change to the frozen contract | L | H | ADR-15 lists the only additions; diff review | Opus | `git diff src/engine/contract.ts` > 15 lines |
| 26 | Drawer or strip covering the globe on 390 px | M | M | collapsed chip default on mobile; screenshot gate | Sonnet (M015) | reference screenshot comparison |
| 27 | Licence breach (WAQI terms, Open-Meteo commercial) | L | H | WAQI rejected; Open-Meteo non-commercial assumption documented; open question to user | Opus | ads/subscriptions added later |
| 28 | Hidden tab keeps refresh timers running | M | L | pause timers on `visibilitychange` like `useEngine` | Opus (M004) | network tab active while hidden |
| 29 | Forgetting `renderOrder`/`depthWrite` → flicker with clouds | M | M | material settings fixed in M009; z-fight check at grazing angles | Opus | shimmering edges |
| 30 | Snapshot assets bloating the repo | L | L | < 400 KB each, manifest, no 7 d fires snapshot | Sonnet (M016) | `git count-objects` growth |
