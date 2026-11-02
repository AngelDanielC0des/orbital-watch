import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type InterleavedBufferAttribute,
  type Vector2,
} from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial, type LineMaterialParameters } from "three/examples/jsm/lines/LineMaterial.js";
import type { SatRec } from "satellite.js";
import { MS_PER_MINUTE, propagateSgp4, sampleTrack, satrecFromGp, type Sgp4Readout } from "@/lib/orbital/orbit-math";
import type { SatelliteEntry } from "./satellites";

/** Samples along one orbital period. */
const TRACK_SAMPLES = 256;

/** Crosshair reticle drawn on a 128 px canvas. */
function createReticleTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(64, 64, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 5;
  for (let k = 0; k < 4; k++) {
    const angle = (k * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(angle) * 44, 64 + Math.sin(angle) * 44);
    ctx.lineTo(64 + Math.cos(angle) * 60, 64 + Math.sin(angle) * 60);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(64, 64, 7, 0, Math.PI * 2);
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** SGP4 orbit trail (fading glow + core line) and reticle for the selected object. */
export class OrbitTrack {
  group: Group;
  color: Color;
  points: Float32Array;
  segments: Float32Array;
  segmentColors: Float32Array;
  geometry: LineGeometry;
  glowMaterial: LineMaterial;
  coreMaterial: LineMaterial;
  glow: Line2;
  core: Line2;
  reticleTexture: CanvasTexture;
  reticleMaterial: SpriteMaterial;
  reticle: Sprite;
  position: Vector3;
  state: Sgp4Readout | null;
  entry: SatelliteEntry | null;
  satrec: SatRec | null;
  periodMin!: number;
  builtAtMs: number;
  _date: Date;
  _scratch: Vector3;

  constructor(resolution: Vector2) {
    this.group = new Group();
    this.group.name = "OrbitTrack";
    this.group.visible = false;
    this.color = new Color("#5ff0ff");
    this.points = new Float32Array(TRACK_SAMPLES * 3);
    this.segments = new Float32Array(1530);
    this.segmentColors = new Float32Array(1530);
    this.geometry = new LineGeometry();
    this.geometry.setPositions(this.points);
    this.geometry.setColors(new Float32Array(TRACK_SAMPLES * 3));
    const common: LineMaterialParameters = {
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      worldUnits: false,
    };
    this.glowMaterial = new LineMaterial({ ...common, linewidth: 8, opacity: 0.42 });
    this.coreMaterial = new LineMaterial({ ...common, linewidth: 1.8, opacity: 1 });
    this.setResolution(resolution.x, resolution.y);
    this.glow = new Line2(this.geometry, this.glowMaterial);
    this.core = new Line2(this.geometry, this.coreMaterial);
    for (const line of [this.glow, this.core]) {
      line.frustumCulled = false;
      line.renderOrder = 3;
    }
    this.reticleTexture = createReticleTexture();
    this.reticleMaterial = new SpriteMaterial({
      map: this.reticleTexture,
      color: this.color,
      sizeAttenuation: false,
      depthTest: false,
      transparent: true,
      blending: AdditiveBlending,
    });
    this.reticle = new Sprite(this.reticleMaterial);
    this.reticle.scale.setScalar(0.045);
    this.reticle.renderOrder = 4;
    this.group.add(this.glow, this.core, this.reticle);
    this.position = new Vector3();
    this.state = null;
    this.entry = null;
    this.satrec = null;
    this.builtAtMs = -Infinity;
    this._date = new Date();
    this._scratch = new Vector3();
  }

  setResolution(width: number, height: number): void {
    this.glowMaterial.resolution.set(width, height);
    this.coreMaterial.resolution.set(width, height);
  }

  setColor(color: Color): void {
    this.color.copy(color);
    this.reticleMaterial.color.copy(color);
    this.builtAtMs = -Infinity;
  }

  setTarget(entry: SatelliteEntry): boolean {
    const satrec = satrecFromGp(entry.omm);
    if (!satrec) return false;
    this.entry = entry;
    this.satrec = satrec;
    this.periodMin = entry.elements.periodMin;
    this.builtAtMs = -Infinity;
    this.group.visible = true;
    return true;
  }

  clear(): void {
    this.entry = null;
    this.satrec = null;
    this.state = null;
    this.group.visible = false;
  }

  update(ms: number, gmstRad: number): Sgp4Readout | null {
    if (!this.satrec) return null;
    this._date.setTime(ms);
    this.state = propagateSgp4(this.satrec, this._date, gmstRad, this.position);
    if (!this.state) return null;
    this.reticle.position.copy(this.position);
    const rebuildEveryMs = this.periodMin * MS_PER_MINUTE * 0.004;
    if (Math.abs(ms - this.builtAtMs) > rebuildEveryMs) this.rebuildTrajectory(ms);
    return this.state;
  }

  rebuildTrajectory(ms: number): void {
    const written = sampleTrack(
      this.satrec as SatRec,
      ms,
      this.periodMin,
      TRACK_SAMPLES,
      this.points,
      this._scratch,
    );
    if (written < 2) return;
    for (let k = written; k < TRACK_SAMPLES; k++) {
      this.points[k * 3] = this.points[(written - 1) * 3];
      this.points[k * 3 + 1] = this.points[(written - 1) * 3 + 1];
      this.points[k * 3 + 2] = this.points[(written - 1) * 3 + 2];
    }
    const segments = this.segments;
    const colors = this.segmentColors;
    const { r, g, b } = this.color;
    for (let k = 0; k < 255; k++) {
      const t = k * 6;
      const s = k * 3;
      segments[t] = this.points[s];
      segments[t + 1] = this.points[s + 1];
      segments[t + 2] = this.points[s + 2];
      segments[t + 3] = this.points[s + 3];
      segments[t + 4] = this.points[s + 4];
      segments[t + 5] = this.points[s + 5];
      const fadeStart = (1 - k / 255) ** 1.6;
      const fadeEnd = (1 - (k + 1) / 255) ** 1.6;
      colors[t] = r * fadeStart;
      colors[t + 1] = g * fadeStart;
      colors[t + 2] = b * fadeStart;
      colors[t + 3] = r * fadeEnd;
      colors[t + 4] = g * fadeEnd;
      colors[t + 5] = b * fadeEnd;
    }
    const positionBuffer = (this.geometry.attributes.instanceStart as InterleavedBufferAttribute).data;
    positionBuffer.array.set(segments);
    positionBuffer.needsUpdate = true;
    const colorBuffer = (this.geometry.attributes.instanceColorStart as InterleavedBufferAttribute).data;
    colorBuffer.array.set(colors);
    colorBuffer.needsUpdate = true;
    this.builtAtMs = ms;
  }

  dispose(): void {
    this.geometry.dispose();
    this.glowMaterial.dispose();
    this.coreMaterial.dispose();
    this.reticleMaterial.dispose();
    this.reticleTexture.dispose();
    this.group.removeFromParent();
  }
}
