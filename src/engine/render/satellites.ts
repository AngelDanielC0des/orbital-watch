import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  MathUtils,
  Matrix4,
  Mesh,
  Points,
  ShaderMaterial,
  Vector3,
  type Camera,
  type DataTexture,
  type IUniform,
  type Texture,
  type WebGLRenderer,
} from "three";
import type { QualityTier } from "@/engine/config";
import { GpuPropagator, PROPAGATE_GLSL } from "./gpu-propagator";
import {
  Category,
  EARTH_RADIUS_KM,
  MS_PER_MINUTE,
  eciToScene,
  elementsFromGp,
  keplerToEci,
  wrapTwoPi,
  type CategoryId,
  type MeanElements,
  type XYZ,
} from "@/lib/orbital/orbit-math";
import { buildSatelliteModels } from "./sat-models";
import type { CatalogEntry } from "@/types/orbital";

/** Float64 values stored per object in `SatelliteLayer.data`. */
export const STRIDE = 11;

/** Offsets inside one `STRIDE` record. */
export const FIELD = {
  EPOCH: 0,
  N: 1,
  A: 2,
  E: 3,
  I: 4,
  RAAN: 5,
  ARGP: 6,
  M: 7,
  RAAN_DOT: 8,
  ARGP_DOT: 9,
  LAUNCH: 10,
} as const;

/** Re-anchor the element textures once the simulated time drifts this far (minutes, 3 days). */
export const REBASE_MINUTES = 4320;

/** Visibility per group (category + 4 when projected). */
export const FILTER_MASKS = Object.freeze({
  all: [1, 1, 1, 1, 1, 1, 1, 1],
  debris: [0, 0, 1, 1, 0, 0, 1, 1],
  starlink: [0, 1, 0, 0, 0, 1, 0, 0],
  projected: [0, 0, 0, 0, 1, 1, 1, 1],
} as const);

export type SatelliteFilter = keyof typeof FILTER_MASKS;

/** On-screen size (px) of the instanced models per category. */
export const MESH_SIZE_PX: Record<CategoryId, number> = {
  [Category.PAYLOAD]: 17,
  [Category.STARLINK]: 14,
  [Category.DEBRIS]: 10,
  [Category.ROCKET_BODY]: 14,
};

/** On-screen size (px) of the selected object's model. */
export const SELECTED_SIZE_PX = 64;

export const POINTS_VERTEX = `
  ${PROPAGATE_GLSL}

  uniform float uSize;
  uniform float uScale;
  uniform float uPixelRatio;
  uniform float uSelected;
  uniform float uAlarm;
  uniform float uProjectedMix;
  uniform float uMeshLod;
  uniform float uLodNear;
  uniform float uLodFar;
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uColors[4];
  uniform vec3 uAlarmColor;
  uniform vec3 uProjectedColor;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vGlyph;
  varying float vAngle;
  varying float vPx;
  varying float vSeed;

  void main() {
    float index = float(gl_VertexID);
    ivec2 tc = orbitTexel(index);
    vec4 P = texelFetch(uPositions, tc, 0);

    float dist = distance(P.xyz, cameraPosition);
    float asMesh = uMeshLod * (1.0 - smoothstep(uLodNear, uLodFar, dist));
    float visible = P.w * (1.0 - asMesh) * step(0.5, abs(index - uSelected));
    if (visible < 0.01) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }

    vec4 C = texelFetch(uElemC, tc, 0);
    int group = int(C.y + 0.5);
    int category = group - (group / 4) * 4;
    float seed = C.w;

    vec4 mv = modelViewMatrix * vec4(P.xyz, 1.0);
    gl_Position = projectionMatrix * mv;

    float sizeFactor = category == 2 ? mix(1.0, 1.3, uAlarm) : (category == 0 ? 1.35 : (category == 3 ? 1.2 : 1.05));
    float px = clamp(uSize * sizeFactor * uScale / max(-mv.z, 0.001), 1.6, 16.0);
    gl_PointSize = px * uPixelRatio;
    vPx = px;

    vGlyph = float(category);
    vSeed = seed;
    float tumble = category >= 2 ? uTime * (0.25 + seed * 0.9) * (category == 2 ? 1.0 : 0.3) : 0.0;
    vAngle = seed * 6.2832 + tumble;

    vec3 base = uColors[category];
    float isDebris = category >= 2 ? 1.0 : 0.0;
    base = mix(base, uAlarmColor, uAlarm * isDebris);
    vColor = mix(base, uProjectedColor, (group >= 4 ? 1.0 : 0.0) * uProjectedMix);

    float lit = sunlit(P.xyz, uSunDir);
    vAlpha = visible * mix(0.32, 1.0, lit) * mix(0.85, 1.0, isDebris * uAlarm);
  }
`;

export const POINTS_FRAGMENT = `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vGlyph;
  varying float vAngle;
  varying float vPx;
  varying float vSeed;

  float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p);
    float dotShape = 1.0 - smoothstep(0.0, 0.5, r * 1.6);

    float glyphMix = smoothstep(3.5, 6.5, vPx);
    float alpha = dotShape;

    if (glyphMix > 0.0) {
      float c = cos(vAngle), s = sin(vAngle);
      vec2 q = mat2(c, -s, s, c) * p;
      int glyph = int(vGlyph + 0.5);
      float d;
      if (glyph == 0) {
        d = min(sdBox(q, vec2(0.1, 0.1)), sdBox(q, vec2(0.46, 0.06)));
      } else if (glyph == 1) {
        d = min(sdBox(q - vec2(0.0, 0.12), vec2(0.17, 0.06)), sdBox(q - vec2(0.0, -0.1), vec2(0.07, 0.34)));
      } else if (glyph == 2) {
        float a = atan(q.y, q.x);
        float radius = 0.24 + 0.1 * sin(3.0 * a + vSeed * 17.0) + 0.07 * sin(5.0 * a + vSeed * 41.0);
        d = r - radius;
      } else {
        d = sdBox(q, vec2(0.36, 0.1)) - 0.05;
      }
      float aa = 1.0 / max(vPx, 1.0);
      float shape = 1.0 - smoothstep(-aa, aa, d);
      float halo = (1.0 - smoothstep(0.0, 0.5, r)) * 0.22;
      alpha = mix(dotShape, max(shape, halo), glyphMix);
    }

    alpha *= vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor * (1.0 + dotShape * 0.3), alpha);
    #include <colorspace_fragment>
  }
`;

export const MESH_VERTEX = `
  ${PROPAGATE_GLSL}
  uniform highp sampler2D uElemB;

  attribute float aIndex;
  attribute vec4 aColor;

  uniform float uLodNear;
  uniform float uLodFar;
  uniform float uPxToWorld;
  uniform float uSelected;
  uniform float uHasSelectedPos;
  uniform vec3 uSelectedPos;
  uniform float uMinutes;
  uniform float uTime;
  uniform vec3 uSunDir;

  varying vec3 vNormalW;
  varying vec3 vPositionW;
  varying vec3 vColor;
  varying float vGloss;
  varying float vLit;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  mat3 rotateAxis(vec3 axis, float angle) {
    float c = cos(angle), s = sin(angle), t = 1.0 - c;
    return mat3(
      t * axis.x * axis.x + c,          t * axis.x * axis.y + s * axis.z, t * axis.x * axis.z - s * axis.y,
      t * axis.x * axis.y - s * axis.z, t * axis.y * axis.y + c,          t * axis.y * axis.z + s * axis.x,
      t * axis.x * axis.z + s * axis.y, t * axis.y * axis.z - s * axis.x, t * axis.z * axis.z + c
    );
  }

  void main() {
    ivec2 tc = orbitTexel(aIndex);
    vec4 P = texelFetch(uPositions, tc, 0);
    bool selected = abs(aIndex - uSelected) < 0.5;
    vec3 center = selected && uHasSelectedPos > 0.5 ? uSelectedPos : P.xyz;

    float dist = distance(center, cameraPosition);
    float lod = selected ? 1.0 : 1.0 - smoothstep(uLodNear, uLodFar, dist);
    float visible = (selected ? 1.0 : P.w) * lod;
    if (visible < 0.01) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    vec4 A = texelFetch(uElemA, tc, 0);
    vec4 B = texelFetch(uElemB, tc, 0);
    float seed = texelFetch(uElemC, tc, 0).w;

    // Attitude: nadir-pointing, flying along the orbit (orbit normal from inclination and node).
    vec3 up = normalize(center);
    float raan = A.w + B.w * uMinutes;
    float inc = A.z;
    vec3 hEci = vec3(sin(raan) * sin(inc), -cos(raan) * sin(inc), cos(inc));
    vec3 h = vec3(hEci.x, hEci.z, -hEci.y);
    vec3 forward = normalize(cross(h, up));
    vec3 right = cross(up, forward);
    mat3 basis = mat3(right, up, forward);
    vec3 shapeScale = vec3(1.0);

    #if CATEGORY_ID >= 2
      vec3 axis = normalize(vec3(hash(seed * 13.1), hash(seed * 71.7), hash(seed * 5.3)) - 0.5 + 0.001);
      float spin = (0.12 + hash(seed * 3.7) * 0.8) * (CATEGORY_ID == 2 ? 1.0 : 0.3);
      basis = basis * rotateAxis(axis, uTime * spin + seed * 31.0);
      #if CATEGORY_ID == 2
        shapeScale = vec3(0.55 + hash(seed * 9.1) * 0.9, 0.45 + hash(seed * 2.9) * 0.9, 0.55 + hash(seed * 4.3) * 0.9);
      #endif
    #endif

    float sizePx = selected ? ${SELECTED_SIZE_PX.toFixed(1)} : SIZE_PX * mix(0.75, 1.3, hash(seed * 17.0));
    float worldSize = sizePx * dist * uPxToWorld * 0.5 * (selected ? 1.0 : mix(0.3, 1.0, lod));

    vec3 world = center + basis * (position * shapeScale) * worldSize;
    vNormalW = basis * (normal / shapeScale);
    vPositionW = world;
    vColor = aColor.rgb;
    vGloss = aColor.a;
    vLit = sunlit(center, uSunDir);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

export const MESH_FRAGMENT = `
  uniform vec3 uSunDir;
  uniform float uAlarm;
  uniform vec3 uAlarmColor;

  varying vec3 vNormalW;
  varying vec3 vPositionW;
  varying vec3 vColor;
  varying float vGloss;
  varying float vLit;

  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 L = uSunDir;
    vec3 V = normalize(cameraPosition - vPositionW);
    vec3 zenith = normalize(vPositionW);

    vec3 base = vColor;
    #if CATEGORY_ID >= 2
      base = mix(base, uAlarmColor * (0.35 + dot(base, vec3(0.33))), uAlarm * 0.85);
    #endif

    float NdL = max(dot(N, L), 0.0) * vLit;
    float earthshine = max(dot(N, -zenith), 0.0) * 0.14;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), mix(18.0, 110.0, vGloss)) * mix(0.12, 1.6, vGloss) * vLit;
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.22;

    vec3 color = base * (0.045 + NdL * 1.2 + earthshine + rim) + vec3(1.0, 0.96, 0.9) * spec;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Catalog entry accepted by the layer, with its mean elements attached. */
export type SatelliteEntry = CatalogEntry & { elements: MeanElements };

export interface SatelliteLayerOptions {
  renderer: WebGLRenderer;
  referenceMs?: number;
  tier?: QualityTier;
}

export type SatelliteUniforms = {
  uPositions: IUniform<Texture>;
  uElemA: IUniform<DataTexture>;
  uElemB: IUniform<DataTexture>;
  uElemC: IUniform<DataTexture>;
  uSunDir: IUniform<Vector3>;
  uSelected: IUniform<number>;
  uAlarm: IUniform<number>;
  uAlarmColor: IUniform<Color>;
  uLodNear: IUniform<number>;
  uLodFar: IUniform<number>;
  uTime: IUniform<number>;
  uMinutes: IUniform<number>;
  uSize: IUniform<number>;
  uScale: IUniform<number>;
  uPixelRatio: IUniform<number>;
  uProjectedMix: IUniform<number>;
  uMeshLod: IUniform<number>;
  uColors: IUniform<Color[]>;
  uProjectedColor: IUniform<Color>;
  uPxToWorld: IUniform<number>;
  uHasSelectedPos: IUniform<number>;
  uSelectedPos: IUniform<Vector3>;
};

export interface SatelliteLod {
  near: number;
  far: number;
  cap: number;
  intervalMs: number;
  lastMs: number;
  busy: boolean;
  camera: Vector3;
}

export interface SatelliteMeshBatch {
  category: CategoryId;
  mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  geometry: InstancedBufferGeometry;
  base: BufferGeometry;
  indices: InstancedBufferAttribute;
  capacity: number;
  count: number;
}

/**
 * Whole catalog on the GPU: additive glyph points everywhere, instanced 3D models for
 * nearby objects (when float readback is available), CPU picking.
 */
export class SatelliteLayer {
  catalog: SatelliteEntry[];
  count: number;
  data: Float64Array;
  groups: Uint8Array;
  seeds: Float32Array;
  compute: GpuPropagator;
  meshLodEnabled: boolean;
  lod: SatelliteLod;
  colors: Record<CategoryId, Color>;
  uniforms: SatelliteUniforms;
  object3d: Group;
  pointsGeometry: BufferGeometry;
  pointsMaterial: ShaderMaterial;
  points: Points<BufferGeometry, ShaderMaterial>;
  meshes: SatelliteMeshBatch[];
  filter: SatelliteFilter;
  selected: number;
  referenceMs: number;
  _eci: XYZ;
  _world: Vector3;
  _viewProj: Matrix4;
  _cpuPositions: Float32Array | null;
  _cpuPositionsMs: number;
  _cpuPositionsFilter: string;

  constructor(catalog: Iterable<CatalogEntry>, { renderer, referenceMs = Date.now(), tier = "hi" }: SatelliteLayerOptions) {
    this.catalog = [];
    const elements: MeanElements[] = [];
    for (const entry of catalog) {
      const el = elementsFromGp(entry.omm);
      if (!Number.isFinite(el.a) || el.e >= 1 || el.perigeeKm < 80) continue;
      this.catalog.push(Object.assign(entry, { elements: el }));
      elements.push(el);
    }
    this.count = this.catalog.length;
    this.data = new Float64Array(this.count * STRIDE);
    this.groups = new Uint8Array(this.count);
    this.seeds = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const el = elements[i];
      const entry = this.catalog[i];
      const o = i * STRIDE;
      this.data[o + FIELD.EPOCH] = el.epochMs;
      this.data[o + FIELD.N] = el.n;
      this.data[o + FIELD.A] = el.a;
      this.data[o + FIELD.E] = el.e;
      this.data[o + FIELD.I] = el.i;
      this.data[o + FIELD.RAAN] = el.raan;
      this.data[o + FIELD.ARGP] = el.argp;
      this.data[o + FIELD.M] = el.M;
      this.data[o + FIELD.RAAN_DOT] = el.raanDot;
      this.data[o + FIELD.ARGP_DOT] = el.argpDot;
      this.data[o + FIELD.LAUNCH] = entry.launchMs;
      this.groups[i] = entry.category + (entry.projected ? 4 : 0);
      this.seeds[i] = ((Math.imul(i + 1, 2654435761) >>> 0) % 1e5) / 1e5;
    }
    this.compute = new GpuPropagator(renderer, this.count);
    this.meshLodEnabled = this.compute.readable;
    this.lod = {
      near: tier === "hi" ? 0.55 : 0.4,
      far: tier === "hi" ? 0.85 : 0.6,
      cap: tier === "hi" ? 9e3 : 2500,
      intervalMs: 90,
      lastMs: -Infinity,
      busy: false,
      camera: new Vector3(),
    };
    this.colors = {
      [Category.PAYLOAD]: new Color("#f2c14e"),
      [Category.STARLINK]: new Color("#d9ecff"),
      [Category.DEBRIS]: new Color("#e0574b"),
      [Category.ROCKET_BODY]: new Color("#f08a3c"),
    };
    const shared = {
      uPositions: { value: this.compute.positions },
      uElemA: { value: this.compute.elemA },
      uElemB: { value: this.compute.elemB },
      uElemC: { value: this.compute.elemC },
      uSunDir: { value: new Vector3(1, 0, 0) },
      uSelected: { value: -1 },
      uAlarm: { value: 0 },
      uAlarmColor: { value: new Color("#ff2f24") },
      uLodNear: { value: this.lod.near },
      uLodFar: { value: this.lod.far },
      uTime: { value: 0 },
      uMinutes: this.compute.uniforms.uMinutes,
    };
    this.uniforms = {
      ...shared,
      uSize: { value: 0.0075 },
      uScale: { value: 800 },
      uPixelRatio: { value: 1 },
      uProjectedMix: { value: 0.55 },
      uMeshLod: { value: this.meshLodEnabled ? 1 : 0 },
      uColors: { value: ([0, 1, 2, 3] as const).map((c) => this.colors[c]) },
      uProjectedColor: { value: new Color("#b8f36b") },
      uPxToWorld: { value: 0.001 },
      uHasSelectedPos: { value: 0 },
      uSelectedPos: { value: new Vector3() },
    };
    this.object3d = new Group();
    this.object3d.name = "SatelliteSystem";
    this.pointsGeometry = new BufferGeometry();
    this.pointsGeometry.setAttribute("position", new BufferAttribute(new Uint8Array(this.count), 1));
    this.pointsMaterial = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: POINTS_VERTEX,
      fragmentShader: POINTS_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(this.pointsGeometry, this.pointsMaterial);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.object3d.add(this.points);
    this.meshes = [];
    if (this.meshLodEnabled) {
      const models = buildSatelliteModels();
      for (const category of [Category.PAYLOAD, Category.STARLINK, Category.DEBRIS, Category.ROCKET_BODY]) {
        let total = 0;
        for (let i = 0; i < this.count; i++) if ((this.groups[i] & 3) === category) total++;
        const capacity = Math.min(total, this.lod.cap) + 1;
        const geometry = new InstancedBufferGeometry();
        const base = models[category];
        geometry.index = base.index;
        for (const name of ["position", "normal", "aColor"]) geometry.setAttribute(name, base.attributes[name]);
        const indices = new InstancedBufferAttribute(new Float32Array(capacity), 1);
        indices.setUsage(DynamicDrawUsage);
        geometry.setAttribute("aIndex", indices);
        geometry.instanceCount = 0;
        const mesh = new Mesh(
          geometry,
          new ShaderMaterial({
            uniforms: this.uniforms,
            defines: { CATEGORY_ID: category, SIZE_PX: MESH_SIZE_PX[category].toFixed(1) },
            vertexShader: MESH_VERTEX,
            fragmentShader: MESH_FRAGMENT,
            side: DoubleSide,
          }),
        );
        mesh.frustumCulled = false;
        mesh.visible = false;
        mesh.renderOrder = 1;
        this.object3d.add(mesh);
        this.meshes.push({ category, mesh, geometry, base, indices, capacity, count: 0 });
      }
    }
    this.filter = "all";
    this.selected = -1;
    this.referenceMs = referenceMs;
    this.rebase(referenceMs);
    this._eci = { x: 0, y: 0, z: 0 };
    this._world = new Vector3();
    this._viewProj = new Matrix4();
    this._cpuPositions = this.meshLodEnabled ? null : new Float32Array(this.count * 4);
    this._cpuPositionsMs = NaN;
    this._cpuPositionsFilter = "";
  }

  /** Re-anchors the element textures at `ms` (keeps the float32 GPU math precise). */
  rebase(ms: number): void {
    this.referenceMs = ms;
    const elemA = this.compute.elemA.image.data as Float32Array;
    const elemB = this.compute.elemB.image.data as Float32Array;
    const elemC = this.compute.elemC.image.data as Float32Array;
    const data = this.data;
    for (let i = 0; i < this.count; i++) {
      const o = i * STRIDE;
      const s = i * 4;
      const dt = (ms - data[o + FIELD.EPOCH]) / MS_PER_MINUTE;
      elemA[s] = data[o + FIELD.A] / EARTH_RADIUS_KM;
      elemA[s + 1] = data[o + FIELD.E];
      elemA[s + 2] = data[o + FIELD.I];
      elemA[s + 3] = wrapTwoPi(data[o + FIELD.RAAN] + data[o + FIELD.RAAN_DOT] * dt);
      elemB[s] = wrapTwoPi(data[o + FIELD.ARGP] + data[o + FIELD.ARGP_DOT] * dt);
      elemB[s + 1] = wrapTwoPi(data[o + FIELD.M] + data[o + FIELD.N] * dt);
      elemB[s + 2] = data[o + FIELD.N];
      elemB[s + 3] = data[o + FIELD.RAAN_DOT];
      elemC[s] = data[o + FIELD.ARGP_DOT];
      elemC[s + 1] = this.groups[i];
      elemC[s + 2] = (data[o + FIELD.LAUNCH] - ms) / MS_PER_MINUTE;
      elemC[s + 3] = this.seeds[i];
    }
    this.compute.markElementsDirty();
  }

  update(ms: number, cameraPos: Vector3, sunDir: Vector3, time: number): void {
    let minutes = (ms - this.referenceMs) / MS_PER_MINUTE;
    if (Math.abs(minutes) > REBASE_MINUTES) {
      this.rebase(ms);
      minutes = 0;
    }
    this.compute.setMinutes(minutes);
    this.compute.update();
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uTime.value = time;
    if (this.meshLodEnabled) this.scheduleLod(cameraPos);
  }

  scheduleLod(cameraPos: Vector3): void {
    const lod = this.lod;
    const now = performance.now();
    if (lod.busy || now - lod.lastMs < lod.intervalMs) return;
    if (cameraPos.length() - 7.5 > lod.far && this.selected < 0) {
      for (const batch of this.meshes) batch.mesh.visible = false;
    } else {
      lod.busy = true;
      lod.lastMs = now;
      lod.camera.copy(cameraPos);
      this.compute.readPositions().then((positions) => {
        lod.busy = false;
        if (positions) this.rebuildLodLists(positions, lod.camera);
      });
    }
  }

  rebuildLodLists(positions: Float32Array, camera: Vector3): void {
    const radius = this.lod.far + 0.2;
    const radiusSq = radius * radius;
    for (const batch of this.meshes) batch.count = 0;
    const meshes = this.meshes;
    for (let i = 0; i < this.count; i++) {
      if (positions[i * 4 + 3] <= 0.001 && i !== this.selected) continue;
      const dx = positions[i * 4] - camera.x;
      const dy = positions[i * 4 + 1] - camera.y;
      const dz = positions[i * 4 + 2] - camera.z;
      if (dx * dx + dy * dy + dz * dz > radiusSq && i !== this.selected) continue;
      const batch = meshes[this.groups[i] & 3];
      if (batch.count >= batch.capacity - 1 && i !== this.selected) continue;
      batch.indices.array[batch.count++] = i;
    }
    for (const batch of this.meshes) {
      batch.geometry.instanceCount = batch.count;
      batch.indices.clearUpdateRanges();
      batch.indices.addUpdateRange(0, batch.count);
      batch.indices.needsUpdate = true;
      batch.mesh.visible = batch.count > 0;
    }
  }

  setDetail(detail: number): void {
    const d = Math.max(0.35, detail);
    this.lod.intervalMs = d < 0.55 ? 200 : 90;
    this.uniforms.uMeshLod.value = this.meshLodEnabled && d > 0.5 ? 1 : 0;
    if (this.uniforms.uMeshLod.value < 0.5) for (const batch of this.meshes) batch.mesh.visible = false;
  }

  setViewport(height: number, fov: number, pixelRatio: number): void {
    const tanHalf = Math.tan(MathUtils.degToRad(fov) * 0.5);
    this.uniforms.uScale.value = (height * 0.5) / tanHalf;
    this.uniforms.uPxToWorld.value = (2 * tanHalf) / height;
    this.uniforms.uPixelRatio.value = pixelRatio;
  }

  setFilter(filter: string): void {
    const mask = (FILTER_MASKS as Record<string, readonly number[] | undefined>)[filter];
    if (!mask) return;
    this.filter = filter as SatelliteFilter;
    this.compute.setVisibility(mask);
    this.compute.setShowPlanned(filter === "projected");
    this.uniforms.uProjectedMix.value = filter === "projected" ? 1 : 0.55;
    this.lod.lastMs = -Infinity;
  }

  setSelected(index: number): void {
    this.selected = index;
    this.uniforms.uSelected.value = index;
    this.lod.lastMs = -Infinity;
  }

  setSelectedPosition(position: Vector3 | null | undefined): void {
    this.uniforms.uHasSelectedPos.value = position ? 1 : 0;
    if (position) this.uniforms.uSelectedPos.value.copy(position);
  }

  isVisible(index: number, ms: number): boolean {
    // Plan v2 / N2: with the "projected" filter, planned objects show before launch (the mask already limits it to groups 4–7).
    return FILTER_MASKS[this.filter][this.groups[index]] === 1 && (this.filter === "projected" || this.data[index * STRIDE + FIELD.LAUNCH] <= ms);
  }

  countVisible(ms: number, out: number[] = [0, 0, 0, 0]): number[] {
    out.fill(0);
    const mask = FILTER_MASKS[this.filter];
    for (let i = 0; i < this.count; i++) {
      const group = this.groups[i];
      if (mask[group] === 1 && (this.filter === "projected" || this.data[i * STRIDE + FIELD.LAUNCH] <= ms)) out[group & 3]++;
    }
    return out;
  }

  /** CPU Kepler + J2 position of object `index` at `ms`, in scene units. */
  positionAt(index: number, ms: number, out: Vector3): Vector3 {
    const o = index * STRIDE;
    const data = this.data;
    const dt = (ms - data[o + FIELD.EPOCH]) / MS_PER_MINUTE;
    keplerToEci(
      data[o + FIELD.A],
      data[o + FIELD.E],
      data[o + FIELD.I],
      data[o + FIELD.RAAN] + data[o + FIELD.RAAN_DOT] * dt,
      data[o + FIELD.ARGP] + data[o + FIELD.ARGP_DOT] * dt,
      wrapTwoPi(data[o + FIELD.M] + data[o + FIELD.N] * dt),
      this._eci,
    );
    return eciToScene(this._eci, out);
  }

  /** CPU fallback positions (xyz + visibility), cached while within `toleranceMs`. */
  cpuPositions(ms: number, toleranceMs: number): Float32Array {
    if (Math.abs(ms - this._cpuPositionsMs) <= toleranceMs && this._cpuPositionsFilter === this.filter) {
      return this._cpuPositions as Float32Array;
    }
    const out = this._cpuPositions as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const visible = this.isVisible(i, ms);
      out[i * 4 + 3] = visible ? 1 : 0;
      if (!visible) continue;
      const p = this.positionAt(i, ms, this._world);
      out[i * 4] = p.x;
      out[i * 4 + 1] = p.y;
      out[i * 4 + 2] = p.z;
    }
    this._cpuPositionsMs = ms;
    this._cpuPositionsFilter = this.filter;
    return out;
  }

  async pickAsync(
    x: number,
    y: number,
    camera: Camera,
    width: number,
    height: number,
    ms: number,
    radiusPx = 14,
  ): Promise<number> {
    const positions = this.meshLodEnabled ? await this.compute.readPositions() : this.cpuPositions(ms, 500);
    return positions ? this.pickFrom(positions, x, y, camera, width, height, radiusPx) : -1;
  }

  pick(x: number, y: number, camera: Camera, width: number, height: number, ms: number, radiusPx = 12): number {
    const positions = this.meshLodEnabled ? this.compute.readBuffer : this.cpuPositions(ms, 2e3);
    return this.pickFrom(positions, x, y, camera, width, height, radiusPx);
  }

  /** Nearest visible object to the cursor (screen distance + range bias), skipping Earth-occluded ones. */
  pickFrom(
    positions: Float32Array,
    x: number,
    y: number,
    camera: Camera,
    width: number,
    height: number,
    radiusPx: number,
  ): number {
    const eye = camera.position;
    const c = eye.lengthSq() - 0.998;
    const radiusSq = radiusPx * radiusPx;
    const m = this._viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < this.count; i++) {
      if (positions[i * 4 + 3] <= 0.001) continue;
      const px = positions[i * 4];
      const py = positions[i * 4 + 1];
      const pz = positions[i * 4 + 2];
      const w = m[3] * px + m[7] * py + m[11] * pz + m[15];
      if (w <= 0) continue;
      const sx = (((m[0] * px + m[4] * py + m[8] * pz + m[12]) / w) * 0.5 + 0.5) * width;
      const sy = ((-(m[1] * px + m[5] * py + m[9] * pz + m[13]) / w) * 0.5 + 0.5) * height;
      const dx = sx - x;
      const dy = sy - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > radiusSq) continue;
      const rx = px - eye.x;
      const ry = py - eye.y;
      const rz = pz - eye.z;
      const range = Math.hypot(rx, ry, rz);
      const b = (eye.x * rx + eye.y * ry + eye.z * rz) / range;
      const disc = b * b - c;
      if (disc > 0) {
        const hit = -b - Math.sqrt(disc);
        if (hit > 0 && hit < range) continue;
      }
      const score = d2 + range * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  dispose(): void {
    this.compute.dispose();
    this.pointsGeometry.dispose();
    this.pointsMaterial.dispose();
    for (const batch of this.meshes) {
      batch.geometry.dispose();
      batch.base.dispose();
      batch.mesh.material.dispose();
    }
    this.object3d.removeFromParent();
  }
}
