import {
  AddEquation,
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CustomBlending,
  DoubleSide,
  MathUtils,
  Mesh,
  OneMinusSrcColorFactor,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  Sphere,
  Vector3,
  ZeroFactor,
  type IUniform,
  type ShaderMaterialParameters,
} from "three";
import type { QualityTier } from "@/engine/config";
import { HASH_GLSL, SIMPLEX_NOISE_GLSL } from "./bodies";

/** The Sun's position in the Milky Way model (scene units = kpc). */
export const GALAXY_SUN_POSITION = new Vector3(-8.2, 0.02, 0);
/** Orientation of the central bar. */
const BAR_ANGLE = Math.PI + 0.47;
/** Phase of arm 0 at r = 4 kpc. */
const ARM0_ANGLE = Math.PI + 0.62;
/** Logarithmic-spiral pitch angle of the arms. */
const ARM_PITCH = (12.5 * Math.PI) / 180;

const ARM_GLSL = `
  const float BAR = ${BAR_ANGLE.toFixed(5)};
  const float ARM0 = ${ARM0_ANGLE.toFixed(5)};
  const float PITCH_K = ${(1 / Math.tan(ARM_PITCH)).toFixed(5)};
  // Trailing logarithmic arms: k = 0 Escudo–Centauro, 1 Norma, 2 Perseo, 3 Sagitario–Carina.
  float armPhase(float r, float k) { return ARM0 + k * 1.5707963 - log(r / 4.0) * PITCH_K; }
  vec2 gauss2(float seed) {
    vec2 u = hash21(seed);
    float m = sqrt(-2.0 * log(max(u.x, 1e-6)));
    return m * vec2(cos(6.2831853 * u.y), sin(6.2831853 * u.y));
  }
`;

const STARS_VERTEX = `
  uniform float uPixelRatio;
  uniform float uBrightness;
  uniform float uRefDistance;
  varying vec3 vColor;
  varying float vAlpha;
  ${HASH_GLSL}
  ${ARM_GLSL}

  void main() {
    float id = float(gl_VertexID);
    vec3 h = hash31(id * 0.6180339 + 11.0);
    vec2 g1 = gauss2(id * 1.31 + 3.7);
    vec2 g2 = gauss2(id * 2.17 + 9.1);
    vec3 p;
    vec3 col;
    float w;

    if (h.x < 0.17) {
      // Boxy bulge and bar: old, warm population.
      vec3 q = vec3(g1.x * 1.75, g2.y * 0.36, g1.y * 0.62) * mix(0.3, 1.0, h.y);
      float c = cos(BAR), s = sin(BAR);
      p = vec3(q.x * c - q.z * s, q.y, q.x * s + q.z * c);
      col = mix(vec3(1.0, 0.68, 0.4), vec3(1.0, 0.86, 0.68), h.z);
      w = 0.32;
    } else if (h.x < 0.64) {
      float r = min(1.9 - log(1.0 - h.y * 0.985) * 3.2, 17.5);
      float k = floor(h.z * 4.0);
      float major = (k == 0.0 || k == 2.0) ? 1.0 : 0.55;
      float spread = (0.09 + 0.85 / r) * (major > 0.9 ? 1.0 : 1.35);
      // Arms are chains of star-forming complexes, not continuous ribbons: each ~0.5 kpc
      // segment gets its own density and a small sideways offset (feathering).
      float seg = floor(r * 1.9 + k * 13.0);
      float segDensity = 0.25 + 0.75 * hash11(seg * 3.7 + 1.0);
      float phi = armPhase(r, k) + g1.x * spread + (hash11(seg * 5.3) - 0.5) * 0.9 / r;
      float rr = r + g1.y * 0.22;
      p = vec3(rr * cos(phi), g2.x * (0.06 + 0.011 * r), rr * sin(phi));
      float young = exp(-abs(g1.x) * 1.6);
      col = mix(vec3(1.0, 0.86, 0.72), vec3(0.52, 0.7, 1.0), young);
      w = (0.7 + major * 0.7 * young) * segDensity;
    } else if (h.x < 0.95) {
      float r = min(-log(1.0 - h.y * 0.995) * 3.5, 19.0);
      float phi = h.z * 6.2831853;
      p = vec3(r * cos(phi), g1.x * (0.16 + 0.022 * r), r * sin(phi));
      col = mix(vec3(1.0, 0.8, 0.6), vec3(0.95, 0.93, 0.9), hash11(id + 5.0));
      w = 0.5;
    } else {
      // Star-forming knots: HII regions (Hα pink) and young blue clusters along the arms.
      float cid = floor(id / 48.0);
      vec3 hc = hash31(cid * 1.7 + 2.0);
      float r = 2.8 + hc.x * 12.0;
      float k = floor(hc.y * 4.0);
      float phi = armPhase(r, k) + (hc.z - 0.5) * 0.14;
      p = vec3(r * cos(phi), 0.0, r * sin(phi)) + vec3(g1.x, g2.x * 0.35, g1.y) * 0.08;
      bool hii = hash11(cid + 0.5) < 0.62;
      col = hii ? vec3(1.0, 0.36, 0.52) : vec3(0.58, 0.74, 1.0);
      w = hii ? 1.7 : 1.5;
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(-mv.z, 1e-3);
    gl_Position = projectionMatrix * mv;
    // Point stars at a fixed size; brightness compensates for zoom so the grain neither
    // vanishes far away nor blows out when close (the haze layer carries surface brightness).
    gl_PointSize = 1.7 * uPixelRatio;
    vAlpha = w * uBrightness * clamp(pow(uRefDistance / dist, 0.9), 0.25, 2.4);
    vColor = col;
  }
`;

const STARS_FRAGMENT = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float i = exp(-dot(q, q) * 10.0) * vAlpha;
    gl_FragColor = vec4(vColor * i, 1.0);
  }
`;

const DUST_VERTEX = `
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uOpacity;
  varying float vAlpha;
  ${HASH_GLSL}
  ${ARM_GLSL}

  void main() {
    float id = float(gl_VertexID);
    vec3 h = hash31(id * 0.7548777 + 41.0);
    vec2 g1 = gauss2(id * 3.11 + 1.3);
    vec2 g2 = gauss2(id * 5.37 + 7.7);
    float r = min(2.2 - log(1.0 - h.y * 0.97) * 3.6, 16.0);
    float k = h.z < 0.7 ? (h.z < 0.35 ? 0.0 : 2.0) : floor(hash11(id) * 4.0);
    // Lanes hug the inner (concave) edge of the arms.
    float seg = floor(r * 2.3 + k * 11.0);
    float phi = armPhase(r, k) - 0.11 + g1.x * (0.06 + 0.4 / r) + (hash11(seg * 4.1) - 0.5) * 0.8 / r;
    if (h.x < 0.18) phi = h.x * 34.9;
    vec3 p = vec3(r * cos(phi), g2.x * 0.035, r * sin(phi));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(-mv.z, 1e-3);
    gl_Position = projectionMatrix * mv;
    float px = 0.24 * uScale / dist;
    gl_PointSize = clamp(px, 2.0, 64.0) * uPixelRatio;
    vAlpha = uOpacity * (0.022 + 0.04 * h.x) * min(1.0, px / 2.0);
  }
`;

const DUST_FRAGMENT = `
  varying float vAlpha;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float a = exp(-dot(q, q) * 9.0) * vAlpha;
    // Multiplicative absorption, stronger in blue (interstellar reddening).
    gl_FragColor = vec4(vec3(0.62, 0.74, 0.86) * a, 1.0);
  }
`;

const HAZE_VERTEX = `
  varying vec2 vXZ;
  varying float vFacing;
  void main() {
    vXZ = position.xz;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vFacing = abs(normalize(cameraPosition - wp.xyz).y);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const HAZE_FRAGMENT = `
  uniform float uIntensity;
  varying vec2 vXZ;
  varying float vFacing;
  ${SIMPLEX_NOISE_GLSL}
  const float BAR = ${BAR_ANGLE.toFixed(5)};
  const float ARM0 = ${ARM0_ANGLE.toFixed(5)};
  const float PITCH_K = ${(1 / Math.tan(ARM_PITCH)).toFixed(5)};

  float arm(float r, float phi, float k, float width) {
    float target = ARM0 + k * 1.5707963 - log(max(r, 0.5) / 4.0) * PITCH_K;
    float d = mod(phi - target + 3.14159265, 6.2831853) - 3.14159265;
    float x = d * r / width;
    return exp(-x * x);
  }

  void main() {
    float r = length(vXZ);
    float phi = atan(vXZ.y, vXZ.x);
    // Domain warp so arms wobble, branch and feather instead of tracing perfect spirals.
    float warp = snoise(vec3(vXZ * 0.32, 0.7)) * 0.65 + snoise(vec3(vXZ * 0.8, 2.9)) * 0.35;
    float pw = phi + warp * 0.18;
    float rw = r * (1.0 + warp * 0.04);
    float w = 0.55 + 0.045 * r;
    float arms = arm(rw, pw, 0.0, w) + arm(rw, pw, 2.0, w) + 0.6 * (arm(rw, pw, 1.0, w * 1.25) + arm(rw, pw, 3.0, w * 1.25));
    arms *= smoothstep(1.6, 3.4, r);
    // Lanes hug the concave edge of each arm, matching the dust particles.
    float lw = w * 0.4;
    float lane = arm(rw, pw + 0.11, 0.0, lw) + arm(rw, pw + 0.11, 2.0, lw) + 0.6 * (arm(rw, pw + 0.11, 1.0, lw) + arm(rw, pw + 0.11, 3.0, lw));
    float n1 = snoise(vec3(vXZ * 0.9, 1.3));
    float n2 = snoise(vec3(vXZ * 2.6, 4.1));
    float n3 = snoise(vec3(vXZ * 7.0, 8.7));
    float clumps = 0.72 + 0.5 * (n1 * 0.5 + n2 * 0.33 + n3 * 0.17);
    lane *= smoothstep(2.2, 4.0, r) * smoothstep(-0.6, 0.4, n2 + warp * 0.5);
    float hii = smoothstep(0.42, 0.8, n3 * 0.55 + n2 * 0.45) * arms;
    float disk = exp(-r / 3.6) * smoothstep(18.8, 10.0, r);
    float c = cos(BAR), s = sin(BAR);
    vec2 q = vec2(vXZ.x * c + vXZ.y * s, -vXZ.x * s + vXZ.y * c);
    float bar = exp(-dot(q / vec2(2.4, 0.85), q / vec2(2.4, 0.85)));
    float core = exp(-r * r / 0.4);
    vec3 col = vec3(1.0, 0.84, 0.68) * disk * (0.62 + 1.0 * arms * clumps)
      + vec3(0.52, 0.68, 1.0) * disk * arms * clumps * 0.85
      + vec3(1.0, 0.38, 0.56) * disk * hii * 0.9
      + vec3(1.0, 0.76, 0.52) * (bar * 0.6 + core * 0.7);
    col *= 1.0 - 0.55 * clamp(lane, 0.0, 1.0);
    float facing = mix(0.25, 1.0, smoothstep(0.0, 0.6, vFacing));
    gl_FragColor = vec4(col * uIntensity * facing, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const BULGE_VERTEX = `
  uniform vec3 uCenter;
  uniform float uSize;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    vec4 mv = viewMatrix * vec4(uCenter, 1.0);
    mv.xy += position.xy * uSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const BULGE_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vP;
  void main() {
    float r2 = dot(vP, vP);
    float i = exp(-r2 * 7.0) * 0.8 + exp(-r2 * 40.0) * 1.4;
    gl_FragColor = vec4(uColor * i * uIntensity, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const M31_FRAGMENT = `
  uniform float uIntensity;
  varying vec2 vUv;
  ${SIMPLEX_NOISE_GLSL}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float phi = atan(p.y, p.x);
    float spiral = 0.5 + 0.5 * sin(2.0 * phi + log(max(r, 0.02)) * 7.5);
    float ring = exp(-pow((r - 0.55) / 0.12, 2.0));
    float disk = exp(-r * 4.2);
    float n = snoise(vec3(p * 9.0, 2.0)) * 0.5 + 0.5;
    float core = exp(-r * r * 160.0);
    vec3 col = vec3(1.0, 0.86, 0.7) * disk * (0.6 + 0.6 * spiral) + vec3(0.62, 0.74, 1.0) * ring * (0.35 + 0.65 * n) * 0.45 + vec3(1.0, 0.9, 0.75) * core * 3.0;
    col *= 1.0 - 0.45 * smoothstep(0.2, 0.9, n) * smoothstep(0.15, 0.6, r) * spiral;
    gl_FragColor = vec4(col * uIntensity * smoothstep(1.0, 0.7, r), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const M31_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CLOUD_VERTEX = `
  uniform vec3 uCenter;
  uniform vec3 uAxes;
  uniform float uSeed;
  uniform float uPixelRatio;
  uniform float uBrightness;
  varying vec3 vColor;
  varying float vAlpha;
  ${HASH_GLSL}
  vec2 gauss2(float seed) {
    vec2 u = hash21(seed);
    float m = sqrt(-2.0 * log(max(u.x, 1e-6)));
    return m * vec2(cos(6.2831853 * u.y), sin(6.2831853 * u.y));
  }
  void main() {
    float id = float(gl_VertexID);
    float clump = floor(id / 64.0);
    vec2 a = gauss2(clump * 1.7 + uSeed);
    vec2 b = gauss2(clump * 3.1 + uSeed * 2.0);
    vec2 c = gauss2(id * 0.91 + uSeed);
    vec2 d = gauss2(id * 1.77 + uSeed * 3.0);
    vec3 p = uCenter + vec3(a.x, b.x * 0.5, a.y) * uAxes + vec3(c.x, d.x, c.y) * uAxes * 0.18;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 1.6 * uPixelRatio;
    float hii = step(0.93, hash11(clump + uSeed));
    vColor = mix(vec3(0.78, 0.84, 1.0), vec3(1.0, 0.42, 0.6), hii);
    vAlpha = uBrightness * (0.6 + hii);
  }
`;

const FAR_VERTEX = `
  uniform float uPixelRatio;
  varying vec4 vShape; // angle, axis ratio, spiral, hue
  varying float vSize;
  varying float vAlpha;
  ${HASH_GLSL}
  void main() {
    float id = float(gl_VertexID);
    vec3 h = hash31(id * 1.618 + 77.0);
    vec3 h2 = hash31(id * 2.414 + 13.0);
    float z = h.x * 2.0 - 1.0;
    float t = h.y * 6.2831853;
    vec3 dir = vec3(sqrt(1.0 - z * z) * cos(t), z, sqrt(1.0 - z * z) * sin(t));
    vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * dir, 1.0);
    gl_Position = clip.xyww;
    float size = mix(3.0, 15.0, pow(h.z, 5.0));
    vSize = size;
    gl_PointSize = size * uPixelRatio;
    vShape = vec4(h2.x * 3.14159, mix(0.25, 1.0, h2.y), step(0.45, h2.z), hash11(id + 3.0));
    vAlpha = mix(0.35, 0.9, h2.y);
  }
`;

const FAR_FRAGMENT = `
  uniform float uIntensity;
  varying vec4 vShape;
  varying float vSize;
  varying float vAlpha;
  void main() {
    vec2 p = (gl_PointCoord - 0.5) * 2.0;
    float c = cos(vShape.x), s = sin(vShape.x);
    p = vec2(p.x * c - p.y * s, (p.x * s + p.y * c) / vShape.y);
    float r = length(p);
    float i = exp(-r * r * 6.0);
    if (vShape.z > 0.5 && vSize > 6.0) {
      float phi = atan(p.y, p.x);
      i = exp(-r * 3.6) * (0.55 + 0.45 * sin(2.0 * phi + log(max(r, 0.05)) * 6.0)) + exp(-r * r * 60.0);
    }
    i *= smoothstep(1.0, 0.6, r);
    vec3 col = mix(vec3(1.0, 0.82, 0.62), vec3(0.7, 0.8, 1.0), vShape.w * vShape.z);
    gl_FragColor = vec4(col * i * vAlpha * uIntensity, 1.0);
  }
`;

/** Galactic longitude / latitude (degrees) → unit direction in the galaxy frame. */
function galacticDirection(lonDeg: number, latDeg: number, target = new Vector3()): Vector3 {
  const lon = MathUtils.degToRad(lonDeg);
  const lat = MathUtils.degToRad(latDeg);
  return target.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
}

/** Point on spiral arm `k` at galactocentric radius `r` (kpc). */
function armPoint(r: number, k: number, target = new Vector3()): Vector3 {
  const phi = ARM0_ANGLE + (Math.PI / 2) * k - Math.log(r / 4) / Math.tan(ARM_PITCH);
  return target.set(r * Math.cos(phi), 0.05, r * Math.sin(phi));
}

export type GalaxyLabelKind = "here" | "region" | "arm" | "galaxy";

export interface GalaxyLabel {
  key: string;
  name: string;
  position: Vector3;
  kind: GalaxyLabelKind;
}

export interface GalaxyUniforms {
  [uniform: string]: IUniform<number>;
  uPixelRatio: IUniform<number>;
  uScale: IUniform<number>;
  uBrightness: IUniform<number>;
  uRefDistance: IUniform<number>;
  uOpacity: IUniform<number>;
}

export interface GalaxyCounts {
  far: number;
  stars: number;
  dust: number;
  lmc: number;
  smc: number;
}

export interface GalaxyOptions {
  tier?: QualityTier;
}

interface Disposable {
  dispose(): void;
}

type ShaderPoints = Points<BufferGeometry, ShaderMaterial>;

export class Galaxy {
  scene: Scene;
  disposables: Disposable[];
  uniforms: GalaxyUniforms;
  counts: GalaxyCounts;
  hi: boolean;
  far: ShaderPoints;
  haze: Mesh<CircleGeometry, ShaderMaterial>;
  stars: ShaderPoints;
  dust: ShaderPoints;
  bulge: Mesh<PlaneGeometry, ShaderMaterial>;
  m31: Mesh<PlaneGeometry, ShaderMaterial>;
  lmc: ShaderPoints;
  smc: ShaderPoints;
  labels: GalaxyLabel[];

  constructor({ tier = "hi" }: GalaxyOptions = {}) {
    const hi = tier === "hi";
    this.scene = new Scene();
    this.scene.name = "MilkyWay";
    this.disposables = [];

    // Attribute-less point clouds: positions are generated in the shader from gl_VertexID.
    const pointGeometry = (count: number): BufferGeometry => {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Uint8Array(count), 1));
      geometry.setDrawRange(0, count);
      geometry.boundingSphere = new Sphere(new Vector3(), 1e5);
      this.disposables.push(geometry);
      return geometry;
    };
    const shaderMaterial = (params: ShaderMaterialParameters): ShaderMaterial => {
      const material = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        ...params,
      });
      this.disposables.push(material);
      return material;
    };

    this.uniforms = {
      uPixelRatio: { value: 1 },
      uScale: { value: 500 },
      uBrightness: { value: 0.16 },
      uRefDistance: { value: 30 },
      uOpacity: { value: 1 },
    };
    this.counts = {
      far: hi ? 5200 : 2400,
      stars: hi ? 22e4 : 11e4,
      dust: hi ? 24e3 : 12e3,
      lmc: hi ? 1e4 : 5e3,
      smc: hi ? 5e3 : 2500,
    };
    this.hi = hi;

    this.far = new Points(
      pointGeometry(this.counts.far),
      shaderMaterial({
        uniforms: {
          uPixelRatio: this.uniforms.uPixelRatio,
          uIntensity: { value: 1.05 },
        },
        vertexShader: FAR_VERTEX,
        fragmentShader: FAR_FRAGMENT,
      }),
    );
    this.far.frustumCulled = false;
    this.far.renderOrder = -10;

    this.haze = new Mesh(
      new CircleGeometry(19.2, 96).rotateX(-Math.PI / 2),
      shaderMaterial({
        uniforms: { uIntensity: { value: 0.55 } },
        vertexShader: HAZE_VERTEX,
        fragmentShader: HAZE_FRAGMENT,
        side: DoubleSide,
      }),
    );
    this.disposables.push(this.haze.geometry);
    this.haze.renderOrder = 0;

    this.stars = new Points(
      pointGeometry(this.counts.stars),
      shaderMaterial({ uniforms: this.uniforms, vertexShader: STARS_VERTEX, fragmentShader: STARS_FRAGMENT }),
    );
    this.stars.renderOrder = 1;
    if (!hi) this.uniforms.uBrightness.value = 0.24;

    this.dust = new Points(
      pointGeometry(this.counts.dust),
      shaderMaterial({
        uniforms: this.uniforms,
        vertexShader: DUST_VERTEX,
        fragmentShader: DUST_FRAGMENT,
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: ZeroFactor,
        blendDst: OneMinusSrcColorFactor,
      }),
    );
    this.dust.renderOrder = 2;

    const quad = new PlaneGeometry(2, 2);
    this.disposables.push(quad);
    this.bulge = new Mesh(
      quad,
      shaderMaterial({
        uniforms: {
          uCenter: { value: new Vector3() },
          uSize: { value: 5.5 },
          uColor: { value: new Color(1, 0.78, 0.52) },
          uIntensity: { value: 0.32 },
        },
        vertexShader: BULGE_VERTEX,
        fragmentShader: BULGE_FRAGMENT,
      }),
    );
    this.bulge.frustumCulled = false;
    this.bulge.renderOrder = 3;

    const m31Position = galacticDirection(121.17, -21.57).multiplyScalar(765).add(GALAXY_SUN_POSITION);
    this.m31 = new Mesh(
      new PlaneGeometry(46, 46),
      shaderMaterial({
        uniforms: { uIntensity: { value: 0.9 } },
        vertexShader: M31_VERTEX,
        fragmentShader: M31_FRAGMENT,
        side: DoubleSide,
      }),
    );
    this.disposables.push(this.m31.geometry);
    this.m31.position.copy(m31Position);
    this.m31.lookAt(GALAXY_SUN_POSITION);
    this.m31.rotateX(MathUtils.degToRad(77));
    this.m31.rotateZ(0.66);

    const magellanicCloud = (
      lonDeg: number,
      latDeg: number,
      distance: number,
      axes: [number, number, number],
      seed: number,
      count: number,
    ): ShaderPoints => {
      const cloud = new Points(
        pointGeometry(count),
        shaderMaterial({
          uniforms: {
            uCenter: { value: galacticDirection(lonDeg, latDeg).multiplyScalar(distance).add(GALAXY_SUN_POSITION) },
            uAxes: { value: new Vector3(...axes) },
            uSeed: { value: seed },
            uPixelRatio: this.uniforms.uPixelRatio,
            uBrightness: { value: 0.22 },
          },
          vertexShader: CLOUD_VERTEX,
          fragmentShader: STARS_FRAGMENT,
        }),
      );
      cloud.frustumCulled = false;
      return cloud;
    };
    this.lmc = magellanicCloud(280.47, -32.89, 50, [2.2, 1.2, 1.4], 3.1, this.counts.lmc);
    this.smc = magellanicCloud(302.8, -44.3, 62, [1.2, 0.9, 0.7], 7.9, this.counts.smc);

    this.scene.add(this.far, this.haze, this.stars, this.dust, this.bulge, this.m31, this.lmc, this.smc);

    this.labels = [
      {
        key: "gal-sun",
        name: "Sol · estás aquí",
        position: GALAXY_SUN_POSITION.clone(),
        kind: "here",
      },
      {
        key: "gal-center",
        name: "Sagitario A*",
        position: new Vector3(0, 0.1, 0),
        kind: "region",
      },
      {
        key: "gal-perseus",
        name: "Brazo de Perseo",
        position: armPoint(10.6, 2),
        kind: "arm",
      },
      {
        key: "gal-sagittarius",
        name: "Brazo de Sagitario",
        position: armPoint(6.6, 3),
        kind: "arm",
      },
      {
        key: "gal-scutum",
        name: "Brazo de Escudo-Centauro",
        position: armPoint(5.4, 0),
        kind: "arm",
      },
      {
        key: "gal-norma",
        name: "Brazo de Norma",
        position: armPoint(4.3, 1),
        kind: "arm",
      },
      {
        key: "gal-lmc",
        name: "Gran Nube de Magallanes",
        position: (this.lmc.material.uniforms.uCenter.value as Vector3).clone(),
        kind: "galaxy",
      },
      {
        key: "gal-smc",
        name: "Pequeña Nube de Magallanes",
        position: (this.smc.material.uniforms.uCenter.value as Vector3).clone(),
        kind: "galaxy",
      },
      {
        key: "gal-m31",
        name: "Andrómeda · 2,5 M años luz",
        position: m31Position.clone(),
        kind: "galaxy",
      },
    ];

    // "You are here" marker at the Sun.
    const sunMarker = new Points(
      pointGeometry(1),
      shaderMaterial({
        uniforms: { uPixelRatio: this.uniforms.uPixelRatio },
        vertexShader: `
          uniform float uPixelRatio;
          void main() {
            gl_Position = projectionMatrix * modelViewMatrix * vec4(${GALAXY_SUN_POSITION.x.toFixed(2)}, ${GALAXY_SUN_POSITION.y.toFixed(2)}, 0.0, 1.0);
            gl_PointSize = 16.0 * uPixelRatio;
          }`,
        fragmentShader: `
          void main() {
            float r = length(gl_PointCoord - 0.5) * 2.0;
            float i = exp(-r * r * 14.0) * 2.0 + smoothstep(0.08, 0.0, abs(r - 0.82)) * 0.8;
            gl_FragColor = vec4(vec3(1.0, 0.86, 0.5) * i, 1.0);
          }`,
        depthTest: false,
      }),
    );
    sunMarker.frustumCulled = false;
    sunMarker.renderOrder = 10;
    this.scene.add(sunMarker);
  }

  /** `height` in CSS px, vertical `fov` in degrees. */
  setViewport(height: number, fov: number, pixelRatio: number): void {
    this.uniforms.uPixelRatio.value = pixelRatio;
    this.uniforms.uScale.value = (height * 0.5) / Math.tan(MathUtils.degToRad(fov) * 0.5);
  }

  /** Scales the drawn point counts (0.35–1) and compensates brightness. */
  setDetail(detail: number): void {
    const t = MathUtils.clamp(detail, 0.35, 1);
    this.stars.geometry.setDrawRange(0, Math.round(this.counts.stars * t));
    this.dust.geometry.setDrawRange(0, Math.round(this.counts.dust * t));
    this.far.geometry.setDrawRange(0, Math.round(this.counts.far * t));
    this.lmc.geometry.setDrawRange(0, Math.round(this.counts.lmc * t));
    this.smc.geometry.setDrawRange(0, Math.round(this.counts.smc * t));
    this.uniforms.uBrightness.value = (this.hi ? 0.16 : 0.24) / Math.sqrt(t);
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }
}
