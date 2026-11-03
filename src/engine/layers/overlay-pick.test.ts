import { Group, PerspectiveCamera, Vector2, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { latLonToVector } from "@/lib/orbital/place-index";
import { cellIndex, facesCamera, localToLatLon, projectToScreen, rayToLocal } from "./overlay-pick";

function camera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(45, 1, 0.01, 100);
  cam.position.set(0, 0, 4);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return cam;
}

describe("overlay-pick", () => {
  it("round-trips lat/lon through latLonToVector", () => {
    for (const [lat, lon] of [[0, 0], [40.4, -3.7], [-33.9, 151.2], [64, 179.5]]) {
      const v = latLonToVector(lat, lon, 1.011, new Vector3());
      const back = localToLatLon(v);
      expect(back.lat).toBeCloseTo(lat, 4);
      expect(back.lon).toBeCloseTo(lon, 4);
    }
  });

  it("projects the sphere point facing the camera to the centre and hides the far side", () => {
    const cam = camera();
    const front = new Vector3(0, 0, 1.01);
    const back = new Vector3(0, 0, -1.01);
    const out = new Vector2();
    expect(projectToScreen(front, cam, 800, 800, out)).toBe(true);
    expect(out.x).toBeCloseTo(400, 3);
    expect(out.y).toBeCloseTo(400, 3);
    expect(facesCamera(front, cam.position)).toBe(true);
    expect(facesCamera(back, cam.position)).toBe(false);
  });

  it("raycasts the centre pixel onto the near side of a rotated overlay", () => {
    const cam = camera();
    const group = new Group();
    group.rotation.y = Math.PI / 2;
    const hit = new Vector3();
    expect(rayToLocal(group, 400, 400, cam, 800, 800, 1.0095, hit)).toBe(true);
    // Ry(+90°) maps local +X to world −Z, so the camera-facing point (world +Z) is local −X.
    expect(hit.x).toBeCloseTo(-1.0095, 3);
    expect(rayToLocal(group, 2, 2, cam, 800, 800, 1.0095, hit)).toBe(false);
  });

  it("maps lat/lon to the 0.5° grid used by the binner", () => {
    expect(cellIndex(90, -180, 720, 360)).toBe(0);
    expect(cellIndex(-90, 180, 720, 360)).toBe(720 * 360 - 1);
    expect(cellIndex(0.1, 0.1, 720, 360)).toBe(179 * 720 + 360);
  });
});
