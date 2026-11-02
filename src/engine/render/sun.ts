import {
  AdditiveBlending,
  Group,
  ImageBitmapLoader,
  LinearFilter,
  LinearMipmapLinearFilter,
  MathUtils,
  Mesh,
  NoColorSpace,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  type BufferGeometry,
  type IUniform,
  type PerspectiveCamera,
  type WebGLRenderer,
} from "three";
import {
  LENS_FLARE_FRAGMENT,
  LENS_FLARE_VERTEX,
  SUN_CORONA_FRAGMENT,
  SUN_CORONA_VERTEX,
  SUN_SURFACE_FRAGMENT,
  SUN_SURFACE_VERTEX,
  createLensFlareGeometry,
} from "./bodies";

/** A sphere that can hide the Sun (and so dim the lens flare). */
export interface Occluder {
  position: Vector3;
  radius: number;
}

export type SunSurfaceUniforms = {
  uMap: IUniform<Texture | null>;
  uHasMap: IUniform<number>;
  uTime: IUniform<number>;
};

export type SunCoronaUniforms = {
  uCenter: IUniform<Vector3>;
  uSize: IUniform<number>;
  uRadius: IUniform<number>;
  uTime: IUniform<number>;
  uIntensity: IUniform<number>;
  uFar: IUniform<number>;
};

export type SunFlareUniforms = {
  uSun: IUniform<Vector2>;
  uAspect: IUniform<number>;
  uStrength: IUniform<number>;
};

const toSun = new Vector3();
const toOccluder = new Vector3();
const projected = new Vector3();

/** The Sun: granulated surface, corona billboard and screen-space lens flare (bundle `my`). */
export class Sun {
  radius: number;
  position: Vector3;
  group: Group;
  surfaceUniforms: SunSurfaceUniforms;
  surfaceMaterial: ShaderMaterial;
  surface: Mesh<BufferGeometry, ShaderMaterial>;
  coronaUniforms: SunCoronaUniforms;
  coronaGeometry: PlaneGeometry;
  coronaMaterial: ShaderMaterial;
  corona: Mesh<PlaneGeometry, ShaderMaterial>;
  flareUniforms: SunFlareUniforms;
  flareGeometry: BufferGeometry;
  flareMaterial: ShaderMaterial;
  flare: Mesh<BufferGeometry, ShaderMaterial>;
  flareVisibility: number;

  constructor({ geometry }: { geometry: BufferGeometry }) {
    this.radius = 22;
    this.position = new Vector3();
    this.group = new Group();
    this.group.name = `Sun`;
    this.surfaceUniforms = {
      uMap: { value: null },
      uHasMap: { value: 0 },
      uTime: { value: 0 },
    };
    this.surfaceMaterial = new ShaderMaterial({
      uniforms: this.surfaceUniforms,
      vertexShader: SUN_SURFACE_VERTEX,
      fragmentShader: SUN_SURFACE_FRAGMENT,
    });
    this.surface = new Mesh(geometry, this.surfaceMaterial);
    this.surface.scale.setScalar(this.radius);
    this.coronaUniforms = {
      uCenter: { value: this.position },
      uSize: { value: this.radius * 9 },
      uRadius: { value: this.radius },
      uTime: this.surfaceUniforms.uTime,
      uIntensity: { value: 1 },
      uFar: { value: 0 },
    };
    this.coronaGeometry = new PlaneGeometry(2, 2);
    this.coronaMaterial = new ShaderMaterial({
      uniforms: this.coronaUniforms,
      vertexShader: SUN_CORONA_VERTEX,
      fragmentShader: SUN_CORONA_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.corona = new Mesh(this.coronaGeometry, this.coronaMaterial);
    this.corona.frustumCulled = false;
    this.flareUniforms = {
      uSun: { value: new Vector2() },
      uAspect: { value: 1 },
      uStrength: { value: 0 },
    };
    this.flareGeometry = createLensFlareGeometry();
    this.flareMaterial = new ShaderMaterial({
      uniforms: this.flareUniforms,
      vertexShader: LENS_FLARE_VERTEX,
      fragmentShader: LENS_FLARE_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.flare = new Mesh(this.flareGeometry, this.flareMaterial);
    this.flare.frustumCulled = false;
    this.flare.renderOrder = 1e3;
    this.flare.visible = false;
    this.flareVisibility = 0;
    this.group.add(this.surface, this.corona, this.flare);
  }

  setMap(texture: Texture | null): void {
    this.surfaceUniforms.uMap.value = texture;
    this.surfaceUniforms.uHasMap.value = +!!texture;
  }

  setPosition(position: Vector3): void {
    this.position.copy(position);
    this.surface.position.copy(position);
  }

  update(
    camera: PerspectiveCamera,
    occluders: readonly Occluder[],
    time: number,
    dt: number,
    flare: boolean,
  ): void {
    this.surfaceUniforms.uTime.value = time;
    this.surface.rotation.y = time * 0.004;
    toSun.copy(this.position).sub(camera.position);
    const distance = toSun.length();
    toSun.divideScalar(distance);
    const angularRadius = this.radius / distance;
    let visible = 1;
    for (const occluder of occluders) {
      toOccluder.copy(occluder.position).sub(camera.position);
      const along = toOccluder.dot(toSun);
      if (along <= 0 || along > distance) continue;
      const offset = Math.sqrt(Math.max(toOccluder.lengthSq() - along * along, 0)) / along;
      const occluderRadius = occluder.radius / along;
      visible = Math.min(
        visible,
        MathUtils.smoothstep(offset, occluderRadius - angularRadius, occluderRadius + angularRadius * 1.5),
      );
    }
    projected.copy(this.position).project(camera);
    const inFront = projected.z < 1;
    const edge = Math.max(Math.abs(projected.x), Math.abs(projected.y));
    const onScreen = inFront ? 1 - MathUtils.smoothstep(edge, 0.9, 1.35) : 0;
    const small = 1 - MathUtils.smoothstep(angularRadius, 0.03, 0.12);
    const target = flare ? visible * onScreen * small : 0;
    this.flareVisibility += (target - this.flareVisibility) * Math.min(1, dt * 10);
    this.flareUniforms.uSun.value.set(projected.x, projected.y);
    this.flareUniforms.uAspect.value = camera.aspect;
    this.flareUniforms.uStrength.value = this.flareVisibility;
    this.flare.visible = this.flareVisibility > 0.003;
    const farSize = distance * Math.tan(0.09);
    this.coronaUniforms.uSize.value = Math.max(this.radius * 9, farSize);
    this.coronaUniforms.uFar.value = 1 - MathUtils.smoothstep((this.radius * 9) / farSize, 0.35, 1);
  }

  dispose(): void {
    this.surfaceUniforms.uMap.value?.dispose();
    this.surfaceMaterial.dispose();
    this.coronaGeometry.dispose();
    this.coronaMaterial.dispose();
    this.flareGeometry.dispose();
    this.flareMaterial.dispose();
  }
}

let isSafariCache: boolean | null = null;

/** Safari's createImageBitmap ignores imageOrientation; fall back to TextureLoader there (bundle `hy`). */
function isSafari(): boolean {
  if (isSafariCache === null) isSafariCache = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  return isSafariCache;
}

export interface LoadTextureOptions {
  srgb?: boolean;
  anisotropy?: number;
  mipmaps?: boolean;
}

/** Loads a texture (ImageBitmap path when available) and uploads it to the GPU (bundle `gy`). */
export function loadTexture(
  renderer: WebGLRenderer,
  url: string,
  { srgb = true, anisotropy = 4, mipmaps = true }: LoadTextureOptions = {},
): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const finish = (texture: Texture) => {
      texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
      texture.anisotropy = anisotropy;
      texture.wrapS = RepeatWrapping;
      texture.generateMipmaps = mipmaps;
      texture.minFilter = mipmaps ? LinearMipmapLinearFilter : LinearFilter;
      texture.needsUpdate = true;
      renderer.initTexture(texture);
      if (typeof ImageBitmap !== `undefined` && texture.image instanceof ImageBitmap) texture.image.close();
      resolve(texture);
    };
    if (typeof createImageBitmap == `function` && !isSafari()) {
      const loader = new ImageBitmapLoader();
      loader.setOptions({
        imageOrientation: `flipY`,
        premultiplyAlpha: `none`,
        colorSpaceConversion: `none`,
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
