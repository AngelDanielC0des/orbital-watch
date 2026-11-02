# API research — environmental layers for OrbitalWatch (verified 2026-11-02)

Rows marked **verified** were probed with `curl`/`node` from this repo on 2026-11-02. Rows marked *docs* come from official documentation only. Re-verify anything older than ~30 days: GIBS layer availability changes (Suomi NPP delivery ceased 2026-11-02 13:00 UTC).

## 1. Comparative table

| # | Source | Data type | Coverage / resolution | Temporal | Key | CORS | Rate limit | date / bbox / lat-lon queries | Format | Licence / attribution | Reliability | Three.js fit | Token cost | Risks | MVP? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **NASA GIBS WMS/WMTS** `gibs.earthdata.nasa.gov` | raster tiles (WMTS 512 px PNG, EPSG:4326 TMS `2km/1km/500m/250m`), single-image WMS GetMap, MVT vector tiles (fires) | global; ozone 2 km grid (OMI/OMPS), NO2 OMI 2 km, TROPOMI NO2 ~1 km, VIIRS fires 375 m | daily (OMI ≈4-day latency, OMPS ≈1 day), TEMPO hourly (N. America only) | **no** | **yes `*`** (verified) | none published, fair use | TIME=YYYY-MM-DD yes · bbox yes (WMS) · lat-lon no (imagery) | PNG (palette, transparent no-data), MVT | NASA open data. Requested acknowledgement: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)." | high | **excellent**: one equirectangular WMS GetMap (2048×1024 verified, 135–260 KB; 4096×2048 ≈430 KB in 4 s) maps 1:1 onto the sphere UVs | low | OMPS Suomi NPP layer ends today; OMI/Aura end-of-life risk during 2026; WMS answers 200 + ~600 B empty PNG when the date has no data | **YES**: ozone, satellite NO2/SO2/AOD, fire-raster fallback |
| 2 | **NASA FIRMS public CSV** `firms.modaps.eosdis.nasa.gov/data/active_fire/<sensor>/csv/*_Global_{24h,48h,7d}.csv` | CSV points | global; VIIRS 375 m (NOAA-20, NOAA-21), MODIS 1 km | rolling 24 h / 48 h / 7 d, refreshed ≈hourly (`last-modified` 11:40 UTC seen) | **no** | **no** (no ACAO header, verified) | none published | date no (rolling only) · bbox no · lat-lon no | CSV, 13 columns | NASA LANCE FIRMS: cite "NASA FIRMS" with link | high | good after server-side binning (54 532 rows / 4.55 MB for NOAA-20 24 h; 7 d = 29 MB) | medium (proxy + parser + binning) | 4.5 MB must never reach the browser; schema drift; SNPP file is legacy | **YES**: fires via Route Handler |
| 3 | NASA FIRMS Area API `/api/area/csv/{MAP_KEY}/{SOURCE}/{bbox\|world}/{1-5}[/{date}]` | CSV points | same sensors | 1–5 days, dated queries yes | **yes** (free MAP_KEY) | unknown | 5 000 transactions / 10 min per key | date yes · bbox yes | CSV | as row 2 | high | as row 2 | medium | key sits in the URL path → server-only | optional upgrade (history) |
| 4 | **Open-Meteo Air Quality** `air-quality-api.open-meteo.com/v1/air-quality` | JSON point samples of the CAMS model (not stations) | global 0.4° (~45 km, 3-hourly); Europe 0.1° (~11 km, hourly) | current + hourly; `past_days` 0–92; `forecast_days` 0–7 | **no** (non-commercial) | **yes `*`** (verified) | 600/min · 5 000/h · 10 000/day per IP and app (shared hosts hit sooner) | `start_date` yes · bbox no · **multi lat-lon yes: 200 coords in one 2.8 KB URL verified (119 KB JSON)** | JSON | CC BY 4.0: credit "Open-Meteo.com" and "CAMS / Copernicus Atmosphere Monitoring Service" | high | good as sampled grid/points → shader points or canvas heatmap | low–medium | commercial use needs a paid plan (donations allowed); its `ozone` is **surface O3 in µg/m³, not column ozone in DU** | **YES**: surface pollution + AQI |
| 5 | World Air Quality Index (WAQI) `api.waqi.info` | JSON stations (`/v2/map/bounds`) | ~12 000 stations, patchy outside cities | hourly real-time | **yes** (free token) | yes `*` (verified) | 1 000 req/s quoted | bbox yes · lat-lon yes | JSON | attribution mandatory; **terms forbid caching/redistribution and public for-profit use without agreement** | medium | fine (points) | medium | licence incompatible with our server cache; token exposure if client-side | **NO** |
| 6 | OpenAQ v3 `api.openaq.org/v3` | JSON stations | thousands of monitors, sparse in the global south | hourly | **yes** (free key) | yes | 60/min · 2 000/h | bbox yes · lat-lon yes | JSON | CC BY 4.0 (per provider) | medium | fine (points) | medium–high (pagination, sensor joins) | key server-only; sparse | future station overlay |
| 7 | OpenWeatherMap Air Pollution | JSON single point | global model | current/forecast/history | **yes** | yes | 60/min free | lat-lon only | JSON | attribution | medium | poor for global (one point per call) | high | burns quota | **NO** |
| 8 | Copernicus ADS (CAMS) | NetCDF/GRIB via CDS API queue | global 0.4°, **has column ozone** | hourly/3-hourly | **yes** (CDS key) | no (async queue) | queue | yes | NetCDF/GRIB | Copernicus licence | high | poor directly (server decoding) | very high | no browser path | future snapshot pipeline |
| 9 | Copernicus CDS / ERA5 | NetCDF | global | reanalysis | yes | no | queue | yes | NetCDF | Copernicus | high | poor | very high | same | **NO** |
| 10 | European Environment Agency AQ | CSV/JSON stations, EU only | EU | hourly | no | partial | — | yes | CSV | EEA open | medium | regional | medium | EU-only | future |
| 11 | Sentinel Hub / EO Browser (TROPOMI) | WMS/WMTS processing | global ~1 km | daily | **yes** (OAuth, paid tiers) | yes | quota | yes | PNG/TIFF | Copernicus + Sinergise terms | high | good | high | paid | **NO** (GIBS already serves TROPOMI NO2) |
| 12 | NASA Worldview snapshots `wvs.earthdata.nasa.gov` | PNG/JPEG over GIBS | as GIBS | as GIBS | no | yes | — | yes | PNG/JPEG | NASA | high | as GIBS | low | redundant | use GIBS directly |
| 13 | NASA LANCE | NRT programme behind FIRMS/GIBS | — | — | — | — | — | — | — | — | — | — | — | — | covered by 1–3 |
| 14 | GIBS MVT fire tiles (`VIIRS_NOAA20_Thermal_Anomalies_375m_All`, TMS `500m`) | Mapbox vector tiles | global | daily | no | yes (verified) | — | TIME yes | MVT; **1.3 MB for the level-0 tile** | NASA | high | needs an MVT decoder and many tiles | high | heavy client decoding | **NO** (CSV proxy is simpler) |

## 2. GIBS layer identifiers verified in `WMTSCapabilities.xml` (EPSG:4326, `best`)

| Purpose | Identifier | TMS | Time-domain end on 2026-11-02 | Note |
|---|---|---|---|---|
| Ozone total column (DU) | `OMPS_Ozone_Total_Column` (Suomi NPP) | 2km | 2026-11-02 | **last day of new data**. Historical candidate only. |
| Ozone total column (DU) | `OMI_Ozone_TOMS_Total_Column` (Aura) | 2km | 2026-10-29 (≈4-day latency) | **primary**. Colormap `colormaps/v1.3/OMI_Ozone_TOMS_Total_Column.xml` (units DU, 163 entries, 100→500 in 2.5 DU steps). |
| Ozone total column (DU) | `OMI_Ozone_DOAS_Total_Column` | 2km | 2026-10-29 | secondary |
| NO2 tropospheric column | `OMI_Nitrogen_Dioxide_Tropo_Column` | 2km | 2026-10-28 | colormap exists (units molecules/cm²) |
| NO2 tropospheric column | `TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column` | check | check | higher resolution alternative |
| SO2 | `OMPS_NOAA20_SO2_Planetary_Boundary_Layer` | check | check | no colormap XML (404): legend must be hand-made |
| CO | `MOPITT_CO_Daily_Total_Column_Day` | check | check | |
| Aerosol (PM proxy) | `MODIS_Combined_Value_Added_AOD` | check | check | colormap exists |
| Fires raster | `VIIRS_NOAA20_Thermal_Anomalies_375m_All` and `…NOAA21…` | 500m (MVT in WMTS); **PNG via WMS** (168 KB at 2048 px verified) | 2026-11-02 | zero-infra fire fallback |
| NO2 hourly N. America | `TEMPO_L3_NO2_Vertical_Column_Troposphere` | 1km | sub-daily | regional, future |

Not present on 2026-11-02: any NOAA-20/NOAA-21 OMPS *total column ozone* layer. Watch the capabilities file for `OMPS_NOAA2*_Ozone_Total_Column` and switch the primary when it appears.

### GIBS behaviours that matter
- WMTS REST: `/wmts/epsg4326/best/{Layer}/default/{YYYY-MM-DD|default}/{TMS}/{z}/{row}/{col}.png`; tiles are 512×512. Response headers `Layer-Time-Actual` / `Layer-Time-Request` are CORS-exposed and give the resolved date. `TIME=default` resolves to the newest day. A date with no data returns **404**.
- WMS GetMap `/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={Layer}&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024&FORMAT=image/png&TRANSPARENT=true&TIME={date}` (WMS 1.3.0 puts latitude first in BBOX). A date with no data returns **200 with a ~600 B empty PNG**: validate by byte size and alpha coverage, never by status. 4096×2048 works (~430 KB, 4 s). Use 2048 on tier `lo`, 4096 on tier `hi`.
- `DescribeDomains` is cheap and authoritative for date resolution: `/wmts/epsg4326/best/1.0.0/{Layer}/default/{TMS}/all/all.xml` (541 B) returns the full time domain as `start/end/P1D` ranges. Use it server-side instead of the 5 MB capabilities file.
- Tiles are served with `Cache-Control: no-store`: caching is our job.

## 3. FIRMS public CSV (no key)
Verified HTTP 200 and sizes (2026-11-02): `noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv` 4.55 MB · `noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv` 4.70 MB · `noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_48h.csv` 8.6 MB · `…_7d.csv` 29.4 MB · `modis-c6.1/csv/MODIS_C6_1_Global_24h.csv` 0.86 MB.
Columns: `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight`. `confidence` ∈ {low, nominal, high}; `frp` in MW; `acq_time` is HHMM UTC; `daynight` ∈ {D, N}. No CORS header → the browser cannot fetch directly; a Route Handler must proxy, parse and bin.

## 4. Open-Meteo Air Quality
Verified: no key, `access-control-allow-origin: *`, 200 coordinates in one request, `current=pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,european_aqi,us_aqi` (units µg/m³; EAQI 0–100+; US AQI 0–500). `start_date/end_date` historical works. No rate-limit headers are returned, so budget conservatively. Limits (terms page): 600/min, 5 000/h, 10 000/day per IP, non-commercial without subscription.

## 5. Recommendation

| Layer | Primary | Fallback 1 | Fallback 2 (offline/demo) |
|---|---|---|---|
| **Ozone** | GIBS WMS `OMI_Ozone_TOMS_Total_Column`, newest date resolved via DescribeDomains (expect T-4 days) | GIBS `OMI_Ozone_DOAS_Total_Column`, then `OMPS_Ozone_Total_Column` (frozen at 2026-11-02) | bundled `public/sites/orbitalwatch/data/ozone-snapshot-omi-2026-10-29.png` (2048×1024, saved today) labelled "demo" with its date |
| **Pollution (surface)** | Open-Meteo AQ for ~280 curated cities + a sparse 10° global grid, hourly server cache | GIBS satellite columns through the same raster renderer (`OMI_Nitrogen_Dioxide_Tropo_Column`, `MODIS_Combined_Value_Added_AOD`) | bundled JSON snapshot of the same city list |
| **Fires** | FIRMS public CSV (NOAA-20 + NOAA-21; 24 h / 48 h / 7 d) through a Route Handler that parses and bins server-side | GIBS WMS raster `VIIRS_NOAA20_Thermal_Anomalies_375m_All` through the raster renderer | bundled binned JSON snapshot |

Rejected: WAQI (licence forbids our cache and public for-profit use), OpenAQ/OWM/Sentinel Hub/Copernicus (keys or queues, more infra for little MVP gain), GIBS MVT (decoder + 1.3 MB tiles).

Assets already saved for the demo fallback: `public/sites/orbitalwatch/data/ozone-snapshot-omi-2026-10-29.png`, `ozone-snapshot-omps-2026-10-30.png`, `colormap-OMI_Ozone_TOMS_Total_Column.xml`, `colormap-OMI_Nitrogen_Dioxide_Tropo_Column.xml`.
