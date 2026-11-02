import {
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type ColorRepresentation,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Category, type CategoryId } from "@/lib/orbital/orbit-math";

/**
 * Converts to non-indexed, applies `matrix`, drops `uv` and adds a per-vertex `aColor`
 * attribute (rgb + gloss in alpha).
 */
export function withVertexColor(
  geometry: BufferGeometry,
  color: ColorRepresentation,
  gloss: number,
  matrix?: Matrix4,
): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  if (matrix) flat.applyMatrix4(matrix);
  flat.deleteAttribute("uv");
  const c = new Color(color);
  const count = flat.attributes.position.count;
  const colors = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) colors.set([c.r, c.g, c.b, gloss], v * 4);
  flat.setAttribute("aColor", new BufferAttribute(colors, 4));
  return flat;
}

const transform = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Matrix4 =>
  new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
    new Vector3(1, 1, 1),
  );

function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  merged.computeBoundingSphere();
  return merged;
}

function buildPayloadModel(): BufferGeometry {
  return mergeParts([
    withVertexColor(new BoxGeometry(0.42, 0.42, 0.62), "#c8a04a", 0.2),
    withVertexColor(new BoxGeometry(0.78, 0.025, 0.36), "#1f3f9a", 1, transform(0.66, 0, 0)),
    withVertexColor(new BoxGeometry(0.78, 0.025, 0.36), "#1f3f9a", 1, transform(-0.66, 0, 0)),
    withVertexColor(new BoxGeometry(0.16, 0.03, 0.04), "#8b8f96", 0, transform(0.28, 0, 0)),
    withVertexColor(new BoxGeometry(0.16, 0.03, 0.04), "#8b8f96", 0, transform(-0.28, 0, 0)),
    withVertexColor(
      new CylinderGeometry(0.17, 0.04, 0.1, 10, 1, true),
      "#e8e6df",
      0.1,
      transform(0, -0.26, 0.1),
    ),
  ]);
}

function buildStarlinkModel(): BufferGeometry {
  return mergeParts([
    withVertexColor(new BoxGeometry(0.62, 0.07, 0.42), "#a7adb4", 0.3),
    withVertexColor(new BoxGeometry(0.06, 0.04, 0.12), "#6e737a", 0, transform(0, 0.02, -0.26)),
    withVertexColor(new BoxGeometry(0.38, 0.015, 1.45), "#1c3478", 1, transform(0, 0.05, -1.05)),
  ]);
}

function buildRocketBodyModel(): BufferGeometry {
  const alongZ = transform(0, 0, 0, Math.PI / 2, 0, 0);
  return mergeParts([
    withVertexColor(new CylinderGeometry(0.26, 0.26, 1.5, 10, 1, false), "#dcdcd4", 0.15, alongZ),
    withVertexColor(
      new CylinderGeometry(0.26, 0.2, 0.18, 10, 1, true),
      "#3c3f44",
      0,
      transform(0, 0, -0.84, Math.PI / 2, 0, 0),
    ),
    withVertexColor(
      new CylinderGeometry(0.08, 0.16, 0.22, 8, 1, true),
      "#2a2c30",
      0,
      transform(0, 0, -1.02, Math.PI / 2, 0, 0),
    ),
    withVertexColor(
      new CylinderGeometry(0.262, 0.262, 0.08, 10, 1, true),
      "#2b2d31",
      0,
      transform(0, 0, 0.45, Math.PI / 2, 0, 0),
    ),
  ]);
}

function buildDebrisModel(): BufferGeometry {
  const rock = new IcosahedronGeometry(0.95, 0);
  const position = rock.attributes.position;
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const scaleByVertex = new Map<string, number>();
  for (let v = 0; v < position.count; v++) {
    const key = `${position.getX(v).toFixed(3)},${position.getY(v).toFixed(3)},${position.getZ(v).toFixed(3)}`;
    if (!scaleByVertex.has(key)) scaleByVertex.set(key, 0.45 + random() * 0.85);
    const scale = scaleByVertex.get(key) as number;
    position.setXYZ(v, position.getX(v) * scale, position.getY(v) * scale * 0.55, position.getZ(v) * scale);
  }
  const geometry = withVertexColor(rock, "#8d9299", 0.25);
  geometry.computeVertexNormals();
  const colors = geometry.attributes.aColor;
  for (let v = 0; v < colors.count; v += 3) {
    const metallic = random() < 0.3;
    const rgb = metallic
      ? [0.78, 0.62, 0.3]
      : [0.45 + random() * 0.25, 0.47 + random() * 0.25, 0.5 + random() * 0.25];
    for (let k = 0; k < 3; k++) colors.setXYZW(v + k, rgb[0], rgb[1], rgb[2], metallic ? 0.5 : 0.1);
  }
  geometry.computeBoundingSphere();
  return geometry;
}

/** Low-poly instance models per category (position, normal, aColor). */
export function buildSatelliteModels(): Record<CategoryId, BufferGeometry> {
  return {
    [Category.PAYLOAD]: buildPayloadModel(),
    [Category.STARLINK]: buildStarlinkModel(),
    [Category.DEBRIS]: buildDebrisModel(),
    [Category.ROCKET_BODY]: buildRocketBodyModel(),
  };
}
