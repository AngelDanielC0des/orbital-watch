/**
 * Client ozone data service: asks `/api/orbital/ozone` where the image is, downloads it (cached),
 * decodes it into a `RasterPayload` and reports metadata. Never throws.
 */
import type { LayerError, OzoneDescriptor, OzoneLayerConfig, RasterImage, RasterPayload, DataProvider, ProviderLoad, Result } from "@/types/layers";
import { fetchEnvelope, withFlags } from "../http";
import { GeoCache, dedupe } from "../geo-cache.service";
import { err, layerError, ok, toLayerError } from "../result";
import { isFiniteNumber, isIsoDate, isRecord, isString } from "../validate";

/** Remote hosts the ozone image may come from. */
export const OZONE_IMAGE_HOSTS = ["https://gibs.earthdata.nasa.gov/"] as const;

/** Bundled snapshot used when the live image cannot be downloaded. */
export const OZONE_SNAPSHOT_URL = "/sites/orbitalwatch/data/ozone-snapshot-omi-2026-10-29.png";
const OZONE_SNAPSHOT_DATE = "2026-10-29";
const LOCAL_PREFIX = "/sites/orbitalwatch/data/";
/** Blobs below this size are GIBS empty-day PNGs. */
const MIN_BLOB_BYTES = 5000;
/** Fraction of non-transparent pixels under which the raster counts as empty. */
const MIN_COVERAGE = 0.01;

/** True for an allow-listed GIBS URL or a same-origin bundled data path (`//host` is rejected). */
export function isAllowedImageUrl(url: string): boolean {
  if (url.includes("..")) return false;
  return OZONE_IMAGE_HOSTS.some((host) => url.startsWith(host)) || url.startsWith(LOCAL_PREFIX);
}

const PRODUCTS: readonly string[] = ["OMI_TOMS", "OMI_DOAS", "OMPS", "snapshot"];
const WIDTHS: readonly number[] = [1024, 2048, 4096];
const HEIGHTS: readonly number[] = [512, 1024, 2048];

/** Runtime guard for the `/api/orbital/ozone` data payload. */
export function isOzoneDescriptor(value: unknown): value is OzoneDescriptor {
  return (
    isRecord(value) &&
    isString(value.layer) &&
    value.layer.length > 0 &&
    isString(value.product) &&
    PRODUCTS.includes(value.product) &&
    isIsoDate(value.date) &&
    isString(value.imageUrl) &&
    isFiniteNumber(value.width) &&
    WIDTHS.includes(value.width) &&
    isFiniteNumber(value.height) &&
    HEIGHTS.includes(value.height) &&
    isString(value.attribution)
  );
}

/** Decoded raster plus how it was decoded and how much of it is drawn (null = not measured). */
export interface DecodedImage {
  image: RasterImage;
  flipped: boolean;
  coverage: number | null;
}

/** Turns an image blob into a texture-ready image. Injectable for tests. */
export type ImageDecoder = (blob: Blob) => Promise<DecodedImage>;

const isSafari = (): boolean => typeof navigator !== "undefined" && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

function measureCoverage(image: RasterImage): number | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  const w = 256;
  const h = 128;
  const context = new OffscreenCanvas(w, h).getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, w, h);
  const { data } = context.getImageData(0, 0, w, h);
  let covered = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) covered++;
  return covered / (w * h);
}

function loadHtmlImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

/** Browser decoder: flipped `ImageBitmap` where supported, `HTMLImageElement` on Safari. */
export const defaultDecoder: ImageDecoder = async (blob) => {
  if (typeof createImageBitmap === "function" && !isSafari()) {
    const image = await createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
    return { image, flipped: true, coverage: measureCoverage(image) };
  }
  const image = await loadHtmlImage(blob);
  return { image, flipped: false, coverage: measureCoverage(image) };
};

const blobCache = new GeoCache<Blob>({ ttlMs: 6 * 3_600_000, maxEntries: 4 });

/** Test helper: empties the module-level image cache. */
export function __resetOzoneCacheForTests(): void {
  blobCache.clear();
}

async function downloadBlob(url: string, fetchImpl: typeof fetch): Promise<Blob> {
  const cached = blobCache.get(url);
  if (cached) return cached;
  // Shared between concurrent callers, so it deliberately ignores any one caller's abort signal.
  return dedupe(`ozone-image:${url}`, async () => {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
    const blob = await response.blob();
    blobCache.set(url, blob);
    return blob;
  });
}

/** Dependencies of {@link createOzoneProvider} (all optional, for tests). */
export interface OzoneProviderDeps {
  decode?: ImageDecoder;
  /** Used for the image download only; the descriptor request goes through the global `fetch`. */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * Builds the ozone provider.
 *
 * Empty handling: a blob under 5 kB (GIBS empty day) returns `err(layerError("empty"))` without decoding.
 * A decoded image with under 1 % non-transparent pixels returns `ok({ empty: true, payload })` and is NOT
 * closed here: the caller discards the payload and closes the bitmap. Aborts resolve `aborted`.
 */
export function createOzoneProvider(deps: OzoneProviderDeps = {}): DataProvider<OzoneLayerConfig, RasterPayload> {
  const decode = deps.decode ?? defaultDecoder;
  const fetchImpl: typeof fetch = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const now = deps.now ?? Date.now;

  return {
    id: "ozone",
    async load(config, { signal, tier, flags }): Promise<Result<ProviderLoad<RasterPayload>, LayerError>> {
      const aborted = () => err(layerError("aborted"));
      try {
        const size = tier === "hi" ? 4096 : 2048;
        const envelope = await fetchEnvelope<OzoneDescriptor>(
          withFlags(`/api/orbital/ozone?product=${config.product}&size=${size}`, flags),
          signal,
          isOzoneDescriptor,
        );
        if (!envelope.ok) return envelope;
        if (signal.aborted) return aborted();
        const { data: descriptor, meta } = envelope.value;
        if (!isAllowedImageUrl(descriptor.imageUrl)) return err(layerError("invalid", `image host not allowed: ${descriptor.imageUrl}`));

        let blob: Blob;
        let usedSnapshotRetry = false;
        try {
          blob = await downloadBlob(descriptor.imageUrl, fetchImpl);
        } catch (cause) {
          if (signal.aborted) return aborted();
          if (descriptor.imageUrl === OZONE_SNAPSHOT_URL) return err(toLayerError(cause));
          try {
            blob = await downloadBlob(OZONE_SNAPSHOT_URL, fetchImpl);
            usedSnapshotRetry = true;
          } catch {
            return err(toLayerError(cause));
          }
        }
        if (signal.aborted) return aborted();
        if (blob.size < MIN_BLOB_BYTES) return err(layerError("empty"));

        const decoded = await decode(blob);
        if (signal.aborted) {
          if (typeof ImageBitmap !== "undefined" && decoded.image instanceof ImageBitmap) decoded.image.close();
          return aborted();
        }
        const empty = decoded.coverage !== null && decoded.coverage < MIN_COVERAGE;
        const date = usedSnapshotRetry ? OZONE_SNAPSHOT_DATE : descriptor.date;
        return ok({
          payload: { kind: "raster", image: decoded.image, flipped: decoded.flipped, date },
          dataDate: date,
          fetchedAt: now(),
          isFallback: meta.fallback || descriptor.product === "snapshot" || usedSnapshotRetry,
          source: descriptor.layer,
          empty,
        });
      } catch (cause) {
        return err(toLayerError(cause));
      }
    },
  };
}

/** Default ozone provider. */
export const ozoneProvider = createOzoneProvider();
