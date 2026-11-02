/**
 * Points overlay (ADR-15, surface air quality): one `THREE.Points` draw call at r = 1.011.
 * Buffers grow only when a payload is larger than the current capacity; values index a 256×1 LUT
 * rebuilt in place from the payload's scale (same stops as the legend).
 */
import { BufferAttribute, BufferGeometry, DataTexture, Points, ShaderMaterial, Sphere, Vector3 } from "three";
import type { ILayer, LayerDataPayload, LayerFactory } from "@/engine/contract";
import { buildLutTexture, updateLutTexture } from "@/engine/render/lut";
import { POINTS_FRAGMENT, POINTS_VERTEX } from "@/engine/render/overlay-shaders";
import { latLonToVector } from "@/lib/orbital/place-index";
import { closeImage, OverlayLayerBase } from "./overlay-base";

export const POLLUTION_RADIUS = 1.011;
const MIN_CAPACITY = 512;

export class PointsOverlayLayer extends OverlayLayerBase {
  private readonly geometry: BufferGeometry;
  private readonly material: ShaderMaterial;
  private readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly lut: DataTexture;
  private capacity = 0;
  private readonly scratch = new Vector3();

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
    const pos = position.array as Float32Array;
    const val = value.array as Float32Array;
    let shown = 0;
    for (let i = 0; i < count; i++) {
      const v = payload.values[i];
      latLonToVector(payload.latLon[i * 2], payload.latLon[i * 2 + 1], POLLUTION_RADIUS, this.scratch);
      pos[i * 3] = this.scratch.x;
      pos[i * 3 + 1] = this.scratch.y;
      pos[i * 3 + 2] = this.scratch.z;
      const ok = Number.isFinite(v);
      val[i] = ok ? Math.min(1, Math.max(0, v)) : -1;
      if (ok) shown++;
    }
    position.needsUpdate = true;
    value.needsUpdate = true;
    position.clearUpdateRanges();
    value.clearUpdateRanges();
    position.addUpdateRange(0, count * 3);
    value.addUpdateRange(0, count);
    this.geometry.setDrawRange(0, count);
    updateLutTexture(this.lut, payload.scale, payload.categorical);
    return shown > 0;
  }

  protected release(): void {
    this.geometry.setDrawRange(0, 0);
  }

  protected disposeResources(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.lut.dispose();
  }
}

export const createPollutionLayer: LayerFactory = ({ layers }) => new PointsOverlayLayer("pollution", "Pollution", layers.get("earth"), 0.9);
