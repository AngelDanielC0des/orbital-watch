/**
 * Pure label projector: world position -> canvas pixels with sphere occlusion, focus hiding and
 * greedy overlap culling. Port of the math in the legacy `SpaceUi.updateLabels` (same thresholds).
 * No DOM, no React; mutates `out` in place and allocates nothing per frame.
 */
import { MathUtils, Vector3, type PerspectiveCamera } from "three";
import type { LabelGroup, LabelProjection } from "./contract";
import { BODY_DEFS } from "./render/bodies";

export type { LabelGroup };

export interface LabelDef {
  key: string;
  name: string;
  color: string;
  group: LabelGroup;
}

/** Sphere that can hide labels behind it (mirrors `Occluder` of the solar renderer). */
export interface Occluder {
  center: Vector3;
  radius: number;
}

/** Minimal shape of `SolarFocusable` needed to build solar label defs. */
export interface SolarFocusableLike {
  key: string;
  def: { name: string; color: string };
}

/** Minimal shape of `GalaxyLabel` needed to build galaxy label defs. */
export interface GalaxyLabelLike {
  key: string;
  name: string;
}

const GALAXY_LABEL_COLOR = "";

/** Earth view labels (legacy `main.ts` addLabels("earth", ...)). */
export const EARTH_LABELS: readonly LabelDef[] = [
  { key: "earth:moon", name: "Luna", color: BODY_DEFS.moon.color, group: "earth" },
  { key: "earth:sun", name: "Sol", color: BODY_DEFS.sun.color, group: "earth" },
];

export function solarLabels(focusables: readonly SolarFocusableLike[]): LabelDef[] {
  return focusables.map((f) => ({ key: f.key, name: f.def.name, color: f.def.color, group: "solar" as const }));
}

export function galaxyLabels(labels: readonly GalaxyLabelLike[]): LabelDef[] {
  return labels.map((l) => ({ key: l.key, name: l.name, color: GALAXY_LABEL_COLOR, group: "galaxy" as const }));
}

// ---- Math (module-level temps; nothing is allocated per frame) ----------------------

const tmpA = new Vector3();
const tmpB = new Vector3();
const MAX_PLACED = 32;
/** Triples of (x, y, halfWidth) of labels already placed this frame. */
const placed = new Float32Array(MAX_PLACED * 3);

/** The legacy code measured `offsetWidth`; without a DOM we approximate from the text length. */
const CHAR_WIDTH_PX = 6.6;
const CHROME_WIDTH_PX = 22;

function estimateWidth(name: string): number {
  return name.length * CHAR_WIDTH_PX + CHROME_WIDTH_PX;
}

function radiusOf(center: Vector3, occluders: readonly Occluder[]): number {
  for (const occluder of occluders) if (occluder.center === center) return occluder.radius;
  return 0;
}

function isOccluded(position: Vector3, eye: Vector3, occluders: readonly Occluder[]): boolean {
  tmpB.copy(position).sub(eye);
  const length = tmpB.length();
  tmpB.divideScalar(length);
  for (const occluder of occluders) {
    if (occluder.center === position) continue;
    tmpA.copy(occluder.center).sub(eye);
    const along = tmpA.dot(tmpB);
    if (!(along <= 0 || along >= length) && tmpA.lengthSq() - along * along < occluder.radius * occluder.radius)
      return true;
  }
  return false;
}

function row(out: LabelProjection[], index: number, def: LabelDef): LabelProjection {
  let entry = out[index];
  if (!entry) {
    entry = { key: def.key, group: def.group, x: 0, y: 0, scale: 1, opacity: 0, visible: false };
    out[index] = entry;
  } else {
    entry.key = def.key;
    entry.group = def.group;
  }
  return entry;
}

/**
 * Projects `defs` (in order) into `out`; `out.length` becomes `defs.length`. `resolve` returns the
 * world position of a label or `null` to hide it. The target sphere radius (for the lift above the
 * body and focus hiding) is `radiusOverride(key)` when given, else the radius of the occluder whose
 * `center` is the very same `Vector3` instance, else 0. Pixel coordinates are relative to the canvas.
 */
export function projectLabels(
  defs: readonly LabelDef[],
  resolve: (key: string) => Vector3 | null,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  occluders: readonly Occluder[],
  focusKey: string | undefined,
  out: LabelProjection[],
  radiusOverride?: (key: string) => number,
): void {
  const focalPx = (height * 0.5) / Math.tan(MathUtils.degToRad(camera.fov) * 0.5);
  let count = 0;
  for (let n = 0; n < defs.length; n++) {
    const def = defs[n];
    const entry = row(out, n, def);
    const target = resolve(def.key);
    let visible = false;
    let x = 0;
    let y = 0;
    if (target) {
      tmpA.copy(target).applyMatrix4(camera.matrixWorldInverse);
      const depth = -tmpA.z;
      if (depth > 0.001) {
        const radius = radiusOverride ? radiusOverride(def.key) : radiusOf(target, occluders);
        const radiusPx = (radius / depth) * focalPx;
        tmpA.applyMatrix4(camera.projectionMatrix);
        x = (tmpA.x * 0.5 + 0.5) * width;
        y = (0.5 - tmpA.y * 0.5) * height - Math.min(radiusPx, 400);
        visible = Math.abs(tmpA.x) < 1.05 && Math.abs(tmpA.y) < 1.05 && !(def.key === focusKey && radiusPx > 140);
        visible &&= !isOccluded(target, camera.position, occluders);
        if (visible) {
          const halfWidth = estimateWidth(def.name) * 0.5 + 6;
          for (let i = 0; i < count * 3; i += 3)
            if (Math.abs(x - placed[i]) < halfWidth + placed[i + 2] && Math.abs(y - placed[i + 1]) < 20) {
              visible = false;
              break;
            }
          if (visible && count < MAX_PLACED) {
            placed[count * 3] = x;
            placed[count * 3 + 1] = y;
            placed[count * 3 + 2] = halfWidth;
            count++;
          }
        }
      }
    }
    entry.visible = visible;
    entry.opacity = visible ? 1 : 0;
    entry.scale = 1;
    if (visible) {
      entry.x = x;
      entry.y = y;
    }
  }
  out.length = defs.length;
}
