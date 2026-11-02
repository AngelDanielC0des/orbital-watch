/**
 * Fire heatmap (ADR-15): a 0.5° density/FRP `DataTexture` (RG8, 720×360 ≈ 0.5 MB) on a sphere at
 * r = 1.0095 coloured through a heat LUT, plus up to N hotspot sprites (≤ 2 000 hi / 800 lo,
 * capped by the service) with an optional pulse. Two draw calls. The grid texture is reused across
 * payloads of the same size (`needsUpdate` once per payload); hotspot buffers grow only.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  LinearFilter,
  Mesh,
  Points,
  RGFormat,
  ShaderMaterial,
  Sphere,
  SphereGeometry,
  UnsignedByteType,
  Vector3,
} from "three";
import type { ILayer, LayerDataPayload, LayerFactory, LayerUpdateContext } from "@/engine/contract";
import { buildLutTexture, updateLutTexture } from "@/engine/render/lut";
import { HEATMAP_FRAGMENT, HOTSPOT_FRAGMENT, HOTSPOT_VERTEX, OVERLAY_SPHERE_VERTEX } from "@/engine/render/overlay-shaders";
import { latLonToVector } from "@/lib/orbital/place-index";
import type { ColorStop } from "@/types/layers";
import { closeImage, OverlayLayerBase } from "./overlay-base";

export const FIRE_GRID_RADIUS = 1.0095;
const HOTSPOT_RADIUS = 1.0105;
const STRONG_MW = 100;
const MIN_HOTSPOTS = 256;

/** Default heat ramp until a payload brings its own `scale` (the service sends `FIRE_HEAT_STOPS`). */
const HEAT_STOPS: readonly ColorStop[] = [
  { at: 0, color: "#3a0400" },
  { at: 0.25, color: "#8b0a00" },
  { at: 0.5, color: "#e8380d" },
  { at: 0.75, color: "#ff9a1f" },
  { at: 1, color: "#fff3b0" },
];

export class HeatmapLayer extends OverlayLayerBase {
  private readonly reducedMotion: boolean;
  private readonly sphere: SphereGeometry;
  private readonly gridMaterial: ShaderMaterial;
  private readonly gridMesh: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly lut: DataTexture;
  private grid: DataTexture | null = null;
  private readonly hotGeometry: BufferGeometry;
  private readonly hotMaterial: ShaderMaterial;
  private readonly hotPoints: Points<BufferGeometry, ShaderMaterial>;
  private hotCapacity = 0;
  private scale: readonly ColorStop[] = HEAT_STOPS;
  private readonly scratch = new Vector3();

  constructor(id: string, name: string, host: ILayer | undefined, opacity: number, reducedMotion: boolean, segments: number) {
    super(id, name, host, opacity);
    this.reducedMotion = reducedMotion;
    this.lut = buildLutTexture(HEAT_STOPS);
    this.sphere = new SphereGeometry(FIRE_GRID_RADIUS, segments, segments / 2);
    this.gridMaterial = new ShaderMaterial({
      uniforms: {
        uGrid: { value: null },
        uLut: { value: this.lut },
        uOpacity: { value: opacity },
        uNightFade: { value: 0.35 },
        uSunDir: { value: new Vector3(1, 0, 0) },
      },
      vertexShader: OVERLAY_SPHERE_VERTEX,
      fragmentShader: HEATMAP_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    this.gridMesh = new Mesh(this.sphere, this.gridMaterial);
    this.gridMesh.name = `${name}Grid`;
    this.gridMesh.renderOrder = 3;

    this.hotGeometry = new BufferGeometry();
    this.allocateHotspots(MIN_HOTSPOTS);
    this.hotGeometry.boundingSphere = new Sphere(new Vector3(), HOTSPOT_RADIUS + 0.01);
    this.hotMaterial = new ShaderMaterial({
      uniforms: {
        uOpacity: { value: opacity },
        uSize: { value: 18 },
        uPixelRatio: { value: 1 },
        uTime: { value: 0 },
        uPulse: { value: reducedMotion ? 0 : 1 },
        uStrongMw: { value: STRONG_MW },
      },
      vertexShader: HOTSPOT_VERTEX,
      fragmentShader: HOTSPOT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    this.hotPoints = new Points(this.hotGeometry, this.hotMaterial);
    this.hotPoints.name = `${name}Hotspots`;
    this.hotPoints.frustumCulled = false;
    this.hotPoints.renderOrder = 4;
    this.object3d.add(this.gridMesh, this.hotPoints);
  }

  private allocateHotspots(capacity: number): void {
    this.hotCapacity = capacity;
    this.hotGeometry.setAttribute("position", new BufferAttribute(new Float32Array(capacity * 3), 3));
    this.hotGeometry.setAttribute("aFrp", new BufferAttribute(new Float32Array(capacity), 1));
    this.hotGeometry.setAttribute("aPhase", new BufferAttribute(new Float32Array(capacity), 1));
    this.hotGeometry.setDrawRange(0, 0);
  }

  setViewport(_width: number, _height: number, _fov: number, pixelRatio: number): void {
    this.hotMaterial.uniforms.uPixelRatio.value = pixelRatio;
  }

  protected tick(ctx: LayerUpdateContext): void {
    (this.gridMaterial.uniforms.uSunDir.value as Vector3).copy(ctx.sunDir);
    // Wall-clock pulse (not sim time): `dt` is real seconds, clamped by the engine.
    if (!this.reducedMotion) this.hotMaterial.uniforms.uTime.value = (this.hotMaterial.uniforms.uTime.value + ctx.dt) % 1500;
  }

  protected applyOpacity(opacity: number): void {
    this.gridMaterial.uniforms.uOpacity.value = opacity;
    this.hotMaterial.uniforms.uOpacity.value = opacity;
  }

  protected accept(payload: LayerDataPayload): boolean {
    if (payload.kind !== "heatmap") {
      closeImage(payload);
      return false;
    }
    const { cols, rows } = payload;
    const cells = cols * rows;
    if (cols <= 0 || rows <= 0 || payload.density.length < cells || payload.intensity.length < cells) return false;
    if (!this.grid || this.grid.image.width !== cols || this.grid.image.height !== rows) {
      this.grid?.dispose();
      const texture = new DataTexture(new Uint8Array(cells * 2), cols, rows, RGFormat, UnsignedByteType);
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.generateMipmaps = false;
      texture.unpackAlignment = 2;
      this.grid = texture;
      this.gridMaterial.uniforms.uGrid.value = texture;
    }
    const data = this.grid.image.data as Uint8Array;
    let any = false;
    for (let i = 0; i < cells; i++) {
      const d = payload.density[i];
      data[i * 2] = d;
      data[i * 2 + 1] = payload.intensity[i];
      if (d > 0) any = true;
    }
    this.grid.needsUpdate = true;
    if (payload.scale && payload.scale !== this.scale) {
      this.scale = payload.scale;
      updateLutTexture(this.lut, payload.scale, false);
    }

    const count = Math.max(0, Math.min(payload.hotspotCount, Math.floor(payload.hotspots.length / 4)));
    if (count > this.hotCapacity) {
      this.hotGeometry.dispose();
      let next = this.hotCapacity;
      while (next < count) next *= 2;
      this.allocateHotspots(next);
    }
    const position = this.hotGeometry.getAttribute("position") as BufferAttribute;
    const frp = this.hotGeometry.getAttribute("aFrp") as BufferAttribute;
    const phase = this.hotGeometry.getAttribute("aPhase") as BufferAttribute;
    const pos = position.array as Float32Array;
    const fr = frp.array as Float32Array;
    const ph = phase.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const lat = payload.hotspots[i * 4];
      const lon = payload.hotspots[i * 4 + 1];
      latLonToVector(lat, lon, HOTSPOT_RADIUS, this.scratch);
      pos[i * 3] = this.scratch.x;
      pos[i * 3 + 1] = this.scratch.y;
      pos[i * 3 + 2] = this.scratch.z;
      fr[i] = payload.hotspots[i * 4 + 2];
      ph[i] = ((lat * 12.9898 + lon * 78.233) % 6.2832 + 6.2832) % 6.2832;
    }
    for (const attribute of [position, frp, phase]) attribute.needsUpdate = true;
    this.hotGeometry.setDrawRange(0, count);
    return any || count > 0;
  }

  protected release(): void {
    this.gridMaterial.uniforms.uGrid.value = null;
    this.grid?.dispose();
    this.grid = null;
    this.hotGeometry.setDrawRange(0, 0);
  }

  protected disposeResources(): void {
    this.sphere.dispose();
    this.gridMaterial.dispose();
    this.lut.dispose();
    this.hotGeometry.dispose();
    this.hotMaterial.dispose();
  }
}

export const createFiresLayer: LayerFactory = ({ layers, reducedMotion, tier }) =>
  new HeatmapLayer("fires", "Fires", layers.get("earth"), 0.85, reducedMotion, tier === "hi" ? 128 : 96);
