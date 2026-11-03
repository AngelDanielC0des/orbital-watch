/**
 * K2 — the engine. `createOrbitalEngine` is the former `startOrbitalWatch()` (legacy `main.ts`) relocated
 * behind the React↔Three contract: the canvas is injected, low-frequency state leaves through
 * `EngineEvents`, per-frame data through `FrameBus<FrameSnapshot>`, commands arrive via `EngineHandle`.
 * No React, no store, no DOM lookups by id.
 */
import gsap from "gsap";
import {
  Color,
  MathUtils,
  NeutralToneMapping,
  Object3D,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LayerManager } from "@/lib/engine/layer-manager";
import { closeImage } from "./layers/overlay-base";
import { ENGINE_THEME } from "./theme";
import type { LayerPick } from "@/types/layers";
import { createFrameBus } from "@/lib/frame-bus";
import { fetchCelestrak, generateSyntheticCatalog } from "@/lib/orbital/catalog";
import { Category, gmst, sunDirection } from "@/lib/orbital/orbit-math";
import type { BodyDef, CatalogEntry } from "@/types/orbital";
import type {
  EngineError,
  EngineEvents,
  EngineHandle,
  EngineOptions,
  FrameSnapshot,
  ILayer,
  LayerFactory,
  LayerFactoryContext,
  LayerInitContext,
  LayerUpdateContext,
  QualityTier,
  SatelliteFilter,
  SatelliteMatch,
  ViewMode,
} from "./contract";
import { EARTH_LABELS, galaxyLabels, projectLabels, solarLabels, type LabelDef, type Occluder } from "./label-projector";
import { EarthLayer, createEarthLayer } from "./layers/earth-layer";
import { GalaxyLayer, createGalaxyLayer } from "./layers/galaxy-layer";
import { HoverLayer, createHoverLayer } from "./layers/hover-layer";
import { PlaceLayer } from "./layers/place-layer";
import { SatellitesLayer, createSatellitesLayer } from "./layers/satellites-layer";
import { SkyLayer, createSkyLayer } from "./layers/sky-layer";
import { SolarLayer, createSolarLayer } from "./layers/solar-layer";
import { TrackLayer, createTrackLayer } from "./layers/track-layer";
import { BODY_DEFS } from "./render/bodies";
import { GALAXY_SUN_POSITION } from "./render/galaxy";
import { FrameGovernor } from "./render/governor";
import type { SatelliteLayer } from "./render/satellites";
import { eclipticObliquity } from "./render/solar";

interface FlyOptions {
  distance: number;
  dir?: Vector3 | null;
  duration?: number;
  ease?: string;
}

/** Camera distance limits and framing constants from the source. */
const EARTH_MIN_DISTANCE = 1.15;
const EARTH_FRAME_RADIUS = 1.32;
const EARTH_MAX_DISTANCE = 160;
const SOLAR_OVERVIEW_DISTANCE = 44e3;
const SOLAR_MAX_DISTANCE = 9e4;
const GALAXY_DISTANCE = 32;
const GALAXY_MAX_DISTANCE = 1600;
const SUN_RADIUS = 22;
const COUNT_REFRESH_MS = 18e5;
const GALAXY_LABEL_DISTANCE: Record<string, number> = { "gal-center": 7, "gal-m31": 70, "gal-lmc": 14, "gal-smc": 10 };
const NO_OCCLUDERS: readonly Occluder[] = [];

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createOrbitalEngine(options: EngineOptions): EngineHandle {
  const { canvas, registry = {}, layers: layerSpecs = [] } = options;
  const events: EngineEvents = options.events ?? {};
  const controller = new AbortController();
  const { signal } = controller;
  const frames = createFrameBus<FrameSnapshot>();
  const snapshot: FrameSnapshot = {
    simMs: options.initial?.simMs ?? Date.now(),
    offsetMs: 0,
    live: true,
    scrubbing: false,
    fps: 0,
    readout: null,
    bodyDistanceKm: NaN,
    labels: [],
  };
  let disposed = false;
  const reducedMotion = options.reducedMotion ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = matchMedia("(pointer: coarse)").matches;
  /** Catalog source switch (`?data=celestrak`); the contract has no option for it, so it is read here. */
  const useCelestrak = new URLSearchParams(location.search).get("data") === "celestrak";

  /** Canvas size in CSS px; refreshed by the ResizeObserver so `frame()` never touches layout. */
  const size = { w: Math.max(1, canvas.clientWidth), h: Math.max(1, canvas.clientHeight) };

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", alpha: false, stencil: false });
  } catch (cause) {
    const error: EngineError = { code: "webgl-unsupported", message: "WebGL no está disponible en este dispositivo.", cause };
    events.onError?.(error);
    throw Object.assign(new Error(error.message), { code: error.code });
  }
  canvas.addEventListener(
    "webglcontextlost",
    (e) => {
      e.preventDefault();
      events.onError?.({ code: "webgl-context-lost", message: "Se perdió el contexto WebGL. Recarga la página." });
    },
    { signal },
  );

  const pickTier = (): QualityTier => {
    if (options.quality) return options.quality;
    // Dev/QA override (`?quality=lo|hi`); the contract has no option for it beyond `options.quality`.
    const forced = new URLSearchParams(location.search).get("quality");
    if (forced === "lo" || forced === "hi") return forced;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    return !coarsePointer && renderer.capabilities.maxTextureSize >= 4096 && memory >= 4 ? "hi" : "lo";
  };
  const tier = pickTier();
  const pixelBudget = {
    max: Math.min(window.devicePixelRatio, tier === "hi" ? 1.5 : 1),
    min: Math.min(window.devicePixelRatio, coarsePointer ? 0.75 : 1),
  };
  renderer.setPixelRatio(pixelBudget.max);
  renderer.setSize(size.w, size.h, false);

  const governor = new FrameGovernor(renderer, {
    minRatio: pixelBudget.min,
    maxRatio: pixelBudget.max,
    lock30: true,
    onChange: (change) => onGovernorChange(change),
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor("#020409");

  const scene = new Scene();
  const camera = new PerspectiveCamera(42, size.w / size.h, 0.005, 6e5);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = EARTH_MIN_DISTANCE;
  controls.maxDistance = EARTH_MAX_DISTANCE;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;

  const sim = { ms: snapshot.simMs, speed: options.initial?.speed ?? 1, playing: options.initial?.playing ?? true, scrubbing: false };
  const universe: { view: ViewMode; focus: string; busy: boolean } = { view: "earth", focus: "earth", busy: false };

  const emitLoading = (ratio: number, text?: string, error?: string) =>
    events.onLoading?.({ ratio, text, error, done: ratio >= 1 && !error });
  const emitView = () => events.onViewChange?.(universe.view, universe.focus, universe.busy);
  const setBusy = (busy: boolean) => {
    universe.busy = busy;
    emitView();
  };
  let lastTickAt = 0;
  const emitTick = (force = false) => {
    const now = performance.now();
    if (!force && now - lastTickAt < 250) return;
    lastTickAt = now;
    const offsetMs = sim.ms - Date.now();
    events.onTimeTick?.({ ms: sim.ms, speed: sim.speed, playing: sim.playing, offsetMs, live: Math.abs(offsetMs) < 2e3 && sim.speed === 1 && sim.playing });
  };

  const skyFade = { stars: 0, glow: 0 };

  // Layers (Open/Closed). Every renderer is an `ILayer` created through the registry (K4 pattern).
  const layers = new LayerManager(scene);
  const created = new Map<string, ILayer>();
  const factoryCtx: LayerFactoryContext = { renderer, scene, camera, tier, reducedMotion, layers: created };
  const initCtx: LayerInitContext = { renderer, scene, camera, tier, referenceMs: sim.ms };
  const layerLoads: Promise<void>[] = [];
  function addLayer(id: string, layer: ILayer, visible: boolean): void {
    created.set(id, layer);
    void layers.register(layer);
    layer.setVisible(visible);
  }
  for (const spec of layerSpecs) {
    const factory = registry[spec.id];
    if (!factory) {
      console.warn(`[OrbitalWatch] Unknown layer "${spec.id}"`);
      continue;
    }
    addLayer(spec.id, factory(factoryCtx), spec.visible ?? true);
  }
  /** The engine needs these layers even if the UI omitted them from `layers`/`registry`: fall back to the stock factory. */
  function requireLayer<T extends ILayer>(id: string, type: abstract new (...args: never[]) => T, factory: LayerFactory, visible = true): T {
    const existing = created.get(id);
    if (existing instanceof type) return existing;
    const made = factory(factoryCtx);
    if (!(made instanceof type)) throw new Error(`Layer factory for "${id}" returned an unexpected layer type`);
    addLayer(id, made, visible);
    return made;
  }
  const skyLayer = requireLayer("sky", SkyLayer, createSkyLayer);
  const earthLayer = requireLayer("earth", EarthLayer, createEarthLayer);
  const solarLayer = requireLayer("solar", SolarLayer, createSolarLayer);
  const galaxyLayer = requireLayer("galaxy", GalaxyLayer, createGalaxyLayer);
  const trackLayer = requireLayer("track", TrackLayer, createTrackLayer);
  // Satellites: the layer is registered now (hide/show works at any time) but its renderer only exists after `attach(catalog)`.
  const satsLayer = requireLayer("satellites", SatellitesLayer, createSatellitesLayer);
  const hoverLayer = requireLayer("hover", HoverLayer, createHoverLayer);
  const sky = skyLayer.inner;
  const solar = solarLayer.inner;
  const track = trackLayer.inner;
  const earth = earthLayer.inner;
  const registeredPlaces = created.get("places");
  const placeLayer = registeredPlaces instanceof PlaceLayer ? registeredPlaces : null;
  if (options.initial?.nightMode) earth.uniforms.uNightMode.value = 1;

  skyLayer
    .init()
    .then(() => {
      if (!disposed) gsap.to(skyFade, { stars: 1, glow: 1, duration: reducedMotion ? 0 : 1.6, ease: "power2.out" });
    })
    .catch((err: unknown) => console.warn("[OrbitalWatch] Cielo no disponible.", err));

  let galaxyDefs: readonly LabelDef[] = [];
  const galaxyPositions = new Map<string, Vector3>();
  const earthLoad = earthLayer
    .init(initCtx, (ratio: number) => emitLoading(ratio * 0.7))
    .catch((err: unknown) => {
      console.error(err);
      emitLoading(1, undefined, "No se pudieron cargar las texturas de la Tierra.");
    });
  // Layers below are initialised by the engine at its own pace (earth/sky above, solar textures on idle after boot).
  const engineInit = new Set(["earth", "sky", "solar", "galaxy", "track", "satellites"]);
  for (const [id, layer] of created) {
    if (engineInit.has(id) || !layer.init) continue;
    layerLoads.push(
      Promise.resolve(layer.init(initCtx)).catch((err: unknown) => console.warn(`[OrbitalWatch] Capa "${id}" no disponible.`, err)),
    );
  }
  let sats: SatelliteLayer | null = null;
  let syntheticCatalog = true;
  /** Lower-cased names / NORAD ids aligned with `sats.catalog`, built once in `boot` (T16). */
  let searchIndex: { names: string[]; ids: string[] } | null = null;
  let pendingFilter: SatelliteFilter | null = options.initial?.filter ?? null;

  const sunDir = new Vector3(1, 0, 0);
  const simDate = new Date();
  let gmstRad = 0;
  const updateSimTime = () => {
    simDate.setTime(sim.ms);
    gmstRad = gmst(simDate);
    sunDirection(simDate, sunDir);
  };

  const eclipticNorth = new Vector3();
  const galaxyOrigin = new Vector3();
  const galaxyViewDir = new Vector3(-0.42, 0.74, 0.52).normalize();
  const tmpA = new Vector3();
  const tmpB = new Vector3();
  const tmpC = new Vector3();
  const tmpD = new Vector3();
  const placeTarget = new Vector3();
  {
    const obliquity = eclipticObliquity(Date.now());
    eclipticNorth.set(0, Math.cos(obliquity), Math.sin(obliquity));
  }

  // ---- Selected body (legacy body panel state) ---------
  let selectedBodyKey: string | null = null;
  const bodyDistanceUpdate = { at: 0 };
  function showBody(def: BodyDef): void {
    selectedBodyKey = def.key;
    snapshot.bodyDistanceKm = NaN;
    bodyDistanceUpdate.at = -1e9;
    events.onBodySelected?.(def);
  }
  function hideBody(): void {
    selectedBodyKey = null;
    snapshot.bodyDistanceKm = NaN;
    events.onBodySelected?.(null);
  }

  // ---- Camera flights --------------------------------------------------------
  const fly = {
    getTarget: null as (() => Vector3) | null,
    blend: 1,
    tween: null as gsap.core.Tween | null,
    startTarget: new Vector3(),
    startDir: new Vector3(),
    endDir: new Vector3(),
    d0: 1,
    d1: 1,
    zoomIn: true,
    last: new Vector3(),
  };

  function flyTo(getTarget: () => Vector3, { distance, dir, duration, ease = "power3.inOut" }: FlyOptions): Promise<void> {
    return new Promise((resolve) => {
      fly.tween?.kill();
      follow.tween?.kill();
      fly.getTarget = getTarget;
      fly.startTarget.copy(controls.target);
      fly.d0 = Math.max(camera.position.distanceTo(controls.target), 1e-4);
      fly.startDir.copy(camera.position).sub(controls.target).divideScalar(fly.d0);
      fly.d1 = distance;
      fly.endDir.copy(dir ?? fly.startDir).normalize();
      fly.zoomIn = distance < fly.d0;
      fly.last.copy(getTarget());
      fly.blend = 0;
      controls.enabled = false;
      controls.minDistance = 1e-5;
      controls.maxDistance = 1e7;
      const auto = MathUtils.clamp(0.7 + 0.2 * Math.abs(Math.log(fly.d1 / fly.d0)), 0.7, 2.1);
      fly.tween = gsap.to(fly, {
        blend: 1,
        duration: reducedMotion ? 0 : (duration ?? auto),
        ease,
        onComplete: () => {
          controls.enabled = true;
          applyDistanceLimits();
          resolve();
        },
      });
    });
  }

  function updateFlight() {
    if (!fly.getTarget) return;
    const target = fly.getTarget();
    if (fly.blend < 1) {
      const t = fly.blend;
      const k = fly.zoomIn ? 1 - (1 - Math.min(1, t * 1.3)) ** 3 : t ** 2.2;
      controls.target.lerpVectors(fly.startTarget, target, k);
      const distance = Math.exp(MathUtils.lerp(Math.log(fly.d0), Math.log(fly.d1), t));
      tmpD.copy(fly.startDir).lerp(fly.endDir, t).normalize();
      camera.position.copy(controls.target).addScaledVector(tmpD, distance);
    } else {
      camera.position.add(tmpA.copy(target).sub(fly.last));
      controls.target.copy(target);
    }
    fly.last.copy(target);
  }

  const bodyByKey = (key: string) => solar.byKey[key];

  function applyDistanceLimits() {
    if (universe.view === "galaxy") {
      controls.minDistance = 0.3;
      controls.maxDistance = GALAXY_MAX_DISTANCE;
    } else if (universe.view === "earth") {
      controls.minDistance = follow.index >= 0 ? 0.03 : EARTH_MIN_DISTANCE;
      controls.maxDistance = EARTH_MAX_DISTANCE;
    } else {
      const body = bodyByKey(universe.focus);
      controls.minDistance =
        universe.focus === "sun" ? 35.2 : body.radius * (body.ring ? 1.35 : 1.18);
      controls.maxDistance = SOLAR_MAX_DISTANCE;
    }
  }

  /** Three-quarter lit view direction for a body, optionally tilted toward its ring pole. */
  function bodyViewDir(position: Vector3, out: Vector3, pole: Vector3 | null = null): Vector3 {
    const toSun = tmpA.copy(solar.sunPosition).sub(position).normalize();
    const toCam = tmpB.copy(camera.position).sub(position).normalize();
    const side = tmpC.crossVectors(toSun, eclipticNorth).normalize();
    if (side.dot(toCam) < 0) side.negate();
    out.copy(toSun).multiplyScalar(0.6).addScaledVector(side, 0.78).addScaledVector(eclipticNorth, 0.24);
    if (pole) out.addScaledVector(pole, 0.55 * (toSun.dot(pole) < 0 ? -1 : 1));
    return out.normalize();
  }

  function sunViewDir(out: Vector3): Vector3 {
    const dir = tmpB.copy(camera.position).sub(solar.sunPosition).normalize();
    dir.addScaledVector(eclipticNorth, -dir.dot(eclipticNorth));
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    return out.copy(dir.normalize()).multiplyScalar(0.7).addScaledVector(eclipticNorth, 0.72).normalize();
  }

  const viewMixTween = { tween: null as gsap.core.Tween | null };
  function tweenViewMix(solarMix: number) {
    viewMixTween.tween?.kill();
    viewMixTween.tween = gsap.to(solar.viewMix, {
      solar: solarMix,
      duration: reducedMotion ? 0 : 0.9,
      ease: "power3.inOut",
    });
  }

  function deselect() {
    if (follow.index < 0) return;
    follow.index = -1;
    follow.tween?.kill();
    sats?.setSelected(-1);
    sats?.setSelectedPosition(null);
    track.clear();
    snapshot.readout = null;
    events.onSatelliteSelected?.(null);
  }

  async function focusBody(key: string) {
    if (key === "earth") return goEarth();
    const body = bodyByKey(key);
    if (!body) return;
    deselect();
    universe.focus = key;
    if (universe.view !== "solar") {
      universe.view = "solar";
      tweenViewMix(1);
    }
    emitView();
    showBody(BODY_DEFS[key]);
    updateLift();
    solar.upgrade(key).catch(() => {});
    const aspectBoost = Math.min(2.6, Math.max(1, 1.2 / camera.aspect));
    await flyTo(() => body.position, {
      distance: (key === "sun" ? 198 : body.radius * (body.ring ? 6.5 : 4.2)) * aspectBoost,
      dir: bodyViewDir(body.position, new Vector3(), body.ring ? body.pole : null),
    });
  }

  async function solarOverview() {
    universe.focus = "sun";
    hideBody();
    updateLift();
    if (universe.view !== "solar") {
      universe.view = "solar";
    }
    emitView();
    tweenViewMix(1);
    await flyTo(() => solar.sunPosition, { distance: SOLAR_OVERVIEW_DISTANCE, dir: sunViewDir(new Vector3()) });
  }

  async function goEarth() {
    deselect();
    universe.focus = "earth";
    universe.view = "earth";
    hideBody();
    updateLift();
    emitView();
    tweenViewMix(0);
    const dir = bodyViewDir(solar.earth.position, new Vector3());
    await flyTo(() => solar.earth.position, { distance: earthFitDistance(), dir });
    fly.getTarget = null;
    applyDistanceLimits();
  }

  function ensureGalaxy(): void {
    if (galaxyLayer.inner) return;
    const galaxy = galaxyLayer.ensure({ height: size.h, fov: camera.fov, pixelRatio: renderer.getPixelRatio(), detail: governor.detail });
    if (!galaxy) return;
    galaxyDefs = galaxyLabels(galaxy.labels);
    for (const label of galaxy.labels) galaxyPositions.set(label.key, label.position);
  }

  async function enterGalaxy() {
    hideBody();
    lift.tween?.kill();
    lift.value = 0;
    camera.clearViewOffset();
    updateLift();
    universe.focus = "sun";
    tweenViewMix(1);
    await flyTo(() => solar.sunPosition, {
      distance: SOLAR_MAX_DISTANCE * 0.9,
      dir: sunViewDir(new Vector3()),
      duration: 1.2,
      ease: "power2.in",
    });
    ensureGalaxy();
    await delay(reducedMotion ? 0 : 180);
    if (disposed) return;
    universe.view = "galaxy";
    emitView();
    fly.tween?.kill();
    fly.getTarget = () => GALAXY_SUN_POSITION;
    controls.target.copy(GALAXY_SUN_POSITION);
    camera.position.copy(GALAXY_SUN_POSITION).addScaledVector(galaxyViewDir, 6);
    fly.blend = 1;
    fly.last.copy(GALAXY_SUN_POSITION);
    await flyTo(() => galaxyOrigin, { distance: GALAXY_DISTANCE, dir: galaxyViewDir, duration: 2.2 });
  }

  async function exitGalaxy() {
    await flyTo(() => GALAXY_SUN_POSITION, {
      distance: 6,
      dir: tmpA.copy(camera.position).sub(controls.target).normalize().clone(),
      duration: 1.6,
    });
    await delay(reducedMotion ? 0 : 180);
    if (disposed) return;
    universe.view = "solar";
    universe.focus = "sun";
    emitView();
    solar.viewMix.solar = 1;
    const dir = sunViewDir(new Vector3());
    fly.tween?.kill();
    fly.getTarget = () => solar.sunPosition;
    controls.target.copy(solar.sunPosition);
    camera.position.copy(solar.sunPosition).addScaledVector(dir, SOLAR_MAX_DISTANCE * 0.9);
    fly.blend = 1;
    fly.last.copy(solar.sunPosition);
    await flyTo(() => solar.sunPosition, { distance: SOLAR_OVERVIEW_DISTANCE, dir, duration: 1.6 });
  }

  async function flyToPlace(place: { name: string; center: Vector3; distance: number }): Promise<void> {
    if (universe.busy || !place) return;
    if (universe.view !== "earth") await setView("earth");
    deselect();
    placeLayer?.setHighlight(place);
    // The place layer rotates with the Earth surface (`rotation.y = earth.surface.rotation.y`).
    const start = place.center.clone().applyAxisAngle(Object3D.DEFAULT_UP, earth.surface.rotation.y);
    await flyTo(
      () => placeTarget.copy(place.center).applyAxisAngle(Object3D.DEFAULT_UP, earth.surface.rotation.y),
      { distance: place.distance, dir: start.normalize() },
    );
  }

  async function setView(view: ViewMode, focus?: string): Promise<void> {
    if (disposed || universe.busy || !view) return;
    setBusy(true);
    try {
      if (universe.view === "galaxy" && view !== "galaxy") await exitGalaxy();
      if (view === "galaxy") {
        if (universe.view === "galaxy") await flyTo(() => galaxyOrigin, { distance: GALAXY_DISTANCE, dir: galaxyViewDir });
        else await enterGalaxy();
      } else if (view === "solar") {
        if (focus) await focusBody(focus);
        else await solarOverview();
      } else if (view === "earth") {
        await goEarth();
      }
    } finally {
      setBusy(false);
    }
  }

  async function pickLabel(key: string): Promise<void> {
    if (universe.busy) return;
    if (key.startsWith("earth:")) return setView("solar", key.slice(6));
    if (key.startsWith("gal-")) {
      if (key === "gal-sun") return setView("solar");
      const label = galaxyLayer.inner?.labels.find((l) => l.key === key);
      if (!label) return;
      const distance = GALAXY_LABEL_DISTANCE[key] ?? 9;
      setBusy(true);
      try {
        await flyTo(() => label.position, {
          distance,
          dir: tmpA.copy(camera.position).sub(label.position).normalize().add(galaxyViewDir).normalize().clone(),
        });
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      await (key === "earth" ? goEarth() : focusBody(key));
    } finally {
      setBusy(false);
    }
  }

  // ---- Label projection (data for the label overlay, read from snapshot.labels) ----
  const solarDefs: readonly LabelDef[] = solarLabels(solar.focusables);
  const resolveSolarLabel = (key: string): Vector3 | null =>
    key === "moon" && camera.position.length() > 2500 ? null : (solar.byKey[key]?.position ?? null);
  const resolveEarthLabel = (key: string): Vector3 | null => solar.byKey[key.slice(6)]?.position ?? null;
  const resolveNone = (): Vector3 | null => null;
  const resolveGalaxyLabel = (key: string): Vector3 | null => galaxyPositions.get(key) ?? null;
  const labelRadius = (key: string): number => solar.byKey[key.startsWith("earth:") ? key.slice(6) : key]?.radius ?? 0;
  let occluders: Occluder[] | null = null;

  // ---- Following a selected object ------------------------------------------
  const follow = {
    index: -1,
    blend: 1,
    tween: null as gsap.core.Tween | gsap.core.Timeline | null,
    offset: new Vector3(),
    startCam: new Vector3(),
    startTarget: new Vector3(),
    lastSat: new Vector3(),
    desired: new Vector3(),
  };
  const trackColors = {
    default: new Color(ENGINE_THEME.track),
    starlink: new Color("#bfe6ff"),
    alarm: new Color("#ff4a3a"),
  };
  // The frozen OrbitTrack starts with its legacy cyan; apply the theme before anything is drawn (plan v2 / N3).
  track.setColor(trackColors.default);
  function trackColorFor(entry: CatalogEntry): Color {
    if (sats?.filter === "debris" || entry.category === Category.DEBRIS || entry.category === Category.ROCKET_BODY) {
      return trackColors.alarm;
    }
    return entry.category === Category.STARLINK ? trackColors.starlink : trackColors.default;
  }

  function select(index: number) {
    if (disposed || !sats || !satsLayer.visible || index < 0 || universe.view !== "earth" || universe.busy) return;
    const entry = sats.catalog[index];
    if (!entry || !track.setTarget(entry)) return;
    track.setColor(trackColorFor(entry));
    const readout = track.update(sim.ms, gmstRad);
    if (!readout) {
      track.clear();
      return;
    }
    fly.tween?.kill();
    fly.getTarget = null;
    follow.index = index;
    sats.setSelected(index);
    snapshot.readout = readout;
    events.onSatelliteSelected?.({ index, entry, readout, synthetic: syntheticCatalog });
    const satPos = track.position;
    const up = tmpA.copy(satPos).normalize();
    const toCam = tmpB.copy(camera.position).sub(satPos).normalize();
    const distance = MathUtils.clamp(satPos.length() * 0.32, 0.22, 3.2);
    follow.offset.copy(up).multiplyScalar(0.75).addScaledVector(toCam, 0.65).normalize().multiplyScalar(distance);
    follow.startCam.copy(camera.position);
    follow.startTarget.copy(controls.target);
    follow.lastSat.copy(satPos);
    follow.blend = 0;
    controls.enabled = false;
    controls.minDistance = 0.03;
    follow.tween?.kill();
    follow.tween = gsap.to(follow, {
      blend: 1,
      duration: reducedMotion ? 0 : 1.8,
      ease: "power3.inOut",
      onComplete: () => {
        controls.enabled = true;
      },
    });
  }

  function unfollow() {
    if (follow.index < 0) return;
    deselect();
    const home = tmpA.copy(camera.position).normalize().multiplyScalar(earthFitDistance());
    controls.enabled = false;
    const duration = reducedMotion ? 0 : 1.6;
    const tl = gsap.timeline({
      onComplete: () => {
        controls.minDistance = EARTH_MIN_DISTANCE;
        controls.enabled = true;
      },
    });
    tl.to(camera.position, { x: home.x, y: home.y, z: home.z, duration, ease: "power3.inOut" }, 0);
    tl.to(controls.target, { x: 0, y: 0, z: 0, duration, ease: "power3.inOut" }, 0);
    follow.tween = tl;
  }

  function updateFollow() {
    if (follow.index < 0 || !track.state) return;
    const satPos = track.position;
    if (follow.blend < 1) {
      follow.desired.copy(satPos).add(follow.offset);
      camera.position.lerpVectors(follow.startCam, follow.desired, follow.blend);
      controls.target.lerpVectors(follow.startTarget, satPos, follow.blend);
    } else {
      camera.position.add(tmpA.copy(satPos).sub(follow.lastSat));
      controls.target.copy(satPos);
    }
    follow.lastSat.copy(satPos);
  }

  // ---- Filters, night mode, counts -------------------------------------------
  const alarm = { alarm: 0 };
  function setFilter(filter: SatelliteFilter) {
    if (disposed) return;
    if (!sats) {
      pendingFilter = filter;
      events.onFilterChange?.(filter);
      return;
    }
    sats.setFilter(filter);
    events.onFilterChange?.(filter);
    const isDebris = filter === "debris";
    gsap.to(alarm, {
      alarm: +isDebris,
      duration: reducedMotion ? 0 : 0.9,
      ease: "power2.out",
      onUpdate: () => {
        earth.setAlarm(alarm.alarm);
        if (sats) sats.uniforms.uAlarm.value = alarm.alarm;
      },
    });
    if (follow.index >= 0) {
      if (sats.isVisible(follow.index, sim.ms)) track.setColor(trackColorFor(sats.catalog[follow.index]));
      else unfollow();
    }
    refreshCount();
  }

  function setNightMode(on: boolean) {
    if (disposed) return;
    events.onNightModeChange?.(on);
    gsap.to(earth.uniforms.uNightMode, { value: +on, duration: reducedMotion ? 0 : 1.2, ease: "power2.inOut" });
  }

  const visibleCounts = [0, 0, 0, 0];
  let countedAtMs = NaN;
  function refreshCount() {
    if (!sats) return;
    sats.countVisible(sim.ms, visibleCounts);
    countedAtMs = sim.ms;
    events.onVisibleCount?.(visibleCounts[0] + visibleCounts[1] + visibleCounts[2] + visibleCounts[3]);
  }

  // ---- Pointer and wheel (the canvas is injected; keyboard and HUD buttons live in React) ----
  const pointer = { downX: 0, downY: 0, downAt: 0 };
  /** Mouse position in canvas-local CSS px (the units `size`, the camera projection and the picks use). */
  const mouse = { x: 0, y: 0, inside: false };
  const canvasPoint = { x: 0, y: 0 };
  function toCanvas(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    // `size` is the integer clientWidth/Height that setSize and every projection use, while the rect can be
    // fractional (layout at non-integer DPR): normalise by the same numbers so pick and drawing agree exactly.
    canvasPoint.x = (e.clientX - rect.left) * (rect.width > 0 ? size.w / rect.width : 1);
    canvasPoint.y = (e.clientY - rect.top) * (rect.height > 0 ? size.h / rect.height : 1);
    return canvasPoint;
  }

  const PICK_RADIUS_MOUSE = 14;
  const PICK_RADIUS_TOUCH = 24;
  const HOVER_THROTTLE_MS = 120;
  const HOVER_RING_PX = 18;

  // ---- Hover marker: mirrors what a click would select (desktop mouse only) ----
  const hover = {
    /** Hovered satellite index, or -1. */
    index: -1,
    /** Hovered body key (solar view, or Moon/Sun/planets from the Earth view), or null. */
    bodyKey: null as string | null,
    /** Bumped on every clear so in-flight async picks of an older hover are dropped. */
    seq: 0,
    pending: false,
    lastAt: -1e9,
    timer: null as ReturnType<typeof setTimeout> | null,
    pos: new Vector3(),
  };
  // ---- ADR-16: environmental overlay hover/pick (pollution samples, fire hotspots/cells, ozone surface) ----
  const LAYER_PICK_ORDER = ["pollution", "fires", "ozone"] as const;
  const layerHover = { pick: null as LayerPick | null, key: "" };
  const layerSelected = { id: "", index: -1 };
  const dataLayersShown = () =>
    universe.view === "earth" && !satsLayer.visible && LAYER_PICK_ORDER.some((id) => layers.get(id)?.visible === true);
  function pickDataLayers(x: number, y: number, radiusPx: number): LayerPick | null {
    for (const id of LAYER_PICK_ORDER) {
      const hit = layers.getDataLayer(id)?.pick?.(x, y, camera, size.w, size.h, radiusPx) ?? null;
      if (hit) return hit;
    }
    return null;
  }
  /** Identity of a hover target: the same point/cell keeps its key; surface hovers change per 1° cell. */
  const pickKey = (p: LayerPick | null) =>
    p === null ? "" : p.kind === "surface" ? `${p.layerId}:s:${Math.floor(p.lat)}:${Math.floor(p.lon)}` : `${p.layerId}:${p.kind}:${p.index}`;
  function setLayerHover(p: LayerPick | null): void {
    const key = pickKey(p);
    if (key === layerHover.key) {
      layerHover.pick = p;
      return;
    }
    const prev = layerHover.pick;
    if (prev?.kind === "point") layers.getDataLayer(prev.layerId)?.setHovered?.(-1);
    if (p?.kind === "point") layers.getDataLayer(p.layerId)?.setHovered?.(p.index);
    layerHover.pick = p;
    layerHover.key = key;
    const pointing = p !== null && p.kind !== "surface";
    canvas.classList.toggle("is-pointing", pointing);
    canvas.style.cursor = pointing ? "pointer" : p ? "crosshair" : "";
    if (!pointing) hoverLayer.hide();
    events.onLayerHover?.(p);
  }
  function selectLayerPoint(p: LayerPick | null): void {
    if (layerSelected.index >= 0) layers.getDataLayer(layerSelected.id)?.setSelected?.(-1);
    layerSelected.id = p?.kind === "point" ? p.layerId : "";
    layerSelected.index = p?.kind === "point" ? p.index : -1;
    if (p?.kind === "point") layers.getDataLayer(p.layerId)?.setSelected?.(p.index);
  }
  const layerPointHovered = () => layerHover.pick?.kind === "point";

  const hoverActive = () => hover.index >= 0 || hover.bodyKey !== null || layerPointHovered();
  function clearHover(): void {
    hover.seq++;
    if (layerHover.pick) setLayerHover(null);
    hover.index = -1;
    hover.bodyKey = null;
    hoverLayer.hide();
    canvas.classList.remove("is-pointing");
    canvas.style.cursor = "";
  }
  function setHover(index: number, bodyKey: string | null): void {
    // The followed satellite already wears its own model + reticle: pointer cursor, no marker.
    hover.index = index >= 0 && index === follow.index ? -1 : index;
    hover.bodyKey = index >= 0 ? null : bodyKey;
    const pointing = index >= 0 || bodyKey !== null;
    canvas.classList.toggle("is-pointing", pointing);
    // The engine owns the canvas; OrbitControls writes `style.cursor` too (see the pointerup re-apply below).
    canvas.style.cursor = pointing ? "pointer" : "";
    if (!hoverActive()) hoverLayer.hide();
  }

  function pickBody(x: number, y: number, radiusPx: number) {
    const hit = solar.pick(x, y, camera, size.w, size.h, radiusPx);
    return hit && (universe.view !== "earth" || hit.key !== "earth") ? hit : null;
  }

  function runHover(): void {
    hover.timer = null;
    if (disposed || !mouse.inside) return;
    hover.lastAt = performance.now();
    const x = mouse.x;
    const y = mouse.y;
    if (universe.busy) return clearHover();
    if (universe.view === "solar") {
      setHover(-1, pickBody(x, y, PICK_RADIUS_MOUSE)?.key ?? null);
    } else if (dataLayersShown()) {
      setLayerHover(pickDataLayers(x, y, PICK_RADIUS_MOUSE));
    } else if (universe.view === "earth" && sats && satsLayer.visible) {
      if (hover.pending) return scheduleHover();
      hover.pending = true;
      const seq = hover.seq;
      const done = (index: number) => {
        hover.pending = false;
        if (disposed || seq !== hover.seq) return;
        setHover(index, index >= 0 ? null : (pickBody(x, y, PICK_RADIUS_MOUSE * 0.7)?.key ?? null));
      };
      // GPU readback (fresh positions; the LOD readback only runs while the camera is near the Earth).
      sats.pickAsync(x, y, camera, size.w, size.h, sim.ms, PICK_RADIUS_MOUSE).then(done, () => done(-1));
    } else {
      clearHover();
    }
  }
  /** Throttled (120 ms) with a trailing run, so a pointer that stops over a dot still gets its marker. */
  function scheduleHover(): void {
    if (hover.timer !== null) return;
    hover.timer = setTimeout(runHover, Math.max(0, HOVER_THROTTLE_MS - (performance.now() - hover.lastAt)));
  }

  /** Every frame: the marker follows the hovered object (CPU Kepler position, no readback) and hides when it drifts off the pointer. */
  const hoverScreen = new Vector3();
  function updateHover(nearEarth: boolean): void {
    if (!hoverActive()) return;
    const pxScale = (size.h * 0.5) / Math.tan(MathUtils.degToRad(camera.fov) * 0.5);
    let ringPx = HOVER_RING_PX;
    let diskPx = 0;
    const layerPoint = layerHover.pick?.kind === "point" ? layerHover.pick : null;
    if (layerPoint) {
      if (!nearEarth || universe.view !== "earth" || universe.busy || !layers.getDataLayer(layerPoint.layerId)?.pointWorld?.(layerPoint.index, hover.pos)) {
        return clearHover();
      }
    } else if (hover.index >= 0) {
      if (!sats || !satsLayer.visible || !nearEarth || universe.view !== "earth" || universe.busy || !sats.isVisible(hover.index, sim.ms)) {
        return clearHover();
      }
      sats.positionAt(hover.index, sim.ms, hover.pos);
    } else {
      const body = hover.bodyKey ? solar.byKey[hover.bodyKey] : undefined;
      if (!body || universe.busy || (universe.view !== "solar" && !(universe.view === "earth" && satsLayer.visible))) return clearHover();
      hover.pos.copy(body.position);
      diskPx = (body.radius / Math.max(camera.position.distanceTo(hover.pos), 1e-6)) * pxScale;
      ringPx = MathUtils.clamp(2 * diskPx + 14, HOVER_RING_PX, 64);
    }
    hoverScreen.copy(hover.pos).project(camera);
    const dx = (hoverScreen.x * 0.5 + 0.5) * size.w - mouse.x;
    const dy = (0.5 - hoverScreen.y * 0.5) * size.h - mouse.y;
    if (!mouse.inside || hoverScreen.z > 1 || Math.hypot(dx, dy) - diskPx > PICK_RADIUS_MOUSE * 1.6) return clearHover();
    hoverLayer.place(hover.pos, ringPx, hover.index >= 0 || layerPoint !== null, clock.elapsedTime);
  }

  canvas.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      pointer.downX = e.clientX;
      pointer.downY = e.clientY;
      pointer.downAt = performance.now();
      clearHover();
    },
    { signal },
  );

  canvas.addEventListener(
    "pointerup",
    (e: PointerEvent) => {
      // OrbitControls rewrites `style.cursor` around a drag; ours must win again once the button is released.
      canvas.style.cursor = hoverActive() ? "pointer" : "";
      if (
        Math.hypot(e.clientX - pointer.downX, e.clientY - pointer.downY) > 6 ||
        performance.now() - pointer.downAt > 450 ||
        universe.busy
      ) {
        return;
      }
      const { x, y } = toCanvas(e);
      const radius = e.pointerType === "touch" ? PICK_RADIUS_TOUCH : PICK_RADIUS_MOUSE;
      if (universe.view === "solar") {
        const hit = pickBody(x, y, radius);
        if (hit && hit.key !== universe.focus) void pickLabel(hit.key);
      } else if (dataLayersShown()) {
        const hit = pickDataLayers(x, y, radius);
        selectLayerPoint(hit);
        events.onLayerPick?.(hit);
      } else if (universe.view === "earth" && sats && satsLayer.visible) {
        sats.pickAsync(x, y, camera, size.w, size.h, sim.ms, radius).then((index: number) => {
          if (disposed) return;
          if (index >= 0) {
            if (index !== follow.index) select(index);
            return;
          }
          const hit = pickBody(x, y, radius * 0.7);
          if (hit) void setView("solar", hit.key);
        });
      }
    },
    { signal },
  );

  canvas.addEventListener(
    "pointermove",
    (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      mouse.inside = true;
      if (e.buttons !== 0) {
        if (hoverActive()) clearHover();
        return;
      }
      const { x, y } = toCanvas(e);
      mouse.x = x;
      mouse.y = y;
      scheduleHover();
    },
    { signal },
  );
  canvas.addEventListener(
    "pointerleave",
    () => {
      mouse.inside = false;
      clearHover();
    },
    { signal },
  );

  const wheelOut = { count: 0, at: 0 };
  canvas.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      if (mouse.inside) scheduleHover();
      if (
        universe.busy ||
        fly.blend < 1 ||
        follow.index >= 0 ||
        e.deltaY <= 0 ||
        camera.position.distanceTo(controls.target) < controls.maxDistance * 0.97
      ) {
        return;
      }
      const now = performance.now();
      wheelOut.count = now - wheelOut.at < 700 ? wheelOut.count + 1 : 1;
      wheelOut.at = now;
      if (wheelOut.count < 4) return;
      wheelOut.count = 0;
      if (universe.view === "earth") void setView("solar");
      else if (universe.view === "solar") void setView("galaxy");
    },
    { passive: true, signal },
  );

  function togglePlay() {
    sim.playing = !sim.playing;
    emitTick(true);
  }

  // ---- Viewport ----------------------------------------------------------------
  /**
   * `WebGLRenderer.setViewport` takes CSS px and multiplies by the pixel ratio itself. Passing the drawing-buffer
   * size here (physical px) painted the scene at `pixelRatio`× scale, shifted towards the top-right, so every
   * projected thing (picks, labels, hover) disagreed with what was on screen whenever DPR > 1 (T21 root cause).
   */
  function resetViewport() {
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, size.w, size.h);
    renderer.setScissorTest(false);
  }

  function syncViewports() {
    const w = size.w;
    const h = size.h;
    const ratio = renderer.getPixelRatio();
    layers.setViewport(w, h, camera.fov, ratio);
  }

  /**
   * On portrait screens the body panel (or the timeline overlay, see `setTimelineInset`) covers the
   * bottom, so the scene is lifted. On landscape screens the scene is never lifted.
   */
  let timelineInset = 0;
  const lift = { value: 0, tween: null as gsap.core.Tween | null };
  function applyLift() {
    if (lift.value > 1e-4) {
      camera.setViewOffset(size.w, size.h, 0, size.h * lift.value, size.w, size.h);
    } else {
      camera.clearViewOffset();
    }
  }
  function liftTarget(): number {
    if (camera.aspect >= 0.8) return 0;
    const bodyLift = selectedBodyKey ? 0.17 : 0;
    const insetLift = Math.min(0.3, timelineInset / (2 * size.h));
    return Math.max(bodyLift, insetLift);
  }
  function updateLift() {
    const target = liftTarget();
    lift.tween?.kill();
    lift.tween = gsap.to(lift, {
      value: target,
      duration: reducedMotion ? 0 : 0.55,
      ease: "power3.inOut",
      onUpdate: applyLift,
      onComplete: applyLift,
    });
  }
  /** Height in CSS px of the timeline overlay (measured by React) so the globe is lifted above it. */
  function setTimelineInset(px: number): void {
    if (disposed || !Number.isFinite(px)) return;
    const next = Math.max(0, px);
    if (next === timelineInset) return;
    timelineInset = next;
    updateLift();
  }

  function onResize() {
    if (disposed) return;
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    size.w = w;
    size.h = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    updateLift();
    pixelBudget.max = Math.min(window.devicePixelRatio, tier === "hi" ? 1.5 : 1);
    governor.setMaxRatio(pixelBudget.max);
    renderer.setPixelRatio(Math.min(renderer.getPixelRatio(), pixelBudget.max));
    renderer.setSize(w, h, false);
    syncViewports();
  }
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(canvas);

  // Local equivalent of the deprecated THREE.Clock (autoStart: the first getDelta() returns 0).
  const clock = {
    elapsedTime: 0,
    last: null as number | null,
    getDelta(): number {
      const nowMs = performance.now();
      const delta = this.last === null ? 0 : (nowMs - this.last) / 1000;
      this.last = nowMs;
      this.elapsedTime += delta;
      return delta;
    },
  };
  const fps = { frames: 0, elapsed: 0, lastTime: undefined as number | undefined };

  function setRatio(ratio: number) {
    renderer.setPixelRatio(ratio);
    renderer.setSize(size.w, size.h, false);
    syncViewports();
  }
  function setDetail(detail: number) {
    layers.setDetail(detail);
  }
  function onGovernorChange({ ratio, detail }: { ratio: number; detail: number }) {
    if (Math.abs(renderer.getPixelRatio() - ratio) > 0.01) setRatio(ratio);
    setDetail(detail);
  }

  const simClock = { simAccum: 0 };

  /** Keeps the near plane as far out as the closest surface allows (depth precision). */
  function updateClipPlanes() {
    let near: number;
    let far: number;
    if (universe.view === "galaxy") {
      near = MathUtils.clamp(camera.position.distanceTo(controls.target) * 0.002, 5e-5, 0.5);
      far = 2e4;
    } else {
      const p = camera.position;
      let closest = p.length() - 1;
      for (const body of solar.bodies) {
        let d = p.distanceTo(body.position) - body.radius;
        if (body.ring) {
          const rel = tmpA.copy(p).sub(body.position);
          d = Math.min(d, Math.max(Math.abs(rel.dot(body.pole)), rel.length() - body.ring.outer));
        }
        closest = Math.min(closest, d);
      }
      closest = Math.min(closest, p.distanceTo(solar.sunPosition) - SUN_RADIUS);
      if (follow.index >= 0 && track.state) closest = Math.min(closest, p.distanceTo(track.position));
      near = MathUtils.clamp(closest * 0.4, 0.002, 2e3);
      far = 6e5;
    }
    if (Math.abs(near / camera.near - 1) > 0.04 || camera.far !== far) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  // Render-loop pause (hidden tab): `frameLoop.fn` is assigned in the frame block below and, on resume,
  // `clock.getDelta()` is consumed once so the first frame after a pause does not get a huge `dt`.
  const frameLoop: { fn: (() => void) | null } = { fn: null };
  let paused = false;
  function setRenderingPaused(next: boolean): void {
    if (disposed || paused === next) return;
    paused = next;
    if (!next) clock.getDelta();
    renderer.setAnimationLoop(next ? null : frameLoop.fn);
  }

  /** Name / NORAD search over `sats.catalog`: prefix matches first, then substring; only objects visible under the current filter. */
  function findSatellites(query: string, limit = 8): SatelliteMatch[] {
    const q = query.trim().toLowerCase();
    if (disposed || !sats || !searchIndex || q.length < 2 || limit <= 0) return [];
    const { names, ids } = searchIndex;
    const catalog = sats.catalog;
    const prefix: number[] = [];
    const inner: number[] = [];
    for (let i = 0; i < names.length && prefix.length < limit; i++) {
      const name = names[i];
      const id = ids[i];
      const inName = name.indexOf(q);
      const inId = id.indexOf(q);
      if (inName < 0 && inId < 0) continue;
      if (!sats.isVisible(i, sim.ms)) continue;
      if (inName === 0 || inId === 0) prefix.push(i);
      else if (inner.length < limit) inner.push(i);
    }
    const matches: SatelliteMatch[] = [];
    for (const i of prefix.concat(inner)) {
      if (matches.length >= limit) break;
      const entry = catalog[i];
      matches.push({ index: i, name: entry.omm.OBJECT_NAME, noradId: String(entry.omm.NORAD_CAT_ID), category: entry.category });
    }
    return matches;
  }

  /** Layer update context, mutated in place each frame. `elapsedTime` is the sim-seconds accumulated since the last rendered frame (what `Earth.update` expects). */
  const layerCtx: LayerUpdateContext = {
    simMs: sim.ms,
    gmstRad: 0,
    sunDir,
    camera,
    cameraPosition: camera.position,
    elapsedTime: 0,
    dt: 0,
    detail: 1,
    nearEarth: true,
  };

  function frame(now: number) {
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    governor.tick(rawDt);
    const running = sim.playing && !sim.scrubbing;
    if (running) sim.ms += dt * 1e3 * sim.speed;
    simClock.simAccum += running ? dt * sim.speed : 0;
    controls.update();
    const offset = sim.ms - Date.now();
    snapshot.simMs = sim.ms;
    snapshot.offsetMs = offset;
    snapshot.live = Math.abs(offset) < 2e3 && sim.speed === 1 && sim.playing;
    snapshot.scrubbing = sim.scrubbing;
    emitTick();

    const inGalaxy = universe.view === "galaxy";
    const time = clock.elapsedTime;
    if (!inGalaxy) {
      updateSimTime();
      solar.updatePositions(sim.ms, sunDir);
    }
    if (follow.index >= 0 && sats) {
      const readout = track.update(sim.ms, gmstRad);
      snapshot.readout = readout;
      sats.setSelectedPosition(readout ? track.position : null);
      updateFollow();
    } else {
      updateFlight();
    }
    camera.updateMatrixWorld();
    updateClipPlanes();

    if (!governor.shouldRender(now)) {
      frames.publish(snapshot);
      return;
    }
    if (inGalaxy) {
      if (galaxyLayer.inner) {
        simClock.simAccum = 0;
        projectLabels(galaxyDefs, resolveGalaxyLabel, camera, size.w, size.h, NO_OCCLUDERS, undefined, snapshot.labels, labelRadius);
        governor.beginRender(now);
        resetViewport();
        galaxyLayer.renderPass(renderer, camera);
        governor.endRender();
      } else {
        snapshot.labels.length = 0;
      }
    } else {
      const camDistance = camera.position.length();
      const nearEarth = camDistance < 420;
      layerCtx.simMs = sim.ms;
      layerCtx.gmstRad = gmstRad;
      layerCtx.elapsedTime = simClock.simAccum;
      layerCtx.dt = dt;
      layerCtx.detail = governor.detail;
      layerCtx.nearEarth = nearEarth;
      layers.update(layerCtx);
      simClock.simAccum = 0;
      updateHover(nearEarth);
      // SatelliteLayer.update / OrbitTrack.update need clock time and return a readout, so they are driven
      // explicitly here rather than through `layers.update(layerCtx)`. Layer visibility (`toggleLayer`) wins over `nearEarth`.
      if (sats) {
        const satsShown = satsLayer.visible && nearEarth;
        satsLayer.object3d.visible = satsShown;
        if (nearEarth) {
          if (follow.index >= 0) track.group.visible = trackLayer.visible;
        } else {
          track.group.visible = false;
        }
        if (satsShown) {
          sats.update(sim.ms, camera.position, sunDir, time);
          if (!(Math.abs(sim.ms - countedAtMs) < COUNT_REFRESH_MS)) refreshCount();
        }
      }
      const earthZoom = MathUtils.smoothstep(camDistance, 10, 70);
      solar.update({ ms: sim.ms, camera, time, dt, earthZoom, flare: true });
      const exposure = universe.view === "earth" ? MathUtils.lerp(0.72, 1, earthZoom) : 1;
      sky.setExposure(skyFade.stars * exposure, skyFade.glow * 0.2 * exposure);
      occluders ??= [
        ...solar.occluders().map((o) => ({ center: o.position, radius: o.radius })),
        { center: solar.sunPosition, radius: SUN_RADIUS },
      ];
      if (universe.view === "solar") {
        projectLabels(solarDefs, resolveSolarLabel, camera, size.w, size.h, occluders, universe.focus, snapshot.labels, labelRadius);
        if (selectedBodyKey && time - bodyDistanceUpdate.at > 0.25) {
          snapshot.bodyDistanceKm = solar.distanceFromEarthKm(selectedBodyKey, sim.ms);
          bodyDistanceUpdate.at = time;
        }
      } else {
        projectLabels(
          EARTH_LABELS,
          follow.index < 0 ? resolveEarthLabel : resolveNone,
          camera,
          size.w,
          size.h,
          occluders,
          undefined,
          snapshot.labels,
          labelRadius,
        );
      }
      governor.beginRender(now);
      resetViewport();
      renderer.render(scene, camera);
      governor.endRender();
    }
    fps.frames++;
    frames.publish(snapshot);
  }

  function loop() {
    frame(performance.now());
    fps.elapsed += Math.min(clock.elapsedTime - (fps.lastTime ?? clock.elapsedTime), 0.25);
    fps.lastTime = clock.elapsedTime;
    if (fps.elapsed >= 0.5) {
      const value = fps.frames / fps.elapsed;
      snapshot.fps = value;
      events.onFps?.(value);
      fps.frames = 0;
      fps.elapsed = 0;
    }
  }
  frameLoop.fn = loop;

  /** Distance at which the Earth (plus a margin) fills the narrower field of view. */
  function earthFitDistance() {
    const halfV = MathUtils.degToRad(camera.fov) / 2;
    const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
    return EARTH_FRAME_RADIUS / Math.sin(Math.min(halfV, halfH));
  }

  function placeInitialCamera() {
    updateSimTime();
    const dir = tmpA.copy(sunDir).applyAxisAngle(Object3D.DEFAULT_UP, -1.55);
    dir.y = 0.38;
    camera.position.copy(dir.normalize().multiplyScalar(earthFitDistance()));
    controls.target.set(0, 0, 0);
    controls.update();
  }

  async function loadCatalog(): Promise<{ catalog: CatalogEntry[]; label: string; synthetic: boolean }> {
    if (!useCelestrak) {
      return { catalog: generateSyntheticCatalog(sim.ms), label: "catálogo sintético (demo)", synthetic: true };
    }
    try {
      emitLoading(0.72, "Descargando elementos orbitales de CelesTrak…");
      return { catalog: await fetchCelestrak(), label: "CelesTrak GP", synthetic: false };
    } catch (err) {
      console.warn("[OrbitalWatch] CelesTrak no disponible, usando catálogo sintético.", err);
      events.onError?.({
        code: "catalog-failed",
        message: "CelesTrak no responde; se usa el catálogo sintético.",
        cause: err,
      });
      return {
        catalog: generateSyntheticCatalog(sim.ms),
        label: "CelesTrak no responde · catálogo sintético",
        synthetic: true,
      };
    }
  }

  const idleHandles: Array<() => void> = [];
  const whenIdle = (fn: () => void) => {
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(fn, { timeout: 2500 });
      idleHandles.push(() => cancelIdleCallback(id));
    } else {
      const id = setTimeout(fn, 600);
      idleHandles.push(() => clearTimeout(id));
    }
  };

  async function boot(): Promise<void> {
    emitLoading(0, "Cargando texturas de la Tierra…");
    emitView();
    emitTick(true);
    placeInitialCamera();
    syncViewports();
    if (!paused) renderer.setAnimationLoop(loop);
    const [{ catalog, label, synthetic }] = await Promise.all([loadCatalog(), earthLoad, ...layerLoads]);
    if (disposed) return;
    emitLoading(0.85, `Inicializando ${new Intl.NumberFormat("es-ES").format(catalog.length)} órbitas…`);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (disposed) return;
    sats = satsLayer.attach(catalog, { referenceMs: sim.ms, height: size.h, fov: camera.fov, pixelRatio: renderer.getPixelRatio() });
    syntheticCatalog = synthetic;
    searchIndex = {
      names: sats.catalog.map((entry) => String(entry.omm.OBJECT_NAME).toLowerCase()),
      ids: sats.catalog.map((entry) => String(entry.omm.NORAD_CAT_ID)),
    };
    events.onCatalog?.({ label, synthetic, count: catalog.length });
    if (pendingFilter && pendingFilter !== "all") setFilter(pendingFilter);
    pendingFilter = null;
    refreshCount();
    emitLoading(0.95, "Compilando shaders…");
    await renderer.compileAsync(scene, camera);
    if (disposed) return;
    emitLoading(1);
    whenIdle(() => {
      solarLayer
        .init()
        .catch((err: unknown) => console.warn("[OrbitalWatch] Texturas planetarias no disponibles.", err));
      whenIdle(() => {
        void ensureGalaxy();
      });
    });
    if (options.initial?.view && options.initial.view !== "earth") void setView(options.initial.view);
    if (options.debug && process.env.NODE_ENV !== "production") {
      Object.assign(window, {
        orbitalwatch: {
          scene,
          camera,
          renderer,
          sats,
          earth,
          track,
          sim,
          select,
          tier,
          solar,
          sky,
          layers,
          universe,
          setView,
          pickLabel,
          controls,
          governor,
          get galaxy() {
            return galaxyLayer.inner;
          },
        },
      });
    }
  }
  boot().catch((cause: unknown) => {
    emitLoading(1, undefined, "No se pudo iniciar la simulación.");
    events.onError?.({ code: "boot-failed", message: "No se pudo iniciar la simulación.", cause });
  });

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    controller.abort();
    if (hover.timer !== null) clearTimeout(hover.timer);
    hover.timer = null;
    resizeObserver.disconnect();
    follow.tween?.kill();
    fly.tween?.kill();
    viewMixTween.tween?.kill();
    lift.tween?.kill();
    gsap.killTweensOf([alarm, earth.uniforms.uNightMode, camera.position, controls.target, skyFade, solar.viewMix, fly, follow, lift]);
    for (const cancel of idleHandles) cancel();
    Reflect.deleteProperty(window, "orbitalwatch");
    controls.dispose();
    governor.dispose();
    layers.dispose(); // disposes every registered layer exactly once (sky, earth, places, solar, galaxy, track, satellites)
    frames.clear();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return {
    frames,
    tier,
    setView,
    focusBody: (key) => setView("solar", key),
    setFilter,
    setNightMode,
    selectSatellite: select,
    deselectSatellite: unfollow,
    togglePlay,
    setSpeed: (speed) => {
      sim.speed = speed;
      if (!sim.playing) sim.playing = true;
      emitTick(true);
    },
    seekNow: () => {
      sim.ms = Date.now();
      sim.speed = 1;
      sim.playing = true;
      refreshCount();
      emitTick(true);
    },
    scrubDays: (days) => {
      sim.ms = Date.now() + days * 86_400_000;
      refreshCount();
      emitTick(true);
    },
    flyToPlace,
    dismissHint: () => {},
    toggleLayer: (id, visible) => layers.setVisible(id, visible),
    setLayerOpacity: (id, opacity) => layers.getDataLayer(id)?.setOpacity(opacity),
    setLayerData: (id, payload) => {
      const layer = disposed ? undefined : layers.getDataLayer(id);
      if (layer) layer.setData(payload);
      else closeImage(payload);
    },
    clearLayerData: (id) => layers.getDataLayer(id)?.clearData(),
    clearLayerPick: () => selectLayerPoint(null),
    selectLayerPoint: (id, index) => {
      if (id === "pollution" || id === "fires" || id === "ozone") selectLayerPoint({ layerId: id, kind: "point", index, lat: 0, lon: 0, x: 0, y: 0 });
    },
    pickLabel,
    setTimelineInset,
    findSatellites,
    setRenderingPaused,
    dispose,
  };
}
