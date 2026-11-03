/**
 * ADR-16: screen-space picking helpers for the environmental overlays (CPU, synchronous, no allocation per call).
 * Overlays live under the Earth group and spin with gmst, so every test goes through `matrixWorld`.
 */
import { Matrix4, Raycaster, Sphere, Vector2, Vector3, type Camera, type Object3D } from "three";

const ndc = new Vector3();
const toCamera = new Vector3();
const normal = new Vector3();
const inverse = new Matrix4();
const raycaster = new Raycaster();
const pointer = new Vector2();
const sphere = new Sphere(new Vector3(), 1);

/** Canvas-local CSS px of a world point; returns false when it is behind the camera / outside the depth range. */
export function projectToScreen(world: Vector3, camera: Camera, width: number, height: number, out: Vector2): boolean {
  ndc.copy(world).project(camera);
  if (ndc.z > 1 || ndc.z < -1) return false;
  out.set((ndc.x * 0.5 + 0.5) * width, (0.5 - ndc.y * 0.5) * height);
  return true;
}

/**
 * True when a point on (or just above) the globe faces the camera, i.e. is not hidden behind the Earth. `margin`
 * keeps points right at the limb pickable without picking through the planet.
 */
export function facesCamera(world: Vector3, cameraPosition: Vector3, margin = 0.02): boolean {
  normal.copy(world).normalize();
  toCamera.copy(cameraPosition).sub(world).normalize();
  return normal.dot(toCamera) > -margin;
}

/** Inverse of `latLonToVector` (place-index): object-local position → degrees. */
export function localToLatLon(local: Vector3): { lat: number; lon: number } {
  const r = local.length() || 1;
  const lat = 90 - (Math.acos(Math.min(1, Math.max(-1, local.y / r))) * 180) / Math.PI;
  let lon = (Math.atan2(local.z, -local.x) * 180) / Math.PI - 180;
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;
  return { lat, lon };
}

/**
 * Ray through canvas px (x, y) against the overlay sphere of `radius` (in `object` local space, centred on its origin).
 * Writes the object-local hit into `outLocal`; returns false when the ray misses the globe.
 */
export function rayToLocal(object: Object3D, x: number, y: number, camera: Camera, width: number, height: number, radius: number, outLocal: Vector3): boolean {
  if (width <= 0 || height <= 0) return false;
  pointer.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  object.updateWorldMatrix(true, false);
  inverse.copy(object.matrixWorld).invert();
  raycaster.ray.applyMatrix4(inverse);
  sphere.radius = radius;
  return raycaster.ray.intersectSphere(sphere, outLocal) !== null;
}

/** 0.5° grid cell (row 0 = 90°N, col 0 = 180°W) of a lat/lon, as used by the FIRMS binner. */
export function cellIndex(lat: number, lon: number, cols: number, rows: number): number {
  const row = Math.min(rows - 1, Math.max(0, Math.floor(((90 - lat) / 180) * rows)));
  const col = Math.min(cols - 1, Math.max(0, Math.floor(((lon + 180) / 360) * cols)));
  return row * cols + col;
}
