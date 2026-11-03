/**
 * Engine-drawn UI accents (plan v2 / N3). Mirrors the HUD tokens in orbitalwatch.css (`--signal`, `--signal-glow`)
 * so 3D highlights match the panels. Category colours of satellites/planets are semantic and stay in their renderers.
 */
export const ENGINE_THEME = {
  /** Hover ring around the picked object (satellites, overlay points). */
  hover: "#5b9dff",
  /** Followed-satellite orbit track. */
  track: "#3d8bff",
  /** Highlighted country / state outline. */
  placeOutline: "#7fb0ff",
  /** Selected overlay point ring. */
  selected: "#2f7dff",
} as const;
