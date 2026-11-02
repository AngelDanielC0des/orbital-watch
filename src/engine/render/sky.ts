import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LinearFilter,
  MathUtils,
  Mesh,
  NoColorSpace,
  Points,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  TextureLoader,
  type Texture,
} from "three";

import { assetUrl, type QualityTier } from "@/engine/config";

const SKY_CLIP_GLSL = `
  vec4 skyClip(vec3 dir) {
    vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * dir, 1.0);
    return clip.xyww;
  }
`;

const GLOW_VERTEX = `
  ${SKY_CLIP_GLSL}
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = skyClip(position);
  }
`;

const GLOW_FRAGMENT = `
  uniform sampler2D uMap;
  uniform float uIntensity;
  varying vec3 vDir;
  const float PI = 3.141592653589793;

  void main() {
    vec3 d = normalize(vDir);
    // Scene (x, y, z) = ECI (x, z, −y).
    float ra = atan(-d.z, d.x);
    float dec = asin(clamp(d.y, -1.0, 1.0));
    vec2 uv = vec2(fract(0.5 - ra / (2.0 * PI)), 0.5 + dec / PI);
    vec3 t = textureLod(uMap, uv, 0.0).rgb;
    vec3 glow = pow(t, vec3(2.2)) / 2.2;
    // Seen from orbit the band reads cooler and less dusty than in ground photographs.
    float l = dot(glow, vec3(0.2126, 0.7152, 0.0722));
    glow = mix(vec3(l), glow, 0.55) * vec3(0.92, 0.96, 1.08);
    gl_FragColor = vec4(glow * uIntensity, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const STAR_VERTEX = `
  ${SKY_CLIP_GLSL}
  attribute vec3 aColor;
  attribute float aFlux;
  uniform float uPixelRatio;
  uniform float uIntensity;
  varying vec3 vColor;
  varying float vSigma;
  varying float vSpike;
  varying float vSize;

  void main() {
    gl_Position = skyClip(normalize(position));
    float flux = aFlux * uIntensity;
    // Faint stars keep a fixed PSF and dim; bright ones saturate the core and grow a halo.
    float grow = max(1.0, pow(flux, 0.3));
    vSigma = 0.62 * grow;
    vSpike = smoothstep(2.5, 9.0, flux);
    vSize = (3.4 * vSigma + vSpike * 16.0) * 2.0;
    gl_PointSize = vSize * uPixelRatio;
    vColor = aColor * min(flux, 1.6);
  }
`;

const STAR_FRAGMENT = `
  varying vec3 vColor;
  varying float vSigma;
  varying float vSpike;
  varying float vSize;

  void main() {
    vec2 p = (gl_PointCoord - 0.5) * vSize;
    float r2 = dot(p, p);
    float core = exp(-r2 / (2.0 * vSigma * vSigma));
    float spikes = 0.0;
    if (vSpike > 0.0) {
      vec2 a = abs(p);
      spikes = (exp(-a.x * 1.6) * exp(-a.y * 0.16) + exp(-a.y * 1.6) * exp(-a.x * 0.16)) * 0.35 * vSpike;
      spikes *= smoothstep(vSize * 0.5, vSize * 0.2, length(p));
    }
    float i = core + spikes;
    if (i < 0.004) discard;
    gl_FragColor = vec4(vColor * i, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** B−V colour index → normalised, saturation-boosted star colour (Ballesteros temperature + blackbody fit). */
function starColorFromBV(bv: number, out: Color): Color {
  const t = (4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * (t - 60) ** -0.1332047592;
    g = 288.1221695283 * (t - 60) ** -0.0755148492;
    b = 255;
  }
  out.setRGB(channel(r), channel(g), channel(b), SRGBColorSpace);
  const mean = (out.r + out.g + out.b) / 3;
  out.r = mean + (out.r - mean) * 1.35;
  out.g = mean + (out.g - mean) * 1.35;
  out.b = mean + (out.b - mean) * 1.35;
  const max = Math.max(out.r, out.g, out.b);
  return out.multiplyScalar(1 / max);
}

const channel = (value: number): number => Math.min(255, Math.max(0, value)) / 255;

export interface SkyOptions {
  tier?: QualityTier;
}

export class Sky {
  tier: QualityTier;
  group: Group;
  glowUniforms: { uMap: { value: Texture | null }; uIntensity: { value: number } };
  glowMaterial: ShaderMaterial;
  glowGeometry: SphereGeometry;
  glow: Mesh<SphereGeometry, ShaderMaterial>;
  starUniforms: { uPixelRatio: { value: number }; uIntensity: { value: number } };
  starMaterial: ShaderMaterial;
  starGeometry: BufferGeometry;
  stars: Points<BufferGeometry, ShaderMaterial>;
  count?: number;

  constructor({ tier = "hi" }: SkyOptions = {}) {
    this.tier = tier;
    this.group = new Group();
    this.group.name = "Sky";

    this.glowUniforms = {
      uMap: { value: null },
      uIntensity: { value: 0.32 },
    };
    this.glowMaterial = new ShaderMaterial({
      uniforms: this.glowUniforms,
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      side: BackSide,
      depthWrite: false,
    });
    this.glowGeometry = new SphereGeometry(1, 48, 24);
    this.glow = new Mesh(this.glowGeometry, this.glowMaterial);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = -20;
    this.glow.visible = false;

    this.starUniforms = {
      uPixelRatio: { value: 1 },
      uIntensity: { value: 1 },
    };
    this.starMaterial = new ShaderMaterial({
      uniforms: this.starUniforms,
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.starGeometry = new BufferGeometry();
    this.stars = new Points(this.starGeometry, this.starMaterial);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -19;
    this.stars.visible = false;

    this.group.add(this.glow, this.stars);
  }

  async load(): Promise<void> {
    const [map, stars] = await Promise.all([
      new TextureLoader().loadAsync(assetUrl(`space/milkyway-${this.tier}.jpg`)),
      fetch(assetUrl("space/stars.bin")).then((response) => {
        if (!response.ok) throw Error(`stars.bin: HTTP ${response.status}`);
        return response.arrayBuffer();
      }),
    ]);
    map.colorSpace = NoColorSpace;
    map.generateMipmaps = false;
    map.minFilter = LinearFilter;
    map.wrapS = RepeatWrapping;
    this.glowUniforms.uMap.value = map;
    this.glow.visible = true;
    this.buildStars(stars);
  }

  /**
   * `stars.bin`: 8-byte records sorted by magnitude — int16 LE x, y, z (ECI unit vector × 32767),
   * uint8 magnitude ((mag + 2) × 16), uint8 B−V ((bv + 0.5) × 64).
   */
  buildStars(buffer: ArrayBuffer): void {
    const view = new DataView(buffer);
    const magLimit = this.tier === "hi" ? 8 : 6.8;
    let count = 0;
    while (count * 8 < buffer.byteLength && view.getUint8(count * 8 + 6) / 16 - 2 <= magLimit) count++;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const flux = new Float32Array(count);
    const color = new Color();
    for (let i = 0; i < count; i++) {
      const offset = i * 8;
      const x = view.getInt16(offset, true) / 32767;
      const y = view.getInt16(offset + 2, true) / 32767;
      const z = view.getInt16(offset + 4, true) / 32767;
      positions[i * 3] = x;
      positions[i * 3 + 1] = z;
      positions[i * 3 + 2] = -y;
      const mag = view.getUint8(offset + 6) / 16 - 2;
      starColorFromBV(view.getUint8(offset + 7) / 64 - 0.5, color);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      flux[i] = 10 ** (-0.4 * (mag - 4.9));
    }
    this.starGeometry.setAttribute("position", new BufferAttribute(positions, 3));
    this.starGeometry.setAttribute("aColor", new BufferAttribute(colors, 3));
    this.starGeometry.setAttribute("aFlux", new BufferAttribute(flux, 1));
    this.stars.visible = true;
    this.count = count;
  }

  setPixelRatio(ratio: number): void {
    this.starUniforms.uPixelRatio.value = ratio;
  }

  setDetail(detail: number): void {
    if (this.count) {
      this.starGeometry.setDrawRange(0, Math.max(120, Math.round(this.count * MathUtils.clamp(detail, 0.4, 1))));
    }
  }

  setExposure(stars: number, glow: number): void {
    this.starUniforms.uIntensity.value = stars;
    this.glowUniforms.uIntensity.value = glow;
  }

  dispose(): void {
    this.glowUniforms.uMap.value?.dispose();
    this.glowGeometry.dispose();
    this.glowMaterial.dispose();
    this.starGeometry.dispose();
    this.starMaterial.dispose();
  }
}
