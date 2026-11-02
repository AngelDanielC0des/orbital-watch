import type {
  EnvironmentalLayerId,
  EnvironmentalLayerMetadata,
  LayerConfigMap,
  LayerId,
  LayerMetadata,
  OrbitLayerId,
} from "@/types/layers";
import { ATTRIBUTION } from "./attribution";

const HOUR_MS = 60 * 60 * 1000;

/** Environmental layer ids in drawer order. */
export const ENVIRONMENTAL_LAYER_IDS = ["ozone", "pollution", "fires"] as const satisfies readonly EnvironmentalLayerId[];

/** Orbit-section toggle ids in drawer order. */
export const ORBIT_LAYER_IDS = ["satellites", "track", "sky", "labels"] as const satisfies readonly OrbitLayerId[];

/** Static metadata of every toggleable layer (keys are checked against `LayerId`). */
export const LAYER_CATALOG = {
  satellites: { group: "orbit", id: "satellites", title: "Satélites", engine: true },
  track: { group: "orbit", id: "track", title: "Órbita seguida", engine: true },
  sky: { group: "orbit", id: "sky", title: "Estrellas", engine: true },
  labels: { group: "orbit", id: "labels", title: "Etiquetas", engine: false },
  ozone: {
    group: "environment",
    id: "ozone",
    title: "Ozono (columna total)",
    description: "Espesor total de la capa de ozono medido desde satélite, en unidades Dobson.",
    kind: "raster",
    source: {
      name: "NASA GIBS",
      url: "https://gibs.earthdata.nasa.gov",
      product: "OMI_Ozone_TOMS_Total_Column",
    },
    attribution: ATTRIBUTION.gibs,
    defaultOpacity: 0.75,
    defaultVisible: false,
    refreshIntervalMs: 6 * HOUR_MS,
    supportsTimeline: false,
    controls: ["opacity"],
    latencyNote: "Datos con retraso de satélite (~4 días)",
  },
  pollution: {
    group: "environment",
    id: "pollution",
    title: "Calidad del aire",
    description:
      "Contaminantes en superficie estimados por el modelo CAMS para ~430 puntos de muestreo (ciudades y rejilla).",
    kind: "points",
    source: {
      name: "Open-Meteo",
      url: "https://open-meteo.com/en/docs/air-quality-api",
      product: "CAMS global / Europa",
    },
    attribution: ATTRIBUTION.openMeteo,
    defaultOpacity: 0.9,
    defaultVisible: false,
    refreshIntervalMs: HOUR_MS,
    supportsTimeline: false,
    controls: ["opacity", "pollutant"],
    latencyNote: "Estimación de modelo (no estaciones)",
  },
  fires: {
    group: "environment",
    id: "fires",
    title: "Incendios activos",
    description:
      "Anomalías térmicas detectadas por VIIRS (NOAA-20 y NOAA-21) en las últimas 24 h, 48 h o 7 días.",
    kind: "heatmap",
    source: {
      name: "NASA FIRMS",
      url: "https://firms.modaps.eosdis.nasa.gov",
      product: "VIIRS 375 m NRT",
    },
    attribution: ATTRIBUTION.firms,
    defaultOpacity: 0.85,
    defaultVisible: false,
    refreshIntervalMs: HOUR_MS,
    supportsTimeline: false,
    controls: ["opacity", "window"],
    latencyNote: "Detecciones casi en tiempo real (≈3 h de retraso)",
  },
} as const satisfies Record<LayerId, LayerMetadata>;

/** Initial per-layer configuration. */
export const DEFAULT_LAYER_CONFIG: { readonly [K in EnvironmentalLayerId]: LayerConfigMap[K] } = {
  ozone: { product: "OMI_TOMS" },
  pollution: { pollutant: "pm2_5" },
  fires: { window: "24h", dayNight: "all" },
};

/** Catalog entry of an environmental layer. */
export function getEnvironmentalMetadata(id: EnvironmentalLayerId): EnvironmentalLayerMetadata {
  return LAYER_CATALOG[id];
}

/** Narrows an arbitrary string (e.g. a URL param) to an environmental layer id. */
export function isEnvironmentalLayerId(value: string): value is EnvironmentalLayerId {
  return (ENVIRONMENTAL_LAYER_IDS as readonly string[]).includes(value);
}
