/**
 * GLSL for the environmental overlays (ADR-15). No tone mapping: overlay colours must match the
 * legends; `colorspace_fragment` converts the linear result to the sRGB output.
 */

/** Shared sphere vertex: UV + world normal for the day/night fade. */
export const OVERLAY_SPHERE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normalize(position));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Shared night fade: keeps the overlay readable at night without hiding city lights. */
const NIGHT_FADE = /* glsl */ `
  float nightFactor(vec3 n) {
    float lit = smoothstep(-0.15, 0.2, dot(normalize(n), uSunDir));
    return mix(1.0 - uNightFade, 1.0, lit);
  }
`;

/** Raster overlay (ozone): pre-coloured RGBA equirectangular image. */
export const RASTER_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uNightFade;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  ${NIGHT_FADE}
  void main() {
    vec4 c = texture2D(uMap, vUv);
    float a = c.a * uOpacity * nightFactor(vNormalW);
    if (a < 0.004) discard;
    gl_FragColor = vec4(c.rgb, a);
    #include <colorspace_fragment>
  }
`;

/**
 * Fire density grid: R = log count, G = log max FRP (0–1). Row 0 of the data is 90°N, so the
 * V coordinate is flipped. Alpha from count: 1 → ~0.25, 10 → ~0.6, 100+ → 1.
 */
export const HEATMAP_FRAGMENT = /* glsl */ `
  uniform sampler2D uGrid;
  uniform sampler2D uLut;
  uniform float uOpacity;
  uniform float uNightFade;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  ${NIGHT_FADE}
  void main() {
    vec2 g = texture2D(uGrid, vec2(vUv.x, 1.0 - vUv.y)).rg;
    float d = g.r;
    if (d < 0.02) discard;
    vec3 col = texture2D(uLut, vec2(clamp(d * 0.75 + g.g * 0.35, 0.0, 1.0), 0.5)).rgb;
    float a = clamp(0.25 + (d - 0.15) * 0.88, 0.2, 1.0) * uOpacity * mix(0.85, 1.0, nightFactor(vNormalW));
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

/**
 * Pollution sample points: soft disc + darker rim, colour from the LUT. `aValue < 0` = no data.
 * `aKind` 1 = city (filled), 0 = grid node (smaller, hollow). Hovered/selected points grow (ADR-16, gl_VertexID = WebGL2).
 */
export const POINTS_VERTEX = /* glsl */ `
  attribute float aValue;
  attribute float aKind;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uHovered;
  uniform float uSelected;
  varying float vValue;
  varying float vKind;
  varying float vEmph;
  void main() {
    vValue = aValue;
    vKind = aKind;
    float id = float(gl_VertexID);
    float hovered = 1.0 - step(0.5, abs(id - uHovered));
    float selected = 1.0 - step(0.5, abs(id - uSelected));
    vEmph = max(hovered, selected);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float px = clamp(uSize / max(-mv.z, 0.001), 4.0, 18.0) * mix(0.72, 1.0, aKind);
    px *= 1.0 + 0.75 * hovered + 1.0 * selected;
    gl_PointSize = aValue < 0.0 ? 0.0 : px * uPixelRatio;
  }
`;

export const POINTS_FRAGMENT = /* glsl */ `
  uniform sampler2D uLut;
  uniform float uOpacity;
  varying float vValue;
  varying float vKind;
  varying float vEmph;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = dot(p, p);
    if (r > 1.0) discard;
    vec3 col = texture2D(uLut, vec2(clamp(vValue, 0.0, 1.0), 0.5)).rgb;
    // Grid nodes: hollow ring so cities read as the primary samples.
    float hole = (1.0 - vKind) * (1.0 - smoothstep(0.30, 0.42, r));
    if (hole > 0.5 && vEmph < 0.5) discard;
    col = mix(col, col * 0.35, smoothstep(0.55, 0.75, r) * (1.0 - vEmph));
    // Emphasis: bright rim.
    col = mix(col, vec3(0.92, 0.96, 1.0), vEmph * smoothstep(0.62, 0.8, r));
    float a = (1.0 - smoothstep(0.82, 1.0, r)) * uOpacity;
    gl_FragColor = vec4(col, max(a, vEmph * 0.95 * (1.0 - smoothstep(0.9, 1.0, r))));
    #include <colorspace_fragment>
  }
`;

/** Fire hotspots: orange core, yellow above the strong-FRP threshold, optional pulse. */
export const HOTSPOT_VERTEX = /* glsl */ `
  attribute float aFrp;
  attribute float aPhase;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uPulse;
  uniform float uStrongMw;
  uniform float uHovered;
  uniform float uSelected;
  varying float vStrong;
  varying float vEmph;
  void main() {
    vStrong = step(uStrongMw, aFrp);
    float id = float(gl_VertexID);
    float hovered = 1.0 - step(0.5, abs(id - uHovered));
    float selected = 1.0 - step(0.5, abs(id - uSelected));
    vEmph = max(hovered, selected);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Size grows with fire radiative power (log): 1 MW small, 1000 MW+ large.
    float k = clamp(log(1.0 + aFrp) / log(1001.0), 0.0, 1.0);
    float base = mix(0.55, 1.5, k) * clamp(uSize / max(-mv.z, 0.001), 2.5, 10.0);
    float pulse = 1.0 + uPulse * 0.18 * sin(uTime * 4.18879 + aPhase);
    gl_PointSize = base * pulse * (1.0 + 0.8 * hovered + 1.1 * selected) * uPixelRatio;
  }
`;

export const HOTSPOT_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vStrong;
  varying float vEmph;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = dot(p, p);
    if (r > 1.0) discard;
    vec3 col = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.88, 0.3), vStrong);
    col = mix(vec3(1.0, 0.97, 0.85), col, smoothstep(0.0, 0.35, r));
    col = mix(col, vec3(0.92, 0.96, 1.0), vEmph * smoothstep(0.6, 0.85, r));
    float a = (1.0 - smoothstep(0.6, 1.0, r)) * uOpacity;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;
