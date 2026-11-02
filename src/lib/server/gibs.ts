/**
 * NASA GIBS helpers (server side): resolve the newest available ozone day and build WMS URLs.
 * Pure functions plus an injectable `fetchImpl`; nothing here throws out of `resolveOzone`.
 */
import type { OzoneDescriptor, OzoneProduct } from "@/types/layers";
import { isIsoDate } from "@/lib/layers/validate";

export const GIBS_BASE = "https://gibs.earthdata.nasa.gov";

/** GIBS layer identifier per ozone product. */
export const OZONE_LAYERS: Readonly<Record<OzoneProduct, string>> = {
  OMI_TOMS: "OMI_Ozone_TOMS_Total_Column",
  OMI_DOAS: "OMI_Ozone_DOAS_Total_Column",
  OMPS: "OMPS_Ozone_Total_Column",
};

/** Fallback order of the ozone products. */
export const OZONE_CHAIN: readonly OzoneProduct[] = ["OMI_TOMS", "OMI_DOAS", "OMPS"];

/** Bundled last-resort image (served from `public/`). */
export const OZONE_SNAPSHOT = {
  date: "2026-10-29",
  imageUrl: "/sites/orbitalwatch/data/ozone-snapshot-omi-2026-10-29.png",
  width: 2048,
  height: 1024,
  layer: "OMI_Ozone_TOMS_Total_Column",
} as const;

/** Images at or below this size are GIBS "empty day" tiles (~600 B PNG, HTTP 200). */
const MIN_IMAGE_BYTES = 5000;
const MAX_BACK_DAYS = 3;

/** The requested product first, then the others in chain order. */
export function chainFrom(product: OzoneProduct): OzoneProduct[] {
  return [product, ...OZONE_CHAIN.filter((p) => p !== product)];
}

/** WMTS DescribeDomains URL listing the available time ranges of a layer. */
export function describeDomainsUrl(layer: string, tms = "2km"): string {
  return `${GIBS_BASE}/wmts/epsg4326/best/1.0.0/${layer}/default/${tms}/all/all.xml`;
}

/** Newest end date (`YYYY-MM-DD`) in a DescribeDomains time domain, or null when none is found. */
export function parseNewestDate(xml: string): string | null {
  const domain = /<Domain>([^<]*)<\/Domain>/.exec(xml)?.[1] ?? "";
  let newest: string | null = null;
  for (const range of domain.split(",")) {
    const parts = range.trim().split("/");
    const end = parts.length >= 2 ? parts[1] : parts[0];
    if (isIsoDate(end) && (newest === null || end > newest)) newest = end;
  }
  return newest;
}

/** WMS 1.3.0 GetMap for the whole globe (EPSG:4326 axis order: latitude first in BBOX). */
export function wmsUrl(layer: string, date: string, width: number, height: number): string {
  return `${GIBS_BASE}/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer}&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=${width}&HEIGHT=${height}&FORMAT=image/png&TRANSPARENT=true&TIME=${date}`;
}

type NextInit = RequestInit & { next?: { revalidate?: number } };

/** Newest date the layer has data for, or null when the capabilities are unavailable. */
export async function resolveNewestDate(layer: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const init: NextInit = { next: { revalidate: 21600 } };
  const response = await fetchImpl(describeDomainsUrl(layer), init);
  if (!response.ok) return null;
  return parseNewestDate(await response.text());
}

/** Byte size of an image: `content-length` from HEAD when present, otherwise a GET. */
export async function imageByteSize(url: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const head = await fetchImpl(url, { method: "HEAD" });
  if (head.ok) {
    const length = Number(head.headers.get("content-length"));
    if (Number.isFinite(length) && length > 0) return length;
  }
  const response = await fetchImpl(url);
  if (!response.ok) return 0;
  return (await response.arrayBuffer()).byteLength;
}

function previousDay(date: string, back: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) - back * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function attributionFor(product: OzoneProduct): string {
  return product === "OMPS" ? "NASA GIBS / OMPS (Suomi NPP)" : "NASA GIBS / OMI (Aura)";
}

async function tryProduct(product: OzoneProduct, size: number, fetchImpl: typeof fetch): Promise<OzoneDescriptor | null> {
  const layer = OZONE_LAYERS[product];
  const newest = await resolveNewestDate(layer, fetchImpl);
  if (newest === null) return null;
  for (let back = 0; back <= MAX_BACK_DAYS; back++) {
    const date = previousDay(newest, back);
    const imageUrl = wmsUrl(layer, date, size, size / 2);
    if ((await imageByteSize(imageUrl, fetchImpl)) > MIN_IMAGE_BYTES) {
      return { layer, product, date, imageUrl, width: size, height: size / 2, attribution: attributionFor(product) };
    }
  }
  return null;
}

/** Resolves the best ozone image descriptor along the product chain; falls back to the snapshot. Never throws. */
export async function resolveOzone(opts: {
  product: OzoneProduct;
  size: 2048 | 4096;
  fetchImpl?: typeof fetch;
}): Promise<{ descriptor: OzoneDescriptor; fallback: boolean }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  for (const product of chainFrom(opts.product)) {
    try {
      const descriptor = await tryProduct(product, opts.size, fetchImpl);
      if (descriptor) return { descriptor, fallback: product !== opts.product };
    } catch {
      // try the next product in the chain
    }
  }
  return {
    descriptor: { ...OZONE_SNAPSHOT, product: "snapshot", attribution: "NASA GIBS / OMI (Aura) · instantánea" },
    fallback: true,
  };
}
