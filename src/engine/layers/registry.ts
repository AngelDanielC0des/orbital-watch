/**
 * Layer registry: id → factory. The UI picks layers by id (`EngineOptions.layers`);
 * adding a layer (ozone, pollution…) is one new file + one line here. Order matters only
 * for `LayerFactoryContext.layers` lookups (a layer can read the ones created before it).
 */
import type { LayerRegistry } from "@/engine/contract";
import { createEarthLayer } from "./earth-layer";
import { createGalaxyLayer } from "./galaxy-layer";
import { createFiresLayer } from "./heatmap-layer";
import { createHoverLayer } from "./hover-layer";
import { createPlaceLayer } from "./place-layer";
import { createPollutionLayer } from "./points-overlay-layer";
import { createOzoneLayer } from "./raster-overlay-layer";
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
  ozone: createOzoneLayer,
  fires: createFiresLayer,
  pollution: createPollutionLayer,
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
  // Environmental overlays (ADR-15): created hidden after `earth`, fed through `setLayerData`.
  { id: "ozone", visible: false },
  { id: "fires", visible: false },
  { id: "pollution", visible: false },
] as const;
