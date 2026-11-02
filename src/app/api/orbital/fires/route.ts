/** `GET /api/orbital/fires`: binned NASA FIRMS VIIRS detections per window (memo 1 h per window). */
import { isFiresDTO } from "@/lib/layers/fires/fires.service";
import { errorJson, okJson, parseFiresWindow, parseMock } from "@/lib/server/envelope";
import { fetchFires } from "@/lib/server/firms";
import { memo } from "@/lib/server/memo";
import { loadSnapshot } from "@/lib/server/snapshots";
import type { FiresDTO } from "@/types/layers";

export const maxDuration = 60;

const TTL_SEC = 3600;
const DEFAULT_SOURCE = "NASA FIRMS";

function firesMeta(dto: FiresDTO, fetchedAt: string, fallback: boolean) {
  return { source: dto.sources.join(" + ") || DEFAULT_SOURCE, dataDate: dto.acqRange?.to ?? null, fetchedAt, fallback };
}

async function serveFiresSnapshot(origin: string): Promise<Response> {
  const snapshot = await loadSnapshot("fires", origin);
  if (snapshot && isFiresDTO(snapshot.data)) {
    return okJson(snapshot.data, firesMeta(snapshot.data, new Date().toISOString(), true), 300);
  }
  return errorJson("upstream", "Fuente no disponible y sin instantánea", 503, { source: DEFAULT_SOURCE });
}

/** Fires route. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mock = parseMock(url.searchParams);
  if (!mock.ok) return errorJson("invalid", mock.message, 400, { source: DEFAULT_SOURCE });
  const parsed = parseFiresWindow(url.searchParams);
  if (!parsed.ok) return errorJson("invalid", parsed.message, 400, { source: DEFAULT_SOURCE });
  if (mock.value === "error") return errorJson("upstream", "Error simulado", 500, { source: DEFAULT_SOURCE });
  if (mock.value === "snapshot") return serveFiresSnapshot(url.origin);

  const window = parsed.value;
  const result = await memo(
    `fires:${window}`,
    TTL_SEC * 1000,
    async () => ({ fetched: await fetchFires(window), fetchedAt: new Date().toISOString() }),
    (v) => v.fetched.ok,
  );
  if (!result.fetched.ok) return serveFiresSnapshot(url.origin);
  return okJson(result.fetched.value, firesMeta(result.fetched.value, result.fetchedAt, false), TTL_SEC);
}
