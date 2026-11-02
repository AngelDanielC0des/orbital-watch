import type { Vector3 } from "three";

export const MS_PER_MINUTE = 6e4;
export const MS_PER_DAY = 864e5;

export type ViewMode = "earth" | "solar" | "galaxy";
export type SatelliteFilter = "all" | "debris" | "starlink" | "projected";

/** Orbital object category identifiers */
export const Category = Object.freeze({
  PAYLOAD: 0,
  STARLINK: 1,
  DEBRIS: 2,
  ROCKET_BODY: 3,
} as const);

export type CategoryId = (typeof Category)[keyof typeof Category];

/** Panel label per category */
export const CATEGORY_LABELS: Record<CategoryId, string> = {
  [Category.PAYLOAD]: "Carga útil",
  [Category.STARLINK]: "Starlink",
  [Category.DEBRIS]: "Basura espacial",
  [Category.ROCKET_BODY]: "Etapa de cohete",
};

/** CelesTrak GP (OMM JSON) record */
export interface GpRecord {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string;
  MEAN_MOTION: number | string;
  ECCENTRICITY: number | string;
  INCLINATION: number | string;
  RA_OF_ASC_NODE: number | string;
  ARG_OF_PERICENTER: number | string;
  MEAN_ANOMALY: number | string;
  EPHEMERIS_TYPE?: number;
  CLASSIFICATION_TYPE?: string;
  NORAD_CAT_ID: number | string;
  ELEMENT_SET_NO?: number;
  REV_AT_EPOCH?: number;
  BSTAR: number | string;
  MEAN_MOTION_DOT: number | string;
  MEAN_MOTION_DDOT: number | string;
}

export interface MeanElements {
  epochMs: number;
  /** Mean motion, rad/min */
  n: number;
  /** Semi-major axis, km */
  a: number;
  e: number;
  i: number;
  raan: number;
  argp: number;
  M: number;
  raanDot: number;
  argpDot: number;
  periodMin: number;
  perigeeKm: number;
  apogeeKm: number;
}

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

export interface Sgp4Readout {
  speedKmS: number;
  altitudeKm: number;
  latDeg: number;
  lonDeg: number;
}

/** One object in the orbital catalog (synthetic demo or CelesTrak GP) */
export interface CatalogEntry {
  omm: GpRecord;
  category: CategoryId;
  /** Country / operator label ("—" when unknown) */
  country: string;
  /** Launch date (UTC ms). Objects are hidden before launch */
  launchMs: number;
  /** True when the launch is after reference time */
  projected: boolean;
}

/** Catalog entry enriched with computed mean orbital elements */
export interface SatelliteEntry extends CatalogEntry {
  elements: MeanElements;
}

export interface BodyFacts {
  gravity: string;
  temperature: string;
  moons: string;
}

/** Celestial body definition */
export interface BodyDef {
  key: string;
  name: string;
  kind: string;
  radiusKm: number;
  pole?: [number, number];
  dayHours?: number;
  yearDays?: number;
  color: string;
  atmosphere?: [number, number, number, number];
  gas?: boolean;
  normalMap?: boolean;
  rings?: { innerKm: number; outerKm: number };
  facts: BodyFacts;
}

export interface SelectedSatelliteState {
  index: number;
  entry: SatelliteEntry;
  readout: Sgp4Readout | null;
  synthetic: boolean;
}

export interface SimulationTimeState {
  ms: number;
  speed: number;
  playing: boolean;
  scrubbing: boolean;
  offsetMs: number;
  isLive: boolean;
  formattedUtc: string;
  formattedRel: string;
}

// ---- Places (country / US-state search) ----------------------------------------

/** [longitude, latitude] in degrees. */
export type LonLat = [number, number];
export type PlaceKind = "country" | "state";

/** What `EngineCommandFacade.flyToPlace` needs to frame a place. */
export interface PlaceTarget {
  name: string;
  /** Unit vector (Earth-fixed scene frame) at the centroid of the outline. */
  center: Vector3;
  /** Camera distance (Earth radii) that frames the place. */
  distance: number;
}

/** Search-index entry: a `PlaceTarget` plus the outline used to draw the highlight. */
export interface Place extends PlaceTarget {
  kind: PlaceKind;
  key: string;
  /** Exterior ring of every polygon, as [lon, lat] points. */
  exteriors: LonLat[][];
}
