/**
 * Country / US-state index: TopoJSON loading + `search(q)`. Pure data (no DOM, no scene graph);
 * the 3D highlight lives in `engine/layers/place-layer.ts`, the UI in `HUD/PlaceSearch.tsx`.
 * 1:1 port of the data half of the legacy `engine/places.ts`.
 */
import { MathUtils, Vector3 } from "three";
import { assetUrl } from "@/engine/config";
import type { LonLat, Place, PlaceKind } from "@/types/orbital";

export type { Place, PlaceKind, PlaceTarget } from "@/types/orbital";

/** Groups of names that should match each other (English / Spanish / abbreviations). */
const NAME_ALIASES: string[][] = [
  ["usa", "united states", "united states of america", "eeuu", "estados unidos", "america"],
  ["uk", "united kingdom", "reino unido", "britain", "england"],
  ["spain", "españa", "espana"],
  ["mexico", "méxico"],
  ["brazil", "brasil"],
  ["germany", "alemania", "deutschland"],
  ["france", "francia"],
  ["italy", "italia"],
  ["japan", "japón", "japon"],
  ["china", "people's republic of china"],
  ["russia", "russian federation", "rusia"],
  ["south korea", "korea", "republic of korea"],
  ["north korea", "dem. rep. korea"],
  ["uae", "united arab emirates"],
  ["czech republic", "czechia", "chequia"],
];

const normalizeName = (name: string): string =>
  name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

type Ring = LonLat[];

interface TopoGeometry {
  type: string;
  arcs?: number[][] | number[][][];
  properties?: { name?: string };
}

interface Topology {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: [number, number][][];
  objects: Record<string, { geometries?: TopoGeometry[] } | undefined>;
}

/** Stitch a TopoJSON ring from arc indices (negative index = reversed arc, `~i`). */
function stitchRing(arcs: Ring[], indices: number[]): Ring {
  const ring: Ring = [];
  for (const index of indices) {
    const forward = index >= 0;
    const arc = arcs[forward ? index : ~index];
    const points = forward ? arc : arc.slice().reverse();
    const start = +!!ring.length;
    for (let i = start; i < points.length; i++) ring.push(points[i]);
  }
  return ring;
}

/** Decode delta-encoded, quantized TopoJSON arcs into absolute [lon, lat]. */
function decodeArcs(topology: Topology): Ring[] {
  const { scale, translate } = topology.transform;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]): LonLat => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
}

/** Polygon / MultiPolygon geometry → list of polygons, each a list of rings. */
function geometryPolygons(geometry: TopoGeometry, arcs: Ring[]): Ring[][] {
  const polygons: number[][][] =
    geometry.type === "Polygon"
      ? [geometry.arcs as number[][]]
      : geometry.type === "MultiPolygon"
        ? (geometry.arcs as number[][][])
        : [];
  return polygons.map((polygon) => polygon.map((ring) => stitchRing(arcs, ring)));
}

/** Latitude / longitude (degrees) → scene position on a sphere of the given radius. */
export function latLonToVector(lat: number, lon: number, radius: number, out = new Vector3()): Vector3 {
  const theta = ((lon + 180) * Math.PI) / 180;
  const phi = ((90 - lat) * Math.PI) / 180;
  const ringRadius = radius * Math.sin(phi);
  return out.set(-ringRadius * Math.cos(theta), radius * Math.cos(phi), ringRadius * Math.sin(theta));
}

function buildPlace(name: string, kind: PlaceKind, geometry: TopoGeometry, arcs: Ring[]): Place | null {
  const exteriors = geometryPolygons(geometry, arcs)
    .map((polygon) => polygon[0] as Ring | undefined)
    .filter((ring): ring is Ring => !!ring && ring.length >= 4);
  if (!exteriors.length) return null;
  const center = new Vector3();
  const point = new Vector3();
  let count = 0;
  let radius = 0;
  for (const ring of exteriors) {
    for (const [lon, lat] of ring) {
      latLonToVector(lat, lon, 1, point);
      center.add(point);
      count++;
    }
  }
  if (!count) return null;
  center.multiplyScalar(1 / count).normalize();
  for (const ring of exteriors) {
    for (const [lon, lat] of ring) radius = Math.max(radius, latLonToVector(lat, lon, 1, point).distanceTo(center));
  }
  return {
    name,
    kind,
    key: `${kind}:${normalizeName(name)}`,
    exteriors,
    center,
    distance: MathUtils.clamp(radius * 3.4 + 1.28, 1.32, 8),
  };
}

function loadPlaces(url: string, objectName: string, kind: PlaceKind): Promise<Place[]> {
  return fetch(url)
    .then((response) => {
      if (!response.ok) throw Error(`Could not load ${url}`);
      return response.json() as Promise<Topology>;
    })
    .then((topology) => {
      const arcs = decodeArcs(topology);
      const geometries = topology.objects[objectName]?.geometries ?? [];
      const places: Place[] = [];
      for (const geometry of geometries) {
        const name = geometry.properties?.name;
        if (!name) continue;
        const place = buildPlace(name, kind, geometry, arcs);
        if (place) places.push(place);
      }
      return places;
    });
}

/** Searchable list of countries and US states. */
export class PlaceIndex {
  readonly places: readonly Place[];

  constructor(places: readonly Place[]) {
    this.places = places;
  }

  search(query: string): Place[] {
    const q = normalizeName(query);
    if (q.length < 2) return [];
    const aliases = NAME_ALIASES.find((group) => group.some((alias) => alias.startsWith(q) || q.startsWith(alias)));
    const scored: { place: Place; score: number }[] = [];
    for (const place of this.places) {
      const name = normalizeName(place.name);
      let score = 0;
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 50;
      else if (aliases && aliases.includes(name)) score = 90;
      else if (aliases && NAME_ALIASES.some((group) => group.includes(name) && group.some((alias) => alias.includes(q))))
        score = 70;
      if (score) scored.push({ place, score });
    }
    scored.sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name));
    return scored.slice(0, 8).map((entry) => entry.place);
  }
}

let cached: Promise<PlaceIndex> | null = null;

/** Fetches both TopoJSON files once per page; a failed load is not cached so it can be retried. */
export function loadPlaceIndex(): Promise<PlaceIndex> {
  if (cached) return cached;
  cached = Promise.all([
    loadPlaces(assetUrl("geo/countries-110m.json"), "countries", "country"),
    loadPlaces(assetUrl("geo/us-states-10m.json"), "states", "state"),
  ])
    .then(([countries, states]) => new PlaceIndex([...countries, ...states]))
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
}
