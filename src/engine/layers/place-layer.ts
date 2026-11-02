/**
 * 3D half of the legacy `engine/places.ts`: highlight meshes for the selected country / state.
 * No DOM here; search lives in `lib/orbital/place-index.ts`, the UI in `HUD/PlaceSearch.tsx`.
 * Mesh building is a 1:1 port. The root group rides on the Earth group and spins with the surface.
 */
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  ShapeUtils,
  SphereGeometry,
  Vector2,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import type { ILayer, LayerFactory } from "@/engine/contract";
import { latLonToVector } from "@/lib/orbital/place-index";
import type { Place, PlaceTarget } from "@/types/orbital";
import { EarthLayer } from "./earth-layer";

/** `flyToPlace` hands over the full index entry at runtime, but its signature only promises a `PlaceTarget`. */
function hasOutline(place: PlaceTarget): place is Place {
  return "exteriors" in place && Array.isArray(place.exteriors);
}

/** Highlight group for a place: filled interior, outline and a centre marker. */
function buildHighlight(place: PlaceTarget): Group {
  const group = new Group();
  group.name = `place:${place.name}`;
  const fillPositions: number[] = [];
  const fillIndices: number[] = [];
  const outlines: BufferGeometry[] = [];
  const point = new Vector3();

  for (const ring of hasOutline(place) ? place.exteriors : []) {
    if (ring.length < 4) continue;
    const contour = ring.map(([lon, lat]) => new Vector2(lon, lat));
    if (contour[0].distanceToSquared(contour[contour.length - 1]) < 1e-10) contour.pop();
    if (contour.length < 3) continue;

    const outline: number[] = [];
    for (const p of contour) {
      latLonToVector(p.y, p.x, 1.014, point);
      outline.push(point.x, point.y, point.z);
    }
    outline.push(outline[0], outline[1], outline[2]);
    const outlineGeometry = new BufferGeometry();
    outlineGeometry.setAttribute("position", new Float32BufferAttribute(outline, 3));
    outlines.push(outlineGeometry);

    let triangles: number[][] = [];
    try {
      triangles = ShapeUtils.triangulateShape(contour, []);
    } catch {
      triangles = [];
    }
    if (!triangles.length) continue;
    const base = fillPositions.length / 3;
    for (const p of contour) {
      latLonToVector(p.y, p.x, 1.01, point);
      fillPositions.push(point.x, point.y, point.z);
    }
    for (const tri of triangles) fillIndices.push(base + tri[0], base + tri[1], base + tri[2]);
  }

  const marker = new Mesh(new SphereGeometry(0.018, 16, 12), new MeshBasicMaterial({ color: 0x7ee0f5, depthTest: false }));
  marker.position.copy(place.center).multiplyScalar(1.02);
  marker.renderOrder = 6;
  group.add(marker);

  if (fillPositions.length) {
    const fillGeometry = new BufferGeometry();
    fillGeometry.setAttribute("position", new Float32BufferAttribute(fillPositions, 3));
    fillGeometry.setIndex(fillIndices);
    fillGeometry.computeVertexNormals();
    const fill = new Mesh(
      fillGeometry,
      new MeshBasicMaterial({
        color: 0x7ee0f5,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        side: DoubleSide,
      }),
    );
    fill.renderOrder = 4;
    group.add(fill);
  }

  const lineMaterial = new LineBasicMaterial({
    color: 0xb8f4ff,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false,
  });
  for (const outlineGeometry of outlines) {
    const line = new Line(outlineGeometry, lineMaterial);
    line.renderOrder = 5;
    group.add(line);
  }
  return group;
}

type Disposable3D = Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };

export class PlaceLayer implements ILayer {
  readonly id = "places";
  readonly name = "Places";
  readonly object3d: Group;
  visible = true;
  current: PlaceTarget | null = null;
  /** Earth group the highlight rides on (null: stays in the scene) and the mesh whose spin it follows. */
  private readonly host: EarthLayer | null;
  private disposed = false;

  constructor(host: EarthLayer | null) {
    this.host = host;
    this.object3d = new Group();
    this.object3d.name = "Places";
  }

  /**
   * `LayerManager.register` parents every layer to the scene; re-parent under the Earth group here
   * (`add` detaches from the previous parent) so the highlight follows the Earth's visibility.
   */
  init(): void {
    this.host?.inner.group.add(this.object3d);
  }

  update(): void {
    if (this.host) this.object3d.rotation.y = this.host.inner.surface.rotation.y;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.object3d.visible = visible;
  }

  setHighlight(place: PlaceTarget | null): void {
    this.clear();
    if (!place || this.disposed) return;
    this.current = place;
    this.object3d.add(buildHighlight(place));
  }

  /** Removes the highlight and frees its geometries / materials. */
  clear(): void {
    this.current = null;
    while (this.object3d.children.length) {
      const child = this.object3d.children[0];
      this.object3d.remove(child);
      child.traverse((object) => {
        const node = object as Disposable3D;
        node.geometry?.dispose();
        if (node.material) {
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          for (const material of materials) material.dispose();
        }
      });
    }
  }

  /** Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.object3d.removeFromParent();
  }
}

export const createPlaceLayer: LayerFactory = ({ layers }) => {
  const earth = layers.get("earth");
  return new PlaceLayer(earth instanceof EarthLayer ? earth : null);
};
