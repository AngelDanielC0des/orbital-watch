/**
 * Hover marker: a constant-screen-size ring + dot drawn over the satellite / body under the mouse, so the user
 * can tell the object is clickable. K4 shape (`ILayer`), highlighted from engine code like `PlaceLayer`:
 * the engine owns the hover state and calls `place()` every frame with the object's current position and
 * `hide()` when the pointer leaves / drags / the view changes. One `THREE.Points` vertex, no per-frame allocations.
 */
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial, type Vector3 } from "three";
import { ENGINE_THEME } from "@/engine/theme";
import type { ILayer, LayerFactory, LayerFactoryContext } from "@/engine/contract";

const VERTEX = `
  uniform float uSizePx;
  uniform float uPixelRatio;
  uniform float uDepthBias;
  uniform float uTime;
  uniform float uPulse;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec4 clip = projectionMatrix * mv;
    // Depth-only bias towards the camera: keeps the marker's xy but stops the object's own mesh (and the
    // Earth limb right next to it) from z-fighting it, while objects behind the globe stay occluded.
    float bias = min(uDepthBias, -mv.z * 0.3);
    vec4 biased = projectionMatrix * vec4(mv.xy, mv.z + bias, 1.0);
    gl_Position = vec4(clip.xy, biased.z / biased.w * clip.w, clip.w);
    // Gentle 1 Hz pulse, scale 1 -> 1 + uPulse (0 under prefers-reduced-motion).
    float pulse = 1.0 + uPulse * (0.5 + 0.5 * sin(uTime * 6.2831853));
    gl_PointSize = uSizePx * uPixelRatio * pulse;
  }
`;

const FRAGMENT = `
  uniform vec3 uColor;

  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float ring = smoothstep(0.66, 0.74, r) * (1.0 - smoothstep(0.88, 0.98, r));
    float core = 1.0 - smoothstep(0.1, 0.18, r);
    float alpha = max(ring, core * 0.9);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;

/** Peak extra scale of the ring pulse (1 -> 1.15). */
const PULSE_AMPLITUDE = 0.15;

/** World-space depth bias (scene units) applied to satellite markers. */
const SATELLITE_DEPTH_BIAS = 0.02;

export class HoverLayer implements ILayer {
  readonly id = "hover";
  readonly name = "Hover marker";
  readonly object3d: Points<BufferGeometry, ShaderMaterial>;
  visible = true;
  private active = false;
  private disposed = false;
  private readonly material: ShaderMaterial;
  private readonly geometry: BufferGeometry;

  constructor(reducedMotion = false) {
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3));
    this.material = new ShaderMaterial({
      uniforms: {
        uSizePx: { value: 18 },
        uPixelRatio: { value: 1 },
        uDepthBias: { value: SATELLITE_DEPTH_BIAS },
        uColor: { value: new Color(ENGINE_THEME.hover) },
        uTime: { value: 0 },
        uPulse: { value: reducedMotion ? 0 : PULSE_AMPLITUDE },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
    });
    this.object3d = new Points(this.geometry, this.material);
    this.object3d.name = "HoverMarker";
    this.object3d.frustumCulled = false;
    this.object3d.renderOrder = 7;
    this.object3d.visible = false;
  }

  /** Per-frame work is driven by the engine through `place()` (it owns the hover state), so this is a no-op. */
  update(): void {}

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.object3d.visible = visible && this.active;
  }

  /** Shows the marker at `position` (scene units), `sizePx` CSS px wide. `depthTested`: honour occlusion (satellites) or not (bodies, whose centre is inside their own sphere). `timeSeconds` drives the pulse (uniform write only). */
  place(position: Vector3, sizePx: number, depthTested: boolean, timeSeconds = 0): void {
    this.object3d.position.copy(position);
    const uniforms = this.material.uniforms;
    uniforms.uSizePx.value = sizePx;
    uniforms.uTime.value = timeSeconds;
    uniforms.uDepthBias.value = depthTested ? SATELLITE_DEPTH_BIAS : 0;
    this.material.depthTest = depthTested;
    this.active = true;
    this.object3d.visible = this.visible;
  }

  hide(): void {
    this.active = false;
    this.object3d.visible = false;
  }

  setViewport(_width: number, _height: number, _fov: number, pixelRatio: number): void {
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  /** Idempotent: frees the single-vertex geometry and the material. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    this.object3d.visible = false;
    this.object3d.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

export const createHoverLayer: LayerFactory = (ctx: LayerFactoryContext) => new HoverLayer(ctx.reducedMotion);
