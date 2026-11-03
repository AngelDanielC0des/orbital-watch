import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  FloatType,
  HalfFloatType,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  RGBAFormat,
  ShaderMaterial,
  WebGLRenderTarget,
  type IUniform,
  type Material,
  type Texture,
  type WebGLRenderer,
} from "three";

const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

/** One oversized triangle that covers the whole clip space. */
class FullScreenTriangleGeometry extends BufferGeometry {
  constructor() {
    super();
    this.setAttribute("position", new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
    this.setAttribute("uv", new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
  }
}

const quadGeometry = new FullScreenTriangleGeometry();

/** Renders a material over the full render target (three's `FullScreenQuad` pattern). */
export class FullScreenQuad {
  private _mesh: Mesh<BufferGeometry, Material>;

  constructor(material: Material) {
    this._mesh = new Mesh(quadGeometry, material);
  }

  dispose(): void {
    this._mesh.geometry.dispose();
  }

  render(renderer: WebGLRenderer): void {
    renderer.render(this._mesh, quadCamera);
  }

  get material(): Material {
    return this._mesh.material;
  }

  set material(material: Material) {
    this._mesh.material = material;
  }
}

/** Shared GLSL: orbit texel lookup + Earth shadow test (prepended to the satellite shaders). */
export const PROPAGATE_GLSL = `
  uniform highp sampler2D uPositions;
  uniform highp sampler2D uElemA;
  uniform highp sampler2D uElemC;

  ivec2 orbitTexel(float index) {
    int i = int(index + 0.5);
    return ivec2(i % 256, i / 256);
  }

  // 1 in sunlight, 0 inside Earth's umbra (cylindrical shadow, soft edge for the penumbra).
  float sunlit(vec3 p, vec3 L) {
    float s = dot(p, L);
    if (s > 0.0) return 1.0;
    return smoothstep(0.93, 1.05, dot(p, p) - s * s);
  }
`;

/** Kepler + J2 secular propagation, one texel per object. Output: scene xyz + visibility. */
const PROPAGATE_FRAGMENT = `
  uniform highp sampler2D uElemA; // a (Earth radii), e, inclination, RAAN at reference epoch
  uniform highp sampler2D uElemB; // arg. of perigee, mean anomaly, mean motion (rad/min), RAAN rate
  uniform highp sampler2D uElemC; // arg. of perigee rate, group, launch (min from ref), seed
  uniform float uMinutes;
  uniform float uCount;
  uniform float uVisible[8];
  uniform float uShowPlanned; // 1 with the "projected" filter: planned objects drawn dimmed on their planned orbit before launch

  const float TWO_PI = 6.28318530718;

  void main() {
    ivec2 tc = ivec2(gl_FragCoord.xy);
    float index = float(tc.y * 256 + tc.x);
    if (index >= uCount) {
      gl_FragColor = vec4(0.0);
      return;
    }

    vec4 A = texelFetch(uElemA, tc, 0);
    vec4 B = texelFetch(uElemB, tc, 0);
    vec4 C = texelFetch(uElemC, tc, 0);
    float t = uMinutes;

    int group = int(C.y + 0.5);
    float launched = step(C.z, t) * smoothstep(C.z, C.z + 2880.0, t);
    float planned = uShowPlanned * step(3.5, float(group)) * (1.0 - step(C.z, t)) * 0.5;
    float visible = uVisible[group] * max(launched, planned);

    float a = A.x;
    float e = A.y;
    float inc = A.z;
    float raan = A.w + B.w * t;
    float argp = B.x + C.x * t;
    float M = mod(B.y + B.z * t, TWO_PI);

    float E = e > 0.8 ? 3.14159265 : M + e * sin(M);
    int iterations = e < 0.02 ? 2 : 6;
    for (int k = 0; k < 6; k++) {
      if (k >= iterations) break;
      E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
    }

    float xp = a * (cos(E) - e);
    float yp = a * sqrt(1.0 - e * e) * sin(E);
    float cO = cos(raan), sO = sin(raan);
    float cw = cos(argp), sw = sin(argp);
    float ci = cos(inc), si = sin(inc);

    vec3 eci = vec3(
      xp * (cO * cw - sO * sw * ci) - yp * (cO * sw + sO * cw * ci),
      xp * (sO * cw + cO * sw * ci) + yp * (cO * cw * ci - sO * sw),
      xp * (sw * si) + yp * (cw * si)
    );

    gl_FragColor = vec4(eci.x, eci.z, -eci.y, visible);
  }
`;

export type GpuPropagatorUniforms = {
  uElemA: IUniform<DataTexture>;
  uElemB: IUniform<DataTexture>;
  uElemC: IUniform<DataTexture>;
  uMinutes: IUniform<number>;
  uCount: IUniform<number>;
  uVisible: IUniform<number[]>;
  uShowPlanned: IUniform<number>;
};

/**
 * GPU orbit propagator: element textures (256 × ⌈count/256⌉) → float render target of
 * scene positions, with optional async readback for picking / LOD.
 */
export class GpuPropagator {
  renderer: WebGLRenderer;
  count: number;
  width: number;
  height: number;
  elemA: DataTexture;
  elemB: DataTexture;
  elemC: DataTexture;
  target: WebGLRenderTarget;
  readable: boolean;
  uniforms: GpuPropagatorUniforms;
  material: ShaderMaterial;
  quad: FullScreenQuad;
  readBuffer: Float32Array;
  readPending: Promise<Float32Array | null> | null;
  private disposed = false;
  readVersion: number;
  readAtVersion?: number;
  dirty: boolean;

  constructor(renderer: WebGLRenderer, count: number) {
    this.renderer = renderer;
    this.count = count;
    this.width = 256;
    this.height = Math.max(1, Math.ceil(count / 256));
    const size = this.width * this.height * 4;
    this.elemA = this.createDataTexture(new Float32Array(size));
    this.elemB = this.createDataTexture(new Float32Array(size));
    this.elemC = this.createDataTexture(new Float32Array(size));
    const floatRenderable = renderer.extensions.has("EXT_color_buffer_float");
    this.target = new WebGLRenderTarget(this.width, this.height, {
      type: floatRenderable ? FloatType : HalfFloatType,
      format: RGBAFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.readable = floatRenderable;
    this.uniforms = {
      uElemA: { value: this.elemA },
      uElemB: { value: this.elemB },
      uElemC: { value: this.elemC },
      uMinutes: { value: 0 },
      uCount: { value: count },
      uVisible: { value: [1, 1, 1, 1, 1, 1, 1, 1] },
      uShowPlanned: { value: 0 },
    };
    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: PROPAGATE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    this.readBuffer = new Float32Array(size);
    this.readPending = null;
    this.readVersion = 0;
    this.dirty = true;
  }

  createDataTexture(data: Float32Array): DataTexture {
    const texture = new DataTexture(data, this.width, this.height, RGBAFormat, FloatType);
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  get positions(): Texture {
    return this.target.texture;
  }

  markElementsDirty(): void {
    this.elemA.needsUpdate = true;
    this.elemB.needsUpdate = true;
    this.elemC.needsUpdate = true;
    this.dirty = true;
  }

  setMinutes(minutes: number): void {
    if (minutes !== this.uniforms.uMinutes.value) {
      this.uniforms.uMinutes.value = minutes;
      this.dirty = true;
    }
  }

  setVisibility(mask: ArrayLike<number>): void {
    const visible = this.uniforms.uVisible.value;
    for (let n = 0; n < 8; n++) visible[n] = mask[n];
    this.dirty = true;
  }

  /** Plan v2 / N2: draw not-yet-launched planned objects (dimmed) while the "projected" filter is active. */
  setShowPlanned(on: boolean): void {
    const value = on ? 1 : 0;
    if (this.uniforms.uShowPlanned.value !== value) {
      this.uniforms.uShowPlanned.value = value;
      this.dirty = true;
    }
  }

  update(): boolean {
    if (!this.dirty) return false;
    const previous = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.quad.render(this.renderer);
    this.renderer.setRenderTarget(previous);
    this.dirty = false;
    this.readVersion++;
    return true;
  }

  readPositions(): Promise<Float32Array | null> {
    if (!this.readable) return Promise.resolve(null);
    if (this.readPending) return this.readPending;
    const version = this.readVersion;
    this.readPending = this.renderer
      .readRenderTargetPixelsAsync(this.target, 0, 0, this.width, this.height, this.readBuffer)
      .then(() => {
        this.readPending = null;
        this.readAtVersion = version;
        return this.readBuffer;
      })
      .catch((error: unknown) => {
        this.readPending = null;
        if (this.disposed) return null; // unmounted mid-readback: the rejection is expected, not a failure
        console.warn(`[OrbitCompute] readback failed`, error);
        return null;
      });
    return this.readPending;
  }

  dispose(): void {
    this.disposed = true;
    this.target.dispose();
    this.elemA.dispose();
    this.elemB.dispose();
    this.elemC.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
