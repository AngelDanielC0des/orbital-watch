# OrbitalWatch 3D — engine porting brief

> NOTE: `docs/research/orbitalwatch/source/*` (original bundle/HTML/CSS) was moved to `C:\Users\angel\Desktop\orbital-watch\_archive\research\source`. Not needed for the decoupling refactor.

Source: https://kyveradigital.es/orbitalwatch/ (Vite + three.js r186 + GSAP 3.15 + satellite.js v7, single canvas WebGL app).
Local route: `/orbitalwatch` (Next.js 16 client component). Assets: `public/sites/orbitalwatch/…` (use `assetUrl()` from `engine/config.ts`).

## Evidence
- `docs/research/orbitalwatch/source/bundle.pretty.js` — prettier-formatted production bundle (40 368 lines). Lines < 31150 are three.js core + OrbitControls + GSAP. App code is lines 31151–40368 (with satellite.js 31533–33289, BufferGeometryUtils 33630–33813, three/examples Line2 family 34536–35388 interleaved — those are libraries, import them from npm, do not port).
- `docs/research/orbitalwatch/source/index.html`, `styles.css` — exact markup and CSS.
- `docs/research/orbitalwatch/source/three-map.json` — minified identifier → three.js class. Extra known ones: `Ct`=MathUtils, `xo`=TextureLoader, `Zo`=Clock, `os`=Line3, `Ru`=OrbitControls, `ss`=Controls, `Xe`=EventDispatcher, `pr`=Float32BufferAttribute (check), `ag`/`Im`=gsap, `Me`=SRGBColorSpace, `Ne`=LinearSRGBColorSpace. Any other minified identifier used by app code: find its definition in bundle.pretty.js (line < 31150) — e.g. `var _ = 1015` is a numeric three constant; map it to the named export from `three` (check `node_modules/three/src/constants.js`). Numeric literals in material options (e.g. `blending: 2`, `side: 1`, `toneMapping: 7`) must become the named three constants.

## Rules
1. **Faithful 1:1 logic port** to TypeScript (strict, no `any`, no `@ts-ignore`; use precise three types). Same math, same constants, same order of operations, same defaults. Do not "improve", simplify or drop features. GLSL shader strings are copied **verbatim** (keep `${…}` interpolations, renaming only the JS identifiers inside them).
2. Rename minified identifiers to meaningful names. Methods/properties of classes are not minified in the bundle — **keep every public method and property name exactly as in the bundle** (e.g. `setViewport`, `pickAsync`, `object3d`, `uniforms`, `byKey`, `viewMix`), because `main.ts` calls them by those names.
3. Imports: `three`, `three/examples/jsm/...` (e.g. `three/examples/jsm/lines/Line2.js`, `LineGeometry.js`, `LineMaterial.js`, `LineSegments2.js`, `LineSegmentsGeometry.js`, `three/examples/jsm/utils/BufferGeometryUtils.js`), `gsap`, `satellite.js`. Shared app modules: `./orbit-math`, `./types`, `./config`, and the contract below.
4. Asset URLs: the bundle uses `/orbitalwatch/<path>` → write `assetUrl("<path>")`. Exception: `textures/${tier}/aux.jpg` → `assetUrl(\`textures/${tier}/auxmap.jpg\`)`.
5. Everything must be disposable: keep the bundle's `dispose()` methods; any DOM listeners a class adds must be removed in its `dispose()`.
6. Code must be SSR-safe to *import* (no `window`/`document`/`navigator`/`matchMedia` access at module top level — move such reads into constructors or functions). Modules are only instantiated in the browser.
7. Only create/edit the files you own. Check your files with `npx tsc --noEmit` (ignore errors in files you do not own that are still being written by others) and `npx eslint <your files>`.
8. Named exports, 2-space indentation.

## Module contract (file → exports, bundle source lines)
Directory: `src/components/sites/orbitalwatch/engine/`

| File | Bundle lines | Exports (bundle name → TS name) |
|---|---|---|
| `config.ts` ✅ | — | `assetUrl`, `ASSET_BASE`, `DONATE_ENDPOINT`, `QualityTier` |
| `orbit-math.ts` ✅ | 33290–33407 | `Qg`→`EARTH_RADIUS_KM`, `$g`→`MS_PER_MINUTE`, `e_`→`MS_PER_DAY`, `t_`→`MU_KM3_PER_MIN2`, `n_`→`J2`, `r_`→`WGS84_RADIUS_KM`, `i_`→`TWO_PI`, `a_`→`DEG`, `o_`→`Category`, `s_`→`parseEpoch`, `c_`→`wrapTwoPi`, `l_`→`meanMotionRevPerDay`, `u_`→`elementsFromGp`, `d_`→`solveKepler`, `f_`→`keplerToEci`, `p_`→`eciToScene`, `m_`→`gmst`, `h_`→`sunDirection`, `g_`→`satrecFromGp`, `v_`→`propagateSgp4`, `y_`→`sampleTrack`; types `GpRecord`, `MeanElements`, `CategoryId` |
| `types.ts` ✅ | — | `CatalogEntry`, `BodyDef`, `BodyFacts` |
| `earth.ts` | 31151–31532 | `og`→`ATMOSPHERE_RADIUS`, `_g`→`class Earth` (helpers `sg`,`cg`,`lg`…`mg`,`hg`,`gg` internal) |
| `gpu-propagator.ts` | 33408–33629 | `S_`→`FullScreenQuad`, `C_`→`PROPAGATE_GLSL`, `T_`→`class GpuPropagator` |
| `sat-models.ts` | 33814–33907 | `O_`→`withVertexColor` (helper adding aColor), `F_`→`buildSatelliteModels` (uses `mergeGeometries` for `E_`) |
| `satellites.ts` | 33908–34535 | `K_`→`class SatelliteLayer` (+ constants `I_`…`G_`) |
| `track.ts` | 35389–35550 | `bv`→`class OrbitTrack` (`yv` internal). Line classes: `gv`=LineGeometry, `X_`=LineMaterial, `_v`=Line2, `Y_`=LineSegmentsGeometry, `hv`=LineSegments2 |
| `catalog.ts` | 35551–36151 | `Dv`→`generateSyntheticCatalog`, `Av`→`fetchCelestrak` (+ internals) |
| `hud.ts` | 36152–36325 | `Uv`→`class Hud` |
| `sky.ts` | 36326–36534 | `Zv`→`class Sky` |
| `bodies.ts` | 36535–36898 | `Qv`→`PLANET_DEFS`, `$v`→`EARTH_DEF`, `ey`→`BODY_DEFS`, `ty`→`SIMPLEX_NOISE_GLSL`, `ny`→`HASH_GLSL`, shaders `ry`…`cy`, `ly`, `uy` (sun/flare, used by sun.ts) |
| `sun.ts` | 36899–37044 | `my`→`class Sun`, `gy`→`loadTexture` |
| `solar.ts` | 37045–38039 | `cb`→`class SolarSystem`, `Iy`→`eclipticObliquity` |
| `galaxy.ts` | 38040–38607 | `kb`→`class Galaxy`, `lb`→`GALAXY_SUN_POSITION` |
| `space-ui.ts` | 38608–38855 | `Gb`→`class SpaceUi` |
| `governor.ts` | 38856–38971 | `Yb`→`class FrameGovernor` |
| `donate.ts` | 38972–39074 | `tx`→`initDonate` (must return a disposer `() => void`) |
| `places.ts` | 39075–39367 | `dx`→`class PlaceSearch` |
| `main.ts` | 39368–40368 | `startOrbitalWatch(): () => void` (glue; owned by lead) |

The DOM (same ids/classes as the source `index.html`) is rendered by React before the engine starts; classes that look up elements by id/selector keep doing so.
