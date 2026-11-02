# OrbitalWatch 3D — page brief

Source `https://kyveradigital.es/orbitalwatch/` → local `/orbitalwatch` (root `/` redirects there).

## Structure (single full-viewport WebGL app, Spanish UI)
- `<canvas id="scene">` fixed full screen; three.js r186 WebGLRenderer, NeutralToneMapping (exposure 1.05), clear `#020409`, OrbitControls (damping 0.06, no pan, rotate 0.55, zoom 0.8).
- Fixed HUD over the canvas (exact markup in `source/index.html`, CSS in `source/styles.css`):
  masthead (brand, visible count + source, fps) · place search (`Spain, California…`, countries + US states, earth view only) ·
  scale rail `Tierra / Sistema solar / Vía Láctea` (left, vertical; horizontal segmented ≤860px) ·
  filters `Todo · Basura espacial · Starlink · Previstos` + `Modo nocturno` (earth view only) · `Donate` (Stripe sheet) ·
  object panel (SGP4 readout) · body panel (planet facts) · timeline (play, speeds ×1 ×60 ×600 1 h/s 1 día/s [30 d/s off-earth], day scrubber −730…+1825 days, UTC clock, `Ahora`) · hint · warp fade · loader.
- Fonts: Saira Semi Condensed 400/500/600 (UI), JetBrains Mono 400/500 (data) — via next/font.
- Tokens: `--void #02050b`, `--signal #4ae9f9`, `--alarm #ff5149` (debris filter turns accent red), `--payload #f4c352`, `--projected #a2f171`, `--starlink #cfedff`.

## Views / behaviour
- **Earth**: textured Earth (day / aux=lights+clouds+water / normal, lo 2k or hi 4k by device), ray-marched atmosphere, cloud shell, ~28 385 synthetic objects (21 979 launched as of 2026-11-01) GPU-propagated, instanced 3D models up close, picking → follow camera + orbit track + panel. Moon/Sun labels.
- **Solar system**: JPL Keplerian ephemerides, compressed distances, real sizes, orbit lines, asteroid belt, sun + lens flare, hi-res texture upgrade on focus, click a planet → fly + body panel.
- **Milky Way**: procedural spiral galaxy, arm labels, “Sol · estás aquí”, M31/LMC/SMC.
- Transitions: GSAP camera flights (log-distance interpolation), wheel-out ×4 at max distance escalates Earth→Solar→Galaxy, Esc backs out, Space toggles play.
- Adaptive frame governor (pixel ratio / detail, 30 fps lock).
- Query params: `?quality=lo|hi`, `?data=celestrak` (live CelesTrak GP), `?debug` (exposes `window.orbitalwatch`).

## Assets (source → local)
`/orbitalwatch/textures/{lo,hi}/{day,normal}.jpg` → `public/sites/orbitalwatch/textures/{lo,hi}/…`;
`/orbitalwatch/textures/{lo,hi}/aux.jpg` → `…/auxmap.jpg` (Windows reserved name);
`/orbitalwatch/space/{lo,hi}/{sun,mercury,venus,moon,moon-normal,mars,jupiter,saturn,saturn-ring.png,uranus,neptune}` → `public/sites/orbitalwatch/space/…`;
`/orbitalwatch/space/milkyway-{lo,hi}.jpg`, `/orbitalwatch/space/stars.bin`, `/orbitalwatch/geo/{countries-110m,us-states-10m}.json`, `/orbitalwatch/og.jpg` → same paths under `public/sites/orbitalwatch/`.

## Out of scope / external
- Donate posts to `https://kyveradigital.es/donate.php` (Stripe checkout on the source origin; cross-origin from localhost).
- `?data=celestrak` fetches `https://celestrak.org/NORAD/elements/gp.php`.

## Reference screenshots (desktop 1707×932 @1.5x)
Earth initial, solar overview, galaxy, STARLINK-11234 panel (index 1234) — taken 2026-11-01.
