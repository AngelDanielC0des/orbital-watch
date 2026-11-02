import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  MathUtils,
  Matrix3,
  Matrix4,
  Mesh,
  Points,
  Quaternion,
  SRGBColorSpace,
  ShaderMaterial,
  Sphere,
  SphereGeometry,
  Vector3,
  Vector4,
  type IUniform,
  type InterleavedBufferAttribute,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { PLANET_DEFS } from "./bodies";
import { assetUrl, type QualityTier } from "@/engine/config";
import { DEG, EARTH_RADIUS_KM, MS_PER_DAY, solveKepler } from "@/lib/orbital/orbit-math";
import { Sun, loadTexture, type Occluder } from "./sun";
import type { BodyDef } from "@/types/orbital";

/** J2000.0 epoch (2000-01-01 12:00 UTC) in ms. */
const J2000_MS = Date.UTC(2e3, 0, 1, 12);
/** Astronomical unit in km. */
const AU_KM = 149597870.7;
/** Scene distance (Earth radii) of a body 1 AU from the Sun. */
const SOLAR_DISTANCE_SCALE = 2400;
/** Heliocentric distances are compressed as `r ** SOLAR_DISTANCE_EXPONENT`. */
const SOLAR_DISTANCE_EXPONENT = 0.6;

/** Compresses a heliocentric distance in AU into scene units (bundle `Cy`). */
function compressDistance(au: number): number {
  return SOLAR_DISTANCE_SCALE * au ** +SOLAR_DISTANCE_EXPONENT;
}

/**
 * JPL approximate Keplerian elements (1800–2050), bundle `wy`:
 * [a, ȧ, e, ė, I, İ, L, L̇, ϖ, ϖ̇, Ω, Ω̇] — AU, deg, and their rates per Julian century.
 */
const JPL_ELEMENTS: Record<string, number[]> = {
  mercury: [
    0.38709927, 37e-8, 0.20563593, 1906e-8, 7.00497902, -0.00594749, 252.2503235, 149472.67411175, 77.45779628,
    0.16047689, 48.33076593, -0.12534081,
  ],
  venus: [
    0.72333566, 39e-7, 0.00677672, -4107e-8, 3.39467605, -7889e-7, 181.9790995, 58517.81538729, 131.60246718,
    0.00268329, 76.67984255, -0.27769418,
  ],
  earth: [
    1.00000261, 562e-8, 0.01671123, -4392e-8, -1531e-8, -0.01294668, 100.46457166, 35999.37244981, 102.93768193,
    0.32327364, 0, 0,
  ],
  mars: [
    1.52371034, 1847e-8, 0.0933941, 7882e-8, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959,
    0.44441088, 49.55953891, -0.29257343,
  ],
  jupiter: [
    5.202887, -11607e-8, 0.04838624, -13253e-8, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983,
    0.21252668, 100.47390909, 0.20469106,
  ],
  saturn: [
    9.53667594, -0.0012506, 0.05386179, -50991e-8, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831,
    -0.41897216, 113.66242448, -0.28867794,
  ],
  uranus: [
    19.18916464, -0.00196176, 0.04725744, -4397e-8, 0.77263783, -0.00242939, 313.23810451, 428.48202785,
    170.9542763, 0.40805281, 74.01692503, 0.04240589,
  ],
  neptune: [
    30.06992276, 26291e-8, 0.00859048, 5105e-8, 1.77004347, 35372e-8, -55.12002969, 218.45945325, 44.96476227,
    -0.32241464, 131.78422574, -0.00508664,
  ],
};

/** Keys with JPL elements, in table order (bundle `Ty`). */
const ORBIT_KEYS = Object.keys(JPL_ELEMENTS);

/** Julian centuries since J2000 (bundle `Ey`). */
const julianCenturies = (ms: number): number => (ms - J2000_MS) / 315576e7;

/** Mean obliquity of the ecliptic for `T` Julian centuries, radians (bundle `Dy`). */
function obliquityAt(T: number): number {
  return (23.439291 - 0.0130042 * T) * DEG;
}

/** Ecliptic → equatorial (rotate about x by the obliquity) → scene axes (bundle `Oy`). */
function eclipticToScene(x: number, y: number, z: number, obliquity: number, out: Vector3): Vector3 {
  const yEq = y * Math.cos(obliquity) - z * Math.sin(obliquity);
  const zEq = y * Math.sin(obliquity) + z * Math.cos(obliquity);
  return out.set(x, zEq, -yEq);
}

/** Osculating heliocentric elements (AU, radians). */
export interface KeplerElements {
  a: number;
  e: number;
  i: number;
  node: number;
  argp: number;
  M: number;
}

const emptyElements = (): KeplerElements => ({ a: 0, e: 0, i: 0, node: 0, argp: 0, M: 0 });

/** Elements of planet `key` at `T` Julian centuries, ecliptic of date (bundle `ky`). */
function planetElements(key: string, T: number, out: KeplerElements = emptyElements()): KeplerElements {
  const el = JPL_ELEMENTS[key];
  const precession = 1.396971 * T;
  const a = el[0] + el[1] * T;
  const e = el[2] + el[3] * T;
  const inc = el[4] + el[5] * T;
  const meanLongitude = el[6] + el[7] * T + precession;
  const perihelionLongitude = el[8] + el[9] * T + precession;
  const node = el[10] + el[11] * T + precession;
  out.a = a;
  out.e = e;
  out.i = inc * DEG;
  out.node = node * DEG;
  out.argp = (perihelionLongitude - node) * DEG;
  out.M = ((((meanLongitude - perihelionLongitude) % 360) + 360) % 360) * DEG;
  return out;
}

/** Heliocentric position (AU, scene axes) at mean anomaly `M` (bundle `Ay`). */
function elementsToScene(el: KeplerElements, M: number, obliquity: number, out: Vector3): Vector3 {
  const E = solveKepler(M, el.e);
  const xv = el.a * (Math.cos(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const cO = Math.cos(el.node);
  const sO = Math.sin(el.node);
  const cw = Math.cos(el.argp);
  const sw = Math.sin(el.argp);
  const ci = Math.cos(el.i);
  const si = Math.sin(el.i);
  return eclipticToScene(
    (cO * cw - sO * sw * ci) * xv + (-cO * sw - sO * cw * ci) * yv,
    (sO * cw + cO * sw * ci) * xv + (-sO * sw + cO * cw * ci) * yv,
    sw * si * xv + cw * si * yv,
    obliquity,
    out,
  );
}

const scratchElements = emptyElements();

/** Heliocentric position of planet `key` at `ms` (AU, scene axes) (bundle `My`). */
function heliocentricPosition(key: string, ms: number, out: Vector3): Vector3 {
  const T = julianCenturies(ms);
  const el = planetElements(key, T, scratchElements);
  return elementsToScene(el, el.M, obliquityAt(T), out);
}

/** Geocentric Moon position (Earth radii, scene axes), low-precision series (bundle `Ny`). */
function moonPosition(ms: number, out: Vector3): Vector3 {
  const d = (ms - J2000_MS) / 864e5;
  const L = (218.316 + 13.176396 * d) * DEG;
  const Mm = (134.963 + 13.064993 * d) * DEG;
  const Ms = (357.529 + 0.98560028 * d) * DEG;
  const D = (297.85 + 12.190749 * d) * DEG;
  const F = (93.272 + 13.22935 * d) * DEG;
  const lon =
    L +
    (6.289 * Math.sin(Mm) +
      1.274 * Math.sin(2 * D - Mm) +
      0.658 * Math.sin(2 * D) +
      0.214 * Math.sin(2 * Mm) -
      0.186 * Math.sin(Ms) -
      0.114 * Math.sin(2 * F)) *
      DEG;
  const lat =
    (5.128 * Math.sin(F) + 0.281 * Math.sin(Mm + F) + 0.278 * Math.sin(Mm - F) + 0.173 * Math.sin(2 * D - F)) * DEG;
  const dist = (385001 - 20905 * Math.cos(Mm) - 3699 * Math.cos(2 * D - Mm) - 2956 * Math.cos(2 * D)) / EARTH_RADIUS_KM;
  return eclipticToScene(
    dist * Math.cos(lat) * Math.cos(lon),
    dist * Math.cos(lat) * Math.sin(lon),
    dist * Math.sin(lat),
    obliquityAt(julianCenturies(ms)),
    out,
  );
}

/** Heliocentric AU vector → compressed scene position around the Sun (bundle `Py`). */
function compressHeliocentric(helio: Vector3, sunPosition: Vector3, out: Vector3): Vector3 {
  const r = helio.length();
  return out
    .copy(helio)
    .multiplyScalar(r > 0 ? compressDistance(r) / r : 0)
    .add(sunPosition);
}

/** Pole RA/Dec (deg, equatorial) → unit vector in scene axes (bundle `Fy`). */
function poleVector(raDeg: number, decDeg: number, out: Vector3): Vector3 {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  return out.set(x, z, -y);
}

/** Mean obliquity of the ecliptic at `ms`, radians (bundle `Iy`). */
export const eclipticObliquity = (ms: number): number => obliquityAt(julianCenturies(ms));

/** Planet / Moon vertex shader (bundle `Ly`). */
export const BODY_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/** Planet / Moon fragment shader (bundle `Ry`). */
export const BODY_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uNormalMap;
  uniform sampler2D uRingMap;
  uniform vec3 uBaseColor;
  uniform vec3 uSunPos;
  uniform vec3 uPole;
  uniform vec3 uCenter;
  uniform vec3 uEarthSunDir;
  uniform vec4 uAtmo;
  uniform vec4 uRing;
  uniform float uHasMap;
  uniform float uHasNormal;
  uniform float uNormalStrength;
  uniform float uGas;
  uniform float uEclipse;
  uniform float uSunIntensity;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;

  void main() {
    vec3 Ng = normalize(vNormalW);
    vec3 N = Ng;
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 L = normalize(uSunPos - vPosW);
    vec3 albedo = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : uBaseColor;

    if (uHasNormal > 0.5) {
      vec3 east = normalize(cross(uPole, Ng) + vec3(1e-5));
      vec3 north = cross(Ng, east);
      vec2 t = texture2D(uNormalMap, vUv).rg * 2.0 - 1.0;
      N = normalize(Ng + (east * t.x + north * t.y) * uNormalStrength);
    }

    float mu0 = dot(N, L);
    float mu = max(dot(N, V), 1e-3);
    float diffuse;
    if (uGas > 0.5) {
      // Soft terminator from the deep atmosphere, limb darkening toward the edge.
      diffuse = max((dot(Ng, L) + 0.05) / 1.05, 0.0) * mix(1.0, pow(mu, 0.32), 0.55);
    } else {
      // Regolith: blend Lambert with Lommel–Seeliger, which keeps the full disk evenly bright.
      float lambert = max(mu0, 0.0);
      float ls = mu0 > 0.0 ? 2.0 * mu0 / (mu0 + mu) : 0.0;
      diffuse = mix(lambert, ls * 0.6, 0.55) * smoothstep(-0.02, 0.06, dot(Ng, L));
    }

    float shadow = 1.0;
    if (uRing.z > 0.5) {
      float denom = dot(L, uPole);
      if (abs(denom) > 1e-4) {
        float t = dot(uCenter - vPosW, uPole) / denom;
        if (t > 0.0) {
          float u = (length(vPosW + L * t - uCenter) - uRing.x) / (uRing.y - uRing.x);
          if (u > 0.0 && u < 1.0) shadow *= 1.0 - texture2D(uRingMap, vec2(u, 0.5)).a * 0.88;
        }
      }
    }

    vec3 light = vec3(1.0, 0.97, 0.93) * uSunIntensity * diffuse * shadow;

    if (uEclipse > 0.5) {
      // Earth (origin, radius 1) casts umbra/penumbra cones; the umbra glows copper-red from
      // sunlight refracted through Earth's atmosphere.
      float s = dot(vPosW, uEarthSunDir);
      if (s < 0.0) {
        float d = length(vPosW - uEarthSunDir * s);
        float umbra = 1.0 + s * 0.00461;
        float penumbra = 1.0 - s * 0.00469;
        float k = smoothstep(umbra, penumbra, d);
        light *= mix(vec3(0.5, 0.14, 0.05) * 0.16, vec3(1.0), k * k);
      }
      float earthLit = 0.5 + 0.5 * dot(uEarthSunDir, normalize(uCenter));
      light += vec3(0.4, 0.52, 0.72) * 0.03 * earthLit * max(dot(N, normalize(-uCenter)), 0.0);
    }

    vec3 col = albedo * light + albedo * 0.002;

    if (uAtmo.a > 0.0) {
      float rim = pow(1.0 - max(dot(Ng, V), 0.0), 2.6);
      float lit = smoothstep(-0.3, 0.5, dot(Ng, L));
      col = mix(col, uAtmo.rgb * max(dot(Ng, L), 0.0) * uSunIntensity * 0.9, uAtmo.a * 0.3 * rim);
      col += uAtmo.rgb * rim * lit * uAtmo.a * 1.4 * shadow * uSunIntensity * 0.6;
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Planetary ring vertex shader (bundle `zy`). */
export const RING_VERTEX = /* glsl */ `
  varying float vU;
  varying vec3 vPosW;
  void main() {
    vU = uv.x;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/** Planetary ring fragment shader (bundle `By`). */
export const RING_FRAGMENT = /* glsl */ `
  uniform sampler2D uRingMap;
  uniform float uHasMap;
  uniform vec3 uSunPos;
  uniform vec3 uCenter;
  uniform vec3 uNormal;
  uniform float uPlanetRadius;
  uniform float uSunIntensity;
  varying float vU;
  varying vec3 vPosW;

  void main() {
    vec4 tex = uHasMap > 0.5 ? texture2D(uRingMap, vec2(vU, 0.5)) : vec4(0.8, 0.74, 0.62, 0.5 * smoothstep(0.0, 0.1, vU));
    if (tex.a < 0.01) discard;
    vec3 L = normalize(uSunPos - vPosW);
    vec3 V = normalize(cameraPosition - vPosW);
    float lDotN = dot(L, uNormal);
    bool litFace = lDotN * dot(V, uNormal) > 0.0;
    // Lit face: back-scattered sunlight. Unlit face: light diffusing through thin regions,
    // strongest when looking toward the Sun.
    float scatter = litFace ? 1.0 : (1.0 - tex.a) * (0.35 + 1.2 * pow(max(dot(-V, L), 0.0), 6.0));
    float elevation = 0.62 + 0.5 * sqrt(abs(lDotN));

    vec3 toC = uCenter - vPosW;
    float b = dot(toC, L);
    float sh = 1.0;
    if (b > 0.0) {
      float d2 = dot(toC, toC) - b * b;
      float r2 = uPlanetRadius * uPlanetRadius;
      sh = smoothstep(r2 * 0.94, r2 * 1.03, d2);
    }
    vec3 col = tex.rgb * scatter * elevation * sh * uSunIntensity * 1.05;
    gl_FragColor = vec4(col, tex.a * (litFace ? 1.0 : 0.9));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Flat annulus in the XZ plane with u = radial, v = angle (bundle `Vy`). */
function createRingGeometry(inner: number, outer: number, segments = 256): BufferGeometry {
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const uvs = new Float32Array((segments + 1) * 2 * 2);
  const index: number[] = [];
  for (let s = 0; s <= segments; s++) {
    const angle = (s / segments) * Math.PI * 2;
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    positions.set([c * inner, 0, sn * inner, c * outer, 0, sn * outer], s * 6);
    uvs.set([0, s / segments, 1, s / segments], s * 4);
    if (s < segments) {
      const base = s * 2;
      index.push(base, base + 1, base + 3, base, base + 3, base + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(`position`, new BufferAttribute(positions, 3));
  geometry.setAttribute(`uv`, new BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

/** Asteroid / Kuiper belt GPU-propagated point vertex shader (bundle `Hy`). */
export const BELT_VERTEX = /* glsl */ `
  attribute vec4 aElemA; // a [AU], e, i, node
  attribute vec4 aElemB; // argp, M0, size, shade
  uniform float uDays;
  uniform float uSunDistance;
  uniform float uPixelRatio;
  uniform mat3 uEclToScene;
  varying float vShade;

  void main() {
    float a = aElemA.x;
    float e = aElemA.y;
    float n = 6.283185307 / (365.25 * a * sqrt(a));
    float M = aElemB.y + n * uDays;
    float E = M + e * sin(M);
    E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
    E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
    float xv = a * (cos(E) - e);
    float yv = a * sqrt(1.0 - e * e) * sin(E);
    float cO = cos(aElemA.w), sO = sin(aElemA.w);
    float cw = cos(aElemB.x), sw = sin(aElemB.x);
    float ci = cos(aElemA.z), si = sin(aElemA.z);
    vec3 p = vec3(
      (cO * cw - sO * sw * ci) * xv + (-cO * sw - sO * cw * ci) * yv,
      (sO * cw + cO * sw * ci) * xv + (-sO * sw + cO * cw * ci) * yv,
      sw * si * xv + cw * si * yv
    );
    p = uEclToScene * p;
    float r = length(p);
    p *= uSunDistance * pow(r, 0.6) / r;
    vShade = aElemB.w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aElemB.z * uPixelRatio;
  }
`;

/** Belt point fragment shader (bundle `Uy`). */
export const BELT_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vShade;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.2, r) * uOpacity * vShade;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

/** Mulberry32 seeded PRNG (bundle `Wy`). */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 1831565813) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rayleigh-distributed sample with scale `sigma` (bundle `Gy`). */
const rayleigh = (rand: () => number, sigma: number): number => sigma * Math.sqrt(-2 * Math.log(1 - rand() * 0.999));

/** One belt object's elements, as packed into `aElemA` / `aElemB`. */
interface BeltSample {
  a: number;
  e: number;
  i: number;
  node: number;
  argp: number;
  M0: number;
  size: number;
  shade: number;
}

/** Packs `count` belt samples into a points geometry (bundle `qy`). */
function createBeltGeometry(count: number, sample: (index: number) => BeltSample): BufferGeometry {
  const elemA = new Float32Array(count * 4);
  const elemB = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const s = sample(i);
    elemA.set([s.a, s.e, s.i, s.node], i * 4);
    elemB.set([s.argp, s.M0, s.size, s.shade], i * 4);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(`position`, new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute(`aElemA`, new BufferAttribute(elemA, 4));
  geometry.setAttribute(`aElemB`, new BufferAttribute(elemB, 4));
  geometry.boundingSphere = new Sphere(new Vector3(), 1e6);
  return geometry;
}

/** Main belt (with Kirkwood gaps), Hildas and Jupiter Trojans (bundle `Jy`). */
function asteroidBeltSampler(rand: () => number, jupiterLongitude: number): (index: number) => BeltSample {
  const kirkwoodGaps: [number, number][] = [
    [2.502, 0.03],
    [2.825, 0.02],
    [2.958, 0.016],
    [3.279, 0.025],
  ];
  return (index) => {
    const node = rand() * Math.PI * 2;
    const argp = rand() * Math.PI * 2;
    const group = rand();
    let a: number;
    let e: number;
    let inc: number;
    let M0: number;
    if (group < 0.86) {
      do a = 2.1 + rand() * 1.2;
      while (kirkwoodGaps.some(([gap, width]) => Math.abs(a - gap) < width) && rand() < 0.92);
      e = Math.min(rayleigh(rand, 0.09), 0.32);
      inc = rayleigh(rand, 6.5) * DEG;
      M0 = rand() * Math.PI * 2;
    } else if (group < 0.9) {
      a = 3.7 + rand() * 0.45;
      e = 0.08 + rand() * 0.2;
      inc = rayleigh(rand, 7) * DEG;
      M0 = rand() * Math.PI * 2;
    } else {
      a = 5.2 + (rand() - 0.5) * 0.12;
      e = rand() * 0.12;
      inc = rayleigh(rand, 11) * DEG;
      M0 = jupiterLongitude + ((rand() < 0.55 ? 60 : -60) + (rand() - 0.5) * 34) * DEG - node - argp;
    }
    return {
      a,
      e,
      i: inc,
      node,
      argp,
      M0,
      size: 1.1 + rand() * 1.2 + (index % 97 == 0 ? 1.2 : 0),
      shade: 0.35 + rand() * 0.65,
    };
  };
}

/** Kuiper belt: plutinos (3:2 resonance) and classical objects (bundle `Yy`). */
function kuiperBeltSampler(rand: () => number): () => BeltSample {
  return () => {
    const plutino = rand() < 0.3;
    return {
      a: plutino ? 39.4 + (rand() - 0.5) * 0.8 : 42 + rand() * 6,
      e: plutino ? 0.05 + rand() * 0.25 : rand() * 0.12,
      i: rayleigh(rand, plutino ? 10 : 5) * DEG,
      node: rand() * Math.PI * 2,
      argp: rand() * Math.PI * 2,
      M0: rand() * Math.PI * 2,
      size: 1.2 + rand() * 1.3,
      shade: 0.3 + rand() * 0.7,
    };
  };
}

/** Distant-body marker point vertex shader (bundle `Xy`). */
export const MARKER_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aRadius;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float px = aRadius / max(-mv.z, 1e-3) * uScale;
    vAlpha = (1.0 - smoothstep(1.5, 4.5, px)) * uOpacity;
    vColor = aColor;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = vAlpha < 0.01 ? 0.0 : 9.0 * uPixelRatio;
  }
`;

/** Distant-body marker point fragment shader (bundle `Zy`). */
export const MARKER_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float i = exp(-r * r * 9.0) * 1.4 + smoothstep(1.0, 0.0, r) * 0.18;
    gl_FragColor = vec4(vColor * i * vAlpha, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpQuat = new Quaternion();
const tmpBasis = new Matrix4();
const moonX = new Vector3();
const moonY = new Vector3();
const moonZ = new Vector3();
const colorElements = emptyElements();
const ORBIT_SEGMENTS = 360;
const UP = new Vector3(0, 1, 0);

export type BodyUniforms = {
  uMap: IUniform<Texture | null>;
  uNormalMap: IUniform<Texture | null>;
  uRingMap: IUniform<Texture | null>;
  uBaseColor: IUniform<Color>;
  uSunPos: IUniform<Vector3>;
  uPole: IUniform<Vector3>;
  uCenter: IUniform<Vector3>;
  uEarthSunDir: IUniform<Vector3>;
  uAtmo: IUniform<Vector4>;
  uRing: IUniform<Vector4>;
  uHasMap: IUniform<number>;
  uHasNormal: IUniform<number>;
  uNormalStrength: IUniform<number>;
  uGas: IUniform<number>;
  uEclipse: IUniform<number>;
  uSunIntensity: IUniform<number>;
};

export type RingUniforms = {
  uRingMap: IUniform<Texture | null>;
  uHasMap: IUniform<number>;
  uSunPos: IUniform<Vector3>;
  uCenter: IUniform<Vector3>;
  uNormal: IUniform<Vector3>;
  uPlanetRadius: IUniform<number>;
  uSunIntensity: IUniform<number>;
};

export type BeltUniforms = {
  uDays: IUniform<number>;
  uSunDistance: IUniform<number>;
  uPixelRatio: IUniform<number>;
  uEclToScene: IUniform<Matrix3>;
  uOpacity: IUniform<number>;
  uColor: IUniform<Color>;
};

export type MarkerUniforms = {
  uScale: IUniform<number>;
  uPixelRatio: IUniform<number>;
  uOpacity: IUniform<number>;
};

export interface SolarRing {
  mesh: Mesh<BufferGeometry, ShaderMaterial>;
  geometry: BufferGeometry;
  material: ShaderMaterial;
  uniforms: RingUniforms;
  /** Outer ring radius, Earth radii. */
  outer: number;
}

/** Anything the camera can focus: the Sun, Earth or a `SolarBody`. */
export interface SolarFocusable {
  key: string;
  name: string;
  position: Vector3;
  /** Radius in scene units (Earth radii). */
  radius: number;
  def: Pick<BodyDef, "key" | "name" | "color">;
  mesh?: Mesh<SphereGeometry, ShaderMaterial>;
  ring?: SolarRing;
  pole?: Vector3;
}

/** A rendered planet or the Moon. */
export interface SolarBody extends SolarFocusable {
  def: BodyDef;
  mesh: Mesh<SphereGeometry, ShaderMaterial>;
  material: ShaderMaterial;
  uniforms: BodyUniforms;
  pole: Vector3;
  tier: QualityTier | null;
  loading: { tier: QualityTier; promise: Promise<void> } | null;
}

const isSolarBody = (body: SolarFocusable | undefined): body is SolarBody => !!body?.mesh;

export interface SolarUpdateParams {
  ms: number;
  camera: PerspectiveCamera;
  time: number;
  dt: number;
  earthZoom: number;
  flare: boolean;
}

/** Sun, planets, Moon, orbits, belts and distant markers (bundle `cb`). */
export class SolarSystem {
  renderer: WebGLRenderer;
  tier: QualityTier;
  anisotropy: number;
  group: Group;
  sphere: SphereGeometry;
  sunPosition: Vector3;
  sunDirection: Vector3;
  sunIntensity: IUniform<number>;
  sun: Sun;
  bodies: SolarBody[];
  byKey: Record<string, SolarFocusable>;
  earth: SolarFocusable;
  viewMix: { solar: number };
  orbitMaterial!: LineMaterial;
  orbitGeometry!: LineSegmentsGeometry;
  orbits!: LineSegments2;
  orbitKeys!: string[];
  orbitColors!: Float32Array;
  orbitBase!: Color[];
  orbitBuiltT!: number;
  orbitColorAt!: number;
  moonOrbitMaterial!: LineMaterial;
  moonOrbitGeometry!: LineSegmentsGeometry;
  moonOrbit!: LineSegments2;
  moonOrbitBuiltMs!: number;
  beltUniforms!: BeltUniforms;
  beltMaterial!: ShaderMaterial;
  kuiperUniforms!: BeltUniforms;
  kuiperMaterial!: ShaderMaterial;
  beltCount!: number;
  kuiperCount!: number;
  beltGeometry!: BufferGeometry;
  kuiperGeometry!: BufferGeometry;
  belt!: Points<BufferGeometry, ShaderMaterial>;
  kuiper!: Points<BufferGeometry, ShaderMaterial>;
  markerBodies!: SolarFocusable[];
  markerPositions!: BufferAttribute;
  markerUniforms!: MarkerUniforms;
  markerMaterial!: ShaderMaterial;
  markerGeometry!: BufferGeometry;
  markers!: Points<BufferGeometry, ShaderMaterial>;
  disposed?: boolean;
  _occluders?: Occluder[];

  constructor({ renderer, tier = `hi` }: { renderer: WebGLRenderer; tier?: QualityTier }) {
    this.renderer = renderer;
    this.tier = tier;
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.group = new Group();
    this.group.name = `SolarSystem`;
    this.sphere = new SphereGeometry(1, tier === `hi` ? 128 : 72, tier === `hi` ? 64 : 36);
    this.sunPosition = new Vector3();
    this.sunDirection = new Vector3(1, 0, 0);
    this.sunIntensity = { value: 1.45 };
    this.sun = new Sun({ geometry: this.sphere });
    this.group.add(this.sun.group);
    this.bodies = [];
    this.byKey = {};
    this.earth = {
      key: `earth`,
      name: `Tierra`,
      position: new Vector3(),
      radius: 1,
      def: { key: `earth`, name: `Tierra`, color: `#7fb4ff` },
    };
    this.byKey.earth = this.earth;
    this.byKey.sun = {
      key: `sun`,
      name: `Sol`,
      position: this.sunPosition,
      radius: 22,
      def: PLANET_DEFS[0],
    };
    for (const def of PLANET_DEFS) if (def.key !== `sun`) this.bodies.push(this.createBody(def));
    this.createOrbits();
    this.buildOrbits(julianCenturies(Date.now()));
    this.buildMoonOrbit(Date.now());
    this.createBelts();
    this.createMarkers();
    this.viewMix = { solar: 0 };
  }

  createBody(def: BodyDef): SolarBody {
    const radius = def.radiusKm / EARTH_RADIUS_KM;
    const uniforms: BodyUniforms = {
      uMap: { value: null },
      uNormalMap: { value: null },
      uRingMap: { value: null },
      uBaseColor: { value: new Color(def.color) },
      uSunPos: { value: this.sunPosition },
      uPole: { value: new Vector3() },
      uCenter: { value: new Vector3() },
      uEarthSunDir: { value: this.sunDirection },
      uAtmo: { value: new Vector4(...(def.atmosphere ?? [0, 0, 0, 0])) },
      uRing: { value: new Vector4() },
      uHasMap: { value: 0 },
      uHasNormal: { value: 0 },
      uNormalStrength: { value: 0.9 },
      uGas: { value: +!!def.gas },
      uEclipse: { value: +(def.key === `moon`) },
      uSunIntensity: this.sunIntensity,
    };
    uniforms.uBaseColor.value.convertSRGBToLinear();
    const material = new ShaderMaterial({ uniforms, vertexShader: BODY_VERTEX, fragmentShader: BODY_FRAGMENT });
    const mesh = new Mesh(this.sphere, material);
    mesh.name = def.key;
    mesh.scale.setScalar(radius);
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    const pole = poleVector(def.pole![0], def.pole![1], new Vector3());
    uniforms.uPole.value.copy(pole);
    const body: SolarBody = {
      key: def.key,
      name: def.name,
      def,
      radius,
      mesh,
      material,
      uniforms,
      pole,
      position: uniforms.uCenter.value,
      tier: null,
      loading: null,
    };
    if (def.rings) {
      const inner = def.rings.innerKm / EARTH_RADIUS_KM;
      const outer = def.rings.outerKm / EARTH_RADIUS_KM;
      uniforms.uRing.value.set(inner, outer, 1, 0);
      const ringUniforms: RingUniforms = {
        uRingMap: uniforms.uRingMap,
        uHasMap: { value: 0 },
        uSunPos: { value: this.sunPosition },
        uCenter: uniforms.uCenter,
        uNormal: { value: pole },
        uPlanetRadius: { value: radius },
        uSunIntensity: this.sunIntensity,
      };
      const ringGeometry = createRingGeometry(inner, outer);
      const ringMaterial = new ShaderMaterial({
        uniforms: ringUniforms,
        vertexShader: RING_VERTEX,
        fragmentShader: RING_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      });
      const ringMesh = new Mesh(ringGeometry, ringMaterial);
      ringMesh.quaternion.setFromUnitVectors(UP, pole);
      ringMesh.matrixAutoUpdate = false;
      this.group.add(ringMesh);
      body.ring = {
        mesh: ringMesh,
        geometry: ringGeometry,
        material: ringMaterial,
        uniforms: ringUniforms,
        outer,
      };
    }
    this.byKey[def.key] = body;
    return body;
  }

  createOrbits(): void {
    this.orbitMaterial = new LineMaterial({
      linewidth: 1.4,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      worldUnits: false,
    });
    this.orbitMaterial.resolution.set(window.innerWidth, window.innerHeight);
    this.orbitGeometry = new LineSegmentsGeometry();
    this.orbits = new LineSegments2(this.orbitGeometry, this.orbitMaterial);
    this.orbits.frustumCulled = false;
    this.orbits.visible = false;
    this.group.add(this.orbits);
    this.orbitKeys = ORBIT_KEYS;
    this.orbitColors = new Float32Array(this.orbitKeys.length * ORBIT_SEGMENTS * 6);
    this.orbitBase = this.orbitKeys.map(
      (key) => new Color(key === `earth` ? `#7fb4ff` : PLANET_DEFS.find((def) => def.key === key)!.color),
    );
    this.orbitBuiltT = NaN;
    this.orbitColorAt = 0;
    this.moonOrbitMaterial = new LineMaterial({
      linewidth: 1.2,
      color: 0x9fb4cc,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.moonOrbitMaterial.resolution.set(window.innerWidth, window.innerHeight);
    this.moonOrbitGeometry = new LineSegmentsGeometry();
    this.moonOrbit = new LineSegments2(this.moonOrbitGeometry, this.moonOrbitMaterial);
    this.moonOrbit.frustumCulled = false;
    this.moonOrbit.visible = false;
    this.moonOrbitBuiltMs = NaN;
    this.group.add(this.moonOrbit);
  }

  buildOrbits(T: number): void {
    const obliquity = eclipticObliquity(J2000_MS + T * 36525 * 864e5);
    const positions = new Float32Array(this.orbitKeys.length * ORBIT_SEGMENTS * 6);
    const a = new Vector3();
    const b = new Vector3();
    this.orbitKeys.forEach((key, k) => {
      const el = planetElements(key, T, emptyElements());
      for (let s = 0; s < ORBIT_SEGMENTS; s++) {
        elementsToScene(el, (s / ORBIT_SEGMENTS) * Math.PI * 2, obliquity, a);
        elementsToScene(el, ((s + 1) / ORBIT_SEGMENTS) * Math.PI * 2, obliquity, b);
        a.multiplyScalar(compressDistance(a.length()) / a.length());
        b.multiplyScalar(compressDistance(b.length()) / b.length());
        positions.set([a.x, a.y, a.z, b.x, b.y, b.z], (k * ORBIT_SEGMENTS + s) * 6);
      }
    });
    this.orbitGeometry.setPositions(positions);
    this.orbitGeometry.setColors(this.orbitColors);
    this.orbitBuiltT = T;
  }

  updateOrbitColors(T: number): void {
    const colors = this.orbitColors;
    this.orbitKeys.forEach((key, k) => {
      const phase = planetElements(key, T, colorElements).M / (Math.PI * 2);
      const base = this.orbitBase[k];
      for (let s = 0; s < ORBIT_SEGMENTS; s++)
        for (let end = 0; end < 2; end++) {
          const intensity = 0.07 + 0.75 * (1 - ((((phase - (s + end) / ORBIT_SEGMENTS) % 1) + 1) % 1)) ** 5;
          const offset = (k * ORBIT_SEGMENTS + s) * 6 + end * 3;
          colors[offset] = base.r * intensity;
          colors[offset + 1] = base.g * intensity;
          colors[offset + 2] = base.b * intensity;
        }
    });
    const attr = this.orbitGeometry.attributes.instanceColorStart as InterleavedBufferAttribute | undefined;
    if (attr) {
      attr.data.array.set(colors);
      attr.data.needsUpdate = true;
    }
  }

  buildMoonOrbit(ms: number): void {
    const span = 2360448e3;
    const positions = new Float32Array(768);
    const a = new Vector3();
    const b = new Vector3();
    for (let s = 0; s < 128; s++) {
      moonPosition(ms + (s / 128 - 0.5) * span, a);
      moonPosition(ms + ((s + 1) / 128 - 0.5) * span, b);
      positions.set([a.x, a.y, a.z, b.x, b.y, b.z], s * 6);
    }
    this.moonOrbitGeometry.setPositions(positions);
    this.moonOrbitBuiltMs = ms;
  }

  createBelts(): void {
    const rand = mulberry32(20261030);
    const jupiterLongitude = (34.39644051 * Math.PI) / 180;
    const hi = this.tier === `hi`;
    this.beltUniforms = {
      uDays: { value: 0 },
      uSunDistance: { value: SOLAR_DISTANCE_SCALE },
      uPixelRatio: { value: 1 },
      uEclToScene: { value: new Matrix3() },
      uOpacity: { value: 0 },
      uColor: { value: new Color(`#c9b69a`) },
    };
    const obliquity = eclipticObliquity(J2000_MS);
    const c = Math.cos(obliquity);
    const s = Math.sin(obliquity);
    this.beltUniforms.uEclToScene.value.set(1, 0, 0, 0, s, c, 0, -c, s);
    this.beltMaterial = new ShaderMaterial({
      uniforms: this.beltUniforms,
      vertexShader: BELT_VERTEX,
      fragmentShader: BELT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.kuiperUniforms = {
      ...this.beltUniforms,
      uColor: { value: new Color(`#9fb0c8`) },
      uOpacity: this.beltUniforms.uOpacity,
    };
    this.kuiperMaterial = new ShaderMaterial({
      uniforms: this.kuiperUniforms,
      vertexShader: BELT_VERTEX,
      fragmentShader: BELT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.beltCount = hi ? 18e3 : 8e3;
    this.kuiperCount = hi ? 1e4 : 4e3;
    this.beltGeometry = createBeltGeometry(this.beltCount, asteroidBeltSampler(rand, jupiterLongitude));
    this.kuiperGeometry = createBeltGeometry(this.kuiperCount, kuiperBeltSampler(rand));
    this.belt = new Points(this.beltGeometry, this.beltMaterial);
    this.kuiper = new Points(this.kuiperGeometry, this.kuiperMaterial);
    this.belt.visible = this.kuiper.visible = false;
    this.belt.matrixAutoUpdate = this.kuiper.matrixAutoUpdate = false;
    this.group.add(this.belt, this.kuiper);
  }

  createMarkers(): void {
    const bodies: SolarFocusable[] = [this.earth, ...this.bodies];
    this.markerBodies = bodies;
    const geometry = new BufferGeometry();
    const colors = new Float32Array(bodies.length * 3);
    const radii = new Float32Array(bodies.length);
    bodies.forEach((body, i) => {
      const color = new Color(body.def.color);
      colors.set([color.r, color.g, color.b], i * 3);
      radii[i] = body.radius;
    });
    this.markerPositions = new BufferAttribute(new Float32Array(bodies.length * 3), 3);
    this.markerPositions.setUsage(DynamicDrawUsage);
    geometry.setAttribute(`position`, this.markerPositions);
    geometry.setAttribute(`aColor`, new BufferAttribute(colors, 3));
    geometry.setAttribute(`aRadius`, new BufferAttribute(radii, 1));
    this.markerUniforms = {
      uScale: { value: 500 },
      uPixelRatio: { value: 1 },
      uOpacity: { value: 1 },
    };
    this.markerMaterial = new ShaderMaterial({
      uniforms: this.markerUniforms,
      vertexShader: MARKER_VERTEX,
      fragmentShader: MARKER_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.markerGeometry = geometry;
    this.markers = new Points(geometry, this.markerMaterial);
    this.markers.frustumCulled = false;
    this.group.add(this.markers);
  }

  async loadTextures(): Promise<void> {
    const sunMap = loadTexture(this.renderer, assetUrl(`space/lo/sun.jpg`), {
      anisotropy: 2,
    });
    const bodyLoads = this.bodies.map((body) => this.loadBodyTier(body, `lo`));
    this.sun.setMap(await sunMap);
    await Promise.all(bodyLoads);
  }

  loadBodyTier(body: SolarBody, tier: QualityTier): Promise<void> {
    if (body.tier === tier || (body.tier === `hi` && tier === `lo`)) return Promise.resolve();
    if (body.loading?.tier === tier) return body.loading.promise;
    const options = { anisotropy: this.anisotropy };
    const loads = [loadTexture(this.renderer, assetUrl(`space/${tier}/${body.key}.jpg`), options)];
    if (body.def.normalMap)
      loads.push(
        loadTexture(this.renderer, assetUrl(`space/${tier}/moon-normal.jpg`), {
          ...options,
          srgb: false,
        }),
      );
    if (body.def.rings)
      loads.push(
        loadTexture(this.renderer, assetUrl(`space/${tier}/saturn-ring.png`), {
          ...options,
          mipmaps: true,
        }),
      );
    const promise = Promise.all(loads).then(([map, ...extra]) => {
      if (this.disposed) {
        map.dispose();
        extra.forEach((texture) => texture.dispose());
        return;
      }
      const uniforms = body.uniforms;
      uniforms.uMap.value?.dispose();
      uniforms.uMap.value = map;
      uniforms.uHasMap.value = 1;
      let next = 0;
      if (body.def.normalMap) {
        uniforms.uNormalMap.value?.dispose();
        uniforms.uNormalMap.value = extra[next++];
        uniforms.uHasNormal.value = 1;
        uniforms.uNormalStrength.value = tier === `hi` ? 0.85 : 0.75;
      }
      if (body.def.rings) {
        const ringMap = extra[next++];
        ringMap.wrapS = ClampToEdgeWrapping;
        ringMap.colorSpace = SRGBColorSpace;
        uniforms.uRingMap.value?.dispose();
        uniforms.uRingMap.value = ringMap;
        body.ring!.uniforms.uHasMap.value = 1;
      }
      body.tier = tier;
      body.loading = null;
    });
    body.loading = { tier, promise };
    return promise;
  }

  upgrade(key: string): Promise<void> {
    if (this.tier !== `hi`) return Promise.resolve();
    const body = this.byKey[key];
    return isSolarBody(body) ? this.loadBodyTier(body, `hi`) : Promise.resolve();
  }

  updatePositions(ms: number, sunDir: Vector3): void {
    this.sunDirection.copy(sunDir);
    heliocentricPosition(`earth`, ms, tmpA);
    this.sunPosition.copy(sunDir).multiplyScalar(compressDistance(tmpA.length()));
    this.sun.setPosition(this.sunPosition);
    this.orbits.position.copy(this.sunPosition);
    this.belt.position.copy(this.sunPosition);
    this.kuiper.position.copy(this.sunPosition);
    this.belt.updateMatrix();
    this.kuiper.updateMatrix();
    const hours = (ms - J2000_MS) / 36e5;
    for (const body of this.bodies) {
      if (body.key === `moon`) {
        // Tidally locked: the near side (local +x) faces Earth, local +y is the pole.
        moonPosition(ms, body.position);
        moonX.copy(body.position).negate().normalize();
        moonY.copy(body.pole);
        moonX.addScaledVector(moonY, -moonX.dot(moonY)).normalize();
        moonZ.crossVectors(moonX, moonY);
        tmpBasis.makeBasis(moonX, moonY, moonZ);
        body.mesh.quaternion.setFromRotationMatrix(tmpBasis);
      } else {
        heliocentricPosition(body.key, ms, tmpB);
        compressHeliocentric(tmpB, this.sunPosition, body.position);
        tmpQuat.setFromUnitVectors(UP, body.pole);
        const spin = ((hours / body.def.dayHours!) % 1) * Math.PI * 2;
        body.mesh.quaternion.setFromAxisAngle(UP, spin).premultiply(tmpQuat);
      }
      body.mesh.position.copy(body.position);
      body.mesh.updateMatrix();
      if (body.ring) {
        body.ring.mesh.position.copy(body.position);
        body.ring.mesh.updateMatrix();
      }
    }
    const markerArray = this.markerPositions.array;
    this.markerBodies.forEach((body, i) => markerArray.set([body.position.x, body.position.y, body.position.z], i * 3));
    this.markerPositions.needsUpdate = true;
    this.beltUniforms.uDays.value = (ms - J2000_MS) / MS_PER_DAY;
  }

  update({ ms, camera, time, dt, earthZoom, flare }: SolarUpdateParams): void {
    const solar = this.viewMix.solar;
    const T = julianCenturies(ms);
    const showSolar = solar > 0.01;
    this.orbits.visible = showSolar;
    this.belt.visible = this.kuiper.visible = showSolar;
    if (showSolar) {
      if (!(Math.abs(T - this.orbitBuiltT) < 0.05)) this.buildOrbits(T);
      if (time - this.orbitColorAt > 1 / 15) {
        this.updateOrbitColors(T);
        this.orbitColorAt = time;
      }
      let nearest = Infinity;
      for (const body of this.bodies)
        nearest = Math.min(nearest, camera.position.distanceTo(body.position) / body.radius);
      this.orbitMaterial.opacity = solar * (0.18 + 0.82 * MathUtils.smoothstep(nearest, 10, 60));
      this.beltUniforms.uOpacity.value = solar * 0.5;
    }
    const moonOrbitOpacity = earthZoom * (1 - solar) * 0.4 + solar * 0.25;
    this.moonOrbit.visible = moonOrbitOpacity > 0.01;
    if (this.moonOrbit.visible) {
      if (!(Math.abs(ms - this.moonOrbitBuiltMs) < 216e5)) this.buildMoonOrbit(ms);
      this.moonOrbitMaterial.opacity = moonOrbitOpacity;
    }
    this.sun.update(camera, this.occluders(), time, dt, flare);
  }

  occluders(): Occluder[] {
    this._occluders ||= [
      { position: this.earth.position, radius: 1.012 },
      ...this.bodies.map((body) => ({
        position: body.position,
        radius: body.radius,
      })),
    ];
    return this._occluders;
  }

  setDetail(detail: number): void {
    const t = MathUtils.clamp(detail, 0.35, 1);
    this.beltGeometry.setDrawRange(0, Math.round(this.beltCount * t));
    this.kuiperGeometry.setDrawRange(0, Math.round(this.kuiperCount * t));
  }

  setViewport(width: number, height: number, fov: number, pixelRatio: number): void {
    const scale = (height * 0.5) / Math.tan(MathUtils.degToRad(fov) * 0.5);
    this.markerUniforms.uScale.value = scale;
    this.markerUniforms.uPixelRatio.value = pixelRatio;
    this.beltUniforms.uPixelRatio.value = pixelRatio;
    this.orbitMaterial.resolution.set(width, height);
    this.moonOrbitMaterial.resolution.set(width, height);
  }

  get focusables(): SolarFocusable[] {
    return [this.byKey.sun, this.earth, ...this.bodies];
  }

  /** Screen-space pick (CSS px) of the nearest focusable within `radiusPx` of its disk. */
  pick(
    x: number,
    y: number,
    camera: PerspectiveCamera,
    width: number,
    height: number,
    radiusPx = 16,
  ): SolarFocusable | null {
    let best: SolarFocusable | null = null;
    let bestDistance = Infinity;
    const scale = (height * 0.5) / Math.tan(MathUtils.degToRad(camera.fov) * 0.5);
    for (const body of this.focusables) {
      tmpA.copy(body.position).applyMatrix4(camera.matrixWorldInverse);
      if (tmpA.z > -0.001) continue;
      const depth = -tmpA.z;
      tmpA.applyMatrix4(camera.projectionMatrix);
      const sx = (tmpA.x * 0.5 + 0.5) * width;
      const sy = (0.5 - tmpA.y * 0.5) * height;
      const diskPx = (body.radius / depth) * scale;
      const distance = Math.hypot(sx - x, sy - y) - diskPx;
      if (distance < radiusPx && distance < bestDistance) {
        bestDistance = distance;
        best = body;
      }
    }
    return best;
  }

  distanceFromEarthKm(key: string, ms: number): number {
    if (key === `earth`) return 0;
    if (key === `moon`) return moonPosition(ms, tmpA).length() * EARTH_RADIUS_KM;
    heliocentricPosition(`earth`, ms, tmpB);
    if (key === `sun`) return tmpB.length() * AU_KM;
    heliocentricPosition(key, ms, tmpA);
    return tmpA.sub(tmpB).length() * AU_KM;
  }

  dispose(): void {
    this.disposed = true;
    this.sun.dispose();
    this.sphere.dispose();
    for (const body of this.bodies) {
      body.material.dispose();
      body.uniforms.uMap.value?.dispose();
      body.uniforms.uNormalMap.value?.dispose();
      body.uniforms.uRingMap.value?.dispose();
      if (body.ring) {
        body.ring.geometry.dispose();
        body.ring.material.dispose();
      }
    }
    this.orbitGeometry.dispose();
    this.orbitMaterial.dispose();
    this.moonOrbitGeometry.dispose();
    this.moonOrbitMaterial.dispose();
    this.beltGeometry.dispose();
    this.kuiperGeometry.dispose();
    this.beltMaterial.dispose();
    this.kuiperMaterial.dispose();
    this.markerGeometry.dispose();
    this.markerMaterial.dispose();
  }
}
