import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { LabelProjection } from "./contract";
import { projectLabels, type LabelDef, type Occluder } from "./label-projector";

const WIDTH = 800;
const HEIGHT = 600;

const LABEL: LabelDef = { key: "moon", name: "Luna", color: "#ffffff", group: "earth" };

/** Camera at (0,0,10) looking down -Z, so the origin is straight ahead at depth 10. */
function makeCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 1000);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

function project(
  target: Vector3 | null,
  camera: PerspectiveCamera,
  occluders: readonly Occluder[] = [],
  out: LabelProjection[] = [],
): LabelProjection[] {
  projectLabels([LABEL], (key) => (key === LABEL.key ? target : null), camera, WIDTH, HEIGHT, occluders, undefined, out);
  return out;
}

describe("projectLabels", () => {
  it("places a label straight in front of the camera near the screen centre", () => {
    const camera = makeCamera();
    const [label] = project(new Vector3(0, 0, 0), camera);

    expect(label.visible).toBe(true);
    expect(label.opacity).toBe(1);
    expect(label.scale).toBe(1);
    expect(label.x).toBeCloseTo(WIDTH / 2, 3);
    expect(label.y).toBeCloseTo(HEIGHT / 2, 3);
  });

  it("hides a label that is behind the camera", () => {
    const camera = makeCamera();
    const [label] = project(new Vector3(0, 0, 20), camera);

    expect(label.visible).toBe(false);
    expect(label.opacity).toBe(0);
  });

  it("hides a label that is occluded by a sphere between it and the camera", () => {
    const camera = makeCamera();
    const sphere: Occluder = { center: new Vector3(0, 0, 5), radius: 1 };
    const [label] = project(new Vector3(0, 0, 0), camera, [sphere]);

    expect(label.visible).toBe(false);
    expect(label.opacity).toBe(0);
  });

  it("keeps a label visible when the occluder is off the line of sight", () => {
    const camera = makeCamera();
    const sphere: Occluder = { center: new Vector3(5, 0, 5), radius: 1 };
    const [label] = project(new Vector3(0, 0, 0), camera, [sphere]);

    expect(label.visible).toBe(true);
  });

  it("hides a label whose resolver returns null", () => {
    const camera = makeCamera();
    const [label] = project(null, camera);

    expect(label.visible).toBe(false);
  });

  it("reuses the out array and its entries across frames and trims it to defs length", () => {
    const camera = makeCamera();
    const out: LabelProjection[] = [];
    const outRef = out;

    project(new Vector3(0, 0, 0), camera, [], out);
    const first = out[0];
    project(new Vector3(0, 0, 0), camera, [], out);

    expect(out).toBe(outRef);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(first);
    expect(out[0].key).toBe(LABEL.key);
    expect(out[0].group).toBe(LABEL.group);

    projectLabels([], () => null, camera, WIDTH, HEIGHT, [], undefined, out);
    expect(out).toBe(outRef);
    expect(out).toHaveLength(0);
  });
});
