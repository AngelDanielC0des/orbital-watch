/**
 * Client-side reverse geocoding: which country and US state contain a point, using the bundled
 * TopoJSON polygons from {@link loadPlaceIndex}. Ray casting on the exterior rings, with a cached
 * bounding box per place and a bounded per-0.5° result cache.
 */
import type { LonLat, Place } from "@/types/orbital";
import { loadPlaceIndex } from "./place-index";
import { countryNameEs } from "./country-names";

/** Country and US state containing a point (null when none). */
export interface PlaceAt {
  country: string | null;
  state: string | null;
}

interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

const CACHE_MAX = 2000;
const bounds = new WeakMap<Place, Bounds>();
const cache = new Map<string, PlaceAt>();

function boundsOf(place: Place): Bounds {
  const known = bounds.get(place);
  if (known) return known;
  const b: Bounds = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity };
  for (const ring of place.exteriors) {
    for (const [lon, lat] of ring) {
      if (lat < b.minLat) b.minLat = lat;
      if (lat > b.maxLat) b.maxLat = lat;
      if (lon < b.minLon) b.minLon = lon;
      if (lon > b.maxLon) b.maxLon = lon;
    }
  }
  bounds.set(place, b);
  return b;
}

function inRing(ring: readonly LonLat[], lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function contains(place: Place, lat: number, lon: number): boolean {
  const b = boundsOf(place);
  if (lat < b.minLat || lat > b.maxLat) return false;
  // Polygons crossing the antimeridian carry longitudes beyond ±180: also test the point shifted by ±360.
  for (const shift of [0, 360, -360]) {
    const x = lon + shift;
    if (x < b.minLon || x > b.maxLon) continue;
    if (place.exteriors.some((ring) => inRing(ring, lat, x))) return true;
  }
  return false;
}

/** Pure lookup: first country and first state containing the point. */
export function findPlace(places: readonly Place[], lat: number, lon: number): PlaceAt {
  const result: PlaceAt = { country: null, state: null };
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return result;
  for (const place of places) {
    if (place.kind === "country" ? result.country !== null : result.state !== null) continue;
    if (!contains(place, lat, lon)) continue;
    if (place.kind === "country") result.country = countryNameEs(place.name);
    else result.state = place.name;
    if (result.country !== null && result.state !== null) break;
  }
  return result;
}

/** Country / state under a point. Loads the place index on first use; results are cached per 0.5° cell. */
export async function placeAt(lat: number, lon: number): Promise<PlaceAt> {
  const key = `${Math.floor(lat * 2)}:${Math.floor(lon * 2)}`;
  const hit = cache.get(key);
  if (hit) return { ...hit };
  const index = await loadPlaceIndex();
  const result = findPlace(index.places, lat, lon);
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, result);
  return { ...result };
}
