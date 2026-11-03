import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { LonLat, Place } from "@/types/orbital";
import { findPlace } from "./reverse-geocode";

function place(name: string, kind: Place["kind"], ring: LonLat[]): Place {
  return { name, kind, key: `${kind}:${name}`, exteriors: [ring], center: new Vector3(), distance: 1 };
}

const square = (x0: number, y0: number, x1: number, y1: number): LonLat[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

describe("findPlace", () => {
  const places = [
    place("Landia", "country", square(0, 0, 10, 10)),
    place("Provincia", "state", square(2, 2, 4, 4)),
    place("Islas", "country", square(178, -5, 190, 5)),
  ];

  it("finds country and state", () => {
    expect(findPlace(places, 3, 3)).toEqual({ country: "Landia", state: "Provincia" });
    expect(findPlace(places, 8, 8)).toEqual({ country: "Landia", state: null });
  });

  it("returns nulls outside every polygon", () => {
    expect(findPlace(places, 50, 50)).toEqual({ country: null, state: null });
    expect(findPlace(places, Number.NaN, 3)).toEqual({ country: null, state: null });
  });

  it("handles polygons crossing the antimeridian", () => {
    expect(findPlace(places, 0, 179).country).toBe("Islas");
    expect(findPlace(places, 0, -175).country).toBe("Islas");
    expect(findPlace(places, 0, -160).country).toBeNull();
  });
});
