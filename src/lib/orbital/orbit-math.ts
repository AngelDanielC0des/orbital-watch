import type { Vector3 } from "three";
import {
  eciToGeodetic,
  gstime,
  jday,
  json2satrec,
  propagate,
  sunPos,
  type OMMJsonObject,
  type SatRec,
} from "satellite.js";
import {
  Category,
  type CategoryId,
  type GpRecord,
  type MeanElements,
  type Sgp4Readout,
  type XYZ,
} from "@/types/orbital";

export { Category, type CategoryId, type GpRecord, type MeanElements, type Sgp4Readout, type XYZ };

/** Scene unit = mean Earth radius. */
export const EARTH_RADIUS_KM = 6371;
export const MS_PER_MINUTE = 6e4;
export const MS_PER_DAY = 864e5;
/** Earth's gravitational parameter in km³/min². */
export const MU_KM3_PER_MIN2 = 398600.4418 * 3600;
export const J2 = 0.00108262668;
export const WGS84_RADIUS_KM = 6378.137;
export const TWO_PI = Math.PI * 2;
export const DEG = Math.PI / 180;

/** Parses an ISO epoch, treating strings without a zone as UTC. */
export function parseEpoch(iso: string): number {
  const hasZone = /(?:[zZ]|[+-]\d\d:?\d\d)$/.test(iso);
  return Date.parse(hasZone ? iso : `${iso}Z`);
}

export function wrapTwoPi(angle: number): number {
  const t = angle % TWO_PI;
  return t < 0 ? t + TWO_PI : t;
}

/** Mean motion in revolutions per day for a semi-major axis in km. */
export function meanMotionRevPerDay(aKm: number): number {
  return (Math.sqrt(MU_KM3_PER_MIN2 / (aKm * aKm * aKm)) * 1440) / TWO_PI;
}

/** Mean Keplerian elements with J2 secular node/perigee rates from a GP record. */
export function elementsFromGp(gp: GpRecord): MeanElements {
  const revPerDay = Number(gp.MEAN_MOTION);
  const e = Number(gp.ECCENTRICITY);
  const i = Number(gp.INCLINATION) * DEG;
  const n = (revPerDay * TWO_PI) / 1440;
  const a = Math.cbrt(MU_KM3_PER_MIN2 / (n * n));
  const p = a * (1 - e * e);
  const k = 1.5 * J2 * (WGS84_RADIUS_KM / p) ** 2 * n;
  const cosI = Math.cos(i);
  return {
    epochMs: parseEpoch(gp.EPOCH),
    n,
    a,
    e,
    i,
    raan: Number(gp.RA_OF_ASC_NODE) * DEG,
    argp: Number(gp.ARG_OF_PERICENTER) * DEG,
    M: Number(gp.MEAN_ANOMALY) * DEG,
    raanDot: -k * cosI,
    argpDot: 0.5 * k * (5 * cosI * cosI - 1),
    periodMin: 1440 / revPerDay,
    perigeeKm: a * (1 - e) - WGS84_RADIUS_KM,
    apogeeKm: a * (1 + e) - WGS84_RADIUS_KM,
  };
}

/** Solves Kepler's equation for the eccentric anomaly (Newton, 8 iterations max). */
export function solveKepler(meanAnomaly: number, e: number): number {
  let E = e > 0.8 ? Math.PI : meanAnomaly + e * Math.sin(meanAnomaly);
  for (let k = 0; k < 8; k++) {
    const d = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-10) break;
  }
  return E;
}

/** Kepler elements → ECI position (km) written into `out`. */
export function keplerToEci<T extends XYZ>(
  a: number,
  e: number,
  i: number,
  raan: number,
  argp: number,
  M: number,
  out: T,
): T {
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cO = Math.cos(raan);
  const sO = Math.sin(raan);
  const cw = Math.cos(argp);
  const sw = Math.sin(argp);
  const ci = Math.cos(i);
  const si = Math.sin(i);
  out.x = xp * (cO * cw - sO * sw * ci) - yp * (cO * sw + sO * cw * ci);
  out.y = xp * (sO * cw + cO * sw * ci) + yp * (cO * cw * ci - sO * sw);
  out.z = sw * si * xp + cw * si * yp;
  return out;
}

/** ECI km (z up) → scene units (y up, Earth radii). */
export function eciToScene(eci: XYZ, out: Vector3): Vector3 {
  return out.set(eci.x / EARTH_RADIUS_KM, eci.z / EARTH_RADIUS_KM, -eci.y / EARTH_RADIUS_KM);
}

/** Greenwich mean sidereal time (rad). */
export function gmst(date: Date): number {
  return gstime(date);
}

/** Unit vector from Earth toward the Sun, in scene axes. */
export function sunDirection(date: Date, out: Vector3): Vector3 {
  const { rsun } = sunPos(jday(date));
  return out.set(rsun.x, rsun.z, -rsun.y).normalize();
}

/** Narrows a CelesTrak GP record to satellite.js's stricter OMM shape (no cast). */
function toOmm(gp: GpRecord): OMMJsonObject {
  return {
    ...gp,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: gp.CLASSIFICATION_TYPE === "C" ? "C" : "U",
    ELEMENT_SET_NO: gp.ELEMENT_SET_NO ?? 0,
  };
}

export function satrecFromGp(gp: GpRecord): SatRec | null {
  try {
    const rec = json2satrec(toOmm(gp));
    return rec.error ? null : rec;
  } catch {
    return null;
  }
}

const scratchEci: XYZ = { x: 0, y: 0, z: 0 };

/** SGP4 at `date`; writes the scene position into `out` and returns the readout. */
export function propagateSgp4(rec: SatRec, date: Date, gmstRad: number, out: Vector3): Sgp4Readout | null {
  const pv = propagate(rec, date);
  if (!pv || !pv.position || typeof pv.position !== "object") return null;
  const { position, velocity } = pv;
  eciToScene(position, out);
  scratchEci.x = position.x;
  scratchEci.y = position.y;
  scratchEci.z = position.z;
  const geo = eciToGeodetic(scratchEci as Parameters<typeof eciToGeodetic>[0], gmstRad);
  return {
    speedKmS: Math.hypot(velocity.x, velocity.y, velocity.z),
    altitudeKm: geo.height,
    latDeg: geo.latitude / DEG,
    lonDeg: geo.longitude / DEG,
  };
}

/**
 * Samples `count` SGP4 positions spanning `minutes` from `startMs` into `buffer`
 * (xyz triples, scene units). Returns how many samples succeeded.
 */
export function sampleTrack(
  rec: SatRec,
  startMs: number,
  minutes: number,
  count: number,
  buffer: Float32Array,
  scratch: Vector3,
): number {
  const stepMs = (minutes * MS_PER_MINUTE) / (count - 1);
  const date = new Date(startMs);
  let written = 0;
  for (let k = 0; k < count; k++) {
    date.setTime(startMs + k * stepMs);
    const pv = propagate(rec, date);
    if (!pv || !pv.position || typeof pv.position !== "object") break;
    eciToScene(pv.position, scratch);
    buffer[k * 3] = scratch.x;
    buffer[k * 3 + 1] = scratch.y;
    buffer[k * 3 + 2] = scratch.z;
    written++;
  }
  return written;
}
