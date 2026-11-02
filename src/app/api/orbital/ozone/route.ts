/** `GET /api/orbital/ozone`: resolves the newest GIBS ozone image descriptor (proxy + memo, 6 h). */
import { errorJson, okJson, parseMock, parseOzoneQuery } from "@/lib/server/envelope";
import { OZONE_SNAPSHOT, resolveOzone } from "@/lib/server/gibs";
import { memo } from "@/lib/server/memo";

export const maxDuration = 30;

const TTL_SEC = 6 * 3600;

/** Ozone descriptor route. */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const mock = parseMock(params);
  if (!mock.ok) return errorJson("invalid", mock.message, 400, { source: "ozone" });
  const query = parseOzoneQuery(params);
  if (!query.ok) return errorJson("invalid", query.message, 400, { source: "ozone" });
  if (mock.value === "error") return errorJson("upstream", "Error simulado", 500, { source: "ozone" });

  const fetchedAt = new Date().toISOString();
  if (mock.value === "snapshot") {
    const descriptor = { ...OZONE_SNAPSHOT, product: "snapshot" as const, attribution: "NASA GIBS / OMI (Aura) · instantánea" };
    return okJson(descriptor, { source: descriptor.layer, dataDate: descriptor.date, fetchedAt, fallback: true }, TTL_SEC);
  }

  const { product, size } = query.value;
  const result = await memo(
    `ozone:${product}:${size}`,
    TTL_SEC * 1000,
    async () => ({ ...(await resolveOzone({ product, size })), fetchedAt: new Date().toISOString() }),
    (v) => v.descriptor.product !== "snapshot",
  );
  const { descriptor } = result;
  // A snapshot answer is cached by the CDN only briefly so recovery is quick.
  return okJson(
    descriptor,
    { source: descriptor.layer, dataDate: descriptor.date, fetchedAt: result.fetchedAt, fallback: result.fallback },
    descriptor.product === "snapshot" ? 300 : TTL_SEC,
  );
}
