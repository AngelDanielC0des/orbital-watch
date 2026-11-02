import { BufferAttribute, BufferGeometry } from "three";
import type { BodyDef } from "@/types/orbital";

/** Sun, planets and the Moon (bundle `Qv`). Order matters: index 0 is the Sun. */
export const PLANET_DEFS: BodyDef[] = [
  {
    key: `sun`,
    name: `Sol`,
    kind: `Estrella · tipo G2V`,
    radiusKm: 696340,
    pole: [286.13, 63.87],
    dayHours: 609.12,
    color: `#ffd9a0`,
    facts: {
      gravity: `274 m/s²`,
      temperature: `5 500 °C en superficie`,
      moons: `8`,
    },
  },
  {
    key: `mercury`,
    name: `Mercurio`,
    kind: `Planeta rocoso`,
    radiusKm: 2439.7,
    pole: [281.01, 61.41],
    dayHours: 1407.6,
    yearDays: 87.97,
    color: `#b8aa9c`,
    facts: { gravity: `3,7 m/s²`, temperature: `−173 a 427 °C`, moons: `0` },
  },
  {
    key: `venus`,
    name: `Venus`,
    kind: `Planeta rocoso`,
    radiusKm: 6051.8,
    pole: [272.76, 67.16],
    dayHours: -96,
    yearDays: 224.7,
    color: `#f2d8a2`,
    atmosphere: [1, 0.86, 0.6, 0.55],
    facts: { gravity: `8,9 m/s²`, temperature: `464 °C`, moons: `0` },
  },
  {
    key: `moon`,
    name: `Luna`,
    kind: `Satélite natural de la Tierra`,
    radiusKm: 1737.4,
    pole: [266.86, 65.64],
    color: `#d8d4cc`,
    normalMap: true,
    facts: { gravity: `1,62 m/s²`, temperature: `−173 a 127 °C`, moons: `—` },
  },
  {
    key: `mars`,
    name: `Marte`,
    kind: `Planeta rocoso`,
    radiusKm: 3389.5,
    pole: [317.68, 52.89],
    dayHours: 24.623,
    yearDays: 686.98,
    color: `#e07a4f`,
    atmosphere: [0.95, 0.62, 0.42, 0.22],
    facts: {
      gravity: `3,7 m/s²`,
      temperature: `−65 °C de media`,
      moons: `2`,
    },
  },
  {
    key: `jupiter`,
    name: `Júpiter`,
    kind: `Gigante gaseoso`,
    radiusKm: 69911,
    pole: [268.06, 64.5],
    dayHours: 9.925,
    yearDays: 4332.6,
    color: `#e3c7a6`,
    atmosphere: [0.95, 0.85, 0.72, 0.3],
    gas: true,
    facts: {
      gravity: `24,8 m/s²`,
      temperature: `−110 °C en las nubes`,
      moons: `95`,
    },
  },
  {
    key: `saturn`,
    name: `Saturno`,
    kind: `Gigante gaseoso`,
    radiusKm: 58232,
    pole: [40.59, 83.54],
    dayHours: 10.656,
    yearDays: 10759,
    color: `#ecd9a8`,
    atmosphere: [0.98, 0.9, 0.7, 0.28],
    gas: true,
    rings: { innerKm: 74500, outerKm: 140220 },
    facts: {
      gravity: `10,4 m/s²`,
      temperature: `−140 °C en las nubes`,
      moons: `146`,
    },
  },
  {
    key: `uranus`,
    name: `Urano`,
    kind: `Gigante helado`,
    radiusKm: 25362,
    pole: [257.31, -15.18],
    dayHours: -17.24,
    yearDays: 30687,
    color: `#a9e2e8`,
    atmosphere: [0.62, 0.9, 0.95, 0.45],
    gas: true,
    facts: { gravity: `8,7 m/s²`, temperature: `−195 °C`, moons: `28` },
  },
  {
    key: `neptune`,
    name: `Neptuno`,
    kind: `Gigante helado`,
    radiusKm: 24622,
    pole: [299.36, 43.46],
    dayHours: 16.11,
    yearDays: 60190,
    color: `#6f8ff0`,
    atmosphere: [0.42, 0.6, 1, 0.5],
    gas: true,
    facts: { gravity: `11,2 m/s²`, temperature: `−200 °C`, moons: `16` },
  },
];

/** Earth (bundle `$v`); not part of `PLANET_DEFS` because Earth is rendered by `Earth`. */
export const EARTH_DEF: BodyDef = {
  key: `earth`,
  name: `Tierra`,
  kind: `Planeta rocoso · nuestro hogar`,
  radiusKm: 6371,
  dayHours: 23.934,
  yearDays: 365.26,
  color: `#7fb4ff`,
  facts: { gravity: `9,8 m/s²`, temperature: `15 °C de media`, moons: `1` },
};

/** Every body definition by key (bundle `ey`). */
export const BODY_DEFS: Record<string, BodyDef> = Object.fromEntries(
  [...PLANET_DEFS, EARTH_DEF].map((def) => [def.key, def]),
);

/** 3D simplex noise (Ashima / Stefan Gustavson), bundle `ty`. */
export const SIMPLEX_NOISE_GLSL = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;

/** Dave Hoskins' hash functions, bundle `ny`. */
export const HASH_GLSL = /* glsl */ `
  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }
  vec2 hash21(float p) {
    vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.103, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }
  vec3 hash31(float p) {
    vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.103, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xxy + p3.yzz) * p3.zyx);
  }
`;

/** Sun surface vertex shader (bundle `ry`). */
export const SUN_SURFACE_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec2 vUv;
  void main() {
    vLocal = position;
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/** Sun surface fragment shader: granulation + limb darkening (bundle `iy`). */
export const SUN_SURFACE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uTime;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec2 vUv;
  ${SIMPLEX_NOISE_GLSL}

  void main() {
    vec3 V = normalize(cameraPosition - vPosW);
    float mu = clamp(dot(normalize(vNormalW), V), 0.0, 1.0);
    vec3 p = normalize(vLocal);

    float tex = uHasMap > 0.5 ? dot(texture2D(uMap, vUv).rgb, vec3(0.3, 0.55, 0.15)) : 0.6;
    float cells = snoise(p * 26.0 + vec3(0.0, uTime * 0.04, 0.0)) * 0.5 + 0.5;
    float fine = snoise(p * 90.0 - vec3(uTime * 0.09)) * 0.5 + 0.5;
    float gran = tex * 0.65 + cells * 0.25 + fine * 0.1;

    // Eddington-like limb darkening; colour cools toward the limb.
    float limb = 1.0 - 0.6 * (1.0 - mu) - 0.22 * pow(1.0 - mu, 2.0);
    vec3 hot = vec3(1.0, 0.88, 0.66);
    vec3 cool = vec3(1.0, 0.36, 0.07);
    vec3 col = mix(cool, hot, smoothstep(0.1, 0.95, limb)) * (1.6 + 3.2 * limb) * (0.7 + 0.6 * gran);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Camera-facing corona billboard vertex shader (bundle `ay`). */
export const SUN_CORONA_VERTEX = /* glsl */ `
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

/** Corona / far-sun glow fragment shader (bundle `oy`). */
export const SUN_CORONA_FRAGMENT = /* glsl */ `
  uniform float uSize;
  uniform float uRadius;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uFar;
  varying vec2 vP;
  ${SIMPLEX_NOISE_GLSL}

  void main() {
    float r = length(vP) * uSize / uRadius;
    if (r < 0.98 && uFar < 0.5) discard;
    float a = atan(vP.y, vP.x);
    vec2 dir = vec2(cos(a), sin(a));
    float rays = snoise(vec3(dir * 3.2, uTime * 0.025)) * 0.5 + 0.5;
    rays = mix(rays, snoise(vec3(dir * 9.0, uTime * 0.04 + 7.0)) * 0.5 + 0.5, 0.4);
    float x = max(r - 1.0, 0.0);
    float inner = exp(-x * 5.5);
    float outer = exp(-x * 0.9) * (0.35 + 0.9 * pow(rays, 2.2));
    float halo = 0.6 / (1.0 + x * x * 2.5);
    float lp = length(vP);
    float edge = smoothstep(1.0, 0.82, lp);
    vec3 col = vec3(1.0, 0.72, 0.42) * inner * 2.6 + vec3(1.0, 0.82, 0.62) * outer * 0.5 + vec3(1.0, 0.6, 0.35) * halo * 0.22;
    // Distant sun: a screen-sized glow so it still reads as the brightest thing in the sky.
    col += vec3(1.0, 0.8, 0.58) * (exp(-lp * 9.0) * 0.9 + exp(-lp * 40.0) * 2.4) * uFar;
    gl_FragColor = vec4(col * edge * uIntensity, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Screen-space lens flare ghost vertex shader (bundle `sy`). */
export const LENS_FLARE_VERTEX = /* glsl */ `
  attribute vec4 aGhost; // t along axis, size, type, unused
  attribute vec3 aTint;
  uniform vec2 uSun;
  uniform float uAspect;
  varying vec2 vP;
  varying vec3 vTint;
  varying float vType;
  void main() {
    vP = position.xy;
    vTint = aTint;
    vType = aGhost.z;
    vec2 c = mix(uSun, -uSun, aGhost.x);
    vec2 size = aGhost.z > 0.5 && aGhost.z < 1.5 ? vec2(aGhost.y, aGhost.y * 0.025) : vec2(aGhost.y);
    gl_Position = vec4(c + position.xy * size * vec2(1.0 / uAspect, 1.0), 0.0, 1.0);
  }
`;

/** Lens flare ghost fragment shader (bundle `cy`). */
export const LENS_FLARE_FRAGMENT = /* glsl */ `
  uniform float uStrength;
  varying vec2 vP;
  varying vec3 vTint;
  varying float vType;
  void main() {
    float r = length(vP);
    float i;
    if (vType < 0.5) {
      i = exp(-r * 5.0) * 0.9 + exp(-r * 18.0) * 1.4;
    } else if (vType < 1.5) {
      i = exp(-abs(vP.x) * 3.2) * exp(-vP.y * vP.y * 14.0) * 0.55;
    } else if (vType < 2.5) {
      i = smoothstep(1.0, 0.7, r) * (0.25 + 0.75 * smoothstep(0.4, 0.95, r)) * 0.16;
    } else {
      vec2 q = abs(vP);
      float hex = max(q.x * 0.866 + q.y * 0.5, q.y);
      i = smoothstep(0.92, 0.82, hex) * 0.1;
    }
    gl_FragColor = vec4(vTint * i * uStrength, 1.0);
  }
`;

/** One lens-flare element: [t along the sun→anti-sun axis, size, type, rgb tint]. */
export type LensFlareGhost = [number, number, number, [number, number, number]];

/** Lens flare elements (bundle `ly`). Type 0 = glow, 1 = streak, 2 = ring, 3 = hexagon. */
export const LENS_FLARE_GHOSTS: LensFlareGhost[] = [
  [0, 0.55, 0, [1, 0.82, 0.6]],
  [0, 1.4, 1, [0.75, 0.86, 1]],
  [0.42, 0.07, 3, [0.5, 0.75, 1]],
  [0.62, 0.16, 2, [1, 0.6, 0.4]],
  [0.8, 0.05, 3, [0.6, 1, 0.7]],
  [1.08, 0.24, 2, [0.5, 0.6, 1]],
  [1.32, 0.09, 3, [1, 0.75, 0.5]],
  [1.6, 0.36, 2, [0.55, 0.8, 1]],
];

/** Builds the quad batch for the lens flare ghosts (bundle `uy`). */
export function createLensFlareGeometry(): BufferGeometry {
  const count = LENS_FLARE_GHOSTS.length;
  const positions = new Float32Array(count * 4 * 3);
  const ghosts = new Float32Array(count * 4 * 4);
  const tints = new Float32Array(count * 4 * 3);
  const index: number[] = [];
  const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
  LENS_FLARE_GHOSTS.forEach(([t, size, type, tint], ghost) => {
    for (let corner = 0; corner < 4; corner++) {
      const vertex = ghost * 4 + corner;
      positions.set([corners[corner * 2], corners[corner * 2 + 1], 0], vertex * 3);
      ghosts.set([t, size, type, 0], vertex * 4);
      tints.set(tint, vertex * 3);
    }
    const base = ghost * 4;
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute(`position`, new BufferAttribute(positions, 3));
  geometry.setAttribute(`aGhost`, new BufferAttribute(ghosts, 4));
  geometry.setAttribute(`aTint`, new BufferAttribute(tints, 3));
  geometry.setIndex(index);
  return geometry;
}
