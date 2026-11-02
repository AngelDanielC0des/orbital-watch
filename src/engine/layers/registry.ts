/**
 * Layer registry: id → factory. The UI picks layers by id (`EngineOptions.layers`);
 * adding a layer (ozone, pollution…) is one new file + one line here. Order matters only
 * for `LayerFactoryContext.layers` lookups (a layer can read the ones created before it).
 */
import type { LayerRegistry } from "@/engine/contract";
import { createEarthLayer } from "./earth-layer";
import { createGalaxyLayer } from "./galaxy-layer";
import { createHoverLayer } from "./hover-layer";
import { createPlaceLayer } from "./place-layer";
import { createSatellitesLayer } from "./satellites-layer";
import { createSkyLayer } from "./sky-layer";
import { createSolarLayer } from "./solar-layer";
import { createTrackLayer } from "./track-layer";

export const LAYER_REGISTRY: LayerRegistry = {
  sky: createSkyLayer,
  earth: createEarthLayer,
  places: createPlaceLayer,
  solar: createSolarLayer,
  galaxy: createGalaxyLayer,
  track: createTrackLayer,
  satellites: createSatellitesLayer,
  hover: createHoverLayer,
};

/**
 * Default layer set the shell mounts. The order is the scene-graph order of the legacy build
 * (sky → earth → places → solar → track → satellites) and drives render tie-breaks, so keep it.
 * `earth` precedes `places` (which rides on its group). `galaxy` renders in its own pass.
 */
export const DEFAULT_LAYERS = [
  { id: "sky" },
  { id: "earth" },
  { id: "places" },
  { id: "solar" },
  { id: "galaxy" },
  { id: "track" },
  { id: "satellites" },
  { id: "hover" },
] as const;
