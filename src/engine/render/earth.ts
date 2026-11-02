import {
  AdditiveBlending,
  BackSide,
  Color,
  DataTexture,
  Group,
  ImageBitmapLoader,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  TextureLoader,
  Vector3,
  type WebGLRenderer,
} from "three";

import { assetUrl, type QualityTier } from "@/engine/config";

/** Outer radius of the atmosphere shell, in Earth radii. */
export const ATMOSPHERE_RADIUS = 1.045;

/** Texture width per quality tier. */
const TEXTURE_SIZE: Record<QualityTier, number> = { lo: 2048, hi: 4096 };

const textureUrls = (tier: QualityTier) => ({
  day: assetUrl(`textures/${tier}/day.jpg`),
  aux: assetUrl(`textures/${tier}/auxmap.jpg`),
  normal: assetUrl(`textures/${tier}/normal.jpg`),
});

const SURFACE_VERTEX = `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vTangentW;
  varying vec3 vBitangentW;
  varying vec3 vPositionW;
  varying float vCosLat;

  void main() {
    vUv = uv;
    vec3 n = normalize(position);
    vec3 up = abs(n.y) > 0.999 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 east = normalize(cross(up, n));
    vec3 north = cross(n, east);
    mat3 m = mat3(modelMatrix);
    vNormalW = normalize(m * n);
    vTangentW = normalize(m * east);
    vBitangentW = normalize(m * north);
    vCosLat = max(length(n.xz), 0.05);

    vec4 world = modelMatrix * vec4(position, 1.0);
    vPositionW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SUNLIGHT_GLSL = `
  vec3 sunlightColor(float cosSun) {
    return mix(vec3(1.0, 0.42, 0.16), vec3(1.0, 0.97, 0.92), smoothstep(-0.04, 0.32, cosSun));
  }
`;

const SURFACE_FRAGMENT = `
  uniform sampler2D uDay;
  uniform sampler2D uAux;
  uniform sampler2D uNormal;
  uniform vec3 uSunDir;
  uniform float uCloudOffset;
  uniform float uNightMode;
  uniform float uNormalStrength;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vTangentW;
  varying vec3 vBitangentW;
  varying vec3 vPositionW;
  varying float vCosLat;

  ${SUNLIGHT_GLSL}

  void main() {
    vec3 L = uSunDir;
    vec3 V = normalize(cameraPosition - vPositionW);
    vec3 Ng = normalize(vNormalW);
    vec3 T = normalize(vTangentW);
    vec3 B = normalize(vBitangentW);

    vec4 aux = texture2D(uAux, vUv);
    float water = smoothstep(0.35, 0.65, aux.b);

    vec2 cloudUv = vec2(vUv.x - uCloudOffset, vUv.y);
    float cloudHere = texture2D(uAux, cloudUv).g;
    // Cloud shadows fall offset away from the sun (cloud deck ~0.006 R above the surface).
    vec2 sunTangent = vec2(dot(L, T), dot(L, B));
    vec2 shadowUv = cloudUv - vec2(sunTangent.x / (6.2832 * vCosLat), sunTangent.y / 3.1416) * 0.006;
    float cloudShadow = smoothstep(0.1, 0.9, texture2D(uAux, shadowUv).g);

    vec2 nxy = texture2D(uNormal, vUv).rg * 2.0 - 1.0;
    vec3 N = normalize(Ng + (T * nxy.x + B * nxy.y) * uNormalStrength * (1.0 - water));

    float cosSun = dot(Ng, L);
    float NdL = dot(N, L);
    float daylight = smoothstep(-0.1, 0.1, cosSun);
    vec3 sunColor = sunlightColor(cosSun);

    vec3 albedo = texture2D(uDay, vUv).rgb;
    albedo = mix(albedo, albedo * vec3(0.7, 0.82, 1.0), water * 0.35);

    float diffuse = max(NdL, 0.0) * daylight;
    vec3 color = albedo * sunColor * diffuse * 1.3 * (1.0 - cloudShadow * 0.5);

    vec3 H = normalize(L + V);
    float NdH = max(dot(Ng, H), 0.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
    float glint = pow(NdH, 1400.0) * 6.0 + pow(NdH, 90.0) * 0.18;
    color += sunColor * glint * fresnel * water * daylight * (1.0 - cloudShadow) * 2.2;

    color *= mix(1.0, 0.1, uNightMode);

    float nightSide = 1.0 - smoothstep(-0.2, 0.04, cosSun);
    nightSide = mix(nightSide, 1.0, uNightMode);
    float lum = pow(smoothstep(0.045, 0.9, aux.r), 1.9);
    vec3 sodium = mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.86, 0.62), smoothstep(0.25, 0.85, aux.r));
    vec3 lights = sodium * lum * mix(3.2, 4.6, uNightMode) * (1.0 - cloudHere * 0.8) * nightSide;

    gl_FragColor = vec4(color + lights, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const CLOUD_FRAGMENT = `
  uniform sampler2D uAux;
  uniform vec3 uSunDir;
  uniform float uNightMode;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  ${SUNLIGHT_GLSL}

  void main() {
    float density = smoothstep(0.06, 0.92, texture2D(uAux, vUv).g);
    if (density < 0.01) discard;

    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPositionW);
    float cosSun = dot(N, uSunDir);
    float lit = smoothstep(-0.12, 0.25, cosSun) * mix(1.0, 0.1, uNightMode);

    vec3 color = sunlightColor(cosSun) * (0.35 + 0.85 * max(cosSun, 0.0)) * lit;
    color += vec3(0.008, 0.012, 0.02);

    float limbFade = smoothstep(0.0, 0.25, dot(N, V));
    gl_FragColor = vec4(color, density * mix(0.55, 0.95, lit) * limbFade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const ATMOSPHERE_VERTEX = `
  varying vec3 vPositionW;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPositionW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ATMOSPHERE_FRAGMENT = `
  uniform vec3 uSunDir;
  uniform vec3 uAtmosphere;
  uniform vec3 uTwilight;
  uniform float uNightMode;

  varying vec3 vPositionW;

  const float R_PLANET = 1.0;
  const float R_ATMO = ${ATMOSPHERE_RADIUS.toFixed(4)};

  vec2 raySphere(vec3 ro, vec3 rd, float r) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - r * r;
    float d = b * b - c;
    if (d < 0.0) return vec2(1e9, -1e9);
    d = sqrt(d);
    return vec2(-b - d, -b + d);
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vPositionW - ro);

    vec2 shell = raySphere(ro, rd, R_ATMO);
    vec2 planet = raySphere(ro, rd, R_PLANET);
    float t0 = max(shell.x, 0.0);
    float t1 = planet.x > 0.0 ? min(shell.y, planet.x) : shell.y;
    if (t1 <= t0) discard;

    float ds = (t1 - t0) / float(ATMO_STEPS);
    // Interleaved gradient noise breaks the banding a handful of fixed steps would leave.
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    vec3 rayleigh = vec3(0.0);
    float mie = 0.0;
    for (int i = 0; i < ATMO_STEPS; i++) {
      vec3 p = ro + rd * (t0 + ds * (float(i) + jitter));
      float r = length(p);
      float h = clamp((r - R_PLANET) / (R_ATMO - R_PLANET), 0.0, 1.0);
      float density = exp(-h * 5.0);
      float cosSun = dot(p / r, uSunDir);
      float sunReach = smoothstep(-0.1, 0.12, cosSun);
      float dusk = 1.0 - smoothstep(0.0, 0.3, cosSun);
      vec3 tint = mix(uAtmosphere, uTwilight * 0.45, dusk * 0.55);
      rayleigh += tint * density * sunReach;
      mie += density * sunReach;
    }
    rayleigh *= ds;
    mie *= ds;

    float mu = dot(rd, uSunDir);
    float phaseR = 0.75 * (1.0 + mu * mu);
    const float g = 0.76;
    float phaseM = (1.0 - g * g) / (12.566 * pow(1.0 + g * g - 2.0 * g * mu, 1.5));

    vec3 color = rayleigh * phaseR * 4.6 + vec3(1.0, 0.9, 0.78) * mie * phaseM * 1.4;
    color *= mix(1.0, 0.4, uNightMode);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Safari decodes ImageBitmaps with broken orientation/colour handling; fall back to TextureLoader. */
const isSafari = (): boolean => /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

function createPlaceholderTexture(): DataTexture {
  const texture = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

export interface EarthTextureSet {
  tier: QualityTier;
  day: Texture;
  aux: Texture;
  normal: Texture;
}

export type EarthUniforms = {
  uDay: { value: Texture };
  uAux: { value: Texture };
  uNormal: { value: Texture };
  uSunDir: { value: Vector3 };
  uAtmosphere: { value: Color };
  uTwilight: { value: Color };
  uCloudOffset: { value: number };
  uNightMode: { value: number };
  uNormalStrength: { value: number };
};

export interface EarthOptions {
  renderer: WebGLRenderer;
  tier?: QualityTier;
  segments?: number;
  atmosphereSteps?: number;
}

export class Earth {
  renderer: WebGLRenderer;
  tier: QualityTier;
  anisotropy: number;
  textures: EarthTextureSet | null;
  placeholder: DataTexture;
  atmosphereColor: Color;
  atmosphereBase: Color;
  atmosphereAlarm: Color;
  uniforms: EarthUniforms;
  group: Group;
  surfaceGeometry: SphereGeometry;
  surfaceMaterial: ShaderMaterial;
  surface: Mesh<SphereGeometry, ShaderMaterial>;
  cloudGeometry: SphereGeometry;
  cloudMaterial: ShaderMaterial;
  clouds: Mesh<SphereGeometry, ShaderMaterial>;
  atmosphereGeometry: SphereGeometry;
  atmosphereMaterial: ShaderMaterial;
  atmosphere: Mesh<SphereGeometry, ShaderMaterial>;
  cloudDrift: number;
  upgrade?: Promise<void>;
  disposed?: boolean;

  constructor({ renderer, tier = "hi", segments = 160, atmosphereSteps = 6 }: EarthOptions) {
    this.renderer = renderer;
    this.tier = tier;
    this.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    this.textures = null;
    this.placeholder = createPlaceholderTexture();
    this.atmosphereColor = new Color("#5d9cff");
    this.atmosphereBase = this.atmosphereColor.clone();
    this.atmosphereAlarm = new Color("#ff2a1f");
    this.uniforms = {
      uDay: { value: this.placeholder },
      uAux: { value: this.placeholder },
      uNormal: { value: this.placeholder },
      uSunDir: { value: new Vector3(1, 0, 0) },
      uAtmosphere: { value: this.atmosphereColor },
      uTwilight: { value: new Color("#ff7a3d") },
      uCloudOffset: { value: 0 },
      uNightMode: { value: 0 },
      uNormalStrength: { value: tier === "hi" ? 1.6 : 1.2 },
    };
    this.group = new Group();
    this.group.name = "Earth";

    this.surfaceGeometry = new SphereGeometry(1, segments, segments / 2);
    this.surfaceMaterial = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SURFACE_VERTEX,
      fragmentShader: SURFACE_FRAGMENT,
    });
    this.surface = new Mesh(this.surfaceGeometry, this.surfaceMaterial);
    this.surface.name = "EarthSurface";
    this.surface.receiveShadow = true;

    this.cloudGeometry = new SphereGeometry(1.006, Math.round(segments * 0.75), Math.round(segments * 0.375));
    this.cloudMaterial = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SURFACE_VERTEX,
      fragmentShader: CLOUD_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.clouds = new Mesh(this.cloudGeometry, this.cloudMaterial);
    this.clouds.name = "EarthClouds";
    this.clouds.renderOrder = 1;

    this.atmosphereGeometry = new SphereGeometry(ATMOSPHERE_RADIUS, 64, 32);
    this.atmosphereMaterial = new ShaderMaterial({
      uniforms: this.uniforms,
      defines: { ATMO_STEPS: atmosphereSteps },
      vertexShader: ATMOSPHERE_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
    });
    this.atmosphere = new Mesh(this.atmosphereGeometry, this.atmosphereMaterial);
    this.atmosphere.name = "EarthAtmosphere";
    this.atmosphere.renderOrder = 1;

    this.group.add(this.surface, this.clouds, this.atmosphere);
    this.cloudDrift = 0;
  }

  loadTexture(url: string, srgb: boolean, onLoaded?: () => void): Promise<Texture> {
    return new Promise((resolve, reject) => {
      const finish = (texture: Texture) => {
        texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
        texture.anisotropy = this.anisotropy;
        texture.wrapS = RepeatWrapping;
        texture.minFilter = LinearMipmapLinearFilter;
        texture.needsUpdate = true;
        onLoaded?.();
        resolve(texture);
      };
      if (typeof createImageBitmap == "function" && !isSafari()) {
        const loader = new ImageBitmapLoader();
        loader.setOptions({
          imageOrientation: "flipY",
          premultiplyAlpha: "none",
          colorSpaceConversion: "none",
        });
        loader.load(
          url,
          (bitmap) => {
            const texture = new Texture(bitmap);
            texture.flipY = false;
            finish(texture);
          },
          undefined,
          reject,
        );
      } else new TextureLoader().load(url, finish, undefined, reject);
    });
  }

  async loadTier(tier: QualityTier, onProgress?: (fraction: number) => void): Promise<EarthTextureSet> {
    const urls = textureUrls(tier);
    let loaded = 0;
    const tick = () => onProgress?.(++loaded / 3);
    const [day, aux, normal] = await Promise.all([
      this.loadTexture(urls.day, true, tick),
      this.loadTexture(urls.aux, false, tick),
      this.loadTexture(urls.normal, false, tick),
    ]);
    return { tier, day, aux, normal };
  }

  applyTextures(set: EarthTextureSet): void {
    for (const texture of [set.day, set.aux, set.normal]) {
      this.renderer.initTexture(texture);
      if (typeof ImageBitmap < "u" && texture.image instanceof ImageBitmap) texture.image.close();
    }
    const previous = this.textures;
    this.textures = set;
    this.uniforms.uDay.value = set.day;
    this.uniforms.uAux.value = set.aux;
    this.uniforms.uNormal.value = set.normal;
    if (previous) this.disposeTextureSet(previous);
  }

  async load(onProgress?: (fraction: number) => void): Promise<void> {
    this.applyTextures(await this.loadTier("lo", onProgress));
    if (this.tier === "hi") {
      this.upgrade = this.loadTier("hi")
        .then((set) => {
          if (this.disposed) this.disposeTextureSet(set);
          else this.applyTextures(set);
        })
        .catch((error: unknown) => console.warn("[Earth] 4K textures unavailable, keeping 2K.", error));
    }
  }

  get textureSize(): number {
    return TEXTURE_SIZE[this.textures?.tier ?? "lo"];
  }

  update(gmst: number, sunDir: Vector3, simSeconds: number): void {
    this.cloudDrift = (this.cloudDrift + simSeconds * 25e-7) % (Math.PI * 2);
    this.surface.rotation.y = gmst;
    this.clouds.rotation.y = gmst + this.cloudDrift;
    this.uniforms.uCloudOffset.value = this.cloudDrift / (Math.PI * 2);
    this.uniforms.uSunDir.value.copy(sunDir);
  }

  setAlarm(amount: number): void {
    this.atmosphereColor.lerpColors(this.atmosphereBase, this.atmosphereAlarm, amount);
  }

  disposeTextureSet(set: EarthTextureSet): void {
    for (const texture of [set.day, set.aux, set.normal]) texture.dispose();
  }

  dispose(): void {
    this.disposed = true;
    this.surfaceGeometry.dispose();
    this.cloudGeometry.dispose();
    this.atmosphereGeometry.dispose();
    this.surfaceMaterial.dispose();
    this.cloudMaterial.dispose();
    this.atmosphereMaterial.dispose();
    if (this.textures) this.disposeTextureSet(this.textures);
    this.placeholder.dispose();
    this.group.removeFromParent();
  }
}
