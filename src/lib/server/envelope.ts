/** JSON envelope helpers shared by the `/api/orbital/*` Route Handlers (ADR-15). */
import type { ApiEnvelope, ApiMeta, FireWindow, LayerErrorCode, OzoneProduct } from "@/types/layers";

/** Allowed `product` values of the ozone route. */
export const OZONE_PRODUCTS: readonly OzoneProduct[] = ["OMI_TOMS", "OMI_DOAS", "OMPS"];
/** Allowed `size` values of the ozone route. */
export const OZONE_SIZES: readonly (2048 | 4096)[] = [2048, 4096];
/** Allowed `window` values of the fires route. */
export const FIRE_WINDOWS: readonly FireWindow[] = ["24h", "48h", "7d"];

/** Dev flag: force an error or the snapshot branch. */
export type MockFlag = "error" | "snapshot" | null;

/** Outcome of parsing: validated values or a Spanish message for the 400. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

/** Parses `mock` (absent → null; anything but `error`/`snapshot` is invalid). */
export function parseMock(params: URLSearchParams): Parsed<MockFlag> {
  const raw = params.get("mock");
  if (raw === null) return { ok: true, value: null };
  if (raw === "error" || raw === "snapshot") return { ok: true, value: raw };
  return { ok: false, message: "Parámetro mock no válido (error | snapshot)." };
}

/** Validated ozone query. */
export interface OzoneQuery {
  product: OzoneProduct;
  size: 2048 | 4096;
}

/** Parses `product` / `size` against their allow-lists (defaults OMI_TOMS / 2048). */
export function parseOzoneQuery(params: URLSearchParams): Parsed<OzoneQuery> {
  const product = params.get("product") ?? "OMI_TOMS";
  const size = params.get("size") ?? "2048";
  const matchedProduct = OZONE_PRODUCTS.find((p) => p === product);
  if (!matchedProduct) return { ok: false, message: "Producto de ozono no válido (OMI_TOMS | OMI_DOAS | OMPS)." };
  const matchedSize = OZONE_SIZES.find((s) => String(s) === size);
  if (!matchedSize) return { ok: false, message: "Tamaño no válido (2048 | 4096)." };
  return { ok: true, value: { product: matchedProduct, size: matchedSize } };
}

/** Parses `window` against its allow-list (default 24h). */
export function parseFiresWindow(params: URLSearchParams): Parsed<FireWindow> {
  const raw = params.get("window") ?? "24h";
  const matched = FIRE_WINDOWS.find((w) => w === raw);
  if (!matched) return { ok: false, message: "Ventana no válida (24h | 48h | 7d)." };
  return { ok: true, value: matched };
}

/** Success response: JSON envelope with CDN caching (`s-maxage` + 2× stale-while-revalidate). */
export function okJson<T>(data: T, meta: ApiMeta, ttlSec: number): Response {
  const body: ApiEnvelope<T> = { ok: true, data, meta };
  const headers: Record<string, string> = {
    "Cache-Control": `public, s-maxage=${ttlSec}, stale-while-revalidate=${ttlSec * 2}`,
  };
  if (meta.fallback) headers["X-Orbital-Fallback"] = "snapshot";
  return Response.json(body, { status: 200, headers });
}

/** Failure response: JSON envelope, never cached. */
export function errorJson(code: LayerErrorCode, message: string, status: number, meta: Partial<ApiMeta> & { source: string }): Response {
  const body: ApiEnvelope<never> = {
    ok: false,
    error: { code, message },
    meta: { dataDate: null, fetchedAt: new Date().toISOString(), fallback: false, ...meta },
  };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
