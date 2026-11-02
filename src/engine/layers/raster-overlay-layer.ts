/**
 * Raster overlay (ADR-15, ozone): a textured sphere at r = 1.009 showing a pre-coloured
 * equirectangular image (GIBS WMS). One draw call. The texture is created per payload, uploaded
 * with `initTexture`, its ImageBitmap closed, and the previous texture disposed after the swap.
 */
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
  type WebGLRenderer,
} from "three";
import type { ILayer, LayerDataPayload, LayerFactory, LayerUpdateContext } from "@/engine/contract";
import { OVERLAY_SPHERE_VERTEX, RASTER_FRAGMENT } from "@/engine/render/overlay-shaders";
import { closeImage, OverlayLayerBase } from "./overlay-base";

export const OZONE_RADIUS = 1.009;

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

export class RasterOverlayLayer extends OverlayLayerBase {
  private readonly renderer: WebGLRenderer;
  private readonly geometry: SphereGeometry;
  private readonly material: ShaderMaterial;
  private readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;
  private texture: Texture | null = null;

  constructor(id: string, name: string, host: ILayer | undefined, opacity: number, renderer: WebGLRenderer, segments: number) {
    super(id, name, host, opacity);
    this.renderer = renderer;
    this.geometry = new SphereGeometry(OZONE_RADIUS, segments, segments / 2);
    this.material = new ShaderMaterial({
      uniforms: {
        uMap: { value: null },
        uOpacity: { value: opacity },
        uNightFade: { value: 0.35 },
        uSunDir: { value: new Vector3(1, 0, 0) },
      },
      vertexShader: OVERLAY_SPHERE_VERTEX,
      fragmentShader: RASTER_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = `${name}Overlay`;
    this.mesh.renderOrder = 2;
    this.object3d.add(this.mesh);
  }

  protected tick(ctx: LayerUpdateContext): void {
    (this.material.uniforms.uSunDir.value as Vector3).copy(ctx.sunDir);
  }

  protected applyOpacity(opacity: number): void {
    this.material.uniforms.uOpacity.value = opacity;
  }

  protected accept(payload: LayerDataPayload): boolean {
    if (payload.kind !== "raster") {
      closeImage(payload);
      return this.texture !== null;
    }
    const { image } = payload;
    const texture = new Texture(image);
    texture.flipY = !payload.flipped;
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    const pot = isPowerOfTwo(image.width) && isPowerOfTwo(image.height);
    texture.generateMipmaps = pot;
    texture.minFilter = pot ? LinearMipmapLinearFilter : LinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    this.renderer.initTexture(texture);
    closeImage(payload);
    const previous = this.texture;
    this.texture = texture;
    this.material.uniforms.uMap.value = texture;
    previous?.dispose();
    return true;
  }

  protected release(): void {
    this.material.uniforms.uMap.value = null;
    this.texture?.dispose();
    this.texture = null;
  }

  protected disposeResources(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export const createOzoneLayer: LayerFactory = ({ layers, renderer, tier }) =>
  new RasterOverlayLayer("ozone", "Ozone", layers.get("earth"), 0.75, renderer, tier === "hi" ? 128 : 96);
