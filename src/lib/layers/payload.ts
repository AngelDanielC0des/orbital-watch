/** Payload helpers shared by the engine overlays and the data hooks (no three.js, no React). */
import type { LayerDataPayload } from "@/types/layers";

/** Closes the ImageBitmap of a raster payload that will not be uploaded (stale, disposed, empty). */
export function closeImage(payload: LayerDataPayload): void {
  if (payload.kind === "raster" && typeof ImageBitmap !== "undefined" && payload.image instanceof ImageBitmap) payload.image.close();
}

/** Stable cache/identity key of a layer config (shallow, sorted keys). */
export function configKey(config: object): string {
  return Object.entries(config)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("&");
}
