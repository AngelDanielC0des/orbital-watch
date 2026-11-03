/**
 * Points overlay (ADR-15, surface air quality): one `THREE.Points` draw call at r = 1.011.
 * Buffers grow only when a payload is larger than the current capacity; values index a 256×1 LUT
 * rebuilt in place from the payload's scale (same stops as the legend).
 */
import { BufferAttribute, BufferGeometry, DataTexture, Points, ShaderMaterial, Sphere, Vector2, Vector3, type PerspectiveCamera } from "three";
import type { ILayer, LayerDataPayload, LayerFactory, LayerPick } from "@/engine/contract";
import { buildLutTexture, updateLutTexture } from "@/engine/render/lut";
import { POINTS_FRAGMENT, POINTS_VERTEX } from "@/engine/render/overlay-shaders";
import { latLonToVector } from "@/lib/orbital/place-index";
import { closeImage, OverlayLayerBase } from "./overlay-base";
import { facesCamera, localToLatLon, projectToScreen } from "./overlay-pick";

export const POLLUTION_RADIUS = 1.011;
const MIN_CAPACITY = 512;

export class PointsOverlayLayer extends OverlayLayerBase {
  private readonly geometry: BufferGeometry;
  private readonly material: ShaderMaterial;
  private readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly lut: DataTexture;
  private capacity = 0;
  private readonly scratch = new Vector3();
  private readonly screen = new Vector2();
  private count = 0;

  constructor(id: string, name: string, host: ILayer | undefined, opacity: number) {
    super(id, name, host, opacity);
    this.geometry = new BufferGeometry();
    this.allocate(MIN_CAPACITY);
    // Points sit on a sphere: a fixed bounding sphere avoids NaN bounds and per-payload recomputation.
    this.geometry.boundingSphere = new Sphere(new Vector3(), POLLUTION_RADIUS + 0.01);
    this.lut = buildLutTexture([
      { at: 0, color: "#ffffff" },
      { at: 1, color: "#ffffff" },
    ]);
    this.material = new ShaderMaterial({
      uniforms: {
        uLut: { value: this.lut },
        uOpacity: { value: opacity },
        uSize: { value: 36 },
        uPixelRatio: { value: 1 },
        uHovered: { value: -1 },
        uSelected: { value: -1 },
      },
      vertexShader: POINTS_VERTEX,
      fragmentShader: POINTS_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.name = `${name}Points`;
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.object3d.add(this.points);
  }

  private allocate(capacity: number): void {
    this.capacity = capacity;
    this.geometry.setAttribute("position", new BufferAttribute(new Float32Array(capacity * 3), 3));
    this.geometry.setAttribute("aValue", new BufferAttribute(new Float32Array(capacity), 1));
    this.geometry.setAttribute("aKind", new BufferAttribute(new Float32Array(capacity).fill(1), 1));
    this.geometry.setDrawRange(0, 0);
  }

  setViewport(_width: number, _height: number, _fov: number, pixelRatio: number): void {
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  protected applyOpacity(opacity: number): void {
    this.material.uniforms.uOpacity.value = opacity;
  }

  protected accept(payload: LayerDataPayload): boolean {
    if (payload.kind !== "points") {
      closeImage(payload);
      return false;
    }
    const count = Math.max(0, Math.min(payload.count, Math.floor(payload.latLon.length / 2), payload.values.length));
    if (count > this.capacity) {
      // Grow (power of two) — old attributes are released by the renderer when replaced and disposed.
      this.geometry.dispose();
      let next = this.capacity;
      while (next < count) next *= 2;
      this.allocate(next);
    }
    const position = this.geometry.getAttribute("position") as BufferAttribute;
    const value = this.geometry.getAttribute("aValue") as BufferAttribute;
    const kind = this.geometry.getAttribute("aKind") as BufferAttribute;
    const pos = position.array as Float32Array;
    const val = value.array as Float32Array;
    const kinds = kind.array as Float32Array;
    let shown = 0;
    for (let i = 0; i < count; i++) {
      const v = payload.values[i];
      latLonToVector(payload.latLon[i * 2], payload.latLon[i * 2 + 1], POLLUTION_RADIUS, this.scratch);
      pos[i * 3] = this.scratch.x;
      pos[i * 3 + 1] = this.scratch.y;
      pos[i * 3 + 2] = this.scratch.z;
      const ok = Number.isFinite(v);
      val[i] = ok ? Math.min(1, Math.max(0, v)) : -1;
      kinds[i] = payload.kinds ? (payload.kinds[i] ?? 1) : 1;
      if (ok) shown++;
    }
    position.needsUpdate = true;
    value.needsUpdate = true;
    kind.needsUpdate = true;
    position.clearUpdateRanges();
    value.clearUpdateRanges();
    position.addUpdateRange(0, count * 3);
    value.addUpdateRange(0, count);
    this.geometry.setDrawRange(0, count);
    this.count = count;
    // Indices refer to the new payload: drop stale emphasis.
    this.setHovered(-1);
    this.setSelected(-1);
    updateLutTexture(this.lut, payload.scale, payload.categorical);
    return shown > 0;
  }

  protected release(): void {
    this.geometry.setDrawRange(0, 0);
    this.count = 0;
    this.setHovered(-1);
    this.setSelected(-1);
  }

  setVisible(visible: boolean): void {
    super.setVisible(visible);
    if (!visible) {
      this.setHovered(-1);
      this.setSelected(-1);
    }
  }

  setHovered(index: number): void {
    this.material.uniforms.uHovered.value = index;
  }

  setSelected(index: number): void {
    this.material.uniforms.uSelected.value = index;
  }

  /** ADR-16: nearest drawn sample within `radiusPx` that faces the camera. */
  pick(x: number, y: number, camera: PerspectiveCamera, width: number, height: number, radiusPx: number): LayerPick | null {
    if (!this.visible || !this.hasData || !this.object3d.visible || this.count === 0) return null;
    this.points.updateWorldMatrix(true, false);
    const pos = (this.geometry.getAttribute("position") as BufferAttribute).array as Float32Array;
    const val = (this.geometry.getAttribute("aValue") as BufferAttribute).array as Float32Array;
    let best = -1;
    let bestD2 = radiusPx * radiusPx;
    for (let i = 0; i < this.count; i++) {
      if (val[i] < 0) continue;
      this.scratch.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(this.points.matrixWorld);
      if (!facesCamera(this.scratch, camera.position)) continue;
      if (!projectToScreen(this.scratch, camera, width, height, this.screen)) continue;
      const d2 = (this.screen.x - x) ** 2 + (this.screen.y - y) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    if (best < 0) return null;
    this.scratch.set(pos[best * 3], pos[best * 3 + 1], pos[best * 3 + 2]);
    const { lat, lon } = localToLatLon(this.scratch);
    return { layerId: "pollution", kind: "point", index: best, lat, lon, x, y };
  }

  pointWorld(index: number, out: Vector3): boolean {
    if (index < 0 || index >= this.count || !this.object3d.visible) return false;
    const pos = (this.geometry.getAttribute("position") as BufferAttribute).array as Float32Array;
    this.points.updateWorldMatrix(true, false);
    out.set(pos[index * 3], pos[index * 3 + 1], pos[index * 3 + 2]).applyMatrix4(this.points.matrixWorld);
    return true;
  }

  protected disposeResources(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.lut.dispose();
  }
}

export const createPollutionLayer: LayerFactory = ({ layers }) => new PointsOverlayLayer("pollution", "Pollution", layers.get("earth"), 0.9);
